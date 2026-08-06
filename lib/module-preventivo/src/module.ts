/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Capa de aplicación +
 * descriptor del servicio de plataforma (ETAPA 1: dominio + servicio).
 *
 * Se registra por el ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime). Persistencia en FAKES en memoria; los adaptadores
 * reales (PostgreSQL / read models CQRS / OpenAPI / UI) llegan en la ETAPA 2.
 *
 * GOBIERNO: TODO ciclo de vida del programa preventivo pasa por el Workflow
 * Engine. Sin un `WorkflowPort` aprobado, los comandos gobernados FALLAN de
 * forma segura (KRN-CFL-001) y NO alteran el aggregate — nunca auto-aprueban. La
 * auto-aprobación es EXCLUSIVA de pruebas (test-runtime).
 *
 * COMPOSICIÓN (lección 009.3): la colaboración con Planes/Activos/Órdenes se
 * hace por PUERTOS FAIL-SAFE (ActivosPort/PlanesPort/MaterializadorOrdenes) en su
 * PROPIO runtime/UoW — jamás comandos anidados. Result verificado ANTES de todo
 * efecto; idempotencia por opId/recibos y guard de dedup determinista.
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
import {
  ACTIVIDAD_CREADA,
  EVENTOS_MODULO,
  GENERACION_DECIDIDA,
  GENERACION_MATERIALIZADA,
  HISTORIAL_REGISTRADO,
  PROGRAMA_CREADO,
  PROGRAMA_REVERTIDO,
  PROGRAMA_TRANSICIONADO,
  PROGRAMA_VERSIONADO,
  PROGRAMACION_EXCLUIDA,
  PROGRAMACION_REPROGRAMADA,
  PROGRAMACION_SUSPENDIDA,
} from "./domain/events";
import {
  ACCIONES_PROGRAMA,
  aplicarAccionPrograma,
  crearPrograma,
  detectarCicloJerarquia,
  editarPrograma,
  revertirPrograma,
  versionarPrograma,
  type AccionPrograma,
  type EstadoPrograma,
} from "./domain/programa";
import { crearActividad } from "./domain/actividad";
import {
  crearReferenciaPlan,
  crearSla,
  crearVigencia,
  crearChecklist,
  crearRecursosRequeridos,
  crearTiempoEstimado,
} from "./domain/value-objects";
import {
  crearGeneracion,
  decidirGeneracionPreventiva,
  materializarGeneracion,
  type OcurrenciaPreventiva,
} from "./domain/generacion";
import { crearHistorial } from "./domain/historial";
import {
  policiesDelModulo,
  POLICY_PUEDE_CREAR_PROGRAMA,
  POLICY_PUEDE_DEFINIR_ACTIVIDAD,
  POLICY_PUEDE_EDITAR_PROGRAMA,
  POLICY_PUEDE_GENERAR,
  POLICY_PUEDE_TRANSICIONAR_PROGRAMA,
  POLICY_PUEDE_VERSIONAR_PROGRAMA,
} from "./domain/policies";
import {
  CONFIG_CODIGO_DEFAULT,
  type ActividadRepository,
  type ActivosPort,
  type CatalogoPort,
  type ConfigCodigo,
  type ConsecutivoPort,
  type EventLogStore,
  type GeneracionDedupStore,
  type GeneracionRepository,
  type HistorialRepository,
  type MaterializadorOrdenes,
  type PlanesPort,
  type ProgramaRepository,
  type ProgramaVersionRepository,
  type SerieDocumento,
} from "./domain/ports";
import {
  ACCIONES_NEUTRAS,
  type ProcesoWorkflow,
  type ReferenciaWorkflow,
  type WorkflowPort,
} from "./domain/workflow";
import {
  AMBITOS_SUSPENSION,
  crearExclusion,
  crearReprogramacion,
  crearSuspension,
  type AmbitoSuspension,
} from "./domain/programacion";
import type {
  ConsolaStore,
  ReadModelsStore,
  SyncReceiptStore,
} from "./infrastructure/operacional";
import { aplicarEventoAggregate, handlerProyeccion, type ProyeccionAdapters } from "./projection";

/* ------------------------------- Adaptadores ----------------------------- */

export interface ModuleAdapters {
  readonly programas: ProgramaRepository;
  readonly versiones: ProgramaVersionRepository;
  readonly actividades: ActividadRepository;
  readonly generaciones: GeneracionRepository;
  readonly dedup: GeneracionDedupStore;
  readonly historial: HistorialRepository;
  readonly catalogos: CatalogoPort;
  readonly consecutivo: ConsecutivoPort;
  readonly recibos: import("./domain/ports").ReciboPort;
  readonly eventLog: EventLogStore;
  /** Workflow Engine aprobado (gobierno). Ausente ⇒ comandos gobernados fallan. */
  readonly workflow?: WorkflowPort;
  /** Validación de activos (composición fail-safe). */
  readonly activos?: ActivosPort;
  /** Verificación de planes publicados (composición fail-safe). */
  readonly planes?: PlanesPort;
  /** Materializador de órdenes de trabajo (composición fail-safe). */
  readonly materializador?: MaterializadorOrdenes;
  /**
   * Read models CQRS. OPCIONAL: si está presente, las consultas se sirven desde
   * los read models (incl. detalle); si no, caen al aggregate (ETAPA 1).
   */
  readonly readModel?: ReadModelsStore;
  /** Recibos durables de sincronización offline (reclamación por opId). */
  readonly syncReceipts?: SyncReceiptStore;
  /** Consola técnica (lectura del outbox del Kernel). */
  readonly consola?: ConsolaStore;
}

