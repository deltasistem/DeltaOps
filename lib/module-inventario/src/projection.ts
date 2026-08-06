/**
 * DGP-011.2 · Módulo Enterprise Inventory — PROYECCIÓN CQRS (payload-only).
 *
 * Funciones puras que transforman el PAYLOAD autosuficiente de cada evento en
 * filas de read model, aplicadas idempotentemente (por last_event_id / eventId).
 * Reutilizables tanto por los eventHandlers en vivo (outbox at-least-once) como
 * por la reproyección por replay desde la bitácora durable (`inv_eventos`) ⇒
 * equivalencia. NUNCA releen el aggregate. Mismo patrón que module-ordenes.
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
  AJUSTE_APLICADO,
  BODEGA_CREADA,
  CONTEO_FINALIZADO,
  CONTEO_INICIADO,
  ITEM_CREADO,
  ITEM_ELIMINADO,
  ITEM_MODIFICADO,
  LOTE_CREADO,
  MOVIMIENTO_REGISTRADO,
  RESERVA_CREADA,
  RESERVA_LIBERADA,
  SERIE_REGISTRADA,
  STOCK_ACTUALIZADO,
  TRANSFERENCIA_COMPLETADA,
  TRANSFERENCIA_CREADA,
  UBICACION_CREADA,
} from "./domain/events";
import type {
  ExistenciaReadRow,
  ItemReadRow,
  MovimientoReadRow,
  ProyRow,
  ProyTabla,
  ReadModelsStore,
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
const actualizadoAt = (p: Record<string, unknown>): Date =>
  new Date(String(p["actualizadoAt"] ?? p["registradoAt"] ?? new Date(0).toISOString()));
const valorDe = (v: unknown): string => {
  if (v && typeof v === "object" && "valor" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["valor"]);
  return String(v ?? "");
};

/* --------------------------- Aggregate read models ----------------------- */

function itemRow(ev: EventoLike): ItemReadRow {
  const p = ev.payload;
  const clas = (p["clasificacion"] as Record<string, unknown> | undefined) ?? {};
  return {
    tenantId: String(p["tenantId"]),
    id: String(p["id"]),
    codigo: valorDe(p["codigo"]),
    sku: valorDe(p["sku"]),
    nombre: String(p["nombre"] ?? ""),
    descripcion: s(p["descripcion"]),
    estado: String(p["estado"] ?? "activo"),
    tipoItem: String(clas["tipoItem"] ?? p["tipoItem"] ?? ""),
    categoria: s(clas["categoria"] ?? p["categoria"]),
    modoTrazabilidad: String(p["modoTrazabilidad"] ?? "ninguno"),
    eliminado: Boolean(p["eliminado"]) || ev.type === ITEM_ELIMINADO,
    datos: p,
    version: n(p["version"]) || 1,
    lastEventId: ev.id,
    actualizadoAt: actualizadoAt(p),
  };
}

function existenciaRow(ev: EventoLike): ExistenciaReadRow {
  const p = ev.payload;
  const stock = (p["stock"] as Record<string, unknown> | undefined) ?? {};
  return {
    tenantId: String(p["tenantId"]),
    id: String(p["id"]),
    itemId: String(p["itemId"] ?? ""),
    bodegaId: String(p["bodegaId"] ?? ""),
    ubicacionId: String(p["ubicacionId"] ?? ""),
    loteCodigo: s(p["loteCodigo"]),
    serieNumero: s(p["serieNumero"]),
    disponible: n(stock["disponible"]),
    reservado: n(stock["reservado"]),
    comprometido: n(stock["comprometido"]),
    enTransito: n(stock["enTransito"]),
    enInspeccion: n(stock["enInspeccion"]),
    bloqueado: n(stock["bloqueado"]),
    vencido: n(stock["vencido"]),
    total: n(p["total"]),
    datos: p,
    version: n(p["version"]) || 1,
    lastEventId: ev.id,
    actualizadoAt: actualizadoAt(p),
  };
}

