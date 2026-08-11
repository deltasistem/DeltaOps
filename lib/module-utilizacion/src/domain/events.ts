/**
 * DGP-019.1 · Módulo de Utilización — Eventos de dominio.
 *
 * TODOS los eventos son AUTOSUFICIENTES: su payload contiene el estado completo
 * necesario para proyectar/reconstruir sin releer el aggregate (Offline First y
 * replay desde la bitácora durable `utl_eventos`). El outbox NO es event store.
 */

/* ------------------------------- Lecturas -------------------------------- */
export const LECTURA_REGISTRADA = "modulo.utilizacion.lectura-registrada";
/** Lectura conservada pero marcada inconsistente (decreciente sin reinicio). */
export const LECTURA_INCONSISTENTE = "modulo.utilizacion.lectura-inconsistente";
export const LECTURA_ANULADA = "modulo.utilizacion.lectura-anulada";
/** Regularización explícita del medidor (reinicio de tramo, auditada). */
export const REINICIO_MEDIDOR = "modulo.utilizacion.reinicio-medidor";

/* -------------------------------- Tanqueos ------------------------------- */
export const TANQUEO_REGISTRADO = "modulo.utilizacion.tanqueo-registrado";
export const TANQUEO_ANULADO = "modulo.utilizacion.tanqueo-anulado";

/* --------------- Sincronización con Activos (último valor) --------------- */
/** El intento de propagar el último valor a Activos falló de forma ruidosa. */
export const SINCRONIZACION_FALLIDA = "modulo.utilizacion.sincronizacion-fallida";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  LECTURA_REGISTRADA,
  LECTURA_INCONSISTENTE,
  LECTURA_ANULADA,
  REINICIO_MEDIDOR,
  TANQUEO_REGISTRADO,
  TANQUEO_ANULADO,
  SINCRONIZACION_FALLIDA,
] as const;

export type EventoModulo = (typeof EVENTOS_MODULO)[number];
