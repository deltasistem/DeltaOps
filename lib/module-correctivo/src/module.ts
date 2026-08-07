/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Capa de aplicación +
 * descriptor del servicio de plataforma (ETAPA 1: dominio + servicio).
 *
 * Se registra por el ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime). Persistencia en FAKES en memoria; los adaptadores
 * reales (PostgreSQL / read models CQRS / OpenAPI / UI) llegan en la ETAPA 2.
 *
 * GOBIERNO: TODO ciclo de vida (solicitud → diagnóstico → validación → generación
 * de OT → asignación → ejecución → verificación → cierre) pasa por el Workflow
 * Engine. Sin un `WorkflowPort` aprobado, los comandos gobernados FALLAN de forma
 * segura (KRN-CFL-001) y NO alteran el aggregate — nunca auto-aprueban. La
 * auto-aprobación es EXCLUSIVA de pruebas (test-runtime).
 *
 * COMPOSICIÓN (lección 009.3): la colaboración con Activos/Órdenes/Inventario/
 * Abastecimiento/Dynamic Forms se hace por PUERTOS FAIL-SAFE en su PROPIO
 * runtime/UoW — jamás comandos anidados. Result verificado ANTES de todo efecto;
 * idempotencia por opId/recibos y guard de dedup determinista (una solicitud →
 * una única OT correctiva).
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
  COMPRA_SOLICITADA,
  EVENTOS_MODULO,
  HISTORIAL_REGISTRADO,
  INVENTARIO_CONSUMIDO,
  INVENTARIO_DEVUELTO,
  REINCIDENCIA_DETECTADA,
  REPUESTOS_RESERVADOS,
} from "./domain/events";
import {
  ACCIONES_SOLICITUD,
  adjuntarEvidencia,
  anclarDiagnostico,
  aplicarAccionSolicitud,
  crearSolicitud,
  editarSolicitud,
  eventoComentario,
  type AccionSolicitud,
  type EstadoSolicitud,
} from "./domain/solicitud";
import { registrarDiagnostico } from "./domain/diagnostico";
import {
  ACCIONES_INTERVENCION,
  aplicarAccionIntervencion,
  asignarCuadrillas,
  crearIntervencion,
  type AccionIntervencion,
  type EstadoIntervencion,
} from "./domain/intervencion";
import { claveDedupOrden, crearGeneracionOrden, materializarGeneracion, type EstadoGeneracion } from "./domain/orden-correctiva";
import {
  crearClasificacion,
  crearCuadrilla,
  crearEvidencia,
  crearObjetoAfectado,
  crearSintoma,
  activoPrincipalDeObjeto,
} from "./domain/value-objects";
import { crearEventoActivo, detectarReincidencia, TIPOS_EVENTO_ACTIVO } from "./domain/eventos-activo";
import { crearHistorial } from "./domain/historial";
import {
  policiesDelModulo,
  POLICY_PUEDE_ASIGNAR,
  POLICY_PUEDE_CONSUMIR_INVENTARIO,
  POLICY_PUEDE_CREAR_SOLICITUD,
  POLICY_PUEDE_DIAGNOSTICAR,
  POLICY_PUEDE_EDITAR_SOLICITUD,
  POLICY_PUEDE_GENERAR_ORDEN,
  POLICY_PUEDE_TRANSICIONAR_INTERVENCION,
  POLICY_PUEDE_TRANSICIONAR_SOLICITUD,
} from "./domain/policies";
import {
  CONFIG_CODIGO_DEFAULT,
  type AbastecimientoPort,
  type ActivosPort,
  type CatalogoPort,
  type ConfigCodigo,
  type ConsecutivoPort,
  type DiagnosticoRepository,
  type DynamicFormsPort,
  type EventLogStore,
  type EventoActivoRepository,
  type GeneracionDedupStore,
  type GeneracionRepository,
  type HistorialRepository,
  type IntervencionRepository,
  type InventarioPort,
  type LineaRepuesto,
  type MaterializadorOrdenes,
  type ReciboPort,
  type SerieDocumento,
  type SolicitudRepository,
} from "./domain/ports";
import { type ProcesoWorkflow, type ReferenciaWorkflow, type WorkflowPort } from "./domain/workflow";
import type { ConsolaStore, ReadModelsStore, SyncReceiptStore } from "./infrastructure/operacional";
import { aplicarEventoAggregate, handlerProyeccion, type ProyeccionAdapters } from "./projection";

/** Tablas del módulo protegidas por RLS (para la consola técnica de admin). */
const TABLAS_RLS_MODULO: readonly string[] = [
  "cor_solicitudes",
  "cor_diagnosticos",
  "cor_intervenciones",
  "cor_generaciones",
  "cor_generacion_materializaciones",
  "cor_eventos_activo",
  "cor_historial",
  "cor_sync_receipts",
  "cor_eventos",
  "cor_solicitudes_read",
  "cor_diagnosticos_read",
  "cor_intervenciones_read",
  "cor_generaciones_read",
  "cor_eventos_activo_read",
  "cor_consumos_read",
  "cor_historial_read",
  "cor_recibos",
  "cor_secuencias",
  "cor_catalogos",
];

/* ------------------------------- Adaptadores ----------------------------- */

