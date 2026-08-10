/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Eventos de dominio.
 *
 * TODOS los eventos son AUTOSUFICIENTES: su payload contiene el estado completo
 * necesario para proyectar/reconstruir sin releer el aggregate (Offline First).
 * El módulo es de SOLO LECTURA sobre datos ajenos: sus eventos describen ÚNICAMENTE
 * su propia configuración (definiciones/dashboards) y los snapshots de evaluación.
 */

/* -------------------------- Definiciones de indicador -------------------- */
export const INDICADOR_DEFINIDO = "modulo.analytics.indicador-definido";
export const INDICADOR_ACTUALIZADO = "modulo.analytics.indicador-actualizado";
export const INDICADOR_HABILITADO = "modulo.analytics.indicador-habilitado";

/* ------------------------------- Dashboards ------------------------------ */
export const DASHBOARD_CREADO = "modulo.analytics.dashboard-creado";
export const DASHBOARD_ACTUALIZADO = "modulo.analytics.dashboard-actualizado";
export const DASHBOARD_CLONADO = "modulo.analytics.dashboard-clonado";
export const DASHBOARD_ELIMINADO = "modulo.analytics.dashboard-eliminado";

/* ----------------------------- Snapshots (offline) ---------------------- */
export const SNAPSHOT_MATERIALIZADO = "modulo.analytics.snapshot-materializado";

/** Registro auditable de hitos de la configuración analítica (timeline). */
export const HISTORIAL_REGISTRADO = "modulo.analytics.historial-registrado";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  INDICADOR_DEFINIDO,
  INDICADOR_ACTUALIZADO,
  INDICADOR_HABILITADO,
  DASHBOARD_CREADO,
  DASHBOARD_ACTUALIZADO,
  DASHBOARD_CLONADO,
  DASHBOARD_ELIMINADO,
  SNAPSHOT_MATERIALIZADO,
  HISTORIAL_REGISTRADO,
] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
