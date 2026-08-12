/**
 * DGP-009.1 · Módulo Órdenes de Trabajo Empresariales — Capa de aplicación +
 * descriptor del servicio.
 *
 * Se registra por el ÚNICO mecanismo permitido (extraServices de
 * createPlatformRuntime). El ciclo de vida se gobierna con el Workflow Engine
 * (servicio `modulo.ordenes.workflow`, montado junto a este módulo). TODA
 * transición de estado se ejecuta mediante los comandos de instancia del motor;
 * este módulo NUNCA implementa lógica de transición propia.
 *
 * Patrón de ORQUESTACIÓN (evita comandos anidados en la misma UoW): los comandos
 * de transición ejecutan el comando del motor en su propio contexto/UoW y, a
 * continuación, sincronizan el estado resultante al aggregate/read model en una
 * UoW SEPARADA. No hay comandos anidados dentro de una misma UoW (regla dura).
 */
import { z } from "zod";
import {
  childContext,
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
import { nombresDefinicion, nombresInstancia } from "@workspace/workflow-engine";
import { MODULO, MODULO_WORKFLOW } from "./module-name";
import {
  CATALOGOS,
  type NombreCatalogo,
} from "./domain/catalogos";
import {
  CMD_ABRIR,
  componerDefinicion,
  estadoDeNegocio,
  firmaExtension,
  PERMISO_OPERAR,
  WORKFLOW_ORDEN,
  type EstadoOrdenEfectivo,
  type ExtensionMaquina,
} from "./domain/maquina-estados";
import {
  actualizarAsignacion,
  actualizarEjecucion,
  agregarEvidencia,
  aplicarEstado,
  asociarChecklist,
  asociarFormulario,
  crearOrden,
  editarOrden,
  EVENTOS_MODULO,
  type CambioOrden,
  type OrdenTrabajo,
} from "./domain/orden";
import {
  policiesDelModulo,
  POLICY_PUEDE_ASIGNAR,
  POLICY_PUEDE_ASOCIAR_CHECKLIST,
  POLICY_PUEDE_ASOCIAR_FORMULARIO,
  POLICY_PUEDE_AGREGAR_EVIDENCIA,
  POLICY_PUEDE_CREAR,
  POLICY_PUEDE_EDITAR,
  POLICY_PUEDE_EJECUTAR,
  POLICY_PUEDE_TRANSICIONAR,
} from "./domain/policies";
import {
  crearCosto,
  crearDiagnostico,
  crearDuracion,
  crearEvidencia,
  crearFechas,
  crearReferenciaActivo,
  crearReferenciaPlantilla,
  crearRiesgoImpacto,
  crearSla,
  crearUbicacion,
} from "./domain/value-objects";
import {
  CONFIG_CODIGO_DEFAULT,
  type CatalogoPort,
  type ConfigCodigo,
  type ConsecutivoPort,
  type IdentidadPort,
  type OrdenRepository,
  type PlantillasPort,
  type ReciboPort,
} from "./domain/ports";
import {
  ACCIONES_BITACORA,
  ASIGNACION_REGISTRADA,
  BITACORA_REGISTRADA,
  CATEGORIAS_RELACION,
  CLASES_RECURSO,
  ESTADOS_SLA,
  EVENTOS_OPERACIONALES,
  PLANIFICACION_ACTUALIZADA,
  PLANIFICACION_BLOQUEADA,
  RECURSO_REGISTRADO,
  RELACION_CREADA,
  SLA_ACTUALIZADO,
  TIPOS_ASIGNACION,
} from "./domain/operacional";
import {
  ORDEN_ASIGNACION_ACTUALIZADA,
  ORDEN_CHECKLIST_ASOCIADO,
  ORDEN_CREADA,
  ORDEN_ESTADO_CAMBIADO,
  ORDEN_EVIDENCIA_AGREGADA,
  ORDEN_FORMULARIO_ASOCIADO,
} from "./domain/orden";
import type {
  OrdenReadModel,
  OrdenReadRow,
} from "./infrastructure/repository";
import type {
  Asignacion,
  ConsolaStore,
  EventLogStore,
  MotorStore,
  Planificacion,
  ProyeccionesStore,
  Recurso,
  RelacionArista,
  Sla as SlaOperativo,
  SyncReceipt,
  SyncReceiptStore,
} from "./infrastructure/operacional";
import {
  aplicarEventoAggregate,
  aplicarEventoOperacional,
  aplicarEventoSesion,
  handlerProyeccion,
} from "./projection";
import {
  EVENTOS_SESION,
  evaluarReloj,
  SESION_CERRADA,
  SESION_INICIADA,
  SESION_PAUSADA,
  SESION_REANUDADA,
  transicion,
  type ComandoSesion,
  type EstadoSesion,
  type OrigenTramo,
  type TipoTramo,
} from "./domain/sesion";
import type {
  SesionCabecera,
  SesionStore,
  TramoFila,
} from "./infrastructure/sesiones";

export { MODULO };

/**
 * Puertos de dominio + infraestructura que la capa de aplicación necesita. En
 * runtime se inyectan adaptadores PostgreSQL (o Fakes en memoria para
 * offline/pruebas). Incluye el aggregate + read models CQRS + bitácora durable
 * (event log) + recibos de sync durables + stores operacionales + consola.
 */
export interface ModuleAdapters {
  readonly repository: OrdenRepository;
  readonly catalogos: CatalogoPort;
  readonly consecutivo: ConsecutivoPort;
  readonly recibos: ReciboPort;
  readonly plantillas: PlantillasPort;
  /** DGP-020.1 — Puerto hacia la Identidad canónica (validación de asignación). */
  readonly identidad: IdentidadPort;
  readonly readModel: OrdenReadModel;
  readonly eventLog: EventLogStore;
  readonly proyecciones: ProyeccionesStore;
  readonly motor: MotorStore;
  readonly syncReceipts: SyncReceiptStore;
  readonly consola: ConsolaStore;
  /** DGP-020.2 — Sesiones de trabajo (cabecera + tramos append-only + reads). */
  readonly sesiones: SesionStore;
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

/* --------------------------- Application Service ------------------------- */

/**
 * Emite un evento del módulo escribiéndolo ATÓMICAMENTE en la MISMA UoW en la
 * bitácora durable (`ord_eventos`, fuente de verdad del replay) y en el outbox
 * del Kernel (`registerEvent`), con el MISMO `event.id` en ambos. Así la
 * reproyección desde la bitácora produce read models idénticos (mismo
 * `lastEventId`/`eventId` que la proyección en vivo). El outbox NO es event
 * store: es transporte at-least-once hacia los handlers idempotentes.
 */
async function emitirEvento(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenantId: string,
  evento: { tipo: string; payload: Record<string, unknown>; eventId?: string },
): Promise<Result<void, KernelError>> {
  const dominio = createDomainEvent(
    evento.tipo,
    evento.payload,
    ctx.correlationId,
    evento.eventId ? { idGenerator: () => evento.eventId! } : {},
  );
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

/**
 * Registra un evento del módulo en el SHARED TIMELINE canónico de plataforma
 * mediante el COMANDO `platform.timeline.record` (NUNCA escritura directa a las
 * tablas de plataforma). Idempotente por `entryId=event.id`. Corre bajo un ctx
 * de sistema que propaga el `correlationId` del evento.
 */
function registrarEnTimeline() {
  return async (
    deps: ServiceDeps,
    event: { id: string; type: string; payload: Record<string, unknown>; correlationId: string },
  ): Promise<Result<void, KernelError>> => {
    const tenantId = String(event.payload["tenantId"] ?? "");
    if (!tenantId) return ok(undefined);
    const p = event.payload;
    const ordenId = String(p["ordenId"] ?? p["id"] ?? "");
    const entidadRelacionada = event.type === RELACION_CREADA && p["destinoId"]
      ? `orden:${String(p["destinoId"])}`
      : p["activoPrincipal"] && (p["activoPrincipal"] as { entityRef?: string }).entityRef
        ? String((p["activoPrincipal"] as { entityRef?: string }).entityRef)
        : null;
    const sys = createExecutionContext({
      principal: SYSTEM_PRINCIPAL,
      correlationId: event.correlationId,
      metadata: { tenantId },
    });
    const r = await deps.runtime.commands.execute(sys, "platform.timeline.record", {
      entryId: event.id,
      entityRef: `orden:${ordenId}`,
      eventType: event.type,
      actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
      occurredAt: String(p["actualizadoAt"] ?? p["ocurridoAt"] ?? new Date().toISOString()),
      resumen: String(p["titulo"] ?? p["accion"] ?? event.type),
      estado: p["estado"] ? String(p["estado"]) : null,
      entidadRelacionada,
      payload: p,
    });
    return r.ok ? ok(undefined) : (r as Result<void, KernelError>);
  };
}

/**
 * Persiste un cambio del aggregate + auditoría + evento (bitácora durable +
 * outbox, mismo id), TODO dentro de la misma UoW. El read-side (proyección CQRS
 * a read models, bitácora operacional, timeline compartido) lo materializan los
 * eventHandlers idempotentes desde el payload autosuficiente (DGP-009.2).
 */
async function persistir(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  cambio: CambioOrden,
  accion: string,
  esCreacion: boolean,
  expectedVersion?: number,
): Promise<Result<OrdenTrabajo, KernelError>> {
  const o = cambio.orden;
  const persisted = esCreacion
    ? await adapters.repository.insert(uow, o)
    : await adapters.repository.update(uow, o, expectedVersion!);
  if (!persisted.ok) return persisted;

  const audited = await audit(deps.audit, uow, ctx, o.tenantId, MODULO, accion, o.id, {
    estado: o.estado,
    version: o.version,
  });
  if (!audited.ok) return audited;

  const emitido = await emitirEvento(adapters, ctx, uow, o.tenantId, cambio.evento);
  if (!emitido.ok) return emitido;
  return ok(persisted.value);
}

/* --------------------------- Idempotencia offline ------------------------ */

/**
 * Cortocircuito de idempotencia por `opId`: si el recibo ya existe, devuelve el
 * resultado previo sin re-ejecutar el efecto. `sellar` se invoca DENTRO de la
 * UoW del comando junto con el resto de la escritura.
 */
/**
 * Resultado de la RECLAMACIÓN durable de `opId` dentro de la UoW del comando.
 *  - `cortocircuito`: hay un `Result` que el handler debe DEVOLVER de inmediato
 *    (recibo ya sellado ⇒ idempotente; carrera en curso ⇒ conflicto).
 *  - `proceder=true`: este llamador es el DUEÑO (o no hay opId) y debe ejecutar
 *    el efecto y luego `sellar`.
 */
type ReclamoOp =
  | { readonly proceder: true }
  | { readonly proceder: false; readonly cortocircuito: Result<Record<string, unknown>, KernelError> };

/**
 * DGP-020.1 (R1) · Reclamación atómica y DURABLE del `opId` ANTES de producir
 * cualquier efecto del comando, dentro de la MISMA UoW (transacción). Cierra la
 * carrera de dos POST directos concurrentes con el mismo opId: sólo UN llamador
 * es dueño; el resto obtiene el resultado sellado (idempotente) o —si el dueño
 * aún no finaliza— un conflicto coherente. Misma lección que DGP-019.1.
 */
async function reclamarOpId(
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenant: string,
  comando: string,
  opId: string | undefined,
): Promise<ReclamoOp> {
  if (!opId) return { proceder: true };
  const claim = await adapters.recibos.reclamar(uow, tenant, comando, opId, ctx.principal.id);
  if (!claim.ok) return { proceder: false, cortocircuito: claim };
  if (claim.value.duenio) return { proceder: true };
  if (claim.value.resultado !== undefined) {
    return { proceder: false, cortocircuito: ok({ ...claim.value.resultado, idempotente: true }) };
  }
  // Carrera cabeza-a-cabeza: el dueño reclamó pero aún no selló. Devolvemos un
  // CONFLICTO coherente (reintentable) en lugar de duplicar el efecto.
  return {
    proceder: false,
    cortocircuito: fail(KernelErrors.conflict(`Operación ${opId} en curso; reintente`)),
  };
}

/* --------------------- Sesiones de trabajo (DGP-020.2) ------------------- */

/**
 * Estados de OT INCOMPATIBLES con iniciar trabajo. La apertura de una sesión NO
 * cambia el estado de la OT (§7): sólo se rechaza cuando la OT está en un estado
 * en el que no cabe trabajar (borrador o final). El resto (asignada, planificada,
 * en ejecución, pausada, abierta, o estados de extensión del tenant) se admiten.
 */
const ESTADOS_OT_INCOMPATIBLES_SESION = new Set(["BORRADOR", "CERRADA", "CANCELADA"]);

/**
 * Identidad CANÓNICA autenticada para atribuir la mano de obra (DGP-020.1/020.2).
 *
 * El `principal.id` del router de Órdenes es el ID ESPEJO legacy (`deltaops.users.id`,
 * entero), mientras que las asignaciones y toda la trazabilidad Enterprise usan el
 * `idn_identities.identity_id` (UUID). Por eso la identidad de sesión se lee del
 * contexto explícito (`ctx.metadata.identityId`), que el api-server rellena desde
 * `req.session.identityId`. NUNCA proviene del body del comando.
 *
 * FALLO CERRADO: si no hay identidad canónica en el contexto (p. ej. un login legacy
 * sin Enterprise), los comandos de sesión se rechazan con un error de NEGOCIO claro,
 * en vez de atribuir el trabajo al ID espejo (lo que rompería la atribución).
 */
function identidadDeSesion(ctx: ExecutionContext): Result<string, KernelError> {
  const id = ctx.metadata["identityId"];
  if (typeof id !== "string" || id.length === 0) {
    return fail(KernelErrors.forbidden(
      "sesión de trabajo: falta la identidad canónica autenticada (identityId). " +
        "Reautentíquese con una cuenta Enterprise para registrar trabajo.",
    ));
  }
  return ok(id);
}

/**
 * Identidad canónica para LECTURAS (nunca falla): permite marcar `esPropia`
 * usando el MISMO canon (idn_identities) que la atribución de escritura. Si el
 * contexto no la trae (login legacy), devuelve null y `esPropia` será false.
 */
function identidadDeSesionSuave(ctx: ExecutionContext): string | null {
  const id = ctx.metadata["identityId"];
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** ¿El principal es supervisor/admin (capacidades EXISTENTES, sin permisos nuevos)? */
function esSupervisorOAdmin(ctx: ExecutionContext): boolean {
  const caps = (ctx.principal.capacidades ?? []) as string[];
  const perms = (ctx.principal.permisos ?? []) as string[];
  return (
    caps.includes("*") ||
    caps.includes("validar-ordenes") ||
    caps.includes("administrar-ordenes") ||
    perms.includes("*") ||
    perms.includes(`${MODULO}.admin`) ||
    perms.includes(`${MODULO}.validar`)
  );
}

/** Mapea el error de NEGOCIO de la máquina de sesión a un KernelError (nunca 500). */
function errorSesion(codigo: string, mensaje: string): Result<never, KernelError> {
  // Bordes huérfanos / sesión inexistente ⇒ notFound; el resto ⇒ conflicto de negocio.
  if (codigo === "sin-sesion") return fail(KernelErrors.notFound("sesion", mensaje));
  return fail(KernelErrors.conflict(mensaje));
}

/**
 * Núcleo COMPARTIDO de los 4 comandos de sesión (`abrir/pausar/reanudar/cerrar`).
 * Reutiliza el patrón canónico: claim opId durable ANTES de efectos → OT válida
 * (mismo tenant, estado compatible, SIN mutarla) → activoId derivado de la OT →
 * identityId del contexto (NUNCA del frontend) + asignación a la OT → tramo
 * append-only con ocurridoAt(device)/registradoAt(server) y marca de anomalía de
 * reloj → cabecera → evento autosuficiente → auditoría → sellar recibo.
 */
async function ejecutarSesion(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  comando: ComandoSesion,
  input: {
    ordenId: string;
    sesionId?: string;
    ocurridoAt?: string;
    origen?: string;
    opId?: string;
  },
): Promise<Result<Record<string, unknown>, KernelError>> {
  const tenant = tenantOf(ctx);
  if (!tenant.ok) return tenant;

  // FALLO CERRADO PRIMERO (antes del claim de opId, del lookup de OT y de
  // cualquier efecto): la identidad CANÓNICA del contexto autenticado
  // (idn_identities.identity_id) es imprescindible para atribuir trabajo. NUNCA
  // el ID espejo legacy ni el body. Si falta ⇒ KRN-AUTH determinista, con
  // independencia de la existencia/estado de la OT.
  const identidad = identidadDeSesion(ctx);
  if (!identidad.ok) return identidad;
  const identityId = identidad.value;

  const nombreComando = `${MODULO}.sesion.${comando === "iniciar" ? "abrir" : comando}`;
  const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, nombreComando, input.opId);
  if (!reclamo.proceder) return reclamo.cortocircuito;

  // OT válida (mismo tenant por RLS/repo), NO se muta su estado.
  const orden = await adapters.repository.findById(tenant.value, input.ordenId);
  if (!orden.ok) return orden;
  if (!orden.value) return fail(KernelErrors.notFound("orden-trabajo", input.ordenId));
  if (ESTADOS_OT_INCOMPATIBLES_SESION.has(String(orden.value.estado))) {
    return fail(KernelErrors.conflict(
      `La OT ${input.ordenId} está en estado "${orden.value.estado}" y no admite registro de trabajo`,
    ));
  }

  // Activo SIEMPRE derivado de la OT (nunca del frontend).
  const activoId = orden.value.activoPrincipal?.activoId ?? null;

  const registradoAt = new Date();
  const ocurridoAt = input.ocurridoAt ? new Date(input.ocurridoAt) : new Date(registradoAt.getTime());
  const origen = input.origen === "offline" ? "offline" : "online";

  if (comando === "iniciar") {
    // Sólo un técnico ASIGNADO a la OT puede abrir sesión (§6); excepción para
    // supervisor/admin con capacidades EXISTENTES (sin permisos nuevos).
    if (!esSupervisorOAdmin(ctx)) {
      const asignado = await adapters.motor.asignacionVigenteDeIdentidad(tenant.value, input.ordenId, identityId);
      if (!asignado.ok) return asignado;
      if (!asignado.value) {
        return fail(KernelErrors.forbidden(
          `sesión de trabajo: la identidad ${identityId} no está asignada a la OT ${input.ordenId}`,
        ));
      }
    }
    const trans = transicion(null, "iniciar");
    if (!trans.ok) return errorSesion(trans.error.codigo, trans.error.mensaje);

    const sesionId = input.sesionId ?? crypto.randomUUID();
    const anomalia = evaluarReloj({ ocurridoAt, registradoAt, previoOcurridoAt: null });
    const cabecera: SesionCabecera = {
      id: sesionId, ordenId: input.ordenId, activoId, identityId,
      estado: "ABIERTA", origen, iniciadoAt: ocurridoAt, cerradoAt: null,
      registradoAt, actualizadoAt: registradoAt, opId: input.opId ?? null,
    };
    // El índice único parcial garantiza a lo sumo una sesión abierta por
    // (tenant, OT, identidad): la carrera de dos aperturas la resuelve la base.
    const ins = await adapters.sesiones.abrirCabecera(uow, tenant.value, cabecera);
    if (!ins.ok) return ins;
    const tramo: TramoFila = {
      sesionId, secuencia: 0, tipo: "trabajo", origen: "iniciar",
      ocurridoAt, registradoAt, anomaliaReloj: anomalia, identityId, opId: input.opId ?? null, eventId: "",
    };
    return finalizarSesion(deps, adapters, ctx, uow, tenant.value, {
      comando, nombreComando, cabecera, tramo, estadoNuevo: "ABIERTA", cerradoAt: null, opId: input.opId,
    });
  }

  // pausar / reanudar / cerrar: requiere una sesión NO cerrada (borde huérfano ⇒ negocio).
  const abierta = await adapters.sesiones.getAbierta(tenant.value, input.ordenId, identityId);
  if (!abierta.ok) return abierta;
  const trans = transicion(abierta.value ? abierta.value.estado : null, comando);
  if (!trans.ok) return errorSesion(trans.error.codigo, trans.error.mensaje);
  const sesion = abierta.value!;

  // Monotonicidad: comparar contra el ocurridoAt del último tramo.
  const tramosR = await adapters.sesiones.tramosDe(tenant.value, sesion.id);
  if (!tramosR.ok) return tramosR;
  const previos = tramosR.value;
  const previoOcurridoAt = previos.length ? previos[previos.length - 1]!.ocurridoAt : sesion.iniciadoAt;
  const anomalia = evaluarReloj({ ocurridoAt, registradoAt, previoOcurridoAt });
  const secuencia = previos.length;
  const origenTramo: OrigenTramo = comando;
  const tipoTramo: TipoTramo = trans.tipo;
  const estadoNuevo = trans.estado;
  const cerradoAt = comando === "cerrar" ? ocurridoAt : null;

  const cabecera: SesionCabecera = { ...sesion, estado: estadoNuevo, cerradoAt, actualizadoAt: registradoAt };
  const tramo: TramoFila = {
    sesionId: sesion.id, secuencia, tipo: tipoTramo, origen: origenTramo,
    ocurridoAt, registradoAt, anomaliaReloj: anomalia, identityId, opId: input.opId ?? null, eventId: "",
  };
  return finalizarSesion(deps, adapters, ctx, uow, tenant.value, {
    comando, nombreComando, cabecera, tramo, estadoNuevo, cerradoAt, opId: input.opId,
  });
}

/** Persiste tramo + cabecera + emite el evento de sesión + audita + sella. */
async function finalizarSesion(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  tenantId: string,
  args: {
    comando: ComandoSesion;
    nombreComando: string;
    cabecera: SesionCabecera;
    tramo: TramoFila;
    estadoNuevo: EstadoSesion;
    cerradoAt: Date | null;
    opId?: string;
  },
): Promise<Result<Record<string, unknown>, KernelError>> {
  const { cabecera, tramo } = args;
  // Tipo de evento por comando.
  const tipoEvento =
    args.comando === "iniciar" ? SESION_INICIADA
      : args.comando === "pausar" ? SESION_PAUSADA
        : args.comando === "reanudar" ? SESION_REANUDADA
          : SESION_CERRADA;

  // El event_id del tramo append-only == id del evento de dominio (trazabilidad
  // 1:1 tramo↔evento; misma clave que usa la proyección del read model).
  const eventId = crypto.randomUUID();

  // Tramo APPEND-ONLY (fuente de verdad de la duración). En 'iniciar' la cabecera
  // ya se insertó; en el resto se actualiza tras registrar el tramo.
  const insTramo = await adapters.sesiones.agregarTramo(uow, tenantId, { ...tramo, eventId });
  if (!insTramo.ok) return insTramo;
  if (args.comando !== "iniciar") {
    const upd = await adapters.sesiones.actualizarCabecera(uow, tenantId, cabecera.id, {
      estado: args.estadoNuevo, cerradoAt: args.cerradoAt, actualizadoAt: cabecera.actualizadoAt,
    });
    if (!upd.ok) return upd;
  }

  const payload: Record<string, unknown> = {
    tenantId, ordenId: cabecera.ordenId, sesionId: cabecera.id, entityRef: `orden:${cabecera.ordenId}`,
    activoId: cabecera.activoId, identityId: cabecera.identityId, estado: args.estadoNuevo, origen: cabecera.origen,
    iniciadoAt: cabecera.iniciadoAt.toISOString(),
    cerradoAt: args.cerradoAt ? args.cerradoAt.toISOString() : null,
    ocurridoAt: tramo.ocurridoAt.toISOString(),
    registradoAt: tramo.registradoAt.toISOString(),
    actualizadoAt: tramo.registradoAt.toISOString(),
    secuencia: tramo.secuencia, tipoTramo: tramo.tipo, origenTramo: tramo.origen,
    anomaliaReloj: tramo.anomaliaReloj,
    // Actor CANÓNICO (idn_identities): coincide con la identidad atribuida a la
    // sesión (incluido el caso supervisor/admin, que abre a su propio nombre).
    actorId: cabecera.identityId,
  };
  const emit = await emitirEvento(adapters, ctx, uow, tenantId, { tipo: tipoEvento, payload, eventId });
  if (!emit.ok) return emit;
  const audited = await audit(deps.audit, uow, ctx, tenantId, MODULO, `sesion:${args.comando}`, cabecera.id, {
    ordenId: cabecera.ordenId, estado: args.estadoNuevo, secuencia: tramo.secuencia,
    anomalia: tramo.anomaliaReloj ? tramo.anomaliaReloj.tipo : null,
  });
  if (!audited.ok) return audited;

  const resultado: Record<string, unknown> = {
    sesionId: cabecera.id, ordenId: cabecera.ordenId, activoId: cabecera.activoId,
    identityId: cabecera.identityId, estado: args.estadoNuevo,
    ocurridoAt: tramo.ocurridoAt.toISOString(),
    anomaliaReloj: tramo.anomaliaReloj,
  };
  if (args.opId) {
    const rec = await adapters.recibos.sellar(uow, tenantId, { opId: args.opId, comando: args.nombreComando, resultado }, ctx.principal.id);
    if (!rec.ok) return rec;
  }
  return ok({ ...resultado, idempotente: false });
}

/* ----------------------- Orquestación de Workflow ------------------------ */
/**
 * Compone la definición ACTIVA del tenant (ciclo base + EXTENSIÓN declarativa
 * del tenant) y garantiza que esté publicada+activa en el motor:
 *
 *  - Lee la extensión declarativa del tenant (puerto de catálogos), la compone
 *    con el ciclo base y la valida con `validarWorkflow` (dentro de
 *    `componerDefinicion`).
 *  - Deriva un `id` de definición que incluye la FIRMA de la extensión: misma
 *    extensión ⇒ mismo id ⇒ publicar es idempotente; extensión distinta ⇒ id
 *    nuevo ⇒ nueva versión N que se activa.
 *  - Verifica COHERENCIA catálogo↔definición: los estados extra declarados en el
 *    catálogo `estados` deben aparecer en la definición compuesta y viceversa;
 *    cualquier divergencia ⇒ error explícito.
 *
 * Se ejecuta como comandos del motor (UoW propia del motor). Idempotente.
 */
async function asegurarWorkflow(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  tenant: string,
): Promise<Result<{ version: number }, KernelError>> {
  const extR = await extensionTenant(adapters, tenant);
  if (!extR.ok) return extR;
  const compuesta = componerDefinicion(extR.value);
  if (!compuesta.ok) return compuesta;

  // Coherencia catálogo `estados` ↔ definición compuesta.
  const coherente = await verificarCoherenciaEstados(adapters, tenant, compuesta.value.estadosExtra);
  if (!coherente.ok) return coherente;

  const nDef = nombresDefinicion(MODULO_WORKFLOW);
  const firma = firmaExtension(extR.value);
  const id = `wf-def:${WORKFLOW_ORDEN}:${tenant}:${firma}`;

  // ¿Ya está activa ESTA definición (mismo id/firma)? ⇒ idempotente.
  const activa = await deps.runtime.queries.execute(childContext(ctx), nDef.activa, { clave: WORKFLOW_ORDEN });
  if (activa.ok && activa.value && (activa.value as { id?: string }).id === id) {
    const v = Number((activa.value as { data: Record<string, unknown> }).data["versionN"] ?? 1);
    if (Number.isFinite(v) && v > 0) return ok({ version: v });
  }

  const pub = await deps.runtime.commands.execute(childContext(ctx), nDef.publicar, {
    id,
    definicion: compuesta.value.definicion,
  });
  if (!pub.ok) return pub;
  const versionN = Number((pub.value as { versionN: number }).versionN);

  // `activar` usa la versión OPTIMISTA del registro (no la versión N de la
  // definición). La leemos del registro para evitar conflictos de concurrencia
  // cuando la definición no está en su primera versión o fue reactivada.
  const rec = await deps.runtime.queries.execute(childContext(ctx), nDef.obtener, { id });
  if (!rec.ok) return rec;
  const versionOptimista = Number((rec.value as { version: number }).version);
  const act = await deps.runtime.commands.execute(childContext(ctx), nDef.activar, { id, version: versionOptimista });
  if (!act.ok) return act;
  return ok({ version: versionN });
}

/**
 * Extensión declarativa de la máquina del tenant (estados/transiciones extra).
 * Se lee del puerto de catálogos; un tenant sin extensión devuelve la vacía.
 */
async function extensionTenant(adapters: ModuleAdapters, tenant: string): Promise<Result<ExtensionMaquina, KernelError>> {
  return adapters.catalogos.extensionMaquina(tenant);
}

/**
 * Estados NEUTROS extra declarados por el tenant (más allá del ciclo canónico).
 * Se leen del puerto de catálogos (`estados`); el mapeo motor→negocio se
 * resuelve a partir de ellos SIN fallback silencioso (ver `estadoDeNegocio`).
 */
async function estadosTenant(adapters: ModuleAdapters, tenant: string): Promise<string[]> {
  const r = await adapters.catalogos.estadosDeclarados(tenant);
  return r.ok ? r.value : [];
}

/**
 * Verifica que el catálogo `estados` (nombres neutros extra) y la definición de
 * workflow compuesta COINCIDAN exactamente. Divergencia ⇒ error explícito, para
 * que un estado declarado sea SIEMPRE alcanzable y viceversa.
 */
async function verificarCoherenciaEstados(
  adapters: ModuleAdapters,
  tenant: string,
  estadosDefinicion: readonly string[],
): Promise<Result<void, KernelError>> {
  const catalogo = await estadosTenant(adapters, tenant);
  const setDef = new Set(estadosDefinicion);
  const setCat = new Set(catalogo);
  const soloCatalogo = [...setCat].filter((e) => !setDef.has(e));
  const soloDefinicion = [...setDef].filter((e) => !setCat.has(e));
  if (soloCatalogo.length > 0) {
    return fail(KernelErrors.validation(
      `Estados declarados en el catálogo "estados" pero ausentes de la definición de workflow activa: ${soloCatalogo.join(", ")}. ` +
        `Declara sus transiciones en la extensión de la máquina.`,
    ));
  }
  if (soloDefinicion.length > 0) {
    return fail(KernelErrors.validation(
      `Estados presentes en la definición de workflow pero no declarados en el catálogo "estados": ${soloDefinicion.join(", ")}. ` +
        `Añádelos al catálogo "estados" del tenant.`,
    ));
  }
  return ok(undefined);
}

/** Lee el estado actual de la instancia de workflow. */
async function estadoInstancia(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  tenant: string,
  instanciaId: string,
): Promise<Result<{ estadoMotor: string; estado: EstadoOrdenEfectivo; version: number; aprobacionPendiente: boolean }, KernelError>> {
  const nInst = nombresInstancia(MODULO_WORKFLOW);
  const r = await deps.runtime.queries.execute(childContext(ctx), nInst.obtener, { id: instanciaId });
  if (!r.ok) return r;
  // La instancia es un PlatformRecord: `status` = estado neutro, `data._aprobaciones`.
  const inst = r.value as { status?: string; version?: number; data?: Record<string, unknown> } | null;
  if (!inst) return fail(KernelErrors.notFound("workflow-instancia", instanciaId));
  const aprobaciones = (inst.data?.["_aprobaciones"] as Record<string, { estado?: string }> | undefined) ?? {};
  const pendiente = Object.values(aprobaciones).some((a) => a?.estado === "pendiente");
  const estadoMotor = String(inst.status ?? "");
  // Mapeo motor→negocio construido desde el catálogo VIGENTE del tenant; estado
  // no declarado ⇒ error explícito (nunca BORRADOR por defecto).
  const negocio = estadoDeNegocio(estadoMotor, await estadosTenant(adapters, tenant));
  if (!negocio.ok) return negocio;
  return ok({
    estadoMotor,
    estado: negocio.value,
    version: Number(inst.version ?? 1),
    aprobacionPendiente: pendiente,
  });
}

/**
 * Sincroniza el estado de la OT con el estado resuelto por el motor, en una UoW
 * SEPARADA (nunca dentro de la UoW del comando de transición del motor). Es
 * idempotente: si el estado ya coincide, no reescribe.
 */
async function sincronizarEstado(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  tenant: string,
  ordenId: string,
  instanciaId: string,
): Promise<Result<{ estado: EstadoOrdenEfectivo; version: number }, KernelError>> {
  const estado = await estadoInstancia(deps, adapters, ctx, tenant, instanciaId);
  if (!estado.ok) return estado;

  const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
  return uowPort.execute(ctx, async (uow) => {
    const actual = await adapters.repository.findById(tenant, ordenId);
    if (!actual.ok) return actual;
    if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", ordenId));
    if (actual.value.estado === estado.value.estado) {
      return ok({ estado: actual.value.estado, version: actual.value.version });
    }
    const cambio = aplicarEstado(actual.value, estado.value.estado, instanciaId, ctx.principal.id, new Date());
    const saved = await persistir(deps, adapters, ctx, uow, cambio, "transicionar", false, actual.value.version);
    if (!saved.ok) return saved;
    return ok({ estado: saved.value.estado, version: saved.value.version });
  });
}

/* ------------------------------ Descriptor ------------------------------- */

export function ordenesModule(adapters: ModuleAdapters): PlatformServiceDefinition {
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
      "Órdenes de Trabajo Empresariales — dominio (DGP-009.1): aggregate, catálogos, ciclo de vida gobernado por Workflow Engine, formularios/checklists (Dynamic Forms), evidencias (platform.attachment), offline-first.",
    capabilities: [
      {
        name: "gestionar-ordenes",
        permissions: [`${MODULO}.read`, `${MODULO}.write`],
        description: "Alta, edición y clasificación de órdenes de trabajo",
      },
      {
        name: "ejecutar-ordenes",
        permissions: [`${MODULO}.read`, `${MODULO}.operar`],
        description: "Operación del ciclo de vida y registro de ejecución",
      },
      {
        name: "validar-ordenes",
        permissions: [`${MODULO}.read`, `${MODULO}.validar`],
        description: "Validación y cierre gobernado por aprobación",
      },
      {
        name: "administrar-ordenes",
        permissions: [`${MODULO}.admin`],
        description: "Administración de catálogos y configuración del módulo",
      },
    ],
    permissions: [
      `${MODULO}.read`,
      `${MODULO}.write`,
      `${MODULO}.operar`,
      `${MODULO}.validar`,
      `${MODULO}.admin`,
      // Permisos del motor de workflow que este módulo orquesta:
      `${MODULO_WORKFLOW}.read`,
      `${MODULO_WORKFLOW}.operar`,
      `${MODULO_WORKFLOW}.disenar`,
      // Permisos del servicio de formularios que este módulo orquesta al
      // capturar respuestas de checklist/formulario (guardarBorrador → enviar):
      "modulo.formularios.respuesta.write",
      "modulo.formularios.respuesta.enviar",
      "modulo.formularios.respuesta.read",
    ],
    dependsOn: [
      MODULO_WORKFLOW,
      "modulo.formularios",
      "platform.attachment",
      "platform.config",
      "platform.timeline",
    ],
    events: [...EVENTOS_MODULO, ...EVENTOS_OPERACIONALES, ...EVENTOS_SESION],
    recordTypes: [
      "orden-trabajo",
      "secuencia",
      "recibo-op",
      ...CATALOGOS.map((c) => `catalogo:${c}`),
    ],
    configDefaults: {
      // SIN prefijo en las claves (el prefijo lo añade la lectura).
      "max-longitud-titulo": "160",
      "codigo-prefijo": "OT",
      "codigo-separador": "-",
      "codigo-padding": "6",
      "codigo-serie": "default",
      "edicion-solo-borrador": "false",
      "moneda-defecto": "",
    },
    commands: [
      /* ------------------------------- crear ------------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear`,
          inputSchema: z.object({
            id: z.string().uuid().optional(),
            opId: z.string().optional(),
            titulo: z.string().min(1),
            descripcion: z.string().optional(),
            tipo: z.string().min(1),
            categoria: z.string().nullable().optional(),
            prioridad: z.string().nullable().optional(),
            severidad: z.string().nullable().optional(),
            sla: z.unknown().optional(),
            empresa: z.string().nullable().optional(),
            proyecto: z.string().nullable().optional(),
            centroCosto: z.string().nullable().optional(),
            ubicacion: z.unknown().optional(),
            activoPrincipal: z.unknown().optional(),
            activosRelacionados: z.array(z.unknown()).optional(),
            responsable: z.string().nullable().optional(),
            supervisor: z.string().nullable().optional(),
            solicitante: z.string().nullable().optional(),
            tiempoEstimado: z.unknown().optional(),
            costoEstimado: z.unknown().optional(),
            riesgoImpacto: z.unknown().optional(),
            /** Fechas de solicitud/programación (ISO-8601, Offline First). */
            fechaSolicitada: z.string().min(1).optional(),
            fechaProgramada: z.string().min(1).optional(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;

            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.crear`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;

            const pol = evaluar(deps, ctx, POLICY_PUEDE_CREAR, {});
            if (!pol.ok) return pol;

            // Validaciones de catálogo (semántica canónica).
            const val = await validarClasificacion(adapters, tenant.value, {
              tipo: input.tipo,
              categoria: input.categoria,
              prioridad: input.prioridad,
              severidad: input.severidad,
              empresa: input.empresa,
              proyecto: input.proyecto,
              centroCosto: input.centroCosto,
            });
            if (!val.ok) return val;

            // VOs opcionales.
            const vos = construirVOs(input);
            if (!vos.ok) return vos;

            // Fechas de solicitud/programación (solicitada por defecto = ahora).
            const ahora = new Date();
            const fechasV = crearFechas({
              solicitada: input.fechaSolicitada ?? ahora.toISOString(),
              ...(input.fechaProgramada ? { programada: input.fechaProgramada } : {}),
            });
            if (!fechasV.ok) return fechasV;

            // Asegura el workflow del tenant y obtiene versión.
            const wf = await asegurarWorkflow(deps, adapters, ctx, tenant.value);
            if (!wf.ok) return wf;

            const id = input.id ?? crypto.randomUUID();
            const codigo = await adapters.consecutivo.siguiente(
              uow,
              tenant.value,
              await configCodigo(deps, tenant.value),
              ctx.principal.id,
            );
            if (!codigo.ok) return codigo;

            const maxTitulo = Number(await cfg(deps, tenant.value, "max-longitud-titulo", "160"));
            const cambio = crearOrden({
              id,
              tenantId: tenant.value,
              codigo: codigo.value,
              titulo: input.titulo,
              descripcion: input.descripcion,
              tipo: input.tipo,
              categoria: input.categoria ?? null,
              prioridad: input.prioridad ?? null,
              severidad: input.severidad ?? null,
              sla: vos.value.sla,
              activoPrincipal: vos.value.activoPrincipal,
              activosRelacionados: vos.value.activosRelacionados,
              responsable: input.responsable ?? null,
              supervisor: input.supervisor ?? null,
              solicitante: input.solicitante ?? null,
              empresa: input.empresa ?? null,
              proyecto: input.proyecto ?? null,
              centroCosto: input.centroCosto ?? null,
              ubicacion: vos.value.ubicacion,
              tiempoEstimado: vos.value.tiempoEstimado,
              costoEstimado: vos.value.costoEstimado,
              riesgoImpacto: vos.value.riesgoImpacto,
              fechas: fechasV.value,
              observaciones: input.observaciones,
              workflow: { definicion: WORKFLOW_ORDEN, instanciaId: null, version: wf.value.version },
              actorId: ctx.principal.id,
              maxLongitudTitulo: maxTitulo,
              ahora,
            });
            if (!cambio.ok) return cambio;

            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "crear", true);
            if (!saved.ok) return saved;

            const resultado = { id, codigo: codigo.value.valor, estado: saved.value.estado, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(
                uow, tenant.value, { opId: input.opId, comando: `${MODULO}.crear`, resultado }, ctx.principal.id,
              );
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------------ editar ------------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.editar`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            titulo: z.string().min(1).optional(),
            descripcion: z.string().optional(),
            categoria: z.string().nullable().optional(),
            prioridad: z.string().nullable().optional(),
            severidad: z.string().nullable().optional(),
            empresa: z.string().nullable().optional(),
            proyecto: z.string().nullable().optional(),
            centroCosto: z.string().nullable().optional(),
            // VOs editables (Offline First): mismos objetos de valor que crear.
            sla: z.unknown().optional(),
            ubicacion: z.unknown().optional(),
            activoPrincipal: z.unknown().optional(),
            activosRelacionados: z.array(z.unknown()).optional(),
            tiempoEstimado: z.unknown().optional(),
            costoEstimado: z.unknown().optional(),
            riesgoImpacto: z.unknown().optional(),
            fechaSolicitada: z.string().min(1).optional(),
            fechaProgramada: z.string().min(1).optional(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.editar`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;

            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));

            const soloBorrador = (await cfg(deps, tenant.value, "edicion-solo-borrador", "false")) === "true";
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR, { estado: actual.value.estado, soloBorrador });
            if (!pol.ok) return pol;

            const val = await validarClasificacion(adapters, tenant.value, {
              categoria: input.categoria,
              prioridad: input.prioridad,
              severidad: input.severidad,
              empresa: input.empresa,
              proyecto: input.proyecto,
              centroCosto: input.centroCosto,
            });
            if (!val.ok) return val;

            // VOs editables: solo se incluyen en el patch los campos APORTADOS
            // (undefined ⇒ no se toca; null ⇒ se limpia explícitamente).
            const patch: Parameters<typeof editarOrden>[1] = {
              titulo: input.titulo,
              descripcion: input.descripcion,
              categoria: input.categoria,
              prioridad: input.prioridad,
              severidad: input.severidad,
              empresa: input.empresa,
              proyecto: input.proyecto,
              centroCosto: input.centroCosto,
              observaciones: input.observaciones,
            };
            if (input.sla !== undefined) {
              if (input.sla === null) (patch as { sla: null }).sla = null;
              else { const r = crearSla(input.sla); if (!r.ok) return r; (patch as { sla: typeof r.value }).sla = r.value; }
            }
            if (input.ubicacion !== undefined) {
              if (input.ubicacion === null) (patch as { ubicacion: null }).ubicacion = null;
              else { const r = crearUbicacion(input.ubicacion); if (!r.ok) return r; (patch as { ubicacion: typeof r.value }).ubicacion = r.value; }
            }
            if (input.activoPrincipal !== undefined) {
              if (input.activoPrincipal === null) (patch as { activoPrincipal: null }).activoPrincipal = null;
              else { const r = crearReferenciaActivo(input.activoPrincipal); if (!r.ok) return r; (patch as { activoPrincipal: typeof r.value }).activoPrincipal = r.value; }
            }
            if (input.activosRelacionados !== undefined) {
              const refs: OrdenTrabajo["activosRelacionados"][number][] = [];
              for (const a of input.activosRelacionados) { const r = crearReferenciaActivo(a); if (!r.ok) return r; refs.push(r.value); }
              (patch as { activosRelacionados: typeof refs }).activosRelacionados = refs;
            }
            if (input.tiempoEstimado !== undefined) {
              if (input.tiempoEstimado === null) (patch as { tiempoEstimado: null }).tiempoEstimado = null;
              else { const r = crearDuracion(input.tiempoEstimado); if (!r.ok) return r; (patch as { tiempoEstimado: typeof r.value }).tiempoEstimado = r.value; }
            }
            if (input.costoEstimado !== undefined) {
              if (input.costoEstimado === null) (patch as { costoEstimado: null }).costoEstimado = null;
              else { const r = crearCosto(input.costoEstimado); if (!r.ok) return r; (patch as { costoEstimado: typeof r.value }).costoEstimado = r.value; }
            }
            if (input.riesgoImpacto !== undefined) {
              if (input.riesgoImpacto === null) (patch as { riesgoImpacto: null }).riesgoImpacto = null;
              else { const r = crearRiesgoImpacto(input.riesgoImpacto); if (!r.ok) return r; (patch as { riesgoImpacto: typeof r.value }).riesgoImpacto = r.value; }
            }
            if (input.fechaSolicitada !== undefined || input.fechaProgramada !== undefined) {
              const r = crearFechas({
                ...actual.value.fechas,
                ...(input.fechaSolicitada !== undefined ? { solicitada: input.fechaSolicitada } : {}),
                ...(input.fechaProgramada !== undefined ? { programada: input.fechaProgramada } : {}),
              });
              if (!r.ok) return r;
              (patch as { fechas: typeof r.value }).fechas = r.value;
            }

            const maxTitulo = Number(await cfg(deps, tenant.value, "max-longitud-titulo", "160"));
            const cambio = editarOrden(actual.value, patch, ctx.principal.id, maxTitulo, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "editar", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.editar`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ---------------------------- asignar ------------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asignar`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            responsable: z.string().nullable().optional(),
            supervisor: z.string().nullable().optional(),
            solicitante: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.asignar`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_ASIGNAR, { estado: actual.value.estado });
            if (!pol.ok) return pol;
            const cambio = actualizarAsignacion(
              actual.value,
              { responsable: input.responsable, supervisor: input.supervisor, solicitante: input.solicitante },
              ctx.principal.id,
              new Date(),
            );
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "asignar", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.asignar`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------------- ejecutar ------------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrarEjecucion`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            diagnostico: z.unknown().optional(),
            tiempoReal: z.unknown().optional(),
            costoReal: z.unknown().optional(),
            observaciones: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.registrarEjecucion`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EJECUTAR, { estado: actual.value.estado });
            if (!pol.ok) return pol;

            let tiempoReal = actual.value.tiempoReal;
            if (input.tiempoReal !== undefined) {
              const d = crearDuracion(input.tiempoReal);
              if (!d.ok) return d;
              tiempoReal = d.value;
            }
            let costoReal = actual.value.costoReal;
            if (input.costoReal !== undefined) {
              const c = crearCosto(input.costoReal);
              if (!c.ok) return c;
              costoReal = c.value;
            }
            let diagnostico: OrdenTrabajo["diagnostico"] | undefined;
            if (input.diagnostico !== undefined && input.diagnostico !== null) {
              const d = crearDiagnostico(input.diagnostico);
              if (!d.ok) return d;
              diagnostico = d.value;
            }
            const cambio = actualizarEjecucion(
              actual.value,
              {
                diagnostico,
                tiempoReal,
                costoReal,
                observaciones: input.observaciones,
              },
              ctx.principal.id,
              new Date(),
            );
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "ejecucion", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.registrarEjecucion`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------- asociar formulario --------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asociarFormulario`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            plantilla: z.object({
              servicio: z.string().optional(),
              clave: z.string().min(1),
              version: z.number().int().positive(),
              etiqueta: z.string().optional(),
            }),
            /** Anclaje de la respuesta capturada (id en `modulo.formularios`). */
            respuestaId: z.string().min(1).optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            return asociarPlantilla(deps, adapters, ctx, uow, input, "formulario");
          },
        };
      },
      /* ---------------------- asociar checklist --------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asociarChecklist`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            plantilla: z.object({
              servicio: z.string().optional(),
              clave: z.string().min(1),
              version: z.number().int().positive(),
              etiqueta: z.string().optional(),
            }),
            /** Anclaje de la respuesta capturada (id en `modulo.formularios`). */
            respuestaId: z.string().min(1).optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            return asociarPlantilla(deps, adapters, ctx, uow, input, "checklist");
          },
        };
      },
      /* --------- capturar respuesta de plantilla asociada (ORQUESTADOR) ---- */
      // Operación ÚNICA, idempotente por opId y RECUPERABLE: compone el flujo
      // real de Dynamic Forms (guardarBorrador → enviar) y ANCLA la respuesta a
      // la OT re-leyendo su versión ACTUAL (no exige expectedVersion del cliente,
      // por eso un reintento tras un conflicto converge sin dejar respuestas
      // huérfanas). El id de la respuesta es DETERMINISTA a partir del opId, y
      // los subpasos usan sub-opIds derivados: reejecutar (desde /sync o la cola
      // offline) NO duplica respuestas ni efectos. Es una sola operación de
      // aplicación ⇒ encolable offline y replayable por /sync.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.capturarRespuesta`,
          inputSchema: z.object({
            id: z.string(),
            opId: z.string().min(1),
            clase: z.enum(["formulario", "checklist"]),
            plantilla: z.object({
              clave: z.string().min(1),
              version: z.number().int().positive(),
              etiqueta: z.string().optional(),
            }),
            datos: z.record(z.string(), z.unknown()),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const comando = `${MODULO}.capturarRespuesta`;

            // Idempotencia terminal por opId. `capturarRespuesta` es un
            // ORQUESTADOR sin UoW única: compone sub-comandos con sub-opIds
            // idempotentes y el EFECTO PERSISTENTE de anclaje se protege con la
            // RECLAMACIÓN DURABLE dentro de `asociarPlantilla` (sub-opId
            // `:asociar`, en su propia UoW). Aquí basta el cortocircuito por
            // recibo ya SELLADO para converger reintentos y workers de /sync.
            const sellado = await adapters.recibos.buscar(tenant.value, comando, input.opId);
            if (!sellado.ok) return sellado;
            if (sellado.value) return ok({ ...sellado.value.resultado, idempotente: true });

            // La OT debe existir; se re-lee su versión ACTUAL para el anclaje.
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));

            // Id de respuesta DETERMINISTA por opId ⇒ reintentos convergen a la
            // MISMA respuesta (sin duplicar). Sub-opIds derivados garantizan la
            // idempotencia de cada subpaso en el servicio de formularios.
            const respuestaId = `ord-resp:${input.id}:${input.clase}:${input.plantilla.clave}:${input.plantilla.version}:${input.opId}`;

            // (1) Guardar borrador ANCLADO a la clave+versión EXACTA (UoW propia
            //     del servicio de formularios). Idempotente por sub-opId.
            const borrador = await deps.runtime.commands.execute(childContext(ctx), "modulo.formularios.respuesta.guardarBorrador", {
              id: respuestaId,
              opId: `${input.opId}:borrador`,
              plantillaClave: input.plantilla.clave,
              plantillaVersion: input.plantilla.version,
              datos: input.datos,
            });
            if (!borrador.ok) return borrador;
            const versionBorrador = (borrador.value as { version: number }).version;

            // (2) Enviar (validación completa server-side). Idempotente por
            //     sub-opId; si ya estaba ENVIADA por un intento previo, el propio
            //     comando devuelve `idempotente` sin re-aplicar.
            const enviado = await deps.runtime.commands.execute(childContext(ctx), "modulo.formularios.respuesta.enviar", {
              id: respuestaId,
              opId: `${input.opId}:enviar`,
              version: versionBorrador,
            });
            if (!enviado.ok) return enviado;

            // (3) ANCLAR a la OT re-leyendo su versión ACTUAL (recuperable: si un
            //     intento anterior falló DESPUÉS de enviar, este paso completa el
            //     anclaje sin re-crear la respuesta). UoW SEPARADA por asociación.
            const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
            const asociado = await uowPort.execute(ctx, (uow) =>
              asociarPlantilla(
                deps,
                adapters,
                ctx,
                uow,
                {
                  id: input.id,
                  expectedVersion: actual.value!.version,
                  opId: `${input.opId}:asociar`,
                  plantilla: { clave: input.plantilla.clave, version: input.plantilla.version, etiqueta: input.plantilla.etiqueta },
                  respuestaId,
                },
                input.clase,
              ),
            );
            if (!asociado.ok) return asociado;

            const resultado = {
              id: input.id,
              clase: input.clase,
              respuestaId,
              plantilla: { clave: input.plantilla.clave, version: input.plantilla.version },
              version: (asociado.value as { version: number }).version,
            };
            const rec = await uowPort.execute(ctx, (uow) =>
              adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando, resultado }, ctx.principal.id),
            );
            if (!rec.ok) return rec;
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* --------------------- agregar evidencia ---------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.agregarEvidencia`,
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.number().int().positive(),
            opId: z.string().optional(),
            evidencia: z.unknown(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.agregarEvidencia`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_AGREGAR_EVIDENCIA, { estado: actual.value.estado });
            if (!pol.ok) return pol;
            const ev = crearEvidencia(input.evidencia);
            if (!ev.ok) return ev;
            const cambio = agregarEvidencia(actual.value, ev.value, ctx.principal.id, new Date());
            if (!cambio.ok) return cambio;
            const saved = await persistir(deps, adapters, ctx, uow, cambio.value, "evidencia", false, input.expectedVersion);
            if (!saved.ok) return saved;
            const resultado = { id: input.id, version: saved.value.version, evidencias: saved.value.evidencias.length };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.agregarEvidencia`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* -------------------------- transicionar ---------------------------- */
      // ORQUESTADOR: ejecuta la transición vía el Workflow Engine y sincroniza.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.transicionar`,
          inputSchema: z.object({
            id: z.string(),
            comando: z.string().min(1),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            // ORQUESTADOR de Workflow (sin UoW única): la exactly-once del efecto
            // persistente la garantiza la máquina de estados del motor (rechaza
            // transiciones duplicadas/ inválidas). Aquí basta el cortocircuito
            // por recibo ya SELLADO para converger reintentos y workers de /sync.
            if (input.opId) {
              const sellado = await adapters.recibos.buscar(tenant.value, `${MODULO}.transicionar`, input.opId);
              if (!sellado.ok) return sellado;
              if (sellado.value) return ok({ ...sellado.value.resultado, idempotente: true });
            }

            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));

            const pol = evaluar(deps, ctx, POLICY_PUEDE_TRANSICIONAR, { estado: actual.value.estado });
            if (!pol.ok) return pol;

            const nInst = nombresInstancia(MODULO_WORKFLOW);
            let instanciaId = actual.value.workflow.instanciaId;

            // Primera transición ⇒ iniciar la instancia del motor (UoW del motor).
            if (!instanciaId) {
              const wf = await asegurarWorkflow(deps, adapters, ctx, tenant.value);
              if (!wf.ok) return wf;
              instanciaId = actual.value.id; // id de instancia = id de OT (1:1)
              const ini = await deps.runtime.commands.execute(childContext(ctx), nInst.iniciar, {
                id: instanciaId,
                data: { ordenId: actual.value.id },
              });
              if (!ini.ok) return ini;
            }

            // Estado + versión actual de la instancia.
            const est = await estadoInstancia(deps, adapters, ctx, tenant.value, instanciaId);
            if (!est.ok) return est;

            // Ejecuta la transición SOLO a través del motor (UoW propia del motor).
            const tr = await deps.runtime.commands.execute(childContext(ctx), nInst.transicionar, {
              id: instanciaId,
              version: est.value.version,
              comando: input.comando,
              ...(input.opId ? { opId: `${input.opId}:wf` } : {}),
            });
            if (!tr.ok) return tr;

            // Sincroniza el estado resultante a la OT (UoW SEPARADA).
            const sync = await sincronizarEstado(deps, adapters, ctx, tenant.value, actual.value.id, instanciaId);
            if (!sync.ok) return sync;

            const resultado = {
              id: input.id,
              estado: sync.value.estado,
              version: sync.value.version,
              aprobacionPendiente: (tr.value as { pendienteAprobacion?: boolean }).pendienteAprobacion === true,
            };
            if (input.opId) {
              const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
              const rec = await uowPort.execute(ctx, (uow) =>
                adapters.recibos.sellar(uow, tenant.value, { opId: input.opId!, comando: `${MODULO}.transicionar`, resultado }, ctx.principal.id),
              );
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------ aprobar validación ------------------------ */
      // ORQUESTADOR de la aprobación (gate) que gobierna el cierre.
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.aprobarCierre`,
          inputSchema: z.object({
            id: z.string(),
            transicion: z.string().default("cerrar"),
            decision: z.enum(["aprobar", "rechazar"]),
            motivo: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.validar`] },
          async handle(ctx, input) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            // ORQUESTADOR del gate de aprobación (sin UoW única): la máquina de
            // estados gobierna la unicidad del efecto; cortocircuito por recibo
            // SELLADO para converger reintentos y workers de /sync.
            if (input.opId) {
              const sellado = await adapters.recibos.buscar(tenant.value, `${MODULO}.aprobarCierre`, input.opId);
              if (!sellado.ok) return sellado;
              if (sellado.value) return ok({ ...sellado.value.resultado, idempotente: true });
            }

            const actual = await adapters.repository.findById(tenant.value, input.id);
            if (!actual.ok) return actual;
            if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
            const instanciaId = actual.value.workflow.instanciaId;
            if (!instanciaId) return fail(KernelErrors.conflict("La OT no tiene instancia de workflow activa"));

            const nInst = nombresInstancia(MODULO_WORKFLOW);
            const est = await estadoInstancia(deps, adapters, ctx, tenant.value, instanciaId);
            if (!est.ok) return est;

            // CLAIM→EXECUTE→FINALIZE: el `opId` se PROPAGA al comando del motor
            // (sufijo `:wf`). El motor es idempotente por opId, de modo que un
            // reintento tras un fallo PARCIAL (gate ya resuelto, recibo aún no
            // sellado) NO vuelve a aplicar la decisión: reconstruye el mismo
            // resultado y sella el recibo sin inconsistencias.
            const comando = input.decision === "aprobar" ? nInst.aprobar : nInst.rechazar;
            const r = await deps.runtime.commands.execute(childContext(ctx), comando, {
              id: instanciaId,
              version: est.value.version,
              transicion: input.transicion,
              ...(input.opId ? { opId: `${input.opId}:wf` } : {}),
              ...(input.decision === "rechazar" && input.motivo ? { motivo: input.motivo } : {}),
            });
            if (!r.ok) return r;

            const sync = await sincronizarEstado(deps, adapters, ctx, tenant.value, actual.value.id, instanciaId);
            if (!sync.ok) return sync;
            const resultado = { id: input.id, estado: sync.value.estado, version: sync.value.version };
            if (input.opId) {
              const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
              const rec = await uowPort.execute(ctx, (uow) =>
                adapters.recibos.sellar(uow, tenant.value, { opId: input.opId!, comando: `${MODULO}.aprobarCierre`, resultado }, ctx.principal.id),
              );
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ------------------------- catálogo: upsert ------------------------- */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.upsert`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            etiqueta: z.string().min(1),
            posicion: z.number().int().optional(),
            padre: z.string().nullable().optional(),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await adapters.catalogos.upsert(
              uow, tenant.value, input.catalogo as NombreCatalogo,
              { clave: input.clave, etiqueta: input.etiqueta, posicion: input.posicion, padre: input.padre },
              ctx.principal.id,
            );
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo:upsert", `${input.catalogo}:${input.clave}`, {});
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave });
          },
        };
      },
      /* ----------------------- catálogo: habilitar ------------------------ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.catalogo.habilitar`,
          inputSchema: z.object({
            catalogo: z.enum(CATALOGOS),
            clave: z.string().min(1),
            habilitado: z.boolean(),
          }),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const r = await adapters.catalogos.habilitar(uow, tenant.value, input.catalogo as NombreCatalogo, input.clave, input.habilitado);
            if (!r.ok) return r;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "catalogo:habilitar", `${input.catalogo}:${input.clave}`, { habilitado: input.habilitado });
            if (!audited.ok) return audited;
            return ok({ catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado });
          },
        };
      },
      /* ==================== BITÁCORA OPERACIONAL (por eventos) ============= */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.bitacora.registrar`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            accion: z.enum(ACCIONES_BITACORA as unknown as [string, ...string[]]),
            detalle: z.record(z.unknown()).optional(),
            ocurridoAt: z.string().min(1).optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.bitacora.registrar`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const orden = await adapters.repository.findById(tenant.value, input.ordenId);
            if (!orden.ok) return orden;
            if (!orden.value) return fail(KernelErrors.notFound("orden-trabajo", input.ordenId));
            // La bitácora operacional (tiempos de campo) se admite mientras la
            // OT no esté en estado FINAL (no exige EN_EJECUCION; ver POLICY_PUEDE_EDITAR).
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR, { estado: orden.value.estado });
            if (!pol.ok) return pol;

            const ocurridoAt = input.ocurridoAt ?? new Date().toISOString();
            const emit = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: BITACORA_REGISTRADA,
              payload: {
                tenantId: tenant.value, ordenId: input.ordenId, entityRef: `orden:${input.ordenId}`,
                accion: input.accion, detalle: input.detalle ?? {}, ocurridoAt,
                actorId: ctx.principal.id, eventoTipo: BITACORA_REGISTRADA,
              },
            });
            if (!emit.ok) return emit;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, `bitacora:${input.accion}`, input.ordenId, {});
            if (!audited.ok) return audited;
            const resultado = { ordenId: input.ordenId, accion: input.accion, ocurridoAt };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.bitacora.registrar`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ======================== PLANIFICACIÓN ============================== */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.planificar`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            inicioPlanificado: z.string().min(1).nullable().optional(),
            finPlanificado: z.string().min(1).nullable().optional(),
            ventanaInicio: z.string().min(1).nullable().optional(),
            ventanaFin: z.string().min(1).nullable().optional(),
            bloquear: z.boolean().optional(),
            bloqueoMotivo: z.string().nullable().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.planificar`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const orden = await adapters.repository.findById(tenant.value, input.ordenId);
            if (!orden.ok) return orden;
            if (!orden.value) return fail(KernelErrors.notFound("orden-trabajo", input.ordenId));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR, { estado: orden.value.estado });
            if (!pol.ok) return pol;

            const actual = await adapters.motor.planificacionGet(tenant.value, input.ordenId);
            if (!actual.ok) return actual;
            const ahora = new Date();
            const bloquear = input.bloquear === true;
            const reprogramaciones = (actual.value?.reprogramaciones ?? 0) + (actual.value ? 1 : 0);

            // Detección declarativa de conflicto: solape de ventana con otra OT
            // planificada del mismo responsable (agenda). Declarativo, sin efectos.
            const inicio = input.inicioPlanificado ? new Date(input.inicioPlanificado) : null;
            const fin = input.finPlanificado ? new Date(input.finPlanificado) : null;
            let enConflicto = false;
            if (inicio && orden.value.responsable) {
              // Solape de ventana con otra OT planificada del MISMO responsable.
              const nuevoIni = inicio.getTime();
              const nuevoFin = (fin ?? inicio).getTime();
              const rango = await adapters.proyecciones.agendaRango(tenant.value, null, null, 1000);
              if (rango.ok) {
                enConflicto = rango.value.some((a) => {
                  if (a.id === input.ordenId || a.responsable !== orden.value!.responsable) return false;
                  const otroIni = a.inicioPlanificado?.getTime();
                  if (otroIni == null) return false;
                  const otroFin = a.finPlanificado?.getTime() ?? otroIni;
                  return nuevoIni <= otroFin && otroIni <= nuevoFin;
                });
              }
            }

            const version = (actual.value?.version ?? 0) + 1;
            const planif: Planificacion = {
              ordenId: input.ordenId,
              inicioPlanificado: inicio, finPlanificado: fin,
              ventanaInicio: input.ventanaInicio ? new Date(input.ventanaInicio) : null,
              ventanaFin: input.ventanaFin ? new Date(input.ventanaFin) : null,
              estado: bloquear ? "bloqueada" : actual.value ? "reprogramada" : "programada",
              bloqueoMotivo: bloquear ? input.bloqueoMotivo ?? null : null,
              enConflicto, reprogramaciones,
              datos: {}, version, updatedBy: ctx.principal.id, updatedAt: ahora,
            };
            const up = await adapters.motor.planificacionUpsert(uow, tenant.value, planif, actual.value?.version ?? null);
            if (!up.ok) return up;

            const emit = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: bloquear ? PLANIFICACION_BLOQUEADA : PLANIFICACION_ACTUALIZADA,
              payload: {
                tenantId: tenant.value, ordenId: input.ordenId, id: input.ordenId, entityRef: `orden:${input.ordenId}`,
                codigo: orden.value.codigo.valor, titulo: orden.value.titulo, estado: orden.value.estado,
                responsable: orden.value.responsable,
                inicioPlanificado: planif.inicioPlanificado?.toISOString() ?? null,
                finPlanificado: planif.finPlanificado?.toISOString() ?? null,
                ventanaInicio: planif.ventanaInicio?.toISOString() ?? null,
                ventanaFin: planif.ventanaFin?.toISOString() ?? null,
                programacionEstado: planif.estado, enConflicto, version,
                actorId: ctx.principal.id, actualizadoAt: ahora.toISOString(),
              },
            });
            if (!emit.ok) return emit;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "planificar", input.ordenId, { estado: planif.estado, enConflicto });
            if (!audited.ok) return audited;
            const resultado = { ordenId: input.ordenId, estado: planif.estado, enConflicto, version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.planificar`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ========================= ASIGNACIONES ============================= */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.asignar-recurso-humano`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            tipo: z.enum(TIPOS_ASIGNACION as unknown as [string, ...string[]]),
            asignadoId: z.string().min(1),
            rol: z.string().nullable().optional(),
            reemplazaVigentes: z.boolean().optional(),
            id: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.asignar-recurso-humano`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const orden = await adapters.repository.findById(tenant.value, input.ordenId);
            if (!orden.ok) return orden;
            if (!orden.value) return fail(KernelErrors.notFound("orden-trabajo", input.ordenId));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_ASIGNAR, { estado: orden.value.estado });
            if (!pol.ok) return pol;

            // DGP-020.1 · Contrato de identidad. Para una asignación de PERSONA,
            // `asignadoId` DEBE ser un identityId canónico: existe, identidad y
            // membresía ACTIVAS y pertenece al MISMO tenant de la OT (derivado
            // del contexto autenticado, nunca del frontend). Los tipos no-persona
            // (grupo/cuadrilla/contratista) no se validan contra Identidad.
            let asignadoIdentityId: string | null = null;
            let asignadoNombre: string | null = null;
            let asignadoEmail: string | null = null;
            if (input.tipo === "persona") {
              const ver = await adapters.identidad.verificar(tenant.value, input.asignadoId);
              if (!ver.ok) return ver; // fallo de infraestructura ⇒ 500 explícito
              const idn = ver.value;
              if (!idn) {
                return fail(KernelErrors.validation(
                  `La identidad "${input.asignadoId}" no existe o no pertenece a la empresa; asigne una identidad canónica válida`,
                ));
              }
              if (idn.estado !== "ACTIVO" || idn.estadoMembresia !== "ACTIVO") {
                return fail(KernelErrors.validation(
                  `La identidad "${input.asignadoId}" no está activa en la empresa y no puede recibir asignaciones`,
                ));
              }
              asignadoIdentityId = idn.identityId;
              asignadoNombre = idn.nombre;
              asignadoEmail = idn.email;
            }

            if (input.reemplazaVigentes) {
              const cerrar = await adapters.motor.asignacionCerrarVigentes(uow, tenant.value, input.ordenId, input.rol ?? null);
              if (!cerrar.ok) return cerrar;
            }
            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date();
            const asignacion: Asignacion = {
              id, ordenId: input.ordenId, tipo: input.tipo, asignadoId: input.asignadoId,
              asignadoIdentityId,
              rol: input.rol ?? null, vigente: true, datos: {}, createdBy: ctx.principal.id, createdAt: ahora,
            };
            const ins = await adapters.motor.asignacionInsert(uow, tenant.value, asignacion);
            if (!ins.ok) return ins;

            const emit = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: ASIGNACION_REGISTRADA,
              payload: {
                tenantId: tenant.value, ordenId: input.ordenId, id, entityRef: `orden:${input.ordenId}`,
                tipoAsignacion: input.tipo, asignadoId: input.asignadoId,
                asignadoIdentityId, asignadoNombre, asignadoEmail,
                rol: input.rol ?? null,
                actorId: ctx.principal.id, actualizadoAt: ahora.toISOString(),
              },
            });
            if (!emit.ok) return emit;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "asignar-recurso", input.ordenId, { tipo: input.tipo, asignadoId: input.asignadoId, asignadoIdentityId });
            if (!audited.ok) return audited;
            const resultado = { id, ordenId: input.ordenId, tipo: input.tipo, asignadoId: input.asignadoId, asignadoIdentityId };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.asignar-recurso-humano`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ========================== RECURSOS ================================ */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.registrar-recurso`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            clase: z.enum(CLASES_RECURSO as unknown as [string, ...string[]]),
            referenciaId: z.string().min(1),
            descripcion: z.string().nullable().optional(),
            cantidad: z.number().nullable().optional(),
            unidad: z.string().nullable().optional(),
            id: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.registrar-recurso`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const orden = await adapters.repository.findById(tenant.value, input.ordenId);
            if (!orden.ok) return orden;
            if (!orden.value) return fail(KernelErrors.notFound("orden-trabajo", input.ordenId));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR, { estado: orden.value.estado });
            if (!pol.ok) return pol;

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date();
            const recurso: Recurso = {
              id, ordenId: input.ordenId, clase: input.clase, referenciaId: input.referenciaId,
              descripcion: input.descripcion ?? null, cantidad: input.cantidad ?? null, unidad: input.unidad ?? null,
              datos: {}, createdBy: ctx.principal.id, createdAt: ahora,
            };
            const ins = await adapters.motor.recursoInsert(uow, tenant.value, recurso);
            if (!ins.ok) return ins;
            const emit = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: RECURSO_REGISTRADO,
              payload: {
                tenantId: tenant.value, ordenId: input.ordenId, id, entityRef: `orden:${input.ordenId}`,
                clase: input.clase, referenciaId: input.referenciaId, actorId: ctx.principal.id, actualizadoAt: ahora.toISOString(),
              },
            });
            if (!emit.ok) return emit;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "registrar-recurso", input.ordenId, { clase: input.clase });
            if (!audited.ok) return audited;
            const resultado = { id, ordenId: input.ordenId, clase: input.clase, referenciaId: input.referenciaId };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.registrar-recurso`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ============================= SLA ================================== */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.sla.definir`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            politica: z.string().nullable().optional(),
            minutosObjetivo: z.number().int().positive().nullable().optional(),
            inicioAt: z.string().min(1).optional(),
            suspender: z.boolean().optional(),
            reanudar: z.boolean().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.sla.definir`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const orden = await adapters.repository.findById(tenant.value, input.ordenId);
            if (!orden.ok) return orden;
            if (!orden.value) return fail(KernelErrors.notFound("orden-trabajo", input.ordenId));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR, { estado: orden.value.estado });
            if (!pol.ok) return pol;

            const actual = await adapters.motor.slaGet(tenant.value, input.ordenId);
            if (!actual.ok) return actual;
            const ahora = new Date();
            const previoSla = actual.value;
            const minutosObjetivo = input.minutosObjetivo ?? previoSla?.minutosObjetivo ?? null;
            const inicioAt = input.inicioAt ? new Date(input.inicioAt) : previoSla?.inicioAt ?? ahora;

            // Cálculo de pausas y suspensión (configurable por política/tenant).
            let minutosPausados = previoSla?.minutosPausados ?? 0;
            let suspendido = previoSla?.suspendido ?? false;
            let suspendidoDesde = previoSla?.suspendidoDesde ?? null;
            if (input.suspender && !suspendido) { suspendido = true; suspendidoDesde = ahora; }
            if (input.reanudar && suspendido) {
              suspendido = false;
              if (suspendidoDesde) minutosPausados += Math.max(0, Math.round((ahora.getTime() - suspendidoDesde.getTime()) / 60000));
              suspendidoDesde = null;
            }
            const vencimientoAt = minutosObjetivo != null
              ? new Date(inicioAt.getTime() + (minutosObjetivo + minutosPausados) * 60000)
              : null;
            const minutosRestantes = vencimientoAt ? Math.round((vencimientoAt.getTime() - ahora.getTime()) / 60000) : null;
            const estadoSla = suspendido
              ? "suspendido"
              : minutosRestantes == null ? "vigente"
              : minutosRestantes < 0 ? "vencido"
              : minutosRestantes <= Math.max(1, Math.round((minutosObjetivo ?? 0) * 0.1)) ? "en-riesgo"
              : "vigente";
            const version = (previoSla?.version ?? 0) + 1;
            const sla: SlaOperativo = {
              ordenId: input.ordenId, politica: input.politica ?? previoSla?.politica ?? null,
              inicioAt, vencimientoAt, minutosObjetivo, minutosPausados, minutosRestantes,
              suspendido, suspendidoDesde, estado: estadoSla, datos: {}, version, updatedBy: ctx.principal.id, updatedAt: ahora,
            };
            const up = await adapters.motor.slaUpsert(uow, tenant.value, sla, previoSla?.version ?? null);
            if (!up.ok) return up;
            const emit = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: SLA_ACTUALIZADO,
              payload: {
                tenantId: tenant.value, ordenId: input.ordenId, id: input.ordenId, entityRef: `orden:${input.ordenId}`,
                estadoSla, minutosRestantes, suspendido, version, actorId: ctx.principal.id, actualizadoAt: ahora.toISOString(),
              },
            });
            if (!emit.ok) return emit;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "sla:definir", input.ordenId, { estado: estadoSla });
            if (!audited.ok) return audited;
            const resultado = { ordenId: input.ordenId, estado: estadoSla, minutosRestantes, vencimientoAt: vencimientoAt?.toISOString() ?? null, version };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.sla.definir`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ========================== RELACIONES ============================== */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.crear-relacion`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            categoria: z.enum(CATEGORIAS_RELACION as unknown as [string, ...string[]]),
            tipo: z.string().min(1),
            destinoId: z.string().min(1),
            destinoCodigo: z.string().nullable().optional(),
            destinoNombre: z.string().nullable().optional(),
            id: z.string().optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.write`] },
          async handle(ctx, input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, `${MODULO}.crear-relacion`, input.opId);
            if (!reclamo.proceder) return reclamo.cortocircuito;
            const orden = await adapters.repository.findById(tenant.value, input.ordenId);
            if (!orden.ok) return orden;
            if (!orden.value) return fail(KernelErrors.notFound("orden-trabajo", input.ordenId));
            const pol = evaluar(deps, ctx, POLICY_PUEDE_EDITAR, { estado: orden.value.estado });
            if (!pol.ok) return pol;
            // OT↔OT: el destino debe existir; anti-lazo básico.
            if (input.categoria === "orden") {
              if (input.destinoId === input.ordenId) return fail(KernelErrors.validation("Una OT no puede relacionarse consigo misma"));
              const destino = await adapters.repository.findById(tenant.value, input.destinoId);
              if (!destino.ok) return destino;
              if (!destino.value) return fail(KernelErrors.notFound("orden-trabajo", input.destinoId));
            }
            const existe = await adapters.motor.relacionExiste(tenant.value, input.categoria, input.tipo, input.ordenId, input.destinoId);
            if (!existe.ok) return existe;
            if (existe.value) return ok({ id: input.id ?? null, idempotente: true });

            const id = input.id ?? crypto.randomUUID();
            const ahora = new Date();
            const arista: RelacionArista = {
              id, categoria: input.categoria, tipo: input.tipo, ordenId: input.ordenId,
              destinoId: input.destinoId, datos: {}, createdBy: ctx.principal.id, createdAt: ahora,
            };
            const ins = await adapters.motor.relacionInsert(uow, tenant.value, arista);
            if (!ins.ok) return ins;
            const emit = await emitirEvento(adapters, ctx, uow, tenant.value, {
              tipo: RELACION_CREADA,
              payload: {
                tenantId: tenant.value, ordenId: input.ordenId, id, entityRef: `orden:${input.ordenId}`,
                categoria: input.categoria, tipo: input.tipo, destinoId: input.destinoId,
                destinoCodigo: input.destinoCodigo ?? null, destinoNombre: input.destinoNombre ?? null,
                actorId: ctx.principal.id, actualizadoAt: ahora.toISOString(),
              },
            });
            if (!emit.ok) return emit;
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "crear-relacion", input.ordenId, { categoria: input.categoria, tipo: input.tipo });
            if (!audited.ok) return audited;
            const resultado = { id, ordenId: input.ordenId, categoria: input.categoria, tipo: input.tipo, destinoId: input.destinoId };
            if (input.opId) {
              const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando: `${MODULO}.crear-relacion`, resultado }, ctx.principal.id);
              if (!rec.ok) return rec;
            }
            return ok({ ...resultado, idempotente: false });
          },
        };
      },
      /* ============ SESIONES DE TRABAJO (DGP-020.2) ====================== */
      // Comandos operacionales del registro de tiempo real. `identityId` y
      // `activoId` NUNCA vienen del frontend (se derivan del ctx y de la OT).
      // Gobernados por la máquina de sesión PURA (no por el Workflow Engine).
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.sesion.abrir`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            sesionId: z.string().min(1).optional(),
            ocurridoAt: z.string().min(1).optional(),
            origen: z.enum(["online", "offline"]).optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          handle: (ctx, input, uow) => ejecutarSesion(deps, adapters, ctx, uow, "iniciar", input),
        };
      },
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.sesion.pausar`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            ocurridoAt: z.string().min(1).optional(),
            origen: z.enum(["online", "offline"]).optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          handle: (ctx, input, uow) => ejecutarSesion(deps, adapters, ctx, uow, "pausar", input),
        };
      },
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.sesion.reanudar`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            ocurridoAt: z.string().min(1).optional(),
            origen: z.enum(["online", "offline"]).optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          handle: (ctx, input, uow) => ejecutarSesion(deps, adapters, ctx, uow, "reanudar", input),
        };
      },
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.sesion.cerrar`,
          inputSchema: z.object({
            ordenId: z.string().min(1),
            ocurridoAt: z.string().min(1).optional(),
            origen: z.enum(["online", "offline"]).optional(),
            opId: z.string().optional(),
          }),
          authorization: { permissions: [`${MODULO}.operar`] },
          handle: (ctx, input, uow) => ejecutarSesion(deps, adapters, ctx, uow, "cerrar", input),
        };
      },
      /* ==================== REPROYECCIÓN (replay) ========================= */
      (deps) => {
        conPolicies(deps);
        return {
          name: `${MODULO}.reproyectar`,
          inputSchema: z.object({}),
          authorization: { permissions: [`${MODULO}.admin`] },
          async handle(ctx, _input, uow) {
            const tenant = tenantOf(ctx);
            if (!tenant.ok) return tenant;
            // Vacía TODOS los read models del tenant antes de reconstruir.
            const c1 = await adapters.readModel.clear(uow, tenant.value);
            if (!c1.ok) return c1;
            const c2 = await adapters.proyecciones.clear(uow, tenant.value);
            if (!c2.ok) return c2;
            const c3 = await adapters.sesiones.clear(uow, tenant.value);
            if (!c3.ok) return c3;
            // Fuente del replay: la BITÁCORA DURABLE (`ord_eventos`), NO el outbox.
            const stream = await adapters.eventLog.stream(tenant.value);
            if (!stream.ok) return stream;
            let eventos = 0;
            const operacionales = new Set<string>(EVENTOS_OPERACIONALES);
            const sesionales = new Set<string>(EVENTOS_SESION);
            for (const ev of stream.value) {
              const evento = { id: ev.eventId, type: ev.tipo, payload: ev.payload };
              const r = sesionales.has(ev.tipo)
                ? await aplicarEventoSesion(adapters, uow, evento)
                : operacionales.has(ev.tipo)
                  ? await aplicarEventoOperacional(adapters, uow, evento)
                  : await aplicarEventoAggregate(adapters, uow, evento);
              if (!r.ok) return r;
              eventos += 1;
            }
            const audited = await audit(deps.audit, uow, ctx, tenant.value, MODULO, "reproyectar", "-", { eventos });
            if (!audited.ok) return audited;
            return ok({ eventos });
          },
        };
      },
    ],
    queries: [
      // CQRS ESTRICTO (DGP-009.2): `detalle` lee EXCLUSIVAMENTE del read model de
      // detalle (`ord_ordenes_read`), materializado por la proyección de eventos
      // (mismo read model tras `reproyectar`). NO consulta el aggregate/repositorio
      // (fuente de escritura) ni tiene fallback a él: toda consulta pasa por read
      // models. El read model es self-sufficient (se proyecta desde payloads).
      () => ({
        name: `${MODULO}.detalle`,
        inputSchema: z.object({ id: z.string() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.readModel.get(tenant.value, input.id);
          if (!r.ok) return r;
          if (!r.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));
          return ok({ orden: r.value });
        },
      }),
      (deps) => ({
        name: `${MODULO}.catalogo.opciones`,
        inputSchema: z.object({ catalogo: z.enum(CATALOGOS) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          void deps;
          return adapters.catalogos.opciones(tenant.value, input.catalogo as NombreCatalogo);
        },
      }),
      /* ====================== CQRS: listado (read model) ================== */
      () => ({
        name: `${MODULO}.listar`,
        inputSchema: z.object({
          estado: z.string().optional(),
          tipo: z.string().optional(),
          responsable: z.string().optional(),
          activoPrincipalId: z.string().optional(),
          limit: z.number().int().positive().max(500).optional(),
        }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.readModel.list(tenant.value, input);
          if (!r.ok) return r;
          return ok({ ordenes: r.value });
        },
      }),
      /* ======================= CQRS: agenda / calendario ================== */
      () => ({
        name: `${MODULO}.agenda`,
        inputSchema: z.object({ desde: z.string().optional(), hasta: z.string().optional(), limit: z.number().int().positive().max(1000).optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.agendaRango(
            tenant.value,
            input.desde ? new Date(input.desde) : null,
            input.hasta ? new Date(input.hasta) : null,
            input.limit,
          );
          if (!r.ok) return r;
          return ok({ entradas: r.value });
        },
      }),
      () => ({
        name: `${MODULO}.calendario`,
        inputSchema: z.object({ desde: z.string().min(1), hasta: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.agendaRango(tenant.value, new Date(input.desde), new Date(input.hasta), 1000);
          if (!r.ok) return r;
          // Agrupación por día (calendario declarativo).
          const dias: Record<string, unknown[]> = {};
          for (const e of r.value) {
            const dia = (e.inicioPlanificado ?? e.actualizadoAt).toISOString().slice(0, 10);
            (dias[dia] ??= []).push(e);
          }
          return ok({ dias });
        },
      }),
      /* ========================= CQRS: asignaciones ======================= */
      () => ({
        name: `${MODULO}.asignaciones`,
        inputSchema: z.object({ ordenId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarAsignaciones(tenant.value, input.ordenId);
          if (!r.ok) return r;
          return ok({ asignaciones: r.value });
        },
      }),
      /* ========================= CQRS: responsables ======================= */
      () => ({
        name: `${MODULO}.responsables`,
        inputSchema: z.object({ ordenId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarResponsables(tenant.value, input.ordenId);
          if (!r.ok) return r;
          return ok({ responsables: r.value });
        },
      }),
      /* ============ CQRS: identidades elegibles (selector) =============== */
      /**
       * DGP-020.1 · Identidades canónicas ELEGIBLES del tenant para asignar como
       * recurso humano. Tenant-scoped: el tenant se deriva del contexto
       * autenticado (nunca del frontend). Alimenta el selector del frontend
       * (nombre/rol visibles; el frontend envía SOLO identityId).
       */
      () => ({
        name: `${MODULO}.identidades-elegibles`,
        inputSchema: z.object({ q: z.string().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.identidad.elegibles(tenant.value, input.q ? { q: input.q } : undefined);
          if (!r.ok) return r;
          return ok({ identidades: r.value });
        },
      }),
      /* =============== CQRS: activos relacionados / dependencias ========== */
      () => ({
        name: `${MODULO}.relaciones`,
        inputSchema: z.object({ ordenId: z.string().min(1), categoria: z.enum(CATEGORIAS_RELACION as unknown as [string, ...string[]]).optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarRelaciones(tenant.value, input.ordenId, input.categoria);
          if (!r.ok) return r;
          return ok({ relaciones: r.value });
        },
      }),
      () => ({
        name: `${MODULO}.activos-relacionados`,
        inputSchema: z.object({ ordenId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarRelaciones(tenant.value, input.ordenId, "activo");
          if (!r.ok) return r;
          return ok({ activos: r.value });
        },
      }),
      () => ({
        name: `${MODULO}.dependencias`,
        inputSchema: z.object({ ordenId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarRelaciones(tenant.value, input.ordenId, "orden");
          if (!r.ok) return r;
          return ok({ dependencias: r.value });
        },
      }),
      /* =========================== CQRS: historial ======================== */
      () => ({
        name: `${MODULO}.historial`,
        inputSchema: z.object({ ordenId: z.string().min(1), limit: z.number().int().positive().max(500).optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarHistorial(tenant.value, input.ordenId, input.limit);
          if (!r.ok) return r;
          return ok({ historial: r.value });
        },
      }),
      /* ===================== CQRS: bitácora operacional =================== */
      () => ({
        name: `${MODULO}.bitacora`,
        inputSchema: z.object({ ordenId: z.string().min(1), limit: z.number().int().positive().max(500).optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarBitacora(tenant.value, input.ordenId, input.limit);
          if (!r.ok) return r;
          return ok({ bitacora: r.value });
        },
      }),
      /* ============ CQRS: documentación / formularios / checklists ======== */
      () => ({
        name: `${MODULO}.documentacion`,
        inputSchema: z.object({ ordenId: z.string().min(1), clase: z.string().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarDocumentacion(tenant.value, input.ordenId, input.clase);
          if (!r.ok) return r;
          return ok({ documentacion: r.value });
        },
      }),
      () => ({
        name: `${MODULO}.formularios`,
        inputSchema: z.object({ ordenId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarDocumentacion(tenant.value, input.ordenId, "formulario");
          if (!r.ok) return r;
          return ok({ formularios: r.value });
        },
      }),
      () => ({
        name: `${MODULO}.checklists`,
        inputSchema: z.object({ ordenId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.proyecciones.listarDocumentacion(tenant.value, input.ordenId, "checklist");
          if (!r.ok) return r;
          return ok({ checklists: r.value });
        },
      }),
      /* ===================== Consola técnica (solo admin) ================= */
      (deps) => ({
        name: `${MODULO}.consola`,
        inputSchema: z.object({}),
        authorization: { permissions: [`${MODULO}.admin`] },
        async handle(ctx) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const t = tenant.value;
          const LIMITE = 10;
          const [stats, leiOrdenes, totalEventos, conteos, outbox, recibos] = await Promise.all([
            adapters.readModel.stats(t),
            adapters.readModel.lastEventId(t),
            adapters.eventLog.contar(t),
            adapters.proyecciones.contar(t),
            adapters.consola.outboxDelModulo(t, LIMITE),
            adapters.syncReceipts.listByTenant(t),
          ]);
          const listaRecibos: readonly SyncReceipt[] = recibos.ok ? recibos.value : [];
          const porEstado: Record<string, number> = {};
          for (const r of listaRecibos) porEstado[r.estado] = (porEstado[r.estado] ?? 0) + 1;
          const totalRm = stats.ok ? Object.values(stats.value).reduce((a, b) => a + b, 0) : 0;
          void deps;
          return ok({
            modulo: MODULO,
            version: "1.0.0",
            eventos: [...EVENTOS_MODULO, ...EVENTOS_OPERACIONALES],
            catalogos: [...CATALOGOS],
            readModels: {
              ordenes: { total: totalRm, porEstado: stats.ok ? stats.value : {}, lastEventId: leiOrdenes.ok ? leiOrdenes.value : null },
              especializados: conteos.ok ? conteos.value : {},
            },
            eventLog: { total: totalEventos.ok ? totalEventos.value : 0 },
            outbox: outbox.ok ? outbox.value : { pendientes: 0, procesados: 0, ultimos: [], error: outbox.error.message },
            sincronizacion: {
              total: listaRecibos.length,
              porEstado,
              ultimos: listaRecibos.slice(0, LIMITE).map((r) => ({ opId: r.opId, comando: r.comando, estado: r.estado, clienteId: r.clienteId })),
              conflictos: listaRecibos.filter((r) => r.estado === "conflicto").map((r) => ({ opId: r.opId, comando: r.comando, resultado: r.resultado })),
            },
            rls: {
              tablas: [
                "ord_ordenes", "ord_ordenes_read", "ord_sync_receipts", "ord_eventos",
                "ord_agenda_read", "ord_asignaciones_read", "ord_responsables_read", "ord_relaciones_read",
                "ord_historial_read", "ord_bitacora_read", "ord_documentacion_read",
                "ord_planificacion", "ord_asignaciones", "ord_recursos", "ord_sla", "ord_relaciones",
                "ord_sesiones", "ord_sesion_tramos", "ord_sesiones_read", "ord_sesion_tramos_read", "ord_sesion_duraciones_read",
              ],
              aislamiento: "app.tenant_id (RLS por tenant, lecturas y escrituras)",
            },
          });
        },
      }),
      /* ============ CQRS: SESIONES DE TRABAJO (DGP-020.2) =============== */
      // El frontend NUNCA calcula duración: la lee de estos read models.
      () => ({
        name: `${MODULO}.sesion.activa`,
        inputSchema: z.object({ ordenId: z.string().min(1), identityId: z.string().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.sesiones.sesionActiva(tenant.value, input.ordenId, input.identityId ?? null);
          if (!r.ok) return r;
          // `esPropia`: comparación por el MISMO canon (identityId de Identity).
          const yo = identidadDeSesionSuave(ctx);
          const sesion = r.value ? { ...r.value, esPropia: yo !== null && r.value.identityId === yo } : null;
          return ok({ sesion });
        },
      }),
      () => ({
        name: `${MODULO}.sesiones`,
        inputSchema: z.object({
          ordenId: z.string().optional(),
          identityId: z.string().optional(),
          activoId: z.string().optional(),
        }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = input.ordenId
            ? await adapters.sesiones.sesionesPorOrden(tenant.value, input.ordenId)
            : input.identityId
              ? await adapters.sesiones.sesionesPorIdentidad(tenant.value, input.identityId)
              : input.activoId
                ? await adapters.sesiones.sesionesPorActivo(tenant.value, input.activoId)
                : fail(KernelErrors.validation("Especifique ordenId, identityId o activoId"));
          if (!r.ok) return r;
          // `esPropia` por fila usando el MISMO canon (identityId de Identity).
          const yo = identidadDeSesionSuave(ctx);
          const sesiones = r.value.map((s) => ({ ...s, esPropia: yo !== null && s.identityId === yo }));
          return ok({ sesiones });
        },
      }),
      () => ({
        name: `${MODULO}.sesion.tramos`,
        inputSchema: z.object({ sesionId: z.string().min(1) }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          const r = await adapters.sesiones.tramosRead(tenant.value, input.sesionId);
          if (!r.ok) return r;
          return ok({ tramos: r.value });
        },
      }),
      () => ({
        name: `${MODULO}.sesion.duraciones`,
        inputSchema: z.object({ sesionId: z.string().optional(), ordenId: z.string().optional() }),
        authorization: { permissions: [`${MODULO}.read`] },
        async handle(ctx, input) {
          const tenant = tenantOf(ctx);
          if (!tenant.ok) return tenant;
          if (input.sesionId) {
            const r = await adapters.sesiones.duracionesDeSesion(tenant.value, input.sesionId);
            if (!r.ok) return r;
            return ok({ duraciones: r.value });
          }
          if (input.ordenId) {
            const r = await adapters.sesiones.duracionesPorOrden(tenant.value, input.ordenId);
            if (!r.ok) return r;
            return ok({ duraciones: r.value });
          }
          return fail(KernelErrors.validation("Especifique sesionId u ordenId"));
        },
      }),
    ],
    eventHandlers: [
      // Proyección CQRS de los eventos del AGGREGATE a todos los read models
      // derivados (listado/detalle, agenda, responsables, historial, doc).
      // Payload-only, idempotente por last_event_id/eventId.
      ...EVENTOS_MODULO.map((eventType) => ({
        eventType,
        handlerName: `proyectar:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          handlerProyeccion(adapters, false)(deps)(event, eventType),
      })),
      // Proyección CQRS de los eventos OPERACIONALES (bitácora, planificación,
      // asignaciones, recursos, SLA, relaciones).
      ...EVENTOS_OPERACIONALES.map((eventType) => ({
        eventType,
        handlerName: `proyectar-op:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          handlerProyeccion(adapters, true)(deps)(event, eventType),
      })),
      // Proyección CQRS de los eventos de SESIÓN (DGP-020.2): cabecera de sesión,
      // tramos append-only y resumen de duraciones (recalculado sólo desde los
      // tramos). Payload-only, idempotente por (tenant, id)/event_id.
      ...EVENTOS_SESION.map((eventType) => ({
        eventType,
        handlerName: `proyectar-sesion:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown> }) =>
          handlerProyeccion(adapters, "sesion")(deps)(event, eventType),
      })),
      // Shared Timeline CANÓNICO (platform.timeline): cada evento del módulo
      // (aggregate, operacional y de sesión) se registra vía COMANDO (nunca
      // escritura directa), idempotente por entryId=event.id.
      ...[...EVENTOS_MODULO, ...EVENTOS_OPERACIONALES, ...EVENTOS_SESION].map((eventType) => ({
        eventType,
        handlerName: `timeline:${eventType}`,
        handle: (deps: ServiceDeps) => (event: { id: string; payload: Record<string, unknown>; correlationId: string }) =>
          registrarEnTimeline()(deps, { ...event, type: eventType }),
      })),
    ],
    // Salud del dominio: sonda mínima contra el repositorio (fuente de verdad).
    healthCheck: () => async () => {
      const probe = await adapters.repository.list("healthcheck", { limit: 1 });
      return probe.ok
        ? { healthy: true, detail: "repositorio del aggregate operativo" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}

/* ----------------------------- Helpers privados -------------------------- */

async function validarClasificacion(
  adapters: ModuleAdapters,
  tenant: string,
  refs: {
    tipo?: string;
    categoria?: string | null;
    prioridad?: string | null;
    severidad?: string | null;
    empresa?: string | null;
    proyecto?: string | null;
    centroCosto?: string | null;
  },
): Promise<Result<void, KernelError>> {
  const checks: Array<[NombreCatalogo, string | null | undefined, boolean]> = [
    ["tipos", refs.tipo, refs.tipo !== undefined],
    ["categorias", refs.categoria, false],
    ["prioridades", refs.prioridad, false],
    ["severidades", refs.severidad, false],
    ["empresas", refs.empresa, false],
    ["proyectos", refs.proyecto, false],
    ["centros-costo", refs.centroCosto, false],
  ];
  for (const [cat, val, obligatorio] of checks) {
    if (val === undefined) continue;
    const r = await adapters.catalogos.validarReferencia(tenant, cat, val, obligatorio);
    if (!r.ok) return r;
  }
  return ok(undefined);
}

function construirVOs(input: Record<string, unknown>): Result<
  {
    sla: OrdenTrabajo["sla"];
    ubicacion: OrdenTrabajo["ubicacion"];
    activoPrincipal: OrdenTrabajo["activoPrincipal"];
    activosRelacionados: OrdenTrabajo["activosRelacionados"];
    tiempoEstimado: OrdenTrabajo["tiempoEstimado"];
    costoEstimado: OrdenTrabajo["costoEstimado"];
    riesgoImpacto: OrdenTrabajo["riesgoImpacto"];
  },
  KernelError
> {
  let sla: OrdenTrabajo["sla"] = null;
  if (input["sla"] !== undefined && input["sla"] !== null) {
    const r = crearSla(input["sla"]);
    if (!r.ok) return r;
    sla = r.value;
  }
  let ubicacion: OrdenTrabajo["ubicacion"] = null;
  if (input["ubicacion"] !== undefined && input["ubicacion"] !== null) {
    const r = crearUbicacion(input["ubicacion"]);
    if (!r.ok) return r;
    ubicacion = r.value;
  }
  let activoPrincipal: OrdenTrabajo["activoPrincipal"] = null;
  if (input["activoPrincipal"] !== undefined && input["activoPrincipal"] !== null) {
    const r = crearReferenciaActivo({ ...(input["activoPrincipal"] as object), rol: "principal" });
    if (!r.ok) return r;
    activoPrincipal = r.value;
  }
  const activosRelacionados: OrdenTrabajo["activosRelacionados"][number][] = [];
  for (const a of (input["activosRelacionados"] as unknown[] | undefined) ?? []) {
    const r = crearReferenciaActivo({ ...(a as object), rol: "relacionado" });
    if (!r.ok) return r;
    activosRelacionados.push(r.value);
  }
  let tiempoEstimado: OrdenTrabajo["tiempoEstimado"] = null;
  if (input["tiempoEstimado"] !== undefined && input["tiempoEstimado"] !== null) {
    const r = crearDuracion(input["tiempoEstimado"]);
    if (!r.ok) return r;
    tiempoEstimado = r.value;
  }
  let costoEstimado: OrdenTrabajo["costoEstimado"] = null;
  if (input["costoEstimado"] !== undefined && input["costoEstimado"] !== null) {
    const r = crearCosto(input["costoEstimado"]);
    if (!r.ok) return r;
    costoEstimado = r.value;
  }
  let riesgoImpacto: OrdenTrabajo["riesgoImpacto"] = null;
  if (input["riesgoImpacto"] !== undefined && input["riesgoImpacto"] !== null) {
    const r = crearRiesgoImpacto(input["riesgoImpacto"]);
    if (!r.ok) return r;
    riesgoImpacto = r.value;
  }
  return ok({ sla, ubicacion, activoPrincipal, activosRelacionados, tiempoEstimado, costoEstimado, riesgoImpacto });
}

/**
 * Máxima diferencia de versión aceptada respecto a la ACTIVA (garantía N/N-1
 * del motor de Dynamic Forms): la versión anclada puede ser la activa (N) o la
 * inmediatamente anterior (N-1).
 */
const MAX_DELTA_VERSION = 1;

async function asociarPlantilla(
  deps: ServiceDeps,
  adapters: ModuleAdapters,
  ctx: ExecutionContext,
  uow: UnitOfWork,
  input: {
    id: string;
    expectedVersion: number;
    opId?: string;
    plantilla: { servicio?: string; clave: string; version: number; etiqueta?: string };
    respuestaId?: string;
  },
  clase: "formulario" | "checklist",
): Promise<Result<unknown, KernelError>> {
  const tenant = tenantOf(ctx);
  if (!tenant.ok) return tenant;
  const comando = `${MODULO}.asociar${clase === "formulario" ? "Formulario" : "Checklist"}`;
  const reclamo = await reclamarOpId(adapters, ctx, uow, tenant.value, comando, input.opId);
  if (!reclamo.proceder) return reclamo.cortocircuito;
  const actual = await adapters.repository.findById(tenant.value, input.id);
  if (!actual.ok) return actual;
  if (!actual.value) return fail(KernelErrors.notFound("orden-trabajo", input.id));

  const policy = clase === "formulario" ? POLICY_PUEDE_ASOCIAR_FORMULARIO : POLICY_PUEDE_ASOCIAR_CHECKLIST;
  const pol = deps.runtime.policyEngine.evaluate(policy, ctx, { estado: actual.value.estado });
  if (!pol.ok) return pol;

  // (a) VALIDACIÓN contra el runtime de Dynamic Forms: la plantilla EXISTE, es
  // de la CLASE correcta y su versión es COMPATIBLE (N/N-1). Sin esta
  // verificación no se puede anclar ninguna respuesta coherente.
  const verif = await adapters.plantillas.verificar(tenant.value, clase, input.plantilla.clave, input.plantilla.version);
  if (!verif.ok) return verif;
  if (verif.value.versionActiva != null) {
    const delta = verif.value.versionActiva - input.plantilla.version;
    if (delta < 0 || delta > MAX_DELTA_VERSION) {
      return fail(
        KernelErrors.conflict(
          `Versión de plantilla incompatible: ${input.plantilla.version} (activa ${verif.value.versionActiva}); ` +
            `solo se admite la activa (N) o la anterior (N-1).`,
        ),
      );
    }
  }

  // (b) ANCLAJE de respuesta: si se aporta una respuesta, debe existir y estar
  // anclada a la versión EXACTA de la plantilla referida (coherencia).
  let respuesta: { respuestaId: string; version: number } | null = null;
  if (input.respuestaId) {
    const rp = await adapters.plantillas.verificarRespuesta(tenant.value, input.respuestaId, input.plantilla.clave);
    if (!rp.ok) return rp;
    if (rp.value.plantillaVersion !== input.plantilla.version) {
      return fail(
        KernelErrors.conflict(
          `La respuesta ${input.respuestaId} está anclada a la versión ${rp.value.plantillaVersion}, ` +
            `no a la versión referida ${input.plantilla.version}.`,
        ),
      );
    }
    respuesta = { respuestaId: rp.value.respuestaId, version: rp.value.plantillaVersion };
  }

  const ref = crearReferenciaPlantilla({
    ...input.plantilla,
    clase,
    etiqueta: input.plantilla.etiqueta ?? verif.value.titulo,
    respuesta,
  });
  if (!ref.ok) return ref;

  const cambio =
    clase === "formulario"
      ? asociarFormulario(actual.value, ref.value, ctx.principal.id, new Date())
      : asociarChecklist(actual.value, ref.value, ctx.principal.id, new Date());
  if (!cambio.ok) return cambio;
  const saved = await persistir(deps, adapters, ctx, uow, cambio.value, `asociar:${clase}`, false, input.expectedVersion);
  if (!saved.ok) return saved;
  const resultado = { id: input.id, version: saved.value.version, clase, respuesta };
  if (input.opId) {
    const rec = await adapters.recibos.sellar(uow, tenant.value, { opId: input.opId, comando, resultado }, ctx.principal.id);
    if (!rec.ok) return rec;
  }
  return ok({ ...resultado, idempotente: false });
}

// Referencia no usada directamente pero exportada para claridad del contrato.
export const COMANDO_INICIAL_TRANSICION = CMD_ABRIR;
export { PERMISO_OPERAR };
