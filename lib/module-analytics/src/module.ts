/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Capa de aplicación +
 * descriptor del servicio de plataforma (ETAPA 1: dominio + servicio).
 *
 * Se registra por el ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime). Persistencia en FAKES en memoria; los adaptadores
 * reales (PostgreSQL / read models CQRS / OpenAPI / UI) llegan en la ETAPA 2.
 *
 * SOLO LECTURA: el módulo consume HECHOS de fuentes read-only (puertos fail-safe
 * que en Etapa 2 envolverán los contratos públicos de Órdenes/Inventario/Activos/
 * Correctivo/Preventivo/Abastecimiento/Planes y del Shared Timeline). JAMÁS
 * modifica datos de otros módulos. Si una fuente requerida no está inyectada, la
 * evaluación FALLA de forma segura (KRN-CFL) — nunca inventa datos.
 */
import { z } from "zod";
import {
  createDomainEvent,
  createExecutionContext,
  fail,
  KernelErrors,
  ok,
  SYSTEM_PRINCIPAL,
  type ExecutionContext,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { audit, tenantOf, type PlatformServiceDefinition, type ServiceDeps } from "@workspace/platform";
import { MODULO } from "./module-name";
import { CATALOGOS, recordTypesCatalogos, type NombreCatalogo } from "./domain/catalogos";
const catalogoEnum = z.enum([...CATALOGOS] as [string, ...string[]]);
import { EVENTOS_MODULO, HISTORIAL_REGISTRADO } from "./domain/events";
import {
  actualizarDefinicion,
  clasificarSemaforo,
  crearDefinicion,
  cumplimientoMeta,
  habilitarDefinicion,
  type DefinicionIndicador,
} from "./domain/definicion-indicador";
import {
  actualizarDashboard,
  clonarDashboard,
  crearDashboard,
  crearWidget,
  esPropietario,
  TIPOS_WIDGET,
  type Dashboard,
  type Widget,
} from "./domain/dashboard";
import { crearExpresion, TIPOS_EXPRESION } from "./domain/expresion";
import { crearFiltro, type Filtro } from "./domain/filtros";
import { evaluarExpresion, type ResultadoEvaluacion } from "./domain/motor";
import { claveDeterminista, crearSnapshot } from "./domain/snapshot";
import { definicionDesdeEspec, dashboardDesdeEspec } from "./domain/seed";
import { CATALOGO_INDICADORES } from "./domain/catalogo-indicadores";
import { CATALOGO_DASHBOARDS } from "./domain/catalogo-dashboards";
import {
  policiesDelModulo,
  POLICY_PUEDE_ADMINISTRAR_INDICADOR,
  POLICY_PUEDE_CREAR_DASHBOARD,
  POLICY_PUEDE_DEFINIR_INDICADOR,
  POLICY_PUEDE_EDITAR_DASHBOARD,
  POLICY_PUEDE_ELIMINAR_DASHBOARD,
  POLICY_PUEDE_EVALUAR,
} from "./domain/policies";
import {
  type CatalogoPort,
  type ClaveFuente,
  type CriterioFuente,
  type DashboardRepository,
  type DefinicionRepository,
  type EventLogStore,
  type FuenteHechos,
  type Recibo,
  type ReciboPort,
  type RegistroFuentes,
  type SnapshotRepository,
} from "./domain/ports";
import type { ConsolaStore, ReadModelsStore, SyncReceiptStore } from "./infrastructure/operacional";
import { aplicarEventoAggregate, handlerProyeccion } from "./projection";

/** Tablas del módulo protegidas por RLS (para la consola técnica de admin). */
const TABLAS_RLS_MODULO: readonly string[] = [
  "an_definiciones",
  "an_dashboards",
  "an_snapshots",
  "an_recibos",
  "an_eventos",
  "an_catalogos",
  "an_definiciones_read",
  "an_dashboards_read",
  "an_snapshots_read",
];

/* ------------------------------- Adaptadores ----------------------------- */

export interface ModuleAdapters {
  readonly definiciones: DefinicionRepository;
  readonly dashboards: DashboardRepository;
  readonly snapshots: SnapshotRepository;
  readonly catalogos: CatalogoPort;
  readonly recibos: ReciboPort;
  readonly eventLog: EventLogStore;
  /** Fuentes read-only por módulo (fail-safe). Ausente ⇒ evaluación rechazada. */
  readonly fuentes?: RegistroFuentes;
  /**
   * Read models CQRS (modo operacional). Cuando está presente, TODAS las
   * consultas se sirven de estas proyecciones (nunca de las tablas de escritura,
   * incl. el detalle — lección 009.2) y se habilita `reproyectar`. Ausente
   * (pruebas de dominio en memoria) ⇒ las consultas caen a los repositorios.
   */
  readonly readModel?: ReadModelsStore;
  /** Recibos de sincronización durables (protocolo de reclamación offline). */
  readonly syncReceipts?: SyncReceiptStore;
  /** Consola técnica (diagnóstico del outbox del Kernel filtrado al módulo). */
  readonly consola?: ConsolaStore;
}

/* ----------------------------- Configuración ----------------------------- */

async function cfg(deps: ServiceDeps, tenant: string, clave: string, def: string): Promise<string> {
  const v = await deps.tenantConfig.get(tenant, `${MODULO}.${clave}`);
  return v.ok && v.value !== "" ? v.value : def;
}

/* --------------------------- Emisión de eventos -------------------------- */

async function emitirEvento(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenantId: string,
  evento: { tipo: string; payload: Record<string, unknown> },
): Promise<Result<void, KernelError>> {
  const dominio = createDomainEvent(evento.tipo, evento.payload, ctx.correlationId);
  const appended = await adapters.eventLog.append(uow, {
    tenantId,
    eventId: dominio.id,
    tipo: dominio.type,
    payload: dominio.payload,
    occurredAt: typeof dominio.occurredAt === "string" ? dominio.occurredAt : new Date(dominio.occurredAt).toISOString(),
  });
  if (!appended.ok) return appended;
  uow.registerEvent(dominio);
  return ok(undefined);
}

function registrarEnTimeline() {
  return async (
    deps: ServiceDeps,
    event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string },
  ): Promise<Result<void, KernelError>> => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    if (!tenantId) return ok(undefined);
    const entityRef = String(p["entityRef"] ?? "");
    if (!entityRef) return ok(undefined);
    const resumen = String(p["nombre"] ?? p["clave"] ?? event.type);
    const occurredAt = String(p["actualizadoAt"] ?? new Date().toISOString());
    const sys = createExecutionContext({
      principal: SYSTEM_PRINCIPAL,
      correlationId: event.correlationId,
      metadata: { tenantId },
    });
    const r = await deps.runtime.commands.execute(sys, "platform.timeline.record", {
      entryId: event.id,
      entityRef,
      eventType: event.type,
      actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
      occurredAt,
      resumen,
      estado: null,
      entidadRelacionada: null,
      payload: p,
    });
    return r.ok ? ok(undefined) : (r as Result<void, KernelError>);
  };
}

