/**
 * DGP-013 · Navegación contextual profunda de Abastecimiento.
 *
 * Funciones PURAS que construyen enlaces profundos de la experiencia. Los
 * destinos CONSUMEN el contexto de la URL (ruta→filtro/estado inicial, lección
 * DGP-010): los listados leen filtros, las fichas leen `?tab=` y el alta de
 * solicitud puede anclarse a un origen (`?origen=&refId=&refTipo=`).
 *
 * Los deep links a OTROS módulos apuntan a destinos que YA consumen su `:id`
 * (ficha de inventario, ficha de orden, ficha de plan, movimientos de
 * inventario), sin fabricar datos.
 */

function query(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const q = s.toString();
  return q ? `?${q}` : "";
}

/* ------------------------------- Artículos ------------------------------ */

export function urlArticulos(filtro: { tipo?: string; familia?: string } = {}): string {
  return `/abastecimiento/articulos${query({ tipo: filtro.tipo, familia: filtro.familia })}`;
}
export function urlArticulo(id: string): string {
  return `/abastecimiento/articulos/${encodeURIComponent(id)}`;
}
export function urlArticuloTab(id: string, tab: string): string {
  return `${urlArticulo(id)}?tab=${encodeURIComponent(tab)}`;
}
export function urlNuevoArticulo(): string {
  return "/abastecimiento/articulos/nuevo";
}

/* ------------------------------ Proveedores ----------------------------- */

export function urlProveedores(filtro: { tipo?: string } = {}): string {
  return `/abastecimiento/proveedores${query({ tipo: filtro.tipo })}`;
}
export function urlProveedor(id: string): string {
  return `/abastecimiento/proveedores/${encodeURIComponent(id)}`;
}
export function urlNuevoProveedor(): string {
  return "/abastecimiento/proveedores/nuevo";
}

/* ------------------------------ Solicitudes ----------------------------- */

export function urlSolicitudes(filtro: { estado?: string; prioridad?: string } = {}): string {
  return `/abastecimiento/solicitudes${query({ estado: filtro.estado, prioridad: filtro.prioridad })}`;
}
export function urlSolicitud(id: string): string {
  return `/abastecimiento/solicitudes/${encodeURIComponent(id)}`;
}
export function urlSolicitudTab(id: string, tab: string): string {
  return `${urlSolicitud(id)}?tab=${encodeURIComponent(tab)}`;
}
/** Alta de solicitud anclada a un origen declarativo (deep link entrante). */
export function urlNuevaSolicitud(origen?: { tipo: string; refId?: string; refTipo?: string; etiqueta?: string }): string {
  if (!origen) return "/abastecimiento/solicitudes/nueva";
  return `/abastecimiento/solicitudes/nueva${query({ origen: origen.tipo, refId: origen.refId, refTipo: origen.refTipo, etiqueta: origen.etiqueta })}`;
}

/* ---------------------------- Órdenes de compra ------------------------- */

export function urlOrdenesCompra(filtro: { estado?: string; proveedorId?: string } = {}): string {
  return `/abastecimiento/ordenes-compra${query({ estado: filtro.estado, proveedorId: filtro.proveedorId })}`;
}
export function urlOrdenCompra(id: string): string {
  return `/abastecimiento/ordenes-compra/${encodeURIComponent(id)}`;
}
export function urlOrdenCompraTab(id: string, tab: string): string {
  return `${urlOrdenCompra(id)}?tab=${encodeURIComponent(tab)}`;
}
/** Alta de OC pre-cargada desde una cotización seleccionada de una solicitud. */
export function urlNuevaOrdenCompra(ctx?: { solicitudId?: string; cotizacionId?: string }): string {
  if (!ctx) return "/abastecimiento/ordenes-compra/nueva";
  return `/abastecimiento/ordenes-compra/nueva${query({ solicitudId: ctx.solicitudId, cotizacionId: ctx.cotizacionId })}`;
}

/* --------------------------- Sincronización ----------------------------- */

export function urlSincronizacion(): string {
  return "/abastecimiento/sincronizacion";
}

/* ------------------------------ Escaneo QR ------------------------------ */

export function urlEscanearAbastecimiento(): string {
  return "/abastecimiento/escanear";
}

/* ----------------------- Deep links a otros módulos --------------------- */

/** Ficha del item de inventario (destino que ya consume su `:id`). */
export function urlItemInventario(itemId: string): string {
  return `/inventario/${encodeURIComponent(itemId)}`;
}
/** Movimientos de inventario, opcionalmente filtrados por item (consume `?itemId=`). */
export function urlMovimientosInventario(itemId?: string): string {
  return itemId ? `/inventario/movimientos?itemId=${encodeURIComponent(itemId)}` : "/inventario/movimientos";
}
/** Ficha de la orden de trabajo (destino que ya consume su `:id`). */
export function urlOrdenTrabajo(ordenId: string): string {
  return `/ordenes/${encodeURIComponent(ordenId)}`;
}
/** Ficha del plan de mantenimiento (destino que ya consume su `:id`). */
export function urlPlan(planId: string): string {
  return `/planes/${encodeURIComponent(planId)}`;
}

/**
 * Deep link al ORIGEN de una solicitud, según su tipo declarativo. Devuelve
 * `null` si no hay referencia navegable (p. ej. origen de usuario libre).
 */
export function urlOrigenSolicitud(origen?: OrigenLike): string | null {
  if (!origen || !origen.referenciaId) return null;
  switch (origen.tipo) {
    case "inventario": return urlItemInventario(origen.referenciaId);
    case "orden": return urlOrdenTrabajo(origen.referenciaId);
    case "plan": return urlPlan(origen.referenciaId);
    default: return null;
  }
}

interface OrigenLike {
  tipo: string;
  referenciaId?: string | null;
}

/** Lee un parámetro de la query (SSR-safe). Reexporta la utilidad común. */
export { leerParam } from "../ecosistema/deep-links";
