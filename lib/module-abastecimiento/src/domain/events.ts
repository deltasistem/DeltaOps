/**
 * DGP-013 · Módulo Enterprise Procurement & Supply Chain — Eventos de dominio.
 *
 * TODOS los eventos son AUTOSUFICIENTES: su payload contiene el estado completo
 * necesario para proyectar/reconstruir sin releer el aggregate (Offline First).
 * El dominio es NEUTRO: tipos de artículo, monedas, condiciones, novedades, etc.
 * llegan por catálogos configurables, jamás por enums.
 */

/* --------------------------- Catálogo maestro ---------------------------- */
export const ARTICULO_CREADO = "modulo.abastecimiento.articulo-creado";
export const ARTICULO_ACTUALIZADO = "modulo.abastecimiento.articulo-actualizado";

/* -------------------------------- Proveedores ---------------------------- */
export const PROVEEDOR_CREADO = "modulo.abastecimiento.proveedor-creado";
export const PROVEEDOR_ACTUALIZADO = "modulo.abastecimiento.proveedor-actualizado";
export const PROVEEDOR_CALIFICADO = "modulo.abastecimiento.proveedor-calificado";

/* ------------------------------- Solicitudes ----------------------------- */
export const SOLICITUD_CREADA = "modulo.abastecimiento.solicitud-creada";
export const SOLICITUD_ENVIADA = "modulo.abastecimiento.solicitud-enviada";
export const SOLICITUD_APROBADA = "modulo.abastecimiento.solicitud-aprobada";
export const SOLICITUD_RECHAZADA = "modulo.abastecimiento.solicitud-rechazada";
export const SOLICITUD_CERRADA = "modulo.abastecimiento.solicitud-cerrada";

/* ------------------------------- Cotizaciones ---------------------------- */
export const COTIZACION_REGISTRADA = "modulo.abastecimiento.cotizacion-registrada";
export const COTIZACION_COMPARADA = "modulo.abastecimiento.cotizacion-comparada";
export const COTIZACION_SELECCIONADA = "modulo.abastecimiento.cotizacion-seleccionada";

/* ----------------------------- Órdenes de compra ------------------------- */
export const ORDEN_COMPRA_CREADA = "modulo.abastecimiento.orden-compra-creada";
export const ORDEN_COMPRA_APROBADA = "modulo.abastecimiento.orden-compra-aprobada";
export const ORDEN_COMPRA_ENVIADA = "modulo.abastecimiento.orden-compra-enviada";
export const ORDEN_COMPRA_CANCELADA = "modulo.abastecimiento.orden-compra-cancelada";
export const ORDEN_COMPRA_RECIBIDA_PARCIAL = "modulo.abastecimiento.orden-compra-recibida-parcial";
export const ORDEN_COMPRA_RECIBIDA_TOTAL = "modulo.abastecimiento.orden-compra-recibida-total";

/* -------------------------------- Recepciones ---------------------------- */
export const RECEPCION_REGISTRADA = "modulo.abastecimiento.recepcion-registrada";

/* ---------------------------------- Costos ------------------------------- */
export const COSTOS_ACTUALIZADOS = "modulo.abastecimiento.costos-actualizados";

/** Registro auditable de hitos del ciclo de vida (timeline/histórico). */
export const HISTORIAL_REGISTRADO = "modulo.abastecimiento.historial-registrado";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  ARTICULO_CREADO,
  ARTICULO_ACTUALIZADO,
  PROVEEDOR_CREADO,
  PROVEEDOR_ACTUALIZADO,
  PROVEEDOR_CALIFICADO,
  SOLICITUD_CREADA,
  SOLICITUD_ENVIADA,
  SOLICITUD_APROBADA,
  SOLICITUD_RECHAZADA,
  SOLICITUD_CERRADA,
  COTIZACION_REGISTRADA,
  COTIZACION_COMPARADA,
  COTIZACION_SELECCIONADA,
  ORDEN_COMPRA_CREADA,
  ORDEN_COMPRA_APROBADA,
  ORDEN_COMPRA_ENVIADA,
  ORDEN_COMPRA_CANCELADA,
  ORDEN_COMPRA_RECIBIDA_PARCIAL,
  ORDEN_COMPRA_RECIBIDA_TOTAL,
  RECEPCION_REGISTRADA,
  COSTOS_ACTUALIZADOS,
  HISTORIAL_REGISTRADO,
] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
