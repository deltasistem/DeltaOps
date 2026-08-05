/**
 * DGP-009.1 · Módulo Órdenes de Trabajo Empresariales — Objetos de Valor.
 *
 * Todos los VO son INMUTABLES y VALIDADOS con Zod + invariantes de dominio.
 * Capa de dominio PURA: sin dependencias de infraestructura. Cada VO expone su
 * esquema Zod (contrato serializable, Offline First) y una función `crear*`
 * que devuelve `Result` con las invariantes verificadas.
 *
 * El dominio es NEUTRO respecto al tipo de trabajo: correctivas, preventivas,
 * predictivas, inspecciones, instalaciones, etc. se soportan SIEMPRE por
 * configuración/catálogos, nunca con código específico por tipo.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ------------------------------ Código consecutivo ----------------------- */
/**
 * Código empresarial consecutivo de una OT. Se compone por CONFIGURACIÓN del
 * tenant (prefijo + separador + secuencia con relleno). El VO valida su forma
 * pero NUNCA fija el formato en código: los parámetros llegan del generador
 * configurable (puerto `ConsecutivoPort` en `domain/ports.ts`).
 */
export const CodigoOrdenSchema = z
  .object({
    /** Cadena final legible, p. ej. `OT-000042`. */
    valor: z.string().min(1).max(60),
    /** Prefijo configurado del tenant. */
    prefijo: z.string().max(20),
    /** Número de secuencia (1-based). */
    secuencia: z.number().int().positive(),
  })
  .strict();
export type CodigoOrden = Readonly<z.infer<typeof CodigoOrdenSchema>>;