/* --------------------------- Idempotencia offline ------------------------ */

async function reciboPrevio(
  adapters: ModuleAdapters,
  tenant: string,
  comando: string,
  opId: string | undefined,
): Promise<Record<string, unknown> | null> {
  if (!opId) return null;
  const previo = await adapters.recibos.buscar(tenant, comando, opId);
  return previo.ok && previo.value ? previo.value.resultado : null;
}

async function sellarRecibo(
  adapters: ModuleAdapters,
  uow: UnitOfWork,
  tenant: string,
  comando: string,
  opId: string | undefined,
  resultado: Record<string, unknown>,
  actorId: string,
): Promise<Result<void, KernelError>> {
  if (!opId) return ok(undefined);
  return adapters.recibos.sellar(uow, tenant, { opId, comando, resultado }, actorId);
}

/* ----------------------------- Evaluación motor -------------------------- */

/** Resuelve la fuente read-only de un módulo (fail-safe). */
function resolverFuente(adapters: ModuleAdapters, modulo: string): Result<FuenteHechos, KernelError> {
  const clave = modulo as ClaveFuente;
  const f = adapters.fuentes?.[clave];
  if (!f) {
    return fail(
      KernelErrors.conflict(
        `La evaluación requiere la fuente read-only "${modulo}" configurada; el módulo no está compuesto con ella. Operación rechazada sin efectos.`,
        { modulo, motivo: "fuente-no-configurada" },
      ),
    );
  }
  return ok(f);
}

/** Evalúa una definición contra su fuente, con filtros extra de ejecución. */
async function evaluarDefinicion(
  adapters: ModuleAdapters,
  tenant: string,
  def: DefinicionIndicador,
  filtrosExtra: readonly Filtro[],
  ahoraISO: string,
): Promise<Result<ResultadoEvaluacion, KernelError>> {
  const fuente = resolverFuente(adapters, def.fuente.modulo);
  if (!fuente.ok) return fuente;
  // Si la ejecución trae un filtro por activo (dimensión/campo "activo"|"activoId"
  // con operador de igualdad), lo propagamos como `extra.activoId` para que las
  // fuentes que enrutan por activo (p.ej. correctivo eventos-activo) restrinjan
  // el FAN-OUT a ese activo; sin filtro, la fuente agrega TODOS los activos del
  // tenant. El motor vuelve a aplicar el filtro (idempotente).
  const filtroActivo = filtrosExtra.find(
    (f) => (f.campo === "activo" || f.campo === "activoId" || f.dimension === "activo") && f.operador === "eq" && typeof f.valor === "string",
  );
  const criterio: CriterioFuente = {
    dataset: def.fuente.dataset,
    desde: def.expresion.ventana?.desde ?? null,
    hasta: def.expresion.ventana?.hasta ?? null,
    ...(filtroActivo ? { extra: { activoId: filtroActivo.valor as string } } : {}),
  };
  const hechos = await fuente.value.hechos(tenant, criterio);
  if (!hechos.ok) return hechos;
  const expEfectiva = filtrosExtra.length
    ? { ...def.expresion, filtros: [...def.expresion.filtros, ...filtrosExtra] }
    : def.expresion;
  return evaluarExpresion(expEfectiva, hechos.value, ahoraISO);
}

