/**
 * DGP-008.1 · Módulo Activos Empresariales — Capa de aplicación + descriptor.
 *
 * Se registra por el ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime → registerPlatformService). Pipeline:
 * HTTP → Command → Validation → Authorization → Policy → Application Service →
 * Repository → UoW → PostgreSQL → Outbox → Audit → Projection → Read Model → API.
 *
 * CQRS estricto: los comandos leen el aggregate (fuente de verdad); las
 * consultas SOLO leen el read model. Los catálogos son configurables por
 * tenant (Record Store). Todo parametrizado vía tenantConfig — nada hardcodeado.
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
import { audit, tenantOf, type PlatformServiceDefinition, type ServiceDeps } from "@workspace/platform";
import { MODULO } from "./module-name";
import {
  ACTIVO_ACTUALIZADO,
  ACTIVO_EN_MANTENIMIENTO,
  ACTIVO_FUERA_SERVICIO,
  ACTIVO_HOROMETRO_ACTUALIZADO,
  ACTIVO_ODOMETRO_ACTUALIZADO,
  ACTIVO_OPERATIVO,
  ACTIVO_REGISTRADO,
  ACTIVO_RESPONSABLE_ACTUALIZADO,
  ACTIVO_RETIRADO,
  ACTIVO_UBICACION_ACTUALIZADA,
  actualizarHorometro,
  actualizarOdometro,
  asignarResponsable,
  cambiarUbicacion,
  crearActivo,
  editarActivo,
  EVENTOS_MODULO,
  fueraServicioActivo,
  mantenerActivo,
  operarActivo,
  registrarActivo,
  retirarActivo,
  type Activo,
  type CambioActivo,
  type PatchActivo,
} from "./domain/activo";
import { ESTADOS, type EstadoActivo } from "./domain/maquina-estados";
import {
  policiesDelModulo,
  POLICY_PUEDE_ASIGNAR_RESPONSABLE,
  POLICY_PUEDE_CAMBIAR_UBICACION,
  POLICY_PUEDE_CERRAR,
  POLICY_PUEDE_MODIFICAR,
  POLICY_PUEDE_MODIFICAR_HOROMETRO,
  POLICY_PUEDE_MODIFICAR_ODOMETRO,
  POLICY_PUEDE_REGISTRAR,
  POLICY_PUEDE_RETIRAR,
  POLICIES,
} from "./domain/policies";
import { CATALOGOS, ESTADO_HABILITADO, type NombreCatalogo } from "./domain/catalogos";
import {
  crearGarantia,
  crearEspecificaciones,
  crearIdentificacionTecnica,
  crearMedicion,
  crearUbicacion,
} from "./domain/value-objects";
import { CatalogoService } from "./infrastructure/catalogo-service";
import {
  type ActivoReadModel,
  type ActivoReadRow,
  type ActivoRepository,
  type SyncReceipt,
  type SyncReceiptStore,
} from "./infrastructure/repository";
import {
  crearRelacion,
  eliminarRelacion,
  EVENTOS_RELACION,
  NOMBRES_TIPO_RELACION,
  RELACION_CREADA,
  RELACION_ELIMINADA,
  resolverTiposRelacion,
  TIPOS_RELACION,
  type CategoriaRelacion,
} from "./domain/relaciones";
import type {
  ConsolaStore,
  EventLogStore,
  HistorialStore,
  RelacionReadModel,
  RelacionReadRow,
  RelacionRepository,
} from "./infrastructure/relaciones-store";

export { MODULO };

export interface ModuleAdapters {
  readonly repository: ActivoRepository;
  readonly readModel: ActivoReadModel;
  readonly relaciones: RelacionRepository;
  readonly relacionesRead: RelacionReadModel;
  readonly historial: HistorialStore;
  /** Recibos durables de sincronización (diagnóstico de consola). */
  readonly syncReceipts: SyncReceiptStore;
  /** Diagnóstico del outbox del módulo (consola técnica). */
  readonly consola: ConsolaStore;
  /**
   * Bitácora de eventos durable del módulo (`act_eventos`), fuente de verdad del
   * replay de reproyección. Independiente del outbox y su retención.
   */
  readonly eventLog: EventLogStore;
}

/* ------------------------------- Config ---------------------------------- */

async function cfg(deps: ServiceDeps, tenant: string, clave: string, def: string): Promise<string> {
  const v = await deps.tenantConfig.get(tenant, `${MODULO}.${clave}`);
  return v.ok && v.value !== "" ? v.value : def;
}

/* ------------------------- Domain Service (unicidad) --------------------- */

async function codigoDisponible(
  repo: ActivoRepository,
  tenantId: string,
  codigo: string,
  exceptoId?: string,
): Promise<Result<void, KernelError>> {
  const existing = await repo.findByCodigo(tenantId, codigo);
  if (!existing.ok) return existing;
  if (existing.value && existing.value.id !== exceptoId) {
    return fail(KernelErrors.conflict(`Ya existe un activo con código "${codigo}"`));
  }
  return ok(undefined);
}

/* ------------------------- Validación de catálogos ----------------------- */

