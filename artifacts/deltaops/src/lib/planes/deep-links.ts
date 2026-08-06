/**
 * DGP-012 · Navegación contextual profunda de Planes.
 *
 * Funciones PURAS que construyen enlaces profundos de la experiencia de Planes.
 * Los destinos CONSUMEN el contexto de la URL (ruta→filtro/estado inicial,
 * lección DGP-010): el listado lee filtros, la ficha lee `?tab=` y el alta
 * puede anclarse a un activo (`?activo=`). El deep link a la OT generada apunta
 * a la ficha de Órdenes, que YA consume su `:id`.
 */

/** Listado de planes (vive en la BASE del módulo). */
export function urlPlanes(filtro: { estado?: string; tipoPlan?: string; estrategia?: string } = {}): string {
  const s = new URLSearchParams();
  if (filtro.estado) s.set("estado", filtro.estado);
  if (filtro.tipoPlan) s.set("tipoPlan", filtro.tipoPlan);
  if (filtro.estrategia) s.set("estrategia", filtro.estrategia);
  const q = s.toString();
  return q ? `/planes?${q}` : "/planes";
}

/** Ficha completa de un plan. */
export function urlPlan(planId: string): string {
  return `/planes/${encodeURIComponent(planId)}`;
}

/** Ficha del plan abriendo directamente una pestaña concreta. */
export function urlPlanTab(planId: string, tab: string): string {
  return `${urlPlan(planId)}?tab=${encodeURIComponent(tab)}`;
}

/** Wizard de creación de plan (opcionalmente anclado a un activo). */
export function urlNuevoPlan(activo?: string): string {
  return activo ? `/planes/nuevo?activo=${encodeURIComponent(activo)}` : "/planes/nuevo";
}

/** Calendario operacional. */
export function urlCalendario(): string {
  return "/planes/calendario";
}

/** Sincronización offline del módulo. */
export function urlSincronizacion(): string {
  return "/planes/sincronizacion";
}

/**
 * Deep link a la Orden de Trabajo generada por el plan. Apunta a la ficha de
 * Órdenes, cuyo destino YA consume el parámetro `:id` (lección DGP-010).
 */
export function urlOrdenGenerada(ordenId: string): string {
  return `/ordenes/${encodeURIComponent(ordenId)}`;
}

/** Lee un parámetro de la query (SSR-safe). Reexporta la utilidad común. */
export { leerParam } from "../ecosistema/deep-links";
