/**
 * DGP-016 · Constantes del módulo Enterprise Analytics & KPI Platform (frontend).
 *
 * Apunta al contrato del módulo montado en `/api/deltaops/analytics` (sesión
 * obligatoria por cookie). No duplica lógica: sólo referencia nombres de
 * comandos, dashboards del sistema y presentación. El backend (lib/module-
 * analytics) es la autoridad. La evaluación de indicadores es una lectura PURA
 * contra fuentes read-only fail-safe; el frontend nunca inventa datos.
 */

/** Namespace de los comandos del módulo (para la cola /sync). */
export const MODULO = "modulo.analytics";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo. */
export const API_BASE = "/api/deltaops/analytics";

/** URL del endpoint de sincronización offline del módulo. */
export const SYNC_URL = "/api/deltaops/analytics/sync";

/** Espacio de nombres de la cola offline (deltaops:analytics:cola:<tenant>). */
export const MODULO_OFFLINE = "analytics";

/** Prefijo del caché de última evaluación/dashboard por tenant. */
export const CACHE_NAMESPACE = "deltaops:analytics:cache";

/** Roles conocidos y sus capacidades (presentación; el backend es la autoridad). */
export type RolAnalytics = "admin" | "operador" | "lector" | string;

export interface CapacidadesRol {
  readonly read: boolean;
  readonly dashboard: boolean;
  readonly export: boolean;
  readonly admin: boolean;
}

/**
 * Capacidades DE PRESENTACIÓN por rol. Deben coincidir con analytics-runtime del
 * api-server: admin=read+admin+dashboard+export, operador=read+dashboard+export,
 * lector=read. El backend rechaza cualquier intento no autorizado (nunca hay
 * bypass); esto sólo decide qué acciones OFRECER.
 */
export function capacidadesDe(rol: RolAnalytics): CapacidadesRol {
  switch (rol) {
    case "admin":
    case "platform_admin":
      return { read: true, dashboard: true, export: true, admin: true };
    case "operador":
      return { read: true, dashboard: true, export: true, admin: false };
    case "lector":
    default:
      return { read: true, dashboard: false, export: false, admin: false };
  }
}

/** Los 8 dashboards del sistema (claves canónicas del catálogo del backend). */
export const DASHBOARDS_SISTEMA: { clave: string; nombre: string; descripcion: string }[] = [
  { clave: "ejecutivo", nombre: "Ejecutivo", descripcion: "Disponibilidad, confiabilidad, costos y cumplimiento" },
  { clave: "operativo", nombre: "Operativo", descripcion: "Estado operacional de órdenes y cargas de trabajo" },
  { clave: "inventario", nombre: "Inventario", descripcion: "Consumo, rotación, servicio y movimientos" },
  { clave: "activos", nombre: "Activos", descripcion: "Disponibilidad, utilización y confiabilidad" },
  { clave: "ordenes", nombre: "Órdenes", descripcion: "Ciclo de vida y tiempos de las órdenes" },
  { clave: "correctivo", nombre: "Correctivo", descripcion: "Fallas, reincidencias y tiempos de atención" },
  { clave: "preventivo", nombre: "Preventivo", descripcion: "Cumplimiento y adherencia del preventivo" },
  { clave: "compras", nombre: "Compras", descripcion: "Solicitudes de compra generadas y abastecimiento" },
];

/** Tipos de widget soportados por el motor de presentación (13 tipos). */
export const TIPOS_WIDGET = [
  "card",
  "line",
  "bar",
  "area",
  "pie",
  "donut",
  "gauge",
  "table",
  "heatmap",
  "timeline",
  "calendar",
  "ranking",
  "comparativo",
] as const;
export type TipoWidget = (typeof TIPOS_WIDGET)[number];

/** Etiqueta legible de cada tipo de widget (para el editor). */
export const ETIQUETA_TIPO_WIDGET: Record<TipoWidget, string> = {
  card: "Tarjeta (card)",
  line: "Línea",
  bar: "Barras",
  area: "Área",
  pie: "Circular (pie)",
  donut: "Dona (donut)",
  gauge: "Medidor (gauge)",
  table: "Tabla",
  heatmap: "Mapa de calor",
  timeline: "Línea de tiempo",
  calendar: "Calendario",
  ranking: "Ranking (topN/bottomN)",
  comparativo: "Comparativo",
};

/**
 * Dimensiones canónicas de los filtros globales reutilizables. Se combinan con
 * los filtros de cada widget. El operador por defecto es igualdad (`eq`); las
 * fechas usan un campo `fecha`/`rango` que el backend interpreta por ventana.
 */
export const DIMENSIONES_FILTRO = [
  "activo",
  "ubicacion",
  "bodega",
  "categoria",
  "tipo",
  "estado",
  "prioridad",
  "responsable",
  "cuadrilla",
  "fecha",
  "rango",
] as const;
export type DimensionFiltro = (typeof DIMENSIONES_FILTRO)[number];

export const ETIQUETA_DIMENSION: Record<DimensionFiltro, string> = {
  activo: "Activo",
  ubicacion: "Ubicación",
  bodega: "Bodega",
  categoria: "Categoría",
  tipo: "Tipo",
  estado: "Estado",
  prioridad: "Prioridad",
  responsable: "Responsable",
  cuadrilla: "Cuadrilla",
  fecha: "Fecha",
  rango: "Rango",
};

/** Semáforo → variante de Badge/tono del Design System. */
export type SemaforoNivel = "bueno" | "alerta" | "critico";
export const TONO_SEMAFORO: Record<SemaforoNivel, "exito" | "advertencia" | "error"> = {
  bueno: "exito",
  alerta: "advertencia",
  critico: "error",
};
export const ETIQUETA_SEMAFORO: Record<SemaforoNivel, string> = {
  bueno: "Bueno",
  alerta: "Alerta",
  critico: "Crítico",
};
