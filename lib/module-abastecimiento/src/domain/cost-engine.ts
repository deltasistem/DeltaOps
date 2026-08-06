/**
 * DGP-013 · Módulo Enterprise Procurement — MOTOR DE COSTOS (puro, determinista).
 *
 * Al recibir una compra se actualiza la valorización del artículo:
 *   · costo PROMEDIO PONDERADO: media ponderada por cantidad entre el saldo
 *     valorizado previo y la nueva entrada;
 *   · ÚLTIMO costo: el costo unitario de la entrada más reciente;
 *   · costo ESTÁNDAR: NO se altera por recepciones (se fija por administración).
 *
 * Funciones PURAS y deterministas (sin IO, sin reloj). Toda la aritmética
 * redondea de forma estable (ver `redondear`) para evitar arrastre de error. La
 * moneda de la entrada DEBE coincidir con la del estado de costos del artículo.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { redondear } from "./value-objects";
import type { EstadoCostos } from "./articulo";

/** Entrada de compra que impacta la valorización de un artículo. */
export interface EntradaCosto {
  readonly moneda: string;
  /** Cantidad recibida (> 0). */
  readonly cantidad: number;
  /** Costo UNITARIO de la entrada (>= 0), en la moneda del artículo. */
  readonly costoUnitario: number;
}

/**
 * Aplica una entrada de compra al estado de costos por PROMEDIO PONDERADO.
 *
 * Invariantes:
 *   · cantidad > 0 y costoUnitario >= 0;
 *   · moneda de la entrada == moneda del estado;
 *   · el nuevo promedio pondera saldo previo (cantidadValorizada · costoPromedio)
 *     con la entrada (cantidad · costoUnitario) sobre la cantidad total;
 *   · si no había saldo previo (cantidadValorizada == 0), el promedio = costo de
 *     la entrada;
 *   · el último costo pasa a ser el costo de la entrada;
 *   · el costo estándar NUNCA cambia aquí.
 */
export function aplicarEntradaCosto(estado: EstadoCostos, entrada: EntradaCosto): Result<EstadoCostos, KernelError> {
  if (!Number.isFinite(entrada.cantidad) || entrada.cantidad <= 0) {
    return fail(KernelErrors.validation("La cantidad de la entrada de costo debe ser positiva"));
  }
  if (!Number.isFinite(entrada.costoUnitario) || entrada.costoUnitario < 0) {
    return fail(KernelErrors.validation("El costo unitario de la entrada no puede ser negativo"));
  }
  if (entrada.moneda !== estado.moneda) {
    return fail(KernelErrors.validation(`La moneda de la entrada (${entrada.moneda}) difiere de la del artículo (${estado.moneda})`));
  }

  const cantidadPrevia = estado.cantidadValorizada;
  const cantidadTotal = redondear(cantidadPrevia + entrada.cantidad, 6);

  let costoPromedio: number;
  if (cantidadPrevia <= 0) {
    // Sin saldo previo: el promedio es el costo de la entrada.
    costoPromedio = redondear(entrada.costoUnitario);
  } else {
    const valorPrevio = cantidadPrevia * estado.costoPromedio;
    const valorEntrada = entrada.cantidad * entrada.costoUnitario;
    costoPromedio = redondear((valorPrevio + valorEntrada) / cantidadTotal);
  }

  return ok(
    Object.freeze({
      moneda: estado.moneda,
      costoPromedio,
      ultimoCosto: redondear(entrada.costoUnitario),
      costoEstandar: estado.costoEstandar,
      cantidadValorizada: cantidadTotal,
    }),
  );
}

/**
 * Aplica una SECUENCIA de entradas de forma determinista (fold puro). Útil para
 * reconstruir la valorización por replay del event log. Se detiene y devuelve el
 * primer error encontrado sin efectos parciales visibles hacia afuera.
 */
export function aplicarEntradasCosto(estado: EstadoCostos, entradas: readonly EntradaCosto[]): Result<EstadoCostos, KernelError> {
  let acc = estado;
  for (const e of entradas) {
    const r = aplicarEntradaCosto(acc, e);
    if (!r.ok) return r;
    acc = r.value;
  }
  return ok(acc);
}

/** Fija el costo estándar (administración), sin tocar promedio/último. */
export function fijarCostoEstandar(estado: EstadoCostos, costoEstandar: number): Result<EstadoCostos, KernelError> {
  if (!Number.isFinite(costoEstandar) || costoEstandar < 0) {
    return fail(KernelErrors.validation("El costo estándar no puede ser negativo"));
  }
  return ok(Object.freeze({ ...estado, costoEstandar: redondear(costoEstandar) }));
}

/** Valor total valorizado (cantidad · promedio) del estado actual. */
export function valorTotal(estado: EstadoCostos): number {
  return redondear(estado.cantidadValorizada * estado.costoPromedio);
}
