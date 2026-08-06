/**
 * DGP-013 · Constantes del módulo Enterprise Procurement & Supply Chain.
 *
 * Apunta al contrato CONGELADO montado en `/api/deltaops/abastecimiento`
 * (sesión obligatoria por cookie). No duplica lógica de negocio: sólo referencia
 * nombres de comandos y catálogos de presentación. El backend es la autoridad
 * (Workflow Engine gobierna las transiciones; el frontend nunca hace bypass).
 * El OpenAPI congelado
 * (`lib/module-abastecimiento/openapi/abastecimiento.openapi.json`) es la fuente
 * de verdad EXACTA de los payloads.
 */

/** Namespace de los comandos del módulo (para la cola /sync). */
export const MODULO = "modulo.abastecimiento";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo. */
export const API_BASE = "/api/deltaops/abastecimiento";

/** URL del endpoint de sincronización offline del módulo. */
export const SYNC_URL = "/api/deltaops/abastecimiento/sync";

/** Espacio de nombres de la cola offline (deltaops:abastecimiento:cola:<tenant>). */
export const MODULO_OFFLINE = "abastecimiento";

/** Tamaño de página de las tablas del módulo. */
export const TAMANO_PAGINA = 12;

export type Tono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

/* -------------------------- Estados: Solicitud -------------------------- */

/** Estados del ciclo de vida de una solicitud (Workflow). Sólo PRESENTACIÓN. */
export const ETIQUETA_ESTADO_SOLICITUD: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CERRADA: "Cerrada",
};

export const TONO_ESTADO_SOLICITUD: Record<string, Tono> = {
  BORRADOR: "neutro",
  ENVIADA: "info",
  APROBADA: "exito",
  RECHAZADA: "error",
  CERRADA: "neutro",
};

/* ------------------------ Estados: Orden de compra ---------------------- */

export const ETIQUETA_ESTADO_OC: Record<string, string> = {
  BORRADOR: "Borrador",
  APROBADA: "Aprobada",
  ENVIADA: "Enviada",
  RECIBIDA_PARCIAL: "Recibida parcial",
  RECIBIDA_TOTAL: "Recibida total",
  CANCELADA: "Cancelada",
  CERRADA: "Cerrada",
};

export const TONO_ESTADO_OC: Record<string, Tono> = {
  BORRADOR: "neutro",
  APROBADA: "info",
  ENVIADA: "primario",
  RECIBIDA_PARCIAL: "advertencia",
  RECIBIDA_TOTAL: "exito",
  CANCELADA: "error",
  CERRADA: "neutro",
};

/* ---------------------------- Estado: Proveedor ------------------------- */

export const ETIQUETA_ESTADO_PROVEEDOR: Record<string, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
};

export const TONO_ESTADO_PROVEEDOR: Record<string, Tono> = {
  activo: "exito",
  inactivo: "neutro",
};

/* ---------------- Acciones Workflow: Solicitud (1:1) -------------------- */

/**
 * Acciones de transición de la solicitud EXACTAS del enum del contrato
 * (`TransicionarSolicitud.accion`). Cada botón de la UI envía SU acción real.
 * `rechazar` exige `motivoRechazo` (obligatorio en la UI).
 */
export type AccionSolicitud = "enviar" | "aprobar" | "rechazar" | "cerrar";

export interface DefinicionAccion<T extends string = string> {
  readonly clave: T;
  readonly etiqueta: string;
  readonly peligro?: boolean;
  /** Requiere motivo obligatorio (rechazo). */
  readonly pideMotivo?: boolean;
}

export const ACCIONES_SOLICITUD: DefinicionAccion<AccionSolicitud>[] = [
  { clave: "enviar", etiqueta: "Enviar" },
  { clave: "aprobar", etiqueta: "Aprobar" },
  { clave: "rechazar", etiqueta: "Rechazar", peligro: true, pideMotivo: true },
  { clave: "cerrar", etiqueta: "Cerrar" },
];

