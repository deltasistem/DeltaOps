/**
 * DGP-016 · Deep links de la sección Analytics.
 *
 * Rutas internas de Analytics + enlaces SALIENTES hacia los módulos operativos
 * (consumidos ruta→filtro): órdenes abiertas → /ordenes filtrado, fallas por
 * activo → ficha del activo (pestaña correctivo), compras → abastecimiento.
 */
import { escribirFiltrosEnUrl, type FiltrosGlobales } from "./filtros";

/* ------------------------------- Internas ------------------------------- */

export function urlHome(): string {
  return "/analytics";
}

export function urlDashboard(id: string, filtros: FiltrosGlobales = {}): string {
  return `/analytics/dashboards/${encodeURIComponent(id)}${escribirFiltrosEnUrl(filtros)}`;
}

export function urlIndicadores(categoria?: string): string {
  return categoria ? `/analytics/indicadores?categoria=${encodeURIComponent(categoria)}` : "/analytics/indicadores";
}

export function urlIndicador(clave: string, filtros: FiltrosGlobales = {}): string {
  return `/analytics/indicadores/${encodeURIComponent(clave)}${escribirFiltrosEnUrl(filtros)}`;
}

export function urlDashboardNuevo(): string {
  return "/analytics/dashboards/nuevo";
}

export function urlDashboardEditar(id: string): string {
  return `/analytics/dashboards/${encodeURIComponent(id)}/editar`;
}

export function urlSincronizacion(): string {
  return "/analytics/sincronizacion";
}

/* ----------------------- Deep links a otros módulos --------------------- */

/** OT abiertas/vencidas/críticas → listado de Órdenes filtrado (ruta→filtro). */
export function urlOrdenesFiltrado(filtro: { estado?: string; tipo?: string; responsable?: string } = {}): string {
  const params = new URLSearchParams();
  if (filtro.estado) params.set("estado", filtro.estado);
  if (filtro.tipo) params.set("tipo", filtro.tipo);
  if (filtro.responsable) params.set("responsable", filtro.responsable);
  const q = params.toString();
  return `/ordenes${q ? `?${q}` : ""}`;
}

/** Fallas por activo → ficha del activo en la pestaña de correctivo. */
export function urlActivoCorrectivo(activoId: string): string {
  return `/activos/${encodeURIComponent(activoId)}?tab=correctivo`;
}

/** Ficha del activo (destino que ya consume su `:id`). */
export function urlActivo(activoId: string): string {
  return `/activos/${encodeURIComponent(activoId)}`;
}

/** Compras generadas → solicitudes de abastecimiento. */
export function urlAbastecimientoSolicitudes(): string {
  return "/abastecimiento/solicitudes";
}

/** Solicitud de abastecimiento concreta (consume su `:id`). */
export function urlAbastecimientoSolicitud(id: string): string {
  return `/abastecimiento/solicitudes/${encodeURIComponent(id)}`;
}

/** Item de inventario referenciado (consume su `:id`). */
export function urlItemInventario(itemId: string): string {
  return `/inventario/${encodeURIComponent(itemId)}`;
}

/**
 * Resuelve un deep link SALIENTE declarado en la presentación de un widget
 * (`presentacion.enlace`), sustituyendo la clave del grupo activo. Devuelve null
 * si el widget no declara enlace. El formato declarativo es:
 *   presentacion.enlace = { destino: "ordenes"|"activo-correctivo"|"activo"|
 *                                    "abastecimiento"|"inventario", estado?, tipo? }
 * `clave` es la clave del grupo/fila sobre la que se navega (p.ej. activoId).
 */
export function resolverEnlaceWidget(
  presentacion: Record<string, unknown>,
  clave?: string,
): string | null {
  const enlace = presentacion?.enlace as
    | { destino?: string; estado?: string; tipo?: string; responsable?: string }
    | undefined;
  if (!enlace || typeof enlace.destino !== "string") return null;
  switch (enlace.destino) {
    case "ordenes":
      return urlOrdenesFiltrado({ estado: enlace.estado, tipo: enlace.tipo, responsable: enlace.responsable });
    case "activo-correctivo":
      return clave ? urlActivoCorrectivo(clave) : null;
    case "activo":
      return clave ? urlActivo(clave) : null;
    case "abastecimiento":
      return urlAbastecimientoSolicitudes();
    case "inventario":
      return clave ? urlItemInventario(clave) : urlItemInventario("");
    default:
      return null;
  }
}

/** Lee un parámetro simple de una querystring (SSR-safe). */
export function leerParam(search: string, nombre: string): string | undefined {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(nombre) ?? undefined;
}
