/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — PROYECCIÓN CQRS (payload-only).
 *
 * Funciones puras que transforman el PAYLOAD autosuficiente de cada evento en
 * filas de read model, aplicadas idempotentemente (por last_event_id / version).
 * Reutilizables tanto por los eventHandlers en vivo (outbox at-least-once) como
 * por la reproyección por replay desde la bitácora durable (`cor_eventos`) ⇒
 * equivalencia. NUNCA releen el aggregate: el DETALLE se proyecta desde el
 * `snapshot` completo embebido en el payload (lección 009.2). Mismo patrón que
 * module-preventivo (DGP-014).
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
import {
  COMPRA_SOLICITADA,
  DIAGNOSTICO_REGISTRADO,
  EVENTO_ACTIVO_REGISTRADO,
  HISTORIAL_REGISTRADO,
  INTERVENCION_ASIGNADA,
  INTERVENCION_CREADA,
  INTERVENCION_TRANSICIONADA,
  INVENTARIO_CONSUMIDO,
  INVENTARIO_DEVUELTO,
  ORDEN_DECIDIDA,
  ORDEN_MATERIALIZADA,
  REINCIDENCIA_DETECTADA,
  REPUESTOS_RESERVADOS,
  SOLICITUD_ACTUALIZADA,
  SOLICITUD_COMENTARIO_REGISTRADO,
  SOLICITUD_CREADA,
  SOLICITUD_EVIDENCIA_ADJUNTADA,
  SOLICITUD_TRANSICIONADA,
} from "./domain/events";
import type {
  ConsumoReadRow,
  DiagnosticoReadRow,
  EventoActivoReadRow,
  GeneracionReadRow,
  HistorialReadRow,
  IntervencionReadRow,
  ReadModelsStore,
  SolicitudReadRow,
} from "./infrastructure/operacional";

export interface ProyeccionAdapters {
  readonly readModel: ReadModelsStore;
}

export interface EventoLike {
  readonly id: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

const s = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number => Number(v ?? 0);
const b = (v: unknown): boolean => v === true;
const snapOf = (p: Record<string, unknown>): Record<string, unknown> => (p["snapshot"] as Record<string, unknown> | undefined) ?? {};
const datosDe = (p: Record<string, unknown>): Record<string, unknown> => { const snap = snapOf(p); return Object.keys(snap).length > 0 ? snap : p; };
const fecha = (v: unknown, fallback = new Date(0).toISOString()): Date => new Date(String(v ?? fallback));

const SOLICITUD_EVENTS = new Set<string>([SOLICITUD_CREADA, SOLICITUD_ACTUALIZADA, SOLICITUD_TRANSICIONADA, SOLICITUD_EVIDENCIA_ADJUNTADA, SOLICITUD_COMENTARIO_REGISTRADO]);
const INTERVENCION_EVENTS = new Set<string>([INTERVENCION_CREADA, INTERVENCION_TRANSICIONADA, INTERVENCION_ASIGNADA]);
const GENERACION_EVENTS = new Set<string>([ORDEN_DECIDIDA, ORDEN_MATERIALIZADA]);
const CONSUMO_EVENTS = new Set<string>([INVENTARIO_CONSUMIDO, INVENTARIO_DEVUELTO, REPUESTOS_RESERVADOS, COMPRA_SOLICITADA]);

function solicitudRow(ev: EventoLike): SolicitudReadRow {
  const p = ev.payload; const snap = snapOf(p);
  const objeto = (snap["objeto"] as Record<string, unknown> | undefined) ?? {};
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    codigo: String(p["codigo"] ?? snap["codigo"] ?? ""), titulo: String(p["titulo"] ?? snap["titulo"] ?? ""),
    origen: String(p["origen"] ?? snap["origen"] ?? ""), activoId: s(p["activoId"] ?? objeto["activoId"]),
    prioridad: String(p["prioridad"] ?? snap["prioridad"] ?? ""), criticidad: s(snap["criticidad"] ?? p["criticidad"]),
    estado: String(p["estado"] ?? snap["estado"] ?? ""), diagnosticoId: s(snap["diagnosticoId"] ?? p["diagnosticoId"]),
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["updatedAt"]),
  };
}

function diagnosticoRow(ev: EventoLike): DiagnosticoReadRow {
  const p = ev.payload; const snap = snapOf(p);
  const plantilla = (snap["plantilla"] as Record<string, unknown> | undefined) ?? {};
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    solicitudId: String(p["solicitudId"] ?? snap["solicitudId"] ?? ""),
    plantillaId: String(p["plantillaId"] ?? plantilla["plantillaId"] ?? ""),
    plantillaVersion: n(p["plantillaVersion"] ?? plantilla["version"]) || 1,
    causaRaiz: s(p["causaRaiz"] ?? snap["causaRaiz"]),
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["registradoEn"]),
  };
}

function intervencionRow(ev: EventoLike): IntervencionReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    solicitudId: String(p["solicitudId"] ?? snap["solicitudId"] ?? ""), ordenTrabajoId: String(p["ordenTrabajoId"] ?? snap["ordenTrabajoId"] ?? ""),
    activoId: String(p["activoId"] ?? snap["activoId"] ?? ""), mayor: b(p["mayor"] ?? snap["mayor"]),
    estado: String(p["estado"] ?? snap["estado"] ?? ""), datos: datosDe(p),
    version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["updatedAt"]),
  };
}

