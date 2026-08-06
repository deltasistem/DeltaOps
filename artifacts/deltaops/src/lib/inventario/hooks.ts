/**
 * DGP-011.3 · Hooks de consulta del módulo Inventario (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 * Reutiliza `useConsulta` del módulo de Órdenes (mismo contrato de estado async).
 */
import { inventarioFetch } from "./api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import type {
  ItemRow,
  ExistenciaRow,
  MovimientoRow,
  ReservaRow,
  TransferenciaRow,
  AjusteRow,
  ConteoRow,
  LoteRow,
  SerieRow,
  BodegaRow,
  UbicacionRow,
  OpcionCatalogo,
} from "./tipos";

export type { EstadoAsync } from "../ordenes/hooks";

/**
 * Normaliza la respuesta de una colección: acepta un array plano o un objeto
 * envoltorio `{ <clave>: [] }` (tolerancia de forma con el read model).
 */
function lista<T>(r: unknown, clave: string): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object" && Array.isArray((r as Record<string, unknown>)[clave])) {
    return (r as Record<string, T[]>)[clave]!;
  }
  return [];
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, String(v));
  }
  const q = s.toString();
  return q ? `?${q}` : "";
}

export interface FiltroItems {
  estado?: string;
  tipoItem?: string;
  categoria?: string;
  limit?: number;
}

/** Listado de items. */
export function useItems(filtro: FiltroItems = {}): EstadoAsync<ItemRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<ItemRow[]>(
    async (signal) => lista<ItemRow>(await inventarioFetch(query, { signal }), "items"),
    [query],
  );
}

