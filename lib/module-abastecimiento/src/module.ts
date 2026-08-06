/**
 * DGP-013 · Módulo Enterprise Procurement & Supply Chain — Capa de aplicación +
 * descriptor del servicio de plataforma.
 *
 * ETAPA 1 (dominio + servicio): se registra por el ÚNICO mecanismo permitido
 * (extraServices de createPlatformRuntime). Persistencia en FAKES en memoria; los
 * adaptadores reales (PostgreSQL / read models CQRS / OpenAPI / UI) llegan en la
 * ETAPA 2. TODO ciclo de vida gobernado (solicitud / orden de compra / recepción)
 * pasa por el Workflow Engine: sin un `WorkflowPort` aprobado, los comandos
 * gobernados FALLAN de forma segura (KRN-CFL-001) y NO alteran el aggregate —
 * nunca auto-aprueban. La auto-aprobación es EXCLUSIVA de pruebas (test-runtime).
 *
 * REGLA DE ORO (lección 009.3): la INTEGRACIÓN real con Inventario/Órdenes/Planes
 * (registrar entradas, actualizar costos en inventario, liberar reservas) NO se
 * hace aquí por comandos anidados. El dominio DERIVA los efectos de forma pura
 * (integraciones.ts + cost-engine.ts) y actualiza los costos del PROPIO catálogo;
 * la orquestación cross-módulo idempotente llega en la ETAPA 2.
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
  COSTOS_ACTUALIZADOS,
  COTIZACION_COMPARADA,
  COTIZACION_SELECCIONADA,
  EVENTOS_MODULO,
  HISTORIAL_REGISTRADO,
} from "./domain/events";
import {
  aplicarCostos,
  crearArticulo,
  editarArticulo,
  type EditarArticuloInput,
} from "./domain/articulo";
import {
  calificarProveedor,
  crearProveedor,
  editarProveedor,
  type EditarProveedorInput,
} from "./domain/proveedor";
import {
  ACCIONES_SOLICITUD,
  aplicarAccionSolicitud,
  crearSolicitud,
  type AccionSolicitud,
  type EstadoSolicitud,
} from "./domain/solicitud";
import {
  compararCotizaciones,
  crearCotizacion,
  PESOS_COMPARACION_DEFAULT,
  type CandidataComparacion,
} from "./domain/cotizacion";
import {
  ACCIONES_OC,
  aplicarAccionOrdenCompra,
  aplicarRecepcionOrdenCompra,
  crearOrdenCompra,
  type AccionOC,
  type EntradaRecepcion,
  type EstadoOC,
} from "./domain/orden-compra";
import { registrarRecepcion } from "./domain/recepcion";
import { derivarEfectosRecepcion } from "./domain/integraciones";
import { aplicarEntradaCosto } from "./domain/cost-engine";
import { crearHistorial } from "./domain/historial";
import {
  crearContactoProveedor,
  crearCertificacion,
  crearSla,
  crearLineaSolicitud,
  crearLineaCotizacion,
  crearLineaOrdenCompra,
  crearLineaRecepcion,
  crearReferenciaOrigen,
  type Certificacion,
  type ContactoProveedor,
  type LineaCotizacion,
  type LineaOrdenCompra,
  type LineaRecepcion,
  type LineaSolicitud,
  type Sla,
} from "./domain/value-objects";
import {
  policiesDelModulo,
  POLICY_PUEDE_CALIFICAR_PROVEEDOR,
  POLICY_PUEDE_CREAR_ARTICULO,
  POLICY_PUEDE_CREAR_OC,
  POLICY_PUEDE_CREAR_PROVEEDOR,
  POLICY_PUEDE_CREAR_SOLICITUD,
  POLICY_PUEDE_EDITAR_ARTICULO,
  POLICY_PUEDE_RECIBIR,
  POLICY_PUEDE_REGISTRAR_COTIZACION,
  POLICY_PUEDE_TRANSICIONAR_OC,
  POLICY_PUEDE_TRANSICIONAR_SOLICITUD,
} from "./domain/policies";
import {
  CONFIG_CODIGO_DEFAULT,
  type ArticuloRepository,
  type CatalogoPort,
  type ConfigCodigo,
  type ConsecutivoPort,
  type CotizacionRepository,
  type EventLogStore,
  type HistorialRepository,
  type OrdenCompraRepository,
  type ProveedorRepository,
  type ReciboPort,
  type RecepcionRepository,
  type SerieDocumento,
  type SolicitudRepository,
} from "./domain/ports";
import type { ProcesoWorkflow, ReferenciaWorkflow, WorkflowPort } from "./domain/workflow";
import type {
  MaterializacionStore,
  MaterializadorInventario,
} from "./domain/ports";
import type {
  ConsolaStore,
  ReadModelsStore,
  SyncReceiptStore,
} from "./infrastructure/operacional";
import { aplicarEventoAggregate, handlerProyeccion, type ProyeccionAdapters } from "./projection";

export { MODULO };

/* ------------------------------- Adaptadores ----------------------------- */

