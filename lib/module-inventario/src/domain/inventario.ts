/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregates `Inventario` (existencias)
 * y `MovimientoInventario`.
 *
 * `Inventario` es la posición de existencias de un item en una ubicación física
 * concreta (y, opcionalmente, lote/serie). Su stock SÓLO cambia aplicando un
 * `MovimientoInventario` (evento). El aggregate NUNCA expone un setter de stock:
 * toda mutación pasa por `aplicarMovimientoInventario`, que preserva invariantes.
 *
 * `MovimientoInventario` es el registro INMUTABLE de un movimiento aplicado; es
 * la única fuente de verdad de los cambios de existencias (auditable, replayable).
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { MOVIMIENTO_REGISTRADO, STOCK_ACTUALIZADO } from "./events";
import {
  aplicarMovimiento,
  STOCK_CERO,
  totalStock,
  type EntradaMovimiento,
  type FamiliaMovimiento,
  type Stock,
} from "./stock";
import type { Lote, Serie, UbicacionFisica } from "./value-objects";

/** Clave de existencia: item + ubicación + (lote?) + (serie?). */
export interface ClaveExistencia {
  readonly itemId: string;
  readonly ubicacionId: string;
  readonly loteCodigo: string | null;
  readonly serieNumero: string | null;
}

