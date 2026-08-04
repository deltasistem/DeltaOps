/**
 * DGP-008.3 · Framework offline — tipos.
 * Reutiliza el protocolo de sincronización del módulo (POST /activos/sync):
 * cada operación es `{opId, comando, input}` y el servidor devuelve un recibo
 * con estado terminal (aplicada/idempotente/conflicto/rechazada/reintentable).
 */

/** Estados del recibo de sincronización (espejo de EstadoSync del módulo). */
export type EstadoSync =
  | "aplicada"
  | "idempotente"
  | "conflicto"
  | "rechazada"
  | "reintentable";

/** Estado local de una operación en la cola. */
export type EstadoOperacion = "pendiente" | "enviando" | EstadoSync;

/** Operación encolada. */
export interface OperacionCola {
  /** UUID único e idempotente de la operación. */
  readonly opId: string;
  /** Comando del módulo, p.ej. "modulo.activos.crear". */
  readonly comando: string;
  /** Payload del comando. */
  readonly input: Record<string, unknown>;
  /** Descripción legible para la UI. */
  readonly descripcion: string;
  /** Momento de encolado (ISO). */
  readonly encoladaAt: string;
  /** Estado local actual. */
  estado: EstadoOperacion;
  /** Nº de intentos realizados. */
  intentos: number;
  /** Último error/mensaje. */
  mensaje?: string;
  /** Estado ACTUAL del activo cuando hay conflicto (para resolución). */
  actual?: unknown;
  /** Resultado del comando cuando se aplicó. */
  resultado?: unknown;
  /** Momento del último intento (ISO). */
  actualizadaAt?: string;
}

/** Recibo devuelto por el servidor para una operación. */
export interface ReciboSync {
  readonly opId: string;
  readonly comando: string;
  readonly estado: EstadoSync;
  readonly replay?: boolean;
  readonly resultado?: unknown;
  readonly actual?: unknown;
  readonly error?: string;
  readonly advertencia?: string;
}

/** Resumen agregado devuelto por /sync. */
export interface ResumenSync {
  readonly total: number;
  readonly aplicadas: number;
  readonly idempotentes: number;
  readonly conflictos: number;
  readonly reintentables: number;
  readonly rechazadas: number;
  readonly resultados: readonly ReciboSync[];
}

/** Estados terminales de éxito (se pueden purgar). */
export const ESTADOS_EXITO: readonly EstadoSync[] = ["aplicada", "idempotente"];
/** Estados que permiten reintento. */
export const ESTADOS_REINTENTABLE: readonly EstadoOperacion[] = ["pendiente", "reintentable"];
