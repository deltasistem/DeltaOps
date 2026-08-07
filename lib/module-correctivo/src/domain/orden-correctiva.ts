/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Generación idempotente de OT.
 *
 * DOMINIO de la generación idempotente de órdenes de trabajo CORRECTIVAS a partir
 * de una solicitud APROBADA. Produce una CLAVE DE DEDUPLICACIÓN determinista
 * (guard anti-duplicado: una solicitud → una única OT) y un registro inmutable con
 * estados `pendiente`/`materializada`. La creación real de la OT (tipo canónico
 * "correctiva") y el vínculo generación→OT son ORQUESTACIÓN (comando idempotente,
 * lección 009.3 — jamás comandos anidados) mediante un `MaterializadorOrdenes`
 * FAIL-SAFE.
 *
 * LECCIÓN idDet (DGP-014): el token DISCRIMINANTE (solicitudId) va PRIMERO en la
 * clave para que dos solicitudes distintas jamás colisionen.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { ORDEN_DECIDIDA, ORDEN_MATERIALIZADA } from "./events";
import type { ReferenciaWorkflow } from "./workflow";

/** Estado de materialización de una generación de OT correctiva. */
export const ESTADOS_GENERACION = ["pendiente", "materializada"] as const;
export type EstadoGeneracion = (typeof ESTADOS_GENERACION)[number];

/**
 * Clave de deduplicación DETERMINISTA (opId de la orquestación). El token
 * discriminante (`solicitudId`) va PRIMERO: dos solicitudes distintas NUNCA
 * colisionan y una misma solicitud SIEMPRE resuelve la misma clave (una OT única).
 */
export function claveDedupOrden(solicitudId: string): string {
  return `sol:${solicitudId}:orden-correctiva`;
}

/* --------------------------- Registro de generación ---------------------- */

export interface GeneracionOrdenCorrectiva {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  readonly activoId: string;
  readonly claveDedup: string;
  /** Id de la OT creada por la orquestación; null hasta materializar. */
  readonly ordenTrabajoId: string | null;
  readonly estado: EstadoGeneracion;
  /**
   * Referencia INMUTABLE al workflow que GOBIERNA la generación (proceso
   * `generacion`, pendiente → materializada). El aggregate REFLEJA el estado que
   * decide el motor; nunca transiciona por su cuenta.
   */
  readonly workflow: ReferenciaWorkflow;
  readonly generadaEn: string;
  readonly generadaPor: string;
  readonly version: number;
}

export interface CambioGeneracion {
  readonly generacion: GeneracionOrdenCorrectiva;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(
  g: GeneracionOrdenCorrectiva,
  tipo: string,
  extra: Record<string, unknown> = {},
): CambioGeneracion["evento"] {
  return {
    tipo,
    payload: {
      tenantId: g.tenantId,
      id: g.id,
      entityRef: `generacion-correctiva:${g.id}`,
      solicitudId: g.solicitudId,
      activoId: g.activoId,
      claveDedup: g.claveDedup,
      estado: g.estado,
      ordenTrabajoId: g.ordenTrabajoId,
      version: g.version,
      actualizadoAt: g.generadaEn,
      actorId: g.generadaPor,
      eventoTipo: tipo,
      snapshot: g,
      ...extra,
    },
  };
}

/* --------------------------------- Crear --------------------------------- */

export interface CrearGeneracionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly solicitudId: string;
  readonly activoId: string;
  /** Referencia de workflow (proceso `generacion`) ya INICIADA por el motor. */
  readonly workflow: ReferenciaWorkflow;
  /** Estado inicial NEUTRO que devolvió el motor al iniciar la instancia. */
  readonly estadoInicial: EstadoGeneracion;
  readonly generadaPor: string;
  readonly ahora: string;
}

export function crearGeneracionOrden(input: CrearGeneracionInput): Result<CambioGeneracion, KernelError> {
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (input.solicitudId.trim() === "") return fail(KernelErrors.validation("Se requiere la solicitud de origen"));
  const g: GeneracionOrdenCorrectiva = {
    id: input.id,
    tenantId: input.tenantId,
    solicitudId: input.solicitudId,
    activoId: input.activoId,
    claveDedup: claveDedupOrden(input.solicitudId),
    ordenTrabajoId: null,
    estado: input.estadoInicial,
    workflow: input.workflow,
    generadaEn: input.ahora,
    generadaPor: input.generadaPor,
    version: 1,
  };
  return ok({ generacion: Object.freeze(g), evento: eventoDe(g, ORDEN_DECIDIDA) });
}

/* ------------------------------ Materializar ----------------------------- */

/**
 * Vincula ATÓMICAMENTE la generación con la OT creada por la orquestación. Sólo
 * transiciona `pendiente → materializada` una vez (idempotencia: reintentar con
 * el MISMO `ordenTrabajoId` es no-op; con OTRO es conflicto). El `estadoMotor`
 * es el estado NEUTRO que devolvió el Workflow Engine al aprobar la transición
 * `materializar`; el aggregate lo REFLEJA (no lo decide).
 */
export function materializarGeneracion(
  g: GeneracionOrdenCorrectiva,
  ordenTrabajoId: string,
  ahora: string,
  estadoMotor: string = "materializada",
): Result<CambioGeneracion, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (ordenTrabajoId.trim() === "") return fail(KernelErrors.validation("Se requiere el id de la orden de trabajo"));
  if (g.estado === "materializada") {
    if (g.ordenTrabajoId === ordenTrabajoId) {
      return ok({ generacion: g, evento: eventoDe(g, ORDEN_MATERIALIZADA, { idempotente: true }) });
    }
    return fail(KernelErrors.conflict(`La generación ya fue materializada con otra OT "${g.ordenTrabajoId}"`));
  }
  const actualizado: GeneracionOrdenCorrectiva = {
    ...g,
    ordenTrabajoId,
    estado: (estadoMotor as EstadoGeneracion) ?? "materializada",
    version: g.version + 1,
  };
  return ok({
    generacion: Object.freeze(actualizado),
    evento: eventoDe(actualizado, ORDEN_MATERIALIZADA, { idempotente: false }),
  });
}
