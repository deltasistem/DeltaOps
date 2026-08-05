/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregate `Ajuste`.
 *
 * Corrige existencias por merma, sobrante, daño, vencimiento, corrección o
 * inventario inicial. El TIPO de ajuste es una clave del catálogo `tipos-ajuste`
 * (neutro). Está PREPARADO para gobernarse por workflow (contratos): el aggregate
 * REFLEJA el estado neutro resultante y, al aprobarse, se traduce a movimientos
 * `ajuste-positivo`/`ajuste-negativo` sobre las existencias.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { AJUSTE_APLICADO } from "./events";
import type { ReferenciaWorkflow } from "./workflow";

export const ESTADOS_AJUSTE = ["borrador", "aprobado", "aplicado", "rechazado"] as const;
export type EstadoAjuste = (typeof ESTADOS_AJUSTE)[number];

export interface LineaAjuste {
  readonly itemId: string;
  readonly inventarioId: string;
  readonly bodegaId: string;
  readonly ubicacionId: string;
  readonly loteCodigo: string | null;
  readonly serieNumero: string | null;
  /** Delta con signo: >0 incrementa disponible, <0 lo reduce. */
  readonly delta: number;
}

export interface Ajuste {
  readonly id: string;
  readonly tenantId: string;
  /** Clave del catálogo `tipos-ajuste`. */
  readonly tipo: string;
  readonly motivo: string | null;
  readonly lineas: readonly LineaAjuste[];
  readonly estado: EstadoAjuste;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioAjuste {
  readonly ajuste: Ajuste;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(a: Ajuste, actorId: string): CambioAjuste["evento"] {
  return {
    tipo: AJUSTE_APLICADO,
    payload: {
      tenantId: a.tenantId,
      id: a.id,
      entityRef: `inventario-ajuste:${a.id}`,
      tipo: a.tipo,
      motivo: a.motivo,
      lineas: a.lineas,
      estado: a.estado,
      workflow: a.workflow,
      version: a.version,
      createdBy: a.createdBy,
      actualizadoAt: a.updatedAt.toISOString(),
      actorId,
      eventoTipo: AJUSTE_APLICADO,
    },
  };
}

export interface DatosNuevoAjuste {
  readonly id: string;
  readonly tenantId: string;
  readonly tipo: string;
  readonly motivo?: string | null;
  readonly lineas: readonly LineaAjuste[];
  readonly workflow: ReferenciaWorkflow;
  readonly estadoInicial: EstadoAjuste;
  readonly actorId: string;
  readonly ahora: Date;
}

export function crearAjuste(d: DatosNuevoAjuste): Result<CambioAjuste, KernelError> {
  if (!d.tipo) return fail(KernelErrors.validation("El tipo de ajuste es obligatorio"));
  if (d.lineas.length === 0) return fail(KernelErrors.validation("El ajuste requiere al menos una línea"));
  for (const l of d.lineas) {
    if (l.delta === 0) return fail(KernelErrors.validation(`El delta de ${l.itemId} no puede ser cero`));
    if (!Number.isFinite(l.delta)) return fail(KernelErrors.validation(`El delta de ${l.itemId} no es finito`));
  }
  const ajuste: Ajuste = {
    id: d.id,
    tenantId: d.tenantId,
    tipo: d.tipo,
    motivo: d.motivo ?? null,
    lineas: Object.freeze([...d.lineas]),
    estado: d.estadoInicial,
    workflow: d.workflow,
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({ ajuste, evento: eventoDe(ajuste, d.actorId) });
}

/** Refleja el estado neutro del workflow (aprobado/aplicado/rechazado). */
export function aplicarEstadoAjuste(
  a: Ajuste,
  estado: EstadoAjuste,
  actorId: string,
  ahora: Date,
): Result<CambioAjuste, KernelError> {
  if (a.estado === "aplicado" || a.estado === "rechazado") {
    return fail(KernelErrors.conflict(`El ajuste ya está ${a.estado}`));
  }
  const siguiente: Ajuste = { ...a, estado, version: a.version + 1, updatedAt: ahora };
  return ok({ ajuste: siguiente, evento: eventoDe(siguiente, actorId) });
}
