/**
 * DGP-015 · Constantes del módulo Enterprise Corrective Maintenance (frontend).
 *
 * Apunta al contrato CONGELADO montado en `/api/deltaops/correctivo` (sesión
 * obligatoria por cookie). No duplica lógica de negocio: sólo referencia nombres
 * de comandos y catálogos de presentación. El backend es la autoridad (Workflow
 * Engine gobierna las transiciones; el frontend nunca hace bypass). El OpenAPI
 * congelado (`lib/module-correctivo/openapi/correctivo.openapi.json`) es la
 * fuente de verdad EXACTA de los payloads.
 */

/** Namespace de los comandos del módulo (para la cola /sync). */
export const MODULO = "modulo.correctivo";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo. */
export const API_BASE = "/api/deltaops/correctivo";

/** URL del endpoint de sincronización offline del módulo. */
export const SYNC_URL = "/api/deltaops/correctivo/sync";

/** Espacio de nombres de la cola offline (deltaops:correctivo:cola:<tenant>). */
export const MODULO_OFFLINE = "correctivo";

/** Tamaño de página de las tablas del módulo. */
export const TAMANO_PAGINA = 12;

export type Tono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

/* ------------------------- Estados de solicitud ------------------------- */

/**
 * Estados del ciclo de vida de una SOLICITUD correctiva (Workflow del dominio).
 * El backend es la autoridad; esto sólo controla la PRESENTACIÓN.
 */
export const ETIQUETA_ESTADO_SOLICITUD: Record<string, string> = {
  BORRADOR: "Borrador",
  REGISTRADA: "Registrada",
  EN_TRIAGE: "En triage",
  EN_DIAGNOSTICO: "En diagnóstico",
  EN_VALIDACION: "En validación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  GENERADA: "OT generada",
  CERRADA: "Cerrada",
};

export const TONO_ESTADO_SOLICITUD: Record<string, Tono> = {
  BORRADOR: "neutro",
  REGISTRADA: "info",
  EN_TRIAGE: "info",
  EN_DIAGNOSTICO: "primario",
  EN_VALIDACION: "advertencia",
  APROBADA: "exito",
  RECHAZADA: "error",
  GENERADA: "exito",
  CERRADA: "neutro",
};

/* ---------------------- Acciones Workflow · Solicitud ------------------- */

/**
 * Acciones de transición de la solicitud EXACTAS del contrato
 * (`TransicionarSolicitud.accion`: enviarTriage|iniciarDiagnostico|
 * enviarValidacion|aprobar|rechazar). Cada botón envía SU acción real.
 */
export type AccionSolicitud =
  | "enviarTriage"
  | "iniciarDiagnostico"
  | "enviarValidacion"
  | "aprobar"
  | "rechazar";

export interface DefinicionAccion<T extends string> {
  readonly clave: T;
  readonly etiqueta: string;
  /** Estilo destructivo (rojo) → abre confirmación. */
  readonly peligro?: boolean;
  /** Exige motivo obligatorio en la confirmación. */
  readonly exigeMotivo?: boolean;
}

/** Catálogo de presentación de las acciones de solicitud. */
export const ACCIONES_SOLICITUD: DefinicionAccion<AccionSolicitud>[] = [
  { clave: "enviarTriage", etiqueta: "Enviar a triage" },
  { clave: "iniciarDiagnostico", etiqueta: "Iniciar diagnóstico" },
  { clave: "enviarValidacion", etiqueta: "Enviar a validación" },
  { clave: "aprobar", etiqueta: "Aprobar" },
  { clave: "rechazar", etiqueta: "Rechazar", peligro: true, exigeMotivo: true },
];

/**
 * Acciones OFRECIDAS según el estado actual de la solicitud (presentación; el
 * motor rechaza cualquier transición inválida). Sólo botones con soporte real.
 */
export const ACCIONES_SOLICITUD_POR_ESTADO: Record<string, AccionSolicitud[]> = {
  BORRADOR: ["enviarTriage"],
  REGISTRADA: ["enviarTriage"],
  EN_TRIAGE: ["iniciarDiagnostico"],
  EN_DIAGNOSTICO: ["enviarValidacion"],
  EN_VALIDACION: ["aprobar", "rechazar"],
};

/* -------------------- Estados de intervención --------------------------- */

/**
 * Estados de una INTERVENCIÓN correctiva (Workflow del dominio). El backend es
 * la autoridad; esto sólo controla la PRESENTACIÓN.
 */
