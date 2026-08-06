/**
 * DGP-014 · Hooks de consulta del módulo preventivo (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 * Reutiliza `useConsulta` del módulo de Órdenes (mismo contrato de estado async).
 * Las respuestas GET son opacas en el contrato: se normalizan de forma tolerante
 * (array plano o `{ <clave>: [] }`).
 */
import { preventivoFetch } from "./api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import type {
  ProgramaRow,
  ActividadRow,
  VersionPrograma,
  Generacion,
  Programacion,
  OpcionCatalogo,
  EventoPreventivo,
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

export interface FiltroProgramas {
  estado?: string;
  tipo?: string;
  limit?: number;
}

/** Listado de programas preventivos. */
export function useProgramas(filtro: FiltroProgramas = {}): EstadoAsync<ProgramaRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<ProgramaRow[]>(
    async (signal) => lista<ProgramaRow>(await preventivoFetch(`/programas${query}`, { signal }), "programas"),
    [query],
  );
}

/** Detalle de un programa. */
export function usePrograma(id: string): EstadoAsync<ProgramaRow | null> {
  return useConsulta<ProgramaRow | null>(
    async (signal) => {
      if (!id) return null;
      const r = await preventivoFetch<{ programa?: ProgramaRow } | ProgramaRow>(`/programas/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { programa?: ProgramaRow }).programa ?? (r as ProgramaRow);
    },
    [id],
  );
}

/** Actividades de un programa (con dependencias/checklist/recursos). */
export function useActividades(id: string): EstadoAsync<ActividadRow[]> {
  return useConsulta<ActividadRow[]>(
    async (signal) => (id ? lista<ActividadRow>(await preventivoFetch(`/programas/${encodeURIComponent(id)}/actividades`, { signal, toleraNoEncontrado: true }), "actividades") : []),
    [id],
  );
}

/** Versiones de un programa (comparar / revertir). */
export function useVersiones(id: string): EstadoAsync<VersionPrograma[]> {
  return useConsulta<VersionPrograma[]>(
    async (signal) => (id ? lista<VersionPrograma>(await preventivoFetch(`/programas/${encodeURIComponent(id)}/versiones`, { signal, toleraNoEncontrado: true }), "versiones") : []),
    [id],
  );
}

/** Generaciones (OTs generadas) de un programa. */
export function useGeneraciones(id: string, limit?: number): EstadoAsync<Generacion[]> {
  const query = qs({ limit });
  return useConsulta<Generacion[]>(
    async (signal) => (id ? lista<Generacion>(await preventivoFetch(`/programas/${encodeURIComponent(id)}/generaciones${query}`, { signal, toleraNoEncontrado: true }), "generaciones") : []),
    [id, query],
  );
}

/** Programaciones (ocurrencias del calendario) de un programa. */
export function useProgramaciones(id: string, limit?: number): EstadoAsync<Programacion[]> {
  const query = qs({ limit });
  return useConsulta<Programacion[]>(
    async (signal) => (id ? lista<Programacion>(await preventivoFetch(`/programas/${encodeURIComponent(id)}/programaciones${query}`, { signal, toleraNoEncontrado: true }), "programaciones") : []),
    [id, query],
  );
}

/** Opciones de un catálogo del tenant. */
export function useCatalogo(catalogo: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => lista<OpcionCatalogo>(await preventivoFetch(`/catalogos/${encodeURIComponent(catalogo)}`, { signal, toleraNoEncontrado: true }), "opciones"),
    [catalogo],
  );
}

/** Flujo de eventos del módulo (event log). */
export function useEventos(): EstadoAsync<EventoPreventivo[]> {
  return useConsulta<EventoPreventivo[]>(
    async (signal) => lista<EventoPreventivo>(await preventivoFetch(`/eventos`, { signal, toleraNoEncontrado: true }), "eventos"),
    [],
  );
}

/**
 * Programaciones AGREGADAS de todos los programas (para el calendario global).
 * Recorre los programas (limit alto) y consulta sus ocurrencias en paralelo.
 * Es tolerante: los programas sin endpoint de programaciones (404) aportan [].
 */
export function useProgramacionesGlobales(): EstadoAsync<Programacion[]> {
  return useConsulta<Programacion[]>(
    async (signal) => {
      const programas = lista<ProgramaRow>(await preventivoFetch(`/programas?limit=300`, { signal, toleraNoEncontrado: true }), "programas");
      const bloques = await Promise.all(
        programas.map(async (p) => {
          const r = await preventivoFetch(`/programas/${encodeURIComponent(p.id)}/programaciones?limit=500`, { signal, toleraNoEncontrado: true });
          return lista<Programacion>(r, "programaciones").map((o) => ({
            ...o,
            programaId: o.programaId ?? p.id,
            programaNombre: o.programaNombre ?? p.nombre,
          }));
        }),
      );
      return bloques.flat();
    },
    [],
  );
}

/**
 * Programas preventivos asociados a un activo concreto (integración con la
 * ficha del activo y el flujo QR). Filtra en cliente por el alcance declarativo
 * del programa (`activos`), ya que el listado no expone filtro por activo.
 */
export function useProgramasDeActivo(activoId: string): EstadoAsync<ProgramaRow[]> {
  return useConsulta<ProgramaRow[]>(
    async (signal) => {
      if (!activoId) return [];
      const todos = lista<ProgramaRow>(await preventivoFetch(`/programas`, { signal, toleraNoEncontrado: true }), "programas");
      return todos.filter((p) => (p.activos ?? []).includes(activoId));
    },
    [activoId],
  );
}
