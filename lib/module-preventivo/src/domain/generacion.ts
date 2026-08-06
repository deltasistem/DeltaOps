/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — `GeneracionPreventiva`.
 *
 * DOMINIO de la generación idempotente de órdenes de trabajo a partir de una
 * ocurrencia programada. Produce una CLAVE DE DEDUPLICACIÓN determinista (guard
 * anti-duplicado por programa+actividad+activo+ventana) y un registro inmutable
 * con estados `pendiente`/`materializada`. La creación real de la OT y el
 * vínculo generación→OT son ORQUESTACIÓN (comando idempotente, lección 009.3 —
 * jamás comandos anidados) mediante un `MaterializadorOrdenes` FAIL-SAFE.
 *
 * REUTILIZA por contrato público el motor de decisión de Planes (`decidirGeneracion`)
 * cuando la ocurrencia proviene de una frecuencia; aquí se envuelve con la
 * identidad preventiva (programa+actividad+activo+ventana).
 *
 * LECCIÓN idDet: el token DISCRIMINANTE (programaId) va PRIMERO en la clave para
 * que dos ocurrencias de programas distintos jamás colisionen.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { GENERACION_DECIDIDA, GENERACION_MATERIALIZADA } from "./events";

/** Estado de materialización de una generación. */
export const ESTADOS_GENERACION = ["pendiente", "materializada"] as const;
export type EstadoGeneracion = (typeof ESTADOS_GENERACION)[number];

/**
 * Identidad de una OCURRENCIA preventiva. Determinista por
 * (programa + actividad + activo + ventana-objetivo). El token discriminante
 * (`programaId`) va PRIMERO.
 */
export interface OcurrenciaPreventiva {
  readonly programaId: string;
  readonly actividadId: string;
  readonly activoId: string;
  /** Discriminante estable de la ventana (fecha objetivo ISO u otra meta). */
  readonly ventana: string;
}

/**
 * Clave de deduplicación DETERMINISTA (opId de la orquestación). El token
 * discriminante va PRIMERO: dos programas distintos NUNCA colisionan.
 */
export function claveDedup(o: OcurrenciaPreventiva): string {
  return `prog:${o.programaId}:act:${o.actividadId}:activo:${o.activoId}:ventana:${o.ventana}`;
}

/* --------------------------- Registro de generación ---------------------- */

export interface GeneracionPreventiva {
  readonly id: string;
  readonly tenantId: string;
  readonly programaId: string;
  readonly actividadId: string;
  readonly activoId: string;
  readonly ventana: string;
  readonly claveDedup: string;
  /** Clave del catálogo `origenes-generacion`. */
  readonly origen: string;
  readonly fechaObjetivo: string;
  /** Id de la OT creada por la orquestación; null hasta materializar. */
  readonly ordenTrabajoId: string | null;
  readonly estado: EstadoGeneracion;
  readonly generadaEn: string;
  readonly generadaPor: string;
  readonly version: number;
}

export interface CambioGeneracion {
  readonly generacion: GeneracionPreventiva;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(
  g: GeneracionPreventiva,
  tipo: string,
  extra: Record<string, unknown> = {},
): CambioGeneracion["evento"] {
  return {
    tipo,
    payload: {
      tenantId: g.tenantId,
      id: g.id,
      entityRef: `generacion-preventiva:${g.id}`,
      programaId: g.programaId,
      actividadId: g.actividadId,
      activoId: g.activoId,
      ventana: g.ventana,
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

/* ------------------------------- Decisión -------------------------------- */

export interface DecisionGeneracionPreventiva {
  /** ¿Corresponde generar (vencida/forzada y NO generada previamente)? */
  readonly corresponde: boolean;
  readonly ocurrencia: OcurrenciaPreventiva;
  readonly claveDedup: string;
  readonly fechaObjetivo: string;
}

export interface EntradaDecisionPreventiva {
  readonly ocurrencia: OcurrenciaPreventiva;
  readonly fechaObjetivo: string;
  /** ¿La ventana está vencida/corresponde según la programación? */
  readonly corresponde: boolean;
  /** Claves de dedup YA generadas (guard anti-duplicado). */
  readonly generadasPrevias: ReadonlySet<string>;
}

/**
 * Decide de forma PURA y DETERMINISTA si corresponde generar. Idempotente: si la
 * clave ya existe en `generadasPrevias`, NO se regenera (guard anti-duplicado
 * por programa+actividad+activo+ventana).
 */
export function decidirGeneracionPreventiva(e: EntradaDecisionPreventiva): DecisionGeneracionPreventiva {
  const clave = claveDedup(e.ocurrencia);
  return {
    corresponde: e.corresponde && !e.generadasPrevias.has(clave),
    ocurrencia: e.ocurrencia,
    claveDedup: clave,
    fechaObjetivo: e.fechaObjetivo,
  };
}

/* --------------------------------- Crear --------------------------------- */

export interface CrearGeneracionInput {
  readonly id: string;
  readonly tenantId: string;
  readonly ocurrencia: OcurrenciaPreventiva;
  readonly origen: string;
  readonly fechaObjetivo: string;
  readonly generadaPor: string;
  readonly ahora: string;
}

export function crearGeneracion(input: CrearGeneracionInput): Result<CambioGeneracion, KernelError> {
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (Number.isNaN(Date.parse(input.fechaObjetivo))) {
    return fail(KernelErrors.validation("La fecha objetivo no es ISO válida"));
  }
  const clave = claveDedup(input.ocurrencia);
  const g: GeneracionPreventiva = {
    id: input.id,
    tenantId: input.tenantId,
    programaId: input.ocurrencia.programaId,
    actividadId: input.ocurrencia.actividadId,
    activoId: input.ocurrencia.activoId,
    ventana: input.ocurrencia.ventana,
    claveDedup: clave,
    origen: input.origen,
    fechaObjetivo: input.fechaObjetivo,
    ordenTrabajoId: null,
    estado: "pendiente",
    generadaEn: input.ahora,
    generadaPor: input.generadaPor,
    version: 1,
  };
  return ok({ generacion: Object.freeze(g), evento: eventoDe(g, GENERACION_DECIDIDA) });
}

/* ------------------------------ Materializar ----------------------------- */

/**
 * Vincula ATÓMICAMENTE la generación con la OT creada por la orquestación. Sólo
 * transiciona `pendiente → materializada` una vez (idempotencia: reintentar con
 * el MISMO `ordenTrabajoId` es no-op; con OTRO es conflicto).
 */
export function materializarGeneracion(
  g: GeneracionPreventiva,
  ordenTrabajoId: string,
  actorId: string,
  ahora: string,
): Result<CambioGeneracion, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (ordenTrabajoId.trim() === "") return fail(KernelErrors.validation("Se requiere el id de la orden de trabajo"));
  if (g.estado === "materializada") {
    if (g.ordenTrabajoId === ordenTrabajoId) {
      // Reintento idempotente: sin cambios.
      return ok({ generacion: g, evento: eventoDe(g, GENERACION_MATERIALIZADA, { idempotente: true }) });
    }
    return fail(KernelErrors.conflict(`La generación ya fue materializada con otra OT "${g.ordenTrabajoId}"`));
  }
  const actualizado: GeneracionPreventiva = {
    ...g,
    ordenTrabajoId,
    estado: "materializada",
    version: g.version + 1,
  };
  return ok({
    generacion: Object.freeze(actualizado),
    evento: eventoDe(actualizado, GENERACION_MATERIALIZADA, { idempotente: false }),
  });
}
