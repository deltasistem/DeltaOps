/**
 * DGP-012 · Constantes del módulo Enterprise Maintenance Plans (frontend).
 *
 * Apunta al contrato CONGELADO montado en `/api/deltaops/planes` (sesión
 * obligatoria por cookie). No duplica lógica de negocio: sólo referencia
 * nombres de comandos y catálogos de presentación. El backend es la autoridad
 * (Workflow Engine gobierna las transiciones; el frontend nunca hace bypass).
 * El OpenAPI congelado (`lib/module-planes/openapi/planes.openapi.json`) es la
 * fuente de verdad EXACTA de los payloads.
 */

/** Namespace de los comandos del módulo (para la cola /sync). */
export const MODULO = "modulo.planes";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo. */
export const API_BASE = "/api/deltaops/planes";

/** URL del endpoint de sincronización offline del módulo. */
export const SYNC_URL = "/api/deltaops/planes/sync";

/** Espacio de nombres de la cola offline (deltaops:planes:cola:<tenant>). */
export const MODULO_OFFLINE = "planes";

/** Tamaño de página de las tablas del módulo. */
export const TAMANO_PAGINA = 12;

export type Tono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

/* ------------------------------- Estados -------------------------------- */

/**
 * Estados del ciclo de vida de un plan (Workflow del dominio). El backend es la
 * autoridad; esto sólo controla la PRESENTACIÓN (etiqueta + tono).
 */
export const ETIQUETA_ESTADO_PLAN: Record<string, string> = {
  BORRADOR: "Borrador",
  VIGENTE: "Vigente",
  SUSPENDIDO: "Suspendido",
  FINALIZADO: "Finalizado",
  ARCHIVADO: "Archivado",
};

export const TONO_ESTADO_PLAN: Record<string, Tono> = {
  BORRADOR: "neutro",
  VIGENTE: "exito",
  SUSPENDIDO: "advertencia",
  FINALIZADO: "info",
  ARCHIVADO: "neutro",
};

/* --------------------------- Acciones Workflow -------------------------- */

/**
 * Acciones de transición del plan EXACTAS del enum del contrato
 * (`TransicionarPlan.accion`). Cada botón de la UI envía SU acción real; nunca
 * se mapea todo a un único comando.
 */
export type AccionPlan =
  | "suspender"
  | "reanudar"
  | "posponer"
  | "extender"
  | "cancelar"
  | "reprogramar";

export interface DefinicionAccion {
  readonly clave: AccionPlan;
  readonly etiqueta: string;
  /** Estilo destructivo (rojo). */
  readonly peligro?: boolean;
  /** Requiere una fecha `hasta` (posponer/extender/reprogramar). */
  readonly pideHasta?: boolean;
}

/**
 * El contrato exige SIEMPRE `motivo` en toda transición. Las acciones con
 * horizonte temporal (`posponer`/`extender`/`reprogramar`) además piden `hasta`.
 */
export const ACCIONES_PLAN: DefinicionAccion[] = [
  { clave: "suspender", etiqueta: "Suspender" },
  { clave: "reanudar", etiqueta: "Reanudar" },
  { clave: "posponer", etiqueta: "Posponer", pideHasta: true },
  { clave: "extender", etiqueta: "Extender", pideHasta: true },
  { clave: "reprogramar", etiqueta: "Reprogramar", pideHasta: true },
  { clave: "cancelar", etiqueta: "Cancelar", peligro: true },
];

/**
 * Acciones OFRECIDAS según el estado actual del plan (mapa de presentación; el
 * motor rechaza cualquier transición inválida). Sólo se muestran botones con
 * soporte real en el contrato.
 */
export const ACCIONES_POR_ESTADO: Record<string, AccionPlan[]> = {
  VIGENTE: ["suspender", "posponer", "extender", "reprogramar", "cancelar"],
  SUSPENDIDO: ["reanudar", "cancelar"],
};

/* ------------------------------ Catálogos ------------------------------- */

/** Catálogos de tenant consultables vía `/catalogos/:catalogo`. */
export const CATALOGO_TIPO_PLAN = "tiposPlan";
export const CATALOGO_ESTRATEGIA = "estrategias";
export const CATALOGO_PRIORIDAD = "prioridades";

/* ---------------------- Frecuencias / generación ------------------------ */

/** Tipos de regla de frecuencia soportados por el motor (presentación). */
export const TIPOS_FRECUENCIA: { valor: string; etiqueta: string; usaUnidad?: boolean; usaEvento?: boolean }[] = [
  { valor: "dias", etiqueta: "Cada N días", usaUnidad: true },
  { valor: "semanas", etiqueta: "Cada N semanas", usaUnidad: true },
  { valor: "meses", etiqueta: "Cada N meses", usaUnidad: true },
  { valor: "anios", etiqueta: "Cada N años", usaUnidad: true },
  { valor: "horas", etiqueta: "Cada N horas de operación", usaUnidad: true },
  { valor: "horometro", etiqueta: "Por horómetro", usaUnidad: true },
  { valor: "odometro", etiqueta: "Por odómetro", usaUnidad: true },
  { valor: "ciclos", etiqueta: "Por ciclos", usaUnidad: true },
  { valor: "produccion", etiqueta: "Por producción", usaUnidad: true },
  { valor: "contador", etiqueta: "Por contador", usaUnidad: true },
  { valor: "eventos", etiqueta: "Por eventos", usaEvento: true },
];

/**
 * Modo de combinación cuando hay varias reglas. `lo-que-ocurra-primero` es el
 * caso "cada 30 días O 250 horas, lo que ocurra primero".
 */
export const MODOS_FRECUENCIA: { valor: string; etiqueta: string }[] = [
  { valor: "simple", etiqueta: "Regla única" },
  { valor: "lo-que-ocurra-primero", etiqueta: "Combinada — lo que ocurra primero" },
  { valor: "todas", etiqueta: "Combinada — cuando se cumplan todas" },
];

/** Orígenes de evaluación de generación (enum del contrato). */
export const ORIGENES_GENERACION: { valor: string; etiqueta: string }[] = [
  { valor: "manual", etiqueta: "Manual" },
  { valor: "programada", etiqueta: "Programada" },
  { valor: "frecuencia", etiqueta: "Por frecuencia" },
  { valor: "horometro", etiqueta: "Por horómetro" },
  { valor: "odometro", etiqueta: "Por odómetro" },
  { valor: "eventos", etiqueta: "Por eventos" },
  { valor: "multiple", etiqueta: "Múltiple" },
];

/** Tipos de calendario y ámbito. */
export const AMBITOS_CALENDARIO: { valor: string; etiqueta: string }[] = [
  { valor: "empresa", etiqueta: "Empresa" },
  { valor: "proyecto", etiqueta: "Proyecto" },
  { valor: "activo", etiqueta: "Activo" },
];

export const TIPOS_VENTANA: { valor: string; etiqueta: string }[] = [
  { valor: "festivo", etiqueta: "Festivo" },
  { valor: "parada", etiqueta: "Parada" },
  { valor: "ventana", etiqueta: "Ventana de mantenimiento" },
  { valor: "bloqueo", etiqueta: "Bloqueo" },
  { valor: "exclusion", etiqueta: "Exclusión" },
];
