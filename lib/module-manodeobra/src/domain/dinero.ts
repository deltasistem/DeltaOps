/**
 * DGP-020.3 · Dinero y precisión monetaria — DOMINIO PURO (PUNTO FIJO decimal).
 *
 * HALLAZGO R1 (corregido): el dinero NUNCA viaja como `number` de JS. Tarifa y
 * costo se representan como CADENAS DECIMALES exactas y se operan con enteros
 * escalados (BigInt en micros = 10^6) de extremo a extremo. Así se evita la
 * pérdida de floating point tanto en el cálculo como en la (de)serialización a
 * `numeric(18,6)` de PostgreSQL.
 *
 * REGLAS NORMATIVAS (directiva §9/§27/§42):
 *  - PRECISIÓN INTERNA: valores en MICROS (6 decimales), enteros exactos.
 *  - El TIEMPO efectivo (`efectivoMs`) JAMÁS se redondea para calcular el costo.
 *  - CÁLCULO: costoMicros = round_half_up( efectivoMs × valorMicros / 3_600_000 )
 *    y el resultado final se redondea HALF-UP a 4 decimales (política de dinero).
 *  - SERIALIZACIÓN: parámetros SQL como cadena decimal exacta; lectura desde PG
 *    sin `Number()` con pérdida (se conserva la cadena canónica).
 *  - MONEDA: explícita por fila (de `ten_tenants.moneda`); COP/CLP son
 *    CONFIGURACIÓN inicial, nunca hardcode de dominio.
 *  - Unidad soportada: HORA (única). Otra unidad ⇒ rechazo de negocio.
 *
 * Ejemplos deterministas (§42):
 *  - 2h30m (9_000_000 ms) × 40000 = "100000.0000"
 *  - 1h20m (4_800_000 ms) × 35000 = "46666.6667"  (half-up sobre 46666.66666…)
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/** Milisegundos por hora (base del factor de tiempo). */
export const MS_POR_HORA = 3_600_000n;

/** Escala interna de PUNTO FIJO: 6 decimales (micros). Coincide con numeric(18,6). */
export const ESCALA = 6;
/** Factor de escala (10^ESCALA) como BigInt. */
export const FACTOR = 1_000_000n; // 10^6
/** Decimales del REDONDEO FINAL de costo (política de dinero: 4). */
export const DECIMALES_COSTO = 4;

/** Unidades de tarifa soportadas EN ESTA FASE. Sólo HORA (§7). */
export const UNIDADES_TARIFA = ["HORA"] as const;
export type UnidadTarifa = (typeof UNIDADES_TARIFA)[number];

export function esUnidadSoportada(u: string): u is UnidadTarifa {
  return (UNIDADES_TARIFA as readonly string[]).includes(u);
}

/**
 * Importe en PUNTO FIJO decimal: cantidad ENTERA de micros (10^-6) + su cadena
 * canónica. Es el tipo de transporte del dinero en el dominio y el contrato API.
 */
export type Dinero = string; // cadena decimal canónica, p.ej. "40000.000000"

const RE_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Parsea un importe (cadena decimal o `number` legado) a MICROS exactos (BigInt),
 * validando: finito, no negativo, y a lo sumo `ESCALA` (6) decimales. Rechaza
 * NaN/Infinity y notación científica.
 */
export function aMicros(valor: string | number): Result<bigint, KernelError> {
  let s: string;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return fail(KernelErrors.validation("El importe debe ser finito"));
    // Un number entero es exacto; con decimales se serializa sin notación
    // científica y se valida su escala más abajo.
    s = Number.isInteger(valor) ? valor.toString() : valor.toFixed(ESCALA);
  } else {
    s = valor.trim();
  }
  if (!RE_DECIMAL.test(s)) return fail(KernelErrors.validation(`Importe decimal inválido: "${valor}"`));
  if (s.startsWith("-")) return fail(KernelErrors.validation("El importe no puede ser negativo"));
  const [entero, frac = ""] = s.split(".");
  if (frac.length > ESCALA) {
    return fail(KernelErrors.validation(`El importe admite a lo sumo ${ESCALA} decimales: "${valor}"`));
  }
  const fracPad = (frac + "0".repeat(ESCALA)).slice(0, ESCALA);
  try {
    return ok(BigInt(entero) * FACTOR + BigInt(fracPad === "" ? "0" : fracPad));
  } catch {
    return fail(KernelErrors.validation(`Importe decimal inválido: "${valor}"`));
  }
}

/** Formatea MICROS (BigInt) como cadena decimal canónica con `ESCALA` decimales. */
export function microsACadena(micros: bigint): Dinero {
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const entero = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(ESCALA, "0");
  return `${neg ? "-" : ""}${entero.toString()}.${frac}`;
}

/** Reescala MICROS al número de `decimales` pedido con REDONDEO HALF-UP. */
function reescalarHalfUp(micros: bigint, decimales: number): bigint {
  if (decimales >= ESCALA) return micros;
  const div = 10n ** BigInt(ESCALA - decimales); // p.ej. 4 dec ⇒ /100
  const q = micros / div;
  const r = micros % div;
  const mitad = div / 2n;
  // half-up sobre magnitud no negativa (importes ≥ 0 en este dominio)
  const ajustado = r >= mitad ? q + 1n : q;
  return ajustado * div; // de vuelta a micros, con los dígitos sobrantes en 0
}

/**
 * Normaliza un importe de TARIFA a su cadena canónica (6 decimales), validando
 * escala/negatividad. NO redondea (la tarifa admite hasta 6 decimales).
 */
export function normalizarTarifa(valor: string | number): Result<Dinero, KernelError> {
  const m = aMicros(valor);
  if (!m.ok) return m;
  return ok(microsACadena(m.value));
}

/**
 * Calcula el costo de mano de obra en PUNTO FIJO exacto:
 *   costoMicros = round_half_up_4( efectivoMs × tarifaMicros / MS_POR_HORA )
 * El tiempo NO se redondea; el resultado final se redondea HALF-UP a 4 decimales
 * y se devuelve como cadena decimal canónica (6 decimales, con ceros de relleno).
 */
export function calcularCosto(efectivoMs: number, tarifa: string | number): Result<Dinero, KernelError> {
  if (!Number.isFinite(efectivoMs) || efectivoMs < 0 || !Number.isInteger(efectivoMs)) {
    return fail(KernelErrors.validation("efectivoMs debe ser entero finito y no negativo"));
  }
  const tm = aMicros(tarifa);
  if (!tm.ok) return tm;
  const ms = BigInt(efectivoMs);
  // producto en micros × ms; dividir por MS_POR_HORA con HALF-UP a micros.
  const numerador = ms * tm.value; // micros·ms
  const q = numerador / MS_POR_HORA;
  const r = numerador % MS_POR_HORA;
  const mitad = MS_POR_HORA / 2n;
  const costoMicrosPleno = r * 2n >= MS_POR_HORA ? q + 1n : q; // half-up a micros
  // Redondeo FINAL de política a 4 decimales (half-up), expresado en micros.
  const costoMicros = reescalarHalfUp(costoMicrosPleno, DECIMALES_COSTO);
  return ok(microsACadena(costoMicros));
}
