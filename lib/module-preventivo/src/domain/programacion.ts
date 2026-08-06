/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Motor de PROGRAMACIÓN.
 *
 * MOTOR PURO Y DETERMINISTA de programación preventiva. El instante "ahora" es
 * SIEMPRE un INPUT (jamás Date.now). REUTILIZA por CONTRATO PÚBLICO el motor de
 * frecuencias de Planes (DGP-012, `evaluarFrecuencia`) — pieza pública, pura y
 * sin reloj interno — en lugar de reimplementar la lógica de vencimiento. Sobre
 * esa evaluación compone:
 *   · ventanas de programación (fecha objetivo + tolerancia),
 *   · reprogramaciones (motivo de catálogo + historial),
 *   · suspensiones (programa/actividad/activo),
 *   · exclusiones (fechas/rangos/activos con motivo de catálogo).
 *
 * NO importa el aggregate de Planes: sólo sus VOs/funciones públicas.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  evaluarFrecuencia,
  type AnclajeFrecuencia,
  type ContextoEvaluacion,
  type EvaluacionFrecuencia,
  type Frecuencia,
} from "@workspace/module-planes";

/* ------------------------------ Suspensiones ----------------------------- */

/** Ámbito al que aplica una suspensión. NEUTRO (sin nombres de negocio). */
export const AMBITOS_SUSPENSION = ["programa", "actividad", "activo"] as const;
export type AmbitoSuspension = (typeof AMBITOS_SUSPENSION)[number];

export interface Suspension {
  readonly ambito: AmbitoSuspension;
  /** Id del sujeto suspendido (programa/actividad/activo). */
  readonly sujetoId: string;
  /** Clave del catálogo `motivos-suspension`. */
  readonly motivo: string;
  readonly desde: string;
  readonly hasta: string | null;
}

/* ------------------------------- Exclusiones ----------------------------- */

export interface Exclusion {
  /** Rango inclusivo de fechas ISO a excluir (día completo). */
  readonly desde: string;
  readonly hasta: string;
  /** Activos a los que aplica la exclusión (vacío ⇒ todos). */
  readonly activos: readonly string[];
  /** Clave del catálogo `motivos-exclusion`. */
  readonly motivo: string;
}

/* ----------------------------- Reprogramación ---------------------------- */

export interface Reprogramacion {
  /** Fecha objetivo original (ISO). */
  readonly fechaOriginal: string;
  /** Nueva fecha objetivo (ISO). */
  readonly fechaNueva: string;
  /** Clave del catálogo `motivos-reprogramacion`. */
  readonly motivo: string;
  /** Instante ISO en que se registró la reprogramación. */
  readonly registradaEn: string;
  readonly registradaPor: string;
}

/* ------------------------------ Entrada motor ---------------------------- */

export interface EntradaProgramacion {
  readonly programaId: string;
  readonly actividadId: string;
  readonly activoId: string;
  readonly frecuencia: Frecuencia;
  readonly anclaje: AnclajeFrecuencia;
  readonly ctx: ContextoEvaluacion;
  /** Tolerancia (horas) alrededor de la fecha objetivo para la ventana. */
  readonly toleranciaHoras?: number;
  /** Suspensiones activas aplicables (programa/actividad/activo). */
  readonly suspensiones?: readonly Suspension[];
  /** Exclusiones de fechas/rangos/activos. */
  readonly exclusiones?: readonly Exclusion[];
  /**
   * Reprogramaciones ya aplicadas (historial). La ÚLTIMA cuyo `fechaOriginal`
   * coincide con la fecha objetivo calculada re-dirige la ventana.
   */
  readonly reprogramaciones?: readonly Reprogramacion[];
}

export interface VentanaProgramacion {
  readonly inicio: string;
  readonly objetivo: string;
  readonly fin: string;
}

export interface ResultadoProgramacion {
  readonly programaId: string;
  readonly actividadId: string;
  readonly activoId: string;
  /** ¿La ocurrencia está vencida según la frecuencia? */
  readonly vencida: boolean;
  /** ¿Corresponde programar (vencida y NO suspendida/excluida)? */
  readonly corresponde: boolean;
  /** Ventana resultante (aplicando reprogramación si existe). */
  readonly ventana: VentanaProgramacion;
  /** Razón de descarte, si `corresponde=false` estando vencida. */
  readonly descartadaPor: "suspension" | "exclusion" | null;
  /** Evaluación de frecuencia subyacente (contrato público de Planes). */
  readonly evaluacion: EvaluacionFrecuencia;
}

const MS_HORA = 3_600_000;

function fechaObjetivoDe(ev: EvaluacionFrecuencia, ahora: string): string {
  const disp = ev.disparadora;
  if (disp && /\d{4}-\d{2}-\d{2}T/.test(disp.proximaMeta)) return disp.proximaMeta;
  return ahora;
}

function diaISO(iso: string): string {
  return iso.slice(0, 10);
}

function suspende(s: Suspension, entrada: EntradaProgramacion, instante: string): boolean {
  const t = Date.parse(instante);
  const desde = Date.parse(s.desde);
  if (Number.isNaN(t) || Number.isNaN(desde) || t < desde) return false;
  if (s.hasta != null) {
    const hasta = Date.parse(s.hasta);
    if (!Number.isNaN(hasta) && t > hasta) return false;
  }
  if (s.ambito === "programa") return s.sujetoId === entrada.programaId;
  if (s.ambito === "actividad") return s.sujetoId === entrada.actividadId;
  return s.sujetoId === entrada.activoId; // activo
}

