/**
 * DGP-013 · Hooks de consulta del módulo de Abastecimiento (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 * Reutiliza `useConsulta` del módulo de Órdenes (mismo contrato de estado async).
 */
import { abastecimientoFetch } from "./api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import type {
  ArticuloRow,
  CostosArticulo,
  ProveedorRow,
  SolicitudRow,
  CotizacionRow,
  OrdenCompraRow,
  RecepcionRow,
  EntradaHistorial,
  EventoAbastecimiento,
  OpcionCatalogo,
} from "./tipos";

export type { EstadoAsync } from "../ordenes/hooks";

/** Normaliza una colección: array plano u objeto envoltorio `{ <clave>: [] }`. */
function lista<T>(r: unknown, clave: string): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object" && Array.isArray((r as Record<string, unknown>)[clave])) {
    return (r as Record<string, T[]>)[clave]!;
  }
  return [];
}

/** Desenvuelve un recurso singular: `{ <clave>: {} }` o el objeto directo. */
function uno<T>(r: unknown, clave: string): T | null {
  if (!r || typeof r !== "object") return null;
  const env = (r as Record<string, unknown>)[clave];
  if (env && typeof env === "object") return env as T;
  return r as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const q = s.toString();
  return q ? `?${q}` : "";
}

/* ------------------------------- Artículos ------------------------------ */

export interface FiltroArticulos {
  tipo?: string;
  familia?: string;
  limit?: number;
}

export function useArticulos(filtro: FiltroArticulos = {}): EstadoAsync<ArticuloRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<ArticuloRow[]>(
    async (signal) => lista<ArticuloRow>(await abastecimientoFetch(`/articulos${query}`, { signal }), "articulos"),
    [query],
  );
}

export function useArticulo(id: string): EstadoAsync<ArticuloRow | null> {
  return useConsulta<ArticuloRow | null>(
    async (signal) => (id ? uno<ArticuloRow>(await abastecimientoFetch(`/articulos/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }), "articulo") : null),
    [id],
  );
}

export function useCostosArticulo(id: string): EstadoAsync<CostosArticulo | null> {
  return useConsulta<CostosArticulo | null>(
    async (signal) => (id ? abastecimientoFetch<CostosArticulo>(`/articulos/${encodeURIComponent(id)}/costos`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Artículos vinculados a un item de inventario (integración; filtra en cliente). */
export function useArticulosDeItem(itemId: string): EstadoAsync<ArticuloRow[]> {
  return useConsulta<ArticuloRow[]>(
    async (signal) => {
      if (!itemId) return [];
      const todos = lista<ArticuloRow>(await abastecimientoFetch(`/articulos`, { signal, toleraNoEncontrado: true }), "articulos");
      return todos.filter((a) => a.inventarioItemId === itemId);
    },
    [itemId],
  );
}

/* ------------------------------ Proveedores ----------------------------- */

export function useProveedores(filtro: { tipo?: string; limit?: number } = {}): EstadoAsync<ProveedorRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<ProveedorRow[]>(
    async (signal) => lista<ProveedorRow>(await abastecimientoFetch(`/proveedores${query}`, { signal }), "proveedores"),
    [query],
  );
}

export function useProveedor(id: string): EstadoAsync<ProveedorRow | null> {
  return useConsulta<ProveedorRow | null>(
    async (signal) => (id ? uno<ProveedorRow>(await abastecimientoFetch(`/proveedores/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }), "proveedor") : null),
    [id],
  );
}

/* ------------------------------ Solicitudes ----------------------------- */

export function useSolicitudes(filtro: { estado?: string; prioridad?: string; limit?: number } = {}): EstadoAsync<SolicitudRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<SolicitudRow[]>(
    async (signal) => lista<SolicitudRow>(await abastecimientoFetch(`/solicitudes${query}`, { signal }), "solicitudes"),
    [query],
  );
}

export function useSolicitud(id: string): EstadoAsync<SolicitudRow | null> {
  return useConsulta<SolicitudRow | null>(
    async (signal) => (id ? uno<SolicitudRow>(await abastecimientoFetch(`/solicitudes/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }), "solicitud") : null),
    [id],
  );
}

export function useCotizaciones(solicitudId: string): EstadoAsync<CotizacionRow[]> {
  return useConsulta<CotizacionRow[]>(
    async (signal) => (solicitudId ? lista<CotizacionRow>(await abastecimientoFetch(`/solicitudes/${encodeURIComponent(solicitudId)}/cotizaciones`, { signal, toleraNoEncontrado: true }), "cotizaciones") : []),
    [solicitudId],
  );
}

/* ---------------------------- Órdenes de compra ------------------------- */

export function useOrdenesCompra(filtro: { estado?: string; proveedorId?: string; limit?: number } = {}): EstadoAsync<OrdenCompraRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<OrdenCompraRow[]>(
    async (signal) => lista<OrdenCompraRow>(await abastecimientoFetch(`/ordenes-compra${query}`, { signal }), "ordenesCompra"),
    [query],
  );
}

export function useOrdenCompra(id: string): EstadoAsync<OrdenCompraRow | null> {
  return useConsulta<OrdenCompraRow | null>(
    async (signal) => (id ? uno<OrdenCompraRow>(await abastecimientoFetch(`/ordenes-compra/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }), "ordenCompra") : null),
    [id],
  );
}

export function useRecepciones(ordenCompraId: string): EstadoAsync<RecepcionRow[]> {
  return useConsulta<RecepcionRow[]>(
    async (signal) => (ordenCompraId ? lista<RecepcionRow>(await abastecimientoFetch(`/ordenes-compra/${encodeURIComponent(ordenCompraId)}/recepciones`, { signal, toleraNoEncontrado: true }), "recepciones") : []),
    [ordenCompraId],
  );
}

/* -------------------------------- Comunes ------------------------------- */

/** Catálogo del tenant (tipos, familias, unidades, monedas, prioridades…). */
export function useCatalogo(catalogo: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => lista<OpcionCatalogo>(await abastecimientoFetch(`/catalogos/${encodeURIComponent(catalogo)}`, { signal, toleraNoEncontrado: true }), "opciones"),
    [catalogo],
  );
}

/** Historial (bitácora) de una entidad por referencia (`entityRef`). */
export function useHistorial(entityRef: string): EstadoAsync<EntradaHistorial[]> {
  return useConsulta<EntradaHistorial[]>(
    async (signal) => (entityRef ? lista<EntradaHistorial>(await abastecimientoFetch(`/historial${qs({ entityRef })}`, { signal, toleraNoEncontrado: true }), "historial") : []),
    [entityRef],
  );
}

/** Flujo de eventos del módulo (event log) — opcionalmente filtrado en cliente. */
export function useEventos(): EstadoAsync<EventoAbastecimiento[]> {
  return useConsulta<EventoAbastecimiento[]>(
    async (signal) => lista<EventoAbastecimiento>(await abastecimientoFetch(`/eventos`, { signal, toleraNoEncontrado: true }), "eventos"),
    [],
  );
}
