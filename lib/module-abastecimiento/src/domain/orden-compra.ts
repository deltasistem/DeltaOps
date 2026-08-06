/**
 * DGP-013 · Módulo Enterprise Procurement — Aggregate `OrdenCompra`.
 *
 * Orden de compra con líneas, moneda y condiciones. El ciclo de vida
 * (borrador → aprobada → enviada → parcialmenteRecibida → recibida/cancelada)
 * está GOBERNADO por el Workflow Engine: el aggregate REFLEJA el estado neutro
 * autorizado, nunca lo decide. Cada acción es una transición REAL con su comando.
 *
 * La OC lleva el ACUMULADO recibido por línea (recibidoPorLinea) que el dominio
 * usa para derivar el estado de recepción (parcialmente/total) de forma PURA. La
 * sobre-recepción sólo se admite dentro de la TOLERANCIA por línea. Dominio PURO:
 * fecha/actor por INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  ORDEN_COMPRA_APROBADA,
  ORDEN_COMPRA_CANCELADA,
  ORDEN_COMPRA_CREADA,
  ORDEN_COMPRA_ENVIADA,
  ORDEN_COMPRA_RECIBIDA_PARCIAL,
  ORDEN_COMPRA_RECIBIDA_TOTAL,
} from "./events";
import type { ReferenciaWorkflow } from "./workflow";
import { redondear, type LineaOrdenCompra } from "./value-objects";

/* --------------------------------- Estados ------------------------------- */
export const ESTADOS_OC = ["borrador", "aprobada", "enviada", "parcialmenteRecibida", "recibida", "cancelada"] as const;
export type EstadoOC = (typeof ESTADOS_OC)[number];

export const ESTADOS_OC_TERMINALES: readonly EstadoOC[] = ["recibida", "cancelada"];

/** Estados desde los que la OC admite recepciones. */
export const ESTADOS_OC_RECEPCIONABLES: readonly EstadoOC[] = ["enviada", "parcialmenteRecibida"];

export const ACCIONES_OC = ["aprobar", "enviar", "cancelar"] as const;
export type AccionOC = (typeof ACCIONES_OC)[number];

/** Acción neutra de transición explícita (no receptiva) → estado + evento. */
const TRANSICIONES: Record<string, { destino: EstadoOC; evento: string; desde: readonly EstadoOC[] }> = {
  aprobar: { destino: "aprobada", evento: ORDEN_COMPRA_APROBADA, desde: ["borrador"] },
  enviar: { destino: "enviada", evento: ORDEN_COMPRA_ENVIADA, desde: ["aprobada"] },
  cancelar: { destino: "cancelada", evento: ORDEN_COMPRA_CANCELADA, desde: ["borrador", "aprobada", "enviada"] },
};