export function crearCodigoOrden(input: unknown): Result<CodigoOrden, KernelError> {
  const p = CodigoOrdenSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Código de OT inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ---------------------------------- SLA ---------------------------------- */
/**
 * Acuerdo de nivel de servicio. Define objetivos de respuesta y resolución en
 * minutos (unidad neutra y serializable). El vencimiento se calcula a partir de
 * la fecha solicitada; el VO sólo modela el compromiso, no el reloj.
 */
export const SlaSchema = z
  .object({
    /** Clave del catálogo `slas` (política de SLA configurada por tenant). */
    clave: z.string().min(1).max(60),
    /** Minutos objetivo para el primer contacto/atención. */
    respuestaMinutos: z.number().int().nonnegative(),
    /** Minutos objetivo para la resolución/cierre. */
    resolucionMinutos: z.number().int().positive(),
  })
  .strict()
  .refine((s) => s.respuestaMinutos <= s.resolucionMinutos, {
    message: "El objetivo de respuesta no puede superar el de resolución",
  });
export type Sla = Readonly<z.infer<typeof SlaSchema>>;

export function crearSla(input: unknown): Result<Sla, KernelError> {
  const p = SlaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("SLA inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Duración ------------------------------- */
/** Duración de trabajo (estimada o real) en minutos, neutra y serializable. */
export const DuracionSchema = z
  .object({
    minutos: z.number().nonnegative(),
    /** Nota opcional (fuente del estimado, desglose, etc.). */
    detalle: z.string().max(300).optional(),
  })
  .strict();
export type Duracion = Readonly<z.infer<typeof DuracionSchema>>;

export function crearDuracion(input: unknown): Result<Duracion, KernelError> {
  const p = DuracionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Duración inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* --------------------------------- Costo --------------------------------- */
/**
 * Costo monetario con moneda (clave del catálogo `monedas`). Se usa para
 * costos estimados y reales. `monto` no negativo; la moneda se valida como
 * referencia de catálogo en la capa de aplicación.
 */
export const CostoSchema = z
  .object({
    monto: z.number().nonnegative(),
    moneda: z.string().min(1).max(10),
    /** Desglose opcional (mano de obra, repuestos, servicios…). */
    detalle: z.string().max(300).optional(),
  })
  .strict();
export type Costo = Readonly<z.infer<typeof CostoSchema>>;

export function crearCosto(input: unknown): Result<Costo, KernelError> {
  const p = CostoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Costo inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ---------------------------- Riesgo / Impacto --------------------------- */
/**
 * Evaluación de riesgo e impacto. Los NIVELES son claves de catálogo
 * (`riesgos`, `impactos`) configurables por tenant; el VO agrega una nota y un
 * puntaje opcional neutro (0..100) para priorización sin fijar escalas.
 */
export const RiesgoImpactoSchema = z
  .object({
    /** Clave del catálogo `riesgos`. */
    riesgo: z.string().min(1).max(60),
    /** Clave del catálogo `impactos`. */
    impacto: z.string().min(1).max(60),
    /** Puntaje neutro de priorización (opcional). */
    puntaje: z.number().min(0).max(100).optional(),
    nota: z.string().max(500).optional(),
  })
  .strict();
export type RiesgoImpacto = Readonly<z.infer<typeof RiesgoImpactoSchema>>;

export function crearRiesgoImpacto(input: unknown): Result<RiesgoImpacto, KernelError> {
  const p = RiesgoImpactoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Riesgo/impacto inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* --------------------------- Referencia a activo ------------------------- */
/**
 * Referencia a un activo del Módulo de Activos (DGP-008). La OT NO importa el
 * módulo de activos: solo guarda una referencia opaca `activo:<id>` + etiqueta
 * denormalizada para lectura. La existencia del activo es responsabilidad del
 * comando (validación por referencia), nunca del dominio.
 */
export const ReferenciaActivoSchema = z
  .object({
    activoId: z.string().min(1),
    /** entityRef canónico (`activo:<id>`). */
    entityRef: z.string().min(1),
    /** Código/nombre denormalizado del activo (lectura). */
    etiqueta: z.string().max(200).optional(),
    /** Rol del activo en la OT (principal/relacionado). */
    rol: z.enum(["principal", "relacionado"]).default("relacionado"),
  })
  .strict();
export type ReferenciaActivo = Readonly<z.infer<typeof ReferenciaActivoSchema>>;

export function crearReferenciaActivo(input: unknown): Result<ReferenciaActivo, KernelError> {
  const p = ReferenciaActivoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia de activo inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Ubicación ------------------------------ */
export const UbicacionSchema = z
  .object({
    /** Clave del catálogo `ubicaciones`. */
    ubicacionId: z.string().min(1),
    etiqueta: z.string().min(1).max(200),
    detalle: z.string().max(500).optional(),
  })
  .strict();
export type Ubicacion = Readonly<z.infer<typeof UbicacionSchema>>;

export function crearUbicacion(input: unknown): Result<Ubicacion, KernelError> {
  const p = UbicacionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Ubicación inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* --------------------------- Referencia a plantilla ---------------------- */
/**
 * Referencia inmutable a una plantilla del motor Dynamic Forms (DGP-007),
 * ANCLADA a una versión. Sirve tanto para formularios como para checklists
 * (ambos son plantillas versionadas del mismo motor). Las respuestas quedan
 * ancladas a la versión referida (patrón N/N-1 del motor de formularios).
 */
export const ReferenciaPlantillaSchema = z
  .object({
    /** Servicio propietario de la plantilla (por defecto `modulo.formularios`). */
    servicio: z.string().min(1).default("modulo.formularios"),
    /** Clave/código de la plantilla. */
    clave: z.string().min(1).max(120),
    /** Versión anclada (inmutable). */
    version: z.number().int().positive(),
    /** Clase de la plantilla (formulario/checklist), verificada contra el motor. */
    clase: z.enum(["formulario", "checklist"]).optional(),
    etiqueta: z.string().max(200).optional(),
    /**
     * Anclaje de la RESPUESTA capturada con esta plantilla: id de la respuesta
     * del motor de formularios + la versión EXACTA con la que se llenó. Nulo
     * mientras no se haya capturado una respuesta.
     */
    respuesta: z
      .object({
        respuestaId: z.string().min(1),
        version: z.number().int().positive(),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type ReferenciaPlantilla = Readonly<z.infer<typeof ReferenciaPlantillaSchema>>;

export function crearReferenciaPlantilla(input: unknown): Result<ReferenciaPlantilla, KernelError> {
  const p = ReferenciaPlantillaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia de plantilla inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------- Referencia a workflow ------------------------- */
/**
 * Referencia al workflow que gobierna la OT: clave de la definición y el id de
 * la instancia del motor (DGP-007). El estado de la OT se mantiene sincronizado
 * con esta instancia; el módulo NUNCA transiciona por su cuenta.
 */
export const ReferenciaWorkflowSchema = z
  .object({
    /** Clave de la definición de workflow (kebab-case). */
    definicion: z.string().min(1).max(120),
    /** Id de la instancia del motor de workflow (asignado al abrir). */
    instanciaId: z.string().min(1).nullable().default(null),
    /** Versión de la definición anclada. */
    version: z.number().int().positive().optional(),
  })
  .strict();
export type ReferenciaWorkflow = Readonly<z.infer<typeof ReferenciaWorkflowSchema>>;

export function crearReferenciaWorkflow(input: unknown): Result<ReferenciaWorkflow, KernelError> {
  const p = ReferenciaWorkflowSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia de workflow inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------- Referencia a evidencia ----------------------- */
/**
 * Evidencia adjunta a la OT mediante la plataforma compartida
 * (`platform.attachment`). Referencia-only: el módulo guarda el id del adjunto
 * + metadatos (nombre, tipo, hash), NUNCA el binario.
 */
export const EvidenciaSchema = z
  .object({
    attachmentId: z.string().min(1),
    nombreArchivo: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(120),
    tamanoBytes: z.number().int().nonnegative(),
    /** Hash SHA-256 (64 hex) — integridad por referencia. */
    hashSha256: z.string().length(64),
    /** Etapa/estado de la OT en la que se capturó (contexto). */
    etapa: z.string().max(60).optional(),
    descripcion: z.string().max(300).optional(),
  })
  .strict();
export type Evidencia = Readonly<z.infer<typeof EvidenciaSchema>>;

export function crearEvidencia(input: unknown): Result<Evidencia, KernelError> {
  const p = EvidenciaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Evidencia inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ----------------------------- Diagnóstico ------------------------------- */
/**
 * Bloque técnico de la ejecución: motivo, causa, diagnóstico y solución. Todos
 * opcionales (se completan a lo largo del ciclo). Texto libre acotado.
 */
export const DiagnosticoSchema = z
  .object({
    motivo: z.string().max(1000).optional(),
    causa: z.string().max(1000).optional(),
    diagnostico: z.string().max(2000).optional(),
    solucion: z.string().max(2000).optional(),
  })
  .strict();
export type Diagnostico = Readonly<z.infer<typeof DiagnosticoSchema>>;

export function crearDiagnostico(input: unknown): Result<Diagnostico, KernelError> {
  const p = DiagnosticoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Diagnóstico inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------------- Fechas ---------------------------------- */
/**
 * Conjunto de fechas del ciclo de la OT (ISO-8601 string, serializable y
 * Offline First). Invariante de orden temporal cuando ambas están presentes.
 */
export const FechasSchema = z
  .object({
    solicitada: z.string().min(1).optional(),
    programada: z.string().min(1).optional(),
    inicio: z.string().min(1).optional(),
    finalizacion: z.string().min(1).optional(),
    cierre: z.string().min(1).optional(),
  })
  .strict()
  .refine((f) => !f.inicio || !f.finalizacion || f.inicio <= f.finalizacion, {
    message: "La fecha de inicio no puede ser posterior a la de finalización",
  })
  .refine((f) => !f.finalizacion || !f.cierre || f.finalizacion <= f.cierre, {
    message: "La fecha de finalización no puede ser posterior a la de cierre",
  });
export type Fechas = Readonly<z.infer<typeof FechasSchema>>;

export function crearFechas(input: unknown): Result<Fechas, KernelError> {
  const p = FechasSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Fechas inválidas", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
