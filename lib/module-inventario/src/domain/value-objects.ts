/**
 * DGP-011.1 · Módulo Enterprise Inventory — Objetos de Valor.
 *
 * Todos los VO son INMUTABLES y VALIDADOS con Zod + invariantes de dominio.
 * Capa de dominio PURA: sin dependencias de infraestructura. Cada VO expone su
 * esquema Zod (contrato serializable, Offline First) y una función `crear*` que
 * devuelve `Result` con las invariantes verificadas.
 *
 * El dominio es NEUTRO: tipos de item, unidades, motivos, estados, jerarquías de
 * bodega, etc. SIEMPRE llegan por configuración/catálogos, nunca por enums.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/* ---------------------------------- SKU ---------------------------------- */
/**
 * SKU (Stock Keeping Unit): identificador comercial del item. Se normaliza a
 * mayúsculas y se valida su forma; el dominio NO fija un formato específico por
 * código: sólo caracteres seguros y longitud acotada.
 */
export const SkuSchema = z
  .object({
    valor: z.string().min(1).max(80),
  })
  .strict();
export type Sku = Readonly<{ valor: string }>;

export function crearSku(input: unknown): Result<Sku, KernelError> {
  const p = SkuSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("SKU inválido", { issues: p.error.issues }));
  const valor = p.data.valor.trim().toUpperCase();
  if (!/^[A-Z0-9._/-]+$/.test(valor)) {
    return fail(KernelErrors.validation("El SKU solo admite letras, dígitos y . _ / -"));
  }
  return ok(Object.freeze({ valor }));
}

/* ---------------------------- Código de inventario ----------------------- */
/**
 * Código empresarial consecutivo del item de inventario. Se compone por
 * CONFIGURACIÓN del tenant (prefijo + separador + secuencia con relleno). El VO
 * valida su forma pero NUNCA fija el formato en código.
 */
export const CodigoInventarioSchema = z
  .object({
    valor: z.string().min(1).max(60),
    prefijo: z.string().max(20),
    secuencia: z.number().int().positive(),
  })
  .strict();
export type CodigoInventario = Readonly<z.infer<typeof CodigoInventarioSchema>>;

export function crearCodigoInventario(input: unknown): Result<CodigoInventario, KernelError> {
  const p = CodigoInventarioSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Código de inventario inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Cantidad ------------------------------- */
/**
 * Cantidad no negativa con precisión decimal acotada. La unidad se referencia
 * por catálogo (`unidades`) en la capa de aplicación; el VO solo modela la
 * magnitud + su escala de redondeo (Configuration First).
 */
export const CantidadSchema = z
  .object({
    valor: z.number().finite().nonnegative(),
    /** Nº de decimales significativos (0..6). Para unidades enteras, `0`. */
    escala: z.number().int().min(0).max(6).default(2),
  })
  .strict();
export type Cantidad = Readonly<z.infer<typeof CantidadSchema>>;

function redondear(valor: number, escala: number): number {
  const factor = 10 ** escala;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

export function crearCantidad(input: unknown): Result<Cantidad, KernelError> {
  const p = CantidadSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Cantidad inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ valor: redondear(p.data.valor, p.data.escala), escala: p.data.escala }));
}

/** Suma dos cantidades homogéneas (misma escala de la primera). */
export function sumarCantidad(a: Cantidad, b: Cantidad): Cantidad {
  return Object.freeze({ valor: redondear(a.valor + b.valor, a.escala), escala: a.escala });
}
/** Resta `b` de `a`; nunca produce negativos (se satura en 0). */
export function restarCantidad(a: Cantidad, b: Cantidad): Cantidad {
  return Object.freeze({ valor: redondear(Math.max(0, a.valor - b.valor), a.escala), escala: a.escala });
}

/* ------------------------------ Unidad de medida ------------------------- */
/**
 * Unidad de medida: referencia al catálogo `unidades` + factor de conversión a
 * la unidad base del item (para permitir compras/consumos en unidades derivadas
 * sin romper la contabilidad de existencias). Neutro y configurable.
 */
export const UnidadMedidaSchema = z
  .object({
    /** Clave del catálogo `unidades`. */
    clave: z.string().min(1).max(40),
    etiqueta: z.string().max(80).optional(),
    /** Factor hacia la unidad base (>0). `1` cuando es la unidad base. */
    factorBase: z.number().finite().positive().default(1),
  })
  .strict();
export type UnidadMedida = Readonly<z.infer<typeof UnidadMedidaSchema>>;

