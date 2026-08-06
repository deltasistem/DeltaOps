/**
 * DGP-011.3 · Navegación contextual profunda de Inventario.
 *
 * Funciones PURAS que construyen enlaces profundos de la experiencia de
 * Inventario. Los destinos CONSUMEN el contexto de la URL (ruta→filtro/estado
 * inicial, lección DGP-010): p. ej. la ficha lee `?tab=`, el listado lee filtros
 * y el escaneo QR navega automáticamente a la ficha del item resuelto.
 */

/** Listado de inventario. */
export function urlInventario(): string {
  return "/inventario";
}

/** Ficha completa de un item. */
export function urlItem(itemId: string): string {
  return `/inventario/${encodeURIComponent(itemId)}`;
}

/** Ficha del item abriendo directamente una pestaña concreta. */
export function urlItemTab(itemId: string, tab: string): string {
  return `${urlItem(itemId)}?tab=${encodeURIComponent(tab)}`;
}

/** Listado de movimientos (opcionalmente filtrado por item). */
export function urlMovimientos(itemId?: string): string {
  return itemId ? `/inventario/movimientos?itemId=${encodeURIComponent(itemId)}` : "/inventario/movimientos";
}

/** Alta de item. */
export function urlNuevoItem(): string {
  return "/inventario/nuevo";
}

/** Bodegas (árbol) — opcionalmente enfocando una bodega. */
export function urlBodegas(bodegaId?: string): string {
  return bodegaId ? `/inventario/bodegas?bodega=${encodeURIComponent(bodegaId)}` : "/inventario/bodegas";
}

/** Lee un parámetro de la query (SSR-safe). Reexporta la utilidad común. */
export { leerParam } from "../ecosistema/deep-links";
