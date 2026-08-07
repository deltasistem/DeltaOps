/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Aggregate `Intervencion`.
 *
 * La INTERVENCIÓN materializa la ejecución del correctivo tras generar la OT: su
 * ciclo de vida NEUTRO (preparación → asignación → ejecución → verificación →
 * cerrada) es gobernado por el Workflow Engine. Soporta el CORRECTIVO MAYOR:
 * MÚLTIPLES cuadrillas (responsables + recursos) sobre una sola intervención.
 *
 * Dominio PURO: fecha/actor por INPUT (validados). Nunca decide la transición.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { INTERVENCION_ASIGNADA, INTERVENCION_CREADA, INTERVENCION_TRANSICIONADA } from "./events";
import type { ReferenciaWorkflow } from "./workflow";
import type { Cuadrilla } from "./value-objects";

/* --------------------------------- Estados ------------------------------- */
export const ESTADOS_INTERVENCION = ["preparacion", "asignacion", "ejecucion", "verificacion", "cerrada"] as const;
export type EstadoIntervencion = (typeof ESTADOS_INTERVENCION)[number];

export const ESTADOS_INTERVENCION_TERMINALES: readonly EstadoIntervencion[] = ["cerrada"];

const TRANSICIONES: Record<string, { destino: EstadoIntervencion; desde: readonly EstadoIntervencion[] }> = {
  asignar: { destino: "asignacion", desde: ["preparacion"] },
  iniciarEjecucion: { destino: "ejecucion", desde: ["asignacion"] },
  enviarVerificacion: { destino: "verificacion", desde: ["ejecucion"] },
  cerrar: { destino: "cerrada", desde: ["verificacion"] },
};

export const ACCIONES_INTERVENCION = ["asignar", "iniciarEjecucion", "enviarVerificacion", "cerrar"] as const;
export type AccionIntervencion = (typeof ACCIONES_INTERVENCION)[number];

/* --------------------------------- Aggregate ----------------------------- */
export interface Intervencion {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  readonly ordenTrabajoId: string;
  readonly activoId: string;
  /** ¿Es un Correctivo Mayor (multi-cuadrilla)? Derivado de #cuadrillas > 1. */
  readonly mayor: boolean;
  readonly cuadrillas: readonly Cuadrilla[];
  readonly estado: EstadoIntervencion;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioIntervencion {
  readonly intervencion: Intervencion;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(
  i: Intervencion,
  tipo: string,
  actorId: string,
  extra: Record<string, unknown> = {},
): CambioIntervencion["evento"] {
  return {
    tipo,
    payload: {
      tenantId: i.tenantId,
      id: i.id,
      entityRef: `intervencion-correctiva:${i.id}`,
      solicitudId: i.solicitudId,
      ordenTrabajoId: i.ordenTrabajoId,
      activoId: i.activoId,
      mayor: i.mayor,
      cuadrillas: i.cuadrillas.length,
      estado: i.estado,
      version: i.version,
      actualizadoAt: i.updatedAt,
      actorId,
      eventoTipo: tipo,
      snapshot: i,
      ...extra,
    },
  };
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearIntervencionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  readonly ordenTrabajoId: string;
  readonly activoId: string;
  readonly cuadrillas: readonly Cuadrilla[];
  readonly workflow: ReferenciaWorkflow;
  readonly estadoInicial: EstadoIntervencion;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearIntervencion(input: CrearIntervencionInput): Result<CambioIntervencion, KernelError> {
  if (input.ordenTrabajoId.trim() === "") return fail(KernelErrors.validation("Se requiere la OT correctiva materializada"));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (!sinCuadrillasDuplicadas(input.cuadrillas)) {
    return fail(KernelErrors.validation("Hay identificadores de cuadrilla duplicados"));
  }
  const i: Intervencion = {
    id: input.id,
    tenantId: input.tenantId,
    solicitudId: input.solicitudId,
    ordenTrabajoId: input.ordenTrabajoId,
    activoId: input.activoId,
    mayor: input.cuadrillas.length > 1,
    cuadrillas: Object.freeze([...input.cuadrillas]),
    estado: input.estadoInicial,
    workflow: input.workflow,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ intervencion: Object.freeze(i), evento: eventoDe(i, INTERVENCION_CREADA, input.actorId) });
}

function sinCuadrillasDuplicadas(cuadrillas: readonly Cuadrilla[]): boolean {
  const ids = new Set<string>();
  for (const c of cuadrillas) {
    if (ids.has(c.cuadrillaId)) return false;
    ids.add(c.cuadrillaId);
  }
  return true;
}

/* -------------------------- Asignar cuadrillas --------------------------- */
/**
 * Agrega/actualiza cuadrillas (Correctivo Mayor multi-cuadrilla). Idempotente por
 * `cuadrillaId`: una cuadrilla ya presente se REEMPLAZA; nuevas se agregan.
 */
export function asignarCuadrillas(
  i: Intervencion,
  cuadrillas: readonly Cuadrilla[],
  actorId: string,
  ahora: string,
): Result<CambioIntervencion, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (ESTADOS_INTERVENCION_TERMINALES.includes(i.estado)) {
    return fail(KernelErrors.conflict(`Una intervención "${i.estado}" no admite reasignación`));
  }
  if (cuadrillas.length === 0) return fail(KernelErrors.validation("Se requiere al menos una cuadrilla"));
  if (!sinCuadrillasDuplicadas(cuadrillas)) {
    return fail(KernelErrors.validation("Hay identificadores de cuadrilla duplicados en la asignación"));
  }
  const mapa = new Map<string, Cuadrilla>();
  for (const c of i.cuadrillas) mapa.set(c.cuadrillaId, c);
  for (const c of cuadrillas) mapa.set(c.cuadrillaId, c);
  const combinadas = [...mapa.values()];
  const actualizado: Intervencion = {
    ...i,
    cuadrillas: Object.freeze(combinadas),
    mayor: combinadas.length > 1,
    version: i.version + 1,
    updatedAt: ahora,
  };
  return ok({
    intervencion: Object.freeze(actualizado),
    evento: eventoDe(actualizado, INTERVENCION_ASIGNADA, actorId, { cuadrillasAsignadas: cuadrillas.map((c) => c.cuadrillaId) }),
  });
}

/* ------------------------------ Transicionar ----------------------------- */
export function aplicarAccionIntervencion(
  i: Intervencion,
  accion: AccionIntervencion,
  actorId: string,
  ahora: string,
): Result<CambioIntervencion, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  const t = TRANSICIONES[accion];
  if (!t) return fail(KernelErrors.validation(`Acción desconocida: "${accion}"`));
  if (!t.desde.includes(i.estado)) {
    return fail(KernelErrors.conflict(`La acción "${accion}" no es admisible desde el estado "${i.estado}"`));
  }
  if (accion === "asignar" && i.cuadrillas.length === 0) {
    return fail(KernelErrors.conflict("No se puede asignar una intervención sin cuadrillas"));
  }
  const actualizado: Intervencion = {
    ...i,
    estado: t.destino,
    version: i.version + 1,
    updatedAt: ahora,
  };
  return ok({
    intervencion: Object.freeze(actualizado),
    evento: eventoDe(actualizado, INTERVENCION_TRANSICIONADA, actorId, { accion }),
  });
}
