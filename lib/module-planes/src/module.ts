/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Capa de aplicación + descriptor.
 *
 * ETAPA 1 (dominio + servicio): se registra por el ÚNICO mecanismo permitido
 * (extraServices de createPlatformRuntime). Persistencia en FAKES en memoria; los
 * adaptadores reales (PostgreSQL / read models CQRS / OpenAPI / UI) llegan en la
 * etapa 2. TODO plan se gobierna por el Workflow Engine: sin un `WorkflowPort`
 * aprobado, los comandos gobernados (publicar, transicionar, archivar) FALLAN de
 * forma segura (KRN-CFL-001) y NO alteran el plan — nunca auto-aprueban.
 *
 * REGLA DE ORO (lección 009.3): la CREACIÓN real de la OT NO se hace aquí (nunca
 * comandos anidados). `evaluar-generacion` DECIDE y marca la ocurrencia con clave
 * de dedup determinista; el comando orquestador idempotente llega en la etapa 2.
 */
import { z } from "zod";
import {
  createDomainEvent,
  createExecutionContext,
  fail,
  KernelErrors,
  KernelTokens,
  ok,
  SYSTEM_PRINCIPAL,
  type ExecutionContext,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import {
  audit,
  tenantOf,
  type PlatformServiceDefinition,
  type ServiceDeps,
} from "@workspace/platform";
import { MODULO } from "./module-name";
import { CATALOGOS, recordTypesCatalogos, type NombreCatalogo } from "./domain/catalogos";
const catalogoEnum = z.enum([...CATALOGOS] as [string, ...string[]]);
import {
  CALENDARIO_CREADO,
  EVENTOS_MODULO,
  HISTORIAL_REGISTRADO,
  ORDEN_GENERADA,
  ORDEN_MATERIALIZADA,
} from "./domain/events";
import {
  aplicarAccionPlan,
  compararVersiones,
  crearPlan,
  editarPlan,
  publicarPlan,
  rollbackPlan,
  versionActiva,
  versionBorrador,
  type PlanMantenimiento,
  type ProgramaMantenimiento,
} from "./domain/plan";
import { crearCalendarioOperacional, proximaFechaHabil } from "./domain/calendario";
import { crearRutina, type Rutina } from "./domain/rutina";
import { crearFrecuencia, crearAlcanceActivos, type AlcanceActivos, type Frecuencia } from "./domain/value-objects";
import {
  ACCIONES_SUSPENSION,
  crearHistorialPlan,
  crearSuspensionPlan,
} from "./domain/suspension";
import {
  ORIGENES_GENERACION,
  crearGeneracionOrden,
  decidirGeneracion,
  type OrigenGeneracion,
} from "./domain/generacion";
import type { AnclajeFrecuencia, ContextoEvaluacion } from "./domain/frecuencia-engine";
import {
  policiesDelModulo,
  POLICY_PUEDE_ARCHIVAR_PLAN,
  POLICY_PUEDE_CREAR_PLAN,
  POLICY_PUEDE_EDITAR_PLAN,
  POLICY_PUEDE_GENERAR_ORDEN,
  POLICY_PUEDE_PUBLICAR_PLAN,
  POLICY_PUEDE_TRANSICIONAR_PLAN,
} from "./domain/policies";
import {
  CONFIG_CODIGO_DEFAULT,
  type CalendarioRepository,
  type CatalogoPort,
  type ConfigCodigo,
  type ConsecutivoPort,
  type EventLogStore,
  type GeneracionRepository,
  type HistorialRepository,
  type MaterializadorOrdenes,
  type PlanRepository,
  type ReciboPort,
} from "./domain/ports";
import type { ProcesoWorkflow, ReferenciaWorkflow, WorkflowPort } from "./domain/workflow";
import type { ConsolaStore, ReadModelsStore, SyncReceiptStore } from "./infrastructure/operacional";
import {
  aplicarEventoAggregate,
  aplicarEventoOperacional,
  handlerProyeccion,
  type ProyeccionAdapters,
} from "./projection";

export { MODULO };

/* ------------------------------- Adaptadores ----------------------------- */

export interface ModuleAdapters {
  readonly planes: PlanRepository;
  readonly calendarios: CalendarioRepository;
  readonly generaciones: GeneracionRepository;
  readonly historial: HistorialRepository;
  readonly catalogos: CatalogoPort;
  readonly consecutivo: ConsecutivoPort;
  readonly recibos: ReciboPort;
  readonly eventLog: EventLogStore;
  /**
   * Read models CQRS. OPCIONAL: en ETAPA 1 (fakes puros) no se provee y las
   * consultas caen al repositorio aggregate. En runtime operacional (ETAPA 2)
   * se cablea y TODAS las consultas se sirven desde read models (incl. detalle).
   */
  readonly readModel?: ReadModelsStore;
  /** Recibos de sincronización durables (reclamación offline). Runtime op. */
  readonly syncReceipts?: SyncReceiptStore;
  /** Consola técnica del outbox del módulo. Runtime operacional. */
  readonly consola?: ConsolaStore;
  /**
   * Adaptador del Workflow Engine (contrato neutro). OPCIONAL en el tipo porque
   * el módulo puede montarse sin él, pero los comandos gobernados FALLAN de forma
   * segura si no está provisto — nunca auto-aprueban. La auto-aprobación es
   * EXCLUSIVA de pruebas.
   */
  readonly workflow?: WorkflowPort;
  /**
   * Materializador de Órdenes de Trabajo (colaborador cross-módulo). OPCIONAL:
   * sin él, el orquestador `generar-ordenes-preventivas` FALLA de forma segura
   * (KRN-CFL-001) — nunca crea OT por vías no oficiales. En runtime operacional
   * compone el comando OFICIAL `modulo.ordenes.crear`.
   */
  readonly materializador?: MaterializadorOrdenes;
}

/**
 * Exige un `WorkflowPort` aprobado para operar un proceso gobernado. Sin él, la
 * operación se rechaza de forma segura con error de configuración (KRN-CFL-001).
 */
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

/* ------------------------------ Configuración ---------------------------- */

async function cfg(deps: ServiceDeps, tenant: string, clave: string, def: string): Promise<string> {
  const v = await deps.tenantConfig.get(tenant, `${MODULO}.${clave}`);
  return v.ok && v.value !== "" ? v.value : def;
}

async function configCodigo(deps: ServiceDeps, tenant: string): Promise<ConfigCodigo> {
  return {
    prefijo: await cfg(deps, tenant, "codigo-prefijo", CONFIG_CODIGO_DEFAULT.prefijo),
    separador: await cfg(deps, tenant, "codigo-separador", CONFIG_CODIGO_DEFAULT.separador),
    padding: Number(await cfg(deps, tenant, "codigo-padding", String(CONFIG_CODIGO_DEFAULT.padding))),
    serie: await cfg(deps, tenant, "codigo-serie", CONFIG_CODIGO_DEFAULT.serie),
  };
}

/* --------------------------- Emisión de eventos -------------------------- */

/**
 * Emite un evento AUTOSUFICIENTE del módulo de forma DURABLE: lo persiste en la
 * bitácora de eventos (fuente de verdad del replay) y lo registra en el outbox
 * del Kernel con el MISMO id de dominio (transporte at-least-once hacia handlers
 * idempotentes). Ambas escrituras ocurren en la misma UoW ⇒ atomicidad.
 */
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

/**
 * Registra un evento del módulo en el SHARED TIMELINE canónico de plataforma
 * mediante el COMANDO `platform.timeline.record` (NUNCA escritura directa).
 * Idempotente por `entryId = event.id`.
 */
function registrarEnTimeline() {
  return async (
    deps: ServiceDeps,
    event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string },
  ): Promise<Result<void, KernelError>> => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    if (!tenantId) return ok(undefined);
    const entityRef = String(p["entityRef"] ?? (p["id"] ? `plan:${String(p["id"])}` : ""));
    if (!entityRef) return ok(undefined);
    const resumen = String(p["codigo"] ?? p["nombre"] ?? p["accion"] ?? event.type);
    const occurredAt = String(p["actualizadoAt"] ?? p["ocurridoAt"] ?? p["generadaEn"] ?? new Date().toISOString());
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
      entidadRelacionada: p["planId"] != null ? `plan-mantenimiento:${String(p["planId"])}` : null,
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
  planId: string,
  hito: string,
  version: number,
  detalle: Record<string, unknown>,
  ahora: string,
  actorId: string,
): Promise<Result<void, KernelError>> {
  const h = crearHistorialPlan({ id: `${tenant}::${crypto.randomUUID()}`, planId, hito, version, detalle, ocurridoEn: ahora, actorId });
  if (!h.ok) return h;
  const saved = await adapters.historial.append(uow, h.value);
  if (!saved.ok) return saved;
  // Evento AUTOSUFICIENTE para proyectar el hito al read model de historial y
  // reconstruirlo por replay (CQRS puro; la query no relee el aggregate).
  return emitirEvento(adapters, ctx, uow, tenant, {
    tipo: HISTORIAL_REGISTRADO,
    payload: {
      tenantId: tenant, id: h.value.id, planId, entityRef: `plan-mantenimiento:${planId}`,
      hito, version, detalle, actorId, ocurridoEn: ahora, eventoTipo: HISTORIAL_REGISTRADO,
    },
  });
}