async function validarCatalogos(
  store: CatalogoService,
  tenant: string,
  a: Pick<Activo, "tipo" | "categoria" | "familia" | "subfamilia" | "criticidad" | "prioridad" | "moneda" | "centroCosto" | "empresa" | "proyecto" | "fabricante" | "modelo"> & { ubicacionId?: string | null },
): Promise<Result<void, KernelError>> {
  const checks: [NombreCatalogo, string | null | undefined, boolean][] = [
    ["tipos", a.tipo, true],
    ["categorias", a.categoria, true],
    ["familias", a.familia, true],
    ["subfamilias", a.subfamilia, false],
    ["criticidades", a.criticidad, false],
    ["prioridades", a.prioridad, false],
    ["monedas", a.moneda, false],
    ["centros-costo", a.centroCosto, false],
    ["empresas", a.empresa, false],
    ["proyectos", a.proyecto, false],
    ["fabricantes", a.fabricante, false],
    ["modelos", a.modelo, false],
    ["ubicaciones", a.ubicacionId, false],
  ];
  for (const [catalogo, clave, obligatorio] of checks) {
    const r = await store.validarReferencia(tenant, catalogo, clave, obligatorio);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

/**
 * Valida el estado destino de una transición contra el catálogo CONFIGURABLE
 * `estados`, con semántica INEQUÍVOCA:
 *
 *   - Catálogo `estados` VACÍO  ⇒ máquina de estados CANÓNICA completa: toda
 *     transición del dominio es admisible (sin configuración explícita).
 *   - Catálogo `estados` NO VACÍO ⇒ el tenant declara EXPLÍCITAMENTE qué
 *     estados admite: el estado destino debe estar PRESENTE **y** HABILITADO.
 *     Si está ausente o deshabilitado, la transición se RECHAZA con un error de
 *     validación claro.
 */
async function validarEstadoHabilitado(
  store: CatalogoService,
  tenant: string,
  estadoDestino: string,
): Promise<Result<void, KernelError>> {
  const total = await store.contarEntradas(tenant, "estados");
  if (!total.ok) return total;
  if (total.value === 0) return ok(undefined); // catálogo vacío ⇒ máquina canónica

  const entrada = await store.buscar(tenant, "estados", estadoDestino);
  if (!entrada.ok) return entrada;
  if (!entrada.value) {
    return fail(
      KernelErrors.validation(
        `El estado "${estadoDestino}" no está en el catálogo "estados" configurado por el tenant`,
      ),
    );
  }
  if (entrada.value.status !== ESTADO_HABILITADO) {
    return fail(
      KernelErrors.validation(`El estado "${estadoDestino}" está deshabilitado en el catálogo del tenant`),
    );
  }
  return ok(undefined);
}

/** Valida las unidades de medición (horómetro/odómetro) contra `unidades`. */
async function validarUnidades(
  store: CatalogoService,
  tenant: string,
  unidades: ReadonlyArray<string | null | undefined>,
): Promise<Result<void, KernelError>> {
  for (const u of unidades) {
    const r = await store.validarReferencia(tenant, "unidades", u ?? null, false);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

/* ---------------------- Application Service ------------------------------ */

/**
 * Emite un evento de dominio del módulo escribiéndolo ATÓMICAMENTE en la MISMA
 * UoW en la bitácora durable (`act_eventos`, fuente de verdad del replay) y en
 * el outbox del Kernel (`registerEvent`). Usa el MISMO `event.id` en ambos, de
 * modo que la reproyección desde la bitácora produzca read models idénticos
 * (mismo `lastEventId`/`eventId` que la proyección en vivo).
 */
async function emitirEvento(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenantId: string,
  evento: { tipo: string; payload: Record<string, unknown> },
): Promise<Result<void, KernelError>> {
  const dominio = createDomainEvent(evento.tipo, evento.payload, ctx.correlationId);
  const logged = await adapters.eventLog.append(uow, {
    tenantId,
    eventId: dominio.id,
    tipo: dominio.type,
    payload: dominio.payload,
    occurredAt: dominio.occurredAt,
  });
  if (!logged.ok) return logged;
  uow.registerEvent(dominio);
  return ok(undefined);
}

async function persistirCambio(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  cambio: CambioActivo,
  accion: string,
  esCreacion: boolean,
  expectedVersion?: number,
): Promise<Result<Activo, KernelError>> {
  const a = cambio.activo;
  const persisted = esCreacion
    ? await adapters.repository.insert(uow, a)
    : await adapters.repository.update(uow, a, expectedVersion!);
  if (!persisted.ok) return persisted;

  const audited = await audit(deps.audit, uow, ctx, a.tenantId, MODULO, accion, a.id, {
    estado: a.estado,
    version: a.version,
  });
  if (!audited.ok) return audited;

  const emitido = await emitirEvento(adapters, ctx, uow, a.tenantId, cambio.evento);
  if (!emitido.ok) return emitido;
  return ok(a);
}

/* ----------------------------- Proyección -------------------------------- */

function readRowDeEvento(p: Record<string, unknown>, eventId: string): ActivoReadRow {
  const ubic = p["ubicacion"] as { ubicacionId?: string } | null | undefined;
  return {
    tenantId: String(p["tenantId"] ?? ""),
    id: String(p["id"] ?? ""),
    codigoEmpresarial: String(p["codigoEmpresarial"] ?? ""),
    nombre: String(p["nombre"] ?? ""),
    estado: (p["estado"] as EstadoActivo) ?? "BORRADOR",
    tipo: String(p["tipo"] ?? ""),
    criticidad: p["criticidad"] == null ? null : String(p["criticidad"]),
    ubicacionId: ubic?.ubicacionId ?? null,
    datos: { ...p },
    version: Number(p["version"] ?? 1),
    lastEventId: eventId,
    actualizadoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
  };
}

function proyeccion(adapters: ModuleAdapters) {
  return async (
    deps: ServiceDeps,
    event: { id: string; payload: Record<string, unknown> },
  ): Promise<Result<void, KernelError>> => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    const id = String(p["id"] ?? "");
    if (!tenantId || !id) return ok(undefined);
    const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
    const applied = await uowPort.execute(ctx, (uow) =>
      adapters.readModel.apply(uow, readRowDeEvento(p, event.id)),
    );
    return applied.ok ? ok(undefined) : applied;
  };
}

/* --------------- Proyecciones DGP-008.2 (payload-only, idempotentes) ------ */

/** Resumen legible para la línea de tiempo del módulo, derivado del evento. */
function resumenDeEvento(tipo: string, p: Record<string, unknown>): string {
  const codigo = String(p["codigoEmpresarial"] ?? p["id"] ?? "");
  switch (tipo) {
    case ACTIVO_REGISTRADO: return `Activo registrado (${codigo})`;
    case ACTIVO_ACTUALIZADO: return `Datos actualizados (${codigo})`;
    case ACTIVO_OPERATIVO: return `Activo puesto OPERATIVO (${codigo})`;
    case ACTIVO_EN_MANTENIMIENTO: return `Activo en MANTENIMIENTO (${codigo})`;
    case ACTIVO_FUERA_SERVICIO: return `Activo FUERA DE SERVICIO (${codigo})`;
    case ACTIVO_RETIRADO: return `Activo RETIRADO (${codigo})`;
    case ACTIVO_UBICACION_ACTUALIZADA: return `Ubicación actualizada (${codigo})`;
    case ACTIVO_RESPONSABLE_ACTUALIZADO: return `Responsable actualizado (${codigo})`;
    case ACTIVO_HOROMETRO_ACTUALIZADO: return `Horómetro actualizado (${codigo})`;
    case ACTIVO_ODOMETRO_ACTUALIZADO: return `Odómetro actualizado (${codigo})`;
    case RELACION_CREADA: return `Relación "${String(p["tipo"] ?? "")}" creada`;
    case RELACION_ELIMINADA: return `Relación "${String(p["tipo"] ?? "")}" eliminada`;
    default: return `${tipo} (${codigo})`;
  }
}

/**
 * Aplica UNA fila de línea de tiempo al READ MODEL INTERNO del módulo
 * (`act_historial`), idempotente por event_id. Reutilizable por el handler de
 * proyección y por la reproyección por replay. NO es el Shared Timeline: es el
 * historial cronológico propio del activo. El Shared Timeline canónico es
 * platform.timeline (ver `registrarEnTimelineCompartido`).
 */
async function aplicarHistorial(
  adapters: ModuleAdapters,
  uow: UnitOfWork,
  event: { id: string; type: string; payload: Record<string, unknown> },
): Promise<Result<boolean, KernelError>> {
  const p = event.payload;
  // En eventos de relación el activo del historial es el ORIGEN; el `id` del
  // payload es el id de la relación, no del activo.
  const esRelacion = event.type === RELACION_CREADA || event.type === RELACION_ELIMINADA;
  const origen = p["origen"] as { id?: string } | undefined;
  const id = esRelacion ? String(origen?.id ?? p["id"] ?? "") : String(p["id"] ?? "");
  return adapters.historial.registrarEvento(uow, {
    tenantId: String(p["tenantId"] ?? ""),
    eventId: event.id,
    activoId: id,
    entityRef: String(p["entityRef"] ?? `activo:${id}`),
    tipoEvento: event.type,
    estado: p["estado"] == null ? null : String(p["estado"]),
    version: Number(p["version"] ?? 1),
    actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
    resumen: resumenDeEvento(event.type, p),
    registradoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
  });
}

/**
 * Proyección al READ MODEL INTERNO de historial del activo (`act_historial`),
 * idempotente por event_id. Es un read model — NO "el timeline".
 */
function proyeccionHistorial(adapters: ModuleAdapters) {
  return async (deps: ServiceDeps, event: { id: string; type: string; payload: Record<string, unknown> }) => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    const id = String(p["id"] ?? "");
    if (!tenantId || !id) return ok(undefined);
    const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
    const applied = await uowPort.execute(ctx, (uow) => aplicarHistorial(adapters, uow, event));
    return applied.ok ? ok(undefined) : applied;
  };
}

/**
 * Proyecta un evento del módulo al SHARED TIMELINE canónico de la plataforma
 * mediante el COMANDO `platform.timeline.record` (nunca escritura directa a las
 * tablas de plataforma). Idempotente por el id del evento del módulo: una
 * reentrega tardía del outbox no duplica la entrada. Se ejecuta con principal
 * de sistema para no depender de los permisos de plataforma del actor.
 */
function registrarEnTimelineCompartido() {
  return async (
    deps: ServiceDeps,
    event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string },
  ): Promise<Result<void, KernelError>> => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    const id = String(p["id"] ?? "");
    if (!tenantId || !id) return ok(undefined);
    // La entidad relacionada aplica a los eventos de relación (origen→destino).
    const origen = p["origen"] as { id?: string } | undefined;
    const destino = p["destino"] as { id?: string } | undefined;
    const esRelacion = event.type === RELACION_CREADA || event.type === RELACION_ELIMINADA;
    const entityRef = esRelacion
      ? `activo:${String(origen?.id ?? id)}`
      : String(p["entityRef"] ?? `activo:${id}`);
    const entidadRelacionada = esRelacion && destino?.id ? `activo:${destino.id}` : null;
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
      occurredAt: p["actualizadoAt"] ? String(p["actualizadoAt"]) : new Date().toISOString(),
      resumen: resumenDeEvento(event.type, p),
      estado: p["estado"] == null ? null : String(p["estado"]),
      entidadRelacionada,
      payload: { id, tipo: p["tipo"] ?? null },
    });
    return r.ok ? ok(undefined) : r;
  };
}

/** Proyección al historial de ubicaciones desde el payload del evento. */
function proyeccionUbicacion(adapters: ModuleAdapters) {
  return async (deps: ServiceDeps, event: { id: string; payload: Record<string, unknown> }) => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    const id = String(p["id"] ?? "");
    const ubic = p["ubicacion"] as
      | { ubicacionId?: string; etiqueta?: string; detalle?: string; coordenadas?: Record<string, unknown> }
      | null
      | undefined;
    if (!tenantId || !id || !ubic) return ok(undefined);
    const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
    const applied = await uowPort.execute(ctx, (uow) =>
      adapters.historial.registrarUbicacion(uow, {
        tenantId,
        eventId: event.id,
        activoId: id,
        ubicacionId: ubic.ubicacionId ?? null,
        etiqueta: ubic.etiqueta ?? null,
        detalle: ubic.detalle ?? null,
        coordenadas: ubic.coordenadas ?? null,
        version: Number(p["version"] ?? 1),
        actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
        registradoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
      }),
    );
    return applied.ok ? ok(undefined) : applied;
  };
}

/** Proyección al historial de responsables desde el payload del evento. */
function proyeccionResponsable(adapters: ModuleAdapters) {
  return async (deps: ServiceDeps, event: { id: string; payload: Record<string, unknown> }) => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    const id = String(p["id"] ?? "");
    if (!tenantId || !id || p["responsable"] == null) return ok(undefined);
    const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
    const applied = await uowPort.execute(ctx, (uow) =>
      adapters.historial.registrarResponsable(uow, {
        tenantId,
        eventId: event.id,
        activoId: id,
        responsable: p["responsable"] == null ? null : String(p["responsable"]),
        supervisor: p["supervisor"] == null ? null : String(p["supervisor"]),
        version: Number(p["version"] ?? 1),
        actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
        registradoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
      }),
    );
    return applied.ok ? ok(undefined) : applied;
  };
}

/** Proyección del read model de relaciones desde el payload del evento. */
function relacionReadRowDe(p: Record<string, unknown>, eventId: string): RelacionReadRow {
  const origen = (p["origen"] ?? {}) as { id?: string; codigo?: string | null; nombre?: string | null };
  const destino = (p["destino"] ?? {}) as { id?: string; codigo?: string | null; nombre?: string | null };
  return {
    tenantId: String(p["tenantId"] ?? ""),
    id: String(p["id"] ?? ""),
    tipo: String(p["tipo"] ?? ""),
    categoria: String(p["categoria"] ?? "asociacion") as CategoriaRelacion,
    origenId: String(origen.id ?? ""),
    origenCodigo: origen.codigo ?? null,
    origenNombre: origen.nombre ?? null,
    destinoId: String(destino.id ?? ""),
    destinoCodigo: destino.codigo ?? null,
    destinoNombre: destino.nombre ?? null,
    lastEventId: eventId,
    actualizadoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
  };
}

function proyeccionRelacion(adapters: ModuleAdapters) {
  return async (deps: ServiceDeps, event: { id: string; type: string; payload: Record<string, unknown> }) => {
    const p = event.payload;
    const tenantId = String(p["tenantId"] ?? "");
    const id = String(p["id"] ?? "");
    if (!tenantId || !id) return ok(undefined);
    const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
    const applied = await uowPort.execute(ctx, async (uow) => {
      if (event.type === RELACION_ELIMINADA) {
        const r = await adapters.relacionesRead.remove(uow, tenantId, id);
        return r.ok ? ok(true) : r;
      }
      return adapters.relacionesRead.apply(uow, relacionReadRowDe(p, event.id));
    });
    return applied.ok ? ok(undefined) : applied;
  };
}

/* --------------------------- Replay (reproyección) ----------------------- */