/* ------------------------------ Esquemas VO ------------------------------ */

const filtroSchema = z.object({
  dimension: z.string().min(1),
  campo: z.string().min(1).nullable().optional(),
  operador: z.string().min(1),
  valor: z.unknown(),
});
const ventanaSchema = z.object({
  campoFecha: z.string().min(1),
  ultimosDias: z.number().int().positive().nullable().optional(),
  desde: z.string().min(1).nullable().optional(),
  hasta: z.string().min(1).nullable().optional(),
});
const expresionSchema = z.object({
  tipo: z.enum([...TIPOS_EXPRESION] as [string, ...string[]]),
  campo: z.string().min(1).nullable().optional(),
  filtros: z.array(filtroSchema).default([]),
  filtrosDenominador: z.array(filtroSchema).optional(),
  factor: z.number().nullable().optional(),
  ventana: ventanaSchema.nullable().optional(),
  agrupadores: z.array(z.string().min(1)).optional(),
  campoTiempoOperativo: z.string().min(1).nullable().optional(),
  campoTiempoReparacion: z.string().min(1).nullable().optional(),
  campoEsFalla: z.string().min(1).nullable().optional(),
});
const umbralesSchema = z.object({
  mayorEsMejor: z.boolean(),
  bueno: z.number(),
  alerta: z.number(),
  critico: z.number(),
});
const fuenteSchema = z.object({ modulo: z.string().min(1), dataset: z.string().min(1) });
const metaSchema = z.object({ periodo: z.string().min(1), valor: z.number() });
const widgetSchema = z.object({
  id: z.string().min(1).optional(),
  tipo: z.enum([...TIPOS_WIDGET] as [string, ...string[]]),
  titulo: z.string().min(1),
  indicadorClave: z.string().min(1),
  filtros: z.array(filtroSchema).default([]),
  presentacion: z.record(z.string(), z.unknown()).default({}),
  ranking: z.object({ modo: z.enum(["topN", "bottomN"]), n: z.number().int().positive() }).nullable().optional(),
  posicion: z.number().int().nonnegative().optional(),
});

/* --------------------------- Helpers de dominio -------------------------- */

