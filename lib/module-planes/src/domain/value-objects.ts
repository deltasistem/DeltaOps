/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Objetos de Valor.
 *
 * Todos los VO son INMUTABLES y VALIDADOS con Zod + invariantes de dominio.
 * Capa de dominio PURA: sin dependencias de infraestructura ni reloj interno
 * (nada de `Date.now()`: la fecha/lecturas de medidor llegan SIEMPRE como INPUT).
 * Cada VO expone su esquema Zod (contrato serializable, Offline First) y una
 * función `crear*` que devuelve `Result` con las invariantes verificadas.
 *
 * El dominio es NEUTRO: tipos de plan, estrategias, unidades de medidor, etc.
 * SIEMPRE llegan por catálogos, nunca por enums.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ------------------------- Código de plan ------------------------- */
/**
 * Código empresarial consecutivo del plan. Lo compone la CONFIGURACIÓN del
 * tenant (prefijo + separador + secuencia). El VO valida su forma pero NUNCA
 * fija el formato en código.
 */
export const CodigoPlanSchema = z
  .object({
    valor: z.string().min(1).max(60),
    prefijo: z.string().max(20),
    secuencia: z.number().int().positive(),
  })
  .strict();
export type CodigoPlan = Readonly<z.infer<typeof CodigoPlanSchema>>;