export const ETIQUETA_ESTADO_INTERVENCION: Record<string, string> = {
  PREPARACION: "Preparación",
  ASIGNACION: "Asignación",
  EJECUCION: "Ejecución",
  VERIFICACION: "Verificación",
  CERRADA: "Cerrada",
};

export const TONO_ESTADO_INTERVENCION: Record<string, Tono> = {
  PREPARACION: "neutro",
  ASIGNACION: "info",
  EJECUCION: "primario",
  VERIFICACION: "advertencia",
  CERRADA: "exito",
};

/* -------------------- Acciones Workflow · Intervención ------------------ */

/**
 * Acciones de transición de la intervención EXACTAS del contrato
 * (`TransicionarIntervencion.accion`: asignar|iniciarEjecucion|
 * enviarVerificacion|cerrar). Cada botón envía SU acción real.
 */
export type AccionIntervencion =
  | "asignar"
  | "iniciarEjecucion"
  | "enviarVerificacion"
  | "cerrar";

export const ACCIONES_INTERVENCION: DefinicionAccion<AccionIntervencion>[] = [
  { clave: "asignar", etiqueta: "Asignar cuadrillas" },
  { clave: "iniciarEjecucion", etiqueta: "Iniciar ejecución" },
  { clave: "enviarVerificacion", etiqueta: "Enviar a verificación" },
  { clave: "cerrar", etiqueta: "Cerrar intervención", peligro: true },
];

export const ACCIONES_INTERVENCION_POR_ESTADO: Record<string, AccionIntervencion[]> = {
  PREPARACION: ["asignar"],
  ASIGNACION: ["iniciarEjecucion"],
  EJECUCION: ["enviarVerificacion"],
  VERIFICACION: ["cerrar"],
};

/* ------------------------------ Orígenes -------------------------------- */

/**
 * Orígenes de una solicitud (enum documentado del contrato:
 * operador|supervisor|produccion|calidad|sst|iot|api). Presentación por
 * defecto; el catálogo de tenant, si existe, tiene prioridad.
 */
export const ORIGENES_SOLICITUD: { valor: string; etiqueta: string }[] = [
  { valor: "operador", etiqueta: "Operador" },
  { valor: "supervisor", etiqueta: "Supervisor" },
  { valor: "produccion", etiqueta: "Producción" },
  { valor: "calidad", etiqueta: "Calidad" },
  { valor: "sst", etiqueta: "SST" },
  { valor: "iot", etiqueta: "IoT" },
  { valor: "api", etiqueta: "API / Integración" },
];

/** Tipos de evidencia (enum documentado: foto|video|documento|audio). */
export const TIPOS_EVIDENCIA: { valor: string; etiqueta: string }[] = [
  { valor: "foto", etiqueta: "Fotografía" },
  { valor: "video", etiqueta: "Video" },
  { valor: "documento", etiqueta: "Documento" },
  { valor: "audio", etiqueta: "Audio" },
];

/**
 * Tipos de evento de activo (enum documentado del contrato:
 * falla-reportada|falla-confirmada|reparacion-iniciada|reparacion-finalizada|
 * puesta-en-servicio).
 */
export const TIPOS_EVENTO_ACTIVO: { valor: string; etiqueta: string }[] = [
  { valor: "falla-reportada", etiqueta: "Falla reportada" },
  { valor: "falla-confirmada", etiqueta: "Falla confirmada" },
  { valor: "reparacion-iniciada", etiqueta: "Reparación iniciada" },
  { valor: "reparacion-finalizada", etiqueta: "Reparación finalizada" },
  { valor: "puesta-en-servicio", etiqueta: "Puesta en servicio" },
];

export const ETIQUETA_TIPO_EVENTO_ACTIVO: Record<string, string> = Object.fromEntries(
  TIPOS_EVENTO_ACTIVO.map((t) => [t.valor, t.etiqueta]),
);

/* ------------------------------ Catálogos ------------------------------- */

/** Catálogos de tenant consultables vía `/catalogos/:catalogo` (sin enums). */
export const CATALOGO_ORIGEN = "origenes";
export const CATALOGO_PRIORIDAD = "prioridades";
export const CATALOGO_SEVERIDAD = "severidades";
export const CATALOGO_IMPACTO = "impactos";
export const CATALOGO_TIPO_FALLA = "tiposFalla";
export const CATALOGO_MODO_FALLA = "modosFalla";
export const CATALOGO_CAUSA = "causas";
export const CATALOGO_EFECTO = "efectos";
export const CATALOGO_SINTOMA = "sintomas";
export const CATALOGO_MOTIVO_RECHAZO = "motivosRechazo";
