/**
 * DGP-015 · Navegación contextual profunda del módulo correctivo.
 *
 * Funciones PURAS. Los destinos CONSUMEN el contexto de la URL (ruta→filtro/
 * estado inicial, lección DGP-010): el listado lee filtros; la ficha lee
 * `?tab=`; el alta puede anclarse a un activo. Los deep links a OTROS módulos
 * apuntan a destinos que YA consumen su `:id` (OT en Órdenes, ficha de activo,
 * ficha de item de inventario, solicitud de abastecimiento).
 */

function query(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const q = s.toString();
  return q ? `?${q}` : "";
}

/* ------------------------------ Solicitudes ----------------------------- */

export function urlSolicitudes(filtro: { estado?: string; origen?: string; activoId?: string } = {}): string {
  return `/correctivo/solicitudes${query({ estado: filtro.estado, origen: filtro.origen, activoId: filtro.activoId })}`;
}
export function urlSolicitud(id: string): string {
  return `/correctivo/solicitudes/${encodeURIComponent(id)}`;
}
export function urlSolicitudTab(id: string, tab: string): string {
  return `${urlSolicitud(id)}?tab=${encodeURIComponent(tab)}`;
}
/** Wizard de alta (opcionalmente anclado a un activo). */
export function urlNuevaSolicitud(ctx?: { activo?: string }): string {
  if (!ctx) return "/correctivo/solicitudes/nueva";
  return `/correctivo/solicitudes/nueva${query({ activo: ctx.activo })}`;
}

/* ------------------------------ Intervención ---------------------------- */

export function urlIntervencion(id: string): string {
  return `/correctivo/intervenciones/${encodeURIComponent(id)}`;
}
export function urlIntervencionTab(id: string, tab: string): string {
  return `${urlIntervencion(id)}?tab=${encodeURIComponent(tab)}`;
}

/* ---------------------------- Sincronización ---------------------------- */

export function urlSincronizacion(): string {
  return "/correctivo/sincronizacion";
}

/* ------------------------------ Escaneo QR ------------------------------ */

export function urlEscanear(): string {
  return "/correctivo/escanear";
}

/* ----------------------- Deep links a otros módulos --------------------- */

/** OT correctiva (ficha de Órdenes, que ya consume su `:id`). */
export function urlOrdenTrabajo(ordenId: string): string {
  return `/ordenes/${encodeURIComponent(ordenId)}`;
}
/** Ficha del activo (destino que ya consume su `:id`). */
export function urlActivo(activoId: string): string {
  return `/activos/${encodeURIComponent(activoId)}`;
}
/** Ficha del item de inventario referenciado (consume su `:id`). */
export function urlItemInventario(itemId: string): string {
  return `/inventario/${encodeURIComponent(itemId)}`;
}
/** Solicitud de abastecimiento disparada por faltante (consume su `:id`). */
export function urlSolicitudAbastecimiento(solicitudId: string): string {
  return `/abastecimiento/solicitudes/${encodeURIComponent(solicitudId)}`;
}

/** Lee un parámetro de la query (SSR-safe). Reexporta la utilidad común. */
export { leerParam } from "../ecosistema/deep-links";
