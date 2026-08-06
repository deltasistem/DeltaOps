/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — `Rutina` y `ActividadPlanificada`.
 *
 * La Rutina agrupa las actividades planificadas de un plan con su duración,
 * recursos, herramientas, EPP, materiales, repuestos, checklists, formularios,
 * documentación, observaciones y riesgos. TODO por REFERENCIA a módulos
 * existentes (referencia-only): el módulo de planes NO gestiona esos recursos.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { DuracionSchema, ReferenciaExternaSchema } from "./value-objects";

/** Actividad planificada dentro de una rutina. */
export const ActividadPlanificadaSchema = z
  .object({
    id: z.string().min(1),
    orden: z.number().int().nonnegative(),
    /** Clave del catálogo `tipos-actividad`. */
    tipo: z.string().min(1).max(40),
    titulo: z.string().min(1).max(200),
    descripcion: z.string().max(2000).optional(),
    /** Clave del catálogo `disciplinas`. */
    disciplina: z.string().min(1).max(40).nullable().default(null),
    duracion: DuracionSchema.default({ minutos: 0 }),
    /** Herramientas / EPP / materiales / repuestos: referencias externas. */
    herramientas: z.array(ReferenciaExternaSchema).default([]),
    epp: z.array(ReferenciaExternaSchema).default([]),
    materiales: z.array(ReferenciaExternaSchema).default([]),
    repuestos: z.array(ReferenciaExternaSchema).default([]),
    /** Checklists/formularios de Dynamic Forms (referencia-only). */
    checklists: z.array(ReferenciaExternaSchema).default([]),
    formularios: z.array(ReferenciaExternaSchema).default([]),
    /** Documentación asociada (referencia-only). */
    documentacion: z.array(ReferenciaExternaSchema).default([]),
    /** Riesgos: clave del catálogo `categorias-riesgo` + nota. */
    riesgos: z
      .array(z.object({ categoria: z.string().min(1).max(40), nota: z.string().max(500).optional() }).strict())
      .default([]),
    observaciones: z.string().max(2000).optional(),
  })
  .strict();
export type ActividadPlanificada = Readonly<z.infer<typeof ActividadPlanificadaSchema>>;

export const RutinaSchema = z
  .object({
    id: z.string().min(1),
    nombre: z.string().min(1).max(200),
    /** Recursos sugeridos: referencias del catálogo `tipos-recurso`. */
    recursosSugeridos: z
      .array(z.object({ tipo: z.string().min(1).max(40), cantidad: z.number().int().positive().default(1) }).strict())
      .default([]),
    actividades: z.array(ActividadPlanificadaSchema).min(1),
    /** Duración total estimada (derivable de las actividades). */
    duracionTotal: DuracionSchema.default({ minutos: 0 }),
  })
  .strict();
export type Rutina = Readonly<z.infer<typeof RutinaSchema>>;

export function crearActividadPlanificada(input: unknown): Result<ActividadPlanificada, KernelError> {
  const p = ActividadPlanificadaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Actividad planificada inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }) as ActividadPlanificada);
}

export function crearRutina(input: unknown): Result<Rutina, KernelError> {
  const p = RutinaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Rutina inválida", { issues: p.error.issues }));
  // Órdenes de actividad únicos y coherentes.
  const ordenes = new Set<number>();
  for (const a of p.data.actividades) {
    if (ordenes.has(a.orden)) return fail(KernelErrors.validation(`Orden de actividad duplicado: ${a.orden}`));
    ordenes.add(a.orden);
  }
  const total = p.data.duracionTotal.minutos > 0
    ? p.data.duracionTotal.minutos
    : p.data.actividades.reduce((acc, a) => acc + a.duracion.minutos, 0);
  return ok(Object.freeze({ ...p.data, duracionTotal: Object.freeze({ minutos: total }) }) as Rutina);
}
