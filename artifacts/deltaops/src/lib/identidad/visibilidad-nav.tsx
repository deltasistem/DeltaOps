/**
 * DELTAOPS LITE-08 §21 · Preferencia de VISIBILIDAD de la navegación (cliente).
 *
 * Lee la preferencia del tenant (`GET /api/deltaops/visibilidad-nav`) para que el
 * shell OCULTE los grupos que el administrador decidió no mostrar. Visibilidad ≠
 * seguridad: si la lectura falla (401 transitorio / sin datos), NO se oculta
 * nada (fail-open de PRESENTACIÓN) y el backend sigue siendo la autoridad. La
 * escritura la hace el admin desde la superficie de configuración (`guardar`).
 */
import { useCallback, useEffect, useState } from "react";
import { identidadFetch } from "./api";

/** Respuesta del contrato de visibilidad. */
interface RespuestaVisibilidad {
  readonly ocultos: string[];
}

export interface EstadoVisibilidadNav {
  /** Claves de grupo de navegación OCULTAS por preferencia del tenant. */
  readonly ocultos: ReadonlySet<string>;
  readonly cargando: boolean;
  readonly error: Error | null;
  readonly recargar: () => void;
  /** Lista cruda (para la UI de configuración). */
  readonly lista: string[];
}

/**
 * Hook de preferencia de visibilidad por tenant. `tenantId` se usa sólo como
 * clave de recarga (el backend resuelve el tenant por sesión, jamás por HTTP).
 */
export function useVisibilidadNav(tenantId: string): EstadoVisibilidadNav {
  const [lista, setLista] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    identidadFetch<RespuestaVisibilidad>("/visibilidad-nav", { signal: ctrl.signal, toleraNoEncontrado: true })
      .then((r) => {
        if (ctrl.signal.aborted) return;
        setLista(Array.isArray(r?.ocultos) ? r.ocultos : []);
      })
      .catch((e: Error) => {
        // Fail-open de PRESENTACIÓN: un error de lectura no oculta el nav.
        if (!ctrl.signal.aborted && e.name !== "AbortError") {
          setError(e);
          setLista([]);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [tenantId, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { ocultos: new Set(lista), cargando, error, recargar, lista };
}

/** Guarda la preferencia de visibilidad (sólo admin; el backend lo verifica). */
export async function guardarVisibilidadNav(ocultos: string[]): Promise<void> {
  await identidadFetch("/visibilidad-nav", {
    method: "PUT",
    body: { ocultos, opId: nuevoOpId() },
  });
}

/** opId de idempotencia (mismo criterio que el resto de mutaciones). */
function nuevoOpId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `vis-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Catálogo de grupos configurables (etiqueta legible para la UI de admin). */
export const GRUPOS_CONFIGURABLES: readonly { clave: string; etiqueta: string }[] = [
  { clave: "mantenimiento", etiqueta: "Mantenimiento" },
  { clave: "equipos", etiqueta: "Equipos" },
  { clave: "preoperacional", etiqueta: "Preoperacional" },
  { clave: "inventario", etiqueta: "Inventario y abastecimiento" },
  { clave: "indicadores", etiqueta: "Indicadores" },
  { clave: "referencia", etiqueta: "Referencia" },
];
