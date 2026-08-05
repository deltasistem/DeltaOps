/**
 * DGP-009.3 · Constantes del módulo de Órdenes de Trabajo (frontend).
 *
 * Reutiliza el vocabulario canónico del dominio (DGP-009.1): estados, comandos
 * de transición del Workflow Engine y acciones de bitácora. NO duplica lógica de
 * negocio: solo referencia los nombres públicos que el backend expone.
 */

/** Nombre del módulo (namespace de comandos de sincronización). */
export const MODULO = "modulo.ordenes";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo (las rutas cuelgan de aquí). */
export const API_BASE = "/api/deltaops/ordenes";

/** Estados de negocio canónicos (espejo de `ESTADOS` del dominio). */
export const ESTADOS = [
  "BORRADOR",
  "ABIERTA",
  "PLANIFICADA",
  "ASIGNADA",
  "EN_EJECUCION",
  "PAUSADA",
  "EN_VALIDACION",
  "CERRADA",
  "CANCELADA",
] as const;
export type EstadoOrden = (typeof ESTADOS)[number] | string;

export const ESTADOS_FINALES: readonly string[] = ["CERRADA", "CANCELADA"];

/** Etiqueta legible por estado. */
export const ETIQUETA_ESTADO: Record<string, string> = {
  BORRADOR: "Borrador",
  ABIERTA: "Abierta",
  PLANIFICADA: "Planificada",
  ASIGNADA: "Asignada",
  EN_EJECUCION: "En ejecución",
  PAUSADA: "En espera",
  EN_VALIDACION: "En validación",
  CERRADA: "Cerrada",
  CANCELADA: "Cancelada",
};

/** Tono visual del Design System por estado (Badge/Timeline). */
export type TonoEstado = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";
export const TONO_ESTADO: Record<string, TonoEstado> = {
  BORRADOR: "neutro",
  ABIERTA: "info",
  PLANIFICADA: "info",
  ASIGNADA: "primario",
  EN_EJECUCION: "primario",
  PAUSADA: "advertencia",
  EN_VALIDACION: "advertencia",
  CERRADA: "exito",
  CANCELADA: "error",
};

/**
 * Comandos NEUTROS del Workflow Engine (camelCase) disparados por
 * `POST /:id/transicionar {comando}`. El motor resuelve la transición aplicable
 * según el estado actual (no hay lógica de transición en el frontend).
 */
export const CMD = {
  abrir: "abrir",
  planificar: "planificar",
  asignar: "asignar",
  iniciar: "iniciar",
  pausar: "pausar",
  reanudar: "reanudarEjecucion",
  enviarValidacion: "enviarValidacion",
  devolver: "devolver",
  cerrar: "cerrar",
  cancelar: "cancelar",
} as const;
export type ComandoTransicion = (typeof CMD)[keyof typeof CMD];

/**
 * Transiciones disponibles desde cada estado (para pintar acciones inmediatas).
 * Es un MAPA DE PRESENTACIÓN derivado del ciclo de vida canónico; el backend es
 * la autoridad (rechaza transiciones no aplicables). No implementa la máquina.
 */
export const TRANSICIONES: Record<string, { comando: ComandoTransicion; etiqueta: string; requiereValidacion?: boolean }[]> = {
  BORRADOR: [{ comando: CMD.abrir, etiqueta: "Abrir" }, { comando: CMD.cancelar, etiqueta: "Cancelar" }],
  ABIERTA: [{ comando: CMD.planificar, etiqueta: "Planificar" }, { comando: CMD.cancelar, etiqueta: "Cancelar" }],
  PLANIFICADA: [{ comando: CMD.asignar, etiqueta: "Asignar" }, { comando: CMD.cancelar, etiqueta: "Cancelar" }],
  ASIGNADA: [{ comando: CMD.iniciar, etiqueta: "Iniciar ejecución" }, { comando: CMD.cancelar, etiqueta: "Cancelar" }],
  EN_EJECUCION: [
    { comando: CMD.pausar, etiqueta: "Pausar" },
    { comando: CMD.enviarValidacion, etiqueta: "Enviar a validación" },
    { comando: CMD.cancelar, etiqueta: "Cancelar" },
  ],
  PAUSADA: [{ comando: CMD.reanudar, etiqueta: "Reanudar" }, { comando: CMD.cancelar, etiqueta: "Cancelar" }],
  EN_VALIDACION: [
    { comando: CMD.cerrar, etiqueta: "Aprobar y cerrar", requiereValidacion: true },
    { comando: CMD.devolver, etiqueta: "Devolver", requiereValidacion: true },
  ],
};

/** Acciones de bitácora operacional (espejo del enum del dominio). */
export const ACCIONES_BITACORA = [
  "inicio",
  "pausa",
  "reanudacion",
  "espera",
  "cambio-responsable",
  "llegada",
  "salida",
  "finalizacion",
] as const;
export type AccionBitacora = (typeof ACCIONES_BITACORA)[number];

export const ETIQUETA_BITACORA: Record<AccionBitacora, string> = {
  inicio: "Inicio de trabajo",
  pausa: "Pausa",
  reanudacion: "Reanudación",
  espera: "En espera",
  "cambio-responsable": "Cambio de responsable",
  llegada: "Llegada al sitio",
  salida: "Salida del sitio",
  finalizacion: "Finalización",
};

/**
 * Definición de las bandejas del Centro de Operaciones. `estado` (si existe)
 * filtra por estado en servidor; las bandejas "mis"/"vencer"/"criticas" aplican
 * un predicado adicional en cliente sobre el read model.
 */
export type BandejaId =
  | "mis"
  | "pendientes"
  | "nuevas"
  | "ejecucion"
  | "espera"
  | "validacion"
  | "vencer"
  | "criticas"
  | "canceladas"
  | "cerradas";

export interface BandejaDef {
  id: BandejaId;
  etiqueta: string;
  descripcion: string;
  /** Estado que filtra en servidor (undefined = todas). */
  estado?: string;
}

export const BANDEJAS: BandejaDef[] = [
  { id: "mis", etiqueta: "Mis órdenes", descripcion: "Asignadas a mí" },
  { id: "pendientes", etiqueta: "Pendientes", descripcion: "Asignadas sin iniciar", estado: "ASIGNADA" },
  { id: "nuevas", etiqueta: "Nuevas", descripcion: "Recién abiertas", estado: "ABIERTA" },
  { id: "ejecucion", etiqueta: "En ejecución", descripcion: "Trabajo en curso", estado: "EN_EJECUCION" },
  { id: "espera", etiqueta: "En espera", descripcion: "Pausadas", estado: "PAUSADA" },
  { id: "validacion", etiqueta: "En validación", descripcion: "Pendientes de aprobar", estado: "EN_VALIDACION" },
  { id: "vencer", etiqueta: "Próximas a vencer", descripcion: "SLA cercano al límite" },
  { id: "criticas", etiqueta: "Críticas", descripcion: "Prioridad/severidad alta" },
  { id: "canceladas", etiqueta: "Canceladas", descripcion: "Descartadas", estado: "CANCELADA" },
  { id: "cerradas", etiqueta: "Cerradas", descripcion: "Completadas", estado: "CERRADA" },
];
