/**
 * DGP-014 · Navegación contextual profunda del módulo preventivo.
 *
 * Funciones PURAS. Los destinos CONSUMEN el contexto de la URL (ruta→filtro/
 * estado inicial, lección DGP-010): el listado lee filtros; la ficha lee
 * `?tab=`; el calendario lee `?vista=&programa=&activo=`; el alta puede anclarse
 * a un activo o a un padre. Los deep links a OTROS módulos apuntan a destinos
 * que YA consumen su `:id` (OT en Órdenes, ficha de activo, ficha de plan).
 */

function query(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const q = s.toString();
  return q ? `?${q}` : "";
}

/* ------------------------------ Programas ------------------------------- */

export function urlProgramas(filtro: { estado?: string; tipo?: string } = {}): string {
  return `/preventivo/programas${query({ estado: filtro.estado, tipo: filtro.tipo })}`;
}
export function urlPrograma(id: string): string {
  return `/preventivo/programas/${encodeURIComponent(id)}`;
}
export function urlProgramaTab(id: string, tab: string): string {
  return `${urlPrograma(id)}?tab=${encodeURIComponent(tab)}`;
}
/** Wizard de alta (opcionalmente anclado a un activo o a un programa padre). */
export function urlNuevoPrograma(ctx?: { activo?: string; padreId?: string }): string {
  if (!ctx) return "/preventivo/programas/nuevo";
  return `/preventivo/programas/nuevo${query({ activo: ctx.activo, padreId: ctx.padreId })}`;
}

/* ------------------------------ Calendario ------------------------------ */

export function urlCalendario(filtro: { vista?: string; programa?: string; activo?: string; fecha?: string } = {}): string {
  return `/preventivo/calendario${query({ vista: filtro.vista, programa: filtro.programa, activo: filtro.activo, fecha: filtro.fecha })}`;
}

/* ---------------------------- Sincronización ---------------------------- */

export function urlSincronizacion(): string {
  return "/preventivo/sincronizacion";
}

/* ------------------------------ Escaneo QR ------------------------------ */

export function urlEscanear(): string {
  return "/preventivo/escanear";
}

/* ----------------------- Deep links a otros módulos --------------------- */

/** OT generada (ficha de Órdenes, que ya consume su `:id`). */
export function urlOrdenTrabajo(ordenId: string): string {
  return `/ordenes/${encodeURIComponent(ordenId)}`;
}
/** Ficha del activo (destino que ya consume su `:id`). */
export function urlActivo(activoId: string): string {
  return `/activos/${encodeURIComponent(activoId)}`;
}
/** Ficha del plan de mantenimiento referenciado (consume su `:id`). */
export function urlPlan(planId: string): string {
  return `/planes/${encodeURIComponent(planId)}`;
}

/** Lee un parámetro de la query (SSR-safe). Reexporta la utilidad común. */
export { leerParam } from "../ecosistema/deep-links";
