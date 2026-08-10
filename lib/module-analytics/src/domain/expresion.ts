/**
 * DGP-016 · Expresión de cálculo DECLARATIVA de un indicador.
 *
 * Nunca hay código por indicador: cada indicador se describe con una expresión
 * declarativa (tipo de agregación, campo, filtros, ventana temporal, agrupadores).
 * El MOTOR interpreta la expresión genéricamente sobre una serie de hechos.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import type { Filtro } from "./filtros";

/** Tipos de agregación soportados por el motor (genéricos). */
export const TIPOS_EXPRESION = [
  "conteo",
  "suma",
  "promedio",
  "ratio",
  "duracion-promedio",
  "tasa",
  "mtbf",
  "mttr",
] as const;
export type TipoExpresion = (typeof TIPOS_EXPRESION)[number];

/** Ventana temporal declarativa (relativa o absoluta). */
export interface VentanaTemporal {
  /** Campo de fecha del hecho sobre el que se aplica la ventana. */
  readonly campoFecha: string;
  /** Duración relativa en días (a partir del `ahora` de evaluación). */
  readonly ultimosDias?: number | null;
  /** Rango absoluto [desde, hasta] en ISO-8601 (inclusivo). */
  readonly desde?: string | null;
  readonly hasta?: string | null;
}

/**
 * Expresión de cálculo. Semántica por tipo:
 *   · conteo            → nº de hechos (tras filtros/ventana).
 *   · suma / promedio   → agregación sobre `campo`.
 *   · duracion-promedio → promedio de `campo` (minutos) → salida en unidad decl.
 *   · ratio             → (numerador filtrado) / (denominador filtrado).
 *   · tasa              → ratio * factor (p.ej. porcentaje = *100).
 *   · mtbf              → tiempo operativo total / nº fallas (desde eventos crudos).
 *   · mttr              → tiempo reparación total / nº reparaciones (crudos).
 */
export interface ExpresionCalculo {
  readonly tipo: TipoExpresion;
  /** Campo numérico agregado (suma/promedio/duracion). */
  readonly campo?: string | null;
  /** Filtros del numerador (o del universo para agregaciones simples). */
  readonly filtros: readonly Filtro[];
  /** Filtros del DENOMINADOR (solo ratio/tasa). */
  readonly filtrosDenominador?: readonly Filtro[];
  /** Factor multiplicador (tasa: 100 ⇒ porcentaje). Default 1. */
  readonly factor?: number | null;
  /** Ventana temporal opcional. */
  readonly ventana?: VentanaTemporal | null;
  /** Agrupadores (campos): si están presentes el motor devuelve series por grupo. */
  readonly agrupadores?: readonly string[];
  /** Campos crudos para MTBF/MTTR (tiempos en minutos). */
  readonly campoTiempoOperativo?: string | null;
  readonly campoTiempoReparacion?: string | null;
  readonly campoEsFalla?: string | null;
}

const esTipo = (t: string): t is TipoExpresion => (TIPOS_EXPRESION as readonly string[]).includes(t);

/** Valida y congela una expresión declarativa. */
export function crearExpresion(input: {
  tipo: string;
  campo?: string | null;
  filtros?: readonly Filtro[];
  filtrosDenominador?: readonly Filtro[];
  factor?: number | null;
  ventana?: VentanaTemporal | null;
  agrupadores?: readonly string[];
  campoTiempoOperativo?: string | null;
  campoTiempoReparacion?: string | null;
  campoEsFalla?: string | null;
}): Result<ExpresionCalculo, KernelError> {
  if (!esTipo(input.tipo)) {
    return fail(KernelErrors.validation(`Tipo de expresión desconocido: "${input.tipo}"`));
  }
  const requiereCampo = input.tipo === "suma" || input.tipo === "promedio" || input.tipo === "duracion-promedio";
  if (requiereCampo && !input.campo) {
    return fail(KernelErrors.validation(`La expresión "${input.tipo}" requiere un campo agregable`));
  }
  if ((input.tipo === "ratio" || input.tipo === "tasa") && (!input.filtrosDenominador || input.filtrosDenominador.length === 0)) {
    // Denominador vacío ⇒ universo completo; permitido pero se documenta.
  }
  if (input.factor != null && input.factor === 0) {
    return fail(KernelErrors.validation(`El factor de la expresión no puede ser 0`));
  }
  return ok(
    Object.freeze({
      tipo: input.tipo,
      campo: input.campo ?? null,
      filtros: Object.freeze([...(input.filtros ?? [])]),
      filtrosDenominador: input.filtrosDenominador ? Object.freeze([...input.filtrosDenominador]) : undefined,
      factor: input.factor ?? null,
      ventana: input.ventana ?? null,
      agrupadores: input.agrupadores ? Object.freeze([...input.agrupadores]) : undefined,
      campoTiempoOperativo: input.campoTiempoOperativo ?? null,
      campoTiempoReparacion: input.campoTiempoReparacion ?? null,
      campoEsFalla: input.campoEsFalla ?? null,
    }),
  );
}
