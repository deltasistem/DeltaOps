/**
 * DGP-010 · Navegación contextual profunda del ecosistema.
 *
 * Funciones PURAS que construyen los enlaces profundos que conectan Activos ↔
 * Órdenes ↔ QR sin introducir rutas ni patrones nuevos: sólo componen las rutas
 * YA existentes de las experiencias de Activos (DGP-008) y Órdenes (DGP-009)
 * añadiendo estado inicial vía query-string (p.ej. `/ordenes/nueva?activo=…`).
 * Al centralizarse aquí, la navegación contextual es testeable y consistente.
 */

/** Ficha 360° del activo. */
export function urlActivo(activoId: string): string {
  return `/activos/${encodeURIComponent(activoId)}`;
}

/** Ficha 360° del activo abriendo directamente una pestaña concreta. */
export function urlActivoTab(activoId: string, tab: string): string {
  return `${urlActivo(activoId)}?tab=${encodeURIComponent(tab)}`;
}

/** Ficha de ejecución de una orden. */
export function urlOrden(ordenId: string): string {
  return `/ordenes/${encodeURIComponent(ordenId)}`;
}

/** Ficha de la orden abriendo una pestaña concreta (p.ej. `activo`). */
export function urlOrdenTab(ordenId: string, tab: string): string {
  return `${urlOrden(ordenId)}?tab=${encodeURIComponent(tab)}`;
}

/**
 * Alta de OT con contexto inicial (activo / componente / ubicación). El wizard
 * de creación (DGP-009) lee estos parámetros para pre-rellenar el activo
 * principal, cerrando el flujo QR→activo→nueva OT y componente→nueva OT.
 */
export function urlNuevaOrden(ctx: {
  activo?: string;
  activoEtiqueta?: string;
  componente?: string;
  ubicacion?: string;
  /** DELTAOPS LITE-08: plan/rutina que origina el mantenimiento (prefill). */
  plan?: string;
  planEtiqueta?: string;
  /** Motivo prellenado (p. ej. "Rutina vencida por horómetro"). */
  motivo?: string;
} = {}): string {
  const p = new URLSearchParams();
  if (ctx.activo) p.set("activo", ctx.activo);
  if (ctx.activoEtiqueta) p.set("activoEtiqueta", ctx.activoEtiqueta);
  if (ctx.componente) p.set("componente", ctx.componente);
  if (ctx.ubicacion) p.set("ubicacion", ctx.ubicacion);
  if (ctx.plan) p.set("plan", ctx.plan);
  if (ctx.planEtiqueta) p.set("planEtiqueta", ctx.planEtiqueta);
  if (ctx.motivo) p.set("motivo", ctx.motivo);
  const q = p.toString();
  return q ? `/ordenes/nueva?${q}` : "/ordenes/nueva";
}

/**
 * Listado de órdenes filtrado por un activo (órdenes del activo). Usa el
 * parámetro `activoPrincipalId`, alineado con el contrato del filtro de listado
 * (`FiltroListado.activoPrincipalId`) que `/ordenes` propaga a `useListado`.
 */
export function urlOrdenesDeActivo(activoId: string): string {
  return `/ordenes?activoPrincipalId=${encodeURIComponent(activoId)}`;
}

/** Lee un parámetro de la query de una URL/localización (SSR-safe). */
export function leerParam(search: string, clave: string): string | undefined {
  const qs = search.startsWith("?") ? search.slice(1) : search;
  const v = new URLSearchParams(qs).get(clave);
  return v == null || v === "" ? undefined : v;
}
