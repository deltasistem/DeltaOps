/**
 * DGP-013 · Módulo Enterprise Procurement — Aggregate `Cotizacion` + comparación.
 *
 * Una cotización es la oferta de UN proveedor para UNA solicitud (líneas con
 * precio y plazo). La COMPARACIÓN de múltiples cotizaciones es una función PURA
 * y determinista que puntúa por criterios configurables (catálogo
 * `criterios-comparacion`) y devuelve un ranking reproducible.
 *
 * Dominio PURO: fecha/actor por INPUT; sin reloj interno.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { COTIZACION_REGISTRADA } from "./events";
import { redondear, type LineaCotizacion } from "./value-objects";

/* --------------------------------- Aggregate ----------------------------- */
export interface Cotizacion {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  readonly proveedorId: string;
  /** Clave del catálogo `monedas`. */
  readonly moneda: string;
  readonly lineas: readonly LineaCotizacion[];
  /** Total ofertado (suma de precioUnitario · cantidad de cada línea). */
  readonly total: number;
  /** Plazo de entrega global (máximo de las líneas), en días. */
  readonly plazoEntregaDias: number;
  /** Clave del catálogo `condiciones-pago` (o null). */
  readonly condicionesPago: string | null;
  readonly vigenteHasta: string | null;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface CambioCotizacion {
  readonly cotizacion: Cotizacion;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/** Total determinista de una cotización (Σ precioUnitario·cantidad por línea). */
export function totalCotizacion(lineas: readonly LineaCotizacion[]): number {
  return redondear(lineas.reduce((acc, l) => acc + l.precioUnitario.monto * l.cantidad.valor, 0));
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearCotizacionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  readonly proveedorId: string;
  readonly moneda: string;
  readonly lineas: readonly LineaCotizacion[];
  readonly condicionesPago?: string | null;
  readonly vigenteHasta?: string | null;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearCotizacion(input: CrearCotizacionInput): Result<CambioCotizacion, KernelError> {
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (input.lineas.length === 0) return fail(KernelErrors.validation("La cotización debe tener al menos una línea"));
  // Todas las líneas deben compartir la moneda declarada de la cotización.
  for (const l of input.lineas) {
    if (l.precioUnitario.moneda !== input.moneda) {
      return fail(KernelErrors.validation(`La línea ${l.numero} usa una moneda distinta a la cotización (${input.moneda})`));
    }
  }
  const numeros = new Set(input.lineas.map((l) => l.numero));
  if (numeros.size !== input.lineas.length) return fail(KernelErrors.validation("Los números de línea deben ser únicos"));

  const cotizacion: Cotizacion = {
    id: input.id,
    tenantId: input.tenantId,
    solicitudId: input.solicitudId,
    proveedorId: input.proveedorId,
    moneda: input.moneda,
    lineas: Object.freeze([...input.lineas]),
    total: totalCotizacion(input.lineas),
    plazoEntregaDias: input.lineas.reduce((m, l) => Math.max(m, l.plazoEntregaDias), 0),
    condicionesPago: input.condicionesPago ?? null,
    vigenteHasta: input.vigenteHasta ?? null,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
  };
  return ok({
    cotizacion: Object.freeze(cotizacion),
    evento: {
      tipo: COTIZACION_REGISTRADA,
      payload: {
        tenantId: cotizacion.tenantId,
        id: cotizacion.id,
        entityRef: `cotizacion:${cotizacion.id}`,
        solicitudId: cotizacion.solicitudId,
        proveedorId: cotizacion.proveedorId,
        total: cotizacion.total,
        moneda: cotizacion.moneda,
        version: cotizacion.version,
        actualizadoAt: cotizacion.createdAt,
        actorId: input.actorId,
        eventoTipo: COTIZACION_REGISTRADA,
        snapshot: cotizacion,
      },
    },
  });
}

/* ------------------------------ Comparación ------------------------------ */
/**
 * Peso de cada criterio de comparación (fracción, deben sumar ~1). Neutro y
 * configurable por el tenant; el dominio sólo aplica la ponderación.
 */
export interface PesosComparacion {
  readonly precio: number;
  readonly plazoEntrega: number;
  readonly calificacion: number;
}

export const PESOS_COMPARACION_DEFAULT: PesosComparacion = { precio: 0.5, plazoEntrega: 0.3, calificacion: 0.2 };

/** Dato de una cotización candidata para comparar (con la calificación del proveedor). */
export interface CandidataComparacion {
  readonly cotizacionId: string;
  readonly proveedorId: string;
  readonly moneda: string;
  readonly total: number;
  readonly plazoEntregaDias: number;
  /** Calificación del proveedor (0..5); 0 si no hay historial. */
  readonly calificacionProveedor: number;
}

export interface ResultadoComparacion {
  readonly cotizacionId: string;
  readonly proveedorId: string;
  /** Puntaje normalizado 0..1 (mayor es mejor). */
  readonly puntaje: number;
  readonly desglose: { precio: number; plazoEntrega: number; calificacion: number };
}

/**
 * Compara múltiples cotizaciones de forma PURA y determinista. Normaliza:
 *   · precio → menor total = mejor (1.0 el mínimo, 0 el máximo);
 *   · plazo  → menor plazo = mejor;
 *   · calificación → mayor = mejor (escala 0..5).
 * Todas las cotizaciones DEBEN compartir moneda (comparación homogénea). El
 * ranking se ordena por puntaje descendente; los empates se rompen por
 * `cotizacionId` para reproducibilidad total.
 */
export function compararCotizaciones(
  candidatas: readonly CandidataComparacion[],
  pesos: PesosComparacion = PESOS_COMPARACION_DEFAULT,
): Result<ResultadoComparacion[], KernelError> {
  if (candidatas.length === 0) return fail(KernelErrors.validation("No hay cotizaciones para comparar"));
  const moneda = candidatas[0]!.moneda;
  if (candidatas.some((c) => c.moneda !== moneda)) {
    return fail(KernelErrors.validation("No se pueden comparar cotizaciones en monedas distintas"));
  }
  const sumaPesos = pesos.precio + pesos.plazoEntrega + pesos.calificacion;
  if (sumaPesos <= 0) return fail(KernelErrors.validation("Los pesos de comparación deben sumar un valor positivo"));

  const totales = candidatas.map((c) => c.total);
  const plazos = candidatas.map((c) => c.plazoEntregaDias);
  const minTotal = Math.min(...totales);
  const maxTotal = Math.max(...totales);
  const minPlazo = Math.min(...plazos);
  const maxPlazo = Math.max(...plazos);

  const normMenorMejor = (v: number, min: number, max: number): number => (max === min ? 1 : redondear((max - v) / (max - min), 6));

  const resultados = candidatas.map((c) => {
    const precio = normMenorMejor(c.total, minTotal, maxTotal);
    const plazoEntrega = normMenorMejor(c.plazoEntregaDias, minPlazo, maxPlazo);
    const calificacion = redondear(Math.min(Math.max(c.calificacionProveedor, 0), 5) / 5, 6);
    const puntaje = redondear(
      (precio * pesos.precio + plazoEntrega * pesos.plazoEntrega + calificacion * pesos.calificacion) / sumaPesos,
      6,
    );
    return { cotizacionId: c.cotizacionId, proveedorId: c.proveedorId, puntaje, desglose: { precio, plazoEntrega, calificacion } };
  });

  resultados.sort((a, b) => (b.puntaje - a.puntaje) || a.cotizacionId.localeCompare(b.cotizacionId));
  return ok(resultados);
}
