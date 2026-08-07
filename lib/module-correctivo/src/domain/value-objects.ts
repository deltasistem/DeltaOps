/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — VALUE OBJECTS puros.
 *
 * VOs deterministas, inmutables y sin IO. Toda dimensión clasificatoria (tipo de
 * falla, modo, causa, efecto, prioridad, severidad, impacto, origen, rol, unidad,
 * moneda) es una CLAVE DE CATÁLOGO configurable; jamás un enum de dominio.
 *
 * EVIDENCIAS: SÓLO por REFERENCIA a `platform.attachment` — nunca binarios. Se
 * almacena la referencia opaca (attachmentId + tipo). QR es un anclaje conceptual
 * a `platform.qr` (referencia por token, sin lógica de generación aquí).
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ---------------------------- Referencia externa ------------------------- */

/**
 * Referencia SÓLO por identidad hacia otro módulo/plataforma (activos, ubicación,
 * componente, Dynamic Forms, attachments). Nunca se importa el aggregate ajeno.
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

/* -------------------------- Objeto afectado (activo) --------------------- */

/**
 * Objeto físico afectado por la solicitud. Puede referirse a un ACTIVO, una
 * UBICACIÓN o un COMPONENTE (validados vía ActivosPort en la app). El `entityRef`
 * es la referencia canónica `activo:<id>` compatible con el módulo de Órdenes.
 */
export const ObjetoAfectadoSchema = z
  .object({
    activoId: z.string().min(1),
    /** Componente específico dentro del activo (opcional). */
    componenteId: z.string().min(1).nullable().optional(),
    /** Ubicación asociada (opcional). */
    ubicacionId: z.string().min(1).nullable().optional(),
  })
  .strict();
export type ObjetoAfectado = Readonly<z.infer<typeof ObjetoAfectadoSchema>>;

export function crearObjetoAfectado(input: unknown): Result<ObjetoAfectado, KernelError> {
  const p = ObjetoAfectadoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Objeto afectado inválido", { issues: p.error.issues }));
  return ok(
    Object.freeze({
      activoId: p.data.activoId,
      componenteId: p.data.componenteId ?? null,
      ubicacionId: p.data.ubicacionId ?? null,
    }),
  );
}

/** Referencia canónica del activo principal para el módulo de Órdenes. */
export function activoPrincipalDeObjeto(
  o: ObjetoAfectado,
  rol: "principal" | "relacionado" = "principal",
): { activoId: string; entityRef: string; rol: "principal" | "relacionado" } {
  return { activoId: o.activoId, entityRef: `activo:${o.activoId}`, rol };
}

/* -------------------------------- Síntomas ------------------------------- */

/**
 * Síntoma reportado: clave del catálogo `sintomas` (opcional) + texto libre. Al
 * menos uno de los dos debe estar presente.
 */
export const SintomaSchema = z
  .object({
    clave: z.string().min(1).nullable().optional(),
    texto: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((s) => (s.clave ?? "") !== "" || (s.texto ?? "") !== "", {
    message: "Un síntoma requiere clave de catálogo o texto libre",
  });
export type Sintoma = Readonly<z.infer<typeof SintomaSchema>>;

export function crearSintoma(input: unknown): Result<Sintoma, KernelError> {
  const p = SintomaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Síntoma inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ clave: p.data.clave ?? null, texto: p.data.texto ?? null }));
}

/* -------------------------- Evidencia (referencia) ----------------------- */

/** Tipos de evidencia por referencia. */
export const TIPOS_EVIDENCIA = ["foto", "video", "documento", "audio"] as const;
export type TipoEvidencia = (typeof TIPOS_EVIDENCIA)[number];

/**
 * Evidencia SÓLO por REFERENCIA a `platform.attachment`. Nunca contiene el
 * binario; sólo el `attachmentId` opaco y el tipo declarado.
 */
export const EvidenciaSchema = z
  .object({
    attachmentId: z.string().min(1),
    tipo: z.enum(TIPOS_EVIDENCIA),
    etiqueta: z.string().min(1).nullable().optional(),
  })
  .strict();
export type Evidencia = Readonly<z.infer<typeof EvidenciaSchema>>;

export function crearEvidencia(input: unknown): Result<Evidencia, KernelError> {
  const p = EvidenciaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Evidencia inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ attachmentId: p.data.attachmentId, tipo: p.data.tipo, etiqueta: p.data.etiqueta ?? null }));
}