/** Detalle de un item. */
export function useItem(id: string): EstadoAsync<ItemRow | null> {
  return useConsulta<ItemRow | null>(
    async (signal) => {
      if (!id) return null;
      const r = await inventarioFetch<{ item?: ItemRow } | ItemRow>(`/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { item?: ItemRow }).item ?? (r as ItemRow);
    },
    [id],
  );
}

/** Existencias de un item (por bodega/ubicación). */
export function useExistenciasItem(itemId: string): EstadoAsync<ExistenciaRow[]> {
  return useConsulta<ExistenciaRow[]>(
    async (signal) => {
      if (!itemId) return [];
      return lista<ExistenciaRow>(
        await inventarioFetch(`/items/${encodeURIComponent(itemId)}/existencias`, { signal, toleraNoEncontrado: true }),
        "existencias",
      );
    },
    [itemId],
  );
}

/** Movimientos de una existencia concreta. */
export function useMovimientosExistencia(existenciaId: string): EstadoAsync<MovimientoRow[]> {
  return useConsulta<MovimientoRow[]>(
    async (signal) => {
      if (!existenciaId) return [];
      return lista<MovimientoRow>(
        await inventarioFetch(`/existencias/${encodeURIComponent(existenciaId)}/movimientos`, { signal, toleraNoEncontrado: true }),
        "movimientos",
      );
    },
    [existenciaId],
  );
}

/** Lotes (filtrables por item). */
export function useLotes(itemId?: string): EstadoAsync<LoteRow[]> {
  const query = qs({ itemId });
  return useConsulta<LoteRow[]>(
    async (signal) => lista<LoteRow>(await inventarioFetch(`/lotes${query}`, { signal, toleraNoEncontrado: true }), "lotes"),
    [query],
  );
}

export function useLote(id: string): EstadoAsync<LoteRow | null> {
  return useConsulta<LoteRow | null>(
    async (signal) => (id ? inventarioFetch<LoteRow>(`/lotes/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Series (filtrables por item). */
export function useSeries(itemId?: string): EstadoAsync<SerieRow[]> {
  const query = qs({ itemId });
  return useConsulta<SerieRow[]>(
    async (signal) => lista<SerieRow>(await inventarioFetch(`/series${query}`, { signal, toleraNoEncontrado: true }), "series"),
    [query],
  );
}

export function useSerie(id: string): EstadoAsync<SerieRow | null> {
  return useConsulta<SerieRow | null>(
    async (signal) => (id ? inventarioFetch<SerieRow>(`/series/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Reservas (filtrables por item). */
export function useReservas(itemId?: string): EstadoAsync<ReservaRow[]> {
  const query = qs({ itemId });
  return useConsulta<ReservaRow[]>(
    async (signal) => lista<ReservaRow>(await inventarioFetch(`/reservas${query}`, { signal, toleraNoEncontrado: true }), "reservas"),
    [query],
  );
}

export function useReserva(id: string): EstadoAsync<ReservaRow | null> {
  return useConsulta<ReservaRow | null>(
    async (signal) => (id ? inventarioFetch<ReservaRow>(`/reservas/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Transferencias (filtrables por estado). */
export function useTransferencias(estado?: string): EstadoAsync<TransferenciaRow[]> {
  const query = qs({ estado });
  return useConsulta<TransferenciaRow[]>(
    async (signal) => lista<TransferenciaRow>(await inventarioFetch(`/transferencias${query}`, { signal, toleraNoEncontrado: true }), "transferencias"),
    [query],
  );
}

export function useTransferencia(id: string): EstadoAsync<TransferenciaRow | null> {
  return useConsulta<TransferenciaRow | null>(
    async (signal) => (id ? inventarioFetch<TransferenciaRow>(`/transferencias/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Ajustes (filtrables por item). */
export function useAjustes(itemId?: string): EstadoAsync<AjusteRow[]> {
  const query = qs({ itemId });
  return useConsulta<AjusteRow[]>(
    async (signal) => lista<AjusteRow>(await inventarioFetch(`/ajustes${query}`, { signal, toleraNoEncontrado: true }), "ajustes"),
    [query],
  );
}

export function useAjuste(id: string): EstadoAsync<AjusteRow | null> {
  return useConsulta<AjusteRow | null>(
    async (signal) => (id ? inventarioFetch<AjusteRow>(`/ajustes/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Conteos. */
export function useConteos(): EstadoAsync<ConteoRow[]> {
  return useConsulta<ConteoRow[]>(
    async (signal) => lista<ConteoRow>(await inventarioFetch(`/conteos`, { signal, toleraNoEncontrado: true }), "conteos"),
    [],
  );
}

export function useConteo(id: string): EstadoAsync<ConteoRow | null> {
  return useConsulta<ConteoRow | null>(
    async (signal) => (id ? inventarioFetch<ConteoRow>(`/conteos/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Bodegas (árbol/listado). */
export function useBodegas(): EstadoAsync<BodegaRow[]> {
  return useConsulta<BodegaRow[]>(
    async (signal) => lista<BodegaRow>(await inventarioFetch(`/bodegas`, { signal, toleraNoEncontrado: true }), "bodegas"),
    [],
  );
}

export function useBodega(id: string): EstadoAsync<BodegaRow | null> {
  return useConsulta<BodegaRow | null>(
    async (signal) => (id ? inventarioFetch<BodegaRow>(`/bodegas/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Ubicaciones (mapa jerárquico; filtrables por bodega). */
export function useUbicaciones(bodegaId?: string): EstadoAsync<UbicacionRow[]> {
  const query = qs({ bodegaId });
  return useConsulta<UbicacionRow[]>(
    async (signal) => lista<UbicacionRow>(await inventarioFetch(`/ubicaciones${query}`, { signal, toleraNoEncontrado: true }), "ubicaciones"),
    [query],
  );
}

/** Catálogo de opciones (para selects de Dynamic Forms). */
export function useCatalogo(catalogo: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => lista<OpcionCatalogo>(await inventarioFetch(`/catalogos/${encodeURIComponent(catalogo)}`, { signal, toleraNoEncontrado: true }), "opciones"),
    [catalogo],
  );
}