/** Tablas del módulo protegidas por RLS (para la consola técnica de admin). */
const TABLAS_RLS_MODULO: readonly string[] = [
  "prv_programas", "prv_programa_versiones", "prv_actividades", "prv_generaciones",
  "prv_generacion_materializaciones", "prv_historial", "prv_sync_receipts", "prv_eventos",
  "prv_recibos", "prv_secuencias", "prv_catalogos",
  "prv_programas_read", "prv_programa_versiones_read", "prv_actividades_read",
  "prv_generaciones_read", "prv_programaciones_read", "prv_historial_read",
];

/* ------------------------------- Gobierno -------------------------------- */

function exigirWorkflow(adapters: ModuleAdapters, proceso: ProcesoWorkflow): Result<WorkflowPort, KernelError> {
  if (!adapters.workflow) {
    return fail(
      KernelErrors.conflict(
        `El proceso gobernado "${proceso}" requiere un adaptador de Workflow Engine aprobado; el módulo no está configurado con uno. Operación rechazada sin efectos.`,
        { proceso, motivo: "workflow-no-configurado" },
      ),
    );
  }
  return ok(adapters.workflow);
}

/* ----------------------------- Configuración ----------------------------- */

async function cfg(deps: ServiceDeps, tenant: string, clave: string, def: string): Promise<string> {
  const v = await deps.tenantConfig.get(tenant, `${MODULO}.${clave}`);
  return v.ok && v.value !== "" ? v.value : def;
}

