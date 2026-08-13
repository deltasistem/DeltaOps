/**
 * DGP-021.3 · Presentación de la composición de costos (funciones puras).
 *
 * PRINCIPIO CENTRAL (§26 / directiva de precisión): el DINERO llega del backend
 * como CADENA decimal exacta (punto fijo numeric(18,6)). Aquí SÓLO se FORMATEA
 * para lectura. PROHIBIDO `parseFloat`/`Number` sobre montos para calcular: la
 * cadena exacta se entrega directamente a `Intl.NumberFormat` (que la interpreta
 * como decimal exacto) — sin coma flotante intermedia. Ningún total se recalcula
 * en React; todos vienen ya sumados/neteados por el backend.
 *
 * «Sin datos suficientes» ≠ «$0» (§4/§8): la ausencia se muestra con TEXTO de
 * negocio, jamás con un cero monetario.
 */
import type { BadgeVariant } from "@workspace/design-system";
import type { EstadoCosto, EstadoIndicador } from "./tipos";

const RE_DECIMAL = /^-?\d+(\.\d+)?$/;

function montoNormalizado(monto: string | null | undefined): string | null {
  if (monto == null) return null;
  const s = monto.trim();
  if (!s || !RE_DECIMAL.test(s)) return null;
  return s;
}

/**
 * Formatea un monto YA CALCULADO por el backend con `Intl.NumberFormat` en la
 * moneda dada. NO acepta `number` ni convierte a float: pasa la CADENA exacta.
 * Devuelve `null` si no hay monto/moneda válidos (el llamador decide el texto).
 */
export function formatearMoneda(
  monto: string | null | undefined,
  moneda: string | null | undefined,
  locale = "es-CO",
): string | null {
  const dec = montoNormalizado(monto);
  if (dec == null) return null;
  const cod = (moneda ?? "").trim();
  if (!cod) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cod,
      maximumFractionDigits: 2,
    }).format(dec as unknown as number);
  } catch {
    // Moneda no reconocida por Intl: presentación segura sin inventar símbolo.
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(dec as unknown as number)} ${cod}`;
  }
}

/**
 * Formatea un número (p. ej. litros) que viene como CADENA del backend, SIN
 * moneda. No hace aritmética; sólo agrupa la parte entera. Devuelve `null` si el
 * valor no es decimal.
 */
export function formatearNumero(valor: string | null | undefined, locale = "es-CO"): string | null {
  const dec = montoNormalizado(valor);
  if (dec == null) return null;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(dec as unknown as number);
}

/** Texto de negocio para la ausencia de datos (nunca «$0»). */
export const SIN_DATOS_TEXTO = "Sin datos suficientes";

/** Etiqueta legible de un estado de costo. */
export const ETIQUETA_ESTADO: Record<EstadoCosto, string> = {
  COMPLETO: "Completo",
  PARCIAL: "Parcial",
  SIN_DATOS_SUFICIENTES: "Sin datos suficientes",
  PENDIENTE: "Pendiente",
  NO_APLICA: "No aplica",
};

/** Tono del Badge (Design System) por estado de costo. */
export const TONO_ESTADO: Record<EstadoCosto, BadgeVariant> = {
  COMPLETO: "exito",
  PARCIAL: "advertencia",
  SIN_DATOS_SUFICIENTES: "neutro",
  PENDIENTE: "info",
  NO_APLICA: "neutro",
};

/** Etiqueta legible de un estado de indicador (DGP-021.4). */
export const ETIQUETA_ESTADO_INDICADOR: Record<EstadoIndicador, string> = {
  COMPLETO: "Completo",
  PARCIAL: "Parcial",
  SIN_DATOS_SUFICIENTES: "Sin datos suficientes",
  NO_APLICA: "No aplica",
};

/** Tono del Badge por estado de indicador. */
export const TONO_ESTADO_INDICADOR: Record<EstadoIndicador, BadgeVariant> = {
  COMPLETO: "exito",
  PARCIAL: "advertencia",
  SIN_DATOS_SUFICIENTES: "neutro",
  NO_APLICA: "neutro",
};

/**
 * Formatea un RATIO económico (costo por unidad física) string-safe: formatea el
 * importe exacto en su moneda y añade la unidad («/h» o «/km»). Nunca convierte a
 * float para operar; delega en `Intl` la cadena decimal exacta. Devuelve `null` si
 * el valor/moneda no son válidos.
 */
export function formatearRatio(
  valor: string | null | undefined,
  moneda: string | null | undefined,
  unidad: string,
  locale = "es-CO",
): string | null {
  const money = formatearMoneda(valor, moneda, locale);
  if (money == null) return null;
  return `${money}/${unidad}`;
}

/**
 * Formatea una magnitud física (horas / km) que llega como CADENA exacta del
 * backend, con su unidad. No hace aritmética. Devuelve `null` si no es válida.
 */
export function formatearMagnitud(
  valor: string | null | undefined,
  unidad: string,
  locale = "es-CO",
): string | null {
  const n = formatearNumero(valor, locale);
  if (n == null) return null;
  return `${n} ${unidad}`;
}

/** Nombre legible de una unidad de medidor. */
export const ETIQUETA_UNIDAD: Record<string, string> = {
  h: "horas",
  km: "km",
};

/** Mes «YYYY-MM» a etiqueta legible (p. ej. «may 2024»). Sin dependencia de zona. */
export function formatearMes(mes: string, locale = "es"): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  const anio = Number(m[1]);
  const mesIdx = Number(m[2]) - 1;
  if (mesIdx < 0 || mesIdx > 11) return mes;
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(Date.UTC(anio, mesIdx, 1)));
  } catch {
    return mes;
  }
}

/** Nombres de presentación de los componentes económicos (lenguaje operacional, §21). */
export const ETIQUETA_COMPONENTE: Record<string, string> = {
  MANO_OBRA: "Mano de obra",
  MATERIALES: "Repuestos",
  OTROS: "Otros",
  COMBUSTIBLE: "Combustible",
};

/** Fecha/hora legible a partir de un ISO del backend (o «—»). */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleString("es");
}
