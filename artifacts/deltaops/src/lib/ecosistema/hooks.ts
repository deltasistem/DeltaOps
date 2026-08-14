/**
 * DGP-010 · Hooks de COMPOSICIÓN del ecosistema.
 *
 * No abren endpoints nuevos: reutilizan los clientes HTTP y el read model YA
 * existentes de Activos (DGP-008) y Órdenes (DGP-009) para poblar las
 * superficies integradas (Vista 360°, Centro Global, Ejecución integrada). Toda
 * la lógica de consulta descansa en `useConsulta` de Órdenes (recarga +
 * cancelación); aquí sólo se cablean rutas ya soportadas por la API congelada.
 */
import { ordenesFetch } from "../ordenes/api";
import { activosFetch } from "../activos/api";
import { useConsulta, type EstadoAsync } from "../ordenes/hooks";
import type { OrdenRow } from "../ordenes/tipos";
import type { ActivoRow, EventoTimeline } from "../activos/tipos";

/**
 * Órdenes cuyo activo principal es `activoId` (Vista 360° → pestaña Órdenes).
 * Usa el filtro `activoPrincipalId` YA soportado por `GET /ordenes`.
 */
export function useOrdenesDeActivo(activoId: string): EstadoAsync<OrdenRow[]> {
  return useConsulta<OrdenRow[]>(
    async (signal) => {
      if (!activoId) return [];
      const r = await ordenesFetch<{ ordenes: OrdenRow[] }>(
        `?activoPrincipalId=${encodeURIComponent(activoId)}`,
        { signal },
      );
      return r?.ordenes ?? [];
    },
    [activoId],
  );
}

/**
 * Resumen del activo referido por una orden (Ejecución integrada → pestaña
 * Activo). Tolerante: si la orden no tiene activo o el detalle no está
 * disponible, devuelve `null` sin romper la ejecución de la OT.
 */
export function useActivoResumen(activoId: string | null): EstadoAsync<ActivoRow | null> {
  return useConsulta<ActivoRow | null>(
    async (signal) => {
      if (!activoId) return null;
      return activosFetch<ActivoRow>(`/${encodeURIComponent(activoId)}`, { signal, toleraNoEncontrado: true });
    },
    [activoId ?? ""],
  );
}

/** Actividad (Shared Timeline) del activo referido por una orden. */
export function useTimelineActivo(activoId: string | null): EstadoAsync<EventoTimeline[]> {
  return useConsulta<EventoTimeline[]>(
    async (signal) => {
      if (!activoId) return [];
      const r = await activosFetch<EventoTimeline[]>(
        `/${encodeURIComponent(activoId)}/timeline`,
        { signal, toleraNoEncontrado: true },
      );
      return r ?? [];
    },
    [activoId ?? ""],
  );
}

/**
 * Listado global de órdenes con filtro opcional (Centro Global · Home empresa).
 *
 * `toleraNoAutorizado`: cuando esta consulta es el CONTENIDO que se dispara al
 * MONTAR una superficie (p. ej. la Home tras login/logout→login), un 401
 * transitorio (cookie recién emitida aún no propagada a la petición inmediata)
 * NO debe redirigir el navegador a /login: aborta la carga y deja al usuario
 * varado en /login. Con el flag, ese 401 se degrada a error normal (lista vacía)
 * y la ÚNICA autoridad de redirección sigue siendo `useSesion`. Ver LITE-03 ·
 * fix de carrera post-login.
 */
export function useOrdenesGlobal(
  filtro: { estado?: string; limit?: number } = {},
  opts: { toleraNoAutorizado?: boolean } = {},
): EstadoAsync<OrdenRow[]> {
  const query = new URLSearchParams();
  if (filtro.estado) query.set("estado", filtro.estado);
  query.set("limit", String(filtro.limit ?? 200));
  const qs = query.toString();
  const toleraNoAutorizado = opts.toleraNoAutorizado ?? false;
  return useConsulta<OrdenRow[]>(
    async (signal) => {
      const r = await ordenesFetch<{ ordenes: OrdenRow[] }>(`?${qs}`, { signal, toleraNoAutorizado });
      return r?.ordenes ?? [];
    },
    [qs, toleraNoAutorizado],
  );
}
