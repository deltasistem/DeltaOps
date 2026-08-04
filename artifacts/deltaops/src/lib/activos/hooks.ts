/**
 * DGP-008.3 · Hooks de datos del módulo de Activos (React Query-free, ligeros).
 * Usan `activosFetch` con degradación elegante para endpoints opcionales.
 */
import { useCallback, useEffect, useState } from "react";
import { activosFetch, esFuncionNoDisponible } from "./api";
import type {
  ActivoRow,
  DetalleActivo,
  Adjunto,
  Comentario,
  EventoTimeline,
  NodoArbol,
  OpcionCatalogo,
  Relacion,
  CambioHistorico,
} from "./tipos";

export interface EstadoAsync<T> {
  datos: T | null;
  cargando: boolean;
  error: Error | null;
  recargar: () => void;
}

/** Hook genérico para una consulta GET con recarga. */
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
      .then((d) => {
        if (!ctrl.signal.aborted) setDatos(d);
      })
      .catch((e: Error) => {
        if (!ctrl.signal.aborted && e.name !== "AbortError") setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { datos, cargando, error, recargar };
}

export function useListado(filtros: Record<string, string | undefined>): EstadoAsync<ActivoRow[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
  const query = qs.toString();
  return useConsulta<ActivoRow[]>(
    (signal) => activosFetch<ActivoRow[]>(query ? `?${query}` : "", { signal }),
    [query],
  );
}

export function useDetalle(id: string): EstadoAsync<DetalleActivo> {
  return useConsulta<DetalleActivo>((signal) => activosFetch<DetalleActivo>(`/${id}`, { signal }), [id]);
}

export function useCatalogo(nombre: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    (signal) => activosFetch<OpcionCatalogo[]>(`/catalogos/${nombre}`, { signal }),
    [nombre],
  );
}

export function useTimeline(id: string, filtros: Record<string, string | undefined>): EstadoAsync<EventoTimeline[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, v);
  const query = qs.toString();
  return useConsulta<EventoTimeline[]>(
    (signal) => activosFetch<EventoTimeline[]>(`/${id}/timeline${query ? `?${query}` : ""}`, { signal }),
    [id, query],
  );
}

export function useComentarios(id: string): EstadoAsync<Comentario[]> {
  return useConsulta<Comentario[]>((signal) => activosFetch<Comentario[]>(`/${id}/comentarios`, { signal }), [id]);
}

export function useDocumentacion(id: string): EstadoAsync<Adjunto[]> {
  return useConsulta<Adjunto[]>((signal) => activosFetch<Adjunto[]>(`/${id}/documentacion`, { signal }), [id]);
}

export function useRelacionados(id: string, categoria?: string): EstadoAsync<Relacion[]> {
  const q = categoria ? `?categoria=${categoria}` : "";
  return useConsulta<Relacion[]>((signal) => activosFetch<Relacion[]>(`/${id}/relacionados${q}`, { signal }), [id, categoria ?? ""]);
}

export function useArbol(id: string): EstadoAsync<NodoArbol> {
  return useConsulta<NodoArbol>((signal) => activosFetch<NodoArbol>(`/${id}/arbol`, { signal }), [id]);
}

export function useComponentes(id: string): EstadoAsync<NodoArbol> {
  return useConsulta<NodoArbol>((signal) => activosFetch<NodoArbol>(`/${id}/componentes`, { signal }), [id]);
}

export function useHistoricoUbicaciones(id: string): EstadoAsync<CambioHistorico[]> {
  return useConsulta<CambioHistorico[]>((signal) => activosFetch<CambioHistorico[]>(`/${id}/historial/ubicaciones`, { signal }), [id]);
}

export function useHistoricoResponsables(id: string): EstadoAsync<CambioHistorico[]> {
  return useConsulta<CambioHistorico[]>((signal) => activosFetch<CambioHistorico[]>(`/${id}/historial/responsables`, { signal }), [id]);
}

/**
 * Filtro de búsqueda local (degradación cliente): coincide por nombre, código
 * o tipo (case-insensitive). Se usa cuando /busqueda no está desplegado.
 */
export function filtrarLocal(activos: ActivoRow[], termino: string): ActivoRow[] {
  const t = termino.trim().toLowerCase();
  if (t.length < 2) return activos;
  return activos.filter(
    (a) =>
      a.nombre.toLowerCase().includes(t) ||
      a.codigoEmpresarial.toLowerCase().includes(t) ||
      a.tipo.toLowerCase().includes(t),
  );
}

/**
 * Búsqueda rápida con degradación: usa /busqueda si existe; si responde 404
 * (feature no desplegada), devuelve `null` para que el llamador filtre en cliente.
 */
export async function buscar(q: string, signal?: AbortSignal): Promise<ActivoRow[] | null> {
  try {
    const r = await activosFetch<ActivoRow[]>(`/busqueda?q=${encodeURIComponent(q)}`, {
      signal,
      toleraNoEncontrado: true,
    });
    return r;
  } catch (e) {
    if (esFuncionNoDisponible(e)) return null;
    throw e;
  }
}
