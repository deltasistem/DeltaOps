/**
 * DGP-013 · Módulo Enterprise Procurement — LÓGICA DE INTEGRACIÓN (dominio puro).
 *
 * Deriva, de forma PURA y determinista, los efectos que una recepción tiene sobre
 * otros módulos. La ORQUESTACIÓN real (llamar a Inventario/Órdenes/Planes por sus
 * comandos OFICIALES) es de la ETAPA 2; aquí sólo se CALCULAN los insumos:
 *
 *   · ENTRADAS DE INVENTARIO: por cada línea recibida con cantidad efectiva
 *     (descontando faltantes/averías según la novedad), referenciando
 *     item/bodega/lote/serie (referencia-only);
 *   · ACTUALIZACIÓN DE COSTOS: la entrada de costo unitario tomada del precio de
 *     la línea de la OC (para alimentar el motor de costos);
 *   · TRAZABILIDAD DE ORIGEN: el vínculo OC→solicitud→origen (OT/plan/inventario)
 *     para, en etapa 2, liberar reservas / marcar planes listos.
 *
 * Sin IO, sin reloj: todo llega como INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import type { OrdenCompra } from "./orden-compra";
import type { Recepcion } from "./recepcion";
import type { EntradaCosto } from "./cost-engine";
import type { ReferenciaExterna, ReferenciaOrigen } from "./value-objects";

/** Novedades que reducen la cantidad válida que entra a inventario. */
export const NOVEDADES_NO_INGRESABLES: readonly string[] = ["faltante", "averiado", "vencido", "no-conforme"];

/** Entrada de inventario derivada de una línea recibida (referencia-only). */
export interface EntradaInventario {
  readonly numeroLineaOC: number;
  readonly articuloId: string | null;
  readonly inventarioItemRef: ReferenciaExterna | null;
  readonly bodega: ReferenciaExterna | null;
  readonly cantidad: number;
  readonly unidad: string;
  readonly lote: string | null;
  readonly serie: string | null;
  readonly novedad: string;
}

/** Actualización de costo derivada de una línea recibida. */
export interface ActualizacionCosto {
  readonly numeroLineaOC: number;
  readonly articuloId: string | null;
  readonly entrada: EntradaCosto;
}

/** Vínculo declarativo de trazabilidad de origen (para liberar reservas/planes). */
export interface VinculoOrigen {
  readonly ordenCompraId: string;
  readonly solicitudId: string | null;
  readonly origen: ReferenciaOrigen | null;
}

export interface EfectosRecepcion {
  readonly entradasInventario: readonly EntradaInventario[];
  readonly actualizacionesCosto: readonly ActualizacionCosto[];
}

/**
 * Deriva las ENTRADAS DE INVENTARIO y las ACTUALIZACIONES DE COSTO a partir de
 * una recepción y su OC. La cantidad que ingresa a inventario descuenta las
 * líneas con novedad NO ingresable (faltante/averiado/vencido/no-conforme):
 * esas líneas producen una entrada de inventario de cantidad 0 (registro de la
 * novedad) y NO alimentan el costo. Las demás ingresan por su cantidad recibida.
 */
export function derivarEfectosRecepcion(oc: OrdenCompra, recepcion: Recepcion): Result<EfectosRecepcion, KernelError> {
  if (recepcion.ordenCompraId !== oc.id) {
    return fail(KernelErrors.validation("La recepción no corresponde a la orden de compra indicada"));
  }
  const entradasInventario: EntradaInventario[] = [];
  const actualizacionesCosto: ActualizacionCosto[] = [];

  for (const lr of recepcion.lineas) {
    const lineaOC = oc.lineas.find((l) => l.numero === lr.numeroLineaOC);
    if (!lineaOC) return fail(KernelErrors.validation(`La línea ${lr.numeroLineaOC} no existe en la OC ${oc.id}`));

    const ingresable = !NOVEDADES_NO_INGRESABLES.includes(lr.novedad);
    const cantidadIngreso = ingresable ? lr.cantidad.valor : 0;

    entradasInventario.push({
      numeroLineaOC: lr.numeroLineaOC,
      articuloId: lineaOC.articuloId,
      inventarioItemRef: lineaOC.referencia,
      bodega: lr.bodega ?? lineaOC.bodega,
      cantidad: cantidadIngreso,
      unidad: lr.cantidad.unidad,
      lote: lr.lote,
      serie: lr.serie,
      novedad: lr.novedad,
    });

    if (ingresable && cantidadIngreso > 0) {
      actualizacionesCosto.push({
        numeroLineaOC: lr.numeroLineaOC,
        articuloId: lineaOC.articuloId,
        entrada: {
          moneda: lineaOC.precioUnitario.moneda,
          cantidad: cantidadIngreso,
          costoUnitario: lineaOC.precioUnitario.monto,
        },
      });
    }
  }

  return ok({
    entradasInventario: Object.freeze(entradasInventario),
    actualizacionesCosto: Object.freeze(actualizacionesCosto),
  });
}

/**
 * Vínculo de trazabilidad de origen de una OC (para liberar reservas de Órdenes /
 * marcar Planes listos en la etapa 2). Puro: sólo extrae la referencia.
 */
export function vinculoOrigenDeOC(oc: OrdenCompra, origen: ReferenciaOrigen | null): VinculoOrigen {
  return { ordenCompraId: oc.id, solicitudId: oc.solicitudId, origen: origen ?? null };
}