async function configCodigo(deps: ServiceDeps, tenant: string, serie: SerieDocumento): Promise<ConfigCodigo> {
  const base = CONFIG_CODIGO_DEFAULT[serie];
  return {
    prefijo: await cfg(deps, tenant, `codigo-${serie}-prefijo`, base.prefijo),
    separador: await cfg(deps, tenant, "codigo-separador", base.separador),
    padding: Number(await cfg(deps, tenant, "codigo-padding", String(base.padding))),
    serie: base.serie,
  };
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
    const entityRef = String(p["entityRef"] ?? (p["id"] ? `preventivo:${String(p["id"])}` : ""));
    if (!entityRef) return ok(undefined);
    const resumen = String(p["codigo"] ?? p["nombre"] ?? p["accion"] ?? event.type);
    const occurredAt = String(p["actualizadoAt"] ?? p["ocurridoEn"] ?? new Date().toISOString());
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
      estado: p["estado"] != null ? String(p["estado"]) : null,
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

/* -------------------------- Validación de catálogos ---------------------- */

async function validarClasificacion(
  adapters: ModuleAdapters,
  tenant: string,
  claves: Partial<Record<NombreCatalogo, string | null | undefined>>,
  obligatorios: readonly NombreCatalogo[],
): Promise<Result<void, KernelError>> {
  for (const [catalogo, valor] of Object.entries(claves) as [NombreCatalogo, string | null | undefined][]) {
    const r = await adapters.catalogos.validarReferencia(tenant, catalogo, valor, obligatorios.includes(catalogo));
    if (!r.ok) return r;
  }
  return ok(undefined);
}

async function registrarHistorial(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenant: string,
  entityRef: string,
  hito: string,
  version: number,
  detalle: Record<string, unknown>,
  ahora: string,
  actorId: string,
): Promise<Result<void, KernelError>> {
  const h = crearHistorial({ id: `${tenant}::${crypto.randomUUID()}`, entityRef, hito, version, detalle, ocurridoEn: ahora, actorId });
  if (!h.ok) return h;
  const saved = await adapters.historial.append(uow, h.value);
  if (!saved.ok) return saved;
  return emitirEvento(adapters, ctx, uow, tenant, {
    tipo: HISTORIAL_REGISTRADO,
    payload: {
      tenantId: tenant, id: h.value.id, entityRef, hito, version, detalle,
      actorId, ocurridoEn: ahora, actualizadoAt: ahora, eventoTipo: HISTORIAL_REGISTRADO,
    },
  });
}

/* ------------------------------ Esquemas VO ------------------------------ */

const referenciaPlanSchema = z.object({ planId: z.string().min(1), version: z.number().int().positive(), etiqueta: z.string().min(1).optional() });
const vigenciaSchema = z.object({ desde: z.string().min(1), hasta: z.string().min(1).nullable().optional() });
const slaSchema = z.object({
  clasificacion: z.string().min(1),
  ventanaRespuestaHoras: z.number().nonnegative(),
  ventanaCumplimientoHoras: z.number().positive(),
  toleranciaHoras: z.number().nonnegative().optional(),
});
const checklistSchema = z.object({ plantillaId: z.string().min(1), version: z.number().int().positive(), obligatorio: z.boolean().optional() });
const dineroSchema = z.object({ moneda: z.string().min(1), monto: z.number().nonnegative() });
const referenciaExternaSchema = z.object({ tipo: z.string().min(1), id: z.string().min(1), etiqueta: z.string().min(1).optional() });
const recursosSchema = z.object({
  personal: z.array(z.object({ rol: z.string().min(1), cantidad: z.number().int().positive(), horasPorPersona: z.number().positive(), costoHora: dineroSchema.nullable().optional() })).optional(),
  herramientas: z.array(z.object({ tipo: z.string().min(1), descripcion: z.string().min(1), cantidad: z.number().int().positive().optional(), referencia: referenciaExternaSchema.nullable().optional(), costoEstimado: dineroSchema.nullable().optional() })).optional(),
  repuestos: z.array(z.object({ referencia: referenciaExternaSchema, cantidad: z.number().positive(), unidad: z.string().min(1), costoUnitario: dineroSchema.nullable().optional() })).optional(),
});
const tiempoSchema = z.object({ valor: z.number().nonnegative(), unidad: z.string().min(1) });

/* ------------------------------ Descriptor ------------------------------- */

export function preventivoModule(adapters: ModuleAdapters): PlatformServiceDefinition {
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
      "Enterprise Preventive Maintenance — dominio (DGP-014 Etapa 1): programas preventivos que COMPONEN planes publicados (DGP-012) por referencia, jerarquía sin ciclos, actividades con dependencias (DAG), checklist por plantilla de Dynamic Forms, recursos/costos/SLA deterministas, motor de programación puro (reutiliza el motor de frecuencias de Planes), reprogramaciones/suspensiones/exclusiones, y generación idempotente de órdenes con guard anti-duplicado y materialización fail-safe. Ciclo de vida gobernado por el Workflow Engine.",
    capabilities: [
      { name: "gestionar-programas", permissions: [`${MODULO}.read`, `${MODULO}.write`], description: "Alta/edición de programas y actividades preventivas" },
      { name: "gobernar-programas", permissions: [`${MODULO}.read`, `${MODULO}.govern`], description: "Enviar a revisión/publicar/suspender/reanudar/archivar/versionar (workflow)" },
      { name: "programar-preventivo", permissions: [`${MODULO}.read`, `${MODULO}.schedule`], description: "Cálculo de programación y generación de órdenes" },
      { name: "administrar-preventivo", permissions: [`${MODULO}.admin`], description: "Catálogos configurables del módulo" },
    ],
    permissions: [`${MODULO}.read`, `${MODULO}.write`, `${MODULO}.govern`, `${MODULO}.schedule`, `${MODULO}.admin`],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [
      "programa-preventivo",
      "programa-preventivo-version",
      "actividad-preventiva",
      "generacion-preventiva",
      "historial-preventivo",
      "secuencia",
      "recibo-op",
      ...recordTypesCatalogos(),
    ],
    configDefaults: {
      "max-longitud-nombre": "200",
      "codigo-programa-prefijo": CONFIG_CODIGO_DEFAULT.programa.prefijo,
      "codigo-generacion-prefijo": CONFIG_CODIGO_DEFAULT.generacion.prefijo,
      "codigo-separador": "-",
      "codigo-padding": "5",
    },
    commands: [
      /* ---------------------------- catálogo upsert ---------------------- */
      (deps) => ({
        name: `${MODULO}.catalogo-upsert`,
        inputSchema: z.object({ catalogo: catalogoEnum, clave: z.string().min(1), etiqueta: z.string().min(1), posicion: z.number().int().optional(), padre: z.string().nullable().optional() }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const r = await adapters.catalogos.upsert(uow, tenant.value, input.catalogo as NombreCatalogo, { clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre ?? null }, ctx.principal.id);
          if (!r.ok) return r;
          return ok({ catalogo: input.catalogo, clave: input.clave });
        },
      }),
      /* -------------------------- catálogo habilitar --------------------- */
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
      /* ----------------------------- crear programa ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-programa`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            nombre: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            tipo: z.string().min(1),
            clasificacion: z.string().min(1).nullable().optional(),
            padreId: z.string().min(1).nullable().optional(),
            planes: z.array(referenciaPlanSchema).default([]),
            activos: z.array(z.string().min(1)).default([]),
            vigencia: vigenciaSchema,
            sla: slaSchema.nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-programa`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_PROGRAMA, {});
            if (!pol.ok) return pol;

            const val = await validarClasificacion(
              adapters, tenant.value,
              { "tipos-programa": input.tipo, "clasificaciones-programa": input.clasificacion },
              ["tipos-programa"],
            );
            if (!val.ok) return val;

            // VOs.
            const planes = [];
            for (const r of input.planes) { const rp = crearReferenciaPlan(r); if (!rp.ok) return rp; planes.push(rp.value); }
            const vig = crearVigencia(input.vigencia);
            if (!vig.ok) return vig;
            let sla = null;
            if (input.sla) { const rs = crearSla(input.sla); if (!rs.ok) return rs; sla = rs.value; }

            const id = input.id ?? crypto.randomUUID();

            // Jerarquía sin ciclos (usando el mapa de padres del tenant).
            const mapa = await adapters.programas.mapaPadres(tenant.value);
            if (!mapa.ok) return mapa;
            const ciclo = detectarCicloJerarquia(id, input.padreId ?? null, mapa.value);
            if (!ciclo.ok) return ciclo;

            // Composición fail-safe: activos y planes publicados.
            if (input.activos.length > 0) {
              if (!adapters.activos) return fail(KernelErrors.conflict("La validación de activos requiere un ActivosPort configurado", { motivo: "activos-no-configurado" }));
              const ex = await adapters.activos.existen(tenant.value, input.activos);
              if (!ex.ok) return ex;
              if (ex.value.inexistentes.length > 0) return fail(KernelErrors.validation(`Activos inexistentes: ${ex.value.inexistentes.join(", ")}`));
            }
            if (planes.length > 0) {
              if (!adapters.planes) return fail(KernelErrors.conflict("La verificación de planes requiere un PlanesPort configurado", { motivo: "planes-no-configurado" }));
              const pub = await adapters.planes.verificarPublicados(tenant.value, planes.map((p) => ({ planId: p.planId, version: p.version })));
              if (!pub.ok) return pub;
              if (pub.value.noPublicados.length > 0) return fail(KernelErrors.validation(`Planes no publicados referenciados: ${pub.value.noPublicados.map((p) => `${p.planId}:v${p.version}`).join(", ")}`));
            }

            // Gobierno: exige Workflow aprobado ANTES de cualquier efecto.
            const wf = exigirWorkflow(adapters, "programa");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "programa", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "programa", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const ahora = new Date().toISOString();
            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value, "programa"), ctx.principal.id);
            if (!codigo.ok) return codigo;

            const cambio = crearPrograma({
              id, tenantId: tenant.value, codigo: codigo.value.valor, nombre: input.nombre, descripcion: input.descripcion ?? null,
              tipo: input.tipo, clasificacion: input.clasificacion ?? null, padreId: input.padreId ?? null, planes, activos: input.activos,
              vigencia: vig.value, sla, workflow: { ...ref, instanciaId: inicio.value.instanciaId },
              estadoInicial: inicio.value.estado.estado as EstadoPrograma, actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.programas.insert(uow, cambio.value.programa);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `programa-preventivo:${id}`, "creado", saved.value.version, { codigo: codigo.value.valor }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-programa", id, { codigo: codigo.value.valor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, codigo: codigo.value.valor, estado: saved.value.estado, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-programa`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- editar programa ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar-programa`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().nullable().optional(),
            clasificacion: z.string().min(1).nullable().optional(),
            planes: z.array(referenciaPlanSchema).optional(),
            activos: z.array(z.string().min(1)).optional(),
            vigencia: vigenciaSchema.optional(),
            sla: slaSchema.nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.programas.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("programa-preventivo", input.id));
            const programa = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR_PROGRAMA, { estado: programa.estado });
            if (!pol.ok) return pol;

            const cambios: Record<string, unknown> = {};
            if (input.nombre !== undefined) cambios.nombre = input.nombre;
            if (input.descripcion !== undefined) cambios.descripcion = input.descripcion;
            if (input.clasificacion !== undefined) cambios.clasificacion = input.clasificacion;
            if (input.vigencia !== undefined) { const v = crearVigencia(input.vigencia); if (!v.ok) return v; cambios.vigencia = v.value; }
            if (input.sla !== undefined) { if (input.sla === null) cambios.sla = null; else { const s = crearSla(input.sla); if (!s.ok) return s; cambios.sla = s.value; } }
            if (input.planes !== undefined) { const arr = []; for (const r of input.planes) { const rp = crearReferenciaPlan(r); if (!rp.ok) return rp; arr.push(rp.value); } cambios.planes = arr; }
            if (input.activos !== undefined) cambios.activos = input.activos;

            const ahora = new Date().toISOString();
            const cambio = editarPrograma(programa, cambios, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.programas.update(uow, cambio.value.programa, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "editar-programa", input.id, {});
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      /* ----------------------- transicionar programa --------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar-programa`,
          inputSchema: z.object({
            id: z.string().min(1),
            accion: z.enum(ACCIONES_PROGRAMA),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.transicionar-programa`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.programas.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("programa-preventivo", input.id));
            const programa = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR_PROGRAMA, { estado: programa.estado });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "programa");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, programa.workflow, input.accion, ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = aplicarAccionPrograma(programa, input.accion as AccionPrograma, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.programas.update(uow, cambio.value.programa, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `programa-preventivo:${input.id}`, input.accion, saved.value.version, { accion: input.accion }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "transicionar-programa", input.id, { accion: input.accion });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, estado: saved.value.estado, accion: input.accion, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.transicionar-programa`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- versionar programa --------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.versionar-programa`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().nullable().optional(),
            planes: z.array(referenciaPlanSchema).optional(),
            activos: z.array(z.string().min(1)).optional(),
            vigencia: vigenciaSchema.optional(),
            sla: slaSchema.nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.programas.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("programa-preventivo", input.id));
            const programa = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_VERSIONAR_PROGRAMA, { estado: programa.estado });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "programa");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "programa", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "programa", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const cambios: Record<string, unknown> = {};
            if (input.nombre !== undefined) cambios.nombre = input.nombre;
            if (input.descripcion !== undefined) cambios.descripcion = input.descripcion;
            if (input.vigencia !== undefined) { const v = crearVigencia(input.vigencia); if (!v.ok) return v; cambios.vigencia = v.value; }
            if (input.sla !== undefined) { if (input.sla === null) cambios.sla = null; else { const s = crearSla(input.sla); if (!s.ok) return s; cambios.sla = s.value; } }
            if (input.planes !== undefined) { const arr = []; for (const r of input.planes) { const rp = crearReferenciaPlan(r); if (!rp.ok) return rp; arr.push(rp.value); } cambios.planes = arr; }
            if (input.activos !== undefined) cambios.activos = input.activos;

            const ahora = new Date().toISOString();
            // Conserva N (histórico) y crea N+1 en preparación.
            const guardado = await adapters.versiones.guardar(uow, programa);
            if (!guardado.ok) return guardado;
            const cambio = versionarPrograma(programa, cambios, { ...ref, instanciaId: inicio.value.instanciaId }, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.programas.update(uow, cambio.value.programa, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "versionar-programa", input.id, { versionPrograma: saved.value.versionPrograma });
            if (!audited.ok) return audited;
            // Enriquece el evento con el snapshot INMUTABLE de la versión anterior
            // (N), autosuficiente para proyectar `prv_programa_versiones_read`.
            {
              const evento = {
                tipo: cambio.value.evento.tipo,
                payload: { ...cambio.value.evento.payload, versionAnterior: programa.versionPrograma, snapshotAnterior: programa },
              };
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, evento); if (!_e.ok) return _e;
            }
            return ok({ id: input.id, versionPrograma: saved.value.versionPrograma, estado: saved.value.estado, version: saved.value.version });
          },
        };
      },
      /* -------------------------- revertir programa ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.revertir-programa`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            haciaVersion: z.number().int().positive(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.programas.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("programa-preventivo", input.id));
            const programa = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_VERSIONAR_PROGRAMA, { estado: programa.estado });
            if (!pol.ok) return pol;

            const objetivo = await adapters.versiones.buscarVersion(tenant.value, input.id, input.haciaVersion);
            if (!objetivo.ok) return objetivo;
            if (!objetivo.value) return fail(KernelErrors.notFound("programa-preventivo-version", `${input.id}:v${input.haciaVersion}`));

            const wf = exigirWorkflow(adapters, "programa");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "programa", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "programa", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const ahora = new Date().toISOString();
            const guardado = await adapters.versiones.guardar(uow, programa);
            if (!guardado.ok) return guardado;
            const cambio = revertirPrograma(programa, objetivo.value, { ...ref, instanciaId: inicio.value.instanciaId }, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.programas.update(uow, cambio.value.programa, input.expectedVersion);
            if (!saved.ok) return saved;
            {
              const evento = {
                tipo: cambio.value.evento.tipo,
                payload: { ...cambio.value.evento.payload, versionAnterior: programa.versionPrograma, snapshotAnterior: programa },
              };
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, evento); if (!_e.ok) return _e;
            }
            return ok({ id: input.id, versionPrograma: saved.value.versionPrograma, version: saved.value.version });
          },
        };
      },
      /* -------------------------- definir actividad ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.definir-actividad`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            programaId: z.string().min(1),
            nombre: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            orden: z.number().int().nonnegative(),
            dependencias: z.array(z.string().min(1)).optional(),
            checklist: checklistSchema,
            recursos: recursosSchema.optional(),
            tiempoEstimado: tiempoSchema,
            moneda: z.string().min(1),
            sla: slaSchema.nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.definir-actividad`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const prog = await adapters.programas.findById(tenant.value, input.programaId);
            if (!prog.ok) return prog;
            if (!prog.value) return fail(KernelErrors.notFound("programa-preventivo", input.programaId));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_DEFINIR_ACTIVIDAD, { estadoPrograma: prog.value.estado });
            if (!pol.ok) return pol;

            const val = await validarClasificacion(adapters, tenant.value, { "monedas": input.moneda }, ["monedas"]);
            if (!val.ok) return val;

            const chk = crearChecklist(input.checklist);
            if (!chk.ok) return chk;
            const rec = crearRecursosRequeridos(input.recursos ?? {});
            if (!rec.ok) return rec;
            const tiempo = crearTiempoEstimado(input.tiempoEstimado);
            if (!tiempo.ok) return tiempo;
            let sla = null;
            if (input.sla) { const rs = crearSla(input.sla); if (!rs.ok) return rs; sla = rs.value; }

            // Dependencias deben existir en el mismo programa.
            const existentes = await adapters.actividades.listPorPrograma(tenant.value, input.programaId);
            if (!existentes.ok) return existentes;
            const idsExistentes = new Set(existentes.value.map((a) => a.id));
            for (const d of input.dependencias ?? []) {
              if (!idsExistentes.has(d)) return fail(KernelErrors.validation(`La dependencia "${d}" no existe en el programa`));
            }

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date().toISOString();
            const cambio = crearActividad({
              id, tenantId: tenant.value, programaId: input.programaId, nombre: input.nombre, descripcion: input.descripcion ?? null,
              orden: input.orden, dependencias: input.dependencias ?? [], checklist: chk.value, recursos: rec.value,
              tiempoEstimado: tiempo.value, moneda: input.moneda, sla, actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.actividades.insert(uow, cambio.value.actividad);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "definir-actividad", id, { programaId: input.programaId });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, programaId: input.programaId, version: saved.value.version };
            const rec2 = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.definir-actividad`, input.opId, resultado, ctx.principal.id);
            if (!rec2.ok) return rec2;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------- generar (orquestador) ---------------------- */
      // Orquestador IDEMPOTENTE: guard anti-duplicado (programa+actividad+activo
      // +ventana), Result verificado ANTES de todo efecto, materializador
      // FAIL-SAFE, vínculo atómico generación→OT. Nunca comandos anidados.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.generar`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            programaId: z.string().min(1),
            actividadId: z.string().min(1),
            activoId: z.string().min(1),
            ventana: z.string().min(1),
            origen: z.string().min(1),
            fechaObjetivo: z.string().min(1),
            corresponde: z.boolean().default(true),
          }),
          authorization: { permissions: [`${MODULO}.schedule`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.generar`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const prog = await adapters.programas.findById(tenant.value, input.programaId);
            if (!prog.ok) return prog;
            if (!prog.value) return fail(KernelErrors.notFound("programa-preventivo", input.programaId));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_GENERAR, { estadoPrograma: prog.value.estado });
            if (!pol.ok) return pol;

            const val = await validarClasificacion(adapters, tenant.value, { "origenes-generacion": input.origen }, ["origenes-generacion"]);
            if (!val.ok) return val;

            const ocurrencia: OcurrenciaPreventiva = {
              programaId: input.programaId, actividadId: input.actividadId, activoId: input.activoId, ventana: input.ventana,
            };
            // Guard anti-duplicado por claves ya generadas.
            const previas = await adapters.generaciones.listPorPrograma(tenant.value, input.programaId);
            if (!previas.ok) return previas;
            const set = new Set(previas.value.map((g) => g.claveDedup));
            const decision = decidirGeneracionPreventiva({ ocurrencia, fechaObjetivo: input.fechaObjetivo, corresponde: input.corresponde, generadasPrevias: set });
            if (!decision.corresponde) {
              const existente = await adapters.generaciones.buscarPorClave(tenant.value, decision.claveDedup);
              const resultadoDup = { claveDedup: decision.claveDedup, corresponde: false, generacionId: existente.ok && existente.value ? existente.value.id : null };
              return ok({ ...resultadoDup, idempotente: true });
            }

            // Reserva atómica del guard durable.
            const id = input.id ?? crypto.randomUUID();
            const reservado = await adapters.dedup.reservar(uow, tenant.value, decision.claveDedup, id);
            if (!reservado.ok) return reservado;
            if (!reservado.value) {
              const existente = await adapters.generaciones.buscarPorClave(tenant.value, decision.claveDedup);
              return ok({ claveDedup: decision.claveDedup, corresponde: false, generacionId: existente.ok && existente.value ? existente.value.id : null, idempotente: true });
            }

            const ahora = new Date().toISOString();
            const cambio = crearGeneracion({ id, tenantId: tenant.value, ocurrencia, origen: input.origen, fechaObjetivo: input.fechaObjetivo, generadaPor: ctx.principal.id, ahora });
            if (!cambio.ok) return cambio;
            const saved = await adapters.generaciones.insert(uow, cambio.value.generacion);
            if (!saved.ok) return saved;

            // Materialización FAIL-SAFE: sin materializador, la generación queda
            // PENDIENTE (nunca crea OT por vías no oficiales). Con materializador,
            // crea la OT en su propio runtime y vincula atómicamente.
            let ordenTrabajoId: string | null = null;
            if (adapters.materializador) {
              const act = await adapters.actividades.findById(tenant.value, input.actividadId);
              if (!act.ok) return act;
              const checklist = act.ok && act.value ? { plantillaId: act.value.checklist.plantillaId, version: act.value.checklist.version } : null;
              const mat = await adapters.materializador.crearOrden(tenant.value, ctx.principal.id, {
                opId: decision.claveDedup, generacionId: id, programaId: input.programaId, actividadId: input.actividadId,
                activoId: input.activoId, fechaObjetivo: input.fechaObjetivo, checklist,
              });
              if (!mat.ok) return mat;
              ordenTrabajoId = mat.value.ordenTrabajoId;
              const vinc = await adapters.dedup.vincular(uow, tenant.value, decision.claveDedup, ordenTrabajoId);
              if (!vinc.ok) return vinc;
              const matCambio = materializarGeneracion(saved.value, ordenTrabajoId, ctx.principal.id, ahora);
              if (!matCambio.ok) return matCambio;
              const savedMat = await adapters.generaciones.update(uow, matCambio.value.generacion, saved.value.version);
              if (!savedMat.ok) return savedMat;
              { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, matCambio.value.evento); if (!_e.ok) return _e; }
            }

            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "generar", id, { claveDedup: decision.claveDedup });
            if (!audited.ok) return audited;

            const resultado = { id, claveDedup: decision.claveDedup, corresponde: true, ordenTrabajoId, estado: ordenTrabajoId ? "materializada" : "pendiente" };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.generar`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- reprogramar --------------------------- */
      // Registra una REPROGRAMACIÓN (hecho append-only) validando el motivo con
      // el catálogo `motivos-reprogramacion` y emitiendo PROGRAMACION_REPROGRAMADA
      // con payload autosuficiente (proyectado a `prv_programaciones_read`).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reprogramar`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            programaId: z.string().min(1),
            actividadId: z.string().min(1).nullable().optional(),
            activoId: z.string().min(1).nullable().optional(),
            fechaOriginal: z.string().min(1),
            fechaNueva: z.string().min(1),
            motivo: z.string().min(1),
          }),
          authorization: { permissions: [`${MODULO}.schedule`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.reprogramar`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const prog = await adapters.programas.findById(tenant.value, input.programaId);
            if (!prog.ok) return prog;
            if (!prog.value) return fail(KernelErrors.notFound("programa-preventivo", input.programaId));

            const val = await validarClasificacion(adapters, tenant.value, { "motivos-reprogramacion": input.motivo }, ["motivos-reprogramacion"]);
            if (!val.ok) return val;

            const ahora = new Date().toISOString();
            const repro = crearReprogramacion({ fechaOriginal: input.fechaOriginal, fechaNueva: input.fechaNueva, motivo: input.motivo, registradaEn: ahora, registradaPor: ctx.principal.id });
            if (!repro.ok) return repro;

            const id = input.id ?? crypto.randomUUID();
            const payload = {
              tenantId: tenant.value, id, tipo: "reprogramacion", entityRef: `programa-preventivo:${input.programaId}`,
              programaId: input.programaId, actividadId: input.actividadId ?? null, activoId: input.activoId ?? null,
              ventana: null, motivo: input.motivo, desde: input.fechaOriginal, hasta: input.fechaNueva,
              fechaOriginal: input.fechaOriginal, fechaNueva: input.fechaNueva,
              actorId: ctx.principal.id, ocurridoEn: ahora, actualizadoAt: ahora, eventoTipo: PROGRAMACION_REPROGRAMADA,
            };
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, { tipo: PROGRAMACION_REPROGRAMADA, payload }); if (!_e.ok) return _e; }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reprogramar", input.programaId, { motivo: input.motivo });
            if (!audited.ok) return audited;
            const resultado = { id, programaId: input.programaId, tipo: "reprogramacion", motivo: input.motivo };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.reprogramar`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- suspender ---------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.suspender`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            programaId: z.string().min(1),
            ambito: z.enum([...AMBITOS_SUSPENSION] as [string, ...string[]]),
            sujetoId: z.string().min(1),
            actividadId: z.string().min(1).nullable().optional(),
            activoId: z.string().min(1).nullable().optional(),
            motivo: z.string().min(1),
            desde: z.string().min(1),
            hasta: z.string().min(1).nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.schedule`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.suspender`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const prog = await adapters.programas.findById(tenant.value, input.programaId);
            if (!prog.ok) return prog;
            if (!prog.value) return fail(KernelErrors.notFound("programa-preventivo", input.programaId));

            const val = await validarClasificacion(adapters, tenant.value, { "motivos-suspension": input.motivo }, ["motivos-suspension"]);
            if (!val.ok) return val;

            const susp = crearSuspension({ ambito: input.ambito as AmbitoSuspension, sujetoId: input.sujetoId, motivo: input.motivo, desde: input.desde, hasta: input.hasta ?? null });
            if (!susp.ok) return susp;

            const ahora = new Date().toISOString();
            const id = input.id ?? crypto.randomUUID();
            const payload = {
              tenantId: tenant.value, id, tipo: "suspension", entityRef: `programa-preventivo:${input.programaId}`,
              programaId: input.programaId, actividadId: input.actividadId ?? null, activoId: input.activoId ?? null,
              ventana: null, ambito: input.ambito, sujetoId: input.sujetoId, motivo: input.motivo,
              desde: input.desde, hasta: input.hasta ?? null,
              actorId: ctx.principal.id, ocurridoEn: ahora, actualizadoAt: ahora, eventoTipo: PROGRAMACION_SUSPENDIDA,
            };
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, { tipo: PROGRAMACION_SUSPENDIDA, payload }); if (!_e.ok) return _e; }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "suspender", input.programaId, { ambito: input.ambito, motivo: input.motivo });
            if (!audited.ok) return audited;
            const resultado = { id, programaId: input.programaId, tipo: "suspension", ambito: input.ambito, motivo: input.motivo };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.suspender`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ----------------------------- excluir ----------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.excluir`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            programaId: z.string().min(1),
            desde: z.string().min(1),
            hasta: z.string().min(1),
            activos: z.array(z.string().min(1)).default([]),
            motivo: z.string().min(1),
          }),
          authorization: { permissions: [`${MODULO}.schedule`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.excluir`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const prog = await adapters.programas.findById(tenant.value, input.programaId);
            if (!prog.ok) return prog;
            if (!prog.value) return fail(KernelErrors.notFound("programa-preventivo", input.programaId));

            const val = await validarClasificacion(adapters, tenant.value, { "motivos-exclusion": input.motivo }, ["motivos-exclusion"]);
            if (!val.ok) return val;

            const excl = crearExclusion({ desde: input.desde, hasta: input.hasta, activos: input.activos, motivo: input.motivo });
            if (!excl.ok) return excl;

            const ahora = new Date().toISOString();
            const id = input.id ?? crypto.randomUUID();
            const payload = {
              tenantId: tenant.value, id, tipo: "exclusion", entityRef: `programa-preventivo:${input.programaId}`,
              programaId: input.programaId, actividadId: null, activoId: input.activos.length === 1 ? input.activos[0] : null,
              ventana: null, motivo: input.motivo, desde: input.desde, hasta: input.hasta, activos: [...input.activos],
              actorId: ctx.principal.id, ocurridoEn: ahora, actualizadoAt: ahora, eventoTipo: PROGRAMACION_EXCLUIDA,
            };
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, { tipo: PROGRAMACION_EXCLUIDA, payload }); if (!_e.ok) return _e; }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "excluir", input.programaId, { motivo: input.motivo });
            if (!audited.ok) return audited;
            const resultado = { id, programaId: input.programaId, tipo: "exclusion", motivo: input.motivo };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.excluir`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- reproyectar --------------------------- */
      // REPROYECCIÓN por REPLAY: reconstruye los read models desde la bitácora
      // durable (`prv_eventos`) — equivalencia con la proyección en vivo. Limpia
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
              const ev = { id: e.eventId, type: e.tipo, payload: e.payload };
              const r = await aplicarEventoAggregate({ readModel: adapters.readModel }, uow, ev);
              if (!r.ok) return r;
              aplicados += 1;
            }
            return ok({ reproyectados: aplicados, idempotente: false });
          },
        };
      },
    ],
    queries: [
      (deps) => ({
        name: `${MODULO}.programa`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // DETALLE servido SIEMPRE desde read model (lección 009.2) cuando está
          // configurado; jamás toca la tabla de escritura.
          if (adapters.readModel) {
            const rm = await adapters.readModel.programaGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("programa-preventivo", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.programas.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("programa-preventivo", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.programas`,
        inputSchema: z.object({ estado: z.string().optional(), tipo: z.string().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.programaList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.programas.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.actividades`,
        inputSchema: z.object({ programaId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.actividadesPorPrograma(tenant.value, input.programaId);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.actividades.listPorPrograma(tenant.value, input.programaId);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.versiones`,
        inputSchema: z.object({ programaId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.versionesPorPrograma(tenant.value, input.programaId);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.versiones.listarVersiones(tenant.value, input.programaId);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.generaciones`,
        inputSchema: z.object({ programaId: z.string().min(1), estado: z.string().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.generacionesPorPrograma(tenant.value, input.programaId, { estado: input.estado, limit: input.limit });
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.generaciones.listPorPrograma(tenant.value, input.programaId);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      // CALENDARIO / PROGRAMACIONES: reprogramaciones/suspensiones/exclusiones
      // proyectadas append-only (sólo disponible con read models configurados).
      (deps) => ({
        name: `${MODULO}.programaciones`,
        inputSchema: z.object({ programaId: z.string().min(1), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!adapters.readModel) {
            return fail(KernelErrors.conflict("El runtime no tiene read models configurados; el calendario de programaciones no está disponible.", { motivo: "read-model-no-configurado" }));
          }
          const rm = await adapters.readModel.programacionesPorPrograma(tenant.value, input.programaId, input.limit);
          if (!rm.ok) return rm;
          return ok(rm.value.map((x) => x.datos) as unknown as Record<string, unknown>[]);
        },
      }),
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
      // CONSOLA TÉCNICA (admin): resumen del outbox propio del módulo + tablas RLS.
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({ limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!adapters.consola) {
            return fail(KernelErrors.conflict("El runtime no tiene consola técnica configurada.", { motivo: "consola-no-configurada" }));
          }
          const r = await adapters.consola.outboxDelModulo(tenant.value, input.limit);
          if (!r.ok) return r;
          return ok({ ...r.value, tablasRLS: TABLAS_RLS_MODULO } as unknown as Record<string, unknown>);
        },
      }),
    ],
    eventHandlers: [
      // Shared Timeline CANÓNICO: cada evento del módulo se registra vía COMANDO
      // `platform.timeline.record`, idempotente por entryId=event.id.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `timeline:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          registrarEnTimeline()(deps, { ...event, type: eventType }),
      })),
      // PROYECCIÓN CQRS (payload-only): cada evento actualiza los read models
      // idempotentemente (por last_event_id/version). Sólo si hay read model.
      ...(adapters.readModel
        ? EVENTOS_MODULO.map((eventType) => {
            const proy = handlerProyeccion({ readModel: adapters.readModel! } satisfies ProyeccionAdapters, false);
            return {
              eventType,
              handlerName: `proyeccion:${eventType}`,
              handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
                proy(deps)(event, eventType),
            };
          })
        : []),
    ],
    healthCheck: () => async () => ({ healthy: true, detail: `${MODULO} operativo` }),
  };
}

/* Referencias exportadas para tests de forma explícita. */
export {
  ACCIONES_NEUTRAS,
  ACTIVIDAD_CREADA,
  GENERACION_DECIDIDA,
  GENERACION_MATERIALIZADA,
  PROGRAMA_CREADO,
  PROGRAMA_REVERTIDO,
  PROGRAMA_TRANSICIONADO,
  PROGRAMA_VERSIONADO,
};
