/**
 * DGP-013.2 · Módulo Enterprise Procurement — PROYECCIÓN CQRS (payload-only).
 *
 * Funciones puras que transforman el PAYLOAD autosuficiente de cada evento en
 * filas de read model, aplicadas idempotentemente (por last_event_id / version).
 * Reutilizables tanto por los eventHandlers en vivo (outbox at-least-once) como
 * por la reproyección por replay desde la bitácora durable (`abs_eventos`) ⇒
 * equivalencia. NUNCA releen el aggregate: el DETALLE se proyecta desde el
 * `snapshot` completo embebido en el payload (lección 009.2). Mismo patrón que
 * module-planes (DGP-012.2) / module-inventario (DGP-011.2).
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
  ARTICULO_ACTUALIZADO,
  ARTICULO_CREADO,
  COSTOS_ACTUALIZADOS,
  COTIZACION_REGISTRADA,
  COTIZACION_SELECCIONADA,
  HISTORIAL_REGISTRADO,
  ORDEN_COMPRA_APROBADA,
  ORDEN_COMPRA_CANCELADA,
  ORDEN_COMPRA_CREADA,
  ORDEN_COMPRA_ENVIADA,
  ORDEN_COMPRA_RECIBIDA_PARCIAL,
  ORDEN_COMPRA_RECIBIDA_TOTAL,
  PROVEEDOR_ACTUALIZADO,
  PROVEEDOR_CALIFICADO,
  PROVEEDOR_CREADO,
  RECEPCION_REGISTRADA,
  SOLICITUD_APROBADA,
  SOLICITUD_CERRADA,
  SOLICITUD_CREADA,
  SOLICITUD_ENVIADA,
  SOLICITUD_RECHAZADA,
} from "./domain/events";
import type {
  ArticuloReadRow,
  CostoReadRow,
  CotizacionReadRow,
  HistorialReadRow,
  OrdenCompraReadRow,
  ProveedorReadRow,
  ReadModelsStore,
  RecepcionReadRow,
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
const snapOf = (p: Record<string, unknown>): Record<string, unknown> => (p["snapshot"] as Record<string, unknown> | undefined) ?? {};
const datosDe = (p: Record<string, unknown>): Record<string, unknown> => { const snap = snapOf(p); return Object.keys(snap).length > 0 ? snap : p; };

const ARTICULO_EVENTS = new Set<string>([ARTICULO_CREADO, ARTICULO_ACTUALIZADO]);
const PROVEEDOR_EVENTS = new Set<string>([PROVEEDOR_CREADO, PROVEEDOR_ACTUALIZADO, PROVEEDOR_CALIFICADO]);
const SOLICITUD_EVENTS = new Set<string>([SOLICITUD_CREADA, SOLICITUD_ENVIADA, SOLICITUD_APROBADA, SOLICITUD_RECHAZADA, SOLICITUD_CERRADA]);
const ORDEN_EVENTS = new Set<string>([ORDEN_COMPRA_CREADA, ORDEN_COMPRA_APROBADA, ORDEN_COMPRA_ENVIADA, ORDEN_COMPRA_CANCELADA, ORDEN_COMPRA_RECIBIDA_PARCIAL, ORDEN_COMPRA_RECIBIDA_TOTAL]);

function articuloRow(ev: EventoLike): ArticuloReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    codigo: String(p["codigo"] ?? snap["codigo"] ?? ""), nombre: String(p["nombre"] ?? snap["nombre"] ?? ""),
    tipo: String(p["tipo"] ?? snap["tipo"] ?? ""), unidad: String(p["unidad"] ?? snap["unidad"] ?? ""),
    familia: s(snap["familia"] ?? p["familia"]),
    metodoValoracion: String(p["metodoValoracion"] ?? snap["metodoValoracion"] ?? ""),
    moneda: String((snap["costos"] as Record<string, unknown> | undefined)?.["moneda"] ?? p["moneda"] ?? ""),
    activo: (p["activo"] ?? snap["activo"]) === true,
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: new Date(String(p["actualizadoAt"] ?? snap["updatedAt"] ?? new Date(0).toISOString())),
  };
}

function proveedorRow(ev: EventoLike): ProveedorReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    codigo: String(p["codigo"] ?? snap["codigo"] ?? ""), razonSocial: String(p["nombre"] ?? snap["razonSocial"] ?? ""),
    tipo: String(p["tipo"] ?? snap["tipo"] ?? ""), calificacionPromedio: n(p["calificacionPromedio"] ?? snap["calificacionPromedio"]),
    activo: (p["activo"] ?? snap["activo"]) === true,
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: new Date(String(p["actualizadoAt"] ?? snap["updatedAt"] ?? new Date(0).toISOString())),
  };
}

function solicitudRow(ev: EventoLike): SolicitudReadRow {
  const p = ev.payload; const snap = snapOf(p);
  const origen = (snap["origen"] ?? p["origen"]) as Record<string, unknown> | undefined;
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    codigo: String(p["codigo"] ?? snap["codigo"] ?? ""), titulo: String(p["nombre"] ?? snap["titulo"] ?? ""),
    estado: String(p["estado"] ?? snap["estado"] ?? ""), prioridad: String(p["prioridad"] ?? snap["prioridad"] ?? ""),
    origenTipo: String(origen?.["tipo"] ?? ""),
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: new Date(String(p["actualizadoAt"] ?? snap["updatedAt"] ?? new Date(0).toISOString())),
  };
}

function cotizacionRow(ev: EventoLike): CotizacionReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    solicitudId: String(p["solicitudId"] ?? snap["solicitudId"] ?? ""), proveedorId: String(p["proveedorId"] ?? snap["proveedorId"] ?? ""),
    moneda: String(p["moneda"] ?? snap["moneda"] ?? ""), total: n(p["total"] ?? snap["total"]),
    plazoEntregaDias: n(snap["plazoEntregaDias"] ?? p["plazoEntregaDias"]), seleccionada: false,
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: new Date(String(p["actualizadoAt"] ?? snap["createdAt"] ?? new Date(0).toISOString())),
  };
}

function ordenRow(ev: EventoLike): OrdenCompraReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    codigo: String(p["codigo"] ?? snap["codigo"] ?? ""), proveedorId: String(p["proveedorId"] ?? snap["proveedorId"] ?? ""),
    solicitudId: s(snap["solicitudId"] ?? p["solicitudId"]), cotizacionId: s(snap["cotizacionId"] ?? p["cotizacionId"]),
    moneda: String(p["moneda"] ?? snap["moneda"] ?? ""), estado: String(p["estado"] ?? snap["estado"] ?? ""),
    total: n(p["total"] ?? snap["total"]),
    datos: datosDe(p), version: n(p["version"] ?? snap["version"]) || 1, lastEventId: ev.id,
    actualizadoAt: new Date(String(p["actualizadoAt"] ?? snap["updatedAt"] ?? new Date(0).toISOString())),
  };
}

function recepcionRow(ev: EventoLike): RecepcionReadRow {
  const p = ev.payload; const snap = snapOf(p);
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    ordenCompraId: String(p["ordenCompraId"] ?? snap["ordenCompraId"] ?? ""), consecutivo: n(p["consecutivo"] ?? snap["consecutivo"]),
    completaOrden: (p["completaOrden"] ?? snap["completaOrden"]) === true, conNovedades: (p["conNovedades"] ?? snap["conNovedades"]) === true,
    estadoOrden: s(p["estadoOrden"]),
    datos: datosDe(p), recibidoPor: String((snap["recibidoPor"] ?? p["actorId"]) ?? ""),
    recibidoEn: new Date(String(snap["recibidoEn"] ?? p["actualizadoAt"] ?? new Date(0).toISOString())),
    lastEventId: ev.id, registradoAt: new Date(String(p["actualizadoAt"] ?? snap["recibidoEn"] ?? new Date(0).toISOString())),
  };
}

function historialRow(ev: EventoLike): HistorialReadRow {
  const p = ev.payload;
  return {
    tenantId: String(p["tenantId"]), id: String(p["id"]),
    entityRef: String(p["entityRef"] ?? ""), hito: String(p["hito"] ?? ""), version: n(p["version"]),
    detalle: (p["detalle"] as Record<string, unknown> | undefined) ?? {}, actorId: String(p["actorId"] ?? ""),
    ocurridoAt: new Date(String(p["ocurridoEn"] ?? p["ocurridoAt"] ?? new Date(0).toISOString())), lastEventId: ev.id,
  };
}

function costoRows(ev: EventoLike): CostoReadRow[] {
  const p = ev.payload;
  const costos = (p["costos"] as Array<Record<string, unknown>> | undefined) ?? [];
  const ahora = new Date(String(p["actualizadoAt"] ?? new Date(0).toISOString()));
  return costos.map((c) => ({
    tenantId: String(p["tenantId"]), articuloId: String(c["articuloId"] ?? ""), moneda: String(c["moneda"] ?? ""),
    metodoValoracion: String(c["metodoValoracion"] ?? ""), costoUnitario: n(c["costoPromedio"]),
    cantidadAcumulada: n(c["cantidadValorizada"]),
    datos: { ultimoCosto: n(c["ultimoCosto"]), costoPromedio: n(c["costoPromedio"]), ordenCompraId: p["ordenCompraId"] ?? null, recepcionId: p["id"] ?? null },
    // La versión monotónica se ancla al minuto de la recepción para respetar el
    // guard (last_event_id, version); recepciones posteriores tienen mayor ts.
    version: Math.max(1, Math.floor(ahora.getTime() / 1000)), lastEventId: ev.id, actualizadoAt: ahora,
  }));
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
  if (!tenantId || !p["id"]) return ok(undefined);
  const rm = adapters.readModel;

  if (ARTICULO_EVENTS.has(ev.type)) { const r = await rm.aplicarArticulo(uow, articuloRow(ev)); return r.ok ? ok(undefined) : r; }
  if (PROVEEDOR_EVENTS.has(ev.type)) { const r = await rm.aplicarProveedor(uow, proveedorRow(ev)); return r.ok ? ok(undefined) : r; }
  if (SOLICITUD_EVENTS.has(ev.type)) { const r = await rm.aplicarSolicitud(uow, solicitudRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === COTIZACION_REGISTRADA) { const r = await rm.aplicarCotizacion(uow, cotizacionRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === COTIZACION_SELECCIONADA) {
    const r = await rm.marcarCotizacionSeleccionada(uow, tenantId, String(p["solicitudId"] ?? ""), String(p["id"]), ev.id);
    return r.ok ? ok(undefined) : r;
  }
  if (ORDEN_EVENTS.has(ev.type)) { const r = await rm.aplicarOrdenCompra(uow, ordenRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === RECEPCION_REGISTRADA) { const r = await rm.aplicarRecepcion(uow, recepcionRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === HISTORIAL_REGISTRADO) { const r = await rm.aplicarHistorial(uow, historialRow(ev)); return r.ok ? ok(undefined) : r; }
  if (ev.type === COSTOS_ACTUALIZADOS) {
    for (const row of costoRows(ev)) { if (!row.articuloId || !row.moneda) continue; const r = await rm.aplicarCosto(uow, row); if (!r.ok) return r; }
    return ok(undefined);
  }
  return ok(undefined);
}

/**
 * Proyección de eventos "operacionales". Abastecimiento proyecta la totalidad de
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
