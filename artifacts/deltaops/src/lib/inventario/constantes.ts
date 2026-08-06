/**
 * DGP-011.3 · Constantes del módulo Enterprise Inventory (frontend).
 *
 * Reutiliza el vocabulario público del dominio de Inventario (DGP-011.x) y
 * apunta al contrato CONGELADO montado en `/api/deltaops/inventario`. No duplica
 * lógica de negocio: sólo referencia nombres de comandos y catálogos de
 * presentación. El backend es la autoridad (Workflow Engine gobierna las
 * transiciones; el frontend nunca hace bypass ni auto-aprobación).
 */

/** Namespace de los comandos del módulo (para la cola /sync). */
export const MODULO = "modulo.inventario";

/** Tenant fijo de la instancia DeltaOps. */
export const TENANT = "deltaops";

/** Base HTTP del módulo. */
export const API_BASE = "/api/deltaops/inventario";

/** URL del endpoint de sincronización offline del módulo. */
export const SYNC_URL = "/api/deltaops/inventario/sync";

/** Espacio de nombres de la cola offline (deltaops:inventario:cola:<tenant>). */
export const MODULO_OFFLINE = "inventario";

/* ------------------------------- Estados -------------------------------- */

/** Estados de un item (presentación; el backend es la autoridad). */
export const ETIQUETA_ESTADO_ITEM: Record<string, string> = {
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
  DESCONTINUADO: "Descontinuado",
  BLOQUEADO: "Bloqueado",
};

export type Tono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

export const TONO_ESTADO_ITEM: Record<string, Tono> = {
  ACTIVO: "exito",
  INACTIVO: "neutro",
  DESCONTINUADO: "advertencia",
  BLOQUEADO: "error",
};

/**
 * Estados del ciclo de vida de una TRANSFERENCIA (contrato del dominio). Crear
 * una transferencia la despacha directamente a tránsito; las transiciones son
 * `recibir`/`completar` (ingreso a destino) y `cancelar`/`rechazar` (restitución
 * al origen). El motor resuelve la transición aplicable.
 */
export const ESTADOS_TRANSFERENCIA = [
  "EN_TRANSITO",
  "RECIBIDA",
  "COMPLETADA",
  "CANCELADA",
] as const;
export type EstadoTransferencia = (typeof ESTADOS_TRANSFERENCIA)[number] | string;

export const ETIQUETA_ESTADO_TRANSFERENCIA: Record<string, string> = {
  EN_TRANSITO: "En tránsito",
  RECIBIDA: "Recibida",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

export const TONO_ESTADO_TRANSFERENCIA: Record<string, Tono> = {
  EN_TRANSITO: "primario",
  RECIBIDA: "info",
  COMPLETADA: "exito",
  CANCELADA: "error",
};

/**
 * Transiciones del Workflow para una transferencia según su estado. MAPA DE
 * PRESENTACIÓN de las CUATRO acciones del contrato (`recibir`/`completar`/
 * `cancelar`/`rechazar`); el backend valida y ejecuta la transición real. La UI
 * envía SU acción concreta a `/transferencias/:id/transicion` — nunca mapea todo
 * a "completar". `motivo` es opcional (requerido en la práctica para
 * cancelar/rechazar). `peligro` sólo afecta la presentación.
 */
export type ClaveAccionTransferencia = "recibir" | "completar" | "cancelar" | "rechazar";

export interface AccionTransferencia {
  clave: ClaveAccionTransferencia;
  etiqueta: string;
  peligro?: boolean;
  /** Solicita capturar un motivo antes de ejecutar (cancelar/rechazar). */
  pideMotivo?: boolean;
}

export const ACCIONES_TRANSFERENCIA: Record<string, AccionTransferencia[]> = {
  EN_TRANSITO: [
    { clave: "recibir", etiqueta: "Recibir" },
    { clave: "completar", etiqueta: "Completar" },
    { clave: "rechazar", etiqueta: "Rechazar", peligro: true, pideMotivo: true },
    { clave: "cancelar", etiqueta: "Cancelar", peligro: true, pideMotivo: true },
  ],
  RECIBIDA: [
    { clave: "completar", etiqueta: "Completar" },
  ],
};

/* ------------------------------- Ajustes -------------------------------- */

/** Tipos de ajuste (positivo/negativo). */
export const TIPOS_AJUSTE = [
  { valor: "positivo", etiqueta: "Positivo (incrementa)" },
  { valor: "negativo", etiqueta: "Negativo (reduce)" },
] as const;

/** Motivos canónicos de ajuste (presentación; el backend valida). */
export const MOTIVOS_AJUSTE = [
  { valor: "conteo", etiqueta: "Diferencia de conteo" },
  { valor: "merma", etiqueta: "Merma" },
  { valor: "dano", etiqueta: "Daño" },
  { valor: "vencimiento", etiqueta: "Vencimiento" },
  { valor: "robo", etiqueta: "Robo/pérdida" },
  { valor: "correccion", etiqueta: "Corrección administrativa" },
  { valor: "devolucion", etiqueta: "Devolución" },
] as const;

/* ------------------------------ Movimientos ----------------------------- */

/** Tipos de movimiento de stock (presentación). */
export const TIPOS_MOVIMIENTO = [
  { valor: "entrada", etiqueta: "Entrada" },
  { valor: "salida", etiqueta: "Salida" },
  { valor: "consumo", etiqueta: "Consumo" },
  { valor: "devolucion", etiqueta: "Devolución" },
] as const;

export const ETIQUETA_TIPO_MOVIMIENTO: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  consumo: "Consumo",
  devolucion: "Devolución",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
  reserva: "Reserva",
};

export const TONO_TIPO_MOVIMIENTO: Record<string, Tono> = {
  entrada: "exito",
  salida: "advertencia",
  consumo: "info",
  devolucion: "primario",
  transferencia: "primario",
  ajuste: "neutro",
  reserva: "info",
};

/** Modos de trazabilidad de un item. */
export const MODOS_TRAZABILIDAD = [
  { valor: "ninguna", etiqueta: "Sin trazabilidad" },
  { valor: "lote", etiqueta: "Por lote" },
  { valor: "serie", etiqueta: "Por serie" },
] as const;

/* -------------------------------- Conteos ------------------------------- */

export const TIPOS_CONTEO = [
  { valor: "ciclico", etiqueta: "Cíclico" },
  { valor: "total", etiqueta: "Total" },
  { valor: "puntual", etiqueta: "Puntual" },
] as const;

export const ETIQUETA_ESTADO_CONTEO: Record<string, string> = {
  ABIERTO: "Abierto",
  EN_PROCESO: "En proceso",
  CERRADO: "Cerrado",
  APLICADO: "Aplicado",
  CANCELADO: "Cancelado",
};

export const TONO_ESTADO_CONTEO: Record<string, Tono> = {
  ABIERTO: "info",
  EN_PROCESO: "primario",
  CERRADO: "advertencia",
  APLICADO: "exito",
  CANCELADO: "error",
};

/** Página por defecto para el paginado en cliente del listado. */
export const TAMANO_PAGINA = 10;
