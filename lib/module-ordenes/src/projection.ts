/**
 * DGP-009.2 · Módulo Órdenes de Trabajo — PROYECCIÓN CQRS (payload-only).
 *
 * Funciones puras de proyección que transforman el PAYLOAD autosuficiente de un
 * evento en filas de read model, y las aplican de forma IDEMPOTENTE (por
 * last_event_id / eventId). Reutilizables tanto por los eventHandlers en vivo
 * (outbox at-least-once) como por la reproyección por replay desde la bitácora
 * durable (`ord_eventos`) ⇒ equivalencia bit a bit. NUNCA releen el aggregate.
 */
import {
  createExecutionContext,
  KernelTokens,
  ok,
  SYSTEM_PRINCIPAL,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { ServiceDeps } from "@workspace/platform";
import type { EstadoOrdenEfectivo } from "./domain/maquina-estados";
import {
  ASIGNACION_REGISTRADA,
  BITACORA_REGISTRADA,
  PLANIFICACION_ACTUALIZADA,
  PLANIFICACION_BLOQUEADA,
  RECURSO_REGISTRADO,
  RELACION_CREADA,
  SLA_ACTUALIZADO,
} from "./domain/operacional";
import {
  ORDEN_ASIGNACION_ACTUALIZADA,
  ORDEN_CHECKLIST_ASOCIADO,
  ORDEN_CREADA,
  ORDEN_EVIDENCIA_AGREGADA,
  ORDEN_FORMULARIO_ASOCIADO,
} from "./domain/orden";
import type { OrdenReadModel, OrdenReadRow } from "./infrastructure/repository";
import type {
  AgendaRow,
  DocRow,
  FilaAppend,
  ProyeccionesStore,
  RelacionRow,
} from "./infrastructure/operacional";
import {
  SESION_CERRADA,
  SESION_INICIADA,
  SESION_PAUSADA,
  SESION_REANUDADA,
  calcularDuraciones,
  type EstadoSesion,
  type Tramo,
} from "./domain/sesion";
import type { SesionStore } from "./infrastructure/sesiones";

/** Adaptadores que la proyección necesita (subconjunto de ModuleAdapters). */
export interface ProyeccionAdapters {
  readonly readModel: OrdenReadModel;
  readonly proyecciones: ProyeccionesStore;
  /** DGP-020.2 — Read models de sesiones/tramos/duraciones. */
  readonly sesiones: SesionStore;
}

export interface EventoLike {
  readonly id: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

const s = (v: unknown): string | null => (v == null ? null : String(v));
const dateOrNull = (v: unknown): Date | null => (v == null ? null : new Date(String(v)));
const actualizadoAt = (p: Record<string, unknown>): Date =>
  p["actualizadoAt"] ? new Date(String(p["actualizadoAt"])) : new Date();

/* ----------------------- Read model listado/detalle ---------------------- */

export function readRowDeEvento(p: Record<string, unknown>, eventId: string): OrdenReadRow {
  const activo = p["activoPrincipal"] as { activoId?: string } | null | undefined;
  const ubic = p["ubicacion"] as { ubicacionId?: string } | null | undefined;
  return {
    tenantId: String(p["tenantId"] ?? ""),
    id: String(p["id"] ?? ""),
    codigo: String((p["codigo"] as { valor?: string })?.valor ?? ""),
    titulo: String(p["titulo"] ?? ""),
    estado: (p["estado"] as EstadoOrdenEfectivo) ?? "BORRADOR",
    tipo: String(p["tipo"] ?? ""),
    categoria: s(p["categoria"]),
    prioridad: s(p["prioridad"]),
    severidad: s(p["severidad"]),
    responsable: s(p["responsable"]),
    supervisor: s(p["supervisor"]),
    activoPrincipalId: activo?.activoId ?? null,
    ubicacionId: ubic?.ubicacionId ?? null,
    datos: { ...p },
    version: Number(p["version"] ?? 1),
    lastEventId: eventId,
    actualizadoAt: actualizadoAt(p),
  };
}

/* ------------------------------ Agenda ----------------------------------- */

function agendaRowDeEvento(p: Record<string, unknown>, eventId: string): AgendaRow {
  const fechas = (p["fechas"] as Record<string, unknown>) ?? {};
  const programada = dateOrNull(fechas["programada"]);
  return {
    tenantId: String(p["tenantId"] ?? ""),
    id: String(p["id"] ?? ""),
    codigo: String((p["codigo"] as { valor?: string })?.valor ?? ""),
    titulo: String(p["titulo"] ?? ""),
    estado: String(p["estado"] ?? ""),
    responsable: s(p["responsable"]),
    inicioPlanificado: programada,
    finPlanificado: dateOrNull(fechas["finProgramada"]),
    ventanaInicio: dateOrNull(fechas["ventanaInicio"]),
    ventanaFin: dateOrNull(fechas["ventanaFin"]),
    programacionEstado: programada ? "programada" : "sin-programar",
    enConflicto: false,
    version: Number(p["version"] ?? 1),
    lastEventId: eventId,
    actualizadoAt: actualizadoAt(p),
  };
}

/* ------------------------- Filas append-only ----------------------------- */

function filaResponsable(p: Record<string, unknown>, eventId: string): FilaAppend {
  return {
    tenantId: String(p["tenantId"] ?? ""),
    eventId,
    ordenId: String(p["id"] ?? ""),
    responsable: s(p["responsable"]),
    supervisor: s(p["supervisor"]),
    version: Number(p["version"] ?? 1),
    actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
    registradoAt: actualizadoAt(p),
  };
}

function filaHistorial(p: Record<string, unknown>, tipo: string, eventId: string): FilaAppend {
  const codigo = String((p["codigo"] as { valor?: string })?.valor ?? p["id"] ?? "");
  return {
    tenantId: String(p["tenantId"] ?? ""),
    eventId,
    ordenId: String(p["id"] ?? ""),
    tipo,
    resumen: `${tipo} (${codigo})`,
    actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
    registradoAt: actualizadoAt(p),
  };
}

function filaAsignacionDeAggregate(p: Record<string, unknown>, eventId: string): FilaAppend {
  return {
    tenantId: String(p["tenantId"] ?? ""),
    eventId,
    ordenId: String(p["id"] ?? ""),
    tipo: "persona",
    asignadoId: String(p["responsable"] ?? ""),
    rol: "responsable",
    vigente: true,
    version: Number(p["version"] ?? 1),
    actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
    registradoAt: actualizadoAt(p),
  };
}

/* ---------------------------- Documentación ------------------------------ */

function docDeAggregate(p: Record<string, unknown>, clase: "formulario" | "checklist", eventId: string): DocRow | null {
  const ref = p[clase] as { clave?: string; version?: number; titulo?: string; etiqueta?: string; respuesta?: { respuestaId?: string } } | null | undefined;
  if (!ref || !ref.clave) return null;
  const ordenId = String(p["id"] ?? "");
  return {
    tenantId: String(p["tenantId"] ?? ""),
    id: `${ordenId}:${clase}`,
    ordenId,
    clase,
    referenciaClave: ref.clave ?? null,
    referenciaVersion: ref.version ?? null,
    respuestaId: ref.respuesta?.respuestaId ?? null,
    titulo: ref.titulo ?? ref.etiqueta ?? ref.clave ?? null,
    datos: { ...ref },
    lastEventId: eventId,
    actualizadoAt: actualizadoAt(p),
  };
}

/* --------------------------- Aplicadores puros --------------------------- */

/**
 * Aplica un evento del AGGREGATE a TODOS los read models derivados del payload
 * autosuficiente. Idempotente. Reutilizado por handlers en vivo y por replay.
 */
export async function aplicarEventoAggregate(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  if (!p["tenantId"] || !p["id"]) return ok(undefined);

  const rm = await adapters.readModel.apply(uow, readRowDeEvento(p, ev.id));
  if (!rm.ok) return rm;

  const ag = await adapters.proyecciones.aplicarAgenda(uow, agendaRowDeEvento(p, ev.id));
  if (!ag.ok) return ag;

  const hist = await adapters.proyecciones.aplicarHistorial(uow, filaHistorial(p, ev.type, ev.id));
  if (!hist.ok) return hist;

  // Responsable: historial de responsables en creación y reasignación.
  if (ev.type === ORDEN_CREADA || ev.type === ORDEN_ASIGNACION_ACTUALIZADA) {
    const resp = await adapters.proyecciones.aplicarResponsable(uow, filaResponsable(p, ev.id));
    if (!resp.ok) return resp;
    if (p["responsable"]) {
      const asg = await adapters.proyecciones.aplicarAsignacion(uow, filaAsignacionDeAggregate(p, ev.id));
      if (!asg.ok) return asg;
    }
  }

  // Documentación: formulario/checklist asociados (referencia-only).
  if (ev.type === ORDEN_FORMULARIO_ASOCIADO || ev.type === ORDEN_CREADA) {
    const doc = docDeAggregate(p, "formulario", ev.id);
    if (doc) {
      const r = await adapters.proyecciones.aplicarDocumentacion(uow, doc);
      if (!r.ok) return r;
    }
  }
  if (ev.type === ORDEN_CHECKLIST_ASOCIADO || ev.type === ORDEN_CREADA) {
    const doc = docDeAggregate(p, "checklist", ev.id);
    if (doc) {
      const r = await adapters.proyecciones.aplicarDocumentacion(uow, doc);
      if (!r.ok) return r;
    }
  }
  // Evidencias: cada evidencia agregada como documentación clase 'evidencia'.
  if (ev.type === ORDEN_EVIDENCIA_AGREGADA) {
    const evidencias = (p["evidencias"] as Array<{ attachmentId?: string; titulo?: string }>) ?? [];
    const ultima = evidencias[evidencias.length - 1];
    if (ultima?.attachmentId) {
      const ordenId = String(p["id"]);
      const r = await adapters.proyecciones.aplicarDocumentacion(uow, {
        tenantId: String(p["tenantId"]),
        id: `${ordenId}:evidencia:${ultima.attachmentId}`,
        ordenId,
        clase: "evidencia",
        referenciaClave: ultima.attachmentId,
        referenciaVersion: null,
        respuestaId: null,
        titulo: ultima.titulo ?? ultima.attachmentId,
        datos: { ...ultima },
        lastEventId: ev.id,
        actualizadoAt: actualizadoAt(p),
      });
      if (!r.ok) return r;
    }
  }
  return ok(undefined);
}

/**
 * Aplica un evento OPERACIONAL a sus read models (bitácora/asignaciones/
 * relaciones). Idempotente. Reutilizado por handlers en vivo y por replay.
 */
export async function aplicarEventoOperacional(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const tenantId = String(p["tenantId"] ?? "");
  const ordenId = String(p["ordenId"] ?? p["id"] ?? "");
  if (!tenantId || !ordenId) return ok(undefined);

  switch (ev.type) {
    case BITACORA_REGISTRADA: {
      const row: FilaAppend = {
        tenantId, eventId: ev.id, ordenId,
        accion: String(p["accion"] ?? ""),
        detalle: (p["detalle"] as Record<string, unknown>) ?? {},
        actorId: s(p["actorId"]),
        ocurridoAt: p["ocurridoAt"] ? new Date(String(p["ocurridoAt"])) : new Date(),
        registradoAt: p["ocurridoAt"] ? new Date(String(p["ocurridoAt"])) : new Date(),
      };
      const r = await adapters.proyecciones.aplicarBitacora(uow, row);
      if (!r.ok) return r;
      // La bitácora también alimenta el historial general.
      return adapters.proyecciones.aplicarHistorial(uow, {
        tenantId, eventId: ev.id, ordenId, tipo: ev.type,
        resumen: `Bitácora: ${String(p["accion"] ?? "")}`,
        actorId: s(p["actorId"]), registradoAt: row.registradoAt as Date,
      }).then((x) => (x.ok ? ok(undefined) : x));
    }
    case ASIGNACION_REGISTRADA: {
      const row: FilaAppend = {
        tenantId, eventId: ev.id, ordenId,
        tipo: String(p["tipoAsignacion"] ?? "persona"),
        asignadoId: String(p["asignadoId"] ?? ""),
        // DGP-020.1 — referencia fuerte + atributos de presentación (desde el payload).
        asignadoIdentityId: p["asignadoIdentityId"] ? String(p["asignadoIdentityId"]) : null,
        asignadoNombre: s(p["asignadoNombre"]),
        asignadoEmail: s(p["asignadoEmail"]),
        rol: s(p["rol"]), vigente: true, version: Number(p["version"] ?? 1),
        actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
        registradoAt: actualizadoAt(p),
      };
      const r = await adapters.proyecciones.aplicarAsignacion(uow, row);
      if (!r.ok) return r;
      // DGP-020.1 (E2E) · Una asignación FUERTE de PERSONA como RESPONSABLE debe
      // reflejarse también en el read model de responsables (fuente de
      // `/responsables` y de la superficie del supervisor). Se proyecta SÓLO
      // desde el payload autosuficiente e idempotente por (tenant, event_id).
      // La entrada más reciente (registrado_at DESC) es el responsable vigente.
      if (String(row.tipo) === "persona" && s(p["rol"]) === "responsable") {
        // `responsable` (texto de presentación) prioriza el nombre canónico y
        // cae al identityId/asignadoId para no perder trazabilidad legible.
        const nombrePresentacion = s(p["asignadoNombre"]) ?? s(p["asignadoIdentityId"]) ?? s(p["asignadoId"]);
        const resp = await adapters.proyecciones.aplicarResponsable(uow, {
          tenantId, eventId: ev.id, ordenId,
          responsable: nombrePresentacion,
          responsableIdentityId: p["asignadoIdentityId"] ? String(p["asignadoIdentityId"]) : null,
          responsableNombre: s(p["asignadoNombre"]),
          supervisor: null,
          version: Number(p["version"] ?? 1),
          actorId: String(p["actorId"] ?? SYSTEM_PRINCIPAL.id),
          registradoAt: actualizadoAt(p),
        });
        if (!resp.ok) return resp;
        // También refleja el responsable en el read model de listado/detalle
        // (superficie del supervisor: "Sin responsable asignado" ⇒ nombre).
        const rm = await adapters.readModel.actualizarResponsable(uow, tenantId, ordenId, nombrePresentacion);
        if (!rm.ok) return rm;
      }
      return histOperacional(adapters, uow, ev, ordenId, `Asignación registrada (${row.tipo})`);
    }
    case RELACION_CREADA: {
      const rel: RelacionRow = {
        tenantId, id: String(p["id"] ?? ev.id),
        categoria: String(p["categoria"] ?? "orden"), tipo: String(p["tipo"] ?? ""),
        ordenId, destinoId: String(p["destinoId"] ?? ""),
        destinoCodigo: s(p["destinoCodigo"]), destinoNombre: s(p["destinoNombre"]),
        datos: (p["datos"] as Record<string, unknown>) ?? {},
        lastEventId: ev.id, actualizadoAt: actualizadoAt(p),
      };
      const r = await adapters.proyecciones.aplicarRelacion(uow, rel);
      if (!r.ok) return r;
      return histOperacional(adapters, uow, ev, ordenId, `Relación "${rel.tipo}" creada`);
    }
    case PLANIFICACION_ACTUALIZADA:
    case PLANIFICACION_BLOQUEADA: {
      // Refleja la programación en la agenda directamente desde el payload.
      const row: AgendaRow = {
        tenantId, id: ordenId,
        codigo: String(p["codigo"] ?? ""), titulo: String(p["titulo"] ?? ""),
        estado: String(p["estado"] ?? ""), responsable: s(p["responsable"]),
        inicioPlanificado: dateOrNull(p["inicioPlanificado"]),
        finPlanificado: dateOrNull(p["finPlanificado"]),
        ventanaInicio: dateOrNull(p["ventanaInicio"]),
        ventanaFin: dateOrNull(p["ventanaFin"]),
        programacionEstado: String(p["programacionEstado"] ?? "programada"),
        enConflicto: Boolean(p["enConflicto"]),
        version: Number(p["version"] ?? 1), lastEventId: ev.id, actualizadoAt: actualizadoAt(p),
      };
      const r = await adapters.proyecciones.aplicarAgenda(uow, row);
      if (!r.ok) return r;
      return histOperacional(adapters, uow, ev, ordenId, ev.type === PLANIFICACION_BLOQUEADA ? "Planificación bloqueada" : "Planificación actualizada");
    }
    case RECURSO_REGISTRADO:
      return histOperacional(adapters, uow, ev, ordenId, `Recurso registrado (${String(p["clase"] ?? "")})`);
    case SLA_ACTUALIZADO:
      return histOperacional(adapters, uow, ev, ordenId, `SLA ${String(p["estadoSla"] ?? "")}`);
    default:
      return ok(undefined);
  }
}

async function histOperacional(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
  ordenId: string,
  resumen: string,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const r = await adapters.proyecciones.aplicarHistorial(uow, {
    tenantId: String(p["tenantId"] ?? ""),
    eventId: ev.id,
    ordenId,
    tipo: ev.type,
    resumen,
    actorId: s(p["actorId"]),
    registradoAt: actualizadoAt(p),
  });
  return r.ok ? ok(undefined) : r;
}

/* ----------------------------- Sesiones (DGP-020.2) ---------------------- */

/**
 * Proyecta un evento de SESIÓN a los read models (`ord_sesiones_read`,
 * `ord_sesion_tramos_read`, `ord_sesion_duraciones_read`). Payload-only e
 * idempotente. La DURACIÓN se recalcula EXCLUSIVAMENTE desde los tramos
 * append-only (fuente de verdad, ya confirmados en la UoW del comando), NUNCA
 * desde el workflow/bitácora/Timeline. Para una sesión abierta se usa el
 * `registradoAt` del evento como frontera "hasta ahora" (determinista en replay).
 */
export async function aplicarEventoSesion(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const tenantId = String(p["tenantId"] ?? "");
  const sesionId = String(p["sesionId"] ?? "");
  const ordenId = String(p["ordenId"] ?? "");
  if (!tenantId || !sesionId || !ordenId) return ok(undefined);

  const estado = String(p["estado"] ?? "ABIERTA") as EstadoSesion;
  const activoId = s(p["activoId"]);
  const identityId = String(p["identityId"] ?? "");
  const origen = String(p["origen"] ?? "online");
  const iniciadoAt = new Date(String(p["iniciadoAt"] ?? p["ocurridoAt"] ?? new Date().toISOString()));
  const cerradoAt = ev.type === SESION_CERRADA ? new Date(String(p["cerradoAt"] ?? p["ocurridoAt"])) : null;
  const registradoAt = new Date(String(p["registradoAt"] ?? new Date().toISOString()));

  // Cabecera FUENTE DE VERDAD: da estado/cerradoAt/iniciadoAt definitivos, para
  // que la proyección converja igual sea cual sea el orden de replay.
  const cabR = await adapters.sesiones.getCabecera(tenantId, sesionId);
  if (!cabR.ok) return cabR;
  const cab = cabR.value;
  const estadoActual = cab ? cab.estado : estado;
  const cerradoActual = cab ? cab.cerradoAt : cerradoAt;
  const iniciadoActual = cab ? cab.iniciadoAt : iniciadoAt;

  // 1) Cabecera de sesión (upsert idempotente por (tenant, id) con guarda de evento).
  const sr = await adapters.sesiones.aplicarSesionRead(uow, tenantId, {
    id: sesionId, ordenId, activoId, identityId, estado: estadoActual, origen,
    iniciadoAt: iniciadoActual, cerradoAt: cerradoActual, registradoAt, lastEventId: ev.id, actualizadoAt: registradoAt,
  });
  if (!sr.ok) return sr;

  // 2) Tramo append-only (una fila por evento; idempotente por event_id).
  const tr = await adapters.sesiones.aplicarTramoRead(uow, tenantId, {
    eventId: ev.id, sesionId, ordenId,
    secuencia: Number(p["secuencia"] ?? 0),
    tipo: String(p["tipoTramo"] ?? "trabajo"),
    origen: String(p["origenTramo"] ?? "iniciar"),
    ocurridoAt: new Date(String(p["ocurridoAt"] ?? iniciadoAt.toISOString())),
    registradoAt,
    anomaliaReloj: (p["anomaliaReloj"] as Tramo["anomaliaReloj"]) ?? null,
    identityId,
  });
  if (!tr.ok) return tr;

  // 3) DURACIONES recalculadas SÓLO desde los tramos append-only (fuente de
  //    verdad) y la CABECERA fuente-de-verdad (estado/cerradoAt); la proyección
  //    es ORDEN-INDEPENDIENTE en replay: converge al mismo valor cualquiera que
  //    sea el orden de aplicación de los eventos.
  const tramosR = await adapters.sesiones.tramosDe(tenantId, sesionId);
  if (!tramosR.ok) return tramosR;
  const tramos: Tramo[] = tramosR.value.map((t) => ({
    sesionId: t.sesionId, secuencia: t.secuencia, tipo: t.tipo, origen: t.origen,
    ocurridoAt: t.ocurridoAt, registradoAt: t.registradoAt, anomaliaReloj: t.anomaliaReloj,
  }));
  const dur = calcularDuraciones(tramos, cerradoActual, registradoAt);
  const dr = await adapters.sesiones.aplicarDuracionesRead(uow, tenantId, {
    sesionId, ordenId, activoId, identityId, estado: estadoActual,
    efectivoMs: dur.efectivoMs, pausadoMs: dur.pausadoMs, transcurridoMs: dur.transcurridoMs,
    pausas: dur.pausas, abierta: dur.abierta, iniciadoAt: iniciadoActual, cerradoAt: cerradoActual,
    lastEventId: ev.id, actualizadoAt: registradoAt,
  });
  if (!dr.ok) return dr;
  void SESION_INICIADA; void SESION_PAUSADA; void SESION_REANUDADA;
  return ok(undefined);
}

/* ----------------------------- Handler wrapper --------------------------- */

export type ModoProyeccion = "aggregate" | "operacional" | "sesion";

/**
 * Crea el handler de proyección para un evento (aggregate, operacional o
 * sesión). Abre su propia UoW de sistema tenant-scoped y aplica idempotentemente.
 */
export function handlerProyeccion(adapters: ProyeccionAdapters, modo: ModoProyeccion | boolean) {
  const m: ModoProyeccion = modo === true ? "operacional" : modo === false ? "aggregate" : modo;
  return (deps: ServiceDeps) =>
    async (event: { id: string; payload: Record<string, unknown> }, eventType: string): Promise<Result<void, KernelError>> => {
      const tenantId = String(event.payload["tenantId"] ?? "");
      if (!tenantId) return ok(undefined);
      const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
      const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
      const applied = await uowPort.execute(ctx, (uow) =>
        m === "sesion"
          ? aplicarEventoSesion(adapters, uow, { ...event, type: eventType })
          : m === "operacional"
            ? aplicarEventoOperacional(adapters, uow, { ...event, type: eventType })
            : aplicarEventoAggregate(adapters, uow, { ...event, type: eventType }),
      );
      return applied.ok ? ok(undefined) : applied;
    };
}
