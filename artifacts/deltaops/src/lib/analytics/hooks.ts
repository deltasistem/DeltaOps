/**
 * DGP-016 · Hooks de consulta del módulo Analytics (CQRS read side).
 *
 * Envuelven los endpoints del contrato con recarga/cancelación (reutilizan el
 * `useConsulta` común de Órdenes). Cada consulta cacheable persiste su última
 * respuesta con timestamp por tenant; sin red, se sirve del caché con aviso
 * honesto. La EVALUACIÓN de un indicador es una lectura pura (POST evaluar) que
 * también se cachea.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { analyticsFetch, esFalloDeRed } from "./api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import {
  CacheAnalytics,
  claveDashboard,
  claveEvaluacion,
  claveListado,
} from "./cache";
import { TENANT } from "./constantes";
import type {
  Dashboard,
  Evaluacion,
  Filtro,
  Indicador,
  OpcionCatalogo,
  Snapshot,
} from "./tipos";

export type { EstadoAsync } from "../ordenes/hooks";

/** Instancia de caché por tenant compartida en el módulo. */
export const cacheGlobal = new CacheAnalytics(TENANT);

function lista<T>(r: unknown, clave: string): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object" && Array.isArray((r as Record<string, unknown>)[clave])) {
    return (r as Record<string, T[]>)[clave]!;
  }
  return [];
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") s.set(k, String(v));
  }
  const q = s.toString();
  return q ? `?${q}` : "";
}

/**
 * Envuelve una consulta cacheable: intenta la red; ante fallo de red, sirve del
 * caché por tenant si existe (marcando `origenCache` + `guardadoEn`); si no hay
 * caché, re-lanza el error (la UI mostrará el estado honesto).
 */
function conCache<T>(
  cache: CacheAnalytics,
  claveLogica: string,
  fn: (signal: AbortSignal) => Promise<T>,
): (signal: AbortSignal) => Promise<T> {
  return async (signal) => {
    try {
      const dato = await fn(signal);
      cache.guardar(claveLogica, dato);
      return dato;
    } catch (e) {
      if (esFalloDeRed(e)) {
        const cacheado = cache.leer<T>(claveLogica);
        if (cacheado) return cacheado.dato;
      }
      throw e;
    }
  };
}

/** Metadatos de caché para un hook cacheado (timestamp si sirvió de caché). */
export interface EstadoConCache<T> extends EstadoAsync<T> {
  /** Timestamp del dato cacheado servido offline, o null si es dato fresco. */
  origenCache: string | null;
}

/* --------------------------- Listados / detalle ------------------------- */

export interface FiltroIndicadores {
  categoria?: string;
  habilitado?: boolean;
  delSistema?: boolean;
  limit?: number;
}

/** Listado de indicadores por categoría/estado (cacheable). */
export function useIndicadores(
  filtro: FiltroIndicadores = {},
  cache: CacheAnalytics = cacheGlobal,
): EstadoConCache<Indicador[]> {
  const query = qs({ ...filtro });
  const claveL = claveListado("indicadores", filtro as Record<string, unknown>);
  const estado = useConsulta<Indicador[]>(
    conCache(cache, claveL, async (signal) => lista<Indicador>(await analyticsFetch(`/indicadores${query}`, { signal }), "indicadores")),
    [query],
  );
  return anexarCache(estado, cache, claveL);
}

/** Detalle de un indicador (cacheable). */
export function useIndicador(clave: string, cache: CacheAnalytics = cacheGlobal): EstadoConCache<Indicador | null> {
  const claveL = `indicador:${clave}`;
  const estado = useConsulta<Indicador | null>(
    conCache(cache, claveL, async (signal) => {
      if (!clave) return null;
      return (await analyticsFetch<Indicador>(`/indicadores/${encodeURIComponent(clave)}`, { signal, toleraNoEncontrado: true })) ?? null;
    }),
    [clave],
  );
  return anexarCache(estado, cache, claveL);
}

export interface FiltroDashboards {
  delSistema?: boolean;
  propietarioId?: string;
  limit?: number;
}

/** Listado de dashboards (sistema y/o propios) (cacheable). */
export function useDashboards(
  filtro: FiltroDashboards = {},
  cache: CacheAnalytics = cacheGlobal,
): EstadoConCache<Dashboard[]> {
  const query = qs({ ...filtro });
  const claveL = claveListado("dashboards", filtro as Record<string, unknown>);
  const estado = useConsulta<Dashboard[]>(
    conCache(cache, claveL, async (signal) => lista<Dashboard>(await analyticsFetch(`/dashboards${query}`, { signal }), "dashboards")),
    [query],
  );
  return anexarCache(estado, cache, claveL);
}

