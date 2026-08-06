/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Eventos de dominio.
 *
 * TODOS los eventos son AUTOSUFICIENTES: su payload contiene el estado completo
 * necesario para proyectar/reconstruir sin releer el aggregate (Offline First).
 * El dominio es NEUTRO: tipos de programa, motivos, roles, etc. llegan por
 * catálogos configurables, jamás por enums.
 */

/* --------------------------- Programa preventivo ------------------------- */
export const PROGRAMA_CREADO = "modulo.preventivo.programa-creado";
export const PROGRAMA_ACTUALIZADO = "modulo.preventivo.programa-actualizado";
export const PROGRAMA_TRANSICIONADO = "modulo.preventivo.programa-transicionado";
export const PROGRAMA_VERSIONADO = "modulo.preventivo.programa-versionado";
export const PROGRAMA_REVERTIDO = "modulo.preventivo.programa-revertido";

/* ------------------------- Actividad preventiva -------------------------- */
export const ACTIVIDAD_CREADA = "modulo.preventivo.actividad-creada";
export const ACTIVIDAD_ACTUALIZADA = "modulo.preventivo.actividad-actualizada";

/* --------------------------- Programación -------------------------------- */
export const PROGRAMACION_CALCULADA = "modulo.preventivo.programacion-calculada";
export const PROGRAMACION_REPROGRAMADA = "modulo.preventivo.programacion-reprogramada";
export const PROGRAMACION_SUSPENDIDA = "modulo.preventivo.programacion-suspendida";
export const PROGRAMACION_EXCLUIDA = "modulo.preventivo.programacion-excluida";

/* --------------------------- Generación ---------------------------------- */
export const GENERACION_DECIDIDA = "modulo.preventivo.generacion-decidida";
export const GENERACION_MATERIALIZADA = "modulo.preventivo.generacion-materializada";

/** Registro auditable de hitos del ciclo de vida (timeline/histórico). */
export const HISTORIAL_REGISTRADO = "modulo.preventivo.historial-registrado";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  PROGRAMA_CREADO,
  PROGRAMA_ACTUALIZADO,
  PROGRAMA_TRANSICIONADO,
  PROGRAMA_VERSIONADO,
  PROGRAMA_REVERTIDO,
  ACTIVIDAD_CREADA,
  ACTIVIDAD_ACTUALIZADA,
  PROGRAMACION_CALCULADA,
  PROGRAMACION_REPROGRAMADA,
  PROGRAMACION_SUSPENDIDA,
  PROGRAMACION_EXCLUIDA,
  GENERACION_DECIDIDA,
  GENERACION_MATERIALIZADA,
  HISTORIAL_REGISTRADO,
] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