function excluye(e: Exclusion, entrada: EntradaProgramacion, objetivoISO: string): boolean {
  if (e.activos.length > 0 && !e.activos.includes(entrada.activoId)) return false;
  const dia = diaISO(objetivoISO);
  return dia >= diaISO(e.desde) && dia <= diaISO(e.hasta);
}

/**
 * Calcula la programación DETERMINISTA de UNA ocurrencia (programa+actividad+
 * activo). Compone la evaluación de frecuencia de Planes con reprogramación,
 * suspensión y exclusión. Puro: mismo input ⇒ mismo output.
 */
export function calcularProgramacion(entrada: EntradaProgramacion): Result<ResultadoProgramacion, KernelError> {
  if (Number.isNaN(Date.parse(entrada.ctx.ahora))) {
    return fail(KernelErrors.validation("El 'ahora' de contexto debe ser ISO válido"));
  }
  const evaluacion = evaluarFrecuencia(entrada.frecuencia, entrada.anclaje, entrada.ctx);
  let objetivo = fechaObjetivoDe(evaluacion, entrada.ctx.ahora);

  // Aplica la reprogramación cuyo fechaOriginal coincide con el objetivo (día).
  const repro = (entrada.reprogramaciones ?? []).find((r) => diaISO(r.fechaOriginal) === diaISO(objetivo));
  if (repro) objetivo = repro.fechaNueva;

  const objetivoMs = Date.parse(objetivo);
  if (Number.isNaN(objetivoMs)) return fail(KernelErrors.validation("La fecha objetivo resultó inválida"));
  const tol = (entrada.toleranciaHoras ?? 0) * MS_HORA;
  const ventana: VentanaProgramacion = {
    inicio: new Date(objetivoMs - tol).toISOString(),
    objetivo,
    fin: new Date(objetivoMs + tol).toISOString(),
  };

  let descartadaPor: "suspension" | "exclusion" | null = null;
  if ((entrada.suspensiones ?? []).some((s) => suspende(s, entrada, objetivo))) {
    descartadaPor = "suspension";
  } else if ((entrada.exclusiones ?? []).some((e) => excluye(e, entrada, objetivo))) {
    descartadaPor = "exclusion";
  }

  return ok({
    programaId: entrada.programaId,
    actividadId: entrada.actividadId,
    activoId: entrada.activoId,
    vencida: evaluacion.vencida,
    corresponde: evaluacion.vencida && descartadaPor === null,
    ventana,
    descartadaPor: evaluacion.vencida ? descartadaPor : null,
    evaluacion,
  });
}

/* ---------------------------- Validaciones VO ---------------------------- */

/** Valida una suspensión (motivo/rango) de forma pura. */
export function crearSuspension(input: Suspension): Result<Suspension, KernelError> {
  if (!AMBITOS_SUSPENSION.includes(input.ambito)) {
    return fail(KernelErrors.validation(`Ámbito de suspensión inválido: "${input.ambito}"`));
  }
  if (input.sujetoId.trim() === "") return fail(KernelErrors.validation("La suspensión requiere sujeto"));
  if (input.motivo.trim() === "") return fail(KernelErrors.validation("La suspensión requiere motivo"));
  if (Number.isNaN(Date.parse(input.desde))) return fail(KernelErrors.validation("Suspensión.desde debe ser ISO"));
  if (input.hasta != null) {
    if (Number.isNaN(Date.parse(input.hasta))) return fail(KernelErrors.validation("Suspensión.hasta debe ser ISO"));
    if (Date.parse(input.hasta) < Date.parse(input.desde)) {
      return fail(KernelErrors.validation("Suspensión.hasta no puede ser anterior a desde"));
    }
  }
  return ok(Object.freeze({ ...input }));
}

/** Valida una exclusión (rango/motivo) de forma pura. */
export function crearExclusion(input: Exclusion): Result<Exclusion, KernelError> {
  if (input.motivo.trim() === "") return fail(KernelErrors.validation("La exclusión requiere motivo"));
  if (Number.isNaN(Date.parse(input.desde)) || Number.isNaN(Date.parse(input.hasta))) {
    return fail(KernelErrors.validation("La exclusión requiere fechas ISO"));
  }
  if (Date.parse(input.hasta) < Date.parse(input.desde)) {
    return fail(KernelErrors.validation("Exclusión.hasta no puede ser anterior a desde"));
  }
  const activos = [...input.activos];
  if (new Set(activos).size !== activos.length) {
    return fail(KernelErrors.validation("Los activos de la exclusión deben ser únicos"));
  }
  return ok(Object.freeze({ ...input, activos: Object.freeze(activos) }));
}

/** Valida una reprogramación (motivo/fechas) de forma pura. */
export function crearReprogramacion(input: Reprogramacion): Result<Reprogramacion, KernelError> {
  if (input.motivo.trim() === "") return fail(KernelErrors.validation("La reprogramación requiere motivo"));
  if (Number.isNaN(Date.parse(input.fechaOriginal)) || Number.isNaN(Date.parse(input.fechaNueva))) {
    return fail(KernelErrors.validation("La reprogramación requiere fechas ISO"));
  }
  if (Number.isNaN(Date.parse(input.registradaEn))) {
    return fail(KernelErrors.validation("La reprogramación requiere 'registradaEn' ISO"));
  }
  if (input.registradaPor.trim() === "") return fail(KernelErrors.validation("La reprogramación requiere actor"));
  return ok(Object.freeze({ ...input }));
}
