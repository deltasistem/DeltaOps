/**
 * DGP-013 · Módulo Enterprise Procurement — Aggregate `SolicitudCompra`.
 *
 * Solicitud de compra con ORIGEN declarativo (inventario/orden/plan/usuario) y
 * referencia opaca al recurso disparador. El ciclo de vida (borrador → enviada →
 * aprobada/rechazada → cerrada) está GOBERNADO por el Workflow Engine: el
 * aggregate REFLEJA el estado neutro que el motor autoriza, nunca lo decide.
 *
 * Cada acción (enviar/aprobar/rechazar/cerrar) es una transición REAL con su
 * propio comando; nunca se colapsan. Dominio PURO: fecha/actor por INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  SOLICITUD_APROBADA,
  SOLICITUD_CERRADA,
  SOLICITUD_CREADA,
  SOLICITUD_ENVIADA,
  SOLICITUD_RECHAZADA,
} from "./events";
import type { ReferenciaWorkflow } from "./workflow";
import type { LineaSolicitud, ReferenciaOrigen } from "./value-objects";

/* --------------------------------- Estados ------------------------------- */
export const ESTADOS_SOLICITUD = ["borrador", "enviada", "aprobada", "rechazada", "cerrada"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

/** Estados terminales (inmutables). */
export const ESTADOS_SOLICITUD_TERMINALES: readonly EstadoSolicitud[] = ["rechazada", "cerrada"];

/** Acción neutra → estado resultante y evento de dominio. */
const TRANSICIONES: Record<string, { destino: EstadoSolicitud; evento: string; desde: readonly EstadoSolicitud[] }> = {
  enviar: { destino: "enviada", evento: SOLICITUD_ENVIADA, desde: ["borrador"] },
  aprobar: { destino: "aprobada", evento: SOLICITUD_APROBADA, desde: ["enviada"] },
  rechazar: { destino: "rechazada", evento: SOLICITUD_RECHAZADA, desde: ["enviada"] },
  cerrar: { destino: "cerrada", evento: SOLICITUD_CERRADA, desde: ["aprobada"] },
};

export const ACCIONES_SOLICITUD = ["enviar", "aprobar", "rechazar", "cerrar"] as const;
export type AccionSolicitud = (typeof ACCIONES_SOLICITUD)[number];

/* --------------------------------- Aggregate ----------------------------- */
export interface SolicitudCompra {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly origen: ReferenciaOrigen;
  /** Clave del catálogo `prioridades`. */
  readonly prioridad: string;
  readonly lineas: readonly LineaSolicitud[];
  readonly estado: EstadoSolicitud;
  /** Motivo de rechazo (si aplica). */
  readonly motivoRechazo: string | null;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioSolicitud {
  readonly solicitud: SolicitudCompra;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(s: SolicitudCompra, tipo: string, actorId: string, extra: Record<string, unknown> = {}): CambioSolicitud["evento"] {
  return {
    tipo,
    payload: {
      tenantId: s.tenantId,
      id: s.id,
      entityRef: `solicitud-compra:${s.id}`,
      codigo: s.codigo,
      nombre: s.titulo,
      estado: s.estado,
      origen: s.origen,
      prioridad: s.prioridad,
      version: s.version,
      actualizadoAt: s.updatedAt,
      actorId,
      eventoTipo: tipo,
      snapshot: s,
      ...extra,
    },
  };
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearSolicitudInput {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly descripcion?: string | null;
  readonly origen: ReferenciaOrigen;
  readonly prioridad: string;
  readonly lineas: readonly LineaSolicitud[];
  readonly workflow: ReferenciaWorkflow;
  readonly estadoInicial: EstadoSolicitud;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearSolicitud(input: CrearSolicitudInput): Result<CambioSolicitud, KernelError> {
  if (input.titulo.trim() === "") return fail(KernelErrors.validation("El título de la solicitud es obligatorio"));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (input.lineas.length === 0) return fail(KernelErrors.validation("La solicitud debe tener al menos una línea"));
  const numeros = new Set(input.lineas.map((l) => l.numero));
  if (numeros.size !== input.lineas.length) return fail(KernelErrors.validation("Los números de línea deben ser únicos"));

  const solicitud: SolicitudCompra = {
    id: input.id,
    tenantId: input.tenantId,
    codigo: input.codigo,
    titulo: input.titulo.trim(),
    descripcion: input.descripcion ?? null,
    origen: input.origen,
    prioridad: input.prioridad,
    lineas: Object.freeze([...input.lineas]),
    estado: input.estadoInicial,
    motivoRechazo: null,
    workflow: input.workflow,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ solicitud: Object.freeze(solicitud), evento: eventoDe(solicitud, SOLICITUD_CREADA, input.actorId, { lineas: solicitud.lineas.length }) });
}

/* ---------------------------- Transición gobernada ----------------------- */
/**
 * Aplica el estado neutro que el motor autorizó. Verifica que la acción sea
 * admisible DESDE el estado actual y que el aggregate no esté en estado terminal.
 * NO decide la transición: el motor ya lo hizo (la app verifica su Result ANTES).
 */
export function aplicarAccionSolicitud(
  s: SolicitudCompra,
  accion: AccionSolicitud,
  actorId: string,
  ahora: string,
  extra: { motivoRechazo?: string | null } = {},
): Result<CambioSolicitud, KernelError> {
  if (ESTADOS_SOLICITUD_TERMINALES.includes(s.estado)) {
    return fail(KernelErrors.conflict(`La solicitud está en estado terminal "${s.estado}" y es inmutable`));
  }
  const t = TRANSICIONES[accion];
  if (!t) return fail(KernelErrors.validation(`Acción de solicitud desconocida: "${accion}"`));
  if (!t.desde.includes(s.estado)) {
    return fail(KernelErrors.conflict(`No se puede "${accion}" una solicitud en estado "${s.estado}"`));
  }
  if (accion === "rechazar" && (!extra.motivoRechazo || extra.motivoRechazo.trim() === "")) {
    return fail(KernelErrors.validation("El rechazo requiere un motivo"));
  }
  const actualizado: SolicitudCompra = {
    ...s,
    estado: t.destino,
    motivoRechazo: accion === "rechazar" ? (extra.motivoRechazo ?? null) : s.motivoRechazo,
    version: s.version + 1,
    updatedAt: ahora,
  };
  return ok({
    solicitud: Object.freeze(actualizado),
    evento: eventoDe(actualizado, t.evento, actorId, accion === "rechazar" ? { motivo: extra.motivoRechazo } : {}),
  });
}
