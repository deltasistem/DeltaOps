/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — `GeneracionOrden` + dedup.
 *
 * Lógica de DOMINIO que determina si corresponde generar una Orden de Trabajo y
 * produce una CLAVE DE DEDUPLICACIÓN determinista para NUNCA duplicar. La
 * creación real de la OT es ORQUESTACIÓN de etapa 2 (comando orquestador
 * idempotente, lección 009.3 — nunca comandos anidados). Aquí SOLO se decide y
 * se marca la ocurrencia como generada.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { evaluarFrecuencia, type AnclajeFrecuencia, type ContextoEvaluacion, type EvaluacionFrecuencia } from "./frecuencia-engine";
import type { Frecuencia } from "./value-objects";

/** Orígenes de generación (referencia al catálogo `origenes-generacion`). */
export const ORIGENES_GENERACION = [
  "manual",
  "programada",
  "frecuencia",
  "horometro",
  "odometro",
  "eventos",
  "multiple",
] as const;
export type OrigenGeneracion = (typeof ORIGENES_GENERACION)[number];

/**
 * Identidad de una OCURRENCIA de generación. Determinista por
 * (planId + versión + ocurrencia). `ocurrencia` es un discriminante estable de
 * la instancia (p.ej. la meta de frecuencia alcanzada o el índice de ciclo),
 * acompañado del activo objetivo.
 */
export interface OcurrenciaGeneracion {
  readonly planId: string;
  readonly version: number;
  readonly activoId: string;
  /** Discriminante estable de la ocurrencia (fecha meta, hito de medidor, etc.). */
  readonly ocurrencia: string;
}

/**
 * Clave de deduplicación DETERMINISTA. Dos evaluaciones que resuelven la MISMA
 * ocurrencia producen la MISMA clave ⇒ la orquestación (etapa 2) la usa como
 * `opId`/clave de recibo para no duplicar la OT.
 */
export function claveDedup(o: OcurrenciaGeneracion): string {
  return `plan:${o.planId}:v${o.version}:${o.activoId}:${o.ocurrencia}`;
}

/** Registro inmutable de una generación decidida (para el historial/read model). */
export const GeneracionOrdenSchema = z
  .object({
    id: z.string().min(1),
    tenantId: z.string().min(1),
    planId: z.string().min(1),
    version: z.number().int().positive(),
    activoId: z.string().min(1),
    ocurrencia: z.string().min(1),
    /** Clave de deduplicación determinista. */
    claveDedup: z.string().min(1),
    /** Clave del catálogo `origenes-generacion`. */
    origen: z.string().min(1).max(40),
    /** Fecha objetivo resuelta (ISO) para la OT. */
    fechaObjetivo: z.string().min(1),
    /** Id de la OT creada por la orquestación (etapa 2); null hasta entonces. */
    ordenTrabajoId: z.string().min(1).nullable().default(null),
    /**
     * Estado de materialización de la generación: `pendiente` (OT aún no creada)
     * o `materializada` (vínculo generación→OT persistido). Determinista a partir
     * de `ordenTrabajoId`, pero explícito en el payload autosuficiente del evento.
     */
    estado: z.enum(["pendiente", "materializada"]).default("pendiente"),
    generadaEn: z.string().min(1),
    generadaPor: z.string().min(1),
  })
  .strict();
export type GeneracionOrden = Readonly<z.infer<typeof GeneracionOrdenSchema>>;

export function crearGeneracionOrden(input: unknown): Result<GeneracionOrden, KernelError> {
  const p = GeneracionOrdenSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Generación de orden inválida", { issues: p.error.issues }));
  const esperada = claveDedup({ planId: p.data.planId, version: p.data.version, activoId: p.data.activoId, ocurrencia: p.data.ocurrencia });
  if (p.data.claveDedup !== esperada) {
    return fail(KernelErrors.validation(`Clave de dedup incoherente: esperada "${esperada}"`));
  }
  return ok(Object.freeze({ ...p.data }) as GeneracionOrden);
}

/** Decisión de generación para un activo del alcance de un plan. */
export interface DecisionGeneracion {
  /** ¿Corresponde generar una OT para este activo/ocurrencia? */
  readonly corresponde: boolean;
  /** Origen que motivó la decisión (frecuencia/manual/eventos/…). */
  readonly origen: OrigenGeneracion;
  /** Ocurrencia determinista resuelta (discriminante estable). */
  readonly ocurrencia: string;
  /** Clave de dedup determinista (opId de la orquestación de etapa 2). */
  readonly claveDedup: string;
  /** Fecha objetivo (ISO) para la OT. */
  readonly fechaObjetivo: string;
  /** Evaluación de frecuencia que respalda la decisión (si aplica). */
  readonly evaluacion: EvaluacionFrecuencia | null;
}

export interface EntradaDecision {
  readonly planId: string;
  readonly version: number;
  readonly activoId: string;
  readonly frecuencia: Frecuencia;
  readonly anclaje: AnclajeFrecuencia;
  readonly ctx: ContextoEvaluacion;
  readonly origen: OrigenGeneracion;
  /**
   * Ocurrencias YA generadas para este plan+versión+activo (claves de dedup).
   * Garantiza idempotencia: si la ocurrencia resuelta ya existe, NO se regenera.
   */
  readonly generadasPrevias: ReadonlySet<string>;
  /** Para origen `manual`: fuerza la generación con una ocurrencia explícita. */
  readonly ocurrenciaManual?: string;
}

/**
 * Decide de forma PURA y DETERMINISTA si corresponde generar una OT. La
 * ocurrencia se deriva de la meta de la regla disparadora (o de la fecha/valor
 * meta), garantizando que dos evaluaciones equivalentes produzcan la MISMA clave
 * de dedup ⇒ idempotencia total.
 */
export function decidirGeneracion(e: EntradaDecision): DecisionGeneracion {
  if (e.origen === "manual") {
    const ocurrencia = e.ocurrenciaManual ?? `manual:${e.ctx.ahora}`;
    const clave = claveDedup({ planId: e.planId, version: e.version, activoId: e.activoId, ocurrencia });
    return {
      corresponde: !e.generadasPrevias.has(clave),
      origen: "manual",
      ocurrencia,
      claveDedup: clave,
      fechaObjetivo: e.ctx.ahora,
      evaluacion: null,
    };
  }

  const evaluacion = evaluarFrecuencia(e.frecuencia, e.anclaje, e.ctx);
  const disp = evaluacion.disparadora;
  // La ocurrencia es la meta absoluta de la regla disparadora (estable).
  const ocurrencia = disp ? `${disp.regla.tipo}=${disp.proximaMeta}` : `ciclo:${e.anclaje.desde}`;
  const clave = claveDedup({ planId: e.planId, version: e.version, activoId: e.activoId, ocurrencia });
  // La fecha objetivo es la próxima meta temporal si existe; si no, `ahora`.
  const metaTemporal = disp && /\d{4}-\d{2}-\d{2}T/.test(disp.proximaMeta) ? disp.proximaMeta : e.ctx.ahora;
  return {
    corresponde: evaluacion.vencida && !e.generadasPrevias.has(clave),
    origen: e.origen,
    ocurrencia,
    claveDedup: clave,
    fechaObjetivo: metaTemporal,
    evaluacion,
  };
}
