/**
 * DGP-015 · Hooks de consulta del módulo correctivo (CQRS read side).
 * Cada hook envuelve un endpoint GET del read model con recarga y cancelación.
 * Reutiliza `useConsulta` del módulo de Órdenes (mismo contrato de estado async).
 * Las respuestas GET son opacas en el contrato: se normalizan de forma tolerante
 * (array plano o `{ <clave>: [] }`).
 */
import { correctivoFetch } from "./api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import type {
  SolicitudRow,
  IntervencionRow,
  EventoActivo,
  OpcionCatalogo,
  EventoCorrectivo,
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

export interface FiltroSolicitudes {
  estado?: string;
  origen?: string;
  activoId?: string;
  limit?: number;
}

/** Listado de solicitudes correctivas. */
export function useSolicitudes(filtro: FiltroSolicitudes = {}): EstadoAsync<SolicitudRow[]> {
  const query = qs({ ...filtro });
  return useConsulta<SolicitudRow[]>(
    async (signal) => lista<SolicitudRow>(await correctivoFetch(`/solicitudes${query}`, { signal }), "solicitudes"),
    [query],
  );
}

/** Detalle de una solicitud. */
export function useSolicitud(id: string): EstadoAsync<SolicitudRow | null> {
  return useConsulta<SolicitudRow | null>(
    async (signal) => {
      if (!id) return null;
      const r = await correctivoFetch<{ solicitud?: SolicitudRow } | SolicitudRow>(`/solicitudes/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { solicitud?: SolicitudRow }).solicitud ?? (r as SolicitudRow);
    },
    [id],
  );
}

/** Detalle de una intervención. */
export function useIntervencion(id: string): EstadoAsync<IntervencionRow | null> {
  return useConsulta<IntervencionRow | null>(
    async (signal) => {
      if (!id) return null;
      const r = await correctivoFetch<{ intervencion?: IntervencionRow } | IntervencionRow>(`/intervenciones/${encodeURIComponent(id)}`, { signal, toleraNoEncontrado: true });
      if (!r) return null;
      return (r as { intervencion?: IntervencionRow }).intervencion ?? (r as IntervencionRow);
    },
    [id],
  );
}

/** Eventos (historial de fallas/reincidencias) de un activo. */
export function useEventosActivo(activoId: string): EstadoAsync<EventoActivo[]> {
  return useConsulta<EventoActivo[]>(
    async (signal) => (activoId ? lista<EventoActivo>(await correctivoFetch(`/activos/${encodeURIComponent(activoId)}/eventos`, { signal, toleraNoEncontrado: true }), "eventos") : []),
    [activoId],
  );
}

/** Opciones de un catálogo del tenant. */
export function useCatalogo(catalogo: string): EstadoAsync<OpcionCatalogo[]> {
  return useConsulta<OpcionCatalogo[]>(
    async (signal) => lista<OpcionCatalogo>(await correctivoFetch(`/catalogos/${encodeURIComponent(catalogo)}`, { signal, toleraNoEncontrado: true }), "opciones"),
    [catalogo],
  );
}

/** Flujo de eventos del módulo (event log). */
export function useEventos(): EstadoAsync<EventoCorrectivo[]> {
  return useConsulta<EventoCorrectivo[]>(
    async (signal) => lista<EventoCorrectivo>(await correctivoFetch(`/eventos`, { signal, toleraNoEncontrado: true }), "eventos"),
    [],
  );
}

/**
 * Solicitudes correctivas asociadas a un activo concreto (integración con la
 * ficha del activo y el flujo QR). Usa el filtro real `activoId` del listado.
 */
export function useSolicitudesDeActivo(activoId: string): EstadoAsync<SolicitudRow[]> {
  const query = qs({ activoId, limit: 300 });
  return useConsulta<SolicitudRow[]>(
    async (signal) => {
      if (!activoId) return [];
      const r = lista<SolicitudRow>(await correctivoFetch(`/solicitudes${query}`, { signal, toleraNoEncontrado: true }), "solicitudes");
      // Defensa cliente: si el proyector no filtró por activo, filtramos por el
      // objeto afectado; si no expone `objeto`, respetamos el resultado del server.
      return r.filter((s) => {
        const suActivo = s.objeto?.activoId ?? s.activoId;
        return suActivo === undefined || suActivo === activoId;
      });
    },
    [query],
  );
}