export interface ModuleAdapters {
  readonly solicitudes: SolicitudRepository;
  readonly diagnosticos: DiagnosticoRepository;
  readonly intervenciones: IntervencionRepository;
  readonly generaciones: GeneracionRepository;
  readonly dedup: GeneracionDedupStore;
  readonly historial: HistorialRepository;
  readonly eventosActivo: EventoActivoRepository;
  readonly catalogos: CatalogoPort;
  readonly consecutivo: ConsecutivoPort;
  readonly recibos: ReciboPort;
  readonly eventLog: EventLogStore;
  /** Workflow Engine aprobado (gobierno). Ausente ⇒ comandos gobernados fallan. */
  readonly workflow?: WorkflowPort;
  /** Validación de activos/componentes (composición fail-safe). */
  readonly activos?: ActivosPort;
  /** Verificación/validación de plantillas de Dynamic Forms (fail-safe). */
  readonly dynamicForms?: DynamicFormsPort;
  /** Materializador de órdenes de trabajo correctivas (fail-safe). */
  readonly materializador?: MaterializadorOrdenes;
  /** Composición con Inventario (reservas/consumo/devolución) (fail-safe). */
  readonly inventario?: InventarioPort;
  /** Composición con Abastecimiento (solicitud de compra) (fail-safe). */
  readonly abastecimiento?: AbastecimientoPort;
  /** Read models CQRS especializados (Etapa 2). Ausente ⇒ se sirve del aggregate. */
  readonly readModel?: ReadModelsStore;
  /** Recibos de sincronización durables (protocolo offline, Etapa 2). */
  readonly syncReceipts?: SyncReceiptStore;
  /** Consola técnica (diagnóstico del outbox del módulo, Etapa 2). */
  readonly consola?: ConsolaStore;
}

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
    const entityRef = String(p["entityRef"] ?? (p["id"] ? `correctivo:${String(p["id"])}` : ""));
    if (!entityRef) return ok(undefined);
    const resumen = String(p["codigo"] ?? p["titulo"] ?? p["accion"] ?? event.type);
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

const objetoSchema = z.object({
  activoId: z.string().min(1),
  componenteId: z.string().min(1).nullable().optional(),
  ubicacionId: z.string().min(1).nullable().optional(),
});
const sintomaSchema = z.object({ clave: z.string().min(1).nullable().optional(), texto: z.string().min(1).nullable().optional() });
const clasificacionSchema = z.object({
  tipoFalla: z.string().min(1).nullable().optional(),
  modoFalla: z.string().min(1).nullable().optional(),
  causa: z.string().min(1).nullable().optional(),
  efecto: z.string().min(1).nullable().optional(),
  severidad: z.string().min(1).nullable().optional(),
  impacto: z.string().min(1).nullable().optional(),
});
const evidenciaSchema = z.object({
  attachmentId: z.string().min(1),
  tipo: z.enum(["foto", "video", "documento", "audio"]),
  etiqueta: z.string().min(1).nullable().optional(),
});
const referenciaExternaSchema = z.object({ tipo: z.string().min(1), id: z.string().min(1), etiqueta: z.string().min(1).optional() });
const cuadrillaSchema = z.object({
  cuadrillaId: z.string().min(1),
  etiqueta: z.string().min(1).nullable().optional(),
  responsables: z.array(z.object({ responsableId: z.string().min(1), rol: z.string().min(1) })).min(1),
  recursos: z.array(z.object({ tipo: z.string().min(1), referencia: referenciaExternaSchema, cantidad: z.number().positive().optional() })).default([]),
});
const lineaRepuestoSchema = z.object({
  inventarioId: z.string().min(1),
  articuloId: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().min(1),
});

/* ------------------------------ Descriptor ------------------------------- */