function movimientoRow(ev: EventoLike): MovimientoReadRow {
  const p = ev.payload;
  return {
    tenantId: String(p["tenantId"]),
    eventId: ev.id,
    inventarioId: String(p["inventarioId"] ?? ""),
    itemId: s(p["itemId"]),
    tipo: String(p["tipo"] ?? ""),
    familia: s(p["familia"]),
    datos: p,
    registradoAt: new Date(String(p["registradoAt"] ?? p["actualizadoAt"] ?? new Date(0).toISOString())),
  };
}

function proyRow(ev: EventoLike, extra: Record<string, unknown>): ProyRow {
  const p = ev.payload;
  return {
    tenantId: String(p["tenantId"]),
    id: String(p["id"]),
    estado: String(p["estado"] ?? ""),
    datos: p,
    version: n(p["version"]) || 1,
    lastEventId: ev.id,
    actualizadoAt: actualizadoAt(p),
    ...extra,
  };
}

/* ------------------------------- Dispatch -------------------------------- */

/** Proyección del stream aggregate (items, existencias, movimientos, etc.). */
export async function aplicarEventoAggregate(
  adapters: ProyeccionAdapters,
  uow: UnitOfWork,
  ev: EventoLike,
): Promise<Result<void, KernelError>> {
  const p = ev.payload;
  const tenantId = String(p["tenantId"] ?? "");
  if (!tenantId) return ok(undefined);
  const rm = adapters.readModel;

  const aplicarProyTabla = async (tabla: ProyTabla, extra: Record<string, unknown> = {}) => {
    if (!p["id"]) return ok(undefined);
    const r = await rm.aplicarProy(uow, tabla, proyRow(ev, extra));
    return r.ok ? ok(undefined) : r;
  };

  switch (ev.type) {
    case ITEM_CREADO:
    case ITEM_MODIFICADO:
    case ITEM_ELIMINADO: {
      if (!p["id"]) return ok(undefined);
      const r = await rm.aplicarItem(uow, itemRow(ev));
      return r.ok ? ok(undefined) : r;
    }
    case STOCK_ACTUALIZADO: {
      if (!p["id"]) return ok(undefined);
      const r = await rm.aplicarExistencia(uow, existenciaRow(ev));
      return r.ok ? ok(undefined) : r;
    }
    case MOVIMIENTO_REGISTRADO: {
      if (!p["inventarioId"]) return ok(undefined);
      const r = await rm.aplicarMovimiento(uow, movimientoRow(ev));
      return r.ok ? ok(undefined) : r;
    }
    case RESERVA_CREADA:
    case RESERVA_LIBERADA:
      return aplicarProyTabla("inv_reservas_read", {
        itemId: s(p["itemId"]),
        tipo: s(p["tipo"]),
        demandaId: s((p["demanda"] as Record<string, unknown> | undefined)?.["id"]),
      });
    case TRANSFERENCIA_CREADA:
    case TRANSFERENCIA_COMPLETADA:
      return aplicarProyTabla("inv_transferencias_read");
    case CONTEO_INICIADO:
    case CONTEO_FINALIZADO:
      return aplicarProyTabla("inv_conteos_read", { tipo: s(p["tipo"]) });
    case AJUSTE_APLICADO:
      return aplicarProyTabla("inv_ajustes_read", { tipo: s(p["tipo"]) });
    case LOTE_CREADO:
      return aplicarProyTabla("inv_lotes_read", {
        itemId: s(p["itemId"]),
        codigo: s(p["codigo"]),
        vencimientoAt: (p["vencimiento"] as Record<string, unknown> | null)?.["fecha"]
          ? new Date(String((p["vencimiento"] as Record<string, unknown>)["fecha"]))
          : null,
      });
    case SERIE_REGISTRADA:
      return aplicarProyTabla("inv_series_read", { itemId: s(p["itemId"]), numero: s(p["numero"]), estado: s(p["estado"]) });
    case BODEGA_CREADA:
      return aplicarProyTabla("inv_bodegas_read", { nombre: s(p["nombre"]), tipo: s(p["tipo"]) });
    case UBICACION_CREADA:
      return aplicarProyTabla("inv_ubicaciones_read", { bodegaId: s(p["bodegaId"]), nivel: s(p["ruta"]) });
    default:
      return ok(undefined);
  }
}

/**
 * Proyección de eventos "operacionales". El inventario proyecta la totalidad de
 * su modelo por el stream aggregate; este dispatcher existe por simetría con el
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