function construirFiltros(arr: z.infer<typeof filtroSchema>[]): Result<Filtro[], KernelError> {
  const out: Filtro[] = [];
  for (const f of arr) {
    const r = crearFiltro({ dimension: f.dimension, campo: f.campo, operador: f.operador, valor: f.valor as never });
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

function construirWidgets(arr: z.infer<typeof widgetSchema>[]): Result<Widget[], KernelError> {
  const out: Widget[] = [];
  let i = 0;
  for (const w of arr) {
    const filtros = construirFiltros(w.filtros);
    if (!filtros.ok) return filtros;
    const rw = crearWidget({
      id: w.id ?? crypto.randomUUID(),
      tipo: w.tipo,
      titulo: w.titulo,
      indicadorClave: w.indicadorClave,
      filtros: filtros.value,
      presentacion: w.presentacion,
      ranking: w.ranking ?? null,
      posicion: w.posicion ?? i,
    });
    if (!rw.ok) return rw;
    out.push(rw.value);
    i += 1;
  }
  return ok(out);
}

/* ------------------------------ Descriptor ------------------------------- */

export function analyticsModule(adapters: ModuleAdapters): PlatformServiceDefinition {
  let policiesRegistradas = false;
  const conPolicies = (deps: ServiceDeps): void => {
    if (policiesRegistradas) return;
    for (const p of policiesDelModulo()) deps.runtime.policyEngine.register(p);
    policiesRegistradas = true;
  };
  const evaluar = (deps: ServiceDeps, ctx: ExecutionContext, policy: string, subject: Record<string, unknown>) =>
    deps.runtime.policyEngine.evaluate(policy, ctx, subject);

  return {
    name: MODULO,
    version: "1.0.0",
    description:
      "Enterprise Analytics & KPI Platform — dominio (DGP-016 Etapa 1): plataforma de SOLO LECTURA de indicadores declarativos por tenant (clave, categoría, fuente declarativa módulo+dataset, expresión de cálculo genérica —conteo/suma/promedio/ratio/duración-promedio/tasa/MTBF/MTTR—, unidad, formato, umbrales de semáforo, metas por periodo, versionado inmutable), catálogo canónico de ~28 indicadores COMO DATOS, motor de evaluación puro y determinista sobre fuentes read-only fail-safe (Órdenes/Inventario/Activos/Correctivo/Preventivo/Abastecimiento/Planes/Timeline; MTBF/MTTR calculados desde eventos crudos), dashboards declarativos con 13 tipos de widget y 8 dashboards del sistema como configuración canónica + dashboards personalizables por usuario con policies de propiedad, filtros reutilizables por dimensiones canónicas y snapshots de evaluación idempotentes por clave determinista (base de Offline).",
    capabilities: [
      { name: "consultar-analytics", permissions: [`${MODULO}.read`], description: "Lectura de indicadores, dashboards y snapshots" },
      { name: "administrar-analytics", permissions: [`${MODULO}.read`, `${MODULO}.admin`], description: "Definición y administración de indicadores del tenant" },
      { name: "gestionar-dashboards-analytics", permissions: [`${MODULO}.read`, `${MODULO}.dashboard`], description: "Crear/editar/clonar/eliminar dashboards personalizados" },
      { name: "exportar-analytics", permissions: [`${MODULO}.read`, `${MODULO}.export`], description: "Exportación de resultados analíticos" },
    ],
    permissions: [`${MODULO}.read`, `${MODULO}.admin`, `${MODULO}.dashboard`, `${MODULO}.export`],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [
      "indicador-analytics",
      "dashboard-analytics",
      "snapshot-analytics",
      "recibo-op",
      ...recordTypesCatalogos(),
    ],
    configDefaults: {
      "snapshot-ttl-horas": "24",
      "evaluacion-ventana-default-dias": "30",
    },
    commands: [
      /* ---------------------------- catálogo upsert ---------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo-upsert`,
        inputSchema: z.object({
          catalogo: catalogoEnum,
          clave: z.string().min(1),
          etiqueta: z.string().min(1),
          posicion: z.number().int().nonnegative().optional(),
          padre: z.string().min(1).nullable().optional(),
        }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.catalogos.upsert(uow, tenant.value, input.catalogo as NombreCatalogo, {
            clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre ?? null,
          }, ctx.principal.id);
          if (!r.ok) return r;
          return ok({ catalogo: input.catalogo, clave: input.clave });
        },
      }),
      (deps) => ({
        name: `${MODULO}.catalogo-habilitar`,
        inputSchema: z.object({ catalogo: catalogoEnum, clave: z.string().min(1), habilitado: z.boolean() }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.catalogos.habilitar(uow, tenant.value, input.catalogo as NombreCatalogo, input.clave, input.habilitado);
          if (!r.ok) return r;
          return ok({ catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado });
        },
      }),
      /* ----------------------- sembrar catálogo del sistema -------------- */
      (deps) => ({
        name: `${MODULO}.sembrar-sistema`,
        inputSchema: z.object({}),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, _input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const ahora = new Date().toISOString();
          let indicadores = 0;
          for (const espec of CATALOGO_INDICADORES) {
            const existe = await adapters.definiciones.findByClave(tenant.value, espec.clave);
            if (!existe.ok) return existe;
            if (existe.value) continue;
            const built = definicionDesdeEspec(espec, tenant.value, crypto.randomUUID(), ctx.principal.id, ahora);
            if (!built.ok) return built;
            const saved = await adapters.definiciones.insert(uow, built.value.definicion);
            if (!saved.ok) return saved;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, built.value.evento);
            if (!_e.ok) return _e;
            indicadores += 1;
          }
          let dashboards = 0;
          for (const espec of CATALOGO_DASHBOARDS) {
            const existe = await adapters.dashboards.findByClave(tenant.value, espec.clave);
            if (!existe.ok) return existe;
            if (existe.value) continue;
            const dbId = crypto.randomUUID();
            const built = dashboardDesdeEspec(espec, tenant.value, dbId, (i) => `${dbId}:w${i}`, ctx.principal.id, ahora);
            if (!built.ok) return built;
            const saved = await adapters.dashboards.insert(uow, built.value.dashboard);
            if (!saved.ok) return saved;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, built.value.evento);
            if (!_e.ok) return _e;
            dashboards += 1;
          }
          const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "sembrar-sistema", null, { indicadores, dashboards });
          if (!audited.ok) return audited;
          return ok({ indicadores, dashboards });
        },
      }),
      /* --------------------------- definir indicador --------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.definir-indicador`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            clave: z.string().min(1),
            nombre: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            categoria: z.string().min(1),
            fuente: fuenteSchema,
            expresion: expresionSchema,
            unidad: z.string().min(1),
            formato: z.string().min(1),
            umbrales: umbralesSchema.nullable().optional(),
            metas: z.array(metaSchema).default([]),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const pol = evaluar(deps, ctx, POLICY_PUEDE_DEFINIR_INDICADOR, {});
            if (!pol.ok) return pol;

            const val = await adapters.catalogos.validarReferencia(tenant.value, "categorias-indicador", input.categoria, true);
            if (!val.ok) return val;
            const vu = await adapters.catalogos.validarReferencia(tenant.value, "unidades", input.unidad, true);
            if (!vu.ok) return vu;
            const vf = await adapters.catalogos.validarReferencia(tenant.value, "formatos", input.formato, true);
            if (!vf.ok) return vf;

            const filtros = construirFiltros(input.expresion.filtros);
            if (!filtros.ok) return filtros;
            const filtrosDen = input.expresion.filtrosDenominador ? construirFiltros(input.expresion.filtrosDenominador) : ok([]);
            if (!filtrosDen.ok) return filtrosDen;
            const exp = crearExpresion({
              tipo: input.expresion.tipo,
              campo: input.expresion.campo,
              filtros: filtros.value,
              filtrosDenominador: input.expresion.filtrosDenominador ? filtrosDen.value : undefined,
              factor: input.expresion.factor,
              ventana: input.expresion.ventana,
              agrupadores: input.expresion.agrupadores,
              campoTiempoOperativo: input.expresion.campoTiempoOperativo,
              campoTiempoReparacion: input.expresion.campoTiempoReparacion,
              campoEsFalla: input.expresion.campoEsFalla,
            });
            if (!exp.ok) return exp;

            const ahora = new Date().toISOString();
            const cambio = crearDefinicion({
              id: input.id ?? crypto.randomUUID(),
              tenantId: tenant.value,
              clave: input.clave,
              nombre: input.nombre,
              descripcion: input.descripcion ?? null,
              categoria: input.categoria,
              fuente: input.fuente,
              expresion: exp.value,
              unidad: input.unidad,
              formato: input.formato,
              umbrales: input.umbrales ?? null,
              metas: input.metas,
              delSistema: false,
              actorId: ctx.principal.id,
              ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.definiciones.insert(uow, cambio.value.definicion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "definir-indicador", input.clave, { clave: input.clave });
            if (!audited.ok) return audited;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
            if (!_e.ok) return _e;
            return ok({ clave: saved.value.clave, version: saved.value.version });
          },
        };
      },
      /* ------------------------- actualizar indicador -------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.actualizar-indicador`,
          inputSchema: z.object({
            clave: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().nullable().optional(),
            categoria: z.string().min(1).optional(),
            fuente: fuenteSchema.optional(),
            expresion: expresionSchema.optional(),
            unidad: z.string().min(1).optional(),
            formato: z.string().min(1).optional(),
            umbrales: umbralesSchema.nullable().optional(),
            metas: z.array(metaSchema).optional(),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.definiciones.findByClave(tenant.value, input.clave);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("indicador", input.clave));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_ADMINISTRAR_INDICADOR, { delSistema: found.value.delSistema });
            if (!pol.ok) return pol;

            const cambios: Parameters<typeof actualizarDefinicion>[1] = {};
            if (input.nombre !== undefined) cambios.nombre = input.nombre;
            if (input.descripcion !== undefined) cambios.descripcion = input.descripcion;
            if (input.categoria !== undefined) cambios.categoria = input.categoria;
            if (input.fuente !== undefined) cambios.fuente = input.fuente;
            if (input.unidad !== undefined) cambios.unidad = input.unidad;
            if (input.formato !== undefined) cambios.formato = input.formato;
            if (input.umbrales !== undefined) cambios.umbrales = input.umbrales;
            if (input.metas !== undefined) cambios.metas = input.metas;
            if (input.expresion !== undefined) {
              const filtros = construirFiltros(input.expresion.filtros);
              if (!filtros.ok) return filtros;
              const filtrosDen = input.expresion.filtrosDenominador ? construirFiltros(input.expresion.filtrosDenominador) : ok([]);
              if (!filtrosDen.ok) return filtrosDen;
              const exp = crearExpresion({
                tipo: input.expresion.tipo,
                campo: input.expresion.campo,
                filtros: filtros.value,
                filtrosDenominador: input.expresion.filtrosDenominador ? filtrosDen.value : undefined,
                factor: input.expresion.factor,
                ventana: input.expresion.ventana,
                agrupadores: input.expresion.agrupadores,
                campoTiempoOperativo: input.expresion.campoTiempoOperativo,
                campoTiempoReparacion: input.expresion.campoTiempoReparacion,
                campoEsFalla: input.expresion.campoEsFalla,
              });
              if (!exp.ok) return exp;
              cambios.expresion = exp.value;
            }

            const ahora = new Date().toISOString();
            const cambio = actualizarDefinicion(found.value, cambios, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.definiciones.update(uow, cambio.value.definicion, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "actualizar-indicador", input.clave, {});
            if (!audited.ok) return audited;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
            if (!_e.ok) return _e;
            return ok({ clave: input.clave, version: saved.value.version });
          },
        };
      },
      /* -------------------------- habilitar indicador -------------------- */
      (deps) => ({
        name: `${MODULO}.habilitar-indicador`,
        inputSchema: z.object({ clave: z.string().min(1), expectedVersion: z.number().int().positive(), habilitado: z.boolean() }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const found = await adapters.definiciones.findByClave(tenant.value, input.clave);
          if (!found.ok) return found;
          if (!found.value) return fail(KernelErrors.notFound("indicador", input.clave));
          const ahora = new Date().toISOString();
          const cambio = habilitarDefinicion(found.value, input.habilitado, ctx.principal.id, ahora);
          if (!cambio.ok) return cambio;
          const saved = await adapters.definiciones.update(uow, cambio.value.definicion, input.expectedVersion);
          if (!saved.ok) return saved;
          const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
          if (!_e.ok) return _e;
          return ok({ clave: input.clave, version: saved.value.version, habilitado: input.habilitado });
        },
      }),
      /* --------------------------- crear dashboard ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-dashboard`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            clave: z.string().min(1),
            nombre: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            widgets: z.array(widgetSchema).default([]),
          }),
          authorization: { permissions: [`${MODULO}.dashboard`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_DASHBOARD, {});
            if (!pol.ok) return pol;

            const widgets = construirWidgets(input.widgets);
            if (!widgets.ok) return widgets;
            const ahora = new Date().toISOString();
            const id = input.id ?? crypto.randomUUID();
            const cambio = crearDashboard({
              id, tenantId: tenant.value, clave: input.clave, nombre: input.nombre, descripcion: input.descripcion ?? null,
              widgets: widgets.value, delSistema: false, propietarioId: ctx.principal.id, actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.dashboards.insert(uow, cambio.value.dashboard);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-dashboard", id, { clave: input.clave });
            if (!audited.ok) return audited;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
            if (!_e.ok) return _e;
            return ok({ id, clave: input.clave, version: saved.value.version });
          },
        };
      },
      /* ------------------------- actualizar dashboard -------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.actualizar-dashboard`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().nullable().optional(),
            widgets: z.array(widgetSchema).optional(),
          }),
          authorization: { permissions: [`${MODULO}.dashboard`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.dashboards.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("dashboard", input.id));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR_DASHBOARD, {
              delSistema: found.value.delSistema,
              esPropietario: esPropietario(found.value, ctx.principal.id),
            });
            if (!pol.ok) return pol;

            const cambios: Parameters<typeof actualizarDashboard>[1] = {};
            if (input.nombre !== undefined) cambios.nombre = input.nombre;
            if (input.descripcion !== undefined) cambios.descripcion = input.descripcion;
            if (input.widgets !== undefined) {
              const widgets = construirWidgets(input.widgets);
              if (!widgets.ok) return widgets;
              cambios.widgets = widgets.value;
            }
            const ahora = new Date().toISOString();
            const cambio = actualizarDashboard(found.value, cambios, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.dashboards.update(uow, cambio.value.dashboard, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "actualizar-dashboard", input.id, {});
            if (!audited.ok) return audited;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
            if (!_e.ok) return _e;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      /* ---------------------------- clonar dashboard --------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.clonar-dashboard`,
          inputSchema: z.object({
            origenId: z.string().min(1),
            id: z.string().uuid().optional(),
            clave: z.string().min(1),
            nombre: z.string().min(1),
          }),
          authorization: { permissions: [`${MODULO}.dashboard`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_DASHBOARD, {});
            if (!pol.ok) return pol;
            const found = await adapters.dashboards.findById(tenant.value, input.origenId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("dashboard", input.origenId));

            const ahora = new Date().toISOString();
            const id = input.id ?? crypto.randomUUID();
            const cambio = clonarDashboard(
              found.value,
              { id, clave: input.clave, nombre: input.nombre, propietarioId: ctx.principal.id },
              ctx.principal.id,
              ahora,
            );
            if (!cambio.ok) return cambio;
            const saved = await adapters.dashboards.insert(uow, cambio.value.dashboard);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "clonar-dashboard", id, { origenId: input.origenId });
            if (!audited.ok) return audited;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
            if (!_e.ok) return _e;
            return ok({ id, clave: input.clave, version: saved.value.version });
          },
        };
      },
      /* ---------------------------- eliminar dashboard ------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.eliminar-dashboard`,
          inputSchema: z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive() }),
          authorization: { permissions: [`${MODULO}.dashboard`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.dashboards.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("dashboard", input.id));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_ELIMINAR_DASHBOARD, {
              delSistema: found.value.delSistema,
              esPropietario: esPropietario(found.value, ctx.principal.id),
            });
            if (!pol.ok) return pol;
            const del = await adapters.dashboards.delete(uow, tenant.value, input.id, input.expectedVersion);
            if (!del.ok) return del;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "eliminar-dashboard", input.id, {});
            if (!audited.ok) return audited;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: "modulo.analytics.dashboard-eliminado",
              payload: {
                tenantId: tenant.value, id: input.id, entityRef: `dashboard:${input.id}`, clave: found.value.clave,
                actorId: ctx.principal.id, actualizadoAt: new Date().toISOString(), eventoTipo: "modulo.analytics.dashboard-eliminado",
              },
            });
            if (!_e.ok) return _e;
            return ok({ id: input.id, eliminado: true });
          },
        };
      },
      /* -------------------------- materializar snapshot ------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.materializar-snapshot`,
          inputSchema: z.object({
            opId: z.string().optional(),
            clave: z.string().min(1),
            filtros: z.array(filtroSchema).default([]),
            evaluadoEn: z.string().min(1).optional(),
          }),
          authorization: { permissions: [`${MODULO}.read`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.materializar-snapshot`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_EVALUAR, {});
            if (!pol.ok) return pol;

            const found = await adapters.definiciones.findByClave(tenant.value, input.clave);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("indicador", input.clave));

            const filtros = construirFiltros(input.filtros);
            if (!filtros.ok) return filtros;

            const ahora = input.evaluadoEn ?? new Date().toISOString();
            const resultado = await evaluarDefinicion(adapters, tenant.value, found.value, filtros.value, ahora);
            if (!resultado.ok) return resultado;

            const clave = claveDeterminista({ tenantId: tenant.value, target: "indicador", targetClave: input.clave, filtros: filtros.value, evaluadoEn: ahora });
            const existente = await adapters.snapshots.buscarPorClave(tenant.value, clave);
            if (!existente.ok) return existente;
            if (existente.value) {
              const resultadoPrev = {
                id: existente.value.id, claveSnapshot: clave, clave: input.clave,
                valor: existente.value.resultado.valor, muestras: existente.value.resultado.muestras,
              };
              const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.materializar-snapshot`, input.opId, resultadoPrev, ctx.principal.id);
              if (!rec.ok) return rec;
              return ok({ ...resultadoPrev, idempotente: true });
            }

            const id = crypto.randomUUID();
            const snap = crearSnapshot({
              id, tenantId: tenant.value, target: "indicador", targetClave: input.clave,
              filtros: filtros.value, resultado: resultado.value, evaluadoEn: ahora, actorId: ctx.principal.id,
            });
            if (!snap.ok) return snap;
            const saved = await adapters.snapshots.upsert(uow, snap.value.snapshot);
            if (!saved.ok) return saved;
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, snap.value.evento);
            if (!_e.ok) return _e;

            const resultadoFinal = { id, claveSnapshot: clave, clave: input.clave, valor: resultado.value.valor, muestras: resultado.value.muestras };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.materializar-snapshot`, input.opId, resultadoFinal, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultadoFinal, idempotente: false });
          },
        };
      },
      /* --------------------------- reproyectar --------------------------- */
      // REPROYECCIÓN por REPLAY: reconstruye los read models desde la bitácora
      // durable (`an_eventos`) — equivalencia con la proyección en vivo. Limpia
      // primero (clear) y reaplica cada evento idempotentemente. Sólo disponible
      // si hay read model + event log configurados.
      (deps) => {
        void deps;
        return {
          name: `${MODULO}.reproyectar`,
          inputSchema: z.object({}),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, _input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            if (!adapters.readModel) {
              return fail(KernelErrors.conflict("El runtime no tiene read models configurados; reproyección no disponible.", { motivo: "read-model-no-configurado" }));
            }
            const eventos = await adapters.eventLog.listPorTenant(tenant.value);
            if (!eventos.ok) return eventos;
            const limpiado = await adapters.readModel.clear(uow, tenant.value);
            if (!limpiado.ok) return limpiado;
            let aplicados = 0;
            for (const e of eventos.value) {
              const r = await aplicarEventoAggregate({ readModel: adapters.readModel }, uow, { id: e.eventId, type: e.tipo, payload: e.payload });
              if (!r.ok) return r;
              aplicados += 1;
            }
            return ok({ reproyectados: aplicados, idempotente: false });
          },
        };
      },
    ],
    queries: [
      /* ---------------------------- indicador detalle -------------------- */
      (deps) => ({
        name: `${MODULO}.indicador`,
        inputSchema: z.object({ clave: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // DETALLE servido SIEMPRE desde read model (lección 009.2) cuando está
          // configurado; jamás toca la tabla de escritura.
          if (adapters.readModel) {
            const rm = await adapters.readModel.definicionGet(tenant.value, input.clave);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("indicador", input.clave));
            return ok(rm.value.datos);
          }
          const r = await adapters.definiciones.findByClave(tenant.value, input.clave);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("indicador", input.clave));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.indicadores`,
        inputSchema: z.object({ categoria: z.string().optional(), habilitado: z.boolean().optional(), delSistema: z.boolean().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.definicionList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.definiciones.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      /* ----------------------------- evaluar indicador ------------------- */
      (deps) => ({
        name: `${MODULO}.evaluar`,
        inputSchema: z.object({
          clave: z.string().min(1),
          filtros: z.array(filtroSchema).default([]),
          periodo: z.string().optional(),
          evaluadoEn: z.string().min(1).optional(),
        }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // La definición se resuelve SIEMPRE desde el read model cuando está
          // configurado (toda consulta pasa por CQRS); la evaluación es una
          // lectura PURA contra las fuentes read-only, sin mutar estado propio.
          const found = adapters.readModel
            ? await (async () => {
                const rm = await adapters.readModel!.definicionGet(tenant.value, input.clave);
                if (!rm.ok) return rm;
                return ok(rm.value ? (rm.value.datos as unknown as DefinicionIndicador) : null);
              })()
            : await adapters.definiciones.findByClave(tenant.value, input.clave);
          if (!found.ok) return found;
          if (!found.value) return fail(KernelErrors.notFound("indicador", input.clave));
          const filtros = construirFiltros(input.filtros);
          if (!filtros.ok) return filtros;
          const ahora = input.evaluadoEn ?? new Date().toISOString();
          const resultado = await evaluarDefinicion(adapters, tenant.value, found.value, filtros.value, ahora);
          if (!resultado.ok) return resultado;
          const semaforo = clasificarSemaforo(found.value.umbrales, resultado.value.valor);
          const cumplimiento = input.periodo ? cumplimientoMeta(found.value, resultado.value.valor, input.periodo) : null;
          return ok({
            clave: input.clave, unidad: found.value.unidad, formato: found.value.formato,
            valor: resultado.value.valor, muestras: resultado.value.muestras, grupos: resultado.value.grupos,
            semaforo, cumplimiento, evaluadoEn: ahora,
          });
        },
      }),
      /* ------------------------------ dashboards ------------------------- */
      (deps) => ({
        name: `${MODULO}.dashboard`,
        inputSchema: z.object({ id: z.string().min(1).optional(), clave: z.string().min(1).optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!input.id && !input.clave) return fail(KernelErrors.validation("Indica id o clave del dashboard"));
          if (adapters.readModel) {
            const rm = input.id
              ? await adapters.readModel.dashboardGet(tenant.value, input.id)
              : await adapters.readModel.dashboardGetPorClave(tenant.value, input.clave!);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("dashboard", input.id ?? input.clave!));
            return ok(rm.value.datos);
          }
          const r = input.id
            ? await adapters.dashboards.findById(tenant.value, input.id)
            : await adapters.dashboards.findByClave(tenant.value, input.clave!);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("dashboard", input.id ?? input.clave!));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.dashboards`,
        inputSchema: z.object({ delSistema: z.boolean().optional(), propietarioId: z.string().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.dashboardList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.dashboards.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      /* ------------------------------ snapshots -------------------------- */
      (deps) => ({
        name: `${MODULO}.snapshots`,
        inputSchema: z.object({ targetClave: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.snapshotList(tenant.value, input.targetClave);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.snapshots.list(tenant.value, input.targetClave);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      /* ------------------------------- catálogos ------------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo-opciones`,
        inputSchema: z.object({ catalogo: catalogoEnum }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.catalogos.opciones(tenant.value, input.catalogo as NombreCatalogo);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      /* ------------------------------- eventos --------------------------- */
      (deps) => ({
        name: `${MODULO}.eventos`,
        inputSchema: z.object({}),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.eventLog.listPorTenant(tenant.value);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      /* --------------------------- consola técnica ----------------------- */
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({}),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const eventos = await adapters.eventLog.listPorTenant(tenant.value);
          if (!eventos.ok) return eventos;
          const ventana = await cfg(deps, tenant.value, "evaluacion-ventana-default-dias", "30");
          const outbox = adapters.consola ? await adapters.consola.outboxDelModulo(tenant.value) : null;
          const readModels = adapters.readModel ? await adapters.readModel.contar(tenant.value) : null;
          return ok({
            eventos: eventos.value.length,
            tablasRLS: TABLAS_RLS_MODULO,
            ventanaDefaultDias: Number(ventana),
            outbox: outbox && outbox.ok ? outbox.value : null,
            readModels: readModels && readModels.ok ? readModels.value : null,
          } as unknown as Record<string, unknown>);
        },
      }),
    ],
    eventHandlers: [
      // Shared Timeline CANÓNICO: cada evento del módulo se registra vía COMANDO
      // `platform.timeline.record`, idempotente por entryId=event.id.
      ...EVENTOS_MODULO.filter((t) => t !== HISTORIAL_REGISTRADO).map((eventType) => ({
        eventType,
        handlerName: `timeline:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          registrarEnTimeline()(deps, { ...event, type: eventType }),
      })),
      // PROYECCIÓN CQRS (modo operacional): cada evento se proyecta a los read
      // models bajo su propia UoW de sistema. En memoria (sin readModel) es no-op.
      ...EVENTOS_MODULO.filter((t) => t !== HISTORIAL_REGISTRADO).map((eventType) => ({
        eventType,
        handlerName: `proyeccion:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          handlerProyeccion(adapters)(deps)({ ...event, type: eventType }),
      })),
    ],
    healthCheck: () => async () => ({ healthy: true, detail: `${MODULO} operativo` }),
  };
}