export function correctivoModule(adapters: ModuleAdapters): PlatformServiceDefinition {
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
      "Enterprise Corrective Maintenance — dominio (DGP-015 Etapa 1): solicitudes de mantenimiento correctivo por origen (operador/supervisor/producción/calidad/SST/IoT/API, ingesta preparada por contrato), diagnóstico anclado a Dynamic Forms, clasificación por catálogos configurables (tipo/modo/causa/efecto/prioridad/severidad/impacto/origen), ciclo de vida gobernado por el Workflow Engine, generación idempotente de OT correctiva (anti-duplicado determinista, tipo canónico 'correctiva'), composición fail-safe con Inventario (reservas/consumo parcial/devolución) y Abastecimiento (solicitud de compra ante stock insuficiente), Correctivo Mayor multi-cuadrilla, y registro autosuficiente de eventos hacia Activos (historial de fallas, MTBF/MTTR preparados sin cálculo, detección de reincidencias).",
    capabilities: [
      { name: "gestionar-solicitudes", permissions: [`${MODULO}.read`, `${MODULO}.write`], description: "Alta/edición de solicitudes correctivas, evidencias y comentarios" },
      { name: "gobernar-correctivo", permissions: [`${MODULO}.read`, `${MODULO}.govern`], description: "Transiciones gobernadas de solicitud e intervención (workflow)" },
      { name: "ejecutar-correctivo", permissions: [`${MODULO}.read`, `${MODULO}.execute`], description: "Generación de OT, asignación de cuadrillas, consumo/devolución de inventario" },
      { name: "administrar-correctivo", permissions: [`${MODULO}.admin`], description: "Catálogos configurables del módulo" },
    ],
    permissions: [`${MODULO}.read`, `${MODULO}.write`, `${MODULO}.govern`, `${MODULO}.execute`, `${MODULO}.admin`],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [
      "solicitud-correctiva",
      "diagnostico-correctivo",
      "intervencion-correctiva",
      "generacion-correctiva",
      "historial-correctivo",
      "evento-activo-correctivo",
      "secuencia",
      "recibo-op",
      ...recordTypesCatalogos(),
    ],
    configDefaults: {
      "max-longitud-titulo": "200",
      "codigo-solicitud-prefijo": CONFIG_CODIGO_DEFAULT.solicitud.prefijo,
      "codigo-intervencion-prefijo": CONFIG_CODIGO_DEFAULT.intervencion.prefijo,
      "codigo-separador": "-",
      "codigo-padding": "6",
      "reincidencia-ventana-dias": "90",
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
      /* ---------------------------- crear solicitud ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-solicitud`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            titulo: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            origen: z.string().min(1),
            fuenteId: z.string().min(1).nullable().optional(),
            objeto: objetoSchema,
            prioridad: z.string().min(1),
            criticidad: z.string().min(1).nullable().optional(),
            sintomas: z.array(sintomaSchema).min(1),
            clasificacion: clasificacionSchema.optional(),
            evidencias: z.array(evidenciaSchema).default([]),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-solicitud`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_SOLICITUD, {});
            if (!pol.ok) return pol;

            // Catálogos: origen y prioridad obligatorios; criticidad opcional.
            const clasif = input.clasificacion ?? {};
            const val = await validarClasificacion(
              adapters, tenant.value,
              {
                "origenes-solicitud": input.origen,
                "prioridades": input.prioridad,
                "criticidades": input.criticidad,
                "tipos-falla": clasif.tipoFalla,
                "modos-falla": clasif.modoFalla,
                "causas": clasif.causa,
                "efectos": clasif.efecto,
                "severidades": clasif.severidad,
                "impactos": clasif.impacto,
              },
              ["origenes-solicitud", "prioridades"],
            );
            if (!val.ok) return val;

            // VOs.
            const objeto = crearObjetoAfectado(input.objeto);
            if (!objeto.ok) return objeto;
            const sintomas = [];
            for (const s of input.sintomas) { const rs = crearSintoma(s); if (!rs.ok) return rs; sintomas.push(rs.value); }
            const clasificacion = crearClasificacion(clasif);
            if (!clasificacion.ok) return clasificacion;
            const evidencias = [];
            for (const e of input.evidencias) { const re = crearEvidencia(e); if (!re.ok) return re; evidencias.push(re.value); }

            // Composición fail-safe: existencia de activo (y componente si aplica).
            if (!adapters.activos) return fail(KernelErrors.conflict("La validación de activos requiere un ActivosPort configurado", { motivo: "activos-no-configurado" }));
            const ex = await adapters.activos.existen(tenant.value, [objeto.value.activoId]);
            if (!ex.ok) return ex;
            if (ex.value.inexistentes.length > 0) return fail(KernelErrors.validation(`Activo inexistente: ${ex.value.inexistentes.join(", ")}`));
            if (objeto.value.componenteId) {
              const cex = await adapters.activos.componentesExisten(tenant.value, objeto.value.activoId, [objeto.value.componenteId]);
              if (!cex.ok) return cex;
              if (cex.value.inexistentes.length > 0) return fail(KernelErrors.validation(`Componente inexistente: ${cex.value.inexistentes.join(", ")}`));
            }

            // Gobierno: exige Workflow aprobado ANTES de cualquier efecto.
            const wf = exigirWorkflow(adapters, "solicitud");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "solicitud", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "solicitud", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const ahora = new Date().toISOString();
            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value, "solicitud"), ctx.principal.id);
            if (!codigo.ok) return codigo;

            const id = input.id ?? crypto.randomUUID();
            const cambio = crearSolicitud({
              id, tenantId: tenant.value, codigo: codigo.value.valor, titulo: input.titulo, descripcion: input.descripcion ?? null,
              origen: input.origen, fuenteId: input.fuenteId ?? null, objeto: objeto.value, prioridad: input.prioridad, criticidad: input.criticidad ?? null,
              sintomas, clasificacion: clasificacion.value, evidencias, workflow: { ...ref, instanciaId: inicio.value.instanciaId },
              estadoInicial: inicio.value.estado.estado as EstadoSolicitud, actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.solicitudes.insert(uow, cambio.value.solicitud);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `solicitud-correctiva:${id}`, "creada", saved.value.version, { codigo: codigo.value.valor }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-solicitud", id, { codigo: codigo.value.valor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, codigo: codigo.value.valor, estado: saved.value.estado, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-solicitud`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- editar solicitud ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar-solicitud`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            titulo: z.string().min(1).optional(),
            descripcion: z.string().nullable().optional(),
            prioridad: z.string().min(1).optional(),
            criticidad: z.string().min(1).nullable().optional(),
            clasificacion: clasificacionSchema.optional(),
            sintomas: z.array(sintomaSchema).min(1).optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.solicitudes.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.id));
            const solicitud = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR_SOLICITUD, { estado: solicitud.estado });
            if (!pol.ok) return pol;

            if (input.prioridad || input.criticidad !== undefined || input.clasificacion) {
              const clasif = input.clasificacion ?? {};
              const val = await validarClasificacion(adapters, tenant.value, {
                "prioridades": input.prioridad, "criticidades": input.criticidad,
                "tipos-falla": clasif.tipoFalla, "modos-falla": clasif.modoFalla, "causas": clasif.causa,
                "efectos": clasif.efecto, "severidades": clasif.severidad, "impactos": clasif.impacto,
              }, []);
              if (!val.ok) return val;
            }

            const cambios: Parameters<typeof editarSolicitud>[1] = {};
            if (input.titulo !== undefined) cambios.titulo = input.titulo;
            if (input.descripcion !== undefined) cambios.descripcion = input.descripcion;
            if (input.prioridad !== undefined) cambios.prioridad = input.prioridad;
            if (input.criticidad !== undefined) cambios.criticidad = input.criticidad;
            if (input.clasificacion !== undefined) { const c = crearClasificacion(input.clasificacion); if (!c.ok) return c; cambios.clasificacion = c.value; }
            if (input.sintomas !== undefined) {
              const arr = []; for (const s of input.sintomas) { const rs = crearSintoma(s); if (!rs.ok) return rs; arr.push(rs.value); } cambios.sintomas = arr;
            }

            const ahora = new Date().toISOString();
            const cambio = editarSolicitud(solicitud, cambios, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.solicitudes.update(uow, cambio.value.solicitud, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "editar-solicitud", input.id, {});
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      /* -------------------------- adjuntar evidencia --------------------- */
      (deps) => ({
        name: `${MODULO}.adjuntar-evidencia`,
        inputSchema: z.object({ id: z.string().min(1), expectedVersion: z.number().int().positive(), evidencia: evidenciaSchema }),
        authorization: { permissions: [`${MODULO}.write`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const found = await adapters.solicitudes.findById(tenant.value, input.id);
          if (!found.ok) return found;
          if (!found.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.id));
          const ev = crearEvidencia(input.evidencia);
          if (!ev.ok) return ev;
          const ahora = new Date().toISOString();
          const cambio = adjuntarEvidencia(found.value, ev.value, ctx.principal.id, ahora);
          if (!cambio.ok) return cambio;
          const saved = await adapters.solicitudes.update(uow, cambio.value.solicitud, input.expectedVersion);
          if (!saved.ok) return saved;
          { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }
          return ok({ id: input.id, version: saved.value.version, attachmentId: ev.value.attachmentId });
        },
      }),
      /* --------------------------- comentar solicitud -------------------- */
      (deps) => ({
        name: `${MODULO}.comentar-solicitud`,
        inputSchema: z.object({ id: z.string().min(1), comentarioId: z.string().min(1), texto: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.write`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          const found = await adapters.solicitudes.findById(tenant.value, input.id);
          if (!found.ok) return found;
          if (!found.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.id));
          const evt = eventoComentario(found.value, input.comentarioId, ctx.principal.id);
          const _e = await emitirEvento(adapters, ctx, uow, tenant.value, evt);
          if (!_e.ok) return _e;
          return ok({ id: input.id, comentarioId: input.comentarioId });
        },
      }),
      /* --------------------------- registrar diagnóstico ----------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-diagnostico`,
          inputSchema: z.object({
            solicitudId: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            id: z.string().uuid().optional(),
            plantilla: z.object({ plantillaId: z.string().min(1), version: z.number().int().positive() }),
            respuestas: z.record(z.string(), z.unknown()).default({}),
            causaReportada: z.string().min(1).nullable().optional(),
            causaEncontrada: z.string().min(1).nullable().optional(),
            causaRaiz: z.string().min(1).nullable().optional(),
            clasificacion: clasificacionSchema.optional(),
            recomendaciones: z.string().min(1).nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.registrar-diagnostico`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.solicitudes.findById(tenant.value, input.solicitudId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.solicitudId));
            const solicitud = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_DIAGNOSTICAR, { estado: solicitud.estado });
            if (!pol.ok) return pol;

            const clasif = input.clasificacion ?? {};
            const val = await validarClasificacion(adapters, tenant.value, {
              "causas": input.causaReportada ?? input.causaEncontrada ?? input.causaRaiz,
              "tipos-falla": clasif.tipoFalla, "modos-falla": clasif.modoFalla, "efectos": clasif.efecto,
              "severidades": clasif.severidad, "impactos": clasif.impacto,
            }, []);
            if (!val.ok) return val;
            const clasificacion = crearClasificacion(clasif);
            if (!clasificacion.ok) return clasificacion;

            // Composición fail-safe: plantilla de Dynamic Forms.
            if (!adapters.dynamicForms) return fail(KernelErrors.conflict("El diagnóstico requiere un DynamicFormsPort configurado", { motivo: "dynamic-forms-no-configurado" }));
            const plant = await adapters.dynamicForms.verificarPlantilla(tenant.value, input.plantilla.plantillaId, input.plantilla.version);
            if (!plant.ok) return plant;
            if (!plant.value.publicada) return fail(KernelErrors.validation(`La plantilla "${input.plantilla.plantillaId}:v${input.plantilla.version}" no está publicada`));
            const resp = await adapters.dynamicForms.validarRespuestas(tenant.value, input.plantilla.plantillaId, input.plantilla.version, input.respuestas);
            if (!resp.ok) return resp;
            if (!resp.value.validas) return fail(KernelErrors.validation(`Respuestas de diagnóstico inválidas: ${resp.value.errores.join(", ")}`));

            const ahora = new Date().toISOString();
            const id = input.id ?? crypto.randomUUID();
            const cambio = registrarDiagnostico({
              id, tenantId: tenant.value, solicitudId: input.solicitudId, plantilla: input.plantilla, respuestas: input.respuestas,
              causaReportada: input.causaReportada ?? null, causaEncontrada: input.causaEncontrada ?? null, causaRaiz: input.causaRaiz ?? null,
              clasificacion: clasificacion.value, recomendaciones: input.recomendaciones ?? null, registradoPor: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.diagnosticos.insert(uow, cambio.value.diagnostico);
            if (!saved.ok) return saved;

            // Anclar el diagnóstico en la solicitud y refinar su clasificación.
            const ancla = anclarDiagnostico(solicitud, id, clasificacion.value, ctx.principal.id, ahora);
            if (!ancla.ok) return ancla;
            const savedSol = await adapters.solicitudes.update(uow, ancla.value.solicitud, input.expectedVersion);
            if (!savedSol.ok) return savedSol;

            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `solicitud-correctiva:${input.solicitudId}`, "diagnosticada", savedSol.value.version, { diagnosticoId: id }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-diagnostico", id, { solicitudId: input.solicitudId });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, solicitudId: input.solicitudId, solicitudVersion: savedSol.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.registrar-diagnostico`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ----------------------- transicionar solicitud -------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar-solicitud`,
          inputSchema: z.object({
            id: z.string().min(1),
            accion: z.enum(ACCIONES_SOLICITUD),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.transicionar-solicitud`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.solicitudes.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.id));
            const solicitud = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR_SOLICITUD, { estado: solicitud.estado });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "solicitud");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, solicitud.workflow, input.accion, ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = aplicarAccionSolicitud(solicitud, input.accion as AccionSolicitud, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.solicitudes.update(uow, cambio.value.solicitud, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `solicitud-correctiva:${input.id}`, input.accion, saved.value.version, { accion: input.accion }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "transicionar-solicitud", input.id, { accion: input.accion });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, estado: saved.value.estado, accion: input.accion, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.transicionar-solicitud`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------- generar orden correctiva (orq) --------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.generar-orden-correctiva`,
          inputSchema: z.object({
            solicitudId: z.string().min(1),
            opId: z.string().optional(),
            id: z.string().uuid().optional(),
          }),
          authorization: { permissions: [`${MODULO}.execute`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.generar-orden-correctiva`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.solicitudes.findById(tenant.value, input.solicitudId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.solicitudId));
            const solicitud = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_GENERAR_ORDEN, { estado: solicitud.estado });
            if (!pol.ok) return pol;

            // Materializador OBLIGATORIO (fail-safe): jamás OT por vías no oficiales.
            if (!adapters.materializador) return fail(KernelErrors.conflict("La generación de OT requiere un MaterializadorOrdenes configurado", { motivo: "materializador-no-configurado" }));

            const clave = claveDedupOrden(input.solicitudId);
            const ahora = new Date().toISOString();

            // Guard anti-duplicado: ¿ya hay una generación para esta solicitud?
            const yaGen = await adapters.generaciones.buscarPorClave(tenant.value, clave);
            if (!yaGen.ok) return yaGen;
            if (yaGen.value && yaGen.value.ordenTrabajoId) {
              const resultado = { id: yaGen.value.id, solicitudId: input.solicitudId, ordenTrabajoId: yaGen.value.ordenTrabajoId, estado: yaGen.value.estado };
              return ok({ ...resultado, idempotente: true });
            }

            // Reserva atómica del guard de dedup.
            const genId = input.id ?? crypto.randomUUID();
            const reserva = await adapters.dedup.reservar(uow, tenant.value, clave, genId);
            if (!reserva.ok) return reserva;
            if (!reserva.value) return fail(KernelErrors.conflict(`Ya existe una generación de OT para la solicitud "${input.solicitudId}"`, { clave }));

            // GOBIERNO (sin bypass): asegura la definición `generacion` e INICIA la
            // instancia (estado `pendiente`) ANTES de persistir la generación. Sin
            // WorkflowPort aprobado ⇒ fallo seguro (KRN-CFL) SIN efectos.
            const wf = exigirWorkflow(adapters, "generacion");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "generacion", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "generacion", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;
            const workflow: ReferenciaWorkflow = { ...ref, instanciaId: inicio.value.instanciaId };

            const gen = crearGeneracionOrden({ id: genId, tenantId: tenant.value, solicitudId: input.solicitudId, activoId: solicitud.objeto.activoId, workflow, estadoInicial: inicio.value.estado.estado as EstadoGeneracion, generadaPor: ctx.principal.id, ahora });
            if (!gen.ok) return gen;
            const savedGen = await adapters.generaciones.insert(uow, gen.value.generacion);
            if (!savedGen.ok) return savedGen;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, gen.value.evento); if (!_e.ok) return _e; }

            // GOBIERNO (sin bypass): exige la transición `materializar` al motor
            // ANTES de crear la OT, de vincular y de persistir el estado
            // `materializada`. El Result del motor se verifica ANTES de cualquier
            // efecto observable: si la DENIEGA, no se materializa ninguna OT ni
            // vínculo (fail-safe) — sólo queda la generación `pendiente`.
            const trans = await wf.value.transicionar(uow, tenant.value, workflow, "materializar", ctx.principal.id);
            if (!trans.ok) return trans;

            // Orquestación fail-safe: crea la OT canónica "correctiva" (idempotente por opId=clave).
            // Ancla la plantilla del diagnóstico (si lo hay) como referencia sólo-lectura en la OT.
            let diagnosticoRef: { plantillaId: string; version: number } | null = null;
            if (solicitud.diagnosticoId) {
              const diag = await adapters.diagnosticos.buscarPorSolicitud(tenant.value, input.solicitudId);
              if (!diag.ok) return diag;
              if (diag.value) diagnosticoRef = { plantillaId: diag.value.plantilla.plantillaId, version: diag.value.plantilla.version };
            }
            const mat = await adapters.materializador.crearOrden(tenant.value, ctx.principal.id, {
              opId: clave,
              generacionId: genId,
              solicitudId: input.solicitudId,
              activoPrincipal: activoPrincipalDeObjeto(solicitud.objeto, "principal"),
              titulo: solicitud.titulo,
              prioridad: solicitud.prioridad,
              tipo: "correctiva",
              diagnostico: diagnosticoRef,
            });
            if (!mat.ok) return mat;

            // Vínculo atómico generación → OT.
            const vinc = await adapters.dedup.vincular(uow, tenant.value, clave, mat.value.ordenTrabajoId);
            if (!vinc.ok) return vinc;
            const materializado = materializarGeneracion(savedGen.value, mat.value.ordenTrabajoId, ahora, trans.value.estado);
            if (!materializado.ok) return materializado;
            const savedMat = await adapters.generaciones.update(uow, materializado.value.generacion, savedGen.value.version);
            if (!savedMat.ok) return savedMat;

            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `solicitud-correctiva:${input.solicitudId}`, "orden-generada", solicitud.version, { ordenTrabajoId: mat.value.ordenTrabajoId }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "generar-orden-correctiva", genId, { ordenTrabajoId: mat.value.ordenTrabajoId });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, materializado.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: genId, solicitudId: input.solicitudId, ordenTrabajoId: mat.value.ordenTrabajoId, estado: savedMat.value.estado };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.generar-orden-correctiva`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- crear intervención -------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-intervencion`,
          inputSchema: z.object({
            solicitudId: z.string().min(1),
            ordenTrabajoId: z.string().min(1),
            opId: z.string().optional(),
            id: z.string().uuid().optional(),
            cuadrillas: z.array(cuadrillaSchema).default([]),
          }),
          authorization: { permissions: [`${MODULO}.execute`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-intervencion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.solicitudes.findById(tenant.value, input.solicitudId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.solicitudId));
            const solicitud = found.value;

            // Validar catálogos de roles/recursos de las cuadrillas.
            const cuadrillas = [];
            for (const c of input.cuadrillas) {
              for (const r of c.responsables) {
                const vr = await adapters.catalogos.validarReferencia(tenant.value, "roles-personal", r.rol, true);
                if (!vr.ok) return vr;
              }
              for (const rec of c.recursos) {
                const vt = await adapters.catalogos.validarReferencia(tenant.value, "tipos-recurso", rec.tipo, true);
                if (!vt.ok) return vt;
              }
              const cc = crearCuadrilla(c);
              if (!cc.ok) return cc;
              cuadrillas.push(cc.value);
            }

            const wf = exigirWorkflow(adapters, "intervencion");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "intervencion", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "intervencion", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const ahora = new Date().toISOString();
            const id = input.id ?? crypto.randomUUID();
            const cambio = crearIntervencion({
              id, tenantId: tenant.value, solicitudId: input.solicitudId, ordenTrabajoId: input.ordenTrabajoId, activoId: solicitud.objeto.activoId,
              cuadrillas, workflow: { ...ref, instanciaId: inicio.value.instanciaId }, estadoInicial: inicio.value.estado.estado as EstadoIntervencion, actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.intervenciones.insert(uow, cambio.value.intervencion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-intervencion", id, { ordenTrabajoId: input.ordenTrabajoId, mayor: saved.value.mayor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, solicitudId: input.solicitudId, ordenTrabajoId: input.ordenTrabajoId, mayor: saved.value.mayor, estado: saved.value.estado, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-intervencion`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------- asignar cuadrillas (mayor) ------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asignar-cuadrillas`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            cuadrillas: z.array(cuadrillaSchema).min(1),
          }),
          authorization: { permissions: [`${MODULO}.execute`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const found = await adapters.intervenciones.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("intervencion-correctiva", input.id));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_ASIGNAR, { estado: found.value.estado });
            if (!pol.ok) return pol;

            const cuadrillas = [];
            for (const c of input.cuadrillas) {
              for (const r of c.responsables) { const vr = await adapters.catalogos.validarReferencia(tenant.value, "roles-personal", r.rol, true); if (!vr.ok) return vr; }
              for (const rec of c.recursos) { const vt = await adapters.catalogos.validarReferencia(tenant.value, "tipos-recurso", rec.tipo, true); if (!vt.ok) return vt; }
              const cc = crearCuadrilla(c); if (!cc.ok) return cc; cuadrillas.push(cc.value);
            }
            const ahora = new Date().toISOString();
            const cambio = asignarCuadrillas(found.value, cuadrillas, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.intervenciones.update(uow, cambio.value.intervencion, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "asignar-cuadrillas", input.id, { cuadrillas: saved.value.cuadrillas.length, mayor: saved.value.mayor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }
            return ok({ id: input.id, mayor: saved.value.mayor, cuadrillas: saved.value.cuadrillas.length, version: saved.value.version });
          },
        };
      },
      /* ---------------------- transicionar intervención ------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar-intervencion`,
          inputSchema: z.object({
            id: z.string().min(1),
            accion: z.enum(ACCIONES_INTERVENCION),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.transicionar-intervencion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.intervenciones.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("intervencion-correctiva", input.id));
            const intervencion = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR_INTERVENCION, { estado: intervencion.estado });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "intervencion");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, intervencion.workflow, input.accion, ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = aplicarAccionIntervencion(intervencion, input.accion as AccionIntervencion, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.intervenciones.update(uow, cambio.value.intervencion, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `intervencion-correctiva:${input.id}`, input.accion, saved.value.version, { accion: input.accion }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "transicionar-intervencion", input.id, { accion: input.accion });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, estado: saved.value.estado, accion: input.accion, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.transicionar-intervencion`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------- reservar repuestos (inventario) ------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reservar-repuestos`,
          inputSchema: z.object({
            intervencionId: z.string().min(1),
            opId: z.string().optional(),
            lineas: z.array(lineaRepuestoSchema).min(1),
            /** Prioridad de la solicitud de compra si hay faltantes. */
            prioridadCompra: z.string().min(1).optional(),
          }),
          authorization: { permissions: [`${MODULO}.execute`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.reservar-repuestos`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.intervenciones.findById(tenant.value, input.intervencionId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("intervencion-correctiva", input.intervencionId));
            const intervencion = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CONSUMIR_INVENTARIO, { estado: intervencion.estado });
            if (!pol.ok) return pol;

            if (!adapters.inventario) return fail(KernelErrors.conflict("La gestión de repuestos requiere un InventarioPort configurado", { motivo: "inventario-no-configurado" }));

            const lineas: LineaRepuesto[] = input.lineas.map((l: LineaRepuesto) => ({ ...l }));
            const disp = await adapters.inventario.verificarDisponibilidad(tenant.value, lineas);
            if (!disp.ok) return disp;

            const ahora = new Date().toISOString();
            const opId = input.opId ?? `resv:${input.intervencionId}`;

            // Reservar disponibles.
            if (disp.value.disponibles.length > 0) {
              const rv = await adapters.inventario.reservar(tenant.value, ctx.principal.id, { opId, demandaId: intervencion.ordenTrabajoId, lineas: disp.value.disponibles });
              if (!rv.ok) return rv;
              { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, { tipo: REPUESTOS_RESERVADOS, payload: { tenantId: tenant.value, id: input.intervencionId, entityRef: `intervencion-correctiva:${input.intervencionId}`, ordenTrabajoId: intervencion.ordenTrabajoId, lineas: disp.value.disponibles.length, actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: REPUESTOS_RESERVADOS } }); if (!_e.ok) return _e; }
            }

            // Ante FALTANTES: auto-solicitud de compra (Abastecimiento, origen tipo "orden").
            let solicitudCompraId: string | null = null;
            if (disp.value.faltantes.length > 0) {
              if (!adapters.abastecimiento) return fail(KernelErrors.conflict("El faltante de stock requiere un AbastecimientoPort configurado", { motivo: "abastecimiento-no-configurado" }));
              const compraOpId = `compra:${intervencion.ordenTrabajoId}`;
              const compra = await adapters.abastecimiento.solicitarCompra(tenant.value, ctx.principal.id, {
                opId: compraOpId,
                titulo: `Reposición para OT ${intervencion.ordenTrabajoId}`,
                prioridad: input.prioridadCompra ?? "alta",
                referenciaId: intervencion.ordenTrabajoId,
                lineas: disp.value.faltantes.map((f, i) => ({ numero: i + 1, articuloId: f.articuloId, cantidad: f.cantidad - f.disponible })),
              });
              if (!compra.ok) return compra;
              solicitudCompraId = compra.value.solicitudCompraId;
              { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, { tipo: COMPRA_SOLICITADA, payload: { tenantId: tenant.value, id: input.intervencionId, entityRef: `intervencion-correctiva:${input.intervencionId}`, ordenTrabajoId: intervencion.ordenTrabajoId, solicitudCompraId, faltantes: disp.value.faltantes.length, actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: COMPRA_SOLICITADA } }); if (!_e.ok) return _e; }
            }

            const resultado = { intervencionId: input.intervencionId, reservadas: disp.value.disponibles.length, faltantes: disp.value.faltantes.length, solicitudCompraId };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.reservar-repuestos`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- consumir repuesto ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.consumir-repuesto`,
          inputSchema: z.object({
            intervencionId: z.string().min(1),
            opId: z.string().optional(),
            linea: lineaRepuestoSchema,
          }),
          authorization: { permissions: [`${MODULO}.execute`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.consumir-repuesto`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.intervenciones.findById(tenant.value, input.intervencionId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("intervencion-correctiva", input.intervencionId));
            const intervencion = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CONSUMIR_INVENTARIO, { estado: intervencion.estado });
            if (!pol.ok) return pol;
            if (!adapters.inventario) return fail(KernelErrors.conflict("El consumo requiere un InventarioPort configurado", { motivo: "inventario-no-configurado" }));

            const opId = input.opId ?? `cons:${input.intervencionId}:${input.linea.inventarioId}`;
            const cons = await adapters.inventario.consumir(tenant.value, ctx.principal.id, { opId, demandaId: intervencion.ordenTrabajoId, linea: input.linea });
            if (!cons.ok) return cons;

            const ahora = new Date().toISOString();
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, { tipo: INVENTARIO_CONSUMIDO, payload: { tenantId: tenant.value, id: input.intervencionId, entityRef: `intervencion-correctiva:${input.intervencionId}`, ordenTrabajoId: intervencion.ordenTrabajoId, inventarioId: input.linea.inventarioId, cantidadConsumida: cons.value.cantidadConsumida, consumidoTotal: cons.value.consumidoTotal, actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: INVENTARIO_CONSUMIDO } }); if (!_e.ok) return _e; }

            const resultado = { intervencionId: input.intervencionId, cantidadConsumida: cons.value.cantidadConsumida, consumidoTotal: cons.value.consumidoTotal };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.consumir-repuesto`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- devolver repuesto ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.devolver-repuesto`,
          inputSchema: z.object({
            intervencionId: z.string().min(1),
            opId: z.string().optional(),
            linea: lineaRepuestoSchema,
          }),
          authorization: { permissions: [`${MODULO}.execute`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.devolver-repuesto`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.intervenciones.findById(tenant.value, input.intervencionId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("intervencion-correctiva", input.intervencionId));
            const intervencion = found.value;
            if (!adapters.inventario) return fail(KernelErrors.conflict("La devolución requiere un InventarioPort configurado", { motivo: "inventario-no-configurado" }));

            const opId = input.opId ?? `dev:${input.intervencionId}:${input.linea.inventarioId}`;
            const dev = await adapters.inventario.devolver(tenant.value, ctx.principal.id, { opId, demandaId: intervencion.ordenTrabajoId, linea: input.linea });
            if (!dev.ok) return dev;

            const ahora = new Date().toISOString();
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, { tipo: INVENTARIO_DEVUELTO, payload: { tenantId: tenant.value, id: input.intervencionId, entityRef: `intervencion-correctiva:${input.intervencionId}`, ordenTrabajoId: intervencion.ordenTrabajoId, inventarioId: input.linea.inventarioId, cantidad: input.linea.cantidad, actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: INVENTARIO_DEVUELTO } }); if (!_e.ok) return _e; }

            const resultado = { intervencionId: input.intervencionId, inventarioId: input.linea.inventarioId, cantidad: input.linea.cantidad };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.devolver-repuesto`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ----------------------- registrar evento de activo --------------- */
      (deps) => ({
        name: `${MODULO}.registrar-evento-activo`,
        inputSchema: z.object({
          activoId: z.string().min(1),
          tipo: z.enum(TIPOS_EVENTO_ACTIVO),
          solicitudId: z.string().min(1).nullable().optional(),
          ordenTrabajoId: z.string().min(1).nullable().optional(),
          modoFalla: z.string().min(1).nullable().optional(),
          ocurridoEn: z.string().min(1).optional(),
          insumosKpi: z.object({
            tiempoEntreFallasMin: z.number().nonnegative().nullable().optional(),
            tiempoReparacionMin: z.number().nonnegative().nullable().optional(),
            tiempoIndisponibleMin: z.number().nonnegative().nullable().optional(),
          }).optional(),
          id: z.string().uuid().optional(),
        }),
        authorization: { permissions: [`${MODULO}.execute`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;

          if (input.modoFalla) {
            const vm = await adapters.catalogos.validarReferencia(tenant.value, "modos-falla", input.modoFalla, false);
            if (!vm.ok) return vm;
          }

          const ahora = input.ocurridoEn ?? new Date().toISOString();
          const id = input.id ?? crypto.randomUUID();

          // Detección de reincidencia (mismo activo + mismo modo dentro de ventana).
          const previos = await adapters.eventosActivo.listPorActivo(tenant.value, input.activoId);
          if (!previos.ok) return previos;
          const ventanaDias = Number(await cfg(deps, tenant.value, "reincidencia-ventana-dias", "90"));
          const deteccion = detectarReincidencia(
            { modoFalla: input.modoFalla ?? null, ocurridoEn: ahora },
            previos.value.map((p) => ({ modoFalla: p.modoFalla, ocurridoEn: p.ocurridoEn })),
            ventanaDias,
          );

          const cambio = crearEventoActivo({
            id, tenantId: tenant.value, activoId: input.activoId, solicitudId: input.solicitudId ?? null, ordenTrabajoId: input.ordenTrabajoId ?? null,
            tipo: input.tipo, modoFalla: input.modoFalla ?? null, ocurridoEn: ahora, insumosKpi: input.insumosKpi, registradoPor: ctx.principal.id,
          });
          if (!cambio.ok) return cambio;
          const saved = await adapters.eventosActivo.append(uow, cambio.value.evento);
          if (!saved.ok) return saved;
          { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.eventoDominio); if (!_e.ok) return _e; }

          if (deteccion.reincidente) {
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: REINCIDENCIA_DETECTADA,
              payload: {
                tenantId: tenant.value, id, entityRef: `activo:${input.activoId}`, activoId: input.activoId, modoFalla: deteccion.modoFalla,
                ocurrenciasEnVentana: deteccion.ocurrenciasEnVentana, ventanaDias: deteccion.ventanaDias,
                actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: REINCIDENCIA_DETECTADA,
              },
            });
            if (!_e.ok) return _e;
          }
          const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-evento-activo", id, { tipo: input.tipo, reincidente: deteccion.reincidente });
          if (!audited.ok) return audited;
          return ok({ id, activoId: input.activoId, reincidente: deteccion.reincidente, ocurrenciasEnVentana: deteccion.ocurrenciasEnVentana });
        },
      }),
      /* --------------------------- reproyectar --------------------------- */
      // REPROYECCIÓN por REPLAY: reconstruye los read models desde la bitácora
      // durable (`cor_eventos`) — equivalencia con la proyección en vivo. Limpia
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
        name: `${MODULO}.solicitud-detalle`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          // DETALLE servido SIEMPRE desde read model (lección 009.2) cuando está
          // configurado; jamás toca la tabla de escritura.
          if (adapters.readModel) {
            const rm = await adapters.readModel.solicitudGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.solicitudes.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("solicitud-correctiva", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.solicitudes`,
        inputSchema: z.object({ estado: z.string().optional(), origen: z.string().optional(), activoId: z.string().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.solicitudList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.solicitudes.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.intervencion-detalle`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.intervencionGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("intervencion-correctiva", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.intervenciones.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("intervencion-correctiva", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.eventos-activo`,
        inputSchema: z.object({ activoId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.eventosPorActivo(tenant.value, input.activoId);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => ({ ...x.datos, reincidente: x.reincidente })));
          }
          const r = await adapters.eventosActivo.listPorActivo(tenant.value, input.activoId);
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
          return ok(r.value as unknown as Record<string, unknown>[]);
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
