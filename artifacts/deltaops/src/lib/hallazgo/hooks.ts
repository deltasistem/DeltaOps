/**
 * DELTAOPS LITE-05 §15 · Lectura del RESUMEN accionable de hallazgos por tenant.
 * El backend deriva los conteos por composición sobre fuentes reales (ejecuciones
 * preoperacionales selladas + generaciones + descartes); el cliente sólo los lee.
 */
import { useCallback, useEffect, useState } from "react";
import { hallazgoFetch } from "./api";
import type { ResumenHallazgos } from "./tipos";

export interface EstadoAsync<T> {
  datos: T | null;
  cargando: boolean;
  error: Error | null;
  recargar: () => void;
}

/**
 * Lee `/resumen`. `toleraNoAutorizado` evita que un 401 transitorio tras login
 * (cookie recién emitida) redirija en duro; la autoridad de sesión es la única
 * que redirige (misma lección que la Home / LITE-03).
 */
export function useResumenHallazgos(
  opts: { habilitado?: boolean } = {},
): EstadoAsync<ResumenHallazgos> {
  const habilitado = opts.habilitado ?? true;
  const toleraNoAutorizado = true;
  const [datos, setDatos] = useState<ResumenHallazgos | null>(null);
  const [cargando, setCargando] = useState(habilitado);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!habilitado) {
      setCargando(false);
      return;
    }
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    hallazgoFetch<ResumenHallazgos>("/resumen", { signal: ctrl.signal, toleraNoAutorizado })
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
  }, [habilitado, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { datos, cargando, error, recargar };
}