/** Detalle de un dashboard por id (cacheable). */
export function useDashboard(id: string, cache: CacheAnalytics = cacheGlobal): EstadoConCache<Dashboard | null> {
  const claveL = claveDashboard(id);
  const estado = useConsulta<Dashboard | null>(
    conCache(cache, claveL, async (signal) => {
      if (!id) return null;
      return (await analyticsFetch<Dashboard>(`/dashboards/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true })) ?? null;
    }),
    [id],
  );
  return anexarCache(estado, cache, claveL);
}

/** Historial de snapshots de un indicador. */
export function useSnapshots(targetClave: string): EstadoAsync<Snapshot[]> {
  return useConsulta<Snapshot[]>(
    async (signal) =>
      targetClave
        ? lista<Snapshot>(await analyticsFetch(`/snapshots?targetClave=${encodeURIComponent(targetClave)}`, { signal, toleraNoEncontrado: true }), "snapshots")
        : [],
    [targetClave],
  );
}

/** Opciones de un catálogo del tenant (para poblar selectores de filtros). */
export function useCatalogo(catalogo: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => (catalogo ? lista<OpcionCatalogo>(await analyticsFetch(`/catalogos/${encodeURIComponent(catalogo)}`, { signal, toleraNoEncontrado: true }), "opciones") : []),
    [catalogo],
  );
}

/* ------------------------------ Evaluación ------------------------------ */

export interface EstadoEvaluacion {
  datos: Evaluacion | null;
  cargando: boolean;
  error: Error | null;
  /** Timestamp del dato cacheado servido offline (o null si es fresco). */
  origenCache: string | null;
  recargar: () => void;
}

/**
 * Evalúa un indicador (POST /indicadores/:clave/evaluar). Lectura pura; cachea
 * la última evaluación por tenant. Sin red, sirve del caché con timestamp.
 * `filtros` combina globales + del widget (ya en forma de contrato).
 */
export function useEvaluacion(
  clave: string,
  filtros: readonly Filtro[] = [],
  opciones: { periodo?: string; cache?: CacheAnalytics; habilitado?: boolean } = {},
): EstadoEvaluacion {
  const cache = opciones.cache ?? cacheGlobal;
  const habilitado = opciones.habilitado ?? true;
  const filtrosKey = JSON.stringify(filtros);
  const claveL = claveEvaluacion(clave, filtros as unknown[]);

  const [datos, setDatos] = useState<Evaluacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [origenCache, setOrigenCache] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const ejecutar = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (!clave || !habilitado) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    setOrigenCache(null);
    const cuerpo: Record<string, unknown> = { filtros };
    if (opciones.periodo) cuerpo.periodo = opciones.periodo;
    analyticsFetch<Evaluacion>(`/indicadores/${encodeURIComponent(clave)}/evaluar`, { method: "POST", body: cuerpo, signal: ctrl.signal })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        cache.guardar(claveL, d);
        setDatos(d);
        setOrigenCache(null);
      })
      .catch((e: Error) => {
        if (ctrl.signal.aborted || e.name === "AbortError") return;
        if (esFalloDeRed(e)) {
          const cacheado = cache.leer<Evaluacion>(claveL);
          if (cacheado) {
            setDatos(cacheado.dato);
            setOrigenCache(cacheado.guardadoEn);
            setError(null);
            setCargando(false);
            return;
          }
        }
        setError(e);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, filtrosKey, opciones.periodo, habilitado, tick]);

  useEffect(() => {
    ejecutar();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, filtrosKey, opciones.periodo, habilitado, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { datos, cargando, error, origenCache, recargar };
}

/* ------------------------------ Utilidades ------------------------------ */

function anexarCache<T>(estado: EstadoAsync<T>, cache: CacheAnalytics, claveLogica: string): EstadoConCache<T> {
  // Si hay datos pero no hay error y navigator está offline, marcamos el
  // timestamp del caché como aviso honesto.
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  let origenCache: string | null = null;
  if (offline && estado.datos != null) {
    const cacheado = cache.leer(claveLogica);
    origenCache = cacheado?.guardadoEn ?? null;
  }
  return { ...estado, origenCache };
}
