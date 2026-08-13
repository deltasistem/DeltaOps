/**
 * DGP-019.1 · Módulo de Utilización — PROYECCIÓN CQRS (payload-only).
 *
 * Funciones puras: transforman el PAYLOAD autosuficiente de cada evento en filas
 * de read model, aplicadas idempotentemente (por last_event_id). Reutilizables
 * por los eventHandlers en vivo (outbox at-least-once) y por la reproyección
 * (replay desde `utl_eventos`). NUNCA releen el aggregate: proyectan desde el
 * `snapshot` completo embebido en el payload (lección 009.2).
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
  LECTURA_ANULADA,
  LECTURA_INCONSISTENTE,
  LECTURA_REGISTRADA,
  REINICIO_MEDIDOR,
  TANQUEO_ANULADO,
  TANQUEO_REGISTRADO,
} from "./domain/events";
import type { LecturaReadRow, ReadModelsStore, TanqueoReadRow } from "./infrastructure/operacional";

export interface ProyeccionAdapters {
  readonly readModel: ReadModelsStore;
}

export interface EventoLike {
  readonly id: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

const snapOf = (p: Record<string, unknown>): Record<string, unknown> => (p["snapshot"] as Record<string, unknown> | undefined) ?? p;
const fecha = (v: unknown, fallback = new Date(0).toISOString()): Date => new Date(String(v ?? fallback));

const LECTURA_EVENTS = new Set<string>([LECTURA_REGISTRADA, LECTURA_INCONSISTENTE, LECTURA_ANULADA, REINICIO_MEDIDOR]);
const TANQUEO_EVENTS = new Set<string>([TANQUEO_REGISTRADO, TANQUEO_ANULADO]);

function lecturaRow(ev: EventoLike): LecturaReadRow {
  const p = ev.payload;
  const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]),
    id: String(snap["id"] ?? p["id"]),
    activoId: String(snap["activoId"] ?? ""),
    tipoMedidor: String(snap["tipoMedidor"] ?? ""),
    valor: Number(snap["valor"] ?? 0),
    // DGP-021.4-A (ADITIVO): representación decimal EXACTA del valor. El snapshot
    // conserva el valor tal cual lo ingresó el comando; su String() es su decimal
    // canónico exacto (no se re-parsea a float). La columna DB `valor` es numeric
    // ⇒ persiste sin pérdida.
    valorExacto: String(snap["valor"] ?? 0),
    // Marca de ANCLA de tramo: se deriva del TIPO de evento, NUNCA de texto.
    esReinicio: ev.type === REINICIO_MEDIDOR,
    unidad: String(snap["unidad"] ?? ""),
    fechaHora: fecha(snap["fechaHora"]),
    identityId: String(snap["identityId"] ?? ""),
    origen: String(snap["origen"] ?? ""),
    estado: String(snap["estado"] ?? "vigente"),
    inconsistente: snap["inconsistente"] === true,
    sincronizacionActivo: String(snap["sincronizacionActivo"] ?? "pendiente"),
    datos: snap,
    lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["createdAt"] ?? snap["fechaHora"]),
  };
}

function tanqueoRow(ev: EventoLike): TanqueoReadRow {
  const p = ev.payload;
  const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]),
    id: String(snap["id"] ?? p["id"]),
    activoId: String(snap["activoId"] ?? ""),
    fechaHora: fecha(snap["fechaHora"]),
    litros: Number(snap["litros"] ?? 0),
    tipoCombustible: String(snap["tipoCombustible"] ?? ""),
    costoTotal: snap["costoTotal"] == null ? null : Number(snap["costoTotal"]),
    moneda: (snap["moneda"] as string | null) ?? null,
    estado: String(snap["estado"] ?? "vigente"),
    datos: snap,
    lastEventId: ev.id,
    actualizadoAt: fecha(p["actualizadoAt"] ?? snap["createdAt"] ?? snap["fechaHora"]),
  };
}

/** Proyección del stream aggregate (lecturas + tanqueos). */
export async function aplicarEventoAggregate(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const tenantId = String(p["tenantId"] ?? "");
  if (!tenantId) return ok(undefined);
  const rm = adapters.readModel;

  if (LECTURA_EVENTS.has(ev.type)) {
    const r = await rm.aplicarLectura(uow, lecturaRow(ev));
    return r.ok ? ok(undefined) : r;
  }
  if (TANQUEO_EVENTS.has(ev.type)) {
    const r = await rm.aplicarTanqueo(uow, tanqueoRow(ev));
    return r.ok ? ok(undefined) : r;
  }
  return ok(undefined);
}

export function handlerProyeccion(adapters: ProyeccionAdapters) {
  return (deps: ServiceDeps) =>
    async (event: { id: string; payload: Record<string, unknown> }, eventType: string): Promise<Result<void, KernelError>> => {
      const tenantId = String(event.payload["tenantId"] ?? "");
      if (!tenantId) return ok(undefined);
      const uowPort = deps.runtime.container.resolve(KernelTokens.unitOfWork);
      const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } });
      const applied = await uowPort.execute(ctx, (uow) => aplicarEventoAggregate(adapters, uow, { ...event, type: eventType }));
      return applied.ok ? ok(undefined) : applied;
    };
}
