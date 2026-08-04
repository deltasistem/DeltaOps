/**
 * DGP-008.1 · Módulo Activos Empresariales — Objetos de Valor (Value Objects).
 *
 * Todos los VO son INMUTABLES y VALIDADOS con Zod + invariantes de dominio.
 * Capa de dominio PURA: sin dependencias de infraestructura. Cada VO expone su
 * esquema Zod (contrato serializable, Offline First) y una función `crear*`
 * que devuelve `Result` con las invariantes verificadas.
 *
 * El dominio es NEUTRO respecto al tipo de activo: maquinaria amarilla,
 * vehículos, bandas, tolvas, herramientas, infraestructura, etc. se soportan
 * SIEMPRE por configuración/catálogos, nunca con código específico por tipo.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ------------------------------ Coordenadas ------------------------------- */

export const CoordenadasSchema = z
  .object({
    latitud: z.number().min(-90).max(90),
    longitud: z.number().min(-180).max(180),
    altitud: z.number().optional(),
  })
  .strict();
export type Coordenadas = Readonly<z.infer<typeof CoordenadasSchema>>;

export function crearCoordenadas(input: unknown): Result<Coordenadas, KernelError> {
  const p = CoordenadasSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Coordenadas inválidas", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------------- Ubicación -------------------------------- */

export const UbicacionSchema = z
  .object({
    /** Clave del catálogo de ubicaciones (validada contra el catálogo). */
    ubicacionId: z.string().min(1),
    etiqueta: z.string().min(1).max(200),
    coordenadas: CoordenadasSchema.optional(),
    detalle: z.string().max(500).optional(),
  })
  .strict();
export type Ubicacion = Readonly<z.infer<typeof UbicacionSchema>>;

export function crearUbicacion(input: unknown): Result<Ubicacion, KernelError> {
  const p = UbicacionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Ubicación inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Medición -------------------------------- */
/**
 * Medición acumulativa (horómetro / odómetro). El valor es una magnitud
 * MONÓTONA NO DECRECIENTE por regla de dominio: `esRetroceso` detecta lecturas
 * inferiores para que el comando decida según la configuración del tenant.
 */
export const MedicionSchema = z
  .object({
    valor: z.number().min(0),
    unidad: z.string().min(1).max(20),
    fecha: z.string().min(1),
  })
  .strict();
export type Medicion = Readonly<z.infer<typeof MedicionSchema>>;

export function crearMedicion(input: unknown): Result<Medicion, KernelError> {
  const p = MedicionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Medición inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/** Regla de dominio: una medición no puede retroceder respecto a la anterior. */
export function esRetroceso(anterior: Medicion | null | undefined, nueva: Medicion): boolean {
  if (!anterior) return false;
  return nueva.valor < anterior.valor;
}

/* -------------------------------- Garantía -------------------------------- */

export const GarantiaSchema = z
  .object({
    proveedor: z.string().max(200).optional(),
    inicio: z.string().min(1),
    fin: z.string().min(1),
    cobertura: z.string().max(500).optional(),
    poliza: z.string().max(120).optional(),
  })
  .strict()
  .refine((g) => g.inicio <= g.fin, { message: "La garantía termina antes de iniciar" });
export type Garantia = Readonly<z.infer<typeof GarantiaSchema>>;

export function crearGarantia(input: unknown): Result<Garantia, KernelError> {
  const p = GarantiaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Garantía inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------- Identificación Técnica ------------------------ */

export const IdentificacionTecnicaSchema = z
  .object({
    serie: z.string().max(120).optional(),
    vin: z.string().max(120).optional(),
    placa: z.string().max(60).optional(),
    activoFijo: z.string().max(120).optional(),
    codigoInterno: z.string().max(120).optional(),
  })
  .strict();
export type IdentificacionTecnica = Readonly<z.infer<typeof IdentificacionTecnicaSchema>>;

export function crearIdentificacionTecnica(
  input: unknown,
): Result<IdentificacionTecnica, KernelError> {
  const p = IdentificacionTecnicaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Identificación técnica inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------------ Dimensiones ------------------------------- */

export const DimensionesSchema = z
  .object({
    largo: z.number().min(0).optional(),
    ancho: z.number().min(0).optional(),
    alto: z.number().min(0).optional(),
    unidad: z.string().min(1).max(20).default("m"),
  })
  .strict();
export type Dimensiones = Readonly<z.infer<typeof DimensionesSchema>>;

export function crearDimensiones(input: unknown): Result<Dimensiones, KernelError> {
  const p = DimensionesSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Dimensiones inválidas", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ---------------------------------- Peso ---------------------------------- */

export const PesoSchema = z
  .object({
    valor: z.number().min(0),
    unidad: z.string().min(1).max(20).default("kg"),
  })
  .strict();
export type Peso = Readonly<z.infer<typeof PesoSchema>>;

export function crearPeso(input: unknown): Result<Peso, KernelError> {
  const p = PesoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Peso inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Capacidad ------------------------------- */

export const CapacidadSchema = z
  .object({
    valor: z.number().min(0),
    unidad: z.string().min(1).max(20),
    descripcion: z.string().max(200).optional(),
  })
  .strict();
export type Capacidad = Readonly<z.infer<typeof CapacidadSchema>>;

export function crearCapacidad(input: unknown): Result<Capacidad, KernelError> {
  const p = CapacidadSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Capacidad inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------------- Combustible ------------------------------ */

export const CombustibleSchema = z
  .object({
    tipo: z.string().min(1).max(60),
    capacidadTanque: z.number().min(0).optional(),
    unidadTanque: z.string().max(20).optional(),
    consumoPromedio: z.number().min(0).optional(),
  })
  .strict();
export type Combustible = Readonly<z.infer<typeof CombustibleSchema>>;

export function crearCombustible(input: unknown): Result<Combustible, KernelError> {
  const p = CombustibleSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Combustible inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ---------------------------------- Motor --------------------------------- */

export const MotorSchema = z
  .object({
    fabricante: z.string().max(120).optional(),
    modelo: z.string().max(120).optional(),
    numeroSerie: z.string().max(120).optional(),
    potencia: z.number().min(0).optional(),
    unidadPotencia: z.string().max(20).optional(),
    cilindrada: z.number().min(0).optional(),
  })
  .strict();
export type Motor = Readonly<z.infer<typeof MotorSchema>>;

export function crearMotor(input: unknown): Result<Motor, KernelError> {
  const p = MotorSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Motor inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------------- Transmisión ------------------------------ */

export const TransmisionSchema = z
  .object({
    tipo: z.string().min(1).max(60),
    marchas: z.number().int().min(0).optional(),
    fabricante: z.string().max(120).optional(),
  })
  .strict();
export type Transmision = Readonly<z.infer<typeof TransmisionSchema>>;

export function crearTransmision(input: unknown): Result<Transmision, KernelError> {
  const p = TransmisionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Transmisión inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Neumáticos ------------------------------ */

export const NeumaticosSchema = z
  .object({
    medida: z.string().max(60).optional(),
    cantidad: z.number().int().min(0).optional(),
    presion: z.number().min(0).optional(),
    unidadPresion: z.string().max(20).optional(),
  })
  .strict();
export type Neumaticos = Readonly<z.infer<typeof NeumaticosSchema>>;

export function crearNeumaticos(input: unknown): Result<Neumaticos, KernelError> {
  const p = NeumaticosSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Neumáticos inválidos", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Proveedor ------------------------------- */

export const ProveedorSchema = z
  .object({
    nombre: z.string().min(1).max(200),
    identificacion: z.string().max(120).optional(),
    contacto: z.string().max(200).optional(),
    telefono: z.string().max(60).optional(),
    correo: z.string().max(200).optional(),
  })
  .strict();
export type Proveedor = Readonly<z.infer<typeof ProveedorSchema>>;

export function crearProveedor(input: unknown): Result<Proveedor, KernelError> {
  const p = ProveedorSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Proveedor inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ----------------------------- Especificaciones --------------------------- */
/**
 * Especificaciones agrupa los VO técnicos opcionales de un activo. Al ser
 * neutro por configuración, todos los sub-VO son opcionales: un activo de
 * infraestructura no requiere motor, un vehículo sí puede tenerlo, etc.
 */
export const EspecificacionesSchema = z
  .object({
    dimensiones: DimensionesSchema.optional(),
    peso: PesoSchema.optional(),
    capacidad: CapacidadSchema.optional(),
    combustible: CombustibleSchema.optional(),
    motor: MotorSchema.optional(),
    transmision: TransmisionSchema.optional(),
    neumaticos: NeumaticosSchema.optional(),
    /** Atributos libres adicionales, dependientes del catálogo/tipo. */
    atributos: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();
export type Especificaciones = Readonly<z.infer<typeof EspecificacionesSchema>>;

export function crearEspecificaciones(input: unknown): Result<Especificaciones, KernelError> {
  const p = EspecificacionesSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Especificaciones inválidas", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
