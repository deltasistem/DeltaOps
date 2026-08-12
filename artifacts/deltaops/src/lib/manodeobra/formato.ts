/**
 * DGP-020.3 · Presentación de tiempo y dinero de Mano de Obra (funciones puras).
 *
 * PRINCIPIOS (directiva §9/§15/§27/§29):
 *  - El tiempo efectivo (`efectivoMs`) proviene del backend (sesiones DGP-020.2);
 *    NO se recalcula en React. Aquí sólo se FORMATEA.
 *  - El costo lo deriva el backend (numeric); aquí sólo se FORMATEA con la moneda
 *    de la valoración. NUNCA se calcula costo con floating point de JS.
 *  - AUSENCIA DE TARIFA ≠ $0: cuando no hay tarifa/costo el helper devuelve el
 *    texto de negocio «Sin tarifa configurada», jamás «$0».
 */
import type { EstadoValoracion } from "./tipos";

/** Formatea `efectivoMs` como `HH:MM:SS` (horas sin límite). Fuente: backend. */
export function formatearTiempo(ms: number | null | undefined): string {
  const seguro = typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
  const totalSeg = Math.floor(seguro / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const dos = (n: number): string => String(n).padStart(2, "0");
  return `${dos(h)}:${dos(m)}:${dos(s)}`;
}

/**
 * Formatea un monto YA CALCULADO por el backend con `Intl.NumberFormat` en la
 * moneda dada. No hace aritmética monetaria: sólo presentación. Devuelve `null`
 * si no hay monto/moneda (el llamador debe mostrar «Sin tarifa configurada»).
 */
export function formatearMoneda(
  monto: number | null | undefined,
  moneda: string | null | undefined,
  locale = "es-CO",
): string | null {
  if (monto == null || !Number.isFinite(monto)) return null;
  const cod = (moneda ?? "").trim();
  if (!cod) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cod,
      // El backend ya redondeó/valoró; presentamos hasta 2 decimales.
      maximumFractionDigits: 2,
    }).format(monto);
  } catch {
    // Moneda no reconocida por Intl: presentación segura sin inventar símbolo.
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(monto)} ${cod}`;
  }
}

/** Texto de negocio para la ausencia de tarifa (nunca «$0»). */
export const SIN_TARIFA_TEXTO = "Sin tarifa configurada";

/**
 * Costo de presentación de una valoración/estimación: devuelve el monto
 * formateado o `SIN_TARIFA_TEXTO`. `hayTarifa=false` fuerza el texto aunque el
 * monto viniera como 0 (defensa contra costo $0 ante ausencia de tarifa).
 */
export function costoPresentacion(
  monto: number | null | undefined,
  moneda: string | null | undefined,
  hayTarifa: boolean,
  locale?: string,
): string {
  if (!hayTarifa) return SIN_TARIFA_TEXTO;
  const f = formatearMoneda(monto, moneda, locale);
  return f ?? SIN_TARIFA_TEXTO;
}

/** Formatea una tarifa como `valor moneda/unidad` (p. ej. «$40.000 COP/h»). */
export function formatearTarifa(
  valor: number | null | undefined,
  moneda: string | null | undefined,
  unidad: string | null | undefined,
  locale?: string,
): string {
  const f = formatearMoneda(valor, moneda, locale);
  if (!f) return SIN_TARIFA_TEXTO;
  const u = (unidad ?? "").toUpperCase() === "HORA" ? "/h" : unidad ? `/${unidad.toLowerCase()}` : "";
  return `${f}${u}`;
}

/** Etiqueta legible de un estado de valoración. */
export const ETIQUETA_VALORACION: Record<EstadoValoracion, string> = {
  VALORADA: "Valorada",
  SIN_TARIFA: "Sin tarifa",
  SIN_RECURSO: "Sin recurso",
};

/** Tono del Badge (Design System) por estado de valoración. */
export type TonoValoracion = "exito" | "advertencia" | "neutro" | "info";
export const TONO_VALORACION: Record<EstadoValoracion, TonoValoracion> = {
  VALORADA: "exito",
  SIN_TARIFA: "advertencia",
  SIN_RECURSO: "advertencia",
};

/** Nombre de presentación de una identidad (fallback al id corto). */
export function nombrePresentacion(nombre: string | null | undefined, identityId: string): string {
  const n = (nombre ?? "").trim();
  if (n) return n;
  // Fallback determinista: id abreviado (nunca vacío).
  return identityId.length > 12 ? `${identityId.slice(0, 8)}…` : identityId;
}