export function crearUnidadMedida(input: unknown): Result<UnidadMedida, KernelError> {
  const p = UnidadMedidaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Unidad de medida inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* ---------------------------------- Costos ------------------------------- */
const CostoBaseSchema = z
  .object({
    monto: z.number().finite().nonnegative(),
    /** Clave del catálogo `monedas`. */
    moneda: z.string().min(1).max(10),
  })
  .strict();

export type CostoPromedio = Readonly<z.infer<typeof CostoBaseSchema>>;
export type CostoUltimaCompra = Readonly<z.infer<typeof CostoBaseSchema>>;
export type CostoEstandar = Readonly<z.infer<typeof CostoBaseSchema>>;

export const CostoPromedioSchema = CostoBaseSchema;
export const CostoUltimaCompraSchema = CostoBaseSchema;
export const CostoEstandarSchema = CostoBaseSchema;

export function crearCostoPromedio(input: unknown): Result<CostoPromedio, KernelError> {
  const p = CostoBaseSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Costo promedio inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
export function crearCostoUltimaCompra(input: unknown): Result<CostoUltimaCompra, KernelError> {
  const p = CostoBaseSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Costo de última compra inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
export function crearCostoEstandar(input: unknown): Result<CostoEstandar, KernelError> {
  const p = CostoBaseSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Costo estándar inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/**
 * Recalcula el costo promedio ponderado ante una entrada. NO muta: devuelve el
 * nuevo VO. `stockPrevio`/`entrada` son magnitudes de la MISMA unidad base.
 */
export function recalcularPromedio(
  actual: CostoPromedio | null,
  stockPrevio: number,
  costoEntrada: CostoUltimaCompra,
  cantidadEntrada: number,
): Result<CostoPromedio, KernelError> {
  if (cantidadEntrada <= 0) return fail(KernelErrors.validation("La cantidad de entrada debe ser positiva"));
  const montoPrevio = (actual?.monto ?? 0) * Math.max(0, stockPrevio);
  const montoEntrada = costoEntrada.monto * cantidadEntrada;
  const total = Math.max(0, stockPrevio) + cantidadEntrada;
  const promedio = total > 0 ? (montoPrevio + montoEntrada) / total : costoEntrada.monto;
  return crearCostoPromedio({ monto: promedio, moneda: costoEntrada.moneda });
}

/* ------------------------------ Ubicación física ------------------------- */
/**
 * Ubicación física JERÁRQUICA dentro de una bodega. La estructura NO es fija: se
 * modela como una lista ordenada de segmentos `nivel/valor` (bodega, subbodega,
 * pasillo, estantería, nivel, posición, …) cuyos NIVELES son claves del catálogo
 * `tipos-ubicacion` del tenant. Se acompaña de una ruta canónica denormalizada.
 */
export const SegmentoUbicacionSchema = z
  .object({
    /** Clave del catálogo `tipos-ubicacion` (p.ej. `pasillo`, `estanteria`). */
    nivel: z.string().min(1).max(40),
    /** Valor del segmento (p.ej. `A`, `03`, `N2`). */
    valor: z.string().min(1).max(60),
  })
  .strict();
export type SegmentoUbicacion = Readonly<z.infer<typeof SegmentoUbicacionSchema>>;

export const UbicacionFisicaSchema = z
  .object({
    /** Id del aggregate `Ubicacion` al que pertenece (referencia). */
    ubicacionId: z.string().min(1),
    /** Segmentos jerárquicos ordenados (raíz→hoja). */
    segmentos: z.array(SegmentoUbicacionSchema).min(1).max(12),
    /** Ruta canónica denormalizada (p.ej. `BOD1/A/03/N2`). */
    ruta: z.string().min(1).max(240),
  })
  .strict();
export type UbicacionFisica = Readonly<z.infer<typeof UbicacionFisicaSchema>>;

export function rutaDeSegmentos(segmentos: readonly SegmentoUbicacion[]): string {
  return segmentos.map((s) => s.valor).join("/");
}

export function crearUbicacionFisica(input: unknown): Result<UbicacionFisica, KernelError> {
  const p = UbicacionFisicaSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Ubicación física inválida", { issues: p.error.issues }));
  const rutaEsperada = rutaDeSegmentos(p.data.segmentos);
  if (p.data.ruta !== rutaEsperada) {
    return fail(KernelErrors.validation(`La ruta "${p.data.ruta}" no coincide con los segmentos "${rutaEsperada}"`));
  }
  return ok(Object.freeze({ ...p.data, segmentos: Object.freeze([...p.data.segmentos]) as UbicacionFisica["segmentos"] }));
}

/* ------------------------------ Lote (VO) -------------------------------- */
/**
 * Identificación de LOTE (VO usado en movimientos/existencias). El aggregate
 * `Lote` (lote-serie.ts) gobierna vencimientos/trazabilidad; este VO es la
 * referencia inmutable que viaja en los eventos.
 */
export const LoteSchema = z
  .object({
    /** Código de lote del proveedor/fabricante. */
    codigo: z.string().min(1).max(80),
    /** Fecha de vencimiento (ISO-8601) si el item es perecedero. */
    vencimiento: z.string().min(1).nullable().default(null),
  })
  .strict();
export type Lote = Readonly<z.infer<typeof LoteSchema>>;

export function crearLote(input: unknown): Result<Lote, KernelError> {
  const p = LoteSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Lote inválido", { issues: p.error.issues }));
  if (p.data.vencimiento !== null && Number.isNaN(Date.parse(p.data.vencimiento))) {
    return fail(KernelErrors.validation("La fecha de vencimiento del lote no es una fecha ISO válida"));
  }
  return ok(Object.freeze({ codigo: p.data.codigo.trim(), vencimiento: p.data.vencimiento }));
}

/* ------------------------------ Serie (VO) ------------------------------- */
/** Identificación de SERIE (número de serie único de una unidad rastreable). */
export const SerieSchema = z
  .object({
    numero: z.string().trim().min(1).max(120),
  })
  .strict();
export type Serie = Readonly<z.infer<typeof SerieSchema>>;

export function crearSerie(input: unknown): Result<Serie, KernelError> {
  const p = SerieSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Serie inválida", { issues: p.error.issues }));
  return ok(Object.freeze({ numero: p.data.numero.trim() }));
}

/* --------------------------- Fecha de vencimiento ------------------------ */
export const FechaVencimientoSchema = z
  .object({
    /** Fecha de vencimiento (ISO-8601). */
    fecha: z.string().min(1),
    /** Días de alerta previa (configurable). */
    diasAlerta: z.number().int().nonnegative().default(0),
  })
  .strict();
export type FechaVencimiento = Readonly<z.infer<typeof FechaVencimientoSchema>>;

export function crearFechaVencimiento(input: unknown): Result<FechaVencimiento, KernelError> {
  const p = FechaVencimientoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Fecha de vencimiento inválida", { issues: p.error.issues }));
  if (Number.isNaN(Date.parse(p.data.fecha))) {
    return fail(KernelErrors.validation("La fecha de vencimiento no es una fecha ISO válida"));
  }
  return ok(Object.freeze(p.data));
}

/** ¿Está vencida respecto a `ahora`? (comparación de instantes ISO). */
export function estaVencida(fv: FechaVencimiento, ahora: Date): boolean {
  return Date.parse(fv.fecha) <= ahora.getTime();
}

/* ------------------------------- Parámetros ------------------------------ */
/**
 * Mínimo / Máximo / Punto de reorden: parámetros de política de reposición por
 * item+bodega. Se validan como magnitudes no negativas y coherentes entre sí.
 */
export const MinimoSchema = z.object({ valor: z.number().finite().nonnegative() }).strict();
export const MaximoSchema = z.object({ valor: z.number().finite().nonnegative() }).strict();
export const PuntoReordenSchema = z.object({ valor: z.number().finite().nonnegative() }).strict();
export type Minimo = Readonly<{ valor: number }>;
export type Maximo = Readonly<{ valor: number }>;
export type PuntoReorden = Readonly<{ valor: number }>;

export function crearMinimo(input: unknown): Result<Minimo, KernelError> {
  const p = MinimoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Mínimo inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
export function crearMaximo(input: unknown): Result<Maximo, KernelError> {
  const p = MaximoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Máximo inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
export function crearPuntoReorden(input: unknown): Result<PuntoReorden, KernelError> {
  const p = PuntoReordenSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Punto de reorden inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/**
 * Política de reposición completa (min/max/reorden coherentes). Invariante:
 * `minimo <= puntoReorden <= maximo` cuando el máximo es > 0.
 */
export const PoliticaReposicionSchema = z
  .object({
    minimo: z.number().finite().nonnegative().default(0),
    maximo: z.number().finite().nonnegative().default(0),
    puntoReorden: z.number().finite().nonnegative().default(0),
  })
  .strict()
  .refine((r) => r.maximo === 0 || r.minimo <= r.maximo, {
    message: "El mínimo no puede superar el máximo",
  })
  .refine((r) => r.maximo === 0 || r.puntoReorden <= r.maximo, {
    message: "El punto de reorden no puede superar el máximo",
  });
export type PoliticaReposicion = Readonly<z.infer<typeof PoliticaReposicionSchema>>;

export function crearPoliticaReposicion(input: unknown): Result<PoliticaReposicion, KernelError> {
  const p = PoliticaReposicionSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Política de reposición inválida", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* -------------------------------- Lead time ------------------------------ */
/** Tiempo de aprovisionamiento en días (neutro y serializable). */
export const LeadTimeSchema = z.object({ dias: z.number().int().nonnegative() }).strict();
export type LeadTime = Readonly<z.infer<typeof LeadTimeSchema>>;

export function crearLeadTime(input: unknown): Result<LeadTime, KernelError> {
  const p = LeadTimeSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Lead time inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}

/* --------------------------- Proveedor preferido ------------------------- */
/**
 * Proveedor preferido: referencia opaca a un proveedor (id + etiqueta
 * denormalizada). El módulo NO gestiona proveedores; solo guarda la referencia.
 */
export const ProveedorPreferidoSchema = z
  .object({
    proveedorId: z.string().min(1),
    etiqueta: z.string().max(200).optional(),
    /** Lead time acordado con este proveedor (días). */
    leadTimeDias: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ProveedorPreferido = Readonly<z.infer<typeof ProveedorPreferidoSchema>>;

export function crearProveedorPreferido(input: unknown): Result<ProveedorPreferido, KernelError> {
  const p = ProveedorPreferidoSchema.safeParse(input);
  if (!p.success) return fail(KernelErrors.validation("Proveedor preferido inválido", { issues: p.error.issues }));
  return ok(Object.freeze(p.data));
}
