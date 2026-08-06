/**
 * DGP-012 · Hooks de consulta del módulo de Planes (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 * Reutiliza `useConsulta` del módulo de Órdenes (mismo contrato de estado async).
 */
import { planesFetch } from "./api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import type {
  PlanRow,
  VersionPlan,
  EntradaHistorial,
  Generacion,
  Calendario,
  OpcionCatalogo,
  EventoPlan,
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

export interface FiltroPlanes {
  estado?: string;
  tipoPlan?: string;
  limit?: number;
}

/** Listado de planes (el listado vive en la BASE del módulo). */
export function usePlanes(filtro: FiltroPlanes = {}): EstadoAsync<PlanRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<PlanRow[]>(
    async (signal) => lista<PlanRow>(await planesFetch(query, { signal }), "planes"),
    [query],
  );
}

/** Detalle de un plan. */
export function usePlan(id: string): EstadoAsync<PlanRow | null> {
  return useConsulta<PlanRow | null>(
    async (signal) => {
      if (!id) return null;
      const r = await planesFetch<{ plan?: PlanRow } | PlanRow>(`/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { plan?: PlanRow }).plan ?? (r as PlanRow);
    },
    [id],
  );
}

/** Versiones de un plan (activa / históricas / comparación). */
export function useVersiones(id: string): EstadoAsync<VersionPlan[]> {
  return useConsulta<VersionPlan[]>(
    async (signal) => (id ? lista<VersionPlan>(await planesFetch(`/${encodeURIComponent(id)}/versiones`, { signal, toleraNoEncontrado: true }), "versiones") : []),
    [id],
  );
}

/** Historial (bitácora) de un plan. */
export function useHistorial(id: string): EstadoAsync<EntradaHistorial[]> {
  return useConsulta<EntradaHistorial[]>(
    async (signal) => (id ? lista<EntradaHistorial>(await planesFetch(`/${encodeURIComponent(id)}/historial`, { signal, toleraNoEncontrado: true }), "historial") : []),
    [id],
  );
}

/** Generaciones (órdenes generadas) de un plan. */
export function useGeneraciones(id: string): EstadoAsync<Generacion[]> {
  return useConsulta<Generacion[]>(
    async (signal) => (id ? lista<Generacion>(await planesFetch(`/${encodeURIComponent(id)}/generaciones`, { signal, toleraNoEncontrado: true }), "generaciones") : []),
    [id],
  );
}

/** Detalle de un calendario operacional. */
export function useCalendario(id: string): EstadoAsync<Calendario | null> {
  return useConsulta<Calendario | null>(
    async (signal) => (id ? planesFetch<Calendario>(`/calendarios/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true }) : null),
    [id],
  );
}

/** Opciones de un catálogo del tenant (tipos de plan, estrategias, prioridades…). */
export function useCatalogo(catalogo: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => lista<OpcionCatalogo>(await planesFetch(`/catalogos/${encodeURIComponent(catalogo)}`, { signal, toleraNoEncontrado: true }), "opciones"),
    [catalogo],
  );
}

/** Flujo de eventos del módulo (event log). */
export function useEventos(): EstadoAsync<EventoPlan[]> {
  return useConsulta<EventoPlan[]>(
    async (signal) => lista<EventoPlan>(await planesFetch(`/eventos`, { signal, toleraNoEncontrado: true }), "eventos"),
    [],
  );
}

/**
 * Planes asociados a un activo concreto (integración con la ficha del activo y
 * el flujo QR). Filtra en cliente por el alcance declarativo del plan
 * (`alcance.activos`), ya que el listado no expone filtro por activo.
 */
export function usePlanesDeActivo(activoId: string): EstadoAsync<PlanRow[]> {
  return useConsulta<PlanRow[]>(
    async (signal) => {
      if (!activoId) return [];
      const todos = lista<PlanRow>(await planesFetch(``, { signal, toleraNoEncontrado: true }), "planes");
      return todos.filter((p) => (p.alcance?.activos ?? []).includes(activoId));
    },
    [activoId],
  );
}
