/**
 * DGP-020.3 · Hooks de consulta del módulo Mano de Obra (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 * El frontend consume datos DERIVADOS del backend (tiempo/costo), nunca los
 * recalcula (§13/§20).
 */
import { useCallback, useEffect, useState } from "react";
import { mdoFetch } from "./api";
import { CATALOGO_CATEGORIAS } from "./constantes";
import type {
  OpcionesCatalogo,
  Recurso,
  Tarifa,
  Valoracion,
  Pendiente,
  CostoEstimado,
  Resumen,
} from "./tipos";

export interface EstadoAsync<T> {
  datos: T | null;
  cargando: boolean;
  error: Error | null;
  recargar: () => void;
}

/** Hook genérico para una consulta GET con recarga (mismo patrón que Órdenes). */
export function useConsulta<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
): EstadoAsync<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fn(ctrl.signal)
      .then((d) => { if (!ctrl.signal.aborted) setDatos(d); })
      .catch((e: Error) => { if (!ctrl.signal.aborted && e.name !== "AbortError") setError(e); })
      .finally(() => { if (!ctrl.signal.aborted) setCargando(false); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { datos, cargando, error, recargar };
}

function qs(params: Record<string, string | number | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, String(v));
  }
  const q = s.toString();
  return q ? `?${q}` : "";
}

/** Catálogo de categorías + unidades soportadas (vacío ⇒ canónicas por defecto). */
export function useCatalogoCategorias(): EstadoAsync<OpcionesCatalogo> {
  const query = qs({ catalogo: CATALOGO_CATEGORIAS });
  return useConsulta<OpcionesCatalogo>(
    async (signal) =>
      (await mdoFetch<OpcionesCatalogo>(`/catalogo${query}`, { signal, toleraNoEncontrado: true }))
      ?? { catalogo: CATALOGO_CATEGORIAS, opciones: [], unidades: ["HORA"] },
    [query],
  );
}

/** Recursos humanos (con nombre resuelto por Identidad). */
export function useRecursos(filtro: { categoriaClave?: string; estado?: string } = {}): EstadoAsync<Recurso[]> {
  const query = qs({ categoriaClave: filtro.categoriaClave, estado: filtro.estado });
  return useConsulta<Recurso[]>(
    async (signal) =>
      (await mdoFetch<{ recursos?: Recurso[] }>(`/recursos${query}`, { signal, toleraNoEncontrado: true }))?.recursos ?? [],
    [query],
  );
}

/** Tarifas de un sujeto (histórico versionado). */
export function useTarifas(
  filtro: { sujetoTipo?: string; sujetoId?: string; estado?: string } = {},
): EstadoAsync<Tarifa[]> {
  const query = qs({ sujetoTipo: filtro.sujetoTipo, sujetoId: filtro.sujetoId, estado: filtro.estado });
  return useConsulta<Tarifa[]>(
    async (signal) =>
      (await mdoFetch<{ tarifas?: Tarifa[] }>(`/tarifas${query}`, { signal, toleraNoEncontrado: true }))?.tarifas ?? [],
    [query],
  );
}

/** Valoraciones (por OT/activo/identidad/estado). */
export function useValoraciones(
  filtro: { ordenId?: string; activoId?: string; identityId?: string; estado?: string } = {},
): EstadoAsync<Valoracion[]> {
  const query = qs({
    ordenId: filtro.ordenId,
    activoId: filtro.activoId,
    identityId: filtro.identityId,
    estado: filtro.estado,
  });
  const tieneFiltro = Boolean(filtro.ordenId || filtro.activoId || filtro.identityId || filtro.estado);
  return useConsulta<Valoracion[]>(
    async (signal) => {
      if (!tieneFiltro) return [];
      return (await mdoFetch<{ valoraciones?: Valoracion[] }>(`/valoraciones${query}`, { signal, toleraNoEncontrado: true }))?.valoraciones ?? [];
    },
    [query],
  );
}

/** Sesiones cerradas sin valoración (red de seguridad). */
export function usePendientes(ordenId?: string): EstadoAsync<Pendiente[]> {
  const query = qs({ ordenId });
  return useConsulta<Pendiente[]>(
    async (signal) =>
      (await mdoFetch<{ pendientes?: Pendiente[] }>(`/valoraciones/pendientes${query}`, { signal, toleraNoEncontrado: true }))?.pendientes ?? [],
    [query],
  );
}

/** Mis valoraciones (identidad del contexto autenticado). Vista del técnico. */
export function useMiManoDeObra(): EstadoAsync<Valoracion[]> {
  return useConsulta<Valoracion[]>(
    async (signal) =>
      (await mdoFetch<{ valoraciones?: Valoracion[] }>(`/mias`, { signal, toleraNoEncontrado: true }))?.valoraciones ?? [],
    [],
  );
}

/** Resumen de mano de obra de una OT (agregado + pendientes). */
export function useResumenManoDeObra(ordenId: string | null): EstadoAsync<Resumen | null> {
  const query = qs({ ordenId: ordenId ?? undefined });
  return useConsulta<Resumen | null>(
    async (signal) => {
      if (!ordenId) return null;
      return (await mdoFetch<Resumen>(`/resumen${query}`, { signal, toleraNoEncontrado: true })) ?? null;
    },
    [ordenId ?? ""],
  );
}

/**
 * Costo ESTIMADO de una sesión en curso (tarifa vigente × tiempo actual). El
 * backend nunca devuelve $0 sin tarifa (marca `sinTarifa`). `null` sesionId ⇒
 * no consulta.
 */
export function useCostoEstimado(sesionId: string | null): EstadoAsync<CostoEstimado | null> {
  const query = qs({ sesionId: sesionId ?? undefined });
  return useConsulta<CostoEstimado | null>(
    async (signal) => {
      if (!sesionId) return null;
      return (await mdoFetch<CostoEstimado>(`/costo-estimado${query}`, { signal, toleraNoEncontrado: true })) ?? null;
    },
    [sesionId ?? ""],
  );
}
