/**
 * DGP-013 · Módulo Enterprise Procurement & Supply Chain — Objetos de Valor.
 *
 * Todos los VO son INMUTABLES y VALIDADOS con Zod + invariantes de dominio.
 * Capa de dominio PURA: sin dependencias de infraestructura ni reloj interno
 * (nada de `Date.now()`: la fecha/actor llegan SIEMPRE como INPUT). Cada VO
 * expone su esquema Zod (contrato serializable, Offline First) y una función
 * `crear*` que devuelve `Result` con las invariantes verificadas.
 *
 * El dominio es NEUTRO: tipos de artículo, monedas, unidades, condiciones, etc.
 * SIEMPRE llegan por catálogos, nunca por enums.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* --------------------------------- Dinero -------------------------------- */
/**
 * Importe monetario con moneda (catálogo `monedas`). El `monto` se guarda como
 * número finito no negativo con hasta 4 decimales para evitar arrastre de error;
 * las operaciones de agregación redondean determinísticamente (ver `redondear`).
 */
export const DineroSchema = z
  .object({
    moneda: z.string().min(1).max(10),
    monto: z.number().finite().nonnegative(),
  })
  .strict();
export type Dinero = Readonly<z.infer<typeof DineroSchema>>;

/** Redondeo determinista bancario-simple a `decimales` (por defecto 4). */
export function redondear(valor: number, decimales = 4): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

export function crearDinero(input: unknown): Result<Dinero, KernelError> {
  const p = DineroSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Importe monetario inválido", { issues: p.error.issues }));
  return ok(Object.freeze({ moneda: p.data.moneda, monto: redondear(p.data.monto) }));
}

/** Suma de importes de la MISMA moneda (falla si difieren). */
export function sumarDinero(a: Dinero, b: Dinero): Result<Dinero, KernelError> {
  if (a.moneda !== b.moneda) return fail(KernelErrors.validation(`No se pueden sumar monedas distintas: ${a.moneda} y ${b.moneda}`));
  return ok(Object.freeze({ moneda: a.moneda, monto: redondear(a.monto + b.monto) }));
}

/** Multiplica un importe por una cantidad (escalar) de forma determinista. */
export function multiplicarDinero(a: Dinero, factor: number): Result<Dinero, KernelError> {
  if (!Number.isFinite(factor) || factor < 0) return fail(KernelErrors.validation("Factor de multiplicación inválido"));
  return ok(Object.freeze({ moneda: a.moneda, monto: redondear(a.monto * factor) }));
}

/* -------------------------------- Cantidad ------------------------------- */
/**
 * Cantidad con unidad de medida (catálogo `unidades-medida`). Debe ser positiva.
 * El dominio NUNCA asume una unidad por defecto: la unidad es explícita.
 */
export const CantidadSchema = z
  .object({
    valor: z.number().finite().positive(),
    unidad: z.string().min(1).max(40),
  })
  .strict();
export type Cantidad = Readonly<z.infer<typeof CantidadSchema>>;

export function crearCantidad(input: unknown): Result<Cantidad, KernelError> {
  const p = CantidadSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Cantidad inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ valor: redondear(p.data.valor, 6), unidad: p.data.unidad }));
}

/* --------------------------- Referencia externa -------------------------- */
/**
 * Referencia OPACA a un recurso de otro módulo (item de inventario, bodega,
 * lote, serie, documento, formulario). El módulo de abastecimiento NO gestiona
 * esos recursos: sólo guarda la referencia (referencia-only).
 */
export const ReferenciaExternaSchema = z
  .object({
    tipo: z.string().min(1).max(60),
    id: z.string().min(1).max(120),
    etiqueta: z.string().max(200).optional(),
  })
  .strict();
export type ReferenciaExterna = Readonly<z.infer<typeof ReferenciaExternaSchema>>;

