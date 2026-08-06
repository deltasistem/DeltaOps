/**
 * DGP-012.2 · Módulo Enterprise Maintenance Plans — PROYECCIÓN CQRS (payload-only).
 *
 * Funciones puras que transforman el PAYLOAD autosuficiente de cada evento en
 * filas de read model, aplicadas idempotentemente (por last_event_id / eventId).
 * Reutilizables tanto por los eventHandlers en vivo (outbox at-least-once) como
 * por la reproyección por replay desde la bitácora durable (`pln_eventos`) ⇒
 * equivalencia. NUNCA releen el aggregate: el DETALLE del plan se proyecta desde
 * el `snapshot` completo embebido en el payload (lección 009.2). Mismo patrón
 * que module-inventario (DGP-011.2).
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
  CALENDARIO_CREADO,
  HISTORIAL_REGISTRADO,
  ORDEN_GENERADA,
  ORDEN_MATERIALIZADA,
  PLAN_ACTUALIZADO,
  PLAN_ARCHIVADO,
  PLAN_CREADO,
  PLAN_EJECUTADO,
  PLAN_PUBLICADO,
  PLAN_REANUDADO,
  PLAN_SUSPENDIDO,
} from "./domain/events";
import type { CalendarioReadRow, GeneracionReadRow, HistorialReadRow, PlanReadRow, ReadModelsStore } from "./infrastructure/operacional";

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

const PLAN_EVENTS = new Set<string>([
  PLAN_CREADO, PLAN_ACTUALIZADO, PLAN_PUBLICADO, PLAN_SUSPENDIDO, PLAN_REANUDADO, PLAN_ARCHIVADO, PLAN_EJECUTADO,
]);

function planRow(ev: EventoLike): PlanReadRow {
  const p = ev.payload;
  const snap = (p["snapshot"] as Record<string, unknown> | undefined) ?? {};
  const datos = Object.keys(snap).length > 0 ? snap : p;
  return {
    tenantId: String(p["tenantId"]),
    id: String(p["id"]),
    codigo: String(p["codigo"] ?? snap["codigo"] ?? ""),
    nombre: String(p["nombre"] ?? snap["nombre"] ?? ""),
    descripcion: s(p["descripcion"] ?? snap["descripcion"]),
    estado: String(p["estado"] ?? snap["estado"] ?? ""),
    tipoPlan: String(p["tipoPlan"] ?? snap["tipoPlan"] ?? ""),
    estrategia: String(p["estrategia"] ?? snap["estrategia"] ?? ""),
    prioridad: String(p["prioridad"] ?? snap["prioridad"] ?? ""),
    versionActiva: n(p["versionActiva"] ?? snap["versionActiva"]),
    datos,
    version: n(p["version"] ?? snap["version"]) || 1,
    lastEventId: ev.id,
    actualizadoAt: new Date(String(p["actualizadoAt"] ?? snap["updatedAt"] ?? new Date(0).toISOString())),
  };
}

function generacionRow(ev: EventoLike): GeneracionReadRow {
  const p = ev.payload;
  return {
    tenantId: String(p["tenantId"]),
    id: String(p["id"]),
    planId: String(p["planId"] ?? ""),
    version: n(p["version"]),
    activoId: String(p["activoId"] ?? ""),
    ocurrencia: String(p["ocurrencia"] ?? ""),
    claveDedup: String(p["claveDedup"] ?? ""),
    origen: String(p["origen"] ?? ""),
    ordenTrabajoId: s(p["ordenTrabajoId"]),
    fechaObjetivo: new Date(String(p["fechaObjetivo"] ?? new Date(0).toISOString())),
    datos: p,
    lastEventId: ev.id,
    registradoAt: new Date(String(p["generadaEn"] ?? p["actualizadoAt"] ?? new Date(0).toISOString())),
  };
}

function calendarioRow(ev: EventoLike): CalendarioReadRow {
  const p = ev.payload;
  const snap = (p["snapshot"] as Record<string, unknown> | undefined) ?? {};
  const datos = Object.keys(snap).length > 0 ? snap : p;
  return {
    tenantId: String(p["tenantId"]),
    id: String(p["id"]),
    tipo: String(p["tipo"] ?? snap["tipo"] ?? ""),
    ambito: String(p["ambito"] ?? snap["ambito"] ?? ""),
    nombre: String(p["nombre"] ?? snap["nombre"] ?? ""),
    datos,
    version: n(p["version"] ?? snap["version"]) || 1,
    lastEventId: ev.id,
    actualizadoAt: new Date(String(p["actualizadoAt"] ?? p["creadoEn"] ?? new Date(0).toISOString())),
  };
}

function historialRow(ev: EventoLike): HistorialReadRow {
  const p = ev.payload;
  return {
    tenantId: String(p["tenantId"]),
    id: String(p["id"]),
    planId: String(p["planId"] ?? ""),
    hito: String(p["hito"] ?? ""),
    version: n(p["version"]),
    detalle: (p["detalle"] as Record<string, unknown> | undefined) ?? {},
    actorId: String(p["actorId"] ?? ""),
    ocurridoAt: new Date(String(p["ocurridoEn"] ?? p["ocurridoAt"] ?? new Date(0).toISOString())),
    lastEventId: ev.id,
  };
}

/* ------------------------------- Dispatch -------------------------------- */

/** Proyección del stream aggregate (planes + generaciones de órdenes). */
export async function aplicarEventoAggregate(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const tenantId = String(p["tenantId"] ?? "");
  if (!tenantId || !p["id"]) return ok(undefined);
  const rm = adapters.readModel;

  if (PLAN_EVENTS.has(ev.type)) {
    const r = await rm.aplicarPlan(uow, planRow(ev));
    return r.ok ? ok(undefined) : r;
  }
  if (ev.type === ORDEN_GENERADA || ev.type === ORDEN_MATERIALIZADA) {
    const r = await rm.aplicarGeneracion(uow, generacionRow(ev));
    return r.ok ? ok(undefined) : r;
  }
  if (ev.type === CALENDARIO_CREADO) {
    const r = await rm.aplicarCalendario(uow, calendarioRow(ev));
    return r.ok ? ok(undefined) : r;
  }
  if (ev.type === HISTORIAL_REGISTRADO) {
    const r = await rm.aplicarHistorial(uow, historialRow(ev));
    return r.ok ? ok(undefined) : r;
  }
  return ok(undefined);
}

/**
 * Proyección de eventos "operacionales". Planes proyecta la totalidad de su
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
