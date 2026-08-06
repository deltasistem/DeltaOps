/**
 * DGP-013 · Módulo Enterprise Procurement — Aggregate `Recepcion`.
 *
 * Recepción de mercancía contra una OC: parcial/total/con novedades, por líneas
 * con cantidades, lote/serie y una novedad del catálogo `novedades-recepcion`.
 * La recepción es un HECHO inmutable (append-only): se registra y no cambia de
 * estado. El impacto sobre la OC (acumulado y estado derivado) lo calcula el
 * aggregate `OrdenCompra` (dominio puro). Dominio PURO: fecha/actor por INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { RECEPCION_REGISTRADA } from "./events";
import type { LineaRecepcion } from "./value-objects";

/* --------------------------------- Aggregate ----------------------------- */
export interface Recepcion {
  readonly id: string;
  readonly tenantId: string;
  readonly ordenCompraId: string;
  readonly consecutivo: number;
  readonly lineas: readonly LineaRecepcion[];
  /** ¿La recepción completó la OC? (derivado por el aggregate OC). */
  readonly completaOrden: boolean;
  /** ¿Alguna línea llegó con novedad distinta de `ninguna`? */
  readonly conNovedades: boolean;
  readonly recibidoEn: string;
  readonly recibidoPor: string;
  readonly nota: string | null;
}

export interface CambioRecepcion {
  readonly recepcion: Recepcion;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/* -------------------------------- Registrar ------------------------------ */
export interface RegistrarRecepcionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly ordenCompraId: string;
  readonly consecutivo: number;
  readonly lineas: readonly LineaRecepcion[];
  readonly completaOrden: boolean;
  readonly nota?: string | null;
  readonly actorId: string;
  readonly ahora: string;
}

export function registrarRecepcion(input: RegistrarRecepcionInput): Result<CambioRecepcion, KernelError> {
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (input.lineas.length === 0) return fail(KernelErrors.validation("La recepción debe tener al menos una línea"));
  // Una recepción no puede repetir la misma línea de OC dos veces en el mismo acto.
  const numeros = new Set(input.lineas.map((l) => l.numeroLineaOC));
  if (numeros.size !== input.lineas.length) {
    return fail(KernelErrors.validation("Una recepción no puede repetir la misma línea de OC"));
  }
  const conNovedades = input.lineas.some((l) => l.novedad !== "ninguna");

  const recepcion: Recepcion = {
    id: input.id,
    tenantId: input.tenantId,
    ordenCompraId: input.ordenCompraId,
    consecutivo: input.consecutivo,
    lineas: Object.freeze([...input.lineas]),
    completaOrden: input.completaOrden,
    conNovedades,
    recibidoEn: input.ahora,
    recibidoPor: input.actorId,
    nota: input.nota ?? null,
  };
  return ok({
    recepcion: Object.freeze(recepcion),
    evento: {
      tipo: RECEPCION_REGISTRADA,
      payload: {
        tenantId: recepcion.tenantId,
        id: recepcion.id,
        entityRef: `recepcion:${recepcion.id}`,
        ordenCompraId: recepcion.ordenCompraId,
        consecutivo: recepcion.consecutivo,
        completaOrden: recepcion.completaOrden,
        conNovedades: recepcion.conNovedades,
        lineas: recepcion.lineas,
        actorId: input.actorId,
        actualizadoAt: recepcion.recibidoEn,
        eventoTipo: RECEPCION_REGISTRADA,
        snapshot: recepcion,
      },
    },
  });
}