/**
 * Reaplica LAS MISMAS funciones de proyección payload-only de UN evento del
 * módulo sobre los read models (activos_read, relaciones_read, historial,
 * ubicaciones/responsables histórico) dentro del UoW dado. Es idéntico a lo que
 * hacen los eventHandlers en línea, garantizando equivalencia bit a bit entre
 * la proyección en vivo y la reproyección por replay del event stream.
 */
async function reproyectarEvento(
  adapters: ModuleAdapters,
  uow: UnitOfWork,
  ev: { id: string; eventType: string; payload: Record<string, unknown> },
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const tipo = ev.eventType;
  const esRelacion = tipo === RELACION_CREADA || tipo === RELACION_ELIMINADA;

  if (esRelacion) {
    if (tipo === RELACION_ELIMINADA) {
      const r = await adapters.relacionesRead.remove(uow, String(p["tenantId"] ?? ""), String(p["id"] ?? ""));
      if (!r.ok) return r;
    } else {
      const r = await adapters.relacionesRead.apply(uow, relacionReadRowDe(p, ev.id));
      if (!r.ok) return r;
    }
    // Historial también para eventos de relación (mismo comportamiento en vivo).
    const th = await aplicarHistorial(adapters, uow, { id: ev.id, type: tipo, payload: p });
    return th.ok ? ok(undefined) : th;
  }

  // Read model del activo.
  const rm = await adapters.readModel.apply(uow, readRowDeEvento(p, ev.id));
  if (!rm.ok) return rm;

  // Historial cronológico del activo.
  const th = await aplicarHistorial(adapters, uow, { id: ev.id, type: tipo, payload: p });
  if (!th.ok) return th;

  // Histórico de ubicaciones (registro + cambio de ubicación).
  if ((tipo === ACTIVO_REGISTRADO || tipo === ACTIVO_UBICACION_ACTUALIZADA) && p["ubicacion"] != null) {
    const ubic = p["ubicacion"] as { ubicacionId?: string; etiqueta?: string; detalle?: string; coordenadas?: Record<string, unknown> };
    const u = await adapters.historial.registrarUbicacion(uow, {
      tenantId: String(p["tenantId"] ?? ""),
      eventId: ev.id,
      activoId: String(p["id"] ?? ""),
      ubicacionId: ubic.ubicacionId ?? null,
      etiqueta: ubic.etiqueta ?? null,
      detalle: ubic.detalle ?? null,
      coordenadas: ubic.coordenadas ?? null,
      version: Number(p["version"] ?? 1),
      actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
      registradoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
    });
    if (!u.ok) return u;
  }

  // Histórico de responsables (registro + reasignación).
  if ((tipo === ACTIVO_REGISTRADO || tipo === ACTIVO_RESPONSABLE_ACTUALIZADO) && p["responsable"] != null) {
    const r = await adapters.historial.registrarResponsable(uow, {
      tenantId: String(p["tenantId"] ?? ""),
      eventId: ev.id,
      activoId: String(p["id"] ?? ""),
      responsable: p["responsable"] == null ? null : String(p["responsable"]),
      supervisor: p["supervisor"] == null ? null : String(p["supervisor"]),
      version: Number(p["version"] ?? 1),
      actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
      registradoAt: p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date(),
    });
    if (!r.ok) return r;
  }
  return ok(undefined);
}

/* ------------------------------- Schemas VO ------------------------------ */

const UbicacionInput = z.object({
  ubicacionId: z.string().min(1),
  etiqueta: z.string().min(1),
  coordenadas: z
    .object({ latitud: z.number(), longitud: z.number(), altitud: z.number().optional() })
    .optional(),
  detalle: z.string().optional(),
});
const MedicionInput = z.object({ valor: z.number(), unidad: z.string().min(1), fecha: z.string().min(1) });

const CrearInput = z.object({
  id: z.string().uuid().optional(),
  opId: z.string().optional(),
  codigoEmpresarial: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  tipo: z.string().min(1),
  categoria: z.string().min(1),
  familia: z.string().min(1),
  subfamilia: z.string().nullish(),
  fabricante: z.string().nullish(),
  modelo: z.string().nullish(),
  serie: z.string().nullish(),
  anio: z.number().int().nullish(),
  fechaCompra: z.string().nullish(),
  fechaPuestaServicio: z.string().nullish(),
  vidaUtil: z.number().nullish(),
  valorAdquisicion: z.number().nullish(),
  valorResidual: z.number().nullish(),
  moneda: z.string().nullish(),
  centroCosto: z.string().nullish(),
  empresa: z.string().nullish(),
  proyecto: z.string().nullish(),
  proveedor: z.string().nullish(),
  ubicacion: UbicacionInput.nullish(),
  responsable: z.string().nullish(),
  supervisor: z.string().nullish(),
  horometro: MedicionInput.nullish(),
  odometro: MedicionInput.nullish(),
  garantia: z.record(z.string(), z.unknown()).nullish(),
  identificacion: z.record(z.string(), z.unknown()).nullish(),
  especificaciones: z.record(z.string(), z.unknown()).nullish(),
  criticidad: z.string().nullish(),
  prioridad: z.string().nullish(),
  observaciones: z.string().optional(),
});

/* ------------------------------ Helpers UoW ------------------------------ */

/** Carga el aggregate o falla con notFound. */
async function cargar(
  adapters: ModuleAdapters,
  tenant: string,
  id: string,
): Promise<Result<Activo, KernelError>> {
  const actual = await adapters.repository.findById(tenant, id);
  if (!actual.ok) return actual;
  if (!actual.value) return fail(KernelErrors.notFound("activo", id));
  return ok(actual.value);
}

const ID_VERSION = z.object({ id: z.string(), expectedVersion: z.number().int().positive() });

/* --------------------------- Colaboración -------------------------------- */

/** Categorías de documentación técnica admitidas como metadato de adjunto. */
export const CATEGORIAS_DOCUMENTACION = [
  "manual",
  "certificado",
  "garantia",
  "diagrama",
  "plano",
  "procedimiento",
] as const;
export type CategoriaDocumentacion = (typeof CATEGORIAS_DOCUMENTACION)[number];

/** entityRef canónico de un activo para los servicios de plataforma. */
function refActivo(id: string): string {
  return `activo:${id}`;
}

/**
 * Ejecuta un comando de plataforma con principal de SISTEMA (delegación de
 * colaboración): valida antes que el activo exista con la autorización del
 * módulo (el comando del módulo YA exigió el permiso correspondiente).
 */
async function delegarPlataforma(
  deps: ServiceDeps,
  ctx: ExecutionContext,
  tenant: string,
  comando: string,
  input: Record<string, unknown>,
): Promise<Result<unknown, KernelError>> {
  const sys = createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    correlationId: ctx.correlationId,
    metadata: { tenantId: tenant },
  });
  return deps.runtime.commands.execute(sys, comando, input);
}

/* ------------------------------ Búsqueda -------------------------------- */

/**
 * Documento de búsqueda de un activo construido SOLO desde el payload del
 * evento (nunca releyendo el aggregate): código empresarial, nombre, tipo,
 * categoría, familia, estado, ubicación, responsable y fabricante/modelo/serie.
 * Se delega en `platform.search.indexDocument` (idempotente por documentId).
 */
function documentoBusqueda(p: Record<string, unknown>): {
  documentId: string;
  entityType: string;
  entityRef: string;
  titulo: string;
  contenido: string;
} | null {
  const id = String(p["id"] ?? "");
  if (!id) return null;
  const s = (k: string): string => {
    const v = p[k];
    return v == null ? "" : String(v);
  };
  const ubic = (p["ubicacion"] ?? null) as Record<string, unknown> | null;
  const ubicacionTxt = ubic ? `${String(ubic["etiqueta"] ?? "")} ${String(ubic["ubicacionId"] ?? "")}` : "";
  const codigo = s("codigoEmpresarial");
  const nombre = s("nombre");
  // `contenido` alimenta la tokenización del índice; concentra todos los campos
  // buscables (payload-only) para que la búsqueda rápida/contextual los cubra.
  const contenido = [
    codigo, nombre, s("descripcion"), s("tipo"), s("categoria"), s("familia"),
    s("subfamilia"), s("estado"), ubicacionTxt, s("responsable"), s("supervisor"),
    s("fabricante"), s("modelo"), s("serie"),
  ]
    .filter((t) => t.length > 0)
    .join(" ");
  return {
    documentId: `activo:${id}`,
    entityType: "activo",
    entityRef: `activo:${id}`,
    titulo: `${codigo} · ${nombre}`.trim(),
    contenido,
  };
}

/**
 * Indexa (o reindexa) un activo en `platform.search` desde el payload del
 * evento, con principal de SISTEMA. Idempotente: `indexDocument` actualiza el
 * documento existente. Se usa desde los eventHandlers y desde la reproyección.
 */
async function indexarActivo(
  deps: ServiceDeps,
  correlationId: string,
  payload: Record<string, unknown>,
): Promise<Result<void, KernelError>> {
  const tenantId = String(payload["tenantId"] ?? "");
  const doc = documentoBusqueda(payload);
  if (!tenantId || !doc) return ok(undefined);
  const sysCtx = createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    correlationId,
    metadata: { tenantId },
  });
  const r = await deps.runtime.commands.execute(sysCtx, "platform.search.indexDocument", doc);
  return r.ok ? ok(undefined) : r;
}

/* ------------------------- Consola: colaboración ------------------------- */

/**
 * Actividad de colaboración del tenant para la consola técnica.
 *  - `timelineModulo`: entradas de la línea de tiempo propia del módulo.
 *  - `comentarios`/`adjuntos`: conteos vía QUERIES de plataforma
 *    (`platform.comment.byEntity` / `platform.attachment.byEntity`), NUNCA SQL
 *    directo a las tablas de plataforma.
 *
 * LIMITACIÓN documentada: la plataforma no expone una query de CONTEO agregada
 * por tenant, sólo `byEntity`. Por ello se agregan los conteos recorriendo los
 * activos del read model (acotado a `MAX_ACTIVOS_COLAB`), lo que da un conteo
 * EXACTO cuando el tenant tiene ≤ ese número de activos y un conteo PARCIAL
 * (con `truncado: true`) por encima. Se ejecuta con principal de sistema para
 * no depender de que el admin tenga permisos de lectura de plataforma.
 */
