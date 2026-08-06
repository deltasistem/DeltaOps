/**
 * DGP-011.1 · Módulo Enterprise Inventory — Aggregate `Transferencia`.
 *
 * Traslada existencias entre ubicaciones/bodegas/empresas/proyectos/centros de
 * costo. Está PREPARADA para gobernarse por el Workflow Engine (contratos en
 * workflow.ts): el aggregate REFLEJA el estado neutro resultante, no lo decide.
 * En dos fases (salida→en tránsito→entrada) SIN romper consistencia de stock.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  TRANSFERENCIA_CANCELADA,
  TRANSFERENCIA_COMPLETADA,
  TRANSFERENCIA_CREADA,
  TRANSFERENCIA_RECIBIDA,
} from "./events";
import type { ReferenciaWorkflow } from "./workflow";

export const ESTADOS_TRANSFERENCIA = [
  "borrador",
  "en-transito",
  "recibida",
  "completada",
  "cancelada",
] as const;
export type EstadoTransferencia = (typeof ESTADOS_TRANSFERENCIA)[number];

/** Estados terminales del ciclo de vida (inmutables). */
export const ESTADOS_TRANSFERENCIA_TERMINALES: readonly EstadoTransferencia[] = [
  "recibida",
  "completada",
  "cancelada",
];

/**
 * Acciones del ciclo de vida GOBERNADO que el motor de workflow autoriza. La
 * app traduce cada acción de dominio a un comando del motor (camelCase) y refleja
 * el estado neutro resultante en el aggregate.
 */
export const ACCIONES_TRANSFERENCIA = ["recibir", "completar", "cancelar", "rechazar"] as const;
export type AccionTransferencia = (typeof ACCIONES_TRANSFERENCIA)[number];

/** Estado de dominio resultante de cada acción autorizada. */
export const ESTADO_DESTINO_ACCION: Record<AccionTransferencia, EstadoTransferencia> = {
  recibir: "recibida",
  completar: "completada",
  cancelar: "cancelada",
  rechazar: "cancelada",
};

/**
 * Acciones que materializan la ENTRADA en destino (única etapa que aplica stock
 * de recepción). El resto libera el `en-tránsito` de vuelta al origen.
 */
export function accionAplicaRecepcion(accion: AccionTransferencia): boolean {
  return accion === "recibir" || accion === "completar";
}

export interface ExtremoTransferencia {
  readonly bodegaId: string;
  readonly ubicacionId: string;
  readonly empresa: string | null;
  readonly proyecto: string | null;
  readonly centroCosto: string | null;
}

export interface LineaTransferencia {
  readonly itemId: string;
  readonly cantidad: number;
  readonly loteCodigo: string | null;
  readonly serieNumero: string | null;
}

export interface Transferencia {
  readonly id: string;
  readonly tenantId: string;
  readonly origen: ExtremoTransferencia;
  readonly destino: ExtremoTransferencia;
  readonly lineas: readonly LineaTransferencia[];
  readonly estado: EstadoTransferencia;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioTransferencia {
  readonly transferencia: Transferencia;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(
  t: Transferencia,
  tipo: string,
  actorId: string,
  extra: Record<string, unknown> = {},
): CambioTransferencia["evento"] {
  return {
    tipo,
    payload: {
      tenantId: t.tenantId,
      id: t.id,
      entityRef: `inventario-transferencia:${t.id}`,
      origen: t.origen,
      destino: t.destino,
      lineas: t.lineas,
      estado: t.estado,
      workflow: t.workflow,
      version: t.version,
      createdBy: t.createdBy,
      actualizadoAt: t.updatedAt.toISOString(),
      actorId,
      eventoTipo: tipo,
      ...extra,
    },
  };
}

/** Evento canónico de cada estado terminal (payload autosuficiente). */
const EVENTO_POR_ESTADO: Record<EstadoTransferencia, string> = {
  borrador: TRANSFERENCIA_CREADA,
  "en-transito": TRANSFERENCIA_CREADA,
  recibida: TRANSFERENCIA_RECIBIDA,
  completada: TRANSFERENCIA_COMPLETADA,
  cancelada: TRANSFERENCIA_CANCELADA,
};

export interface DatosNuevaTransferencia {
  readonly id: string;
  readonly tenantId: string;
  readonly origen: ExtremoTransferencia;
  readonly destino: ExtremoTransferencia;
  readonly lineas: readonly LineaTransferencia[];
  readonly workflow: ReferenciaWorkflow;
  /** Estado neutro inicial que devuelve el motor de workflow (p. ej. `en-transito`). */
  readonly estadoInicial: EstadoTransferencia;
  readonly actorId: string;
  readonly ahora: Date;
}

export function crearTransferencia(d: DatosNuevaTransferencia): Result<CambioTransferencia, KernelError> {
  if (d.lineas.length === 0) return fail(KernelErrors.validation("La transferencia requiere al menos una línea"));
  for (const l of d.lineas) {
    if (!(l.cantidad > 0)) return fail(KernelErrors.validation(`La cantidad de ${l.itemId} debe ser positiva`));
  }
  const mismaUbicacion =
    d.origen.bodegaId === d.destino.bodegaId && d.origen.ubicacionId === d.destino.ubicacionId;
  if (mismaUbicacion) {
    return fail(KernelErrors.validation("El origen y el destino no pueden ser la misma ubicación"));
  }
  const transferencia: Transferencia = {
    id: d.id,
    tenantId: d.tenantId,
    origen: d.origen,
    destino: d.destino,
    lineas: Object.freeze([...d.lineas]),
    estado: d.estadoInicial,
    workflow: d.workflow,
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({ transferencia, evento: eventoDe(transferencia, TRANSFERENCIA_CREADA, d.actorId) });
}

/**
 * Refleja el estado neutro comunicado por el motor de workflow (o la transición
 * directa). El aggregate NO decide: sólo valida coherencia mínima del ciclo.
 */
export function aplicarEstadoTransferencia(
  t: Transferencia,
  estado: EstadoTransferencia,
  actorId: string,
  ahora: Date,
): Result<CambioTransferencia, KernelError> {
  if (ESTADOS_TRANSFERENCIA_TERMINALES.includes(t.estado)) {
    return fail(KernelErrors.conflict(`La transferencia ya está ${t.estado}`));
  }
  const siguiente: Transferencia = { ...t, estado, version: t.version + 1, updatedAt: ahora };
  const tipo = EVENTO_POR_ESTADO[estado] ?? TRANSFERENCIA_CREADA;
  return ok({ transferencia: siguiente, evento: eventoDe(siguiente, tipo, actorId, { accionEstado: estado }) });
}

/**
 * Aplica una ACCIÓN del ciclo de vida gobernado (recibir/completar/cancelar/
 * rechazar) al aggregate, reflejando el estado neutro que el motor resolvió. El
 * aggregate NO decide la transición: la app verifica el Result del motor ANTES
 * de invocar esta función y ANTES de aplicar cualquier efecto sobre stock.
 */
export function aplicarAccionTransferencia(
  t: Transferencia,
  accion: AccionTransferencia,
  actorId: string,
  ahora: Date,
): Result<CambioTransferencia, KernelError> {
  if (ESTADOS_TRANSFERENCIA_TERMINALES.includes(t.estado)) {
    return fail(KernelErrors.conflict(`La transferencia ya está ${t.estado}`));
  }
  if (t.estado !== "en-transito") {
    return fail(KernelErrors.conflict(`No se puede ${accion} una transferencia en estado ${t.estado}`));
  }
  return aplicarEstadoTransferencia(t, ESTADO_DESTINO_ACCION[accion], actorId, ahora);
}
