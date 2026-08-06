/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Eventos de dominio (tipos canónicos).
 *
 * TODOS los eventos son AUTOSUFICIENTES: su payload contiene el estado completo
 * necesario para proyectar/reconstruir sin releer el aggregate (Offline First).
 * El dominio es NEUTRO: tipos/estrategias/estados llegan por catálogos
 * configurables, jamás por enums.
 */
export const PLAN_CREADO = "modulo.planes.plan-creado";
export const PLAN_ACTUALIZADO = "modulo.planes.plan-actualizado";
export const PLAN_PUBLICADO = "modulo.planes.plan-publicado";
export const PLAN_SUSPENDIDO = "modulo.planes.plan-suspendido";
export const PLAN_REANUDADO = "modulo.planes.plan-reanudado";
export const PLAN_ARCHIVADO = "modulo.planes.plan-archivado";
export const PLAN_EJECUTADO = "modulo.planes.plan-ejecutado";
export const ORDEN_GENERADA = "modulo.planes.orden-generada";
export const ORDEN_MATERIALIZADA = "modulo.planes.orden-materializada";
export const CALENDARIO_CREADO = "modulo.planes.calendario-creado";
export const HISTORIAL_REGISTRADO = "modulo.planes.historial-registrado";
export const FRECUENCIA_CUMPLIDA = "modulo.planes.frecuencia-cumplida";
export const FRECUENCIA_VENCIDA = "modulo.planes.frecuencia-vencida";
export const PLAN_VENCIDO = "modulo.planes.plan-vencido";
export const RUTINA_COMPLETADA = "modulo.planes.rutina-completada";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  PLAN_CREADO,
  PLAN_ACTUALIZADO,
  PLAN_PUBLICADO,
  PLAN_SUSPENDIDO,
  PLAN_REANUDADO,
  PLAN_ARCHIVADO,
  PLAN_EJECUTADO,
  ORDEN_GENERADA,
  ORDEN_MATERIALIZADA,
  CALENDARIO_CREADO,
  HISTORIAL_REGISTRADO,
  FRECUENCIA_CUMPLIDA,
  FRECUENCIA_VENCIDA,
  PLAN_VENCIDO,
  RUTINA_COMPLETADA,
] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