async function actividadColaboracion(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  tenant: string,
): Promise<{
  timelineModulo: number;
  comentarios: number;
  adjuntos: number;
  activosInspeccionados: number;
  truncado: boolean;
  nota: string;
}> {
  const MAX_ACTIVOS_COLAB = 200;
  const histCount = await adapters.historial.contarEventos(tenant);
  const lista = await adapters.readModel.list(tenant, { limit: MAX_ACTIVOS_COLAB });
  const activos = lista.ok ? lista.value : [];
  const sys = createExecutionContext({
    principal: SYSTEM_PRINCIPAL,
    correlationId: ctx.correlationId,
    metadata: { tenantId: tenant },
  });
  let comentarios = 0;
  let adjuntos = 0;
  for (const a of activos) {
    const ref = `activo:${a.id}`;
    const c = await deps.runtime.queries.execute(sys, "platform.comment.byEntity", { entityRef: ref });
    if (c.ok && Array.isArray(c.value)) comentarios += c.value.length;
    const at = await deps.runtime.queries.execute(sys, "platform.attachment.byEntity", { entityRef: ref });
    if (at.ok && Array.isArray(at.value)) adjuntos += at.value.length;
  }
  return {
    timelineModulo: histCount.ok ? histCount.value : 0,
    comentarios,
    adjuntos,
    activosInspeccionados: activos.length,
    truncado: activos.length >= MAX_ACTIVOS_COLAB,
    nota:
      "Comentarios/adjuntos agregados vía platform.*.byEntity (la plataforma no expone conteo agregado por tenant); conteo exacto hasta " +
      `${MAX_ACTIVOS_COLAB} activos.`,
  };
}

/* ------------------------------ Descriptor ------------------------------- */

