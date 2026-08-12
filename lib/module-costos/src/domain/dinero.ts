/**
 * DGP-021.1 · Dinero y precisión monetaria — DOMINIO PURO (PUNTO FIJO decimal).
 *
 * LECCIÓN R1 (DGP-021.0): el dinero NUNCA viaja como `number` de JS, ni siquiera
 * en los fakes. Importes y cantidades se representan como CADENAS DECIMALES
 * exactas y se operan con enteros escalados (BigInt en micros = 10^6) de extremo
 * a extremo. Así se evita la pérdida de floating point en el cálculo y en la
 * (de)serialización a `numeric(18,6)` de PostgreSQL.
 *
 * REGLAS NORMATIVAS (directiva §9):
 *  - PRECISIÓN INTERNA: valores en MICROS (6 decimales), enteros exactos.
 *  - CÁLCULO del costo total: costoTotalMicros = round_half_up(
 *      cantidadMicros × costoUnitarioMicros / FACTOR ) — producto exacto de dos
 *    magnitudes en punto fijo, con redondeo HALF-UP a los 6 decimales de la
 *    escala canónica. NO se redondea a menos decimales (numeric(18,6) es exacto).
 *  - SERIALIZACIÓN: parámetros SQL como cadena decimal exacta; lectura desde PG
 *    SIN `Number()` (se conserva la cadena canónica).
 *  - MONEDA: explícita por hecho; NUNCA se convierte ni se suman monedas.
 *
 * Ejemplos deterministas:
 *  - cantidad "3.000000" × unitario "1234.567890" = "3703.703670"
 *  - cantidad "0.333333" × unitario "1.000000"    = "0.333333"
 *  - cantidad "2.000000" × unitario "0.0000005"   ⇒ rechazo (>6 decimales)
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/** Escala interna de PUNTO FIJO: 6 decimales (micros). Coincide con numeric(18,6). */
export const ESCALA = 6;
/** Factor de escala (10^ESCALA) como BigInt. */
export const FACTOR = 1_000_000n; // 10^6

/**
 * Importe/cantidad en PUNTO FIJO decimal como CADENA canónica (p.ej.
 * "1234.567890"). Es el tipo de transporte del dinero en el dominio y el
 * contrato API.
 */
export type Dinero = string;

/**
 * Frontera ESTRICTA de dinero: el importe de origen externo es SIEMPRE una
 * CADENA decimal canónica. Sin signo, sin espacios, sin notación científica, con
 * a lo sumo `ESCALA` (6) decimales y parte entera acotada a numeric(18,6) (≤ 12
 * dígitos enteros). NUNCA se acepta `number` de JS: un número JSON ya puede haber
 * perdido precisión antes de llegar aquí. El mismo patrón se replica en el
 * contrato (zod + OpenAPI) para rechazar en la frontera de la API todo número JSON.
 */
export const RE_DINERO = /^\d{1,12}(\.\d{1,6})?$/;

/**
 * Forma CANÓNICA persistida/leída de PG (numeric(18,6) siempre con 6 decimales):
 * `^\d{1,12}\.\d{6}$`. Es la forma del costo exacto de Abastecimiento (DGP-021.0).
 */
export const RE_DINERO_CANONICO = /^\d{1,12}\.\d{6}$/;

/**
 * Parsea una CADENA decimal canónica a MICROS exactos (BigInt). Rechaza cualquier
 * cosa que no calce con {@link RE_DINERO} (incluye number, negativos, notación
 * científica, espacios y >6 decimales).
 */
export function aMicros(valor: Dinero): Result<bigint, KernelError> {
  if (typeof valor !== "string") {
    return fail(KernelErrors.validation("El importe monetario debe ser una cadena decimal, no un número"));
  }
  const s = valor;
  if (!RE_DINERO.test(s)) {
    return fail(KernelErrors.validation(`Importe decimal inválido (esperado \\d{1,12}(\\.\\d{1,6})?): "${valor}"`));
  }
  const [entero, frac = ""] = s.split(".");
  const fracPad = (frac + "0".repeat(ESCALA)).slice(0, ESCALA);
  try {
    return ok(BigInt(entero!) * FACTOR + BigInt(fracPad === "" ? "0" : fracPad));
  } catch {
    return fail(KernelErrors.validation(`Importe decimal inválido: "${valor}"`));
  }
}

/** Formatea MICROS (BigInt, no negativo) como cadena decimal canónica con `ESCALA` decimales. */
export function microsACadena(micros: bigint): Dinero {
  const neg = micros < 0n;
  const abs = neg ? -micros : micros;
  const entero = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(ESCALA, "0");
  return `${neg ? "-" : ""}${entero.toString()}.${frac}`;
}

/**
 * Normaliza un importe (CADENA decimal) a su cadena canónica (6 decimales),
 * validando formato/escala. NO redondea (admite hasta 6 decimales). NO acepta
 * `number`: la frontera de dinero es string-only.
 */
export function normalizarImporte(valor: Dinero): Result<Dinero, KernelError> {
  const m = aMicros(valor);
  if (!m.ok) return m;
  return ok(microsACadena(m.value));
}

/**
 * Costo total en PUNTO FIJO exacto: costoTotal = cantidad × costoUnitario.
 *
 * Ambos operandos son magnitudes en punto fijo (micros). Su producto está en
 * "micro²"; se divide por FACTOR (10^6) con REDONDEO HALF-UP para volver a la
 * escala canónica de 6 decimales. La cantidad JAMÁS se recorta; el único redondeo
 * es la reescala del producto (inevitable cuando el producto excede 6 decimales).
 */
export function multiplicar(cantidad: Dinero, costoUnitario: Dinero): Result<Dinero, KernelError> {
  const c = aMicros(cantidad);
  if (!c.ok) return c;
  const u = aMicros(costoUnitario);
  if (!u.ok) return u;
  const producto = c.value * u.value; // micros²
  const q = producto / FACTOR;
  const r = producto % FACTOR;
  const totalMicros = r * 2n >= FACTOR ? q + 1n : q; // half-up a micros
  return ok(microsACadena(totalMicros));
}