function generacionRow(ev: EventoLike): GeneracionReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    solicitudId: String(p["solicitudId"] ?? snap["solicitudId"] ?? ""), activoId: String(p["activoId"] ?? snap["activoId"] ?? ""),
    claveDedup: String(p["claveDedup"] ?? snap["claveDedup"] ?? ""), ordenTrabajoId: s(p["ordenTrabajoId"] ?? snap["ordenTrabajoId"]),
    estado: String(p["estado"] ?? snap["estado"] ?? ""), datos: datosDe(p),
    version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["generadaEn"]),
  };
}

function eventoActivoRow(ev: EventoLike): EventoActivoReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    activoId: String(p["activoId"] ?? snap["activoId"] ?? ""), solicitudId: s(snap["solicitudId"] ?? p["solicitudId"]),
    ordenTrabajoId: s(snap["ordenTrabajoId"] ?? p["ordenTrabajoId"]), tipo: String(p["tipo"] ?? snap["tipo"] ?? ""),
    modoFalla: s(p["modoFalla"] ?? snap["modoFalla"]),
    // REINCIDENCIA_DETECTADA marca reincidente; el registro de evento base no.
    reincidente: ev.type === REINCIDENCIA_DETECTADA || b(p["reincidente"]),
    datos: datosDe(p), ocurridoAt: fecha(p["ocurridoEn"] ?? p["actualizadoAt"] ?? snap["ocurridoEn"]), lastEventId: ev.id,
  };
}

function consumoRow(ev: EventoLike): ConsumoReadRow {
  const p = ev.payload;
  const tipo =
    ev.type === INVENTARIO_CONSUMIDO ? "consumo" :
    ev.type === INVENTARIO_DEVUELTO ? "devolucion" :
    ev.type === REPUESTOS_RESERVADOS ? "reserva" : "compra";
  // El id del renglón de consumo es el id del evento durable (append-only, único
  // por tenant); `id` del payload es la intervención (agrupador).
  const cantidad = p["cantidadConsumida"] ?? p["cantidad"] ?? null;
  return {
    tenantId: String(p["tenantId"]), id: ev.id,
    intervencionId: s(p["intervencionId"] ?? p["id"]), ordenTrabajoId: s(p["ordenTrabajoId"]),
    tipo, inventarioId: s(p["inventarioId"]), articuloId: s(p["articuloId"]),
    cantidad: cantidad != null ? Number(cantidad) : null, unidad: s(p["unidad"]),
    datos: p, ocurridoAt: fecha(p["actualizadoAt"] ?? p["ocurridoEn"]), lastEventId: ev.id,
  };
}

function historialRow(ev: EventoLike): HistorialReadRow {
  const p = ev.payload;
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    entityRef: String(p["entityRef"] ?? ""), hito: String(p["hito"] ?? ""), version: n(p["version"]),
    detalle: (p["detalle"] as Record<string, unknown> | undefined) ?? {}, actorId: String(p["actorId"] ?? ""),
    ocurridoAt: fecha(p["ocurridoEn"] ?? p["ocurridoAt"]), lastEventId: ev.id,
  };
}

/* ------------------------------- Dispatch -------------------------------- */

/** Proyección del stream aggregate (todas las entidades del módulo). */
export async function aplicarEventoAggregate(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const tenantId = String(p["tenantId"] ?? "");
  if (!tenantId || p["id"] == null) return ok(undefined);
  const rm = adapters.readModel;

  if (SOLICITUD_EVENTS.has(ev.type)) { const r = await rm.aplicarSolicitud(uow, solicitudRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === DIAGNOSTICO_REGISTRADO) { const r = await rm.aplicarDiagnostico(uow, diagnosticoRow(ev)); return r.ok ? ok(undefined) : r; }
  if (INTERVENCION_EVENTS.has(ev.type)) { const r = await rm.aplicarIntervencion(uow, intervencionRow(ev)); return r.ok ? ok(undefined) : r; }
  if (GENERACION_EVENTS.has(ev.type)) { const r = await rm.aplicarGeneracion(uow, generacionRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === EVENTO_ACTIVO_REGISTRADO || ev.type === REINCIDENCIA_DETECTADA) { const r = await rm.aplicarEventoActivo(uow, eventoActivoRow(ev)); return r.ok ? ok(undefined) : r; }
  if (CONSUMO_EVENTS.has(ev.type)) { const r = await rm.aplicarConsumo(uow, consumoRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === HISTORIAL_REGISTRADO) { const r = await rm.aplicarHistorial(uow, historialRow(ev)); return r.ok ? ok(undefined) : r; }
  return ok(undefined);
}

/**
 * Proyección de eventos "operacionales". Correctivo proyecta la totalidad de su
 * modelo por el stream aggregate; este dispatcher existe por simetría con el
 * patrón (segundo handler) y queda como no-op salvo evolución futura.
 */
export async function aplicarEventoOperacional(
  _adapters: ProyeccionAdapters,
  _uow: UnitOfWork,
  _ev: EventoLike,
): Promise<Result<void, KernelError>> {
  return ok(undefined);
}

/* ----------------------------- Handler wrapper --------------------------- */

export function handlerProyeccion(adapters: ProyeccionAdapters, esOperacional: boolean) {
  return (deps: ServiceDeps) =>
    async (event: { id: string; payload: Record<string, unknown> }, eventType: string): Promise<Result<void, KernelError>> => {
      const tenantId = String(event.payload["tenantId"] ?? "");
      if (!tenantId) return ok(undefined);
      const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
      const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
      const applied = await uowPort.execute(ctx, (uow) =>
        esOperacional
          ? aplicarEventoOperacional(adapters, uow, { ...event, type: eventType })
          : aplicarEventoAggregate(adapters, uow, { ...event, type: eventType }),
      );
      return applied.ok ? ok(undefined) : applied;
    };
}
