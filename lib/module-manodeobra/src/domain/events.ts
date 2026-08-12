/**
 * DGP-020.3 · Eventos de dominio de Mano de Obra.
 *
 * TODOS los eventos son AUTOSUFICIENTES: el payload contiene el estado completo
 * para proyectar read models e inscribir el Shared Timeline sin releer el
 * aggregate (Offline First). El módulo NO emite eventos sobre datos ajenos:
 * describe su propia configuración (categorías/recursos/tarifas) y sus
 * valoraciones (snapshots históricos).
 */

/* ------------------------------- Catálogo -------------------------------- */
export const CATEGORIA_CONFIGURADA = "modulo.manodeobra.categoria-configurada";
export const CATEGORIA_HABILITADA = "modulo.manodeobra.categoria-habilitada";

/* -------------------------------- Recurso -------------------------------- */
export const RECURSO_DEFINIDO = "modulo.manodeobra.recurso-definido";
export const RECURSO_ESTADO_CAMBIADO = "modulo.manodeobra.recurso-estado-cambiado";

/* -------------------------------- Tarifa --------------------------------- */
export const TARIFA_CREADA = "modulo.manodeobra.tarifa-creada";
export const TARIFA_CERRADA = "modulo.manodeobra.tarifa-cerrada";
export const TARIFA_ACTUALIZADA = "modulo.manodeobra.tarifa-actualizada";

/* ------------------------------ Valoración ------------------------------- */
export const VALORACION_REGISTRADA = "modulo.manodeobra.valoracion-registrada";
export const VALORACION_REVALORADA = "modulo.manodeobra.valoracion-revalorada";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  CATEGORIA_CONFIGURADA,
  CATEGORIA_HABILITADA,
  RECURSO_DEFINIDO,
  RECURSO_ESTADO_CAMBIADO,
  TARIFA_CREADA,
  TARIFA_CERRADA,
  TARIFA_ACTUALIZADA,
  VALORACION_REGISTRADA,
  VALORACION_REVALORADA,
] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