export interface ModuleAdapters {
  readonly articulos: ArticuloRepository;
  readonly proveedores: ProveedorRepository;
  readonly solicitudes: SolicitudRepository;
  readonly cotizaciones: CotizacionRepository;
  readonly ordenes: OrdenCompraRepository;
  readonly recepciones: RecepcionRepository;
  readonly historial: HistorialRepository;
  readonly catalogos: CatalogoPort;
  readonly consecutivo: ConsecutivoPort;
  readonly recibos: ReciboPort;
  readonly eventLog: EventLogStore;
  /**
   * Adaptador del Workflow Engine (contrato neutro). OPCIONAL en el tipo porque
   * el módulo puede montarse sin él, pero los comandos gobernados FALLAN de forma
   * segura si no está provisto — nunca auto-aprueban. La auto-aprobación es
   * EXCLUSIVA de pruebas (test-runtime).
   */
  readonly workflow?: WorkflowPort;
  /**
   * Read models CQRS. OPCIONAL: si está presente, las consultas se sirven desde
   * los read models (incl. detalle); si no, caen al aggregate (ETAPA 1).
   */
  readonly readModel?: ReadModelsStore;
  /** Recibos durables de sincronización offline (reclamación por opId). */
  readonly syncReceipts?: SyncReceiptStore;
  /** Consola técnica (lectura del outbox del Kernel). */
  readonly consola?: ConsolaStore;
  /**
   * Materializador de Inventario (colaborador cross-módulo). OPCIONAL: sin él,
   * el orquestador `materializar-recepcion` FALLA de forma segura (KRN-CFL) —
   * nunca crea movimientos por vías no oficiales.
   */
  readonly materializador?: MaterializadorInventario;
  /** Dedup durable del vínculo recepción-línea → movimiento de inventario. */
  readonly materializaciones?: MaterializacionStore;
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
    const entityRef = String(p["entityRef"] ?? (p["id"] ? `abastecimiento:${String(p["id"])}` : ""));
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

/* -------------------------- Esquemas compartidos ------------------------- */

/** Tablas del módulo protegidas por RLS (para la consola técnica de admin). */
const TABLAS_RLS_MODULO: readonly string[] = [
  "abs_articulos", "abs_proveedores", "abs_solicitudes", "abs_cotizaciones",
  "abs_ordenes_compra", "abs_recepciones", "abs_historial", "abs_catalogos",
  "abs_secuencias", "abs_recibos", "abs_eventos", "abs_sync_receipts",
  "abs_recepcion_materializaciones",
  "abs_articulos_read", "abs_proveedores_read", "abs_solicitudes_read",
  "abs_cotizaciones_read", "abs_ordenes_compra_read", "abs_recepciones_read",
  "abs_historial_read", "abs_costos_read",
];

const cantidadSchema = z.object({ valor: z.number().positive(), unidad: z.string().min(1) });
const dineroSchema = z.object({ moneda: z.string().min(1), monto: z.number().nonnegative() });
const referenciaExternaSchema = z.object({ tipo: z.string().min(1), id: z.string().min(1), etiqueta: z.string().optional() });

const lineaSolicitudSchema = z.object({
  numero: z.number().int().positive(),
  articuloId: z.string().min(1).nullable().optional(),
  descripcion: z.string().min(1).nullable().optional(),
  cantidad: cantidadSchema,
  prioridad: z.string().min(1).nullable().optional(),
  referencia: referenciaExternaSchema.nullable().optional(),
});
const lineaCotizacionSchema = z.object({
  numero: z.number().int().positive(),
  articuloId: z.string().min(1).nullable().optional(),
  descripcion: z.string().min(1).nullable().optional(),
  cantidad: cantidadSchema,
  precioUnitario: dineroSchema,
  plazoEntregaDias: z.number().int().nonnegative().optional(),
});
const lineaOrdenSchema = z.object({
  numero: z.number().int().positive(),
  articuloId: z.string().min(1).nullable().optional(),
  descripcion: z.string().min(1).nullable().optional(),
  cantidad: cantidadSchema,
  precioUnitario: dineroSchema,
  toleranciaSobreRecepcion: z.number().min(0).max(1).optional(),
  referencia: referenciaExternaSchema.nullable().optional(),
  bodega: referenciaExternaSchema.nullable().optional(),
});
const lineaRecepcionSchema = z.object({
  numeroLineaOC: z.number().int().positive(),
  cantidad: cantidadSchema,
  novedad: z.string().min(1).optional(),
  notaNovedad: z.string().nullable().optional(),
  lote: z.string().nullable().optional(),
  serie: z.string().nullable().optional(),
  bodega: referenciaExternaSchema.nullable().optional(),
});

/* ------------------------------ Descriptor ------------------------------- */

export function abastecimientoModule(adapters: ModuleAdapters): PlatformServiceDefinition {
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
      "Enterprise Procurement & Supply Chain — dominio (DGP-013): catálogo maestro de artículos/servicios, proveedores (comercial/contactos/certificaciones/SLA/calificación), solicitudes de compra con origen declarativo, cotizaciones multi-proveedor con comparación pura, órdenes de compra gobernadas, recepciones parciales/totales/con novedades por líneas, motor de costos determinista (promedio ponderado/último/estándar) y ciclo de vida gobernado por el Workflow Engine.",
    capabilities: [
      { name: "gestionar-catalogo", permissions: [`${MODULO}.read`, `${MODULO}.write`], description: "Alta y edición de artículos y proveedores" },
      { name: "gestionar-compras", permissions: [`${MODULO}.read`, `${MODULO}.write`], description: "Solicitudes, cotizaciones y órdenes de compra" },
      { name: "gobernar-compras", permissions: [`${MODULO}.read`, `${MODULO}.govern`], description: "Enviar/aprobar/rechazar/cerrar/cancelar (workflow)" },
      { name: "recibir-compras", permissions: [`${MODULO}.read`, `${MODULO}.receive`], description: "Registrar recepciones y actualizar costos" },
      { name: "administrar-compras", permissions: [`${MODULO}.admin`], description: "Catálogos configurables del módulo" },
    ],
    permissions: [`${MODULO}.read`, `${MODULO}.write`, `${MODULO}.govern`, `${MODULO}.receive`, `${MODULO}.admin`],
    dependsOn: ["platform.config", "platform.timeline"],
    events: [...EVENTOS_MODULO],
    recordTypes: [
      "catalogo-articulo",
      "proveedor",
      "solicitud-compra",
      "cotizacion",
      "orden-compra",
      "recepcion",
      "historial-abastecimiento",
      "secuencia",
      "recibo-op",
      ...recordTypesCatalogos(),
    ],
    configDefaults: {
      "max-longitud-nombre": "200",
      "codigo-articulo-prefijo": CONFIG_CODIGO_DEFAULT.articulo.prefijo,
      "codigo-proveedor-prefijo": CONFIG_CODIGO_DEFAULT.proveedor.prefijo,
      "codigo-solicitud-prefijo": CONFIG_CODIGO_DEFAULT.solicitud.prefijo,
      "codigo-orden-compra-prefijo": CONFIG_CODIGO_DEFAULT["orden-compra"].prefijo,
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
      /* ----------------------------- crear artículo ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-articulo`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            nombre: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            tipo: z.string().min(1),
            unidad: z.string().min(1),
            familia: z.string().min(1).nullable().optional(),
            metodoValoracion: z.string().min(1),
            moneda: z.string().min(1),
            costoEstandar: z.number().nonnegative().optional(),
            toleranciaSobreRecepcion: z.number().min(0).max(1).optional(),
            inventarioItemId: z.string().min(1).nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-articulo`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_ARTICULO, {});
            if (!pol.ok) return pol;

            const val = await validarClasificacion(
              adapters, tenant.value,
              { "tipos-articulo": input.tipo, "unidades-medida": input.unidad, "familias-articulo": input.familia, "monedas": input.moneda, "metodos-valoracion": input.metodoValoracion },
              ["tipos-articulo", "unidades-medida", "monedas", "metodos-valoracion"],
            );
            if (!val.ok) return val;

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date().toISOString();
            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value, "articulo"), ctx.principal.id);
            if (!codigo.ok) return codigo;
            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "200"));

            const cambio = crearArticulo({
              id, tenantId: tenant.value, codigo: codigo.value.valor, nombre: input.nombre, descripcion: input.descripcion ?? null,
              tipo: input.tipo, unidad: input.unidad, familia: input.familia ?? null, metodoValoracion: input.metodoValoracion,
              moneda: input.moneda, costoEstandar: input.costoEstandar, toleranciaSobreRecepcion: input.toleranciaSobreRecepcion,
              inventarioItemId: input.inventarioItemId ?? null, actorId: ctx.principal.id, ahora, maxLongitudNombre: maxNombre,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.articulos.insert(uow, cambio.value.articulo);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `catalogo-articulo:${id}`, "creado", saved.value.version, { codigo: codigo.value.valor }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-articulo", id, { codigo: codigo.value.valor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, codigo: codigo.value.valor, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-articulo`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- editar artículo ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar-articulo`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            nombre: z.string().min(1).optional(),
            descripcion: z.string().nullable().optional(),
            familia: z.string().min(1).nullable().optional(),
            unidad: z.string().min(1).optional(),
            metodoValoracion: z.string().min(1).optional(),
            toleranciaSobreRecepcion: z.number().min(0).max(1).optional(),
            inventarioItemId: z.string().min(1).nullable().optional(),
            activo: z.boolean().optional(),
            costoEstandar: z.number().nonnegative().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.editar-articulo`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.articulos.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("catalogo-articulo", input.id));
            const articulo = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR_ARTICULO, { activo: articulo.activo });
            if (!pol.ok) return pol;

            if (input.unidad || input.metodoValoracion || input.familia !== undefined) {
              const val = await validarClasificacion(
                adapters, tenant.value,
                { "unidades-medida": input.unidad, "metodos-valoracion": input.metodoValoracion, "familias-articulo": input.familia ?? undefined },
                [],
              );
              if (!val.ok) return val;
            }

            const cambios: {
              -readonly [K in keyof EditarArticuloInput]?: EditarArticuloInput[K];
            } = {};
            if (input.nombre !== undefined) cambios.nombre = input.nombre;
            if (input.descripcion !== undefined) cambios.descripcion = input.descripcion;
            if (input.familia !== undefined) cambios.familia = input.familia;
            if (input.unidad !== undefined) cambios.unidad = input.unidad;
            if (input.metodoValoracion !== undefined) cambios.metodoValoracion = input.metodoValoracion;
            if (input.toleranciaSobreRecepcion !== undefined) cambios.toleranciaSobreRecepcion = input.toleranciaSobreRecepcion;
            if (input.inventarioItemId !== undefined) cambios.inventarioItemId = input.inventarioItemId;
            if (input.activo !== undefined) cambios.activo = input.activo;
            if (input.costoEstandar !== undefined) cambios.costoEstandar = input.costoEstandar;

            const ahora = new Date().toISOString();
            const cambio = editarArticulo(articulo, cambios, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.articulos.update(uow, cambio.value.articulo, input.expectedVersion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "editar-articulo", input.id, {});
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.editar-articulo`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- crear proveedor ---------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-proveedor`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            razonSocial: z.string().min(1),
            nombreComercial: z.string().min(1).nullable().optional(),
            identificacionTributaria: z.string().min(1).nullable().optional(),
            tipo: z.string().min(1),
            monedaPreferida: z.string().min(1).nullable().optional(),
            contactos: z.array(z.record(z.string(), z.unknown())).optional(),
            certificaciones: z.array(z.record(z.string(), z.unknown())).optional(),
            sla: z.record(z.string(), z.unknown()).nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-proveedor`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_PROVEEDOR, {});
            if (!pol.ok) return pol;

            const val = await validarClasificacion(
              adapters, tenant.value,
              { "tipos-proveedor": input.tipo, "monedas": input.monedaPreferida ?? undefined },
              ["tipos-proveedor"],
            );
            if (!val.ok) return val;

            const contactos: ContactoProveedor[] = [];
            for (const c of input.contactos ?? []) { const r = crearContactoProveedor(c); if (!r.ok) return r; contactos.push(r.value); }
            const certificaciones: Certificacion[] = [];
            for (const c of input.certificaciones ?? []) { const r = crearCertificacion(c); if (!r.ok) return r; certificaciones.push(r.value); }
            let sla: Sla | null = null;
            if (input.sla) { const r = crearSla(input.sla); if (!r.ok) return r; sla = r.value; }

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date().toISOString();
            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value, "proveedor"), ctx.principal.id);
            if (!codigo.ok) return codigo;
            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "200"));

            const cambio = crearProveedor({
              id, tenantId: tenant.value, codigo: codigo.value.valor, razonSocial: input.razonSocial,
              nombreComercial: input.nombreComercial ?? null, identificacionTributaria: input.identificacionTributaria ?? null,
              tipo: input.tipo, monedaPreferida: input.monedaPreferida ?? null, contactos, certificaciones, sla,
              actorId: ctx.principal.id, ahora, maxLongitudNombre: maxNombre,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.proveedores.insert(uow, cambio.value.proveedor);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `proveedor:${id}`, "creado", saved.value.version, { codigo: codigo.value.valor }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-proveedor", id, { codigo: codigo.value.valor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, codigo: codigo.value.valor, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-proveedor`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- editar proveedor ---------------------- */
      (deps) => ({
        name: `${MODULO}.editar-proveedor`,
        inputSchema: z.object({
          id: z.string().min(1),
          expectedVersion: z.number().int().positive(),
          opId: z.string().optional(),
          razonSocial: z.string().min(1).optional(),
          nombreComercial: z.string().min(1).nullable().optional(),
          identificacionTributaria: z.string().min(1).nullable().optional(),
          tipo: z.string().min(1).optional(),
          monedaPreferida: z.string().min(1).nullable().optional(),
          contactos: z.array(z.record(z.string(), z.unknown())).optional(),
          certificaciones: z.array(z.record(z.string(), z.unknown())).optional(),
          sla: z.record(z.string(), z.unknown()).nullable().optional(),
          activo: z.boolean().optional(),
        }),
        authorization: { permissions: [`${MODULO}.write`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.editar-proveedor`, input.opId);
          if (previo) return ok({ ...previo, idempotente: true });

          const found = await adapters.proveedores.findById(tenant.value, input.id);
          if (!found.ok) return found;
          if (!found.value) return fail(KernelErrors.notFound("proveedor", input.id));

          if (input.tipo || input.monedaPreferida !== undefined) {
            const val = await validarClasificacion(
              adapters, tenant.value,
              { "tipos-proveedor": input.tipo, "monedas": input.monedaPreferida ?? undefined },
              [],
            );
            if (!val.ok) return val;
          }

          const cambios: {
            -readonly [K in keyof EditarProveedorInput]?: EditarProveedorInput[K];
          } = {};
          if (input.razonSocial !== undefined) cambios.razonSocial = input.razonSocial;
          if (input.nombreComercial !== undefined) cambios.nombreComercial = input.nombreComercial;
          if (input.identificacionTributaria !== undefined) cambios.identificacionTributaria = input.identificacionTributaria;
          if (input.tipo !== undefined) cambios.tipo = input.tipo;
          if (input.monedaPreferida !== undefined) cambios.monedaPreferida = input.monedaPreferida;
          if (input.activo !== undefined) cambios.activo = input.activo;
          if (input.contactos) {
            const cs: ContactoProveedor[] = [];
            for (const c of input.contactos) { const r = crearContactoProveedor(c); if (!r.ok) return r; cs.push(r.value); }
            cambios.contactos = cs;
          }
          if (input.certificaciones) {
            const cs: Certificacion[] = [];
            for (const c of input.certificaciones) { const r = crearCertificacion(c); if (!r.ok) return r; cs.push(r.value); }
            cambios.certificaciones = cs;
          }
          if (input.sla !== undefined) {
            if (input.sla === null) cambios.sla = null;
            else { const r = crearSla(input.sla); if (!r.ok) return r; cambios.sla = r.value; }
          }

          const ahora = new Date().toISOString();
          const cambio = editarProveedor(found.value, cambios, ctx.principal.id, ahora);
          if (!cambio.ok) return cambio;
          const saved = await adapters.proveedores.update(uow, cambio.value.proveedor, input.expectedVersion);
          if (!saved.ok) return saved;
          const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "editar-proveedor", input.id, {});
          if (!audited.ok) return audited;
          { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

          const resultado = { id: input.id, version: saved.value.version };
          const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.editar-proveedor`, input.opId, resultado, ctx.principal.id);
          if (!rec.ok) return rec;
          return ok({ ...resultado, idempotente: false });
        },
      }),
      /* -------------------------- calificar proveedor -------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.calificar-proveedor`,
          inputSchema: z.object({
            id: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            calidad: z.number().min(0).max(5),
            tiempo: z.number().min(0).max(5),
            precio: z.number().min(0).max(5),
            servicio: z.number().min(0).max(5),
            nota: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.calificar-proveedor`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.proveedores.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("proveedor", input.id));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CALIFICAR_PROVEEDOR, { activo: found.value.activo });
            if (!pol.ok) return pol;

            const ahora = new Date().toISOString();
            const cambio = calificarProveedor(found.value, {
              calidad: input.calidad, tiempo: input.tiempo, precio: input.precio, servicio: input.servicio,
              nota: input.nota ?? null, calificadoEn: ahora, calificadoPor: ctx.principal.id,
            }, ctx.principal.id);
            if (!cambio.ok) return cambio;
            const saved = await adapters.proveedores.update(uow, cambio.value.proveedor, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `proveedor:${input.id}`, "calificado", saved.value.version, { promedio: saved.value.calificacionPromedio }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "calificar-proveedor", input.id, {});
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, calificacionPromedio: saved.value.calificacionPromedio, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.calificar-proveedor`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
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
            prioridad: z.string().min(1),
            origen: z.object({
              tipo: z.string().min(1),
              referenciaId: z.string().min(1).nullable().optional(),
              referenciaTipo: z.string().min(1).nullable().optional(),
              etiqueta: z.string().nullable().optional(),
            }),
            lineas: z.array(lineaSolicitudSchema).min(1),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-solicitud`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_SOLICITUD, {});
            if (!pol.ok) return pol;

            const val = await validarClasificacion(
              adapters, tenant.value,
              { "prioridades": input.prioridad, "origenes-solicitud": input.origen.tipo },
              ["prioridades", "origenes-solicitud"],
            );
            if (!val.ok) return val;

            const origen = crearReferenciaOrigen(input.origen);
            if (!origen.ok) return origen;
            const lineas: LineaSolicitud[] = [];
            for (const l of input.lineas) { const r = crearLineaSolicitud(l); if (!r.ok) return r; lineas.push(r.value); }

            // Gobierno: exige Workflow Engine aprobado ANTES de cualquier efecto.
            const wf = exigirWorkflow(adapters, "solicitud");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "solicitud", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "solicitud", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date().toISOString();
            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value, "solicitud"), ctx.principal.id);
            if (!codigo.ok) return codigo;

            const cambio = crearSolicitud({
              id, tenantId: tenant.value, codigo: codigo.value.valor, titulo: input.titulo, descripcion: input.descripcion ?? null,
              origen: origen.value, prioridad: input.prioridad, lineas, workflow: { ...ref, instanciaId: inicio.value.instanciaId },
              estadoInicial: inicio.value.estado.estado as EstadoSolicitud, actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.solicitudes.insert(uow, cambio.value.solicitud);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `solicitud-compra:${id}`, "creado", saved.value.version, { codigo: codigo.value.valor }, ahora, ctx.principal.id);
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
      /* ------------------------- transicionar solicitud ------------------ */
      // Cada acción (enviar/aprobar/rechazar/cerrar) es una transición REAL: el
      // motor decide y su Result se verifica ANTES de cualquier efecto.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar-solicitud`,
          inputSchema: z.object({
            id: z.string().min(1),
            accion: z.enum(ACCIONES_SOLICITUD),
            expectedVersion: z.number().int().positive(),
            motivoRechazo: z.string().min(1).nullable().optional(),
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
            if (!found.value) return fail(KernelErrors.notFound("solicitud-compra", input.id));
            const solicitud = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR_SOLICITUD, { estado: solicitud.estado });
            if (!pol.ok) return pol;

            // Gobierno REAL: verifica el Result del motor ANTES de cualquier efecto.
            const wf = exigirWorkflow(adapters, "solicitud");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, solicitud.workflow, input.accion, ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = aplicarAccionSolicitud(solicitud, input.accion as AccionSolicitud, ctx.principal.id, ahora, { motivoRechazo: input.motivoRechazo ?? null });
            if (!cambio.ok) return cambio;
            const saved = await adapters.solicitudes.update(uow, cambio.value.solicitud, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `solicitud-compra:${input.id}`, input.accion, saved.value.version, { accion: input.accion }, ahora, ctx.principal.id);
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
      /* -------------------------- registrar cotización ------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-cotizacion`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            solicitudId: z.string().min(1),
            proveedorId: z.string().min(1),
            moneda: z.string().min(1),
            condicionesPago: z.string().min(1).nullable().optional(),
            vigenteHasta: z.string().min(1).nullable().optional(),
            lineas: z.array(lineaCotizacionSchema).min(1),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.registrar-cotizacion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const sol = await adapters.solicitudes.findById(tenant.value, input.solicitudId);
            if (!sol.ok) return sol;
            if (!sol.value) return fail(KernelErrors.notFound("solicitud-compra", input.solicitudId));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_REGISTRAR_COTIZACION, { estadoSolicitud: sol.value.estado });
            if (!pol.ok) return pol;

            const prov = await adapters.proveedores.findById(tenant.value, input.proveedorId);
            if (!prov.ok) return prov;
            if (!prov.value) return fail(KernelErrors.notFound("proveedor", input.proveedorId));

            const val = await validarClasificacion(
              adapters, tenant.value,
              { "monedas": input.moneda, "condiciones-pago": input.condicionesPago ?? undefined },
              ["monedas"],
            );
            if (!val.ok) return val;

            const lineas: LineaCotizacion[] = [];
            for (const l of input.lineas) { const r = crearLineaCotizacion(l); if (!r.ok) return r; lineas.push(r.value); }

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date().toISOString();
            const cambio = crearCotizacion({
              id, tenantId: tenant.value, solicitudId: input.solicitudId, proveedorId: input.proveedorId,
              moneda: input.moneda, lineas, condicionesPago: input.condicionesPago ?? null, vigenteHasta: input.vigenteHasta ?? null,
              actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.cotizaciones.insert(uow, cambio.value.cotizacion);
            if (!saved.ok) return saved;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-cotizacion", id, { solicitudId: input.solicitudId });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, solicitudId: input.solicitudId, proveedorId: input.proveedorId, total: saved.value.total };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.registrar-cotizacion`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- seleccionar cotización ----------------- */
      // Compara (puro/determinista) las cotizaciones de una solicitud y SELECCIONA
      // una (por ranking o elección explícita). Emite eventos comparada+seleccionada.
      (deps) => ({
        name: `${MODULO}.seleccionar-cotizacion`,
        inputSchema: z.object({
          solicitudId: z.string().min(1),
          cotizacionId: z.string().min(1).optional(),
          pesos: z.object({ precio: z.number().min(0), plazoEntrega: z.number().min(0), calificacion: z.number().min(0) }).optional(),
          opId: z.string().optional(),
        }),
        authorization: { permissions: [`${MODULO}.write`] },
        async handle(ctx, input, uow) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.seleccionar-cotizacion`, input.opId);
          if (previo) return ok({ ...previo, idempotente: true });
          void deps;

          const cots = await adapters.cotizaciones.listPorSolicitud(tenant.value, input.solicitudId);
          if (!cots.ok) return cots;
          if (cots.value.length === 0) return fail(KernelErrors.notFound("cotizacion", input.solicitudId));

          const candidatas: CandidataComparacion[] = [];
          for (const c of cots.value) {
            const prov = await adapters.proveedores.findById(tenant.value, c.proveedorId);
            if (!prov.ok) return prov;
            candidatas.push({
              cotizacionId: c.id, proveedorId: c.proveedorId, moneda: c.moneda, total: c.total,
              plazoEntregaDias: c.plazoEntregaDias, calificacionProveedor: prov.value?.calificacionPromedio ?? 0,
            });
          }
          const comparacion = compararCotizaciones(candidatas, input.pesos ?? PESOS_COMPARACION_DEFAULT);
          if (!comparacion.ok) return comparacion;
          const ranking = comparacion.value;
          const ganadoraId = input.cotizacionId ?? ranking[0]!.cotizacionId;
          if (!ranking.some((r) => r.cotizacionId === ganadoraId)) {
            return fail(KernelErrors.validation("La cotización elegida no pertenece a la solicitud"));
          }
          const ganadora = cots.value.find((c) => c.id === ganadoraId)!;
          const ahora = new Date().toISOString();

          {
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: COTIZACION_COMPARADA,
              payload: {
                tenantId: tenant.value, id: input.solicitudId, entityRef: `solicitud-compra:${input.solicitudId}`,
                solicitudId: input.solicitudId, ranking, actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: COTIZACION_COMPARADA,
              },
            });
            if (!_e.ok) return _e;
          }
          {
            const _e = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: COTIZACION_SELECCIONADA,
              payload: {
                tenantId: tenant.value, id: ganadoraId, entityRef: `cotizacion:${ganadoraId}`,
                solicitudId: input.solicitudId, proveedorId: ganadora.proveedorId, total: ganadora.total,
                actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: COTIZACION_SELECCIONADA,
              },
            });
            if (!_e.ok) return _e;
          }

          const resultado = { solicitudId: input.solicitudId, seleccionada: ganadoraId, ranking };
          const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.seleccionar-cotizacion`, input.opId, resultado, ctx.principal.id);
          if (!rec.ok) return rec;
          return ok({ ...resultado, idempotente: false });
        },
      }),
      /* --------------------------- crear orden compra -------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-orden-compra`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            proveedorId: z.string().min(1),
            solicitudId: z.string().min(1).nullable().optional(),
            cotizacionId: z.string().min(1).nullable().optional(),
            moneda: z.string().min(1),
            condicionesPago: z.string().min(1).nullable().optional(),
            condicionesEntrega: z.string().min(1).nullable().optional(),
            lineas: z.array(lineaOrdenSchema).min(1),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.crear-orden-compra`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR_OC, {});
            if (!pol.ok) return pol;

            const prov = await adapters.proveedores.findById(tenant.value, input.proveedorId);
            if (!prov.ok) return prov;
            if (!prov.value) return fail(KernelErrors.notFound("proveedor", input.proveedorId));

            const val = await validarClasificacion(
              adapters, tenant.value,
              { "monedas": input.moneda, "condiciones-pago": input.condicionesPago ?? undefined, "condiciones-entrega": input.condicionesEntrega ?? undefined },
              ["monedas"],
            );
            if (!val.ok) return val;

            const lineas: LineaOrdenCompra[] = [];
            for (const l of input.lineas) { const r = crearLineaOrdenCompra(l); if (!r.ok) return r; lineas.push(r.value); }

            // Gobierno: exige Workflow Engine aprobado ANTES de cualquier efecto.
            const wf = exigirWorkflow(adapters, "ordenCompra");
            if (!wf.ok) return wf;
            const def = await wf.value.asegurarDefinicion(uow, tenant.value, "ordenCompra", ctx.principal.id);
            if (!def.ok) return def;
            const ref: ReferenciaWorkflow = { proceso: "ordenCompra", definicion: def.value.definicion, instanciaId: null, version: def.value.version };
            const inicio = await wf.value.iniciar(uow, tenant.value, ref, ctx.principal.id);
            if (!inicio.ok) return inicio;

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date().toISOString();
            const codigo = await adapters.consecutivo.siguiente(uow, tenant.value, await configCodigo(deps, tenant.value, "orden-compra"), ctx.principal.id);
            if (!codigo.ok) return codigo;

            const cambio = crearOrdenCompra({
              id, tenantId: tenant.value, codigo: codigo.value.valor, proveedorId: input.proveedorId,
              solicitudId: input.solicitudId ?? null, cotizacionId: input.cotizacionId ?? null, moneda: input.moneda,
              lineas, condicionesPago: input.condicionesPago ?? null, condicionesEntrega: input.condicionesEntrega ?? null,
              workflow: { ...ref, instanciaId: inicio.value.instanciaId }, estadoInicial: inicio.value.estado.estado as EstadoOC,
              actorId: ctx.principal.id, ahora,
            });
            if (!cambio.ok) return cambio;
            const saved = await adapters.ordenes.insert(uow, cambio.value.orden);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `orden-compra:${id}`, "creado", saved.value.version, { codigo: codigo.value.valor }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-orden-compra", id, { codigo: codigo.value.valor });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id, codigo: codigo.value.valor, estado: saved.value.estado, total: saved.value.total, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.crear-orden-compra`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ----------------------- transicionar orden compra ---------------- */
      // aprobar/enviar/cancelar: cada una es una transición REAL con su comando.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar-orden-compra`,
          inputSchema: z.object({
            id: z.string().min(1),
            accion: z.enum(ACCIONES_OC),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.govern`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.transicionar-orden-compra`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.ordenes.findById(tenant.value, input.id);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("orden-compra", input.id));
            const orden = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR_OC, { estado: orden.estado });
            if (!pol.ok) return pol;

            const wf = exigirWorkflow(adapters, "ordenCompra");
            if (!wf.ok) return wf;
            const trans = await wf.value.transicionar(uow, tenant.value, orden.workflow, input.accion, ctx.principal.id);
            if (!trans.ok) return trans;

            const ahora = new Date().toISOString();
            const cambio = aplicarAccionOrdenCompra(orden, input.accion as AccionOC, ctx.principal.id, ahora);
            if (!cambio.ok) return cambio;
            const saved = await adapters.ordenes.update(uow, cambio.value.orden, input.expectedVersion);
            if (!saved.ok) return saved;
            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `orden-compra:${input.id}`, input.accion, saved.value.version, { accion: input.accion }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "transicionar-orden-compra", input.id, { accion: input.accion });
            if (!audited.ok) return audited;
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento); if (!_e.ok) return _e; }

            const resultado = { id: input.id, estado: saved.value.estado, accion: input.accion, version: saved.value.version };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.transicionar-orden-compra`, input.opId, resultado, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- registrar recepción ------------------ */
      // Recepción parcial/total/con novedades por líneas. El acumulado y el estado
      // derivado (parcialmenteRecibida/recibida) los calcula el aggregate OC de
      // forma pura; los costos se actualizan por el motor determinista.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-recepcion`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            ordenCompraId: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            nota: z.string().nullable().optional(),
            lineas: z.array(lineaRecepcionSchema).min(1),
          }),
          authorization: { permissions: [`${MODULO}.receive`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.registrar-recepcion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            const found = await adapters.ordenes.findById(tenant.value, input.ordenCompraId);
            if (!found.ok) return found;
            if (!found.value) return fail(KernelErrors.notFound("orden-compra", input.ordenCompraId));
            const orden = found.value;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_RECIBIR, { estado: orden.estado });
            if (!pol.ok) return pol;

            // Novedades del catálogo (obligatorias sólo si el tenant las administra).
            const lineas: LineaRecepcion[] = [];
            for (const l of input.lineas) {
              const r = crearLineaRecepcion(l);
              if (!r.ok) return r;
              const valNov = await adapters.catalogos.validarReferencia(tenant.value, "novedades-recepcion", r.value.novedad, false);
              if (!valNov.ok) return valNov;
              lineas.push(r.value);
            }

            // (1) Aplica la recepción a la OC de forma PURA (tope+tolerancia, estado derivado).
            const entradas: EntradaRecepcion[] = lineas.map((l) => ({ numeroLineaOC: l.numeroLineaOC, cantidad: l.cantidad.valor }));
            const ahora = new Date().toISOString();
            const cambioOC = aplicarRecepcionOrdenCompra(orden, entradas, ctx.principal.id, ahora);
            if (!cambioOC.ok) return cambioOC;
            const completa = cambioOC.value.orden.estado === "recibida";

            // Gobierno de la recepción: transición REAL de la OC en el motor.
            const wf = exigirWorkflow(adapters, "ordenCompra");
            if (!wf.ok) return wf;
            const accionWf = completa ? "recibirTotal" : "recibirParcial";
            const trans = await wf.value.transicionar(uow, tenant.value, orden.workflow, accionWf, ctx.principal.id);
            if (!trans.ok) return trans;

            // (2) Registra la recepción (hecho inmutable) con su consecutivo.
            const conteo = await adapters.recepciones.contarPorOrden(tenant.value, orden.id);
            if (!conteo.ok) return conteo;
            const recId = input.id ?? crypto.randomUUID();
            const cambioRec = registrarRecepcion({
              id: recId, tenantId: tenant.value, ordenCompraId: orden.id, consecutivo: conteo.value + 1,
              lineas, completaOrden: completa, nota: input.nota ?? null, actorId: ctx.principal.id, ahora,
            });
            if (!cambioRec.ok) return cambioRec;
            const savedRec = await adapters.recepciones.insert(uow, cambioRec.value.recepcion);
            if (!savedRec.ok) return savedRec;

            // (3) Persiste el nuevo estado de la OC (concurrencia optimista).
            const savedOC = await adapters.ordenes.update(uow, cambioOC.value.orden, input.expectedVersion);
            if (!savedOC.ok) return savedOC;

            // (4) DERIVA efectos de integración (entradas de inventario + costos) —
            //     lógica pura. La orquestación cross-módulo es de la ETAPA 2; aquí
            //     actualizamos el estado de costos del PROPIO artículo del catálogo.
            const efectos = derivarEfectosRecepcion(savedOC.value, cambioRec.value.recepcion);
            if (!efectos.ok) return efectos;
            // Autosuficiencia CQRS (abs_costos_read): cada entrada de costo lleva
            // moneda, método de valoración y cantidad valorizada para proyectarse
            // sin releer el artículo.
            const costosActualizados: Array<{
              articuloId: string; costoPromedio: number; ultimoCosto: number;
              moneda: string; metodoValoracion: string; cantidadValorizada: number;
            }> = [];
            for (const act of efectos.value.actualizacionesCosto) {
              if (!act.articuloId) continue;
              const art = await adapters.articulos.findById(tenant.value, act.articuloId);
              if (!art.ok) return art;
              if (!art.value) continue; // artículo no catalogado ⇒ sin valorización
              const nuevo = aplicarEntradaCosto(art.value.costos, act.entrada);
              if (!nuevo.ok) return nuevo;
              const cambioArt = aplicarCostos(art.value, nuevo.value, ctx.principal.id, ahora);
              const savedArt = await adapters.articulos.update(uow, cambioArt.articulo, art.value.version);
              if (!savedArt.ok) return savedArt;
              costosActualizados.push({
                articuloId: act.articuloId, costoPromedio: nuevo.value.costoPromedio, ultimoCosto: nuevo.value.ultimoCosto,
                moneda: nuevo.value.moneda, metodoValoracion: cambioArt.articulo.metodoValoracion, cantidadValorizada: nuevo.value.cantidadValorizada,
              });
            }

            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `orden-compra:${orden.id}`, completa ? "recibida-total" : "recibida-parcial", savedOC.value.version, { recepcionId: recId, conNovedades: savedRec.value.conNovedades }, ahora, ctx.principal.id);
            if (!hist.ok) return hist;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-recepcion", recId, { ordenCompraId: orden.id, completa });
            if (!audited.ok) return audited;

            // Eventos autosuficientes: recepción, estado derivado de la OC y costos.
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambioRec.value.evento); if (!_e.ok) return _e; }
            { const _e = await emitirEvento(adapters, ctx, uow, tenant.value, cambioOC.value.evento); if (!_e.ok) return _e; }
            if (costosActualizados.length > 0) {
              const _e = await emitirEvento(adapters, ctx, uow, tenant.value, {
                tipo: COSTOS_ACTUALIZADOS,
                payload: {
                  tenantId: tenant.value, id: recId, entityRef: `recepcion:${recId}`, ordenCompraId: orden.id,
                  costos: costosActualizados, entradasInventario: efectos.value.entradasInventario,
                  actorId: ctx.principal.id, actualizadoAt: ahora, eventoTipo: COSTOS_ACTUALIZADOS,
                },
              });
              if (!_e.ok) return _e;
            }

            const resultado = {
              recepcionId: recId, ordenCompraId: orden.id, estadoOrden: savedOC.value.estado, completa,
              conNovedades: savedRec.value.conNovedades, costosActualizados, entradasInventario: efectos.value.entradasInventario,
              version: savedOC.value.version,
            };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.registrar-recepcion`, input.opId, resultado as unknown as Record<string, unknown>, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      // ---------------------------------------------------------------------
      // ORQUESTADOR cross-módulo: materializa una recepción como movimientos de
      // inventario vía el comando OFICIAL de Inventario (`mover`), componiendo el
      // `MaterializadorInventario` (que gestiona su PROPIA UoW; NUNCA anidada).
      // Idempotente por opId determinista `${recepcionId}:${linea}` y por el
      // vínculo durable en abs_recepcion_materializaciones (guard movimiento_id
      // IS NULL). Fail-safe: sin materializador configurado, rechaza (KRN-CFL).
      // Encolable offline / replayable.
      // ---------------------------------------------------------------------
      (deps) => {
        void deps;
        return {
          name: `${MODULO}.materializar-recepcion`,
          inputSchema: z.object({
            opId: z.string().optional(),
            recepcionId: z.string().min(1),
            bodegaId: z.string().min(1).nullable().optional(),
            ubicacionId: z.string().min(1).nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.receive`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const previo = await reciboPrevio(adapters, tenant.value, `${MODULO}.materializar-recepcion`, input.opId);
            if (previo) return ok({ ...previo, idempotente: true });

            if (!adapters.materializador || !adapters.materializaciones) {
              return fail(KernelErrors.conflict(
                "El runtime no está configurado con un materializador de Inventario; la recepción no puede crear movimientos por vías no oficiales.",
                { motivo: "materializador-no-configurado" },
              ));
            }
            const materializador = adapters.materializador;
            const dedup = adapters.materializaciones;

            const recFound = await adapters.recepciones.findById(tenant.value, input.recepcionId);
            if (!recFound.ok) return recFound;
            if (!recFound.value) return fail(KernelErrors.notFound("recepcion", input.recepcionId));
            const recepcion = recFound.value;

            const ocFound = await adapters.ordenes.findById(tenant.value, recepcion.ordenCompraId);
            if (!ocFound.ok) return ocFound;
            if (!ocFound.value) return fail(KernelErrors.notFound("orden-compra", recepcion.ordenCompraId));
            const orden = ocFound.value;

            const efectos = derivarEfectosRecepcion(orden, recepcion);
            if (!efectos.ok) return efectos;

            const movimientos: Array<{ numeroLineaOC: number; movimientoId: string; idempotente: boolean; cantidad: number }> = [];
            for (const entrada of efectos.value.entradasInventario) {
              if (entrada.cantidad <= 0) continue; // novedades no ingresables ⇒ sin movimiento
              const costo = efectos.value.actualizacionesCosto.find((c) => c.numeroLineaOC === entrada.numeroLineaOC);

              // (a) Reserva idempotente del vínculo (ON CONFLICT DO NOTHING).
              const reserva = await dedup.reservar(uow, tenant.value, {
                recepcionId: recepcion.id, ordenCompraId: orden.id, numeroLineaOC: entrada.numeroLineaOC,
                articuloId: entrada.articuloId, inventarioItemId: entrada.inventarioItemRef?.id ?? null,
                cantidad: entrada.cantidad, movimientoId: null, estado: "pendiente",
              });
              if (!reserva.ok) return reserva;

              // (b) Materialización OFICIAL (UoW propia del materializador).
              const opLinea = `${recepcion.id}:${entrada.numeroLineaOC}`;
              const mov = await materializador.ingresar(tenant.value, ctx.principal.id, {
                opId: opLinea, recepcionId: recepcion.id, ordenCompraId: orden.id, numeroLineaOC: entrada.numeroLineaOC,
                articuloId: entrada.articuloId, inventarioItemId: entrada.inventarioItemRef?.id ?? null,
                bodegaId: (input.bodegaId ?? entrada.bodega?.id) ?? null, ubicacionId: input.ubicacionId ?? null,
                cantidad: entrada.cantidad, unidad: entrada.unidad, lote: entrada.lote, serie: entrada.serie,
                costoUnitario: costo?.entrada.costoUnitario ?? null, moneda: costo?.entrada.moneda ?? null,
                referencia: { tipo: "recepcion", id: recepcion.id },
              });
              if (!mov.ok) return mov;

              // (c) Vínculo ATÓMICO con guard (rowCount>0 ⇒ este proceso aplicó;
              //     rowCount=0 ⇒ otro ya vinculó — sin duplicar movimiento).
              const vinc = await dedup.vincular(uow, tenant.value, recepcion.id, entrada.numeroLineaOC, mov.value.movimientoId, "aplicada");
              if (!vinc.ok) return vinc;
              movimientos.push({ numeroLineaOC: entrada.numeroLineaOC, movimientoId: mov.value.movimientoId, idempotente: mov.value.idempotente, cantidad: entrada.cantidad });
            }

            // Liberación de reserva / cierre de origen (OT/plan) best-effort.
            if (materializador.liberarOrigen) {
              const lib = await materializador.liberarOrigen(tenant.value, ctx.principal.id, {
                ordenCompraId: orden.id, solicitudId: orden.solicitudId ?? null,
                origenTipo: null, origenId: null, recepcionId: recepcion.id,
              });
              if (!lib.ok) return lib;
            }

            const hist = await registrarHistorial(adapters, ctx, uow, tenant.value, `recepcion:${recepcion.id}`, "materializo-inventario", recepcion.consecutivo, { movimientos: movimientos.length }, new Date().toISOString(), ctx.principal.id);
            if (!hist.ok) return hist;

            const resultado = { recepcionId: recepcion.id, ordenCompraId: orden.id, movimientos };
            const rec = await sellarRecibo(adapters, uow, tenant.value, `${MODULO}.materializar-recepcion`, input.opId, resultado as unknown as Record<string, unknown>, ctx.principal.id);
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      // ---------------------------------------------------------------------
      // REPROYECCIÓN por REPLAY: reconstruye los read models desde la bitácora
      // durable (`abs_eventos`) — equivalencia con la proyección en vivo. Limpia
      // primero (clear) y reaplica cada evento idempotentemente. Sólo disponible
      // si hay read model + event log configurados.
      // ---------------------------------------------------------------------
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
        name: `${MODULO}.articulo`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.articuloGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("catalogo-articulo", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.articulos.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("catalogo-articulo", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.articulos`,
        inputSchema: z.object({ tipo: z.string().optional(), familia: z.string().optional(), activo: z.boolean().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.articuloList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.articulos.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.proveedor`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.proveedorGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("proveedor", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.proveedores.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("proveedor", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.proveedores`,
        inputSchema: z.object({ tipo: z.string().optional(), activo: z.boolean().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.proveedorList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.proveedores.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.solicitud`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.solicitudGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("solicitud-compra", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.solicitudes.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("solicitud-compra", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.solicitudes`,
        inputSchema: z.object({ estado: z.string().optional(), limit: z.number().int().positive().optional() }),
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
        name: `${MODULO}.cotizaciones`,
        inputSchema: z.object({ solicitudId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.cotizacionesPorSolicitud(tenant.value, input.solicitudId);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.cotizaciones.listPorSolicitud(tenant.value, input.solicitudId);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.orden-compra`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.ordenCompraGet(tenant.value, input.id);
            if (!rm.ok) return rm;
            if (!rm.value) return fail(KernelErrors.notFound("orden-compra", input.id));
            return ok(rm.value.datos);
          }
          const r = await adapters.ordenes.findById(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("orden-compra", input.id));
          return ok(r.value as unknown as Record<string, unknown>);
        },
      }),
      (deps) => ({
        name: `${MODULO}.ordenes-compra`,
        inputSchema: z.object({ estado: z.string().optional(), proveedorId: z.string().optional(), limit: z.number().int().positive().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.ordenCompraList(tenant.value, input);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.ordenes.list(tenant.value, input);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.recepciones`,
        inputSchema: z.object({ ordenCompraId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.recepcionesPorOrden(tenant.value, input.ordenCompraId);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => x.datos));
          }
          const r = await adapters.recepciones.listPorOrden(tenant.value, input.ordenCompraId);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.historial`,
        inputSchema: z.object({ entityRef: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (adapters.readModel) {
            const rm = await adapters.readModel.historialPorEntidad(tenant.value, input.entityRef);
            if (!rm.ok) return rm;
            return ok(rm.value.map((x) => ({ ...x, ocurridoAt: x.ocurridoAt instanceof Date ? x.ocurridoAt.toISOString() : x.ocurridoAt })) as unknown as Record<string, unknown>[]);
          }
          const r = await adapters.historial.listPorEntidad(tenant.value, input.entityRef);
          if (!r.ok) return r;
          return ok(r.value as unknown as Record<string, unknown>[]);
        },
      }),
      (deps) => ({
        name: `${MODULO}.costos`,
        inputSchema: z.object({ articuloId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          if (!adapters.readModel) return ok([] as Record<string, unknown>[]);
          const rm = await adapters.readModel.costosPorArticulo(tenant.value, input.articuloId);
          if (!rm.ok) return rm;
          return ok(rm.value.map((x) => ({
            articuloId: x.articuloId, moneda: x.moneda, metodoValoracion: x.metodoValoracion,
            costoUnitario: x.costoUnitario, cantidadAcumulada: x.cantidadAcumulada, ...x.datos,
          })) as unknown as Record<string, unknown>[]);
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
      // Shared Timeline CANÓNICO (platform.timeline): CADA evento del módulo se
      // registra vía COMANDO `platform.timeline.record` (nunca escritura directa),
      // idempotente por entryId=event.id ⇒ la reentrega del outbox no duplica.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `timeline:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          registrarEnTimeline()(deps, { ...event, type: eventType }),
      })),
      // PROYECCIÓN CQRS (payload-only): cada evento del módulo actualiza los read
      // models idempotentemente (por last_event_id/version). At-least-once ⇒ la
      // reentrega del outbox NO duplica filas. Sólo se registra si hay read model.
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
