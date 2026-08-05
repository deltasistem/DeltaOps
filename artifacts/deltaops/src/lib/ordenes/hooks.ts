/**
 * DGP-009.3 · Hooks de consulta del módulo de Órdenes (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 */
import { useCallback, useEffect, useState } from "react";
import { ordenesFetch } from "./api";
import type {
  OrdenRow,
  EntradaAgenda,
  Calendario,
  EventoHistorial,
  EntradaBitacora,
  DocumentoOrden,
  OpcionCatalogo,
  Asignacion,
  RelacionOrden,
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

export interface FiltroListado {
  estado?: string;
  tipo?: string;
  responsable?: string;
  activoPrincipalId?: string;
  limit?: number;
}

/** Listado de órdenes (GET /ordenes → {ordenes:[]}). */
export function useListado(filtro: FiltroListado): EstadoAsync<OrdenRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<OrdenRow[]>(
    async (signal) => {
      const r = await ordenesFetch<{ ordenes: OrdenRow[] }>(query, { signal });
      return r?.ordenes ?? [];
    },
    [query],
  );
}

/** Detalle de una orden (GET /:id → {orden}). */
export function useDetalle(id: string): EstadoAsync<OrdenRow> {
  return useConsulta<OrdenRow>(
    async (signal) => {
      const r = await ordenesFetch<{ orden: OrdenRow }>(`/${id}`, { signal });
      return r?.orden ?? null as never;
    },
    [id],
  );
}

/** Catálogo (GET /catalogos/:nombre). */
export function useCatalogo(nombre: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => (await ordenesFetch<OpcionCatalogo[]>(`/catalogos/${nombre}`, { signal, toleraNoEncontrado: true })) ?? [],
    [nombre],
  );
}

/** Agenda por rango (GET /agenda → {entradas:[]}). */
export function useAgenda(desde?: string, hasta?: string): EstadoAsync<EntradaAgenda[]> {
  const query = qs({ desde, hasta });
  return useConsulta<EntradaAgenda[]>(
    async (signal) => (await ordenesFetch<{ entradas: EntradaAgenda[] }>(`/agenda${query}`, { signal }))?.entradas ?? [],
    [query],
  );
}

/** Calendario por rango (GET /calendario → {dias:{}}). */
export function useCalendario(desde: string, hasta: string): EstadoAsync<Calendario> {
  const query = qs({ desde, hasta });
  return useConsulta<Calendario>(
    async (signal) => (await ordenesFetch<Calendario>(`/calendario${query}`, { signal })) ?? { dias: {} },
    [query],
  );
}

/** Historial de eventos (GET /:id/historial → {historial:[]}). */
export function useHistorial(id: string): EstadoAsync<EventoHistorial[]> {
  return useConsulta<EventoHistorial[]>(
    async (signal) => (await ordenesFetch<{ historial: EventoHistorial[] }>(`/${id}/historial`, { signal }))?.historial ?? [],
    [id],
  );
}

/** Bitácora operacional (GET /:id/bitacora → {bitacora:[]}). */
export function useBitacora(id: string): EstadoAsync<EntradaBitacora[]> {
  return useConsulta<EntradaBitacora[]>(
    async (signal) => (await ordenesFetch<{ bitacora: EntradaBitacora[] }>(`/${id}/bitacora`, { signal }))?.bitacora ?? [],
    [id],
  );
}

/** Documentación (GET /:id/documentacion). Normaliza array o {documentacion:[]}. */
export function useDocumentacion(id: string): EstadoAsync<DocumentoOrden[]> {
  return useConsulta<DocumentoOrden[]>(
    async (signal) => {
      const r = await ordenesFetch<{ documentacion?: DocumentoOrden[] } | DocumentoOrden[]>(`/${id}/documentacion`, { signal });
      if (Array.isArray(r)) return r;
      return r?.documentacion ?? [];
    },
    [id],
  );
}

/** Formularios asociados (GET /:id/formularios → {formularios:[]}). */
export function useFormularios(id: string): EstadoAsync<DocumentoOrden[]> {
  return useConsulta<DocumentoOrden[]>(
    async (signal) => {
      const r = await ordenesFetch<{ formularios?: DocumentoOrden[] } | DocumentoOrden[]>(`/${id}/formularios`, { signal, toleraNoEncontrado: true });
      if (Array.isArray(r)) return r;
      return r?.formularios ?? [];
    },
    [id],
  );
}

/** Checklists asociados (GET /:id/checklists → {checklists:[]}). */
export function useChecklists(id: string): EstadoAsync<DocumentoOrden[]> {
  return useConsulta<DocumentoOrden[]>(
    async (signal) => {
      const r = await ordenesFetch<{ checklists?: DocumentoOrden[] } | DocumentoOrden[]>(`/${id}/checklists`, { signal, toleraNoEncontrado: true });
      if (Array.isArray(r)) return r;
      return r?.checklists ?? [];
    },
    [id],
  );
}

/** Definición de una plantilla de Dynamic Forms asociada (clave+versión exacta). */
export interface PlantillaResuelta {
  clave: string;
  version: number;
  titulo: string;
  definicion: unknown | null;
}

/**
 * Carga la DEFINICIÓN de la plantilla asociada por clave+versión EXACTA desde el
 * runtime de Dynamic Forms (GET /:base/plantillas/:clave/:version). Permite
 * renderizar el formulario/checklist realmente asociado a la OT (no una
 * plantilla fija). Devuelve `null` mientras no haya `clave`/`version`.
 */
export function usePlantillaDefinicion(clave: string | null, version: number | null): EstadoAsync<PlantillaResuelta | null> {
  return useConsulta<PlantillaResuelta | null>(
    async (signal) => {
      if (!clave || !version) return null;
      return ordenesFetch<PlantillaResuelta>(`/plantillas/${encodeURIComponent(clave)}/${version}`, { signal, toleraNoEncontrado: true });
    },
    [clave, version],
  );
}

/** Dependencias OT↔OT (GET /:id/dependencias → {dependencias:[]}, categoría `orden`). */
export function useDependencias(id: string): EstadoAsync<RelacionOrden[]> {
  return useConsulta<RelacionOrden[]>(
    async (signal) => {
      if (!id) return [];
      const r = await ordenesFetch<{ dependencias?: RelacionOrden[] } | RelacionOrden[]>(`/${id}/dependencias`, { signal, toleraNoEncontrado: true });
      if (Array.isArray(r)) return r;
      return r?.dependencias ?? [];
    },
    [id],
  );
}

/** Relaciones de la OT (GET /:id/relaciones → {relaciones:[]}). */
export function useRelaciones(id: string, categoria?: string): EstadoAsync<RelacionOrden[]> {
  const query = qs({ categoria });
  return useConsulta<RelacionOrden[]>(
    async (signal) => {
      if (!id) return [];
      const r = await ordenesFetch<{ relaciones?: RelacionOrden[] } | RelacionOrden[]>(`/${id}/relaciones${query}`, { signal, toleraNoEncontrado: true });
      if (Array.isArray(r)) return r;
      return r?.relaciones ?? [];
    },
    [id, query],
  );
}

/** Asignaciones de recursos (GET /:id/asignaciones). */
export function useAsignaciones(id: string): EstadoAsync<Asignacion[]> {
  return useConsulta<Asignacion[]>(
    async (signal) => {
      const r = await ordenesFetch<{ asignaciones?: Asignacion[] } | Asignacion[]>(`/${id}/asignaciones`, { signal, toleraNoEncontrado: true });
      if (Array.isArray(r)) return r;
      return r?.asignaciones ?? [];
    },
    [id],
  );
}
