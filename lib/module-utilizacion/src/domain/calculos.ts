/**
 * DGP-019.1 · Módulo de Utilización — CÁLCULOS operacionales PUROS.
 *
 * Funciones puras (sin IO, deterministas) para deltas y ratios de utilización y
 * combustible. REGLA DURA del mandato §6: JAMÁS devolver 0 por falta de datos —
 * "sin datos" ≠ 0. Toda función devuelve un resultado DISCRIMINADO:
 *   { tipo: "valor", valor }                → cálculo válido
 *   { tipo: "sin-datos", motivo }           → no hay insumos suficientes
 *
 * Se usan sólo desde el read model de resumen (nunca "inventan" ceros).
 */

export type ResultadoCalculo =
  | { readonly tipo: "valor"; readonly valor: number }
  | { readonly tipo: "sin-datos"; readonly motivo: string };

const valor = (v: number): ResultadoCalculo => ({ tipo: "valor", valor: v });
const sinDatos = (motivo: string): ResultadoCalculo => ({ tipo: "sin-datos", motivo });

/**
 * Delta de un medidor entre dos lecturas del MISMO tramo (mismo medidor, sin
 * reinicio de por medio). Un delta negativo o nulo se reporta como sin-datos:
 * indica que las lecturas no son comparables (retroceso o tramo distinto).
 */
export function deltaMedidor(anterior: number | null | undefined, actual: number | null | undefined): ResultadoCalculo {
  if (anterior == null || actual == null) return sinDatos("faltan lecturas para el delta");
  const d = actual - anterior;
  if (!Number.isFinite(d)) return sinDatos("lecturas no numéricas");
  if (d <= 0) return sinDatos("delta no positivo (sin avance, retroceso o cambio de tramo)");
  return valor(d);
}

/** Consumo por hora (L/h): litros / horas trabajadas (delta horómetro). */
export function litrosPorHora(litros: number | null | undefined, deltaHoras: number | null | undefined): ResultadoCalculo {
  if (litros == null || deltaHoras == null) return sinDatos("faltan litros o delta de horómetro");
  if (deltaHoras <= 0) return sinDatos("delta de horómetro no positivo");
  return valor(litros / deltaHoras);
}

/** Consumo por 100 km (L/100km): litros * 100 / km recorridos (delta odómetro). */
export function litrosPor100Km(litros: number | null | undefined, deltaKm: number | null | undefined): ResultadoCalculo {
  if (litros == null || deltaKm == null) return sinDatos("faltan litros o delta de odómetro");
  if (deltaKm <= 0) return sinDatos("delta de odómetro no positivo");
  return valor((litros * 100) / deltaKm);
}

/** Costo por hora (costo/h): costo total / horas trabajadas (delta horómetro). */
export function costoPorHora(costo: number | null | undefined, deltaHoras: number | null | undefined): ResultadoCalculo {
  if (costo == null || deltaHoras == null) return sinDatos("faltan costo o delta de horómetro");
  if (deltaHoras <= 0) return sinDatos("delta de horómetro no positivo");
  return valor(costo / deltaHoras);
}

/** Costo por km (costo/km): costo total / km recorridos (delta odómetro). */
export function costoPorKm(costo: number | null | undefined, deltaKm: number | null | undefined): ResultadoCalculo {
  if (costo == null || deltaKm == null) return sinDatos("faltan costo o delta de odómetro");
  if (deltaKm <= 0) return sinDatos("delta de odómetro no positivo");
  return valor(costo / deltaKm);
}