export function crearCodigoPlan(input: unknown): Result<CodigoPlan, KernelError> {
  const p = CodigoPlanSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Código de plan inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------- Lectura de medidor -------------------------- */
/**
 * Lectura de un medidor de uso (horómetro/odómetro/ciclos/producción/contador).
 * La `unidad` referencia el catálogo `unidades-medidor`. El VO modela sólo la
 * magnitud + su unidad; el reloj NUNCA vive aquí.
 */
export const LecturaMedidorSchema = z
  .object({
    unidad: z.string().min(1).max(40),
    valor: z.number().finite().nonnegative(),
    /** Instante ISO-8601 de la lectura (input, jamás reloj interno). */
    tomadaEn: z.string().min(1),
  })
  .strict();
export type LecturaMedidor = Readonly<z.infer<typeof LecturaMedidorSchema>>;

export function crearLecturaMedidor(input: unknown): Result<LecturaMedidor, KernelError> {
  const p = LecturaMedidorSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Lectura de medidor inválida", { issues: p.error.issues }));
  if (Number.isNaN(Date.parse(p.data.tomadaEn))) {
    return fail(KernelErrors.validation("La fecha de la lectura no es ISO válida"));
  }
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Frecuencia ---------------------------- */
/**
 * REGLA de frecuencia declarativa. Una regla mide en el DOMINIO TEMPORAL
 * (dias/semanas/meses/anios) o en el DOMINIO DE USO (horas/horometro/odometro/
 * ciclos/produccion/contador) o por EVENTOS. `cada` es el intervalo; `unidad`
 * referencia el catálogo `unidades-medidor` cuando aplica al dominio de uso.
 */
export const TIPOS_TEMPORALES = ["dias", "semanas", "meses", "anios"] as const;
export const TIPOS_USO = ["horas", "horometro", "odometro", "ciclos", "produccion", "contador"] as const;
export const TIPO_EVENTOS = "eventos" as const;

export const ReglaFrecuenciaSchema = z
  .object({
    /** Clave del catálogo `tipos-frecuencia`. */
    tipo: z.string().min(1).max(40),
    /** Intervalo (>0). Para `eventos` se ignora (se dispara por evento externo). */
    cada: z.number().finite().positive().default(1),
    /** Unidad de medidor (catálogo) para reglas del dominio de uso. */
    unidad: z.string().min(1).max(40).nullable().default(null),
    /** Clave del evento disparador (catálogo/tenant) para reglas por eventos. */
    evento: z.string().min(1).max(80).nullable().default(null),
  })
  .strict();
export type ReglaFrecuencia = Readonly<z.infer<typeof ReglaFrecuenciaSchema>>;

/**
 * Frecuencia COMPUESTA: una o varias reglas combinadas por un `modo` (catálogo
 * `modos-combinacion`): `lo-que-ocurra-primero` / `todas` / `cualquiera`.
 */
export const FrecuenciaSchema = z
  .object({
    reglas: z.array(ReglaFrecuenciaSchema).min(1).max(8),
    /** Clave del catálogo `modos-combinacion`. Sólo relevante si hay >1 regla. */
    modo: z.string().min(1).max(40).default("lo-que-ocurra-primero"),
    /** Tolerancia declarativa (holgura) en la misma unidad de cada regla. */
    toleranciaAntes: z.number().finite().nonnegative().default(0),
    toleranciaDespues: z.number().finite().nonnegative().default(0),
  })
  .strict();
export type Frecuencia = Readonly<z.infer<typeof FrecuenciaSchema>>;

export function crearFrecuencia(input: unknown): Result<Frecuencia, KernelError> {
  const p = FrecuenciaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Frecuencia inválida", { issues: p.error.issues }));
  // Invariantes por regla.
  for (const r of p.data.reglas) {
    const esTemporal = (TIPOS_TEMPORALES as readonly string[]).includes(r.tipo);
    const esUso = (TIPOS_USO as readonly string[]).includes(r.tipo);
    const esEvento = r.tipo === TIPO_EVENTOS;
    if (!esTemporal && !esUso && !esEvento) {
      return fail(KernelErrors.validation(`Tipo de frecuencia desconocido: "${r.tipo}"`));
    }
    if (esUso && !r.unidad) {
      return fail(KernelErrors.validation(`La regla de uso "${r.tipo}" requiere una unidad de medidor`));
    }
    if (esEvento && !r.evento) {
      return fail(KernelErrors.validation(`La regla por eventos requiere una clave de evento`));
    }
    if (!esEvento && r.cada <= 0) {
      return fail(KernelErrors.validation(`El intervalo "cada" debe ser positivo`));
    }
  }
  return ok(
    Object.freeze({
      ...p.data,
      reglas: Object.freeze(p.data.reglas.map((r) => Object.freeze(r))) as Frecuencia["reglas"],
    }),
  );
}

/* ------------------------------ Alcance de activos ----------------------- */
/**
 * Selector DECLARATIVO de activos. NUNCA por código específico: se resuelve por
 * dimensiones (activo(s), categoría, familia, subfamilia, empresa, proyecto,
 * ubicación, clase). Un plan que declara varias dimensiones aplica a la
 * INTERSECCIÓN de ellas (todas deben cumplirse).
 */
export const AlcanceActivosSchema = z
  .object({
    activos: z.array(z.string().min(1)).default([]),
    categorias: z.array(z.string().min(1)).default([]),
    familias: z.array(z.string().min(1)).default([]),
    subfamilias: z.array(z.string().min(1)).default([]),
    empresas: z.array(z.string().min(1)).default([]),
    proyectos: z.array(z.string().min(1)).default([]),
    ubicaciones: z.array(z.string().min(1)).default([]),
    clases: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type AlcanceActivos = Readonly<z.infer<typeof AlcanceActivosSchema>>;

export function crearAlcanceActivos(input: unknown): Result<AlcanceActivos, KernelError> {
  const p = AlcanceActivosSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Alcance de activos inválido", { issues: p.error.issues }));
  const total =
    p.data.activos.length +
    p.data.categorias.length +
    p.data.familias.length +
    p.data.subfamilias.length +
    p.data.empresas.length +
    p.data.proyectos.length +
    p.data.ubicaciones.length +
    p.data.clases.length;
  if (total === 0) return fail(KernelErrors.validation("El alcance debe declarar al menos una dimensión de activos"));
  return ok(
    Object.freeze({
      activos: Object.freeze([...p.data.activos]),
      categorias: Object.freeze([...p.data.categorias]),
      familias: Object.freeze([...p.data.familias]),
      subfamilias: Object.freeze([...p.data.subfamilias]),
      empresas: Object.freeze([...p.data.empresas]),
      proyectos: Object.freeze([...p.data.proyectos]),
      ubicaciones: Object.freeze([...p.data.ubicaciones]),
      clases: Object.freeze([...p.data.clases]),
    }) as AlcanceActivos,
  );
}

/** Dimensiones de un activo candidato para evaluar el alcance declarativo. */
export interface CandidatoActivo {
  readonly activoId: string;
  readonly categoria?: string | null;
  readonly familia?: string | null;
  readonly subfamilia?: string | null;
  readonly empresa?: string | null;
  readonly proyecto?: string | null;
  readonly ubicacion?: string | null;
  readonly clase?: string | null;
}

/** ¿El activo candidato cae dentro del alcance declarativo? (intersección). */
export function alcanceIncluye(a: AlcanceActivos, c: CandidatoActivo): boolean {
  const dim = (lista: readonly string[], valor: string | null | undefined): boolean =>
    lista.length === 0 || (valor != null && lista.includes(valor));
  if (a.activos.length > 0 && !a.activos.includes(c.activoId)) return false;
  return (
    dim(a.categorias, c.categoria) &&
    dim(a.familias, c.familia) &&
    dim(a.subfamilias, c.subfamilia) &&
    dim(a.empresas, c.empresa) &&
    dim(a.proyectos, c.proyecto) &&
    dim(a.ubicaciones, c.ubicacion) &&
    dim(a.clases, c.clase)
  );
}

/* ------------------------------ Duración estimada ------------------------ */
export const DuracionSchema = z.object({ minutos: z.number().int().nonnegative() }).strict();
export type Duracion = Readonly<z.infer<typeof DuracionSchema>>;

export function crearDuracion(input: unknown): Result<Duracion, KernelError> {
  const p = DuracionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Duración inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* --------------------------- Referencia externa -------------------------- */
/**
 * Referencia OPACA a un recurso de otro módulo (checklist de Dynamic Forms,
 * documento, repuesto de inventario, formulario, etc.). El módulo de planes NO
 * gestiona esos recursos: sólo guarda la referencia (referencia-only).
 */
export const ReferenciaExternaSchema = z
  .object({
    /** Tipo de recurso referenciado (p.ej. `dynamic-forms`, `inventario-item`). */
    tipo: z.string().min(1).max(60),
    /** Identificador opaco del recurso en el módulo origen. */
    id: z.string().min(1).max(120),
    /** Etiqueta denormalizada (opcional). */
    etiqueta: z.string().max(200).optional(),
  })
  .strict();
export type ReferenciaExterna = Readonly<z.infer<typeof ReferenciaExternaSchema>>;

export function crearReferenciaExterna(input: unknown): Result<ReferenciaExterna, KernelError> {
  const p = ReferenciaExternaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia externa inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
