/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregates `Lote` y `Serie`.
 *
 * `LoteInventario` gobierna vencimientos y trazabilidad de un lote de un item.
 * `SerieInventario` gobierna una unidad rastreable individual (número de serie).
 * Ambos mantienen su HISTORIAL (referencias a movimientos) para trazabilidad. La
 * exigencia de lote/serie por item la fija su `ModoTrazabilidad` (item.ts).
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { LOTE_CREADO, SERIE_REGISTRADA } from "./events";
import { estaVencida, type FechaVencimiento } from "./value-objects";

export interface LoteInventario {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly codigo: string;
  readonly vencimiento: FechaVencimiento | null;
  /** Historial de ids de movimiento que afectaron al lote (trazabilidad). */
  readonly historial: readonly string[];
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SerieInventario {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly numero: string;
  /** Lote asociado (si el item es lote-y-serie), o null. */
  readonly loteCodigo: string | null;
  /** Ubicación actual (referencia) o null si aún no ingresó. */
  readonly ubicacionActual: string | null;
  readonly historial: readonly string[];
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioLote {
  readonly lote: LoteInventario;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}
export interface CambioSerie {
  readonly serie: SerieInventario;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

export interface DatosNuevoLote {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly codigo: string;
  readonly vencimiento?: FechaVencimiento | null;
  readonly actorId: string;
  readonly ahora: Date;
}

export function crearLoteInventario(d: DatosNuevoLote): Result<CambioLote, KernelError> {
  const codigo = d.codigo.trim();
  if (codigo.length === 0) return fail(KernelErrors.validation("El código de lote es obligatorio"));
  const lote: LoteInventario = {
    id: d.id,
    tenantId: d.tenantId,
    itemId: d.itemId,
    codigo,
    vencimiento: d.vencimiento ?? null,
    historial: [],
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({
    lote,
    evento: {
      tipo: LOTE_CREADO,
      payload: {
        tenantId: lote.tenantId,
        id: lote.id,
        entityRef: `inventario-lote:${lote.id}`,
        itemId: lote.itemId,
        codigo: lote.codigo,
        vencimiento: lote.vencimiento,
        version: lote.version,
        actorId: d.actorId,
        eventoTipo: LOTE_CREADO,
      },
    },
  });
}

/** ¿El lote está vencido respecto a `ahora`? (false si no controla vencimiento). */
export function loteVencido(lote: LoteInventario, ahora: Date): boolean {
  return lote.vencimiento !== null && estaVencida(lote.vencimiento, ahora);
}

/** Añade un movimiento al historial del lote (trazabilidad, inmutable). */
export function registrarMovimientoEnLote(lote: LoteInventario, movimientoId: string, ahora: Date): LoteInventario {
  return { ...lote, historial: [...lote.historial, movimientoId], version: lote.version + 1, updatedAt: ahora };
}

export interface DatosNuevaSerie {
  readonly id: string;
  readonly tenantId: string;
  readonly itemId: string;
  readonly numero: string;
  readonly loteCodigo?: string | null;
  readonly ubicacionActual?: string | null;
  readonly actorId: string;
  readonly ahora: Date;
}

export function registrarSerie(d: DatosNuevaSerie): Result<CambioSerie, KernelError> {
  const numero = d.numero.trim();
  if (numero.length === 0) return fail(KernelErrors.validation("El número de serie es obligatorio"));
  const serie: SerieInventario = {
    id: d.id,
    tenantId: d.tenantId,
    itemId: d.itemId,
    numero,
    loteCodigo: d.loteCodigo ?? null,
    ubicacionActual: d.ubicacionActual ?? null,
    historial: [],
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({
    serie,
    evento: {
      tipo: SERIE_REGISTRADA,
      payload: {
        tenantId: serie.tenantId,
        id: serie.id,
        entityRef: `inventario-serie:${serie.id}`,
        itemId: serie.itemId,
        numero: serie.numero,
        loteCodigo: serie.loteCodigo,
        ubicacionActual: serie.ubicacionActual,
        version: serie.version,
        actorId: d.actorId,
        eventoTipo: SERIE_REGISTRADA,
      },
    },
  });
}

/** Mueve la serie a una nueva ubicación y registra el movimiento (trazabilidad). */
export function moverSerie(
  serie: SerieInventario,
  ubicacionId: string,
  movimientoId: string,
  ahora: Date,
): SerieInventario {
  return {
    ...serie,
    ubicacionActual: ubicacionId,
    historial: [...serie.historial, movimientoId],
    version: serie.version + 1,
    updatedAt: ahora,
  };
}