export function crearReferenciaExterna(input: unknown): Result<ReferenciaExterna, KernelError> {
  const p = ReferenciaExternaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia externa inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* --------------------------- Referencia de origen ------------------------ */
/**
 * ORIGEN declarativo de una solicitud de compra: de dónde nació la necesidad
 * (inventario/orden/plan/usuario, catálogo `origenes-solicitud`) y una
 * referencia OPACA al recurso disparador (ítem de inventario, OT, plan). La
 * trazabilidad de origen permite, en la etapa 2, liberar reservas/planes.
 */
export const ReferenciaOrigenSchema = z
  .object({
    /** Clave del catálogo `origenes-solicitud`. */
    tipo: z.string().min(1).max(40),
    /** Identificador opaco del recurso disparador (o null para origen manual). */
    referenciaId: z.string().min(1).max(120).nullable().default(null),
    /** Tipo de recurso referenciado (p. ej. `inventario-item`, `orden-trabajo`, `plan-mantenimiento`). */
    referenciaTipo: z.string().min(1).max(60).nullable().default(null),
    /** Etiqueta denormalizada del origen (opcional). */
    etiqueta: z.string().max(200).nullable().default(null),
  })
  .strict();
export type ReferenciaOrigen = Readonly<z.infer<typeof ReferenciaOrigenSchema>>;

export function crearReferenciaOrigen(input: unknown): Result<ReferenciaOrigen, KernelError> {
  const p = ReferenciaOrigenSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Referencia de origen inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ---------------------------- Contacto proveedor ------------------------- */
export const ContactoProveedorSchema = z
  .object({
    nombre: z.string().min(1).max(160),
    cargo: z.string().max(120).nullable().default(null),
    email: z.string().email().nullable().default(null),
    telefono: z.string().max(60).nullable().default(null),
    principal: z.boolean().default(false),
  })
  .strict();
export type ContactoProveedor = Readonly<z.infer<typeof ContactoProveedorSchema>>;

export function crearContactoProveedor(input: unknown): Result<ContactoProveedor, KernelError> {
  const p = ContactoProveedorSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Contacto de proveedor inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------------ Certificación ---------------------------- */
export const CertificacionSchema = z
  .object({
    /** Clave del catálogo `certificaciones`. */
    tipo: z.string().min(1).max(60),
    numero: z.string().max(120).nullable().default(null),
    /** Vigencia (ISO) o null si no aplica (input, jamás reloj interno). */
    vigenteHasta: z.string().min(1).nullable().default(null),
    emisor: z.string().max(160).nullable().default(null),
  })
  .strict();
export type Certificacion = Readonly<z.infer<typeof CertificacionSchema>>;

export function crearCertificacion(input: unknown): Result<Certificacion, KernelError> {
  const p = CertificacionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Certificación inválida", { issues: p.error.issues }));
  if (p.data.vigenteHasta != null && Number.isNaN(Date.parse(p.data.vigenteHasta))) {
    return fail(KernelErrors.validation("La vigencia de la certificación no es ISO válida"));
  }
  return ok(Object.freeze(p.data));
}

/* ------------------------------- Acuerdo SLA ----------------------------- */
/**
 * SLA declarativo del proveedor: plazo de entrega comprometido (días) y nivel de
 * cumplimiento objetivo (0..1). Neutro y configurable.
 */
export const SlaSchema = z
  .object({
    plazoEntregaDias: z.number().int().nonnegative(),
    nivelCumplimientoObjetivo: z.number().min(0).max(1).default(0.95),
    penalizacionPorDia: z.number().finite().nonnegative().default(0),
  })
  .strict();
export type Sla = Readonly<z.infer<typeof SlaSchema>>;

export function crearSla(input: unknown): Result<Sla, KernelError> {
  const p = SlaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("SLA inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ------------------------------ Calificación ----------------------------- */
/**
 * Calificación (rating) de un proveedor: puntajes por dimensión (0..5) y una
 * calificación global derivada por promedio. Determinista y auditable.
 */
export const CalificacionSchema = z
  .object({
    calidad: z.number().min(0).max(5),
    tiempo: z.number().min(0).max(5),
    precio: z.number().min(0).max(5),
    servicio: z.number().min(0).max(5),
    /** Nota libre (opcional). */
    nota: z.string().max(500).nullable().default(null),
    /** Instante ISO de la calificación (input). */
    calificadoEn: z.string().min(1),
    calificadoPor: z.string().min(1),
  })
  .strict();
export type Calificacion = Readonly<z.infer<typeof CalificacionSchema>>;

/** Promedio determinista de las 4 dimensiones de una calificación (0..5). */
export function calificacionGlobal(c: Pick<Calificacion, "calidad" | "tiempo" | "precio" | "servicio">): number {
  return redondear((c.calidad + c.tiempo + c.precio + c.servicio) / 4, 2);
}

export function crearCalificacion(input: unknown): Result<Calificacion, KernelError> {
  const p = CalificacionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Calificación inválida", { issues: p.error.issues }));
  if (Number.isNaN(Date.parse(p.data.calificadoEn))) {
    return fail(KernelErrors.validation("La fecha de calificación no es ISO válida"));
  }
  return ok(Object.freeze(p.data));
}

/* ---------------------------- Línea de solicitud ------------------------- */
/**
 * Línea de una solicitud de compra: QUÉ se necesita (artículo del catálogo o
 * descripción libre para ítems no catalogados) y CUÁNTO. La referencia al
 * artículo es opcional (permite solicitar algo aún no catalogado), pero al menos
 * `articuloId` o `descripcion` debe existir.
 */
export const LineaSolicitudSchema = z
  .object({
    numero: z.number().int().positive(),
    articuloId: z.string().min(1).max(120).nullable().default(null),
    descripcion: z.string().min(1).max(400).nullable().default(null),
    cantidad: CantidadSchema,
    /** Clave del catálogo `prioridades` (opcional; hereda de la solicitud). */
    prioridad: z.string().min(1).max(40).nullable().default(null),
    /** Referencia externa (item de inventario) para trazabilidad opcional. */
    referencia: ReferenciaExternaSchema.nullable().default(null),
  })
  .strict();
export type LineaSolicitud = Readonly<z.infer<typeof LineaSolicitudSchema>>;

export function crearLineaSolicitud(input: unknown): Result<LineaSolicitud, KernelError> {
  const p = LineaSolicitudSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Línea de solicitud inválida", { issues: p.error.issues }));
  if (!p.data.articuloId && !p.data.descripcion) {
    return fail(KernelErrors.validation("La línea debe referenciar un artículo o describir el ítem"));
  }
  const cant = crearCantidad(p.data.cantidad);
  if (!cant.ok) return cant;
  return ok(Object.freeze({ ...p.data, cantidad: cant.value }));
}

/* -------------------------- Línea de cotización -------------------------- */
/**
 * Línea de una cotización de un proveedor: precio unitario ofertado, plazo de
 * entrega (días) y cantidad ofertada para una línea de la solicitud.
 */
export const LineaCotizacionSchema = z
  .object({
    numero: z.number().int().positive(),
    articuloId: z.string().min(1).max(120).nullable().default(null),
    descripcion: z.string().min(1).max(400).nullable().default(null),
    cantidad: CantidadSchema,
    precioUnitario: DineroSchema,
    plazoEntregaDias: z.number().int().nonnegative().default(0),
  })
  .strict();
export type LineaCotizacion = Readonly<z.infer<typeof LineaCotizacionSchema>>;

export function crearLineaCotizacion(input: unknown): Result<LineaCotizacion, KernelError> {
  const p = LineaCotizacionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Línea de cotización inválida", { issues: p.error.issues }));
  const cant = crearCantidad(p.data.cantidad);
  if (!cant.ok) return cant;
  const precio = crearDinero(p.data.precioUnitario);
  if (!precio.ok) return precio;
  return ok(Object.freeze({ ...p.data, cantidad: cant.value, precioUnitario: precio.value }));
}

/* ------------------------ Línea de orden de compra ----------------------- */
/**
 * Línea de una orden de compra: artículo, cantidad ORDENADA, precio unitario y
 * una TOLERANCIA de sobre-recepción declarativa (fracción 0..1, p. ej. 0.05 =
 * 5%). La tolerancia también puede provenir del catálogo del artículo.
 */
export const LineaOrdenCompraSchema = z
  .object({
    numero: z.number().int().positive(),
    articuloId: z.string().min(1).max(120).nullable().default(null),
    descripcion: z.string().min(1).max(400).nullable().default(null),
    cantidad: CantidadSchema,
    precioUnitario: DineroSchema,
    /** Tolerancia de sobre-recepción (fracción de la cantidad ordenada). */
    toleranciaSobreRecepcion: z.number().min(0).max(1).default(0),
    /** Referencia externa (item de inventario / bodega destino) opcional. */
    referencia: ReferenciaExternaSchema.nullable().default(null),
    /** Bodega destino declarada (referencia opaca) para la entrada de inventario. */
    bodega: ReferenciaExternaSchema.nullable().default(null),
  })
  .strict();
export type LineaOrdenCompra = Readonly<z.infer<typeof LineaOrdenCompraSchema>>;

export function crearLineaOrdenCompra(input: unknown): Result<LineaOrdenCompra, KernelError> {
  const p = LineaOrdenCompraSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Línea de orden de compra inválida", { issues: p.error.issues }));
  const cant = crearCantidad(p.data.cantidad);
  if (!cant.ok) return cant;
  const precio = crearDinero(p.data.precioUnitario);
  if (!precio.ok) return precio;
  return ok(Object.freeze({ ...p.data, cantidad: cant.value, precioUnitario: precio.value }));
}

/* -------------------------- Línea de recepción --------------------------- */
/**
 * Línea de una recepción: cantidad RECIBIDA contra una línea de la OC, con lote/
 * serie opcionales (referencia-only para la entrada de inventario) y una novedad
 * del catálogo `novedades-recepcion` (por defecto `ninguna`).
 */
export const LineaRecepcionSchema = z
  .object({
    /** Número de la línea de la OC a la que aplica. */
    numeroLineaOC: z.number().int().positive(),
    cantidad: CantidadSchema,
    /** Clave del catálogo `novedades-recepcion`. */
    novedad: z.string().min(1).max(60).default("ninguna"),
    notaNovedad: z.string().max(500).nullable().default(null),
    lote: z.string().max(120).nullable().default(null),
    serie: z.string().max(120).nullable().default(null),
    /** Bodega de entrada (referencia opaca) opcional; hereda de la línea OC. */
    bodega: ReferenciaExternaSchema.nullable().default(null),
  })
  .strict();
export type LineaRecepcion = Readonly<z.infer<typeof LineaRecepcionSchema>>;

export function crearLineaRecepcion(input: unknown): Result<LineaRecepcion, KernelError> {
  const p = LineaRecepcionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Línea de recepción inválida", { issues: p.error.issues }));
  const cant = crearCantidad(p.data.cantidad);
  if (!cant.ok) return cant;
  return ok(Object.freeze({ ...p.data, cantidad: cant.value }));
}
