/**
 * DGP-014 · Constantes del módulo Enterprise Preventive Maintenance (frontend).
 *
 * Apunta al contrato CONGELADO montado en `/api/deltaops/preventivo` (sesión
 * obligatoria por cookie). No duplica lógica de negocio: sólo referencia
 * nombres de comandos y catálogos de presentación. El backend es la autoridad
 * (Workflow Engine gobierna las transiciones; el frontend nunca hace bypass). El
 * OpenAPI congelado (`lib/module-preventivo/openapi/preventivo.openapi.json`) es
 * la fuente de verdad EXACTA de los payloads.
 */

/** Namespace de los comandos del módulo (para la cola /sync). */
export const MODULO = "modulo.preventivo";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo. */
export const API_BASE = "/api/deltaops/preventivo";

/** URL del endpoint de sincronización offline del módulo. */
export const SYNC_URL = "/api/deltaops/preventivo/sync";

/** Espacio de nombres de la cola offline (deltaops:preventivo:cola:<tenant>). */
export const MODULO_OFFLINE = "preventivo";

/** Tamaño de página de las tablas del módulo. */
export const TAMANO_PAGINA = 12;

export type Tono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

/* ------------------------------- Estados -------------------------------- */

/**
 * Estados del ciclo de vida de un PROGRAMA preventivo (Workflow del dominio). El
 * backend es la autoridad; esto sólo controla la PRESENTACIÓN (etiqueta + tono).
 */
export const ETIQUETA_ESTADO_PROGRAMA: Record<string, string> = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  PUBLICADO: "Publicado",
  SUSPENDIDO: "Suspendido",
  ARCHIVADO: "Archivado",
};

export const TONO_ESTADO_PROGRAMA: Record<string, Tono> = {
  BORRADOR: "neutro",
  EN_REVISION: "info",
  PUBLICADO: "exito",
  SUSPENDIDO: "advertencia",
  ARCHIVADO: "neutro",
};

/* --------------------------- Acciones Workflow -------------------------- */

/**
 * Acciones de transición del programa EXACTAS del contrato
 * (`TransicionarPrograma.accion`: enviarRevision|publicar|suspender|reanudar|
 * archivar). Cada botón de la UI envía SU acción real; nunca se mapea todo a un
 * único comando.
 */
export type AccionPrograma =
  | "enviarRevision"
  | "publicar"
  | "suspender"
  | "reanudar"
  | "archivar";

export interface DefinicionAccion {
  readonly clave: AccionPrograma;
  readonly etiqueta: string;
  /** Estilo destructivo (rojo) → abre confirmación. */
  readonly peligro?: boolean;
}

/** Catálogo de presentación de las acciones (etiqueta + estilo). */
export const ACCIONES_PROGRAMA: DefinicionAccion[] = [
  { clave: "enviarRevision", etiqueta: "Enviar a revisión" },
  { clave: "publicar", etiqueta: "Publicar" },
  { clave: "suspender", etiqueta: "Suspender" },
  { clave: "reanudar", etiqueta: "Reanudar" },
  { clave: "archivar", etiqueta: "Archivar", peligro: true },
];

/**
 * Acciones OFRECIDAS según el estado actual del programa (mapa de presentación;
 * el motor rechaza cualquier transición inválida). Sólo botones con soporte real.
 */
export const ACCIONES_PROGRAMA_POR_ESTADO: Record<string, AccionPrograma[]> = {
  BORRADOR: ["enviarRevision", "archivar"],
  EN_REVISION: ["publicar", "archivar"],
  PUBLICADO: ["suspender", "archivar"],
  SUSPENDIDO: ["reanudar", "archivar"],
};

/* ------------------------------ Catálogos ------------------------------- */

/** Catálogos de tenant consultables vía `/catalogos/:catalogo`. */
export const CATALOGO_TIPO_PROGRAMA = "tiposPrograma";
export const CATALOGO_CLASIFICACION = "clasificaciones";
export const CATALOGO_MOTIVO_REPROGRAMACION = "motivosReprogramacion";
export const CATALOGO_MOTIVO_SUSPENSION = "motivosSuspension";
export const CATALOGO_MOTIVO_EXCLUSION = "motivosExclusion";

/* ------------------------ Ámbitos y disparadores ------------------------ */

/** Ámbitos de suspensión (enum del contrato: programa|actividad|activo). */
export const AMBITOS_SUSPENSION: { valor: string; etiqueta: string }[] = [
  { valor: "programa", etiqueta: "Programa completo" },
  { valor: "actividad", etiqueta: "Una actividad" },
  { valor: "activo", etiqueta: "Un activo" },
];

/** Orígenes de generación (presentación). */
export const ORIGENES_GENERACION: { valor: string; etiqueta: string }[] = [
  { valor: "manual", etiqueta: "Manual" },
  { valor: "programada", etiqueta: "Programada" },
  { valor: "calendario", etiqueta: "Calendario" },
  { valor: "horometro", etiqueta: "Por horómetro" },
  { valor: "odometro", etiqueta: "Por odómetro" },
  { valor: "ciclos", etiqueta: "Por ciclos" },
  { valor: "produccion", etiqueta: "Por producción" },
];

/**
 * Disparadores/frecuencias soportados (presentación de la ficha del programa;
 * el detalle vive en los planes referenciados de `modulo.planes`).
 */
export const TIPOS_FRECUENCIA: { valor: string; etiqueta: string }[] = [
  { valor: "calendario", etiqueta: "Calendario" },
  { valor: "dias", etiqueta: "Cada N días" },
  { valor: "semanas", etiqueta: "Cada N semanas" },
  { valor: "meses", etiqueta: "Cada N meses" },
  { valor: "anios", etiqueta: "Cada N años" },
  { valor: "horas", etiqueta: "Horas de motor" },
  { valor: "horometro", etiqueta: "Horómetro" },
  { valor: "odometro", etiqueta: "Odómetro" },
  { valor: "ciclos", etiqueta: "Ciclos" },
  { valor: "produccion", etiqueta: "Producción" },
  { valor: "multiple", etiqueta: "Múltiples disparadores" },
];

/* --------------------------- Estados de agenda -------------------------- */

/** Estados de una ocurrencia/programación en el calendario (presentación). */
export const ETIQUETA_ESTADO_AGENDA: Record<string, string> = {
  vencido: "Vencido",
  proximo: "Próximo",
  generado: "Generado",
  excluido: "Excluido",
  suspendido: "Suspendido",
  planificado: "Planificado",
};

export const TONO_ESTADO_AGENDA: Record<string, Tono> = {
  vencido: "error",
  proximo: "advertencia",
  generado: "exito",
  excluido: "neutro",
  suspendido: "info",
  planificado: "primario",
};

/** Vistas del calendario preventivo. */
export type VistaCalendario = "anual" | "mensual" | "semanal" | "diaria" | "gantt";

export const VISTAS_CALENDARIO: { valor: VistaCalendario; etiqueta: string }[] = [
  { valor: "anual", etiqueta: "Anual" },
  { valor: "mensual", etiqueta: "Mensual" },
  { valor: "semanal", etiqueta: "Semanal" },
  { valor: "diaria", etiqueta: "Diaria" },
  { valor: "gantt", etiqueta: "Gantt" },
];
