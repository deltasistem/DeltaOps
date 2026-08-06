/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — VALUE OBJECTS puros.
 *
 * VOs deterministas, inmutables y sin IO: tiempos estimados, dinero, recursos
 * requeridos (personal por rol/cantidad/horas, herramientas, repuestos por
 * REFERENCIA a inventario/artículos — nunca acoplamiento directo), checklist por
 * referencia a plantilla de Dynamic Forms, SLA con ventanas, y el motor de costo
 * estimado (determinista). Toda dimensión clasificatoria (rol, tipo de recurso,
 * clasificación de SLA, moneda, unidad de tiempo) es una clave de catálogo
 * configurable; jamás un enum de dominio.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* --------------------------------- Tiempo -------------------------------- */

/**
 * Tiempo estimado normalizado a minutos. `unidad` es una clave del catálogo
 * `unidades-tiempo`; la conversión a minutos es determinista.
 */
export const TiempoEstimadoSchema = z
  .object({
    valor: z.number().nonnegative(),
    unidad: z.string().min(1),
  })
  .strict();
export type TiempoEstimado = Readonly<z.infer<typeof TiempoEstimadoSchema>>;

const MINUTOS_POR_UNIDAD: Record<string, number> = { minutos: 1, horas: 60, dias: 1440 };

/** Convierte un `TiempoEstimado` a minutos de forma determinista. */
export function tiempoAMinutos(t: TiempoEstimado): number {
  const factor = MINUTOS_POR_UNIDAD[t.unidad] ?? 1;
  return Math.round(t.valor * factor);
}

