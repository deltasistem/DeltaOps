/**
 * DELTAOPS LITE-09 · Normalización de valores crudos de los Excel.
 * NUNCA altera silenciosamente: cada normalización conserva el literal crudo en
 * procedencia (el llamador guarda `crudo`). Los valores no numéricos o sucios se
 * marcan (⚠) y se conservan, jamás se descartan (directiva §2/§6).
 */

/**
 * Normaliza un horómetro/medidor: acepta `3816,4`, `669 7`, `1392 ,2`, `1.234,5`,
 * números planos. Devuelve `{ valor, crudo, normalizado }` o `null` si no es
 * numérico (p. ej. `HH:MM` de "HOROMETRO FS" → no genera lectura, se conserva
 * como contexto por el llamador).
 */
export function normalizarMedidor(
  raw: unknown,
): { valor: number; crudo: string; normalizado: boolean } | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { valor: raw, crudo: String(raw), normalizado: false } : null;
  }
  const crudo = String(raw).trim();
  if (crudo.length === 0) return null;
  // Formato reloj HH:MM (p. ej. "07:45") → NO es horómetro numérico.
  if (/^\d{1,2}:\d{2}$/.test(crudo)) return null;
  // Limpieza: quita espacios internos, unifica coma decimal a punto.
  let limpio = crudo.replace(/\s+/g, "");
  const tieneComa = limpio.includes(",");
  const tienePunto = limpio.includes(".");
  if (tieneComa && tienePunto) {
    // Formato "1.234,5" (miles con punto, decimal con coma).
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else if (tieneComa) {
    limpio = limpio.replace(",", ".");
  }
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  const normalizado = limpio !== crudo;
  return { valor: n, crudo, normalizado };
}

/** Normaliza galones (misma lógica que medidor, pero exige > 0 para ser válido). */
export function normalizarCantidad(raw: unknown): { valor: number; crudo: string } | null {
  const m = normalizarMedidor(raw);
  if (!m) return null;
  return { valor: m.valor, crudo: m.crudo };
}

/**
 * Factor de conversión galón (US) → litro. El campo canónico de tanqueo del
 * módulo de utilización es LITROS (los KPIs de consumo asumen litros); las
 * fuentes históricas registran GALONES ("CANTIDAD DE GALONES"). La conversión
 * se hace SIEMPRE al valor canónico; la cantidad y unidad ORIGINALES (galones)
 * se conservan en la procedencia. Factor exacto US: 1 gal = 3.785411784 L.
 */
export const GALON_A_LITRO = 3.785411784;

/** Convierte galones a litros (canónico), redondeado a 3 decimales estables. */
export function galonesALitros(galones: number): number {
  return Number((galones * GALON_A_LITRO).toFixed(3));
}

/**
 * Normaliza un encabezado Unicode antes de mapear: NFKC (colapsa formas de
 * compatibilidad, incluidos NBSP → espacio normal) + colapso de espacios + trim.
 * Sin esto, "Supervisor 1" con U+00A0 (NBSP) no casaba con la clave literal y el
 * supervisor del checklist de cargador quedaba sin capturar (MENOR-1).
 */
export function normalizarEncabezado(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convierte un valor de celda de fecha a ISO. exceljs entrega `Date` para celdas
 * fecha; también se aceptan strings ISO y el formato es-CO `dd/mm/yyyy h:mm:ss a. m.`.
 * Devuelve `null` si no se puede parsear (se marca ⚠ por el llamador).
 */
export function aIso(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  if (typeof raw === "object" && raw !== null) {
    const anyv = raw as { text?: unknown; result?: unknown };
    if (anyv.result != null) return aIso(anyv.result);
    if (anyv.text != null) return aIso(anyv.text);
    return null;
  }
  const s = String(raw).trim();
  if (s.length === 0) return null;
  // ISO directo.
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return iso.toISOString();
  // Formato es-CO: "14/10/2025  2:37:20 p. m."
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i,
  );
  if (m) {
    const [, dd, mm, yyyy, hh, min, ss, ap] = m;
    let hour = Number(hh);
    if (ap) {
      const pm = /p/i.test(ap);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    const d = new Date(
      Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min), Number(ss ?? 0)),
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Combina una fecha (ISO/Date) con una hora `HH:MM` opcional en ISO. */
export function combinarFechaHora(fechaRaw: unknown, horaRaw: unknown): string | null {
  const base = aIso(fechaRaw);
  if (!base) return null;
  const hora = horaRaw == null ? "" : String(horaRaw).trim();
  const hm = hora.match(/^(\d{1,2}):(\d{2})/);
  if (!hm) return base;
  const d = new Date(base);
  d.setUTCHours(Number(hm[1]), Number(hm[2]), 0, 0);
  return d.toISOString();
}

/** Texto normalizado (trim + colapso de espacios); `""` si vacío. */
export function texto(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "object") {
    const anyv = raw as { text?: unknown; result?: unknown };
    if (anyv.text != null) return texto(anyv.text);
    if (anyv.result != null) return texto(anyv.result);
  }
  return String(raw).trim().replace(/\s+/g, " ");
}

/** Normaliza centro de costo a una clave de catálogo, conservando el literal. */
const MAPA_CENTRO_COSTO: Record<string, string> = {
  RIVERPORT: "RIVERPORT",
  DISSAN: "DISSAN",
  DISAN: "DISSAN",
  SQM: "SQM",
  "ZONA FRANCA": "ZONA_FRANCA",
  "PALO BLANCO": "PALO_BLANCO",
  PALOBLANCO: "PALO_BLANCO",
  "DELTA PALOBLANCO": "PALO_BLANCO",
};

export function normalizarCentroCosto(raw: unknown): { clave: string | null; crudo: string } {
  const crudo = texto(raw);
  if (crudo.length === 0) return { clave: null, crudo };
  const key = crudo.toUpperCase().replace(/\s+/g, " ");
  const directo = MAPA_CENTRO_COSTO[key];
  if (directo) return { clave: directo, crudo };
  // Coincidencia laxa por contención.
  for (const [k, v] of Object.entries(MAPA_CENTRO_COSTO)) {
    if (key.includes(k)) return { clave: v, crudo };
  }
  return { clave: null, crudo };
}
