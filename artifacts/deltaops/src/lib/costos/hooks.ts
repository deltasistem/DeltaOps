/**
 * DGP-021.3 · Hooks de LECTURA de la composición de costos (CQRS read side).
 * Cada hook envuelve un endpoint GET con recarga y cancelación. El frontend NO
 * recalcula totales ni estados: los consume DERIVADOS del backend.
 */
import { useCallback, useEffect, useState } from "react";
import { costosFetch } from "./api";
import type { PeriodoClave } from "./constantes";
import type {
  ComposicionOt,
  ComposicionActivo,
  ComparativaActivos,
  TendenciaActivo,
} from "./tipos";

export interface EstadoAsync<T> {
  datos: T | null;
  cargando: boolean;
  error: Error | null;
  recargar: () => void;
}

function useConsulta<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]): EstadoAsync<T> {
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

export interface FiltroPeriodo {
  readonly periodo?: PeriodoClave;
  readonly desde?: string;
  readonly hasta?: string;
}

function qs(f: FiltroPeriodo): string {
  const s = new URLSearchParams();
  if (f.periodo) s.set("periodo", f.periodo);
  if (f.periodo === "rango") {
    if (f.desde) s.set("desde", f.desde);
    if (f.hasta) s.set("hasta", f.hasta);
  }
  const q = s.toString();
  return q ? `?${q}` : "";
}

/** Composición de costos de una OT. `null` ordenId ⇒ no consulta. */
export function useComposicionOt(
  ordenId: string | null,
  filtro: FiltroPeriodo = {},
): EstadoAsync<ComposicionOt | null> {
  const query = qs(filtro);
  return useConsulta<ComposicionOt | null>(
    async (signal) => {
      if (!ordenId) return null;
      return (await costosFetch<ComposicionOt>(`/composicion/ot/${encodeURIComponent(ordenId)}${query}`, {
        signal,
        toleraNoEncontrado: true,
      })) ?? null;
    },
    [ordenId ?? "", query],
  );
}

/** Composición de costos de un activo. `null` activoId ⇒ no consulta. */
export function useComposicionActivo(
  activoId: string | null,
  filtro: FiltroPeriodo = {},
): EstadoAsync<ComposicionActivo | null> {
  const query = qs(filtro);
  return useConsulta<ComposicionActivo | null>(
    async (signal) => {
      if (!activoId) return null;
      return (await costosFetch<ComposicionActivo>(`/composicion/activo/${encodeURIComponent(activoId)}${query}`, {
        signal,
        toleraNoEncontrado: true,
      })) ?? null;
    },
    [activoId ?? "", query],
  );
}

/**
 * DGP-021.4 · Comparativa entre activos (§13). El backend devuelve SERIES POR MONEDA
 * (nunca ranking combinado). Lista vacía ⇒ no consulta.
 */
export function useComparativa(
  activoIds: readonly string[],
  filtro: FiltroPeriodo = {},
): EstadoAsync<ComparativaActivos | null> {
  const query = qs(filtro);
  const ids = activoIds.filter((x) => x.trim() !== "");
  const csv = ids.join(",");
  const sep = query ? "&" : "?";
  return useConsulta<ComparativaActivos | null>(
    async (signal) => {
      if (ids.length === 0) return null;
      return (await costosFetch<ComparativaActivos>(
        `/comparativa${query}${sep}activos=${encodeURIComponent(csv)}`,
        { signal },
      )) ?? null;
    },
    [csv, query],
  );
}

/** DGP-021.4 · Tendencia mensual de un activo (§14). `null` activoId ⇒ no consulta. */
export function useTendencia(
  activoId: string | null,
  filtro: FiltroPeriodo = {},
): EstadoAsync<TendenciaActivo | null> {
  const query = qs(filtro);
  return useConsulta<TendenciaActivo | null>(
    async (signal) => {
      if (!activoId) return null;
      return (await costosFetch<TendenciaActivo>(`/tendencia/activo/${encodeURIComponent(activoId)}${query}`, {
        signal,
        toleraNoEncontrado: true,
      })) ?? null;
    },
    [activoId ?? "", query],
  );
}
