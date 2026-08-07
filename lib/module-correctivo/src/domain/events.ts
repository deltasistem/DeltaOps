/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Eventos de dominio.
 *
 * TODOS los eventos son AUTOSUFICIENTES: su payload contiene el estado completo
 * necesario para proyectar/reconstruir sin releer el aggregate (Offline First).
 * El dominio es NEUTRO: tipos de falla, modos, causas, prioridades, orígenes,
 * etc. llegan por catálogos configurables, jamás por enums.
 */

/* -------------------------- Solicitud de mantenimiento ------------------- */
export const SOLICITUD_CREADA = "modulo.correctivo.solicitud-creada";
export const SOLICITUD_ACTUALIZADA = "modulo.correctivo.solicitud-actualizada";
export const SOLICITUD_TRANSICIONADA = "modulo.correctivo.solicitud-transicionada";
export const SOLICITUD_EVIDENCIA_ADJUNTADA = "modulo.correctivo.solicitud-evidencia-adjuntada";
export const SOLICITUD_COMENTARIO_REGISTRADO = "modulo.correctivo.solicitud-comentario-registrado";

/* ------------------------------- Diagnóstico ----------------------------- */
export const DIAGNOSTICO_REGISTRADO = "modulo.correctivo.diagnostico-registrado";

/* ------------------------------ Intervención ----------------------------- */
export const INTERVENCION_CREADA = "modulo.correctivo.intervencion-creada";
export const INTERVENCION_TRANSICIONADA = "modulo.correctivo.intervencion-transicionada";
export const INTERVENCION_ASIGNADA = "modulo.correctivo.intervencion-asignada";

/* --------------------------- Generación de OT ---------------------------- */
export const ORDEN_DECIDIDA = "modulo.correctivo.orden-decidida";
export const ORDEN_MATERIALIZADA = "modulo.correctivo.orden-materializada";

/* --------------------- Composición Inventario / Abasto ------------------- */
export const INVENTARIO_CONSUMIDO = "modulo.correctivo.inventario-consumido";
export const INVENTARIO_DEVUELTO = "modulo.correctivo.inventario-devuelto";
export const REPUESTOS_RESERVADOS = "modulo.correctivo.repuestos-reservados";
export const COMPRA_SOLICITADA = "modulo.correctivo.compra-solicitada";

/* ---------------------- Eventos hacia Activos (historial) ---------------- */
export const EVENTO_ACTIVO_REGISTRADO = "modulo.correctivo.evento-activo-registrado";
export const REINCIDENCIA_DETECTADA = "modulo.correctivo.reincidencia-detectada";

/** Registro auditable de hitos del ciclo de vida (timeline/histórico). */
export const HISTORIAL_REGISTRADO = "modulo.correctivo.historial-registrado";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  SOLICITUD_CREADA,
  SOLICITUD_ACTUALIZADA,
  SOLICITUD_TRANSICIONADA,
  SOLICITUD_EVIDENCIA_ADJUNTADA,
  SOLICITUD_COMENTARIO_REGISTRADO,
  DIAGNOSTICO_REGISTRADO,
  INTERVENCION_CREADA,
  INTERVENCION_TRANSICIONADA,
  INTERVENCION_ASIGNADA,
  ORDEN_DECIDIDA,
  ORDEN_MATERIALIZADA,
  INVENTARIO_CONSUMIDO,
  INVENTARIO_DEVUELTO,
  REPUESTOS_RESERVADOS,
  COMPRA_SOLICITADA,
  EVENTO_ACTIVO_REGISTRADO,
  REINCIDENCIA_DETECTADA,
  HISTORIAL_REGISTRADO,
] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
