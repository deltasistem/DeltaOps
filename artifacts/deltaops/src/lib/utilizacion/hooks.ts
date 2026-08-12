/**
 * DGP-019.1 · Hooks de consulta del módulo Utilización (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 * Reutiliza `useConsulta` del módulo de Órdenes (mismo contrato de estado async),
 * idéntico al patrón de Correctivo. Las respuestas GET son opacas en el contrato:
 * se normalizan de forma tolerante (array plano o `{ <clave>: [] }`).
 */
import { utilizacionFetch } from "./api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import { CATALOGO_COMBUSTIBLE } from "./constantes";
import type {
  LecturaRow,
  TanqueoRow,
  ResumenActivo,
  UltimaLectura,
  OpcionCatalogo,
  EventoUtilizacion,
} from "./tipos";

export type { EstadoAsync } from "../ordenes/hooks";

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

export interface FiltroLecturas {
  activoId?: string;
  tipoMedidor?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

/** Historial de lecturas (horómetro/odómetro) con filtros del contrato. */
export function useLecturas(filtro: FiltroLecturas = {}): EstadoAsync<LecturaRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<LecturaRow[]>(
    async (signal) => lista<LecturaRow>(await utilizacionFetch(`/lecturas${query}`, { signal }), "lecturas"),
    [query],
  );
}

/** Detalle de una lectura. */
export function useLectura(id: string): EstadoAsync<LecturaRow | null> {
  return useConsulta<LecturaRow | null>(
    async (signal) => {
      if (!id) return null;
      const r = await utilizacionFetch<{ lectura?: LecturaRow } | LecturaRow>(`/lecturas/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { lectura?: LecturaRow }).lectura ?? (r as LecturaRow);
    },
    [id],
  );
}

export interface FiltroTanqueos {
  activoId?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  limit?: number;
  offset?: number;
}

/** Historial de tanqueos (combustible) con filtros del contrato. */
export function useTanqueos(filtro: FiltroTanqueos = {}): EstadoAsync<TanqueoRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<TanqueoRow[]>(
    async (signal) => lista<TanqueoRow>(await utilizacionFetch(`/tanqueos${query}`, { signal }), "tanqueos"),
    [query],
  );
}

/** Detalle de un tanqueo. */
export function useTanqueo(id: string): EstadoAsync<TanqueoRow | null> {
  return useConsulta<TanqueoRow | null>(
    async (signal) => {
      if (!id) return null;
      const r = await utilizacionFetch<{ tanqueo?: TanqueoRow } | TanqueoRow>(`/tanqueos/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { tanqueo?: TanqueoRow }).tanqueo ?? (r as TanqueoRow);
    },
    [id],
  );
}

/** Rango temporal opcional del resumen (contrato `GET .../resumen`). */
export interface PeriodoResumen {
  /** ISO-8601 inclusive inferior. */
  desde?: string;
  /** ISO-8601 inclusive superior. */
  hasta?: string;
}

/**
 * Resumen operacional básico por activo. Devuelve `null` si el backend no
 * expone el endpoint (404). Cuando responde, sus campos `ResultadoCalculo`
 * pueden traer `tipo: "sin-datos"`: la UI lo pinta como "Sin datos" (nunca 0).
 *
 * Acepta un `periodo` opcional (`desde`/`hasta`) que el read model del backend
 * ya soporta como filtro del rango: la ficha operacional lo usa para acotar los
 * indicadores a una ventana ("últimos 30 días") y para comparar contra el
 * período anterior (tendencia). Los cálculos SIEMPRE los hace el backend.
 */
export function useResumen(activoId: string, periodo: PeriodoResumen = {}): EstadoAsync<ResumenActivo | null> {
  const query = qs({ desde: periodo.desde, hasta: periodo.hasta });
  return useConsulta<ResumenActivo | null>(
    async (signal) => {
      if (!activoId) return null;
      const r = await utilizacionFetch<{ resumen?: ResumenActivo } | ResumenActivo>(
        `/activos/${encodeURIComponent(activoId)}/resumen${query}`,
        { signal, toleraNoEncontrado: true },
      );
      if (!r) return null;
      return (r as { resumen?: ResumenActivo }).resumen ?? (r as ResumenActivo);
    },
    [activoId, query],
  );
}

/**
 * Última lectura de un medidor de un activo (para capturar el valor al momento
 * de un tanqueo y enlazar `lecturaMedidorRef`).
 */
export function useUltimaLectura(activoId: string, tipoMedidor: string): EstadoAsync<UltimaLectura | null> {
  const query = qs({ activoId, tipoMedidor });
  return useConsulta<UltimaLectura | null>(
    async (signal) => {
      if (!activoId) return null;
      const r = await utilizacionFetch<{ lectura?: UltimaLectura } | UltimaLectura>(`/ultima-lectura${query}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { lectura?: UltimaLectura }).lectura ?? (r as UltimaLectura);
    },
    [query],
  );
}

/** Opciones del catálogo de tipos de combustible del tenant. */
export function useCombustibles(): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => lista<OpcionCatalogo>(await utilizacionFetch(`/catalogos/${CATALOGO_COMBUSTIBLE}`, { signal, toleraNoEncontrado: true }), "opciones"),
    [],
  );
}

/** Flujo de eventos del módulo (event log). */
export function useEventos(): EstadoAsync<EventoUtilizacion[]> {
  return useConsulta<EventoUtilizacion[]>(
    async (signal) => lista<EventoUtilizacion>(await utilizacionFetch(`/eventos`, { signal, toleraNoEncontrado: true }), "eventos"),
    [],
  );
}
