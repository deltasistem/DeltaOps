/**
 * DGP-020.3 · Fundación de Mano de Obra — Capa de aplicación + descriptor del
 * Shared Platform Service (`modulo.manodeobra`).
 *
 * COMPOSICIÓN PURA sobre contratos públicos congelados (patrón DGP-014/016). El
 * módulo NO modifica Órdenes/Utilización/Identity/Inventario/Abastecimiento ni la
 * RLS de plataforma. La FUENTE ÚNICA de tiempo es DGP-020.2 (sesiones): el módulo
 * consume la query pública de duraciones (`efectivoMs` = autoridad) vía el
 * `OrdenesSesionPort`, NUNCA recalcula tramos ni lee tablas `ord_*`/`idn_*`.
 *
 * Integración sesión→valoración: por ORQUESTACIÓN en el api-server (Opción B —
 * ver docs/decisiones.md, GAP de suscripción cross-módulo por outbox). El
 * comando `valoracion.procesar-sesion` es idempotente por (tenant, sesionId).
 *
 * Idempotencia (§25): TODA mutación reclama el `opId` durable ANTES de efectos.
 */
import { z } from "zod";
import {
  createDomainEvent,
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { audit, tenantOf, type PlatformServiceDefinition, type ServiceDeps } from "@workspace/platform";
import { MODULO } from "./module-name";
import {
  CATALOGOS,
  type EntradaCatalogo,
  type NombreCatalogo,
} from "./domain/catalogos";
import {
  CATEGORIA_CONFIGURADA,
  CATEGORIA_HABILITADA,
  EVENTOS_MODULO,
  RECURSO_DEFINIDO,
  RECURSO_ESTADO_CAMBIADO,
  TARIFA_ACTUALIZADA,
  TARIFA_CERRADA,
  TARIFA_CREADA,
  VALORACION_REGISTRADA,
  VALORACION_REVALORADA,
} from "./domain/events";
import { cambiarEstadoRecurso, definirRecurso, type EstadoRecurso } from "./domain/recurso";
import { cerrarTarifa, crearTarifa, type SujetoTarifa, type Tarifa } from "./domain/tarifa";
import { costoEstimado, esRevalorable, valorarSesion, type Valoracion } from "./domain/valoracion";
import { aMicros, microsACadena, RE_DINERO, UNIDADES_TARIFA } from "./domain/dinero";
import type { CatalogoService } from "./infrastructure/catalogo-service";
import type {
  DuracionSesion,
  IdentidadPort,
  OrdenesSesionPort,
  RecursoRepository,
  ReciboPort,
  TarifaRepository,
  ValoracionRepository,
} from "./domain/ports";

/* ------------------------------- Permisos -------------------------------- */

const P_READ = `${MODULO}.read`;
const P_CONFIG = `${MODULO}.config`; // catálogo + recursos (administrativo)
const P_TARIFAS = `${MODULO}.tarifas`; // gestión de tarifas (administrativo)
const P_VALORAR = `${MODULO}.valorar`; // procesar/revalorar (administrativo/servicio)
const P_MIAS = `${MODULO}.mias`; // técnico: SOLO sus valoraciones

/** Tablas del módulo protegidas por RLS (documentación/auditoría). */
export const TABLAS_RLS_MODULO: readonly string[] = [
  "mdo_recursos",
  "mdo_tarifas",
  "mdo_valoraciones",
  "mdo_recibos",
  "mdo_eventos",
];

/* ------------------------------- Adaptadores ----------------------------- */

/** Puerto mínimo de bitácora durable de eventos (append idempotente). */
export interface EventLogPort {
  append(
    uow: UnitOfWork,
    e: { tenantId: string; eventId: string; tipo: string; payload: Record<string, unknown>; occurredAt: Date },
  ): Promise<Result<void, KernelError>>;
}

export interface ModuleAdapters {
  readonly recursos: RecursoRepository;
  readonly tarifas: TarifaRepository;
  readonly valoraciones: ValoracionRepository;
  readonly recibos: ReciboPort;
  readonly identidad: IdentidadPort;
  readonly ordenes: OrdenesSesionPort;
  readonly catalogos: CatalogoService;
  readonly eventLog: EventLogPort;
}

/* ------------------------------- Utilidades ------------------------------ */

async function cfg(deps: ServiceDeps, tenant: string, clave: string, def: string): Promise<string> {
  const v = await deps.tenantConfig.get(tenant, `${MODULO}.${clave}`);
  return v.ok && v.value !== "" ? v.value : def;
}

async function emitir(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenantId: string,
  tipo: string,
  payload: Record<string, unknown>,
): Promise<Result<void, KernelError>> {
  const ev = createDomainEvent(tipo, payload, ctx.correlationId);
  const logged = await adapters.eventLog.append(uow, {
    tenantId,
    eventId: ev.id,
    tipo: ev.type,
    payload: ev.payload,
    occurredAt: ev.occurredAt,
  });
  if (!logged.ok) return logged;
  uow.registerEvent(ev);
  return ok(undefined);
}

/** Claim durable del opId ANTES de efectos (patrón DGP-020.2). */
async function reclamar(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenant: string,
  comando: string,
  opId: string | undefined,
): Promise<{ proceder: true } | { proceder: false; corto: Result<Record<string, unknown>, KernelError> }> {
  if (!opId) return { proceder: true };
  const claim = await adapters.recibos.reclamar(uow, tenant, comando, opId, ctx.principal.id);
  if (!claim.ok) return { proceder: false, corto: claim };
  if (claim.value.duenio) return { proceder: true };
  if (claim.value.resultado !== undefined) {
    return { proceder: false, corto: ok({ ...claim.value.resultado, idempotente: true }) };
  }
  return { proceder: false, corto: fail(KernelErrors.conflict(`Operación ${opId} en curso`)) };
}

async function sellarSi(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenant: string,
  comando: string,
  opId: string | undefined,
  resultado: Record<string, unknown>,
): Promise<Result<Record<string, unknown>, KernelError>> {
  if (opId) {
    const rec = await adapters.recibos.sellar(uow, tenant, { opId, comando, resultado }, ctx.principal.id);
    if (!rec.ok) return rec;
  }
  return ok({ ...resultado, idempotente: false });
}

/** Identidad canónica del contexto (nunca lanza) para el modo 'mías'. */
function identidadDeSesionSuave(ctx: ExecutionContext): string | null {
  const id = ctx.metadata["identityId"];
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * DGP-020.3 · Autoridad de ALCANCE de lectura (fail-closed, patrón DGP-020.2).
 *
 * El BACKEND es la autoridad, NO la presentación. Un principal con `P_MIAS`
 * (técnico) SÓLO puede ver SUS PROPIAS valoraciones — incluso al consultar por
 * OT/activo/sesión (acceso indirecto). SUPERVISOR/PLANIFICADOR/CONSULTA/ADMIN
 * NO portan `P_MIAS`: conservan lectura completa del tenant.
 *
 * `soloMias(ctx)` es verdadero cuando el principal tiene `P_MIAS`. En ese modo,
 * la identidad canónica de sesión (`metadata.identityId`) es OBLIGATORIA: si
 * falta, se rechaza (fail-closed), nunca se degrada a lectura amplia.
 */
function soloMias(ctx: ExecutionContext): boolean {
  const perms = (ctx.principal.permisos ?? []) as string[];
  const caps = (ctx.principal.capacidades ?? []) as string[];
  if (!perms.includes(P_MIAS)) return false;
  // Un principal ADMIN/SERVICIO puede portar TODOS los permisos (incluido P_MIAS)
  // y NO debe restringirse: se reconoce por capacidad comodín o por poseer
  // permisos administrativos (config/tarifas/valorar). El TÉCNICO porta P_MIAS +
  // P_READ pero NINGUNO de los administrativos ⇒ lectura restringida a lo suyo.
  if (caps.includes("*")) return false;
  if (perms.includes("*") || perms.includes(P_CONFIG) || perms.includes(P_TARIFAS) || perms.includes(P_VALORAR)) return false;
  return true;
}

/**
 * Resuelve el alcance de lectura. Devuelve:
 *  - `{ restringido: false }` para lectores amplios (tenant completo).
 *  - `{ restringido: true, identityId }` para técnicos (SÓLO su identidad).
 *  - un `Result` de error (forbidden) si es modo 'mías' pero falta la identidad
 *    canónica (fail-closed).
 */
function alcanceLectura(
  ctx: ExecutionContext,
): { restringido: false } | { restringido: true; identityId: string } | { error: Result<never, KernelError> } {
  if (!soloMias(ctx)) return { restringido: false };
  const yo = identidadDeSesionSuave(ctx);
  if (!yo) {
    return {
      error: fail(
        KernelErrors.forbidden("mano de obra: falta la identidad canónica autenticada (identityId) para lectura restringida"),
      ) as Result<never, KernelError>,
    };
  }
  return { restringido: true, identityId: yo };
}

/* -------------------------- Serialización de VOs ------------------------- */

function tarifaAResultado(t: Tarifa): Record<string, unknown> {
  return {
    id: t.id,
    sujetoTipo: t.sujetoTipo,
    sujetoId: t.sujetoId,
    valor: t.valor,
    moneda: t.moneda,
    unidad: t.unidad,
    vigenciaDesde: t.vigenciaDesde.toISOString(),
    vigenciaHasta: t.vigenciaHasta ? t.vigenciaHasta.toISOString() : null,
    estado: t.estado,
    valorAnterior: t.valorAnterior,
    motivo: t.motivo,
    creadoAt: t.creadoAt.toISOString(),
    creadoPor: t.creadoPor,
    actualizadoAt: t.actualizadoAt.toISOString(),
    actualizadoPor: t.actualizadoPor,
  };
}

function valoracionAResultado(
  v: Valoracion,
  tenantId: string,
): Record<string, unknown> {
  return {
    // DGP-023.5 (N-2): el payload de valoración DEBE portar `tenantId` para que
    // el outbox y sus handlers sean autosuficientes bajo RLS efectiva. El tenant
    // proviene EXCLUSIVAMENTE del contexto server-side (nunca del body/cliente).
    tenantId,
    sesionId: v.sesionId,
    ordenId: v.ordenId,
    activoId: v.activoId,
    identityId: v.identityId,
    categoriaClave: v.categoriaClave,
    tarifaId: v.tarifaId,
    tarifaValor: v.tarifaValor,
    moneda: v.moneda,
    unidad: v.unidad,
    efectivoMs: v.efectivoMs,
    costo: v.costo,
    estado: v.estado,
    vigenciaDesde: v.vigenciaDesde ? v.vigenciaDesde.toISOString() : null,
    vigenciaHasta: v.vigenciaHasta ? v.vigenciaHasta.toISOString() : null,
    cruzaPeriodos: v.cruzaPeriodos,
    iniciadoAt: v.iniciadoAt.toISOString(),
    cerradoAt: v.cerradoAt ? v.cerradoAt.toISOString() : null,
    valoradoAt: v.valoradoAt.toISOString(),
    valoradoPor: v.valoradoPor,
  };
}

/* ----------------------- Núcleo de valoración ---------------------------- */

async function cargarTarifasDeRecurso(
  adapters: ModuleAdapters,
  tenant: string,
  categoriaClave: string,
): Promise<Result<readonly Tarifa[], KernelError>> {
  const t = await adapters.tarifas.listarPorSujeto(tenant, "CATEGORIA", categoriaClave);
  if (!t.ok) return t;
  return ok(t.value);
}

/**
 * Valora una sesión CERRADA de forma idempotente (por tenant+sesionId). Lee la
 * duración pública de Órdenes (autoridad del tiempo), verifica CERRADA, resuelve
 * recurso + tarifa vigente en iniciadoAt y persiste el snapshot. Reprocesar la
 * misma sesión NO duplica: si ya existe, es no-op ok.
 */
async function procesarSesionInterno(
  adapters: ModuleAdapters,
  deps: ServiceDeps,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenant: string,
  sesionId: string,
  ahora: Date,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const previa = await adapters.valoraciones.buscar(tenant, sesionId);
  if (!previa.ok) return previa;
  if (previa.value) return ok({ ...valoracionAResultado(previa.value, tenant), yaExistia: true });

  const dur = await adapters.ordenes.duracionesDeSesion(tenant, sesionId);
  if (!dur.ok) return dur;
  const s = dur.value;
  if (!s) return fail(KernelErrors.notFound("sesion", sesionId));
  if (s.estado !== "CERRADA" || s.abierta) {
    return fail(KernelErrors.conflict(`La sesión ${sesionId} no está CERRADA; no se valora en definitivo`));
  }

  const recurso = await adapters.recursos.buscar(tenant, s.identityId);
  if (!recurso.ok) return recurso;
  let tarifas: readonly Tarifa[] = [];
  if (recurso.value) {
    const t = await cargarTarifasDeRecurso(adapters, tenant, recurso.value.categoriaClave);
    if (!t.ok) return t;
    tarifas = t.value;
  }

  const valorada = valorarSesion({
    sesion: {
      tenantId: tenant,
      sesionId: s.sesionId,
      ordenId: s.ordenId,
      activoId: s.activoId,
      identityId: s.identityId,
      efectivoMs: s.efectivoMs,
      iniciadoAt: s.iniciadoAt,
      cerradoAt: s.cerradoAt,
    },
    recurso: recurso.value,
    tarifas,
    actorId: ctx.principal.id,
    ahora,
  });
  if (!valorada.ok) return valorada;

  const reg = await adapters.valoraciones.registrar(uow, valorada.value);
  if (!reg.ok) return reg;
  if (!reg.value.insertada) {
    const actual = await adapters.valoraciones.buscar(tenant, sesionId);
    if (actual.ok && actual.value) return ok({ ...valoracionAResultado(actual.value, tenant), yaExistia: true });
    return ok({ ...valoracionAResultado(valorada.value, tenant), yaExistia: true });
  }

  const emitido = await emitir(adapters, ctx, uow, tenant, VALORACION_REGISTRADA, valoracionAResultado(valorada.value, tenant));
  if (!emitido.ok) return emitido;
  const aud = await audit(deps.audit, uow, ctx, tenant, MODULO, "valoracion:registrar", sesionId, {
    estado: valorada.value.estado,
    costo: valorada.value.costo,
    tarifaId: valorada.value.tarifaId,
  });
  if (!aud.ok) return aud;
  return ok({ ...valoracionAResultado(valorada.value, tenant), yaExistia: false });
}

/**
 * Resumen de mano de obra por OT: agrega tiempo/costo de las valoraciones y
 * lista PENDIENTES (sesiones CERRADAS sin valoración) por composición de queries
 * públicas de Órdenes.
 */
async function resumenPorOrden(
  adapters: ModuleAdapters,
  tenant: string,
  ordenId: string,
  yo: string | null,
  restringirA: string | null = null,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const vals = await adapters.valoraciones.listarPorOrden(tenant, ordenId);
  if (!vals.ok) return vals;
  const dur = await adapters.ordenes.duracionesPorOrden(tenant, ordenId);
  if (!dur.ok) return dur;

  // DGP-020.3 · técnico (P_MIAS): el resumen de la OT muestra SÓLO SUS filas
  // (decisión documentada: un técnico asignado ve la sección de mano de obra de
  // esa OT, pero acotada a su propia identidad; nunca las de otros).
  const valoradas = restringirA ? vals.value.filter((v) => v.identityId === restringirA) : vals.value;
  const porSesion = new Map(valoradas.map((v) => [v.sesionId, v] as const));
  const cerradasRaw = dur.value.filter((s) => s.estado === "CERRADA" && !s.abierta);
  const cerradas = restringirA ? cerradasRaw.filter((s) => s.identityId === restringirA) : cerradasRaw;
  const pendientes: DuracionSesion[] = cerradas.filter((s) => !porSesion.has(s.sesionId));

  const ids = [...new Set(valoradas.map((v) => v.identityId).concat(pendientes.map((p) => p.identityId)))];
  const nombres = await adapters.identidad.resolverVarios(tenant, ids);
  if (!nombres.ok) return nombres;

  // Agregación de costo en PUNTO FIJO exacto (BigInt micros) por moneda; jamás
  // se suma como float. El total se serializa como cadena decimal canónica.
  let efectivoMsTotal = 0;
  const porMoneda = new Map<string, bigint>();
  for (const v of valoradas) {
    efectivoMsTotal += v.efectivoMs;
    if (v.costo !== null && v.moneda) {
      const m = aMicros(v.costo);
      if (!m.ok) return m;
      porMoneda.set(v.moneda, (porMoneda.get(v.moneda) ?? 0n) + m.value);
    }
  }
  for (const p of pendientes) efectivoMsTotal += p.efectivoMs;

  return ok({
    ordenId,
    efectivoMsTotal,
    costoPorMoneda: [...porMoneda.entries()].map(([moneda, micros]) => ({ moneda, costo: microsACadena(micros) })),
    valoraciones: valoradas.map((v) => ({
      ...valoracionAResultado(v, tenant),
      nombre: nombres.value[v.identityId] ?? null,
      esPropia: yo !== null && v.identityId === yo,
    })),
    pendientes: pendientes.map((p) => ({
      sesionId: p.sesionId,
      ordenId: p.ordenId,
      activoId: p.activoId,
      identityId: p.identityId,
      nombre: nombres.value[p.identityId] ?? null,
      efectivoMs: p.efectivoMs,
      estado: "PENDIENTE",
    })),
  });
}

/**
 * DGP-020.3 fix · Listado de mano de obra POR ACTIVO para la hoja de vida.
 *
 * Compone las VALORACIONES persistidas del activo con las SESIONES CERRADAS del
 * activo que AÚN NO tienen valoración (estado PENDIENTE). Así la pestaña muestra
 * las horas efectivas del activo aunque la valoración monetaria no exista o no
 * haya materializado todavía (horas sin costo ≠ sin datos). El estado honesto
 * «sin datos» sólo aparece cuando NO hay ni valoraciones ni sesiones cerradas.
 * Respeta el alcance de lectura (técnico P_MIAS ⇒ sólo sus filas).
 */
async function listadoPorActivo(
  adapters: ModuleAdapters,
  tenant: string,
  activoId: string,
  alcance: { restringido: false } | { restringido: true; identityId: string },
  yo: string | null,
): Promise<Result<Record<string, unknown>, KernelError>> {
  const vals = await adapters.valoraciones.listarPorActivo(tenant, activoId);
  if (!vals.ok) return vals;
  const dur = await adapters.ordenes.duracionesPorActivo(tenant, activoId);
  if (!dur.ok) return dur;

  const restringirA = alcance.restringido ? alcance.identityId : null;
  const valoradas = restringirA ? vals.value.filter((v) => v.identityId === restringirA) : vals.value;
  const porSesion = new Map(valoradas.map((v) => [v.sesionId, v] as const));
  // Sesiones del activo AÚN sin snapshot de valoración. Se surtieron dos hechos
  // reales (autoridad de tiempo = Órdenes, DGP-020.2), NUNCA se recalcula tramo:
  //  - CERRADA (no abierta): trabajo terminado, valoración pendiente ⇒ PENDIENTE.
  //  - ABIERTA/PAUSADA (abierta=true): trabajo EN CURSO ⇒ EN_CURSO con horas
  //    acumuladas hasta ahora. Sin esto, un activo con una sesión abierta leía
  //    «Sin mano de obra» (mentira: SÍ hay trabajo). Causa raíz verificada en el
  //    entorno vivo: OT-000022/CAM-001 dejó su sesión ABIERTA, nunca cerrada.
  const sinValorarRaw = dur.value.filter((s) => !porSesion.has(s.sesionId));
  const sinValorar = restringirA ? sinValorarRaw.filter((s) => s.identityId === restringirA) : sinValorarRaw;

  const ids = [...new Set(valoradas.map((v) => v.identityId).concat(sinValorar.map((p) => p.identityId)))];
  const nombres = await adapters.identidad.resolverVarios(tenant, ids);
  if (!nombres.ok) return nombres;

  const filasValoradas = valoradas.map((v) => ({
    ...valoracionAResultado(v, tenant),
    nombre: nombres.value[v.identityId] ?? null,
    esPropia: yo !== null && v.identityId === yo,
  }));
  // Filas sin valoración monetaria: horas reales y costo NULL (nunca 0, §15). El
  // shape es compatible con la fila de valoración que consume la UI.
  const filasSinValorar = sinValorar.map((p) => ({
    sesionId: p.sesionId,
    ordenId: p.ordenId,
    activoId: p.activoId,
    identityId: p.identityId,
    nombre: nombres.value[p.identityId] ?? null,
    categoriaClave: null,
    tarifaId: null,
    tarifaValor: null,
    moneda: null,
    unidad: null,
    efectivoMs: p.efectivoMs,
    costo: null,
    estado: p.abierta ? ("EN_CURSO" as const) : ("PENDIENTE" as const),
    vigenciaDesde: null,
    vigenciaHasta: null,
    cruzaPeriodos: false,
    iniciadoAt: p.iniciadoAt.toISOString(),
    cerradoAt: p.cerradoAt ? p.cerradoAt.toISOString() : null,
    esPropia: yo !== null && p.identityId === yo,
  }));

  return ok({ valoraciones: [...filasValoradas, ...filasSinValorar] });
}

/* ------------------------------ El servicio ------------------------------ */

/**
 * DGP-020.3 · Schema de DINERO de entrada (PUNTO FIJO, frontera ESTRICTA — R2).
 * El dinero SÓLO se acepta como CADENA decimal canónica `\d{1,12}(\.\d{1,6})?`
 * (sin signo, sin espacios, sin notación científica, ≤6 decimales, parte entera
 * acotada a numeric(18,6)). Un número JSON se RECHAZA con validación clara: ya
 * pudo perder precisión antes de llegar. El pattern coincide con `RE_DINERO` del
 * dominio y con el `pattern` del contrato OpenAPI. La normalización a micros
 * exactos ocurre en el dominio (`aMicros`).
 */
const dineroSchema = z.string({
  invalid_type_error: "el importe monetario debe ser una CADENA decimal, no un número",
  required_error: "el importe monetario es obligatorio",
}).regex(
  RE_DINERO,
  "importe decimal inválido: use una cadena \\d{1,12}(\\.\\d{1,6})? (sin signo ni notación científica, ≤6 decimales)",
);

export function manodeobraModule(adapters: ModuleAdapters): PlatformServiceDefinition {
  const catalogoEnum = z.enum([...CATALOGOS] as [string, ...string[]]);

  return {
    name: MODULO,
    version: "1.0.0",
    description:
      "Fundación auditable de Mano de Obra (identidad + sesión + tiempo + categoría + tarifa + snapshot).",
    capabilities: [
      { name: "consultar-manodeobra", permissions: [P_READ], description: "Consulta de mano de obra tenant-scoped." },
      { name: "consultar-mis-manodeobra", permissions: [P_MIAS, P_READ], description: "Consulta de la propia mano de obra (técnico)." },
      { name: "configurar-manodeobra", permissions: [P_CONFIG, P_READ], description: "Categorías y recursos humanos." },
      { name: "gestionar-tarifas-manodeobra", permissions: [P_TARIFAS, P_READ], description: "Tarifas versionables y vigencias." },
      { name: "valorar-manodeobra", permissions: [P_VALORAR], description: "Procesar/revalorar valoraciones." },
    ],
    permissions: [P_READ, P_CONFIG, P_TARIFAS, P_VALORAR, P_MIAS],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [...CATALOGOS.map((c) => `catalogo:${c}`)],
    configDefaults: {
      // COP/CLP son CONFIGURACIÓN inicial del tenant, nunca hardcode de dominio (§28).
      "moneda-defecto": "",
    },

    commands: [
      /* -------------------- catalogo.upsert -------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo.upsert`,
        inputSchema: z.object({
          opId: z.string().optional(),
          catalogo: catalogoEnum,
          clave: z.string().min(1),
          etiqueta: z.string().min(1),
          posicion: z.number().int().optional(),
          padre: z.string().nullable().optional(),
        }),
        authorization: { permissions: [P_CONFIG] },
        async handle(ctx, input, uow) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.catalogo.upsert`, input.opId);
          if (!r0.proceder) return r0.corto;
          const entrada: EntradaCatalogo = { clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre ?? null };
          const r = await adapters.catalogos.upsert(uow, tenant.value, input.catalogo as NombreCatalogo, entrada, ctx.principal.id);
          if (!r.ok) return r;
          const em = await emitir(adapters, ctx, uow, tenant.value, CATEGORIA_CONFIGURADA, {
            tenantId: tenant.value,
            entityRef: `manodeobra:categoria:${input.clave}`,
            catalogo: input.catalogo,
            ...entrada,
            actorId: ctx.principal.id,
            actualizadoAt: new Date().toISOString(),
          });
          if (!em.ok) return em;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.catalogo.upsert`, input.opId, { clave: input.clave });
        },
      }),
      /* -------------------- catalogo.habilitar -------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo.habilitar`,
        inputSchema: z.object({ opId: z.string().optional(), catalogo: catalogoEnum, clave: z.string().min(1), habilitado: z.boolean() }),
        authorization: { permissions: [P_CONFIG] },
        async handle(ctx, input, uow) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.catalogo.habilitar`, input.opId);
          if (!r0.proceder) return r0.corto;
          const r = await adapters.catalogos.habilitar(uow, tenant.value, input.catalogo as NombreCatalogo, input.clave, input.habilitado);
          if (!r.ok) return r;
          const em = await emitir(adapters, ctx, uow, tenant.value, CATEGORIA_HABILITADA, {
            tenantId: tenant.value,
            entityRef: `manodeobra:categoria:${input.clave}`,
            catalogo: input.catalogo,
            clave: input.clave,
            habilitado: input.habilitado,
            actorId: ctx.principal.id,
            actualizadoAt: new Date().toISOString(),
          });
          if (!em.ok) return em;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.catalogo.habilitar`, input.opId, { clave: input.clave, habilitado: input.habilitado });
        },
      }),
      /* -------------------- recurso.definir -------------------- */
      (deps) => ({
        name: `${MODULO}.recurso.definir`,
        inputSchema: z.object({ opId: z.string().optional(), identityId: z.string().min(1), categoriaClave: z.string().min(1) }),
        authorization: { permissions: [P_CONFIG] },
        async handle(ctx, input, uow) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.recurso.definir`, input.opId);
          if (!r0.proceder) return r0.corto;
          const vc = await adapters.catalogos.validarReferencia(tenant.value, "categorias-mdo", input.categoriaClave, true);
          if (!vc.ok) return vc;
          const idn = await adapters.identidad.resolver(tenant.value, input.identityId);
          if (!idn.ok) return idn;
          if (!idn.value) return fail(KernelErrors.validation(`La identidad ${input.identityId} no pertenece al tenant`));
          const existente = await adapters.recursos.buscar(tenant.value, input.identityId);
          if (!existente.ok) return existente;
          const ahora = new Date();
          const recurso = definirRecurso({ tenantId: tenant.value, identityId: input.identityId, categoriaClave: input.categoriaClave, actorId: ctx.principal.id, ahora, existente: existente.value });
          if (!recurso.ok) return recurso;
          const saved = await adapters.recursos.upsert(uow, recurso.value);
          if (!saved.ok) return saved;
          const em = await emitir(adapters, ctx, uow, tenant.value, RECURSO_DEFINIDO, {
            tenantId: tenant.value,
            entityRef: `manodeobra:recurso:${input.identityId}`,
            identityId: input.identityId,
            categoriaClave: input.categoriaClave,
            estado: recurso.value.estado,
            actorId: ctx.principal.id,
            actualizadoAt: ahora.toISOString(),
          });
          if (!em.ok) return em;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.recurso.definir`, input.opId, { identityId: input.identityId, categoriaClave: input.categoriaClave, estado: recurso.value.estado });
        },
      }),
      /* -------------------- recurso.estado -------------------- */
      (deps) => ({
        name: `${MODULO}.recurso.estado`,
        inputSchema: z.object({ opId: z.string().optional(), identityId: z.string().min(1), estado: z.enum(["ACTIVO", "INACTIVO"]) }),
        authorization: { permissions: [P_CONFIG] },
        async handle(ctx, input, uow) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.recurso.estado`, input.opId);
          if (!r0.proceder) return r0.corto;
          const existente = await adapters.recursos.buscar(tenant.value, input.identityId);
          if (!existente.ok) return existente;
          if (!existente.value) return fail(KernelErrors.notFound("recurso", input.identityId));
          const ahora = new Date();
          const cambio = cambiarEstadoRecurso(existente.value, input.estado as EstadoRecurso, ctx.principal.id, ahora);
          if (!cambio.ok) return cambio;
          const saved = await adapters.recursos.upsert(uow, cambio.value);
          if (!saved.ok) return saved;
          const em = await emitir(adapters, ctx, uow, tenant.value, RECURSO_ESTADO_CAMBIADO, {
            tenantId: tenant.value,
            entityRef: `manodeobra:recurso:${input.identityId}`,
            identityId: input.identityId,
            estado: input.estado,
            actorId: ctx.principal.id,
            actualizadoAt: ahora.toISOString(),
          });
          if (!em.ok) return em;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.recurso.estado`, input.opId, { identityId: input.identityId, estado: input.estado });
        },
      }),
      /* -------------------- tarifa.crear -------------------- */
      (deps) => ({
        name: `${MODULO}.tarifa.crear`,
        inputSchema: z.object({
          opId: z.string().optional(),
          id: z.string().uuid().optional(),
          sujetoTipo: z.enum(["CATEGORIA", "IDENTIDAD"]).optional(),
          sujetoId: z.string().min(1),
          valor: dineroSchema,
          moneda: z.string().optional(),
          unidad: z.string().optional(),
          vigenciaDesde: z.string().min(1).optional(),
          vigenciaHasta: z.string().min(1).nullable().optional(),
          motivo: z.string().nullable().optional(),
        }),
        authorization: { permissions: [P_TARIFAS] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.tarifa.crear`, input.opId);
          if (!r0.proceder) return r0.corto;
          const sujetoTipo = (input.sujetoTipo ?? "CATEGORIA") as SujetoTarifa;
          if (sujetoTipo === "CATEGORIA") {
            const vc = await adapters.catalogos.validarReferencia(tenant.value, "categorias-mdo", input.sujetoId, true);
            if (!vc.ok) return vc;
          }
          const moneda = input.moneda && input.moneda !== "" ? input.moneda : await cfg(deps, tenant.value, "moneda-defecto", "");
          if (moneda === "") return fail(KernelErrors.validation("moneda es obligatoria (o configure moneda-defecto del tenant)"));
          const existentes = await adapters.tarifas.listarPorSujeto(tenant.value, sujetoTipo, input.sujetoId);
          if (!existentes.ok) return existentes;
          const ahora = new Date();
          const tarifa = crearTarifa({
            id: input.id ?? crypto.randomUUID(),
            tenantId: tenant.value,
            sujetoTipo,
            sujetoId: input.sujetoId,
            valor: input.valor,
            moneda,
            unidad: input.unidad ?? "HORA",
            vigenciaDesde: input.vigenciaDesde ? new Date(input.vigenciaDesde) : ahora,
            vigenciaHasta: input.vigenciaHasta ? new Date(input.vigenciaHasta) : null,
            actorId: ctx.principal.id,
            ahora,
            motivo: input.motivo ?? null,
            existentes: existentes.value,
          });
          if (!tarifa.ok) return tarifa;
          const saved = await adapters.tarifas.insertar(uow, tarifa.value);
          if (!saved.ok) return saved;
          const em = await emitir(adapters, ctx, uow, tenant.value, TARIFA_CREADA, { tenantId: tenant.value, entityRef: `manodeobra:tarifa:${tarifa.value.id}`, ...tarifaAResultado(tarifa.value), actorId: ctx.principal.id });
          if (!em.ok) return em;
          const aud = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "tarifa:crear", tarifa.value.id, { sujetoId: input.sujetoId, valor: tarifa.value.valor, moneda });
          if (!aud.ok) return aud;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.tarifa.crear`, input.opId, tarifaAResultado(tarifa.value));
        },
      }),
      /* -------------------- tarifa.actualizar (cierra+crea en una UoW) -------------------- */
      (deps) => ({
        name: `${MODULO}.tarifa.actualizar`,
        inputSchema: z.object({
          opId: z.string().optional(),
          nuevaId: z.string().uuid().optional(),
          sujetoTipo: z.enum(["CATEGORIA", "IDENTIDAD"]).optional(),
          sujetoId: z.string().min(1),
          valor: dineroSchema,
          moneda: z.string().optional(),
          vigenciaDesde: z.string().min(1).optional(),
          motivo: z.string().nullable().optional(),
        }),
        authorization: { permissions: [P_TARIFAS] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.tarifa.actualizar`, input.opId);
          if (!r0.proceder) return r0.corto;
          const sujetoTipo = (input.sujetoTipo ?? "CATEGORIA") as SujetoTarifa;
          const ahora = new Date();
          const corte = input.vigenciaDesde ? new Date(input.vigenciaDesde) : ahora;
          const existentes = await adapters.tarifas.listarPorSujeto(tenant.value, sujetoTipo, input.sujetoId);
          if (!existentes.ok) return existentes;
          const abierta = existentes.value.find((t) => t.vigenciaHasta === null);
          const moneda = input.moneda && input.moneda !== "" ? input.moneda : (abierta?.moneda ?? (await cfg(deps, tenant.value, "moneda-defecto", "")));
          if (moneda === "") return fail(KernelErrors.validation("moneda es obligatoria"));

          const cerradas: Tarifa[] = [];
          if (abierta) {
            const c = cerrarTarifa(abierta, corte, ctx.principal.id, ahora, input.motivo ?? null);
            if (!c.ok) return c;
            const upd = await adapters.tarifas.actualizar(uow, c.value);
            if (!upd.ok) return upd;
            cerradas.push(c.value);
          }
          const restantes = existentes.value.filter((t) => (abierta ? t.id !== abierta.id : true)).concat(cerradas);
          const nueva = crearTarifa({
            id: input.nuevaId ?? crypto.randomUUID(),
            tenantId: tenant.value,
            sujetoTipo,
            sujetoId: input.sujetoId,
            valor: input.valor,
            moneda,
            unidad: "HORA",
            vigenciaDesde: corte,
            vigenciaHasta: null,
            actorId: ctx.principal.id,
            ahora,
            valorAnterior: abierta?.valor ?? null,
            motivo: input.motivo ?? null,
            existentes: restantes,
          });
          if (!nueva.ok) return nueva;
          const saved = await adapters.tarifas.insertar(uow, nueva.value);
          if (!saved.ok) return saved;
          const em = await emitir(adapters, ctx, uow, tenant.value, TARIFA_ACTUALIZADA, { tenantId: tenant.value, entityRef: `manodeobra:tarifa:${nueva.value.id}`, ...tarifaAResultado(nueva.value), cerroTarifaId: abierta?.id ?? null, actorId: ctx.principal.id });
          if (!em.ok) return em;
          if (abierta) {
            const em2 = await emitir(adapters, ctx, uow, tenant.value, TARIFA_CERRADA, { tenantId: tenant.value, entityRef: `manodeobra:tarifa:${abierta.id}`, ...tarifaAResultado(cerradas[0]!), actorId: ctx.principal.id });
            if (!em2.ok) return em2;
          }
          const aud = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "tarifa:actualizar", nueva.value.id, { sujetoId: input.sujetoId, valorAnterior: abierta?.valor ?? null, valorNuevo: nueva.value.valor, cerroTarifaId: abierta?.id ?? null });
          if (!aud.ok) return aud;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.tarifa.actualizar`, input.opId, { nueva: tarifaAResultado(nueva.value), cerrada: abierta ? tarifaAResultado(cerradas[0]!) : null });
        },
      }),
      /* -------------------- tarifa.cerrar -------------------- */
      (deps) => ({
        name: `${MODULO}.tarifa.cerrar`,
        inputSchema: z.object({ opId: z.string().optional(), tarifaId: z.string().min(1), vigenciaHasta: z.string().min(1), motivo: z.string().nullable().optional() }),
        authorization: { permissions: [P_TARIFAS] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.tarifa.cerrar`, input.opId);
          if (!r0.proceder) return r0.corto;
          const t = await adapters.tarifas.buscarPorId(tenant.value, input.tarifaId);
          if (!t.ok) return t;
          if (!t.value) return fail(KernelErrors.notFound("tarifa", input.tarifaId));
          const ahora = new Date();
          const cerrada = cerrarTarifa(t.value, new Date(input.vigenciaHasta), ctx.principal.id, ahora, input.motivo ?? null);
          if (!cerrada.ok) return cerrada;
          const upd = await adapters.tarifas.actualizar(uow, cerrada.value);
          if (!upd.ok) return upd;
          const em = await emitir(adapters, ctx, uow, tenant.value, TARIFA_CERRADA, { tenantId: tenant.value, entityRef: `manodeobra:tarifa:${cerrada.value.id}`, ...tarifaAResultado(cerrada.value), actorId: ctx.principal.id });
          if (!em.ok) return em;
          const aud = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "tarifa:cerrar", cerrada.value.id, { vigenciaHasta: input.vigenciaHasta });
          if (!aud.ok) return aud;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.tarifa.cerrar`, input.opId, tarifaAResultado(cerrada.value));
        },
      }),
      /* -------------------- valoracion.procesar-sesion -------------------- */
      (deps) => ({
        name: `${MODULO}.valoracion.procesar-sesion`,
        inputSchema: z.object({ opId: z.string().optional(), sesionId: z.string().min(1), ordenId: z.string().optional() }),
        authorization: { permissions: [P_VALORAR] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.valoracion.procesar-sesion`, input.opId);
          if (!r0.proceder) return r0.corto;
          const r = await procesarSesionInterno(adapters, deps, ctx, uow, tenant.value, input.sesionId, new Date());
          if (!r.ok) return r;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.valoracion.procesar-sesion`, input.opId, r.value);
        },
      }),
      /* -------------------- valoracion.revalorar -------------------- */
      (deps) => ({
        name: `${MODULO}.valoracion.revalorar`,
        inputSchema: z.object({ opId: z.string().optional(), sesionId: z.string().min(1) }),
        authorization: { permissions: [P_VALORAR] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r0 = await reclamar(adapters, ctx, uow, tenant.value, `${MODULO}.valoracion.revalorar`, input.opId);
          if (!r0.proceder) return r0.corto;
          const previa = await adapters.valoraciones.buscar(tenant.value, input.sesionId);
          if (!previa.ok) return previa;
          if (!previa.value) return fail(KernelErrors.notFound("valoracion", input.sesionId));
          const puede = esRevalorable(previa.value);
          if (!puede.ok) return puede;

          const dur = await adapters.ordenes.duracionesDeSesion(tenant.value, input.sesionId);
          if (!dur.ok) return dur;
          const s = dur.value;
          if (!s) return fail(KernelErrors.notFound("sesion", input.sesionId));
          const recurso = await adapters.recursos.buscar(tenant.value, s.identityId);
          if (!recurso.ok) return recurso;
          let tarifas: readonly Tarifa[] = [];
          if (recurso.value) {
            const t = await cargarTarifasDeRecurso(adapters, tenant.value, recurso.value.categoriaClave);
            if (!t.ok) return t;
            tarifas = t.value;
          }
          const ahora = new Date();
          const nueva = valorarSesion({
            sesion: { tenantId: tenant.value, sesionId: s.sesionId, ordenId: s.ordenId, activoId: s.activoId, identityId: s.identityId, efectivoMs: s.efectivoMs, iniciadoAt: s.iniciadoAt, cerradoAt: s.cerradoAt },
            recurso: recurso.value,
            tarifas,
            actorId: ctx.principal.id,
            ahora,
          });
          if (!nueva.ok) return nueva;
          const upd = await adapters.valoraciones.reemplazar(uow, nueva.value);
          if (!upd.ok) return upd;
          const em = await emitir(adapters, ctx, uow, tenant.value, VALORACION_REVALORADA, valoracionAResultado(nueva.value, tenant.value));
          if (!em.ok) return em;
          const aud = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "valoracion:revalorar", input.sesionId, { estadoAnterior: previa.value.estado, estadoNuevo: nueva.value.estado });
          if (!aud.ok) return aud;
          return sellarSi(adapters, ctx, uow, tenant.value, `${MODULO}.valoracion.revalorar`, input.opId, valoracionAResultado(nueva.value, tenant.value));
        },
      }),
    ],

    queries: [
      /* -------------------- catalogo.opciones -------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo.opciones`,
        inputSchema: z.object({ catalogo: catalogoEnum }),
        authorization: { permissions: [P_READ] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.catalogos.opciones(tenant.value, input.catalogo as NombreCatalogo);
          if (!r.ok) return r;
          return ok({ opciones: r.value, unidades: [...UNIDADES_TARIFA] });
        },
      }),
      /* -------------------- recursos -------------------- */
      (deps) => ({
        name: `${MODULO}.recursos`,
        inputSchema: z.object({ estado: z.enum(["ACTIVO", "INACTIVO"]).optional() }),
        authorization: { permissions: [P_CONFIG] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.recursos.listar(tenant.value, input.estado ? { estado: input.estado } : undefined);
          if (!r.ok) return r;
          const nombres = await adapters.identidad.resolverVarios(tenant.value, r.value.map((x) => x.identityId));
          if (!nombres.ok) return nombres;
          return ok({
            recursos: r.value.map((x) => ({
              identityId: x.identityId,
              nombre: nombres.value[x.identityId] ?? null,
              categoriaClave: x.categoriaClave,
              estado: x.estado,
              creadoAt: x.creadoAt.toISOString(),
              actualizadoAt: x.actualizadoAt.toISOString(),
            })),
          });
        },
      }),
      /* -------------------- tarifas (por sujeto, historial) -------------------- */
      (deps) => ({
        name: `${MODULO}.tarifas`,
        inputSchema: z.object({ sujetoTipo: z.enum(["CATEGORIA", "IDENTIDAD"]).optional(), sujetoId: z.string().min(1) }),
        authorization: { permissions: [P_TARIFAS] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.tarifas.listarPorSujeto(tenant.value, input.sujetoTipo ?? "CATEGORIA", input.sujetoId);
          if (!r.ok) return r;
          return ok({ tarifas: r.value.map(tarifaAResultado) });
        },
      }),
      /* -------------------- valoraciones (por OT / activo / identidad) -------------------- */
      (deps) => ({
        name: `${MODULO}.valoraciones`,
        inputSchema: z.object({ ordenId: z.string().optional(), activoId: z.string().optional(), identityId: z.string().optional() }),
        authorization: { permissions: [P_READ] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const alcance = alcanceLectura(ctx);
          if ("error" in alcance) return alcance.error;
          // Modo técnico (P_MIAS): pedir identityId AJENO ⇒ rechazo explícito; el
          // resto de vías (OT/activo) se FILTRAN a las filas propias (fail-closed).
          if (alcance.restringido && input.identityId && input.identityId !== alcance.identityId) {
            return fail(KernelErrors.forbidden("mano de obra: sólo puede consultar sus propias valoraciones"));
          }
          // DGP-020.3 fix (hoja de vida) · la consulta POR ACTIVO compone las
          // valoraciones con TODAS las sesiones del activo aún NO valoradas:
          // CERRADA ⇒ PENDIENTE, ABIERTA/PAUSADA ⇒ EN_CURSO. Horas sin costo ≠
          // sin datos. Sin este merge, un activo con trabajo real (sesión abierta
          // o cerrada cuya valoración no materializó) leía «Sin mano de obra».
          // Causa raíz verificada en vivo: la sesión de CAM-001/OT-000022 quedó
          // ABIERTA (nunca se cerró), así que sólo componer CERRADAs no bastaba.
          if (input.activoId) {
            const yoAct = alcance.restringido ? alcance.identityId : identidadDeSesionSuave(ctx);
            return listadoPorActivo(adapters, tenant.value, input.activoId, alcance, yoAct);
          }
          const r = input.ordenId
            ? await adapters.valoraciones.listarPorOrden(tenant.value, input.ordenId)
            : input.identityId
              ? await adapters.valoraciones.listarPorIdentidad(tenant.value, input.identityId)
              : alcance.restringido
                ? await adapters.valoraciones.listarPorIdentidad(tenant.value, alcance.identityId)
                : fail(KernelErrors.validation("Especifique ordenId, activoId o identityId"));
          if (!r.ok) return r;
          const yo = alcance.restringido ? alcance.identityId : identidadDeSesionSuave(ctx);
          const filas = alcance.restringido ? r.value.filter((v) => v.identityId === alcance.identityId) : r.value;
          return ok({ valoraciones: filas.map((v) => ({ ...valoracionAResultado(v, tenant.value), esPropia: yo !== null && v.identityId === yo })) });
        },
      }),
      /* -------------------- mias (técnico: SOLO su identidad canónica) -------------------- */
      (deps) => ({
        name: `${MODULO}.mias`,
        inputSchema: z.object({}),
        authorization: { permissions: [P_MIAS] },
        async handle(ctx) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const yo = identidadDeSesionSuave(ctx);
          if (!yo) return fail(KernelErrors.forbidden("mano de obra: falta la identidad canónica autenticada (identityId)"));
          const r = await adapters.valoraciones.listarPorIdentidad(tenant.value, yo);
          if (!r.ok) return r;
          return ok({ valoraciones: r.value.map((v) => ({ ...valoracionAResultado(v, tenant.value), esPropia: true })) });
        },
      }),
      /* -------------------- resumen (tiempo+costo por OT, con pendientes) -------------------- */
      (deps) => ({
        name: `${MODULO}.resumen`,
        inputSchema: z.object({ ordenId: z.string().min(1) }),
        authorization: { permissions: [P_READ] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const alcance = alcanceLectura(ctx);
          if ("error" in alcance) return alcance.error;
          const restringirA = alcance.restringido ? alcance.identityId : null;
          return resumenPorOrden(adapters, tenant.value, input.ordenId, restringirA ?? identidadDeSesionSuave(ctx), restringirA);
        },
      }),
      /* -------------------- valoraciones.pendientes (red de seguridad) -------------------- */
      (deps) => ({
        name: `${MODULO}.valoraciones.pendientes`,
        inputSchema: z.object({ ordenId: z.string().optional() }),
        authorization: { permissions: [P_VALORAR] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          if (input.ordenId) {
            const res = await resumenPorOrden(adapters, tenant.value, input.ordenId, null);
            if (!res.ok) return res;
            return ok({ pendientes: (res.value as { pendientes: unknown[] }).pendientes });
          }
          const r = await adapters.valoraciones.listarPorEstado(tenant.value, ["SIN_TARIFA", "SIN_RECURSO"]);
          if (!r.ok) return r;
          return ok({ pendientes: r.value.map((v) => valoracionAResultado(v, tenant.value)) });
        },
      }),
      /* -------------------- costo-estimado (sesión ABIERTA) -------------------- */
      (deps) => ({
        name: `${MODULO}.costo-estimado`,
        inputSchema: z.object({ sesionId: z.string().min(1) }),
        authorization: { permissions: [P_READ] },
        async handle(ctx, input) {
          void deps;
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const alcance = alcanceLectura(ctx);
          if ("error" in alcance) return alcance.error;
          const dur = await adapters.ordenes.duracionesDeSesion(tenant.value, input.sesionId);
          if (!dur.ok) return dur;
          const s = dur.value;
          if (!s) return fail(KernelErrors.notFound("sesion", input.sesionId));
          // Técnico (P_MIAS): sólo puede estimar el costo de SUS propias sesiones.
          if (alcance.restringido && s.identityId !== alcance.identityId) {
            return fail(KernelErrors.forbidden("mano de obra: sólo puede estimar el costo de sus propias sesiones"));
          }
          const recurso = await adapters.recursos.buscar(tenant.value, s.identityId);
          if (!recurso.ok) return recurso;
          if (!recurso.value) {
            return ok({ sesionId: s.sesionId, efectivoMs: s.efectivoMs, estimado: true, sinRecurso: true, sinTarifa: true, costo: null });
          }
          const tarifas = await adapters.tarifas.listarPorSujeto(tenant.value, "CATEGORIA", recurso.value.categoriaClave);
          if (!tarifas.ok) return tarifas;
          const est = costoEstimado({ sesionId: s.sesionId, efectivoMs: s.efectivoMs, iniciadoAt: s.iniciadoAt }, tarifas.value);
          if (!est.ok) return est;
          return ok({ ...est.value, sinRecurso: false });
        },
      }),
    ],

    eventHandlers: [],
    healthCheck: () => async () => ({ healthy: true, detail: `${MODULO} operativo` }),
  };
}
