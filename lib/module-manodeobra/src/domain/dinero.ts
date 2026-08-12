/**
 * DGP-020.3 · Dinero y precisión monetaria — DOMINIO PURO.
 *
 * Convención MONETARIA reutilizada de Abastecimiento (DGP-013): importes como
 * número finito no negativo con hasta 4 decimales; el redondeo es DETERMINISTA
 * (Math.round con Number.EPSILON). En PostgreSQL se persiste como
 * numeric(18,6) — JAMÁS floating point sin control.
 *
 * REGLAS NORMATIVAS (directiva §9/§27):
 *  - El TIEMPO efectivo NUNCA se redondea para calcular el costo.
 *  - PRECISIÓN INTERNA: el factor horas = efectivoMs / 3_600_000 se usa SIN
 *    redondear (evita perder minutos/segundos); el producto horas × tarifa se
 *    redondea SÓLO al final a 4 decimales (`redondear`).
 *  - MONEDA: explícita por fila (de `ten_tenants.moneda` por defecto); COP/CLP
 *    son CONFIGURACIÓN inicial, nunca hardcode de dominio.
 *  - Unidad soportada: HORA (única). Otra unidad ⇒ rechazo de negocio.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/** Milisegundos por hora (base del factor de tiempo). */
export const MS_POR_HORA = 3_600_000;

/** Unidades de tarifa soportadas EN ESTA FASE. Sólo HORA (§7). */
export const UNIDADES_TARIFA = ["HORA"] as const;
export type UnidadTarifa = (typeof UNIDADES_TARIFA)[number];

export function esUnidadSoportada(u: string): u is UnidadTarifa {
  return (UNIDADES_TARIFA as readonly string[]).includes(u);
}

/**
 * Redondeo determinista a `decimales` (por defecto 4). Idéntico a
 * Abastecimiento: `Math.round((x + EPSILON) * f) / f`.
 */
export function redondear(valor: number, decimales = 4): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/**
 * Calcula el costo de mano de obra: (efectivoMs / MS_POR_HORA) × tarifaValor.
 * El factor de horas NO se redondea; SÓLO el resultado final se redondea a 4
 * decimales. Devuelve error si los insumos no son finitos/no negativos.
 *
 * Ejemplos deterministas (§42):
 *  - 2h30m (9_000_000 ms) × 40000 = 100000.0000
 *  - 1h20m (4_800_000 ms) × 35000 = 46666.6667
 */
export function calcularCosto(efectivoMs: number, tarifaValor: number): Result<number, KernelError> {
  if (!Number.isFinite(efectivoMs) || efectivoMs < 0) {
    return fail(KernelErrors.validation("efectivoMs debe ser finito y no negativo"));
  }
  if (!Number.isFinite(tarifaValor) || tarifaValor < 0) {
    return fail(KernelErrors.validation("El valor de tarifa debe ser finito y no negativo"));
  }
  const horas = efectivoMs / MS_POR_HORA; // sin redondear el tiempo
  return ok(redondear(horas * tarifaValor, 4));
}