export function crearTiempoEstimado(input: unknown): Result<TiempoEstimado, KernelError> {
  const p = TiempoEstimadoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Tiempo estimado inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* --------------------------------- Dinero -------------------------------- */

export const DineroSchema = z.object({ moneda: z.string().min(1), monto: z.number().nonnegative() }).strict();
export type Dinero = Readonly<z.infer<typeof DineroSchema>>;

export function crearDinero(input: unknown): Result<Dinero, KernelError> {
  const p = DineroSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Monto inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* ---------------------------- Referencia externa ------------------------- */

/**
 * Referencia SÓLO por identidad hacia otro módulo (inventario/artículos, activos,
 * Dynamic Forms). Nunca se importa el aggregate ajeno: se referencia por
 * `tipo`+`id` (+etiqueta opcional). Espejo del VO homónimo de Planes.
 */
export const ReferenciaExternaSchema = z
  .object({
    tipo: z.string().min(1),
    id: z.string().min(1),
    etiqueta: z.string().min(1).optional(),
  })
  .strict();
export type ReferenciaExterna = Readonly<z.infer<typeof ReferenciaExternaSchema>>;

export function crearReferenciaExterna(input: unknown): Result<ReferenciaExterna, KernelError> {
  const p = ReferenciaExternaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia externa inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* ------------------------------- Checklist ------------------------------- */

/**
 * Checklist OBLIGATORIO por REFERENCIA a una plantilla de Dynamic Forms (DGP-005).
 * El módulo NO define la estructura del formulario: sólo referencia la plantilla
 * publicada por `plantillaId`+`version`. La ejecución/validación es de Dynamic
 * Forms; aquí sólo se garantiza que exista la referencia.
 */
export const ChecklistSchema = z
  .object({
    plantillaId: z.string().min(1),
    version: z.number().int().positive(),
    obligatorio: z.boolean().default(true),
  })
  .strict();
export type Checklist = Readonly<z.infer<typeof ChecklistSchema>>;

export function crearChecklist(input: unknown): Result<Checklist, KernelError> {
  const p = ChecklistSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Checklist inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* ---------------------------- Recursos: personal ------------------------- */

/**
 * Requerimiento de PERSONAL por rol (clave del catálogo `roles-personal`),
 * cantidad de personas y horas por persona. El costo estimado se deriva del
 * costo/hora provisto en el cálculo (determinista, sin IO aquí).
 */
export const RecursoPersonalSchema = z
  .object({
    rol: z.string().min(1),
    cantidad: z.number().int().positive(),
    horasPorPersona: z.number().positive(),
    costoHora: DineroSchema.nullable().optional(),
  })
  .strict();
export type RecursoPersonal = Readonly<z.infer<typeof RecursoPersonalSchema>>;

export function crearRecursoPersonal(input: unknown): Result<RecursoPersonal, KernelError> {
  const p = RecursoPersonalSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Recurso de personal inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* --------------------------- Recursos: herramienta ----------------------- */

export const RecursoHerramientaSchema = z
  .object({
    tipo: z.string().min(1),
    descripcion: z.string().min(1),
    cantidad: z.number().int().positive().default(1),
    referencia: ReferenciaExternaSchema.nullable().optional(),
    costoEstimado: DineroSchema.nullable().optional(),
  })
  .strict();
export type RecursoHerramienta = Readonly<z.infer<typeof RecursoHerramientaSchema>>;

export function crearRecursoHerramienta(input: unknown): Result<RecursoHerramienta, KernelError> {
  const p = RecursoHerramientaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Recurso de herramienta inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* ----------------------------- Recursos: repuesto ------------------------ */

/**
 * Repuesto/insumo requerido, SÓLO por REFERENCIA a inventario/artículos (nunca
 * acoplamiento directo). La disponibilidad/existencia se valida vía puerto en la
 * capa de aplicación; aquí sólo se declara la necesidad y el costo estimado.
 */
export const RecursoRepuestoSchema = z
  .object({
    referencia: ReferenciaExternaSchema,
    cantidad: z.number().positive(),
    unidad: z.string().min(1),
    costoUnitario: DineroSchema.nullable().optional(),
  })
  .strict();
export type RecursoRepuesto = Readonly<z.infer<typeof RecursoRepuestoSchema>>;

export function crearRecursoRepuesto(input: unknown): Result<RecursoRepuesto, KernelError> {
  const p = RecursoRepuestoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Recurso de repuesto inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* ------------------------------ Recursos: conjunto ----------------------- */

export const RecursosRequeridosSchema = z
  .object({
    personal: z.array(RecursoPersonalSchema).default([]),
    herramientas: z.array(RecursoHerramientaSchema).default([]),
    repuestos: z.array(RecursoRepuestoSchema).default([]),
  })
  .strict();
export type RecursosRequeridos = Readonly<z.infer<typeof RecursosRequeridosSchema>>;

export function crearRecursosRequeridos(input: unknown): Result<RecursosRequeridos, KernelError> {
  const p = RecursosRequeridosSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Recursos requeridos inválidos", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/* ---------------------------------- SLA ---------------------------------- */

/**
 * Acuerdo de nivel de servicio con ventanas (respuesta y cumplimiento en horas)
 * y clasificación (clave del catálogo `clasificaciones-sla`). Aplica por
 * actividad o por programa. Determinista: sin reloj interno.
 */
export const SlaSchema = z
  .object({
    clasificacion: z.string().min(1),
    ventanaRespuestaHoras: z.number().nonnegative(),
    ventanaCumplimientoHoras: z.number().positive(),
    toleranciaHoras: z.number().nonnegative().default(0),
  })
  .strict()
  .refine((s) => s.ventanaCumplimientoHoras >= s.ventanaRespuestaHoras, {
    message: "La ventana de cumplimiento no puede ser menor que la de respuesta",
  });
export type Sla = Readonly<z.infer<typeof SlaSchema>>;

export function crearSla(input: unknown): Result<Sla, KernelError> {
  const p = SlaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("SLA inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}

/**
 * Estado DETERMINISTA de un SLA respecto a un instante de referencia. `ahora` y
 * el `inicio` son ISO provistos por el orquestador (jamás Date.now).
 */
export interface EstadoSla {
  readonly horasTranscurridas: number;
  readonly dentroDeRespuesta: boolean;
  readonly dentroDeCumplimiento: boolean;
  readonly vencido: boolean;
}

export function evaluarSla(sla: Sla, inicioISO: string, ahoraISO: string): Result<EstadoSla, KernelError> {
  const inicio = Date.parse(inicioISO);
  const ahora = Date.parse(ahoraISO);
  if (Number.isNaN(inicio) || Number.isNaN(ahora)) {
    return fail(KernelErrors.validation("Fechas de SLA inválidas (ISO requerido)"));
  }
  const horas = (ahora - inicio) / 3_600_000;
  const limiteCumplimiento = sla.ventanaCumplimientoHoras + sla.toleranciaHoras;
  return ok({
    horasTranscurridas: horas,
    dentroDeRespuesta: horas <= sla.ventanaRespuestaHoras,
    dentroDeCumplimiento: horas <= limiteCumplimiento,
    vencido: horas > limiteCumplimiento,
  });
}

/* ------------------------- Motor de costo estimado ----------------------- */

/**
 * Desglose DETERMINISTA del costo estimado de una actividad. Suma personal
 * (cantidad × horas × costoHora), herramientas (costoEstimado) y repuestos
 * (cantidad × costoUnitario). Todos los recursos deben compartir la MISMA
 * moneda que la de referencia; una moneda distinta produce error explícito
 * (nunca conversión implícita silenciosa).
 */
export interface DesgloseCosto {
  readonly moneda: string;
  readonly personal: number;
  readonly herramientas: number;
  readonly repuestos: number;
  readonly total: number;
}

export function calcularCostoEstimado(
  recursos: RecursosRequeridos,
  moneda: string,
): Result<DesgloseCosto, KernelError> {
  const verificarMoneda = (m: string | undefined): Result<void, KernelError> => {
    if (m !== undefined && m !== moneda) {
      return fail(KernelErrors.validation(`Moneda de recurso "${m}" no coincide con la esperada "${moneda}"`));
    }
    return ok(undefined);
  };

  let personal = 0;
  for (const r of recursos.personal) {
    if (r.costoHora) {
      const v = verificarMoneda(r.costoHora.moneda);
      if (!v.ok) return v;
      personal += r.cantidad * r.horasPorPersona * r.costoHora.monto;
    }
  }
  let herramientas = 0;
  for (const h of recursos.herramientas) {
    if (h.costoEstimado) {
      const v = verificarMoneda(h.costoEstimado.moneda);
      if (!v.ok) return v;
      herramientas += (h.cantidad ?? 1) * h.costoEstimado.monto;
    }
  }
  let repuestos = 0;
  for (const rp of recursos.repuestos) {
    if (rp.costoUnitario) {
      const v = verificarMoneda(rp.costoUnitario.moneda);
      if (!v.ok) return v;
      repuestos += rp.cantidad * rp.costoUnitario.monto;
    }
  }
  const redondear = (n: number) => Math.round(n * 100) / 100;
  return ok({
    moneda,
    personal: redondear(personal),
    herramientas: redondear(herramientas),
    repuestos: redondear(repuestos),
    total: redondear(personal + herramientas + repuestos),
  });
}

/* --------------------------- Vigencia (periodos) ------------------------- */

/**
 * Periodo de vigencia propio del programa preventivo (fechas ISO). `hasta` es
 * opcional (vigencia abierta). Determinista, sin reloj interno.
 */
export const VigenciaSchema = z
  .object({
    desde: z.string().min(1),
    hasta: z.string().min(1).nullable().optional(),
  })
  .strict();
export type Vigencia = Readonly<z.infer<typeof VigenciaSchema>>;

export function crearVigencia(input: unknown): Result<Vigencia, KernelError> {
  const p = VigenciaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Vigencia inválida", { issues: p.error.issues }));
  const desde = Date.parse(p.data.desde);
  if (Number.isNaN(desde)) return fail(KernelErrors.validation("Vigencia.desde debe ser ISO"));
  if (p.data.hasta != null) {
    const hasta = Date.parse(p.data.hasta);
    if (Number.isNaN(hasta)) return fail(KernelErrors.validation("Vigencia.hasta debe ser ISO"));
    if (hasta < desde) return fail(KernelErrors.validation("Vigencia.hasta no puede ser anterior a Vigencia.desde"));
  }
  return ok(Object.freeze({ desde: p.data.desde, hasta: p.data.hasta ?? null }));
}

/** ¿El instante ISO cae dentro de la vigencia? Determinista. */
export function vigenciaIncluye(v: Vigencia, instanteISO: string): boolean {
  const t = Date.parse(instanteISO);
  const desde = Date.parse(v.desde);
  if (Number.isNaN(t) || Number.isNaN(desde)) return false;
  if (t < desde) return false;
  if (v.hasta != null) {
    const hasta = Date.parse(v.hasta);
    if (!Number.isNaN(hasta) && t > hasta) return false;
  }
  return true;
}

/* ----------------------- Referencia a plan de Planes --------------------- */

/**
 * Referencia SÓLO-LECTURA a un plan PUBLICADO del módulo Planes (DGP-012), por
 * `planId`+`version`. El programa preventivo compone frecuencias/alcances del
 * plan por CONTRATO PÚBLICO, sin copiar ni modificar su aggregate.
 */
export const ReferenciaPlanSchema = z
  .object({
    planId: z.string().min(1),
    version: z.number().int().positive(),
    etiqueta: z.string().min(1).optional(),
  })
  .strict();
export type ReferenciaPlan = Readonly<z.infer<typeof ReferenciaPlanSchema>>;

export function crearReferenciaPlan(input: unknown): Result<ReferenciaPlan, KernelError> {
  const p = ReferenciaPlanSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia de plan inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ ...p.data }));
}