/* -------------------------- Esquemas compartidos ------------------------- */

const reglaFrecuenciaSchema = z.object({
  tipo: z.string().min(1),
  cada: z.number().positive().optional(),
  unidad: z.string().min(1).nullable().optional(),
  evento: z.string().min(1).nullable().optional(),
});
const frecuenciaSchema = z.object({
  reglas: z.array(reglaFrecuenciaSchema).min(1),
  modo: z.string().min(1).optional(),
  toleranciaAntes: z.number().nonnegative().optional(),
  toleranciaDespues: z.number().nonnegative().optional(),
});
const alcanceSchema = z.object({
  activos: z.array(z.string().min(1)).optional(),
  categorias: z.array(z.string().min(1)).optional(),
  familias: z.array(z.string().min(1)).optional(),
  subfamilias: z.array(z.string().min(1)).optional(),
  empresas: z.array(z.string().min(1)).optional(),
  proyectos: z.array(z.string().min(1)).optional(),
  ubicaciones: z.array(z.string().min(1)).optional(),
  clases: z.array(z.string().min(1)).optional(),
});
const referenciaExternaSchema = z.object({ tipo: z.string().min(1), id: z.string().min(1), etiqueta: z.string().optional() });
const actividadSchema = z.object({
  id: z.string().min(1),
  orden: z.number().int().nonnegative(),
  tipo: z.string().min(1),
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  disciplina: z.string().min(1).nullable().optional(),
  duracion: z.object({ minutos: z.number().int().nonnegative() }).optional(),
  herramientas: z.array(referenciaExternaSchema).optional(),
  epp: z.array(referenciaExternaSchema).optional(),
  materiales: z.array(referenciaExternaSchema).optional(),
  repuestos: z.array(referenciaExternaSchema).optional(),
  checklists: z.array(referenciaExternaSchema).optional(),
  formularios: z.array(referenciaExternaSchema).optional(),
  documentacion: z.array(referenciaExternaSchema).optional(),
  riesgos: z.array(z.object({ categoria: z.string().min(1), nota: z.string().optional() })).optional(),
  observaciones: z.string().optional(),
});
const rutinaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  recursosSugeridos: z.array(z.object({ tipo: z.string().min(1), cantidad: z.number().int().positive().optional() })).optional(),
  actividades: z.array(actividadSchema).min(1),
  duracionTotal: z.object({ minutos: z.number().int().nonnegative() }).optional(),
});
const programaSchema = z.object({
  frecuencia: frecuenciaSchema,
  calendarioId: z.string().min(1).nullable().optional(),
  vigenteDesde: z.string().min(1),
  vigenteHasta: z.string().min(1).nullable().optional(),
});