export interface Inventario {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly bodegaId: string;
  readonly ubicacion: UbicacionFisica;
  readonly lote: Lote | null;
  readonly serie: Serie | null;
  readonly stock: Stock;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MovimientoInventario {
  readonly id: string;
  readonly tenantId: string;
  readonly inventarioId: string;
  readonly itemId: string;
  readonly bodegaId: string;
  readonly ubicacionId: string;
  readonly loteCodigo: string | null;
  readonly serieNumero: string | null;
  /** Clave del catálogo `tipos-movimiento` (etiqueta del tenant). */
  readonly tipo: string;
  /** Familia contable neutra que gobierna el efecto sobre el stock. */
  readonly familia: FamiliaMovimiento;
  readonly motivo: string | null;
  readonly cantidad: number;
  readonly stockAntes: Stock;
  readonly stockDespues: Stock;
  /** Referencia opaca al origen del movimiento (OT, proyecto, transferencia…). */
  readonly referencia: { tipo: string; id: string } | null;
  /** Idempotencia Offline First: id de operación de cliente. */
  readonly opId: string | null;
  readonly actorId: string;
  readonly registradoAt: Date;
}

export interface CambioInventario {
  readonly inventario: Inventario;
  readonly movimiento: MovimientoInventario;
  readonly eventos: readonly { tipo: string; payload: Record<string, unknown> }[];
}

export interface DatosNuevaExistencia {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly bodegaId: string;
  readonly ubicacion: UbicacionFisica;
  readonly lote?: Lote | null;
  readonly serie?: Serie | null;
  readonly ahora: Date;
}

/** Crea una posición de existencias VACÍA (stock en cero). */
export function crearExistencia(d: DatosNuevaExistencia): Inventario {
  return {
    id: d.id,
    tenantId: d.tenantId,
    itemId: d.itemId,
    bodegaId: d.bodegaId,
    ubicacion: d.ubicacion,
    lote: d.lote ?? null,
    serie: d.serie ?? null,
    stock: STOCK_CERO,
    version: 1,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
}

export interface DatosMovimiento {
  readonly movimientoId: string;
  readonly tipo: string;
  readonly familia: FamiliaMovimiento;
  readonly motivo?: string | null;
  readonly cantidad: number;
  readonly objetivo?: number;
  readonly referencia?: { tipo: string; id: string } | null;
  readonly opId?: string | null;
  readonly actorId: string;
  readonly ahora: Date;
}

function eventoMovimiento(m: MovimientoInventario): { tipo: string; payload: Record<string, unknown> } {
  return {
    tipo: MOVIMIENTO_REGISTRADO,
    payload: {
      tenantId: m.tenantId,
      id: m.id,
      entityRef: `inventario-movimiento:${m.id}`,
      inventarioId: m.inventarioId,
      itemId: m.itemId,
      bodegaId: m.bodegaId,
      ubicacionId: m.ubicacionId,
      loteCodigo: m.loteCodigo,
      serieNumero: m.serieNumero,
      tipo: m.tipo,
      familia: m.familia,
      motivo: m.motivo,
      cantidad: m.cantidad,
      stockAntes: m.stockAntes,
      stockDespues: m.stockDespues,
      referencia: m.referencia,
      opId: m.opId,
      actorId: m.actorId,
      registradoAt: m.registradoAt.toISOString(),
      eventoTipo: MOVIMIENTO_REGISTRADO,
    },
  };
}

function eventoStock(inv: Inventario, actorId: string): { tipo: string; payload: Record<string, unknown> } {
  return {
    tipo: STOCK_ACTUALIZADO,
    payload: {
      tenantId: inv.tenantId,
      id: inv.id,
      entityRef: `inventario:${inv.id}`,
      itemId: inv.itemId,
      bodegaId: inv.bodegaId,
      ubicacionId: inv.ubicacion.ubicacionId,
      loteCodigo: inv.lote?.codigo ?? null,
      serieNumero: inv.serie?.numero ?? null,
      stock: inv.stock,
      total: totalStock(inv.stock),
      version: inv.version,
      actualizadoAt: inv.updatedAt.toISOString(),
      actorId,
      eventoTipo: STOCK_ACTUALIZADO,
    },
  };
}

/**
 * Aplica un movimiento a la existencia: única vía de mutación de stock. Devuelve
 * el nuevo aggregate + el registro inmutable del movimiento + los eventos
 * autosuficientes (`MovimientoRegistrado` y `StockActualizado`). Falla —sin
 * mutar— si el movimiento violaría una invariante de stock.
 */
export function aplicarMovimientoInventario(
  inv: Inventario,
  d: DatosMovimiento,
): Result<CambioInventario, KernelError> {
  const entrada: EntradaMovimiento = {
    familia: d.familia,
    cantidad: d.cantidad,
    ...(d.objetivo !== undefined ? { objetivo: d.objetivo } : {}),
  };
  const nuevoStock = aplicarMovimiento(inv.stock, entrada);
  if (!nuevoStock.ok) return nuevoStock;

  const siguiente: Inventario = {
    ...inv,
    stock: nuevoStock.value,
    version: inv.version + 1,
    updatedAt: d.ahora,
  };
  const movimiento: MovimientoInventario = {
    id: d.movimientoId,
    tenantId: inv.tenantId,
    inventarioId: inv.id,
    itemId: inv.itemId,
    bodegaId: inv.bodegaId,
    ubicacionId: inv.ubicacion.ubicacionId,
    loteCodigo: inv.lote?.codigo ?? null,
    serieNumero: inv.serie?.numero ?? null,
    tipo: d.tipo,
    familia: d.familia,
    motivo: d.motivo ?? null,
    cantidad: d.cantidad,
    stockAntes: inv.stock,
    stockDespues: nuevoStock.value,
    referencia: d.referencia ?? null,
    opId: d.opId ?? null,
    actorId: d.actorId,
    registradoAt: d.ahora,
  };
  return ok({
    inventario: siguiente,
    movimiento,
    eventos: [eventoMovimiento(movimiento), eventoStock(siguiente, d.actorId)],
  });
}

/**
 * Reconstruye el stock de una existencia a partir de su historial de movimientos
 * (replay). Base para pruebas de idempotencia/replay y para proyecciones futuras.
 */
export function reconstruirStock(movimientos: readonly MovimientoInventario[]): Stock {
  return movimientos.reduce<Stock>((_acc, m) => m.stockDespues, STOCK_CERO);
}
