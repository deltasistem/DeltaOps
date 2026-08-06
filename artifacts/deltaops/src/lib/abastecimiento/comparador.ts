/**
 * DGP-013 · Comparador multi-proveedor de cotizaciones (lógica PURA de
 * presentación). Deriva totales, plazo de entrega y una puntuación de ranking a
 * partir de pesos declarados por el usuario. NO decide: la selección la ejecuta
 * el comando `seleccionar-cotizacion` (el motor es la autoridad); esto sólo
 * ordena y resalta para apoyar la decisión explícita.
 */
import type { CotizacionRow, LineaCotizacion } from "./tipos";

export interface PesosComparacion {
  /** Peso del precio (menor es mejor). */
  precio: number;
  /** Peso del plazo de entrega (menor es mejor). */
  plazoEntrega: number;
  /** Peso de la calificación del proveedor (mayor es mejor). */
  calificacion: number;
}

export const PESOS_POR_DEFECTO: PesosComparacion = { precio: 0.5, plazoEntrega: 0.3, calificacion: 0.2 };

export interface FilaComparacion {
  readonly cotizacion: CotizacionRow;
  readonly total: number;
  readonly plazoMaxDias: number;
  readonly calificacion: number;
  /** Puntuación normalizada 0..1 (mayor = mejor). */
  readonly puntuacion: number;
  /** Ranking 1..N (1 = recomendada). */
  readonly ranking: number;
  readonly esMejorPrecio: boolean;
  readonly esMejorPlazo: boolean;
}

/** Total de una cotización: suma de precio unitario × cantidad de sus líneas. */
export function totalCotizacion(c: CotizacionRow): number {
  if (typeof c.total === "number") return c.total;
  return (c.lineas ?? []).reduce((acc, l: LineaCotizacion) => {
    const monto = l.precioUnitario?.monto ?? 0;
    const cant = l.cantidad?.valor ?? 0;
    return acc + monto * cant;
  }, 0);
}

/** Plazo de entrega máximo (días) entre las líneas de la cotización. */
export function plazoMaximo(c: CotizacionRow): number {
  if (typeof c.plazoEntregaMaxDias === "number") return c.plazoEntregaMaxDias;
  const plazos = (c.lineas ?? []).map((l) => l.plazoEntregaDias ?? 0);
  return plazos.length ? Math.max(...plazos) : 0;
}

function calificacionProveedor(c: CotizacionRow, califs: Record<string, number>): number {
  return califs[c.proveedorId] ?? 0;
}

/**
 * Construye la tabla comparativa ordenada por puntuación (mejor primero).
 * `calificaciones` mapea proveedorId→promedio (0..5); si falta, 0.
 * Normaliza cada criterio contra el rango observado para hacerlos comparables.
 */
export function compararCotizaciones(
  cotizaciones: CotizacionRow[],
  pesos: PesosComparacion = PESOS_POR_DEFECTO,
  calificaciones: Record<string, number> = {},
): FilaComparacion[] {
  if (cotizaciones.length === 0) return [];

  const base = cotizaciones.map((c) => ({
    cotizacion: c,
    total: totalCotizacion(c),
    plazoMaxDias: plazoMaximo(c),
    calificacion: calificacionProveedor(c, calificaciones),
  }));

  const precios = base.map((b) => b.total);
  const plazos = base.map((b) => b.plazoMaxDias);
  const califs = base.map((b) => b.calificacion);
  const minPrecio = Math.min(...precios), maxPrecio = Math.max(...precios);
  const minPlazo = Math.min(...plazos), maxPlazo = Math.max(...plazos);
  const maxCalif = Math.max(...califs, 0);

  // Normaliza 0..1 (1 = mejor). Precio/plazo: menor mejor. Calificación: mayor mejor.
  const norm = (valor: number, min: number, max: number, menorMejor: boolean): number => {
    if (max === min) return 1;
    const escala = (valor - min) / (max - min); // 0..1 (0 = valor mínimo)
    return menorMejor ? 1 - escala : escala;
  };

  const pesoTotal = pesos.precio + pesos.plazoEntrega + pesos.calificacion || 1;
  const conPuntuacion = base.map((b) => {
    const nPrecio = norm(b.total, minPrecio, maxPrecio, true);
    const nPlazo = norm(b.plazoMaxDias, minPlazo, maxPlazo, true);
    const nCalif = maxCalif === 0 ? 0 : b.calificacion / 5;
    const puntuacion = (pesos.precio * nPrecio + pesos.plazoEntrega * nPlazo + pesos.calificacion * nCalif) / pesoTotal;
    return { ...b, puntuacion, esMejorPrecio: b.total === minPrecio, esMejorPlazo: b.plazoMaxDias === minPlazo };
  });

  const ordenadas = [...conPuntuacion].sort((a, b) => b.puntuacion - a.puntuacion);
  return ordenadas.map((f, i) => ({ ...f, ranking: i + 1 }));
}