/** Acciones OFRECIDAS por estado (mapa de presentación; el motor decide). */
export const ACCIONES_SOLICITUD_POR_ESTADO: Record<string, AccionSolicitud[]> = {
  BORRADOR: ["enviar"],
  ENVIADA: ["aprobar", "rechazar"],
  APROBADA: ["cerrar"],
};

/* ---------------- Acciones Workflow: Orden de compra (1:1) -------------- */

export type AccionOC = "aprobar" | "enviar" | "cancelar";

export const ACCIONES_OC: DefinicionAccion<AccionOC>[] = [
  { clave: "aprobar", etiqueta: "Aprobar" },
  { clave: "enviar", etiqueta: "Enviar al proveedor" },
  { clave: "cancelar", etiqueta: "Cancelar", peligro: true },
];

export const ACCIONES_OC_POR_ESTADO: Record<string, AccionOC[]> = {
  BORRADOR: ["aprobar", "cancelar"],
  APROBADA: ["enviar", "cancelar"],
  ENVIADA: ["cancelar"],
};

/* ------------------------------ Catálogos ------------------------------- */

/** Catálogos de tenant consultables vía `/catalogos/:catalogo`. */
export const CATALOGO_TIPO_ARTICULO = "tiposArticulo";
export const CATALOGO_FAMILIA = "familias";
export const CATALOGO_UNIDAD = "unidades";
export const CATALOGO_METODO_VALORACION = "metodosValoracion";
export const CATALOGO_MONEDA = "monedas";
export const CATALOGO_TIPO_PROVEEDOR = "tiposProveedor";
export const CATALOGO_PRIORIDAD = "prioridades";
export const CATALOGO_ORIGEN_SOLICITUD = "origenesSolicitud";
export const CATALOGO_NOVEDAD_RECEPCION = "novedadesRecepcion";
export const CATALOGO_CONDICION_PAGO = "condicionesPago";

/* ---------------------- Tipos de artículo (fallback) -------------------- */

/**
 * Tipos de artículo del catálogo maestro. Se prefieren los del catálogo del
 * tenant; esto es el respaldo de presentación cuando el catálogo está vacío.
 */
export const TIPOS_ARTICULO: { valor: string; etiqueta: string }[] = [
  { valor: "producto", etiqueta: "Producto" },
  { valor: "servicio", etiqueta: "Servicio" },
  { valor: "lubricante", etiqueta: "Lubricante" },
  { valor: "consumible", etiqueta: "Consumible" },
  { valor: "componente", etiqueta: "Componente" },
  { valor: "kit", etiqueta: "Kit" },
  { valor: "herramienta", etiqueta: "Herramienta" },
  { valor: "servicio-externo", etiqueta: "Servicio externo" },
];

/** Métodos de valoración de costo (presentación / fallback). */
export const METODOS_VALORACION: { valor: string; etiqueta: string }[] = [
  { valor: "promedio", etiqueta: "Costo promedio" },
  { valor: "ultimo", etiqueta: "Último costo" },
  { valor: "estandar", etiqueta: "Costo estándar" },
];

/** Prioridades de solicitud (presentación / fallback). */
export const PRIORIDADES: { valor: string; etiqueta: string }[] = [
  { valor: "baja", etiqueta: "Baja" },
  { valor: "media", etiqueta: "Media" },
  { valor: "alta", etiqueta: "Alta" },
  { valor: "critica", etiqueta: "Crítica" },
];

/**
 * Orígenes declarativos de una solicitud (de dónde nace la necesidad). Cada uno
 * puede referenciar la entidad del módulo de origen (deep links bidireccionales).
 */
export const ORIGENES_SOLICITUD: { valor: string; etiqueta: string }[] = [
  { valor: "inventario", etiqueta: "Inventario (quiebre de stock)" },
  { valor: "orden", etiqueta: "Orden de trabajo" },
  { valor: "plan", etiqueta: "Plan de mantenimiento" },
  { valor: "usuario", etiqueta: "Solicitud de usuario" },
];
