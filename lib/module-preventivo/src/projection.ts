/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — PROYECCIÓN CQRS (payload-only).
 *
 * Funciones puras que transforman el PAYLOAD autosuficiente de cada evento en
 * filas de read model, aplicadas idempotentemente (por last_event_id / version).
 * Reutilizables tanto por los eventHandlers en vivo (outbox at-least-once) como
 * por la reproyección por replay desde la bitácora durable (`prv_eventos`) ⇒
 * equivalencia. NUNCA releen el aggregate: el DETALLE se proyecta desde el
 * `snapshot` completo embebido en el payload (lección 009.2). Mismo patrón que
 * module-abastecimiento (DGP-013.2).
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
  ACTIVIDAD_ACTUALIZADA,
  ACTIVIDAD_CREADA,
  GENERACION_DECIDIDA,
  GENERACION_MATERIALIZADA,
  HISTORIAL_REGISTRADO,
  PROGRAMA_ACTUALIZADO,
  PROGRAMA_CREADO,
  PROGRAMA_REVERTIDO,
  PROGRAMA_TRANSICIONADO,
  PROGRAMA_VERSIONADO,
  PROGRAMACION_EXCLUIDA,
  PROGRAMACION_REPROGRAMADA,
  PROGRAMACION_SUSPENDIDA,
} from "./domain/events";
import type {
  ActividadReadRow,
  GeneracionReadRow,
  HistorialReadRow,
  ProgramaReadRow,
  ProgramaVersionReadRow,
  ProgramacionReadRow,
  ReadModelsStore,
  TipoProgramacion,
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
const snapOf = (p: Record<string, unknown>): Record<string, unknown> => (p["snapshot"] as Record<string, unknown> | undefined) ?? {};
const datosDe = (p: Record<string, unknown>): Record<string, unknown> => { const snap = snapOf(p); return Object.keys(snap).length > 0 ? snap : p; };
const fecha = (v: unknown, fallback = new Date(0).toISOString()): Date => new Date(String(v ?? fallback));

const PROGRAMA_EVENTS = new Set<string>([PROGRAMA_CREADO, PROGRAMA_ACTUALIZADO, PROGRAMA_TRANSICIONADO, PROGRAMA_VERSIONADO, PROGRAMA_REVERTIDO]);
const ACTIVIDAD_EVENTS = new Set<string>([ACTIVIDAD_CREADA, ACTIVIDAD_ACTUALIZADA]);
const GENERACION_EVENTS = new Set<string>([GENERACION_DECIDIDA, GENERACION_MATERIALIZADA]);
const PROGRAMACION_EVENTS = new Map<string, TipoProgramacion>([
  [PROGRAMACION_REPROGRAMADA, "reprogramacion"],
  [PROGRAMACION_SUSPENDIDA, "suspension"],
  [PROGRAMACION_EXCLUIDA, "exclusion"],
]);

function programaRow(ev: EventoLike): ProgramaReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    codigo: String(p["codigo"] ?? snap["codigo"] ?? ""), nombre: String(snap["nombre"] ?? p["nombre"] ?? ""),
    tipo: String(snap["tipo"] ?? p["tipo"] ?? ""), clasificacion: s(snap["clasificacion"] ?? p["clasificacion"]),
    padreId: s(snap["padreId"] ?? p["padreId"]),
    estado: String(p["estado"] ?? snap["estado"] ?? ""), versionPrograma: n(p["versionPrograma"] ?? snap["versionPrograma"]) || 1,
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["updatedAt"]),
  };
}

function versionRow(ev: EventoLike): ProgramaVersionReadRow | null {
  const p = ev.payload; const snap = snapOf(p);
  // Sólo VERSIONADO/REVERTIDO producen una versión histórica adicional.
  const versionAnterior = p["versionAnterior"];
  const snapAnterior = (p["snapshotAnterior"] as Record<string, unknown> | undefined) ?? undefined;
  if (versionAnterior == null || !snapAnterior) return null;
  return {
    tenantId: String(p["tenantId"]), programaId: String(p["id"]), versionPrograma: n(versionAnterior),
    datos: snapAnterior, lastEventId: ev.id, actualizadoAt: fecha(p["actualizadoAt"] ?? snap["updatedAt"]),
  };
}

function actividadRow(ev: EventoLike): ActividadReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    programaId: String(snap["programaId"] ?? p["programaId"] ?? ""), nombre: String(snap["nombre"] ?? p["nombre"] ?? ""),
    orden: n(snap["orden"] ?? p["orden"]), moneda: String(snap["moneda"] ?? p["moneda"] ?? ""),
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["updatedAt"]),
  };
}

function generacionRow(ev: EventoLike): GeneracionReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    programaId: String(snap["programaId"] ?? p["programaId"] ?? ""), actividadId: String(snap["actividadId"] ?? p["actividadId"] ?? ""),
    activoId: String(snap["activoId"] ?? p["activoId"] ?? ""), ventana: String(snap["ventana"] ?? p["ventana"] ?? ""),
    claveDedup: String(p["claveDedup"] ?? snap["claveDedup"] ?? ""), origen: String(snap["origen"] ?? p["origen"] ?? ""),
    fechaObjetivo: fecha(snap["fechaObjetivo"] ?? p["fechaObjetivo"]),
    ordenTrabajoId: s(p["ordenTrabajoId"] ?? snap["ordenTrabajoId"]), estado: String(p["estado"] ?? snap["estado"] ?? ""),
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["generadaEn"]),
  };
}

function programacionRow(ev: EventoLike, tipo: TipoProgramacion): ProgramacionReadRow {
  const p = ev.payload;
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]), tipo,
    programaId: s(p["programaId"]), actividadId: s(p["actividadId"]), activoId: s(p["activoId"]),
    ventana: s(p["ventana"]), motivo: s(p["motivo"]),
    desde: p["desde"] != null ? fecha(p["desde"]) : null, hasta: p["hasta"] != null ? fecha(p["hasta"]) : null,
    datos: p, lastEventId: ev.id, ocurridoAt: fecha(p["actualizadoAt"] ?? p["ocurridoEn"]),
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

  if (PROGRAMA_EVENTS.has(ev.type)) {
    const r = await rm.aplicarPrograma(uow, programaRow(ev));
    if (!r.ok) return r;
    const vr = versionRow(ev);
    if (vr) { const rv = await rm.aplicarVersion(uow, vr); if (!rv.ok) return rv; }
    return ok(undefined);
  }
  if (ACTIVIDAD_EVENTS.has(ev.type)) { const r = await rm.aplicarActividad(uow, actividadRow(ev)); return r.ok ? ok(undefined) : r; }
  if (GENERACION_EVENTS.has(ev.type)) { const r = await rm.aplicarGeneracion(uow, generacionRow(ev)); return r.ok ? ok(undefined) : r; }
  const tipoProg = PROGRAMACION_EVENTS.get(ev.type);
  if (tipoProg) { const r = await rm.aplicarProgramacion(uow, programacionRow(ev, tipoProg)); return r.ok ? ok(undefined) : r; }
  if (ev.type === HISTORIAL_REGISTRADO) { const r = await rm.aplicarHistorial(uow, historialRow(ev)); return r.ok ? ok(undefined) : r; }
  return ok(undefined);
}

/**
 * Proyección de eventos "operacionales". Preventivo proyecta la totalidad de su
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