/* ------------------------------ Clasificación ---------------------------- */

/**
 * Clasificación de la falla: TODAS las dimensiones son claves de catálogo
 * configurable (nunca enums). Todas opcionales en la solicitud inicial; se
 * completan/refinan en el diagnóstico.
 */
export const ClasificacionSchema = z
  .object({
    tipoFalla: z.string().min(1).nullable().optional(),
    modoFalla: z.string().min(1).nullable().optional(),
    causa: z.string().min(1).nullable().optional(),
    efecto: z.string().min(1).nullable().optional(),
    severidad: z.string().min(1).nullable().optional(),
    impacto: z.string().min(1).nullable().optional(),
  })
  .strict();
export type Clasificacion = Readonly<z.infer<typeof ClasificacionSchema>>;

export function crearClasificacion(input: unknown): Result<Clasificacion, KernelError> {
  const p = ClasificacionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Clasificación inválida", { issues: p.error.issues }));
  return ok(
    Object.freeze({
      tipoFalla: p.data.tipoFalla ?? null,
      modoFalla: p.data.modoFalla ?? null,
      causa: p.data.causa ?? null,
      efecto: p.data.efecto ?? null,
      severidad: p.data.severidad ?? null,
      impacto: p.data.impacto ?? null,
    }),
  );
}

/* ---------------------------- Asignación de equipo ----------------------- */

/**
 * Responsable individual de una cuadrilla: id opaco + rol (clave de catálogo
 * `roles-personal`).
 */
export const ResponsableSchema = z
  .object({
    responsableId: z.string().min(1),
    rol: z.string().min(1),
  })
  .strict();
export type Responsable = Readonly<z.infer<typeof ResponsableSchema>>;

/**
 * Recurso asignado a una cuadrilla (herramienta/repuesto/equipo) por REFERENCIA.
 */
export const RecursoAsignadoSchema = z
  .object({
    tipo: z.string().min(1),
    referencia: ReferenciaExternaSchema,
    cantidad: z.number().positive().optional(),
  })
  .strict();
export type RecursoAsignado = Readonly<z.infer<typeof RecursoAsignadoSchema>>;

/**
 * CUADRILLA: unidad de trabajo con responsables y recursos. El "Correctivo Mayor"
 * admite MÚLTIPLES cuadrillas en una sola intervención.
 */
export const CuadrillaSchema = z
  .object({
    cuadrillaId: z.string().min(1),
    etiqueta: z.string().min(1).nullable().optional(),
    responsables: z.array(ResponsableSchema).min(1),
    recursos: z.array(RecursoAsignadoSchema).default([]),
  })
  .strict();
export type Cuadrilla = Readonly<z.infer<typeof CuadrillaSchema>>;

export function crearCuadrilla(input: unknown): Result<Cuadrilla, KernelError> {
  const p = CuadrillaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Cuadrilla inválida", { issues: p.error.issues }));
  const cuadrilla = Object.freeze({
    cuadrillaId: p.data.cuadrillaId,
    etiqueta: p.data.etiqueta ?? null,
    responsables: p.data.responsables.map((r) => ({ ...r })),
    recursos: p.data.recursos.map((r) => ({ ...r })),
  }) as Cuadrilla;
  return ok(cuadrilla);
}

/* --------------------------- Referencia a QR/anchor ---------------------- */

/**
 * Ancla conceptual a `platform.qr`: sólo el token opaco. La generación/lectura
 * del QR es responsabilidad de la plataforma; aquí es una referencia.
 */
export const AnclaQrSchema = z.object({ token: z.string().min(1) }).strict();
export type AnclaQr = Readonly<z.infer<typeof AnclaQrSchema>>;

/* --------------------------- Ingesta (contrato) -------------------------- */

/**
 * Contrato PREPARADO de ingesta externa (IoT / APIs). No hay integración real en
 * esta etapa: sólo el shape neutro que un adaptador futuro traducirá a una
 * solicitud. Se declara aquí como VO para fijar el contrato.
 */
export const SenalIngestaSchema = z
  .object({
    origen: z.string().min(1),
    fuenteId: z.string().min(1),
    objeto: ObjetoAfectadoSchema,
    sintomas: z.array(SintomaSchema).default([]),
    prioridad: z.string().min(1).nullable().optional(),
    metadatos: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type SenalIngesta = Readonly<z.infer<typeof SenalIngestaSchema>>;
