/**
 * DGP-021.3 · Constantes del frontend de Costos de Mantenimiento (composición).
 */

/** Base HTTP del orquestador de composición (api-server). */
export const API_BASE = "/api/deltaops/costos";

/** Períodos soportados por el backend (§10). Fechas REALES del hecho. */
export type PeriodoClave = "total" | "actual" | "30d" | "90d" | "anio" | "rango";

export const PERIODOS: readonly { clave: PeriodoClave; etiqueta: string }[] = [
  { clave: "actual", etiqueta: "Mes actual" },
  { clave: "30d", etiqueta: "Últimos 30 días" },
  { clave: "90d", etiqueta: "Últimos 90 días" },
  { clave: "anio", etiqueta: "Este año" },
  { clave: "total", etiqueta: "Histórico total" },
  { clave: "rango", etiqueta: "Rango personalizado" },
];