export function activosModule(adapters: ModuleAdapters): PlatformServiceDefinition {
  let policiesRegistradas = false;
  const conPolicies = (deps: ServiceDeps): void => {
    if (policiesRegistradas) return;
    for (const p of policiesDelModulo()) deps.runtime.policyEngine.register(p);
    policiesRegistradas = true;
  };
  const catalogoDe = (deps: ServiceDeps) => new CatalogoService(deps.store);

  /**
   * Ejecuta una transición de estado con SUS policies (todas deben permitir) y
   * su evento. Cada policy recibe la configuración del tenant que necesita
   * (p.ej. `requiereAprobacion` para el cierre/retiro) y el estado destino, de
   * modo que la máquina de estados respeta los estados HABILITADOS por catálogo.
   */
  const comandoTransicion = (
    nombre: string,
    permiso: string,
    policies: readonly string[],
    fn: (a: Activo, actorId: string, ahora: Date) => Result<CambioActivo, KernelError>,
    accion: string,
    estadoDestino: EstadoActivo,
  ) => (deps: ServiceDeps) => {
    conPolicies(deps);
    return {
      name: `${MODULO}.${nombre}`,
      inputSchema: ID_VERSION.extend({ aprobado: z.boolean().optional() }),
      authorization: { permissions: [permiso] },
      async handle(ctx: ExecutionContext, input: z.infer<typeof ID_VERSION> & { aprobado?: boolean }, uow: UnitOfWork) {
        const tenant = tenantOf(ctx);
        if (!tenant.ok) return tenant;
        const actual = await cargar(adapters, tenant.value, input.id);
        if (!actual.ok) return actual;

        // El estado destino debe estar habilitado en el catálogo `estados`.
        const estadoOk = await validarEstadoHabilitado(catalogoDe(deps), tenant.value, estadoDestino);
        if (!estadoOk.ok) return estadoOk;

        const requiereAprobacion =
          (await cfg(deps, tenant.value, "requiere-aprobacion-retiro", "false")) === "true";
        const subject = {
          estado: actual.value.estado,
          estadoDestino,
          requiereAprobacion,
          aprobado: input.aprobado === true,
        };
        for (const policy of policies) {
          const decision = deps.runtime.policyEngine.evaluate(policy, ctx, subject);
          if (!decision.ok) return decision;
        }
        const cambio = fn(actual.value, ctx.principal.id, new Date());
        if (!cambio.ok) return cambio;
        const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, accion, false, input.expectedVersion);
        if (!saved.ok) return saved;
        return ok({ id: input.id, estado: saved.value.estado, version: saved.value.version });
      },
    };
  };

  return {
    name: MODULO,
    version: "1.0.0",
    description:
      "Activos Empresariales (DGP-008.1) — dominio neutro por configuración: cualquier clase de activo por catálogos",
    capabilities: [
      {
        name: "gestionar-activos",
        permissions: ["modulo.activos.read", "modulo.activos.write", "modulo.activos.operar"],
        description: "Ciclo de vida operativo del activo (registro, edición, transiciones, mediciones)",
      },
      {
        name: "consultar-activos",
        permissions: ["modulo.activos.read"],
        description: "Consulta de activos y read models",
      },
      {
        name: "administrar-activos",
        permissions: ["modulo.activos.admin", "modulo.activos.retirar"],
        description: "Administración: catálogos, retiro/cierre y reproyección",
      },
    ],
    permissions: [
      "modulo.activos.read",
      "modulo.activos.write",
      "modulo.activos.operar",
      "modulo.activos.retirar",
      "modulo.activos.admin",
    ],
    dependsOn: ["platform.search", "platform.timeline", "platform.attachment", "platform.comment", "platform.config", "platform.qr"],
    events: [...EVENTOS_MODULO, ...EVENTOS_RELACION],
    recordTypes: CATALOGOS.map((c) => `catalogo:${c}`),
    configDefaults: {
      "max-longitud-nombre": "160",
      "max-longitud-codigo": "60",
      "moneda-defecto": "USD",
      "permite-retroceso-horometro": "false",
      "permite-retroceso-odometro": "false",
      "requiere-aprobacion-retiro": "false",
    },
    commands: [
      // Crear — idempotente por id de cliente (offline). Registra el activo.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear`,
          inputSchema: CrearInput,
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const id = input.id ?? crypto.randomUUID();

            if (input.id) {
              const previo = await adapters.repository.findById(tenant.value, id);
              if (!previo.ok) return previo;
              if (previo.value) {
                return ok({ id, version: previo.value.version, estado: previo.value.estado, idempotente: true });
              }
            }

            const unico = await codigoDisponible(adapters.repository, tenant.value, input.codigoEmpresarial);
            if (!unico.ok) return unico;

            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "160"));
            const maxCodigo = Number(await cfg(deps, tenant.value, "max-longitud-codigo", "60"));
            const monedaDefecto = await cfg(deps, tenant.value, "moneda-defecto", "USD");
            // La moneda EFECTIVA (aplicando el defecto) es la que se valida como
            // habilitada: si un tenant no la tiene en su catálogo, se rechaza.
            const monedaEfectiva = input.moneda ?? monedaDefecto;

            // Validación de catálogos (valores habilitados por tenant).
            const cat = catalogoDe(deps);
            const okCat = await validarCatalogos(cat, tenant.value, {
              tipo: input.tipo, categoria: input.categoria, familia: input.familia,
              subfamilia: input.subfamilia ?? null, criticidad: input.criticidad ?? null,
              prioridad: input.prioridad ?? null, moneda: monedaEfectiva,
              centroCosto: input.centroCosto ?? null, empresa: input.empresa ?? null,
              proyecto: input.proyecto ?? null, fabricante: input.fabricante ?? null,
              modelo: input.modelo ?? null, ubicacionId: input.ubicacion?.ubicacionId ?? null,
            });
            if (!okCat.ok) return okCat;

            // Unidades de las mediciones contra el catálogo `unidades`.
            const okUni = await validarUnidades(cat, tenant.value, [
              input.horometro?.unidad, input.odometro?.unidad,
            ]);
            if (!okUni.ok) return okUni;

            // Proveedor: el VO se valida contra el catálogo `proveedores`.
            const okProv = await cat.validarReferencia(
              tenant.value, "proveedores", input.proveedor ?? null, false,
            );
            if (!okProv.ok) return okProv;

            // Construcción de VO validados.
            let ubicacion = null;
            if (input.ubicacion) {
              const vo = crearUbicacion(input.ubicacion);
              if (!vo.ok) return vo;
              ubicacion = vo.value;
            }
            let horometro = null;
            if (input.horometro) {
              const vo = crearMedicion(input.horometro);
              if (!vo.ok) return vo;
              horometro = vo.value;
            }
            let odometro = null;
            if (input.odometro) {
              const vo = crearMedicion(input.odometro);
              if (!vo.ok) return vo;
              odometro = vo.value;
            }
            let garantia = null;
            if (input.garantia) {
              const vo = crearGarantia(input.garantia);
              if (!vo.ok) return vo;
              garantia = vo.value;
            }
            let identificacion = null;
            if (input.identificacion) {
              const vo = crearIdentificacionTecnica(input.identificacion);
              if (!vo.ok) return vo;
              identificacion = vo.value;
            }
            let especificaciones = null;
            if (input.especificaciones) {
              const vo = crearEspecificaciones(input.especificaciones);
              if (!vo.ok) return vo;
              especificaciones = vo.value;
            }

            const registro = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_REGISTRAR, ctx, { estado: "BORRADOR" });
            if (!registro.ok) return registro;

            const cambio = crearActivo({
              id, tenantId: tenant.value,
              codigoEmpresarial: input.codigoEmpresarial, nombre: input.nombre,
              descripcion: input.descripcion, tipo: input.tipo, categoria: input.categoria,
              familia: input.familia, subfamilia: input.subfamilia ?? null,
              fabricante: input.fabricante ?? null, modelo: input.modelo ?? null,
              serie: input.serie ?? null, anio: input.anio ?? null,
              fechaCompra: input.fechaCompra ?? null, fechaPuestaServicio: input.fechaPuestaServicio ?? null,
              vidaUtil: input.vidaUtil ?? null, valorAdquisicion: input.valorAdquisicion ?? null,
              valorResidual: input.valorResidual ?? null, moneda: monedaEfectiva,
              centroCosto: input.centroCosto ?? null, empresa: input.empresa ?? null,
              proyecto: input.proyecto ?? null, proveedor: input.proveedor ?? null,
              ubicacion, responsable: input.responsable ?? null,
              supervisor: input.supervisor ?? null, horometro, odometro, garantia,
              identificacion, especificaciones, criticidad: input.criticidad ?? null,
              prioridad: input.prioridad ?? null, observaciones: input.observaciones,
              actorId: ctx.principal.id, maxLongitudNombre: maxNombre, maxLongitudCodigo: maxCodigo,
              ahora: new Date(),
            });
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "crear", true);
            if (!saved.ok) return saved;
            return ok({ id, version: saved.value.version, estado: saved.value.estado, idempotente: false });
          },
        };
      },
      // Editar — policy puede-modificar + concurrencia optimista + catálogos.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar`,
          inputSchema: ID_VERSION.extend({
            nombre: z.string().min(1).optional(),
            descripcion: z.string().optional(),
            tipo: z.string().optional(),
            categoria: z.string().optional(),
            familia: z.string().optional(),
            subfamilia: z.string().nullish(),
            fabricante: z.string().nullish(),
            modelo: z.string().nullish(),
            serie: z.string().nullish(),
            anio: z.number().int().nullish(),
            fechaCompra: z.string().nullish(),
            fechaPuestaServicio: z.string().nullish(),
            vidaUtil: z.number().nullish(),
            valorAdquisicion: z.number().nullish(),
            valorResidual: z.number().nullish(),
            moneda: z.string().nullish(),
            centroCosto: z.string().nullish(),
            empresa: z.string().nullish(),
            proyecto: z.string().nullish(),
            proveedor: z.string().nullish(),
            supervisor: z.string().nullish(),
            criticidad: z.string().nullish(),
            prioridad: z.string().nullish(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;

            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_MODIFICAR, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;

            const cat = catalogoDe(deps);
            const okCat = await validarCatalogos(cat, tenant.value, {
              tipo: input.tipo ?? actual.value.tipo,
              categoria: input.categoria ?? actual.value.categoria,
              familia: input.familia ?? actual.value.familia,
              subfamilia: input.subfamilia ?? actual.value.subfamilia,
              criticidad: input.criticidad ?? actual.value.criticidad,
              prioridad: input.prioridad ?? actual.value.prioridad,
              moneda: input.moneda ?? actual.value.moneda,
              centroCosto: input.centroCosto ?? actual.value.centroCosto,
              empresa: input.empresa ?? actual.value.empresa,
              proyecto: input.proyecto ?? actual.value.proyecto,
              fabricante: input.fabricante ?? actual.value.fabricante,
              modelo: input.modelo ?? actual.value.modelo,
              ubicacionId: actual.value.ubicacion?.ubicacionId ?? null,
            });
            if (!okCat.ok) return okCat;

            const okProv = await cat.validarReferencia(
              tenant.value, "proveedores", input.proveedor ?? actual.value.proveedor, false,
            );
            if (!okProv.ok) return okProv;

            const maxNombre = Number(await cfg(deps, tenant.value, "max-longitud-nombre", "160"));
            const { id, expectedVersion, ...patch } = input;
            const cambio = editarActivo(actual.value, patch as PatchActivo, ctx.principal.id, maxNombre, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "editar", false, expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id, version: saved.value.version, estado: saved.value.estado });
          },
        };
      },
      // Transiciones de la máquina de estados (cada una con SUS policies).
      comandoTransicion("registrar", "modulo.activos.operar", [POLICY_PUEDE_REGISTRAR], registrarActivo, "registrar", "REGISTRADO"),
      comandoTransicion("operar", "modulo.activos.operar", [POLICY_PUEDE_MODIFICAR], operarActivo, "operar", "OPERATIVO"),
      comandoTransicion("mantener", "modulo.activos.operar", [POLICY_PUEDE_MODIFICAR], mantenerActivo, "mantener", "MANTENIMIENTO"),
      comandoTransicion("fuera-servicio", "modulo.activos.operar", [POLICY_PUEDE_MODIFICAR], fueraServicioActivo, "fuera-servicio", "FUERA_SERVICIO"),
      // Retiro = CIERRE definitivo: exige puede-retirar Y puede-cerrar.
      comandoTransicion("retirar", "modulo.activos.retirar", [POLICY_PUEDE_RETIRAR, POLICY_PUEDE_CERRAR], retirarActivo, "retirar", "RETIRADO"),
      // Cambiar ubicación.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.cambiar-ubicacion`,
          inputSchema: ID_VERSION.extend({ ubicacion: UbicacionInput }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_CAMBIAR_UBICACION, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const okCat = await catalogoDe(deps).validarReferencia(
              tenant.value, "ubicaciones", input.ubicacion.ubicacionId, true,
            );
            if (!okCat.ok) return okCat;
            const vo = crearUbicacion(input.ubicacion);
            if (!vo.ok) return vo;
            const cambio = cambiarUbicacion(actual.value, vo.value, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "cambiar-ubicacion", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Asignar responsable.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asignar-responsable`,
          inputSchema: ID_VERSION.extend({ responsable: z.string().min(1) }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_ASIGNAR_RESPONSABLE, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const cambio = asignarResponsable(actual.value, input.responsable, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "asignar-responsable", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Actualizar horómetro (medición monótona).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.actualizar-horometro`,
          inputSchema: ID_VERSION.extend({ medicion: MedicionInput }),
          authorization: { permissions: ["modulo.activos.operar"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_MODIFICAR_HOROMETRO, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const okUni = await validarUnidades(catalogoDe(deps), tenant.value, [input.medicion.unidad]);
            if (!okUni.ok) return okUni;
            const vo = crearMedicion(input.medicion);
            if (!vo.ok) return vo;
            const permite = (await cfg(deps, tenant.value, "permite-retroceso-horometro", "false")) === "true";
            const cambio = actualizarHorometro(actual.value, vo.value, permite, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "actualizar-horometro", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Actualizar odómetro (medición monótona).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.actualizar-odometro`,
          inputSchema: ID_VERSION.extend({ medicion: MedicionInput }),
          authorization: { permissions: ["modulo.activos.operar"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const actual = await cargar(adapters, tenant.value, input.id);
            if (!actual.ok) return actual;
            const decision = deps.runtime.policyEngine.evaluate(POLICY_PUEDE_MODIFICAR_ODOMETRO, ctx, {
              estado: actual.value.estado,
            });
            if (!decision.ok) return decision;
            const okUni = await validarUnidades(catalogoDe(deps), tenant.value, [input.medicion.unidad]);
            if (!okUni.ok) return okUni;
            const vo = crearMedicion(input.medicion);
            if (!vo.ok) return vo;
            const permite = (await cfg(deps, tenant.value, "permite-retroceso-odometro", "false")) === "true";
            const cambio = actualizarOdometro(actual.value, vo.value, permite, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistirCambio(deps, adapters, ctx, uow, cambio.value, "actualizar-odometro", false, input.expectedVersion);
            if (!saved.ok) return saved;
            return ok({ id: input.id, version: saved.value.version });
          },
        };
      },
      // Catálogo: alta/actualización de una entrada.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.upsert`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            etiqueta: z.string().min(1),
            posicion: z.number().int().optional(),
            padre: z.string().nullish(),
          }),
          authorization: { permissions: ["modulo.activos.admin"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await catalogoDe(deps).upsert(
              uow, tenant.value, input.catalogo,
              { clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre ?? null },
              ctx.principal.id,
            );
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo-upsert", `${input.catalogo}:${input.clave}`, {});
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave });
          },
        };
      },
      // Catálogo: habilitar / deshabilitar una entrada.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.habilitar`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            habilitado: z.boolean(),
          }),
          authorization: { permissions: ["modulo.activos.admin"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await catalogoDe(deps).habilitar(uow, tenant.value, input.catalogo, input.clave, input.habilitado);
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo-habilitar", `${input.catalogo}:${input.clave}`, { habilitado: input.habilitado });
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado });
          },
        };
      },
      // ------------------------ Colaboración -----------------------------
      // Comentar un activo — DELEGA en platform.comment.create. Valida que el
      // activo exista y aplica la autorización del módulo (write). Soporta
      // respuesta (parentId) para hilos.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.comentar`,
          inputSchema: z.object({
            id: z.string().min(1),
            texto: z.string().min(1),
            parentId: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const activo = await cargar(adapters, tenant.value, input.id);
            if (!activo.ok) return activo;
            const r = await delegarPlataforma(deps, ctx, tenant.value, "platform.comment.create", {
              entityRef: refActivo(input.id),
              texto: input.texto,
              parentId: input.parentId,
            });
            if (!r.ok) return r;
            return ok({ activoId: input.id, ...(r.value as Record<string, unknown>) });
          },
        };
      },
      // Editar un comentario propio — DELEGA en platform.comment.edit.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar-comentario`,
          inputSchema: z.object({
            comentarioId: z.string().min(1),
            expectedVersion: z.number().int().positive(),
            texto: z.string().min(1),
            opId: z.string().optional(),
          }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await delegarPlataforma(deps, ctx, tenant.value, "platform.comment.edit", {
              id: input.comentarioId,
              expectedVersion: input.expectedVersion,
              texto: input.texto,
            });
            if (!r.ok) return r;
            return ok({ comentarioId: input.comentarioId });
          },
        };
      },
      // Borrado lógico de un comentario — DELEGA en platform.comment.delete.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.borrar-comentario`,
          inputSchema: z.object({ comentarioId: z.string().min(1), opId: z.string().optional() }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await delegarPlataforma(deps, ctx, tenant.value, "platform.comment.delete", {
              id: input.comentarioId,
            });
            if (!r.ok) return r;
            return ok({ comentarioId: input.comentarioId });
          },
        };
      },
      // Adjuntar documentación técnica POR REFERENCIA — DELEGA en
      // platform.attachment.register. La categoría de documentación técnica
      // (manual/certificado/garantía/diagrama/plano/procedimiento) viaja como
      // metadato en el nombre lógico; los binarios NUNCA salen de plataforma.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.adjuntar`,
          inputSchema: z.object({
            id: z.string().min(1),
            categoria: z.enum(CATEGORIAS_DOCUMENTACION),
            nombreArchivo: z.string().min(1),
            mimeType: z.string().min(1),
            tamanoBytes: z.number().int().nonnegative(),
            hashSha256: z.string().length(64),
            attachmentId: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const activo = await cargar(adapters, tenant.value, input.id);
            if (!activo.ok) return activo;
            const r = await delegarPlataforma(deps, ctx, tenant.value, "platform.attachment.register", {
              entityRef: refActivo(input.id),
              // La categoría documental se codifica como prefijo del nombre
              // lógico (metadato), sin tocar el binario.
              nombreArchivo: `[${input.categoria}] ${input.nombreArchivo}`,
              mimeType: input.mimeType,
              tamanoBytes: input.tamanoBytes,
              hashSha256: input.hashSha256,
              attachmentId: input.attachmentId,
            });
            if (!r.ok) return r;
            return ok({ activoId: input.id, categoria: input.categoria, ...(r.value as Record<string, unknown>) });
          },
        };
      },
      // Emitir una etiqueta (QR/barcode/NFC) para el activo — DELEGA en
      // platform.qr.issue. IDEMPOTENTE por activo+tipo: si ya existe una
      // etiqueta ACTIVA de ese tipo para el activo, la reutiliza (no reemite).
      // `tipo` por defecto "qr"; barcode/nfc quedan preparados (sin UI hardware).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.qr-emitir`,
          inputSchema: z.object({
            id: z.string().min(1),
            tipo: z.enum(["qr", "barcode", "nfc"]).default("qr"),
          }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const activo = await cargar(adapters, tenant.value, input.id);
            if (!activo.ok) return activo;
            const ref = refActivo(input.id);
            // Idempotencia por activo+tipo: reutiliza etiqueta activa existente.
            const existentes = await deps.runtime.queries.execute(ctx, "platform.qr.list", { tipo: input.tipo });
            if (!existentes.ok) return existentes;
            const previa = (existentes.value as Array<Record<string, unknown>>).find(
              (t) => t["status"] === "active" && (t["data"] as Record<string, unknown> | undefined)?.["entityRef"] === ref,
            );
            if (previa) {
              const data = previa["data"] as Record<string, unknown>;
              return ok({ activoId: input.id, id: previa["id"], codigo: data["codigo"], tipo: input.tipo, reutilizada: true });
            }
            const r = await delegarPlataforma(deps, ctx, tenant.value, "platform.qr.issue", {
              tipo: input.tipo,
              entityRef: ref,
              acciones: ["open"],
            });
            if (!r.ok) return r;
            return ok({ activoId: input.id, tipo: input.tipo, reutilizada: false, ...(r.value as Record<string, unknown>) });
          },
        };
      },
      // Reproyección (replay del EVENT STREAM): reconstruye TODOS los read
      // models releyendo los eventos del módulo YA PROCESADOS del outbox del
      // kernel (orden cronológico, tenant-scoped, sólo lectura) y reaplicando
      // las MISMAS funciones de proyección payload-only sobre read models
      // vaciados. Preserva la historia (no snapshots ni ids sintéticos).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reproyectar`,
          inputSchema: z.object({}),
          authorization: { permissions: ["modulo.activos.admin"] },
          async handle(ctx, _input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            // Limpia TODOS los read models del módulo antes de reconstruir.
            const cleared = await adapters.readModel.clear(uow, tenant.value);
            if (!cleared.ok) return cleared;
            const clearedRel = await adapters.relacionesRead.clear(uow, tenant.value);
            if (!clearedRel.ok) return clearedRel;
            const clearedHist = await adapters.historial.clear(uow, tenant.value);
            if (!clearedHist.ok) return clearedHist;

            // Fuente del replay: la BITÁCORA DURABLE del módulo (`act_eventos`),
            // NO el outbox. Es íntegra e independiente de processed_at y de la
            // retención del outbox, de modo que la reconstrucción es completa
            // aunque haya eventos pendientes o el outbox haya sido purgado.
            const stream = await adapters.eventLog.stream(tenant.value);
            if (!stream.ok) return stream;
            let eventos = 0;
            let relaciones = 0;
            for (const ev of stream.value) {
              const r = await reproyectarEvento(adapters, uow, {
                id: ev.eventId,
                eventType: ev.tipo,
                payload: ev.payload,
              });
              if (!r.ok) return r;
              eventos += 1;
              if (ev.tipo === RELACION_CREADA) relaciones += 1;
              if (ev.tipo === RELACION_ELIMINADA) relaciones -= 1;
              // El índice de búsqueda (platform.search) NO se limpia aquí: se
              // mantiene incrementalmente por los eventHandlers `indexar:*` sobre
              // eventos vivos y es idempotente por documentId. Reindexar aquí
              // exigiría anidar un comando dentro de esta UoW (anti-patrón), por
              // lo que la rehidratación del índice se hace fuera del pipeline
              // mediante el comando `platform.search.rebuild`.
            }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reproyectar", "-", {
              eventos,
              relaciones,
            });
            if (!audited.ok) return audited;
            return ok({ eventos, relaciones });
          },
        };
      },
      // Crear relación inter-activo (existencia + anticiclo jerárquico).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-relacion`,
          inputSchema: z.object({
            id: z.string().optional(),
            opId: z.string().optional(),
            tipo: z.enum(NOMBRES_TIPO_RELACION as [string, ...string[]]),
            origenId: z.string().min(1),
            destinoId: z.string().min(1),
          }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const id = input.id ?? crypto.randomUUID();

            // Idempotencia offline por id de cliente.
            if (input.id) {
              const previo = await adapters.relaciones.find(tenant.value, id);
              if (!previo.ok) return previo;
              if (previo.value) return ok({ id, idempotente: true });
            }

            // Tipos de relación configurables por tenant (catálogo
            // `tiposRelacion`): vacío ⇒ los 8 canónicos; no vacío ⇒ sólo los
            // habilitados con su inverso declarado.
            const opciones = await catalogoDe(deps).opciones(tenant.value, "tiposRelacion");
            if (!opciones.ok) return opciones;
            const resueltos = resolverTiposRelacion(opciones.value.map((o) => o.value));
            if (!resueltos.ok) return resueltos;
            if (!resueltos.value.some((t) => t.tipo === input.tipo)) {
              return fail(
                KernelErrors.validation(`Tipo de relación "${input.tipo}" no habilitado para este tenant`),
              );
            }

            // Ambos extremos deben existir (fuente de verdad = aggregate).
            const origen = await cargar(adapters, tenant.value, input.origenId);
            if (!origen.ok) return origen;
            const destino = await cargar(adapters, tenant.value, input.destinoId);
            if (!destino.ok) return destino;

            const cambio = await crearRelacion({
              tenantId: tenant.value,
              id,
              tipo: input.tipo,
              origen: { id: origen.value.id, codigo: origen.value.codigoEmpresarial, nombre: origen.value.nombre },
              destino: { id: destino.value.id, codigo: destino.value.codigoEmpresarial, nombre: destino.value.nombre },
              actorId: ctx.principal.id,
              ahora: new Date(),
              existeArista: (o, d, t) => adapters.relaciones.existeArista(tenant.value, o, d, t),
              alcanza: (desde, hasta, t) => adapters.relaciones.alcanza(tenant.value, desde, hasta, t),
            });
            if (!cambio.ok) return cambio;

            const persisted = await adapters.relaciones.insert(
              uow,
              tenant.value,
              { id, tipo: input.tipo, origenId: input.origenId, destinoId: input.destinoId },
              ctx.principal.id,
            );
            if (!persisted.ok) return persisted;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-relacion", id, {
              tipo: input.tipo,
            });
            if (!audited.ok) return audited;
            const emitido = await emitirEvento(adapters, ctx, uow, tenant.value, cambio.value.evento);
            if (!emitido.ok) return emitido;
            return ok({ id, tipo: input.tipo, idempotente: false });
          },
        };
      },
      // Eliminar relación inter-activo.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.eliminar-relacion`,
          inputSchema: z.object({ id: z.string().min(1), opId: z.string().optional() }),
          authorization: { permissions: ["modulo.activos.write"] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const removed = await adapters.relaciones.delete(uow, tenant.value, input.id);
            if (!removed.ok) return removed;
            if (!removed.value) return fail(KernelErrors.notFound("relacion", input.id));
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "eliminar-relacion", input.id, {});
            if (!audited.ok) return audited;
            const evento = eliminarRelacion({
              tenantId: tenant.value,
              id: input.id,
              tipo: removed.value.tipo,
              origenId: removed.value.origenId,
              destinoId: removed.value.destinoId,
              actorId: ctx.principal.id,
              ahora: new Date(),
            });
            const emitido = await emitirEvento(adapters, ctx, uow, tenant.value, evento);
            if (!emitido.ok) return emitido;
            return ok({ id: input.id });
          },
        };
      },
      // NOTA: la sincronización offline NO es un comando del Kernel (eso
      // anidaría UoWs). Es una ORQUESTACIÓN fuera del pipeline: ver
      // `procesarCola` en `sincronizacion.ts`, expuesta por el runtime como
      // `sincronizar(ctx, operaciones)` y por el router como POST .../sync.
    ],
    queries: [
      // Listado desde el READ MODEL con filtros avanzados para tabla/tarjetas.
      // Filtros de columna indexada (estado/criticidad/tipo/ubicacionId) se
      // resuelven en el store; los filtros por atributo del payload
      // (categoria/familia/responsable) y el texto libre (`q` sobre
      // código/nombre) se aplican SOBRE el resultado (payload-only, sin tocar el
      // dominio). Paginación por `limit`/`offset`.
      () => ({
        name: `${MODULO}.listar`,
        inputSchema: z.object({
          estado: z.enum(ESTADOS).optional(),
          criticidad: z.string().optional(),
          ubicacionId: z.string().optional(),
          tipo: z.string().optional(),
          categoria: z.string().optional(),
          familia: z.string().optional(),
          responsable: z.string().optional(),
          q: z.string().optional(),
          limit: z.number().int().positive().max(200).optional(),
          offset: z.number().int().nonnegative().optional(),
        }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const listado = await adapters.readModel.list(tenant.value, {
            estado: input.estado as EstadoActivo | undefined,
            criticidad: input.criticidad,
            ubicacionId: input.ubicacionId,
            tipo: input.tipo,
            // Traemos una ventana amplia del read model (los filtros por atributo
            // del payload y la paginación se aplican en la aplicación).
            limit: 500,
          });
          if (!listado.ok) return listado;
          const q = input.q?.trim().toLowerCase();
          let filas = listado.value.filter((row) => {
            const datos = row.datos as Record<string, unknown>;
            if (input.categoria && String(datos["categoria"] ?? "") !== input.categoria) return false;
            if (input.familia && String(datos["familia"] ?? "") !== input.familia) return false;
            if (input.responsable && String(datos["responsable"] ?? "") !== input.responsable) return false;
            if (q) {
              const hay = `${row.codigoEmpresarial} ${row.nombre}`.toLowerCase();
              if (!hay.includes(q)) return false;
            }
            return true;
          });
          if (input.offset) filas = filas.slice(input.offset);
          if (input.limit) filas = filas.slice(0, input.limit);
          return ok(filas);
        },
      }),
      // Detalle: read model (CQRS estricto) + etiqueta QR/barcode/NFC vigente
      // si existe (consulta a platform.qr.list, payload-only). Se incluye el
      // primer código ACTIVO cuyo entityRef apunta a este activo.
      (deps) => ({
        name: `${MODULO}.detalle`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const rm = await adapters.readModel.get(tenant.value, input.id);
          if (!rm.ok) return rm;
          if (!rm.value) return fail(KernelErrors.notFound("activo", input.id));
          // Etiqueta de identificación (código) si existe — mejor esfuerzo:
          // un fallo del servicio de QR no impide devolver el detalle.
          let etiqueta: Record<string, unknown> | null = null;
          const tags = await deps.runtime.queries.execute(ctx, "platform.qr.list", {});
          if (tags.ok) {
            const ref = refActivo(input.id);
            const tag = (tags.value as Array<Record<string, unknown>>).find(
              (t) => t["status"] === "active" && (t["data"] as Record<string, unknown> | undefined)?.["entityRef"] === ref,
            );
            if (tag) {
              const data = tag["data"] as Record<string, unknown>;
              etiqueta = { id: tag["id"], codigo: data["codigo"], tipo: data["tipo"] };
            }
          }
          return ok({ ...rm.value, etiqueta });
        },
      }),
      // Búsqueda de activos (rápida global y contextual) — DELEGA en
      // platform.search. `entityType` fija el scope del módulo ("activo").
      // Devuelve documentos del índice (payload-only). Filtros opcionales
      // (estado/tipo/categoria/familia/criticidad/ubicacionId/responsable) se
      // aplican SOBRE los resultados del índice, sin releer aggregates.
      (deps) => ({
        name: `${MODULO}.busqueda`,
        inputSchema: z.object({
          q: z.string().min(1),
          limit: z.number().int().positive().max(200).optional(),
          estado: z.enum(ESTADOS).optional(),
          tipo: z.string().optional(),
          categoria: z.string().optional(),
          familia: z.string().optional(),
          criticidad: z.string().optional(),
          ubicacionId: z.string().optional(),
          responsable: z.string().optional(),
        }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          // Contextual al scope del módulo: platform.search.contextual filtra por
          // entityType === "activo" antes de puntuar por tokens.
          const r = await deps.runtime.queries.execute(ctx, "platform.search.contextual", {
            q: input.q,
            entityType: "activo",
          });
          if (!r.ok) return r;
          // Cada resultado es {id, score, documentId, entityRef, titulo, contenido,...}.
          // Enriquecemos con el read model del activo para poder filtrar por
          // atributos estructurados y devolver campos de tabla/tarjeta.
          const docs = r.value as Array<Record<string, unknown>>;
          const salida: Array<Record<string, unknown>> = [];
          for (const d of docs) {
            const activoId = String(d["entityRef"] ?? "").replace(/^activo:/, "");
            if (!activoId) continue;
            const rm = await adapters.readModel.get(tenant.value, activoId);
            if (!rm.ok) return rm;
            const row = rm.value;
            if (!row) continue; // documento del índice sin read model (p.ej. purgado)
            const datos = row.datos as Record<string, unknown>;
            const ubic = (datos["ubicacion"] ?? null) as Record<string, unknown> | null;
            if (input.estado && row.estado !== input.estado) continue;
            if (input.tipo && row.tipo !== input.tipo) continue;
            if (input.criticidad && row.criticidad !== input.criticidad) continue;
            if (input.ubicacionId && (ubic?.["ubicacionId"] ?? null) !== input.ubicacionId) continue;
            if (input.categoria && String(datos["categoria"] ?? "") !== input.categoria) continue;
            if (input.familia && String(datos["familia"] ?? "") !== input.familia) continue;
            if (input.responsable && String(datos["responsable"] ?? "") !== input.responsable) continue;
            salida.push({
              id: activoId,
              score: d["score"] ?? 0,
              codigoEmpresarial: row.codigoEmpresarial,
              nombre: row.nombre,
              estado: row.estado,
              tipo: row.tipo,
              categoria: datos["categoria"] ?? null,
              familia: datos["familia"] ?? null,
              criticidad: row.criticidad,
              ubicacionId: ubic?.["ubicacionId"] ?? null,
              responsable: datos["responsable"] ?? null,
              fabricante: datos["fabricante"] ?? null,
              modelo: datos["modelo"] ?? null,
              serie: datos["serie"] ?? null,
            });
            if (input.limit && salida.length >= input.limit) break;
          }
          return ok(salida);
        },
      }),
      // Resolución de una etiqueta (QR/barcode/NFC) a su activo para navegación
      // directa. Es una CONSULTA sin efectos: usa `platform.qr.list` y filtra por
      // código ACTIVO (no `platform.qr.resolve`, que es un comando que registra
      // el escaneo). Devuelve {activoId, tipo, codigo}; 404 si la etiqueta no
      // existe o fue revocada, o si su entityRef no apunta a un activo.
      (deps) => ({
        name: `${MODULO}.qr-resolver`,
        inputSchema: z.object({ codigo: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await deps.runtime.queries.execute(ctx, "platform.qr.list", {});
          if (!r.ok) return r;
          const tag = (r.value as Array<Record<string, unknown>>).find(
            (t) => (t["data"] as Record<string, unknown> | undefined)?.["codigo"] === input.codigo,
          );
          // Inexistente o revocada (sólo se resuelven etiquetas activas) ⇒ 404.
          if (!tag || tag["status"] !== "active") {
            return fail(KernelErrors.notFound("etiqueta", input.codigo));
          }
          const data = tag["data"] as Record<string, unknown>;
          const entityRef = String(data["entityRef"] ?? "");
          if (!entityRef.startsWith("activo:")) {
            return fail(KernelErrors.notFound("etiqueta-activo", input.codigo));
          }
          return ok({
            activoId: entityRef.slice("activo:".length),
            tipo: data["tipo"] ?? "qr",
            codigo: input.codigo,
            acciones: data["acciones"] ?? [],
          });
        },
      }),
      // URL firmada de un adjunto (documentación técnica) del activo — DELEGA en
      // platform.attachment.signedUrl, validando que el adjunto pertenece al
      // activo/tenant. La plataforma es referencia-only: devuelve URL firmada
      // (HMAC + TTL) + metadatos; NUNCA binarios.
      (deps) => ({
        name: `${MODULO}.documentacion-url`,
        inputSchema: z.object({ id: z.string().min(1), attachmentId: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const activo = await cargar(adapters, tenant.value, input.id);
          if (!activo.ok) return activo;
          // El adjunto debe pertenecer a ESTE activo (entityRef) del tenant.
          const meta = await deps.runtime.queries.execute(ctx, "platform.attachment.get", { id: input.attachmentId });
          if (!meta.ok) return meta;
          const rec = meta.value as { tenantId?: string; data?: Record<string, unknown> } | null;
          if (!rec || (rec.data?.["entityRef"] ?? null) !== refActivo(input.id)) {
            return fail(KernelErrors.notFound("attachment", input.attachmentId));
          }
          const signed = await deps.runtime.queries.execute(ctx, "platform.attachment.signedUrl", { id: input.attachmentId });
          if (!signed.ok) return signed;
          const s = signed.value as { url: string; expiresAt: number };
          return ok({
            activoId: input.id,
            attachmentId: input.attachmentId,
            url: s.url,
            expiresAt: s.expiresAt,
            nombreArchivo: rec.data?.["nombreArchivo"] ?? null,
            mimeType: rec.data?.["mimeType"] ?? null,
            tamanoBytes: rec.data?.["tamanoBytes"] ?? null,
            hashSha256: rec.data?.["hashSha256"] ?? null,
            // referencia-only: la plataforma NO almacena binarios; el servido
            // resuelve la referencia y devuelve metadatos + verificación HMAC/TTL.
            almacenamiento: "referencia",
          });
        },
      }),
      // Opciones de un catálogo (habilitadas).
      (deps) => ({
        name: `${MODULO}.catalogo.opciones`,
        inputSchema: z.object({ catalogo: z.enum(CATALOGOS) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return new CatalogoService(deps.store).opciones(tenant.value, input.catalogo as NombreCatalogo);
        },
      }),
      // Relacionados de un activo (por categoría opcional), desde el read model.
      () => ({
        name: `${MODULO}.relacionados`,
        inputSchema: z.object({
          id: z.string().min(1),
          categoria: z.enum(["jerarquia", "dependencia", "componente", "asociacion", "sustitucion"]).optional(),
        }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const cat = input.categoria as CategoriaRelacion | undefined;
          const salientes = await adapters.relacionesRead.porOrigen(tenant.value, input.id, cat);
          if (!salientes.ok) return salientes;
          const entrantes = await adapters.relacionesRead.porDestino(tenant.value, input.id, cat);
          if (!entrantes.ok) return entrantes;
          return ok({ id: input.id, salientes: salientes.value, entrantes: entrantes.value });
        },
      }),
      // Árbol jerárquico: hijos (salientes padre-de) y padres (entrantes padre-de).
      () => ({
        name: `${MODULO}.arbol`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const jer = await adapters.relacionesRead.porOrigen(tenant.value, input.id, "jerarquia");
          if (!jer.ok) return jer;
          const jerEntr = await adapters.relacionesRead.porDestino(tenant.value, input.id, "jerarquia");
          if (!jerEntr.ok) return jerEntr;
          return ok({
            id: input.id,
            hijos: jer.value.filter((r) => r.tipo === "padre-de"),
            padres: jerEntr.value.filter((r) => r.tipo === "padre-de"),
          });
        },
      }),
      // Componentes: compuesto-por (salientes) y componente-de (entrantes).
      () => ({
        name: `${MODULO}.componentes`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const comp = await adapters.relacionesRead.porOrigen(tenant.value, input.id, "componente");
          if (!comp.ok) return comp;
          const parte = await adapters.relacionesRead.porDestino(tenant.value, input.id, "componente");
          if (!parte.ok) return parte;
          return ok({
            id: input.id,
            componentes: comp.value.filter((r) => r.tipo === "compuesto-por"),
            perteneceA: parte.value.filter((r) => r.tipo === "compuesto-por"),
          });
        },
      }),
      // Historial de ubicaciones (append-only) desde el read model histórico.
      () => ({
        name: `${MODULO}.historial-ubicaciones`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return adapters.historial.historialUbicaciones(tenant.value, input.id);
        },
      }),
      // Historial de responsables (append-only).
      () => ({
        name: `${MODULO}.historial-responsables`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return adapters.historial.historialResponsables(tenant.value, input.id);
        },
      }),
      // Historial cronológico del activo desde el READ MODEL INTERNO
      // (act_historial). Es la vista interna del módulo (no el Shared Timeline).
      () => ({
        name: `${MODULO}.historial`,
        inputSchema: z.object({ id: z.string().min(1), limit: z.number().int().positive().max(200).optional() }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          return adapters.historial.timeline(tenant.value, input.id, input.limit);
        },
      }),
      // Colaboración: comentarios de un activo — DELEGA en platform.comment.byEntity.
      (deps) => ({
        name: `${MODULO}.comentarios`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const sys = createExecutionContext({
            principal: SYSTEM_PRINCIPAL,
            correlationId: ctx.correlationId,
            metadata: { tenantId: tenant.value },
          });
          return deps.runtime.queries.execute(sys, "platform.comment.byEntity", { entityRef: refActivo(input.id) });
        },
      }),
      // Colaboración: documentación técnica adjunta — DELEGA en
      // platform.attachment.byEntity (sólo metadatos; nunca binarios).
      (deps) => ({
        name: `${MODULO}.documentacion`,
        inputSchema: z.object({ id: z.string().min(1) }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const sys = createExecutionContext({
            principal: SYSTEM_PRINCIPAL,
            correlationId: ctx.correlationId,
            metadata: { tenantId: tenant.value },
          });
          return deps.runtime.queries.execute(sys, "platform.attachment.byEntity", { entityRef: refActivo(input.id) });
        },
      }),
      // Línea de tiempo CANÓNICA (Shared Timeline de plataforma) con los filtros
      // obligatorios: actor, rango de fechas, estado y entidad relacionada. Se
      // apoya en la query platform.timeline.query (integración canónica),
      // ejecutada con principal de sistema y acotada al tenant.
      (deps) => ({
        name: `${MODULO}.timeline`,
        inputSchema: z.object({
          id: z.string().min(1).optional(),
          actor: z.string().optional(),
          estado: z.string().optional(),
          entidadRelacionada: z.string().optional(),
          desde: z.string().optional(),
          hasta: z.string().optional(),
          limit: z.number().int().positive().max(200).optional(),
        }),
        authorization: { permissions: ["modulo.activos.read"] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const sys = createExecutionContext({
            principal: SYSTEM_PRINCIPAL,
            correlationId: ctx.correlationId,
            metadata: { tenantId: tenant.value },
          });
          return deps.runtime.queries.execute(sys, "platform.timeline.query", {
            entityRef: input.id ? `activo:${input.id}` : undefined,
            actorId: input.actor,
            estado: input.estado,
            entidadRelacionada: input.entidadRelacionada,
            desde: input.desde,
            hasta: input.hasta,
            limit: input.limit,
          });
        },
      }),
      // Consola técnica: contrato + configuración efectiva + estado operativo.
      // Restringida a administradores (admin / platform_admin): 403 al resto.
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({}),
        authorization: { permissions: ["modulo.activos.admin"] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const t = tenant.value;
          const claves = [
            "max-longitud-nombre", "max-longitud-codigo", "moneda-defecto",
            "permite-retroceso-horometro", "permite-retroceso-odometro", "requiere-aprobacion-retiro",
          ];
          const config: Record<string, string> = {};
          for (const k of claves) config[k] = await cfg(deps, t, k, "");

          const LIMITE = 10;

          // (proyecciones) conteos + lastEventId de cada read model.
          const stats = await adapters.readModel.stats(t);
          const relCount = await adapters.relacionesRead.contar(t);
          const histCount = await adapters.historial.contarEventos(t);
          const totalRm = stats.ok ? Object.values(stats.value).reduce((a, b) => a + b, 0) : 0;
          const [leiActivos, leiRel, leiHist] = await Promise.all([
            adapters.readModel.lastEventId(t),
            adapters.relacionesRead.lastEventId(t),
            adapters.historial.lastEventId(t),
          ]);

          // (outbox) conteos pendientes/procesados + últimos N eventos del módulo.
          const outbox = await adapters.consola.outboxDelModulo(t, LIMITE);

          // (sincronización) recibos por estado + últimos N + conflictos con detalle.
          const recibos = await adapters.syncReceipts.listByTenant(t);
          const listaRecibos: readonly SyncReceipt[] = recibos.ok ? recibos.value : [];
          const porEstado: Record<string, number> = {};
          for (const r of listaRecibos) porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1;
          const resumenRecibo = (r: SyncReceipt) => ({
            opId: r.opId, comando: r.comando, estado: r.estado,
            clienteId: r.clienteId, createdAt: r.createdAt ? r.createdAt.toISOString() : null,
          });
          const conflictos = listaRecibos
            .filter((r) => r.estado === "conflicto")
            .map((r) => ({ ...resumenRecibo(r), resultado: r.resultado }));

          // (colaboración) actividad del módulo + comentarios/adjuntos de plataforma.
          const colaboracion = await actividadColaboracion(deps, adapters, ctx, t);

          return ok({
            modulo: MODULO,
            version: "1.0.0",
            estados: [...ESTADOS],
            eventos: [...EVENTOS_MODULO, ...EVENTOS_RELACION],
            policies: [...POLICIES],
            catalogos: [...CATALOGOS],
            tiposRelacion: TIPOS_RELACION.map((t) => ({ tipo: t.tipo, categoria: t.categoria, inverso: t.inverso })),
            configuracion: config,
            readModels: {
              activos: { total: totalRm, porEstado: stats.ok ? stats.value : {}, lastEventId: leiActivos.ok ? leiActivos.value : null },
              relaciones: { total: relCount.ok ? relCount.value : 0, lastEventId: leiRel.ok ? leiRel.value : null },
              historial: { total: histCount.ok ? histCount.value : 0, lastEventId: leiHist.ok ? leiHist.value : null },
            },
            outbox: outbox.ok
              ? outbox.value
              : { pendientes: 0, procesados: 0, ultimos: [], error: outbox.error.message },
            sincronizacion: {
              total: listaRecibos.length,
              porEstado,
              ultimos: listaRecibos.slice(0, LIMITE).map(resumenRecibo),
              conflictos,
            },
            colaboracion,
            rls: {
              tablas: [
                "act_activos", "act_activos_read", "act_sync_receipts",
                "act_relaciones", "act_relaciones_read",
                "act_ubicaciones_hist", "act_responsables_hist", "act_historial",
              ],
              aislamiento: "app.tenant_id (RLS por tenant)",
            },
          });
        },
      }),
    ],
    eventHandlers: [
      // Projection: todos los eventos actualizan el read model (idempotente).
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          proyeccion(adapters)(deps, event),
      })),
      // Read model INTERNO de historial del activo: cada evento de dominio
      // (activos Y relaciones) se proyecta al feed cronológico append-only del
      // módulo (act_historial). Es un read model, NO el Shared Timeline.
      ...[...EVENTOS_MODULO, ...EVENTOS_RELACION].map((eventType) => ({
        eventType,
        handlerName: `historial:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          proyeccionHistorial(adapters)(deps, { ...event, type: eventType }),
      })),
      // Shared Timeline CANÓNICO: cada evento del módulo (activos Y relaciones)
      // se proyecta al platform.timeline vía COMANDO (nunca escritura directa).
      ...[...EVENTOS_MODULO, ...EVENTOS_RELACION].map((eventType) => ({
        eventType,
        handlerName: `timeline-compartido:${eventType}`,
        handle: (deps: ServiceDeps) => (event: {
          id: string;
          payload: Record<string, unknown>;
          correlationId: string;
        }) => registrarEnTimelineCompartido()(deps, { ...event, type: eventType }),
      })),
      // Historial de ubicaciones (creación + cambio de ubicación).
      ...[ACTIVO_REGISTRADO, ACTIVO_UBICACION_ACTUALIZADA].map((eventType) => ({
        eventType,
        handlerName: `ubicacion-hist:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          proyeccionUbicacion(adapters)(deps, event),
      })),
      // Historial de responsables (creación + reasignación).
      ...[ACTIVO_REGISTRADO, ACTIVO_RESPONSABLE_ACTUALIZADO].map((eventType) => ({
        eventType,
        handlerName: `responsable-hist:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          proyeccionResponsable(adapters)(deps, event),
      })),
      // Read model de relaciones (árbol/relacionados/componentes).
      ...EVENTOS_RELACION.map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          proyeccionRelacion(adapters)(deps, { ...event, type: eventType }),
      })),
      // Search: (re)indexación del activo desde el payload en CUALQUIER evento
      // del módulo (registro/edición/transiciones/mover/reasignar/medidores).
      // Todos los eventos son payload-autosuficientes, así que el documento del
      // índice refleja siempre el último estado del activo. Idempotente.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `indexar:${eventType}`,
        handle: (deps: ServiceDeps) => async (event: {
          payload: Record<string, unknown>;
          correlationId: string;
        }) => indexarActivo(deps, event.correlationId, event.payload),
      })),
    ],
    healthCheck: () => async () => {
      const probe = await adapters.readModel.stats("healthcheck");
      return probe.ok
        ? { healthy: true, detail: "repositorio y read model de activos operativos" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}
