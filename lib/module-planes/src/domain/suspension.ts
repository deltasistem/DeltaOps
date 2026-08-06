/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — `SuspensionPlan` + `HistorialPlan`.
 *
 * Las suspensiones (suspender/reanudar/posponer/extender/cancelar/reprogramar)
 * son ACCIONES gobernadas: el aggregate REFLEJA el efecto que el motor autoriza.
 * Este archivo modela sus VO inmutables y las entradas del historial del plan.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/**
 * Acciones del ciclo de vida de suspensión gobernadas por el Workflow Engine.
 * La app traduce cada acción de dominio a un comando del motor (camelCase).
 */
export const ACCIONES_SUSPENSION = [
  "suspender",
  "reanudar",
  "posponer",
  "extender",
  "cancelar",
  "reprogramar",
] as const;
export type AccionSuspension = (typeof ACCIONES_SUSPENSION)[number];

export const SuspensionPlanSchema = z
  .object({
    id: z.string().min(1),
    /** Acción aplicada. */
    accion: z.enum(ACCIONES_SUSPENSION),
    /** Clave del catálogo `motivos-suspension`. */
    motivo: z.string().min(1).max(40),
    /** Nueva fecha objetivo (posponer/reprogramar) o fin de suspensión. ISO. */
    hasta: z.string().min(1).nullable().default(null),
    nota: z.string().max(2000).optional(),
    aplicadaEn: z.string().min(1),
    aplicadaPor: z.string().min(1),
  })
  .strict();
export type SuspensionPlan = Readonly<z.infer<typeof SuspensionPlanSchema>>;

export function crearSuspensionPlan(input: unknown): Result<SuspensionPlan, KernelError> {
  const p = SuspensionPlanSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Suspensión de plan inválida", { issues: p.error.issues }));
  if ((p.data.accion === "posponer" || p.data.accion === "reprogramar" || p.data.accion === "extender") && !p.data.hasta) {
    return fail(KernelErrors.validation(`La acción "${p.data.accion}" requiere una nueva fecha (hasta)`));
  }
  if (p.data.hasta !== null && Number.isNaN(Date.parse(p.data.hasta))) {
    return fail(KernelErrors.validation("La fecha 'hasta' no es ISO válida"));
  }
  return ok(Object.freeze({ ...p.data }) as SuspensionPlan);
}

/** Entrada inmutable del historial del plan (auditoría de dominio). */
export const HistorialPlanSchema = z
  .object({
    id: z.string().min(1),
    planId: z.string().min(1),
    /** Tipo de hito (creado/publicado/suspendido/generó-orden/…). */
    hito: z.string().min(1).max(60),
    version: z.number().int().nonnegative(),
    detalle: z.record(z.string(), z.unknown()).default({}),
    ocurridoEn: z.string().min(1),
    actorId: z.string().min(1),
  })
  .strict();
export type HistorialPlan = Readonly<z.infer<typeof HistorialPlanSchema>>;

export function crearHistorialPlan(input: unknown): Result<HistorialPlan, KernelError> {
  const p = HistorialPlanSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Entrada de historial inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }) as HistorialPlan);
}