function construirPrograma(input: z.infer<typeof programaSchema>): Result<ProgramaMantenimiento, KernelError> {
  const frec = crearFrecuencia(input.frecuencia);
  if (!frec.ok) return frec;
  return ok({
    frecuencia: frec.value,
    calendarioId: input.calendarioId ?? null,
    vigenteDesde: input.vigenteDesde,
    vigenteHasta: input.vigenteHasta ?? null,
  });
}

/* ------------------------------ Descriptor ------------------------------- */

export function planesModule(adapters: ModuleAdapters): PlatformServiceDefinition {
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
      "Enterprise Maintenance Plans — dominio (DGP-012): planes de mantenimiento versionados, programas, frecuencias declarativas combinables, motor de frecuencias puro/determinista, calendario operacional, alcance de activos declarativo, rutinas por referencia, generación idempotente de órdenes y ciclo de vida gobernado por el Workflow Engine.",
    capabilities: [
      { name: "gestionar-planes", permissions: [`${MODULO}.read`, `${MODULO}.write`], description: "Alta y edición de planes/versiones" },
      { name: "gobernar-planes", permissions: [`${MODULO}.read`, `${MODULO}.govern`], description: "Publicar/suspender/reanudar/archivar (workflow)" },
      { name: "generar-ordenes", permissions: [`${MODULO}.read`, `${MODULO}.generate`], description: "Evaluar y decidir generación de OT (idempotente)" },
      { name: "administrar-planes", permissions: [`${MODULO}.admin`], description: "Catálogos y calendarios operacionales" },
    ],
    permissions: [`${MODULO}.read`, `${MODULO}.write`, `${MODULO}.govern`, `${MODULO}.generate`, `${MODULO}.admin`],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [
      "plan-mantenimiento",
      "calendario-operacional",
      "generacion-orden",
      "historial-plan",
      "secuencia",
      "recibo-op",
      ...recordTypesCatalogos(),
    ],
    configDefaults: {
      "max-longitud-nombre": "200",
      "codigo-prefijo": "PLN",
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
      /* --------------------------- crear calendario ---------------------- */
      (deps) => ({
        name: `${MODULO}.crear-calendario`,
        inputSchema: z.object({
          id: z.string().uuid().optional(),
          opId: z.string().optional(),
          tipo: z.string().min(1),
          ambito: z.string().min(1),
          nombre: z.string().min(1),
          diasLaborales: z.array(z.number().int().min(0).max(6)).min(1),
          festivos: z.array(z.string().min(1)).optional(),
          turnos: z.array(z.object({ clave: z.string().min(1), inicioMin: z.number().int(), finMin: z.number().int() })).optional(),
          ventanas: z.array(z.object({ tipo: z.string().min(1), desde: z.string().min(1), hasta: z.string().min(1), etiqueta: z.string().optional() })).optional(),
          exclusiones: z.array(z.object({ tipo: z.string().min(1), desde: z.string().min(1), hasta: z.string().min(1), etiqueta: z.string().optional() })).optional(),
        }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-calendario`, input.opId);
          if (previo) return ok({ ...previo, idempotente: true });

          const val = await validarClasificacion(adapters, tenant.value, { "tipos-calendario": input.tipo }, ["tipos-calendario"]);
          if (!val.ok) return val;

          const id = input.id ?? crypto.randomUUID();
          const cal = crearCalendarioOperacional({
            id, tenantId: tenant.value, tipo: input.tipo, ambito: input.ambito, nombre: input.nombre,
            diasLaborales: input.diasLaborales, festivos: input.festivos ?? [], turnos: input.turnos ?? [],
            ventanas: input.ventanas ?? [], exclusiones: input.exclusiones ?? [], version: 0,
          });
          if (!cal.ok) return cal;
          const saved = await adapters.calendarios.insert(uow, cal.value);
          if (!saved.ok) return saved;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-calendario", id, { tipo: input.tipo });
          if (!audited.ok) return audited;
          // Evento AUTOSUFICIENTE (snapshot completo) ⇒ proyecta el read model de
          // calendarios y permite reconstrucción por replay (CQRS puro).
          const ahoraCal = new Date().toISOString();
          {
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: CALENDARIO_CREADO,
              payload: {
                tenantId: tenant.value, id, entityRef: `calendario-operacional:${id}`,
                tipo: input.tipo, ambito: input.ambito, nombre: input.nombre, version: cal.value.version,
                actorId: ctx.principal.id, creadoEn: ahoraCal, actualizadoAt: ahoraCal,
                eventoTipo: CALENDARIO_CREADO, snapshot: cal.value as unknown as Record<string, unknown>,
              },
            });
            if (!_e.ok) return _e;
          }

          const resultado = { id, tipo: input.tipo, ambito: input.ambito };
          const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-calendario`, input.opId, resultado, ctx.principal.id);
          if (!rec.ok) return rec;
          return ok({ ...resultado, idempotente: false });
        },
      }),
      /* ------------------------------- crear plan ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-plan`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            nombre: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            tipoPlan: z.string().min(1),
            estrategia: z.string().min(1),
            prioridad: z.string().min(1),
            alcance: alcanceSchema,
            rutina: rutinaSchema,
            programa: programaSchema,
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-plan`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_PLAN, {});
            if (!pol.ok) return pol;

            const val = await validarClasificacion(
              adapters, tenant.value,
              { "tipos-plan": input.tipoPlan, estrategias: input.estrategia, prioridades: input.prioridad },
              ["tipos-plan", "estrategias", "prioridades"],
            );
            if (!val.ok) return val;

            const alcance = crearAlcanceActivos(input.alcance);
            if (!alcance.ok) return alcance;
            const rutina = crearRutina(input.rutina);
            if (!rutina.ok) return rutina;
            const programa = construirPrograma(input.programa);
            if (!programa.ok) return programa;

            // Gobierno: exige Workflow Engine aprobado ANTES de cualquier efecto.
            const wf = exigirWorkflow(adapters, "plan");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "plan", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "plan", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date().toISOString();
            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value), ctx.principal.id);
            if (!codigo.ok) return codigo;
            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "200"));

            const cambio = crearPlan({
              id, tenantId: tenant.value, codigo: codigo.value.valor, nombre: input.nombre,
              descripcion: input.descripcion ?? null, tipoPlan: input.tipoPlan, estrategia: input.estrategia,
              prioridad: input.prioridad, alcance: alcance.value, rutina: rutina.value, programa: programa.value,
              workflow: { ...ref, instanciaId: inicio.value.instanciaId }, estadoInicial: inicio.value.estado.estado as PlanMantenimiento["estado"],
              actorId: ctx.principal.id, ahora, maxLongitudNombre: maxNombre,
            });
            if (!cambio.ok) return cambio;

            const saved = await adapters.planes.insert(uow, cambio.value.plan);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, id, "creado", saved.value.version, { codigo: codigo.value.valor }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-plan", id, { codigo: codigo.value.valor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, codigo: codigo.value.valor, estado: saved.value.estado, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-plan`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------ editar plan ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar-plan`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().nullable().optional(),
            alcance: alcanceSchema.optional(),
            rutina: rutinaSchema.optional(),
            programa: programaSchema.optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.editar-plan`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.planes.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
            const plan = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR_PLAN, { estado: plan.estado });
            if (!pol.ok) return pol;

            const cambios: { nombre?: string; descripcion?: string | null; alcance?: AlcanceActivos; rutina?: Rutina; programa?: ProgramaMantenimiento } = {};
            if (input.nombre !== undefined) cambios.nombre = input.nombre;
            if (input.descripcion !== undefined) cambios.descripcion = input.descripcion;
            if (input.alcance) { const a = crearAlcanceActivos(input.alcance); if (!a.ok) return a; cambios.alcance = a.value; }
            if (input.rutina) { const r = crearRutina(input.rutina); if (!r.ok) return r; cambios.rutina = r.value; }
            if (input.programa) { const pr = construirPrograma(input.programa); if (!pr.ok) return pr; cambios.programa = pr.value; }

            const ahora = new Date().toISOString();
            const cambio = editarPlan(plan, cambios, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.planes.update(uow, cambio.value.plan, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "editar-plan", input.id, {});
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const borrador = versionBorrador(saved.value);
            const resultado = { id: input.id, versionBorrador: borrador?.numero ?? null, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.editar-plan`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ----------------------------- publicar plan ----------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.publicar-plan`,
          inputSchema: z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive(), opId: z.string().optional() }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.publicar-plan`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.planes.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
            const plan = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_PUBLICAR_PLAN, { estado: plan.estado, hayBorrador: versionBorrador(plan) !== null });
            if (!pol.ok) return pol;

            // Gobierno REAL: la transición sólo procede si el motor la autoriza.
            const wf = exigirWorkflow(adapters, "plan");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, plan.workflow, "publicar", ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = publicarPlan(plan, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.planes.update(uow, cambio.value.plan, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, input.id, "publicado", saved.value.version, { version: saved.value.versionActiva }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "publicar-plan", input.id, {});
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, estado: saved.value.estado, versionActiva: saved.value.versionActiva, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.publicar-plan`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- transicionar plan --------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar-plan`,
          inputSchema: z.object({
            id: z.string().min(1),
            accion: z.enum(ACCIONES_SUSPENSION),
            expectedVersion: z.number().int().positive(),
            motivo: z.string().min(1),
            hasta: z.string().min(1).nullable().optional(),
            nota: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.transicionar-plan`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.planes.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
            const plan = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR_PLAN, { estado: plan.estado });
            if (!pol.ok) return pol;

            // Valida la suspensión de dominio (motivo/fecha) ANTES del motor.
            const susp = crearSuspensionPlan({
              id: crypto.randomUUID(), accion: input.accion, motivo: input.motivo,
              hasta: input.hasta ?? null, nota: input.nota, aplicadaEn: new Date().toISOString(), aplicadaPor: ctx.principal.id,
            });
            if (!susp.ok) return susp;

            // Gobierno REAL: verifica el Result del motor ANTES de cualquier efecto.
            const wf = exigirWorkflow(adapters, "plan");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, plan.workflow, input.accion, ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = aplicarAccionPlan(plan, input.accion, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.planes.update(uow, cambio.value.plan, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, input.id, "suspension", saved.value.version, { accion: input.accion, motivo: input.motivo, hasta: input.hasta ?? null }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "transicionar-plan", input.id, { accion: input.accion });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, estado: saved.value.estado, accion: input.accion, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.transicionar-plan`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------ archivar plan ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.archivar-plan`,
          inputSchema: z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive(), opId: z.string().optional() }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.archivar-plan`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.planes.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
            const plan = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_ARCHIVAR_PLAN, { estado: plan.estado });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "plan");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, plan.workflow, "archivar", ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = aplicarAccionPlan(plan, "archivar", ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.planes.update(uow, cambio.value.plan, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, input.id, "archivado", saved.value.version, {}, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "archivar-plan", input.id, {});
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, estado: saved.value.estado, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.archivar-plan`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------ rollback plan ---------------------- */
      (deps) => ({
        name: `${MODULO}.rollback-plan`,
        inputSchema: z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive(), versionDestino: z.number().int().positive(), opId: z.string().optional() }),
        authorization: { permissions: [`${MODULO}.govern`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.rollback-plan`, input.opId);
          if (previo) return ok({ ...previo, idempotente: true });

          const found = await adapters.planes.findById(tenant.value, input.id);
          if (!found.ok) return found;
          if (!found.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));

          const ahora = new Date().toISOString();
          const cambio = rollbackPlan(found.value, input.versionDestino, ctx.principal.id, ahora);
          if (!cambio.ok) return cambio;
          const saved = await adapters.planes.update(uow, cambio.value.plan, input.expectedVersion);
          if (!saved.ok) return saved;
          const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, input.id, "rollback", saved.value.version, { versionActiva: input.versionDestino }, ahora, ctx.principal.id);
          if (!hist.ok) return hist;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "rollback-plan", input.id, { versionDestino: input.versionDestino });
          if (!audited.ok) return audited;
          { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

          const resultado = { id: input.id, versionActiva: saved.value.versionActiva, version: saved.value.version };
          const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.rollback-plan`, input.opId, resultado, ctx.principal.id);
          if (!rec.ok) return rec;
          return ok({ ...resultado, idempotente: false });
        },
      }),
      /* -------------------------- evaluar generación --------------------- */
      // DECIDE si corresponde generar OT y MARCA la ocurrencia (dedup determinista).
      // NUNCA crea la OT (eso es orquestación de etapa 2). Idempotente por dedup.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.evaluar-generacion`,
          inputSchema: z.object({
            planId: z.string().min(1),
            activoId: z.string().min(1),
            origen: z.enum(ORIGENES_GENERACION),
            ahora: z.string().min(1),
            medidores: z.record(z.string(), z.number()).optional(),
            eventos: z.record(z.string(), z.number()).optional(),
            anclaje: z.object({
              desde: z.string().min(1),
              medidoresBase: z.record(z.string(), z.number()).optional(),
              eventosBase: z.record(z.string(), z.number()).optional(),
            }),
            ocurrenciaManual: z.string().min(1).optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.generate`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.evaluar-generacion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.planes.findById(tenant.value, input.planId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.planId));
            const plan = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_GENERAR_ORDEN, { estado: plan.estado });
            if (!pol.ok) return pol;

            const activa = versionActiva(plan);
            if (!activa) return fail(KernelErrors.conflict("El plan no tiene una versión publicada activa"));

            // Ocurrencias ya generadas para este plan+versión+activo (idempotencia).
            const previas = await adapters.generaciones.listPorPlan(tenant.value, input.planId);
            if (!previas.ok) return previas;
            const generadasPrevias = new Set(previas.value.map((g) => g.claveDedup));

            const anclaje: AnclajeFrecuencia = {
              desde: input.anclaje.desde,
              medidoresBase: input.anclaje.medidoresBase ?? {},
              eventosBase: input.anclaje.eventosBase ?? {},
            };
            const ctxEval: ContextoEvaluacion = { ahora: input.ahora, medidores: input.medidores ?? {}, eventos: input.eventos ?? {} };

            const decision = decidirGeneracion({
              planId: input.planId, version: activa.numero, activoId: input.activoId,
              frecuencia: activa.programa.frecuencia, anclaje, ctx: ctxEval,
              origen: input.origen as OrigenGeneracion, generadasPrevias, ocurrenciaManual: input.ocurrenciaManual,
            });

            if (!decision.corresponde) {
              const resultado = { corresponde: false, claveDedup: decision.claveDedup, ocurrencia: decision.ocurrencia, motivo: decision.evaluacion?.vencida === false ? "no-vencida" : "ya-generada" };
              const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.evaluar-generacion`, input.opId, resultado, ctx.principal.id);
              if (!rec.ok) return rec;
              return ok({ ...resultado, idempotente: false });
            }

            // Resuelve la fecha objetivo por calendario (si el programa lo declara).
            let fechaObjetivo = decision.fechaObjetivo;
            if (activa.programa.calendarioId) {
              const cal = await adapters.calendarios.findById(tenant.value, activa.programa.calendarioId);
              if (!cal.ok) return cal;
              if (cal.value) {
                const habil = proximaFechaHabil(cal.value, fechaObjetivo);
                if (habil) fechaObjetivo = habil;
              }
            }

            const genId = crypto.randomUUID();
            const gen = crearGeneracionOrden({
              id: genId, tenantId: tenant.value, planId: input.planId, version: activa.numero,
              activoId: input.activoId, ocurrencia: decision.ocurrencia, claveDedup: decision.claveDedup,
              origen: input.origen, fechaObjetivo, ordenTrabajoId: null, generadaEn: input.ahora, generadaPor: ctx.principal.id,
            });
            if (!gen.ok) return gen;
            const saved = await adapters.generaciones.insert(uow, gen.value);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, input.planId, "genero-orden", plan.version, { claveDedup: decision.claveDedup, activoId: input.activoId }, input.ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "evaluar-generacion", genId, { planId: input.planId });
            if (!audited.ok) return audited;
            {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, {
                tipo: ORDEN_GENERADA,
                payload: {
                  tenantId: tenant.value, id: genId, planId: input.planId, entityRef: `plan-mantenimiento:${input.planId}`,
                  version: activa.numero, activoId: input.activoId, claveDedup: decision.claveDedup, ocurrencia: decision.ocurrencia,
                  origen: input.origen, ordenTrabajoId: null, estado: "pendiente", fechaObjetivo,
                  generadaEn: input.ahora, actorId: ctx.principal.id, eventoTipo: ORDEN_GENERADA,
                },
              });
              if (!_e.ok) return _e;
            }

            const resultado = { corresponde: true, generacionId: genId, claveDedup: decision.claveDedup, ocurrencia: decision.ocurrencia, fechaObjetivo };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.evaluar-generacion`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------- generar-ordenes-preventivas ------------------ */
      // ORQUESTADOR OFICIAL idempotente: MATERIALIZA en Órdenes de Trabajo REALES
      // las generaciones DECIDIDAS del plan que aún no tienen OT. NUNCA anida
      // comandos de otro runtime: delega la creación de la OT en el PUERTO
      // `materializador` (que compone `modulo.ordenes.crear` con su propia UoW) y
      // persiste ATÓMICAMENTE el vínculo generación→OT en la UoW del módulo
      // (evento autosuficiente `orden-materializada` + read model). Idempotente
      // por opId (recibo) y por VÍNCULO existente (linkOrden reconoce el enlace y
      // devuelve idempotente sin re-materializar). Encolable offline / replayable
      // por /sync. Es un comando de APLICACIÓN (usa UoWs propias); el `uow` del
      // pipeline no se usa para escrituras.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.generar-ordenes-preventivas`,
          inputSchema: z.object({
            planId: z.string().min(1),
            limite: z.number().int().positive().max(200).optional(),
            tipoOrden: z.string().min(1).optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.generate`] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const comando = `${MODULO}.generar-ordenes-preventivas`;

            // Idempotencia terminal por opId (recibo durable): mismo resultado
            // entre reintentos/workers de /sync (un solo efecto).
            const previo = await reciboPrevio(adapters, tenant.value, comando, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            if (!adapters.materializador) {
              return fail(KernelErrors.conflict(
                "El runtime no está configurado con un materializador de Órdenes; la generación preventiva no puede crear OT por vías no oficiales.",
                { motivo: "materializador-no-configurado" },
              ));
            }
            const materializador = adapters.materializador;

            // Plan desde el read model (o aggregate fallback en fakes puros).
            let plan: PlanMantenimiento | null = null;
            if (adapters.readModel) {
              const rm = await adapters.readModel.planGet(tenant.value, input.planId);
              if (!rm.ok) return rm;
              plan = rm.value ? (rm.value.datos as unknown as PlanMantenimiento) : null;
            } else {
              const found = await adapters.planes.findById(tenant.value, input.planId);
              if (!found.ok) return found;
              plan = found.value;
            }
            if (!plan) return fail(KernelErrors.notFound("plan-mantenimiento", input.planId));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_GENERAR_ORDEN, { estado: plan.estado });
            if (!pol.ok) return pol;

            // Generaciones DECIDIDAS pendientes de OT (read model o aggregate).
            let generaciones: Array<{ id: string; activoId: string; ocurrencia: string; claveDedup: string; fechaObjetivo: string; ordenTrabajoId: string | null }>;
            if (adapters.readModel) {
              const rm = await adapters.readModel.generacionesPorPlan(tenant.value, input.planId);
              if (!rm.ok) return rm;
              generaciones = rm.value.map((g) => ({
                id: g.id, activoId: g.activoId, ocurrencia: g.ocurrencia, claveDedup: g.claveDedup,
                fechaObjetivo: g.fechaObjetivo.toISOString(), ordenTrabajoId: g.ordenTrabajoId,
              }));
            } else {
              const r = await adapters.generaciones.listPorPlan(tenant.value, input.planId);
              if (!r.ok) return r;
              generaciones = r.value.map((g) => ({
                id: g.id, activoId: g.activoId, ocurrencia: g.ocurrencia, claveDedup: g.claveDedup,
                fechaObjetivo: g.fechaObjetivo, ordenTrabajoId: g.ordenTrabajoId,
              }));
            }
            const pendientes = generaciones.filter((g) => !g.ordenTrabajoId).slice(0, input.limite ?? 50);

            const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
            const prioridad = (plan as { prioridad?: string | null }).prioridad ?? null;
            const codigo = String((plan as { codigo?: string }).codigo ?? input.planId);
            const tipoOrden = input.tipoOrden ?? "preventiva";

            const ordenesCreadas: Array<{ generacionId: string; claveDedup: string; ordenTrabajoId: string; idempotente: boolean }> = [];
            const errores: Array<{ claveDedup: string; code: string; error: string }> = [];

            for (const g of pendientes) {
              // Medidores best-effort del activo (lectura por consulta oficial).
              const medidores = materializador.medidoresDeActivo
                ? await materializador.medidoresDeActivo(tenant.value, ctx.principal.id, g.activoId)
                : null;

              // (1) MATERIALIZAR la OT vía puerto oficial (opId=claveDedup ⇒ dedup
              //     determinista; UoW/Kernel propios del materializador). SIN anidar.
              const creada = await materializador.crearOrden(tenant.value, ctx.principal.id, {
                opId: g.claveDedup, planId: input.planId, planCodigo: codigo, activoId: g.activoId,
                ocurrencia: g.ocurrencia, claveDedup: g.claveDedup, fechaObjetivo: g.fechaObjetivo,
                prioridad, tipoOrden, medidores,
              });
              if (!creada.ok) {
                errores.push({ claveDedup: g.claveDedup, code: creada.error.code, error: creada.error.message });
                continue;
              }
              const ordenTrabajoId = creada.value.ordenTrabajoId;

              // (2) VÍNCULO generación→OT ATÓMICO (UoW propia del módulo): fija el
              //     ordenTrabajoId + estado=materializada y emite evento
              //     autosuficiente. `linkOrden` es idempotente: si ya estaba
              //     vinculada, NO re-emite (reintento converge sin duplicar).
              const ahora = new Date().toISOString();
              const aplicado = await uowPort.execute(ctx, async (uow): Promise<Result<boolean, KernelError>> => {
                const link = await adapters.generaciones.linkOrden(uow, tenant.value, g.id, ordenTrabajoId);
                if (!link.ok) return link;
                if (!link.value) return ok(false); // ya vinculada ⇒ idempotente
                const ev = await emitirEvento(adapters, ctx, uow, tenant.value, {
                  tipo: ORDEN_MATERIALIZADA,
                  payload: {
                    tenantId: tenant.value, id: g.id, planId: input.planId, entityRef: `plan-mantenimiento:${input.planId}`,
                    activoId: g.activoId, claveDedup: g.claveDedup, ocurrencia: g.ocurrencia,
                    origen: "manual", ordenTrabajoId, estado: "materializada", fechaObjetivo: g.fechaObjetivo,
                    generadaEn: ahora, actorId: ctx.principal.id, eventoTipo: ORDEN_MATERIALIZADA,
                  },
                });
                if (!ev.ok) return ev;
                const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, input.planId, "materializo-orden", plan!.version, { claveDedup: g.claveDedup, activoId: g.activoId, ordenTrabajoId }, ahora, ctx.principal.id);
                if (!hist.ok) return hist;
                return ok(true);
              });
              if (!aplicado.ok) {
                errores.push({ claveDedup: g.claveDedup, code: aplicado.error.code, error: aplicado.error.message });
                continue;
              }
              ordenesCreadas.push({ generacionId: g.id, claveDedup: g.claveDedup, ordenTrabajoId, idempotente: creada.value.idempotente || !aplicado.value });
            }

            const resultado = { planId: input.planId, evaluadas: pendientes.length, ordenesCreadas, errores };
            if (input.opId && errores.length === 0) {
              const rec = await uowPort.execute(ctx, (uow) =>
                adapters.recibos.sellar(uow, tenant.value, { opId: input.opId!, comando, resultado }, ctx.principal.id),
              );
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ----------------------------- reproyectar ------------------------- */
      // Reconstrucción determinista de los read models desde la bitácora durable
      // (`pln_eventos`), NO desde el outbox. Idempotente ⇒ equivalencia.
      (deps) => ({
        name: `${MODULO}.reproyectar`,
        inputSchema: z.object({}).passthrough(),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, _input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!adapters.readModel) return fail(KernelErrors.conflict("El runtime no tiene read models configurados"));
          const limpiado = await adapters.readModel.clear(uow, tenant.value);
          if (!limpiado.ok) return limpiado;
          const stream = await adapters.eventLog.listPorTenant(tenant.value);
          if (!stream.ok) return stream;
          const proyAdapters: ProyeccionAdapters = { readModel: adapters.readModel };
          let aplicados = 0;
          for (const ev of stream.value) {
            const evLike = { id: ev.eventId, type: ev.tipo, payload: ev.payload };
            const rAgg = await aplicarEventoAggregate(proyAdapters, uow, evLike);
            if (!rAgg.ok) return rAgg;
            const rOp = await aplicarEventoOperacional(proyAdapters, uow, evLike);
            if (!rOp.ok) return rOp;
            aplicados += 1;
          }
          return ok({ reproyectados: aplicados });
        },
      }),
    ],
    queries: [
      (deps) => ({
        name: `${MODULO}.plan`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // CQRS: el DETALLE se sirve desde el read model (lección 009.2), que
          // proyecta el snapshot completo del aggregate desde el payload.
          if (adapters.readModel) {
            const rm = await adapters.readModel.planGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
            return ok(rm.value.datos as Record<string, unknown>);
          }
          const r = await adapters.planes.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.planes`,
        inputSchema: z.object({ estado: z.string().optional(), tipoPlan: z.string().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.planList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((r) => ({
              id: r.id, codigo: r.codigo, nombre: r.nombre, descripcion: r.descripcion, estado: r.estado,
              tipoPlan: r.tipoPlan, estrategia: r.estrategia, prioridad: r.prioridad, versionActiva: r.versionActiva,
              version: r.version, actualizadoAt: r.actualizadoAt.toISOString(),
            })) as unknown as Record<string, unknown>[]);
          }
          const r = await adapters.planes.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.comparar-versiones`,
        inputSchema: z.object({ id: z.string().min(1), a: z.number().int().positive(), b: z.number().int().positive() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // CQRS: se compara sobre el SNAPSHOT del read model (datos), que embebe
          // todas las versiones del plan; reproyectable, sin releer el aggregate.
          if (adapters.readModel) {
            const rm = await adapters.readModel.planGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
            const dif = compararVersiones(rm.value.datos as unknown as PlanMantenimiento, input.a, input.b);
            if (!dif.ok) return dif;
            return ok({ diferencias: dif.value });
          }
          const r = await adapters.planes.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("plan-mantenimiento", input.id));
          const dif = compararVersiones(r.value, input.a, input.b);
          if (!dif.ok) return dif;
          return ok({ diferencias: dif.value });
        },
      }),
      (deps) => ({
        name: `${MODULO}.calendario`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // CQRS: el DETALLE del calendario se sirve EXCLUSIVAMENTE del read model
          // (snapshot completo en el payload), reproyectable. Fallback al aggregate
          // sólo cuando el runtime no tiene read models (fakes puros ETAPA 1).
          if (adapters.readModel) {
            const rm = await adapters.readModel.calendarioGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("calendario-operacional", input.id));
            return ok(rm.value.datos as Record<string, unknown>);
          }
          const r = await adapters.calendarios.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("calendario-operacional", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.generaciones`,
        inputSchema: z.object({ planId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.generacionesPorPlan(tenant.value, input.planId);
            if (!rm.ok) return rm;
            return ok(rm.value.map((g) => g.datos) as unknown as Record<string, unknown>[]);
          }
          const r = await adapters.generaciones.listPorPlan(tenant.value, input.planId);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.historial`,
        inputSchema: z.object({ planId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // CQRS: el historial se sirve EXCLUSIVAMENTE del read model reproyectable.
          if (adapters.readModel) {
            const rm = await adapters.readModel.historialPorPlan(tenant.value, input.planId);
            if (!rm.ok) return rm;
            return ok(rm.value.map((h) => ({
              id: h.id, planId: h.planId, hito: h.hito, version: h.version,
              detalle: h.detalle, actorId: h.actorId, ocurridoEn: h.ocurridoAt.toISOString(),
            })) as unknown as Record<string, unknown>[]);
          }
          const r = await adapters.historial.listPorPlan(tenant.value, input.planId);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
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
          return ok({ catalogo: input.catalogo, opciones: r.value });
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
      /* ------------------------------ consola ---------------------------- */
      // Consola técnica (admin): estado real de read models, event log durable,
      // outbox del módulo y recibos de sincronización. Requiere runtime operacional.
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({ limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!adapters.readModel || !adapters.consola || !adapters.syncReceipts) {
            return fail(KernelErrors.conflict("El runtime no está configurado con superficie operacional (read models/consola/recibos)"));
          }
          const contarEventos = "contar" in adapters.eventLog
            ? (adapters.eventLog as unknown as { contar(t: string): Promise<Result<number, KernelError>> }).contar(tenant.value)
            : Promise.resolve(ok(0));
          const [proyecciones, eventos, outbox, recibos] = await Promise.all([
            adapters.readModel.contar(tenant.value),
            contarEventos,
            adapters.consola.outboxDelModulo(tenant.value, input.limit ?? 10),
            adapters.syncReceipts.listByTenant(tenant.value),
          ]);
          if (!proyecciones.ok) return proyecciones;
          if (!eventos.ok) return eventos;
          if (!outbox.ok) return outbox;
          if (!recibos.ok) return recibos;
          return ok({
            statsPlanes: proyecciones.value,
            eventLog: { eventos: eventos.value },
            proyecciones: proyecciones.value,
            outbox: outbox.value,
            receipts: recibos.value,
            tablasRLS: [
              "pln_planes", "pln_calendarios", "pln_generaciones", "pln_historial",
              "pln_eventos", "pln_sync_receipts", "pln_recibos", "pln_secuencias",
              "pln_catalogos", "pln_planes_read", "pln_calendarios_read",
              "pln_generaciones_read", "pln_historial_read",
            ],
          });
        },
      }),
    ],
    eventHandlers: [
      // Proyección CQRS por evento del AGGREGATE (payload-only, idempotente por
      // last_event_id/eventId). Sólo activa cuando el runtime provee read models
      // (ETAPA 2); en fakes puros (ETAPA 1) es no-op y las consultas leen del repo.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) => {
          if (!adapters.readModel) return Promise.resolve(ok(undefined));
          const proy: ProyeccionAdapters = { readModel: adapters.readModel };
          return handlerProyeccion(proy, false)(deps)(event, eventType);
        },
      })),
      // Shared Timeline CANÓNICO (platform.timeline): CADA evento del módulo se
      // registra vía COMANDO `platform.timeline.record` (nunca escritura directa),
      // idempotente por entryId=event.id ⇒ la reentrega del outbox no duplica.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `timeline:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          registrarEnTimeline()(deps, { ...event, type: eventType }),
      })),
    ],
    healthCheck: () => async () => ({ healthy: true, detail: `${MODULO} operativo` }),
  };
}