/* --------------------------------- Aggregate ----------------------------- */
export interface OrdenCompra {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly proveedorId: string;
  /** Solicitud/cotización de origen (vínculos declarativos), o null. */
  readonly solicitudId: string | null;
  readonly cotizacionId: string | null;
  /** Clave del catálogo `monedas`. */
  readonly moneda: string;
  readonly lineas: readonly LineaOrdenCompra[];
  /** Total ordenado (Σ precioUnitario · cantidad). */
  readonly total: number;
  /** Clave del catálogo `condiciones-pago` (o null). */
  readonly condicionesPago: string | null;
  /** Clave del catálogo `condiciones-entrega` (o null). */
  readonly condicionesEntrega: string | null;
  readonly estado: EstadoOC;
  /** Acumulado recibido por número de línea (cantidad, misma unidad de la línea). */
  readonly recibidoPorLinea: Readonly<Record<number, number>>;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioOrdenCompra {
  readonly orden: OrdenCompra;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/** Total determinista de una OC. */
export function totalOrdenCompra(lineas: readonly LineaOrdenCompra[]): number {
  return redondear(lineas.reduce((acc, l) => acc + l.precioUnitario.monto * l.cantidad.valor, 0));
}

function eventoDe(o: OrdenCompra, tipo: string, actorId: string, extra: Record<string, unknown> = {}): CambioOrdenCompra["evento"] {
  return {
    tipo,
    payload: {
      tenantId: o.tenantId,
      id: o.id,
      entityRef: `orden-compra:${o.id}`,
      codigo: o.codigo,
      nombre: o.codigo,
      proveedorId: o.proveedorId,
      estado: o.estado,
      total: o.total,
      moneda: o.moneda,
      version: o.version,
      actualizadoAt: o.updatedAt,
      actorId,
      eventoTipo: tipo,
      snapshot: o,
      ...extra,
    },
  };
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearOrdenCompraInput {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly proveedorId: string;
  readonly solicitudId?: string | null;
  readonly cotizacionId?: string | null;
  readonly moneda: string;
  readonly lineas: readonly LineaOrdenCompra[];
  readonly condicionesPago?: string | null;
  readonly condicionesEntrega?: string | null;
  readonly workflow: ReferenciaWorkflow;
  readonly estadoInicial: EstadoOC;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearOrdenCompra(input: CrearOrdenCompraInput): Result<CambioOrdenCompra, KernelError> {
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (input.lineas.length === 0) return fail(KernelErrors.validation("La orden de compra debe tener al menos una línea"));
  for (const l of input.lineas) {
    if (l.precioUnitario.moneda !== input.moneda) {
      return fail(KernelErrors.validation(`La línea ${l.numero} usa una moneda distinta a la OC (${input.moneda})`));
    }
  }
  const numeros = new Set(input.lineas.map((l) => l.numero));
  if (numeros.size !== input.lineas.length) return fail(KernelErrors.validation("Los números de línea deben ser únicos"));

  const orden: OrdenCompra = {
    id: input.id,
    tenantId: input.tenantId,
    codigo: input.codigo,
    proveedorId: input.proveedorId,
    solicitudId: input.solicitudId ?? null,
    cotizacionId: input.cotizacionId ?? null,
    moneda: input.moneda,
    lineas: Object.freeze([...input.lineas]),
    total: totalOrdenCompra(input.lineas),
    condicionesPago: input.condicionesPago ?? null,
    condicionesEntrega: input.condicionesEntrega ?? null,
    estado: input.estadoInicial,
    recibidoPorLinea: Object.freeze({}),
    workflow: input.workflow,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ orden: Object.freeze(orden), evento: eventoDe(orden, ORDEN_COMPRA_CREADA, input.actorId, { lineas: orden.lineas.length }) });
}

/* ---------------------------- Transición gobernada ----------------------- */
export function aplicarAccionOrdenCompra(o: OrdenCompra, accion: AccionOC, actorId: string, ahora: string): Result<CambioOrdenCompra, KernelError> {
  if (ESTADOS_OC_TERMINALES.includes(o.estado)) {
    return fail(KernelErrors.conflict(`La orden de compra está en estado terminal "${o.estado}" y es inmutable`));
  }
  const t = TRANSICIONES[accion];
  if (!t) return fail(KernelErrors.validation(`Acción de orden de compra desconocida: "${accion}"`));
  if (!t.desde.includes(o.estado)) {
    return fail(KernelErrors.conflict(`No se puede "${accion}" una OC en estado "${o.estado}"`));
  }
  const actualizado: OrdenCompra = { ...o, estado: t.destino, version: o.version + 1, updatedAt: ahora };
  return ok({ orden: Object.freeze(actualizado), evento: eventoDe(actualizado, t.evento, actorId, { accion }) });
}

/* ------------------------ Recepción (dominio puro) ----------------------- */
/** Cantidad recibida acumulada de una línea. */
export function recibidoDeLinea(o: OrdenCompra, numeroLinea: number): number {
  return o.recibidoPorLinea[numeroLinea] ?? 0;
}

/** Tope máximo recibible de una línea (cantidad ordenada · (1 + tolerancia)). */
export function topeLinea(l: LineaOrdenCompra): number {
  return redondear(l.cantidad.valor * (1 + l.toleranciaSobreRecepcion), 6);
}

/** Entrada individual (por número de línea) de una recepción a aplicar. */
export interface EntradaRecepcion {
  readonly numeroLineaOC: number;
  readonly cantidad: number;
}

/**
 * Aplica una recepción (conjunto de entradas por línea) a la OC de forma PURA:
 *   · valida que la OC esté en un estado receptivo (enviada/parcialmenteRecibida);
 *   · cada línea debe existir y no exceder su TOPE (cantidad ordenada + tolerancia);
 *   · acumula lo recibido por línea;
 *   · deriva el nuevo estado: `recibida` si TODAS las líneas alcanzan su cantidad
 *     ordenada; `parcialmenteRecibida` en otro caso.
 *
 * Emite `orden-compra-recibida-total` o `-parcial` según corresponda. NO crea la
 * recepción (eso es del aggregate `Recepcion`): sólo refleja el acumulado.
 */
export function aplicarRecepcionOrdenCompra(
  o: OrdenCompra,
  entradas: readonly EntradaRecepcion[],
  actorId: string,
  ahora: string,
): Result<CambioOrdenCompra, KernelError> {
  if (!ESTADOS_OC_RECEPCIONABLES.includes(o.estado)) {
    return fail(KernelErrors.conflict(`No se puede recibir contra una OC en estado "${o.estado}"`));
  }
  if (entradas.length === 0) return fail(KernelErrors.validation("La recepción no tiene líneas"));

  const acumulado: Record<number, number> = { ...o.recibidoPorLinea };
  for (const e of entradas) {
    const linea = o.lineas.find((l) => l.numero === e.numeroLineaOC);
    if (!linea) return fail(KernelErrors.validation(`La línea ${e.numeroLineaOC} no existe en la OC`));
    if (!Number.isFinite(e.cantidad) || e.cantidad <= 0) {
      return fail(KernelErrors.validation(`La cantidad recibida de la línea ${e.numeroLineaOC} debe ser positiva`));
    }
    const nuevo = redondear((acumulado[e.numeroLineaOC] ?? 0) + e.cantidad, 6);
    const tope = topeLinea(linea);
    if (nuevo > tope) {
      return fail(
        KernelErrors.conflict(
          `La recepción de la línea ${e.numeroLineaOC} (acumulado ${nuevo}) excede el tope ${tope} (ordenado ${linea.cantidad.valor} + tolerancia ${linea.toleranciaSobreRecepcion})`,
        ),
      );
    }
    acumulado[e.numeroLineaOC] = nuevo;
  }

  // Estado derivado: total si TODA línea alcanza su cantidad ORDENADA (no el tope).
  const completa = o.lineas.every((l) => (acumulado[l.numero] ?? 0) >= l.cantidad.valor);
  const destino: EstadoOC = completa ? "recibida" : "parcialmenteRecibida";
  const actualizado: OrdenCompra = {
    ...o,
    estado: destino,
    recibidoPorLinea: Object.freeze(acumulado),
    version: o.version + 1,
    updatedAt: ahora,
  };
  const evento = completa ? ORDEN_COMPRA_RECIBIDA_TOTAL : ORDEN_COMPRA_RECIBIDA_PARCIAL;
  return ok({ orden: Object.freeze(actualizado), evento: eventoDe(actualizado, evento, actorId, { completa }) });
}
