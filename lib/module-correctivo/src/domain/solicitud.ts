/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Aggregate `SolicitudMantenimiento`.
 *
 * Solicitud de mantenimiento correctivo: origen por catálogo (operador/supervisor/
 * producción/calidad/SST/IoT/API), asociada a un objeto afectado (activo/ubicación/
 * componente, validado por puerto en la app), con prioridad/criticidad (catálogos),
 * síntomas (catálogo + texto), evidencias por REFERENCIA (platform.attachment) y
 * comentarios (platform.comment). Su ciclo de vida es NEUTRO y gobernado por el
 * Workflow Engine: el aggregate REFLEJA el estado que el motor autoriza.
 *
 * Dominio PURO: fecha/actor por INPUT (validados). Nunca decide la transición.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  SOLICITUD_ACTUALIZADA,
  SOLICITUD_COMENTARIO_REGISTRADO,
  SOLICITUD_CREADA,
  SOLICITUD_EVIDENCIA_ADJUNTADA,
  SOLICITUD_TRANSICIONADA,
} from "./events";
import type { ReferenciaWorkflow } from "./workflow";
import type { AnclaQr, Clasificacion, Evidencia, ObjetoAfectado, Sintoma } from "./value-objects";

/* --------------------------------- Estados ------------------------------- */
export const ESTADOS_SOLICITUD = ["registro", "triage", "diagnostico", "validacion", "aprobada", "rechazada"] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

/** Estados terminales (inmutables). */
export const ESTADOS_SOLICITUD_TERMINALES: readonly EstadoSolicitud[] = ["aprobada", "rechazada"];

/** Acción neutra → estado destino y estados admisibles de origen. */
const TRANSICIONES: Record<string, { destino: EstadoSolicitud; desde: readonly EstadoSolicitud[] }> = {
  enviarTriage: { destino: "triage", desde: ["registro"] },
  iniciarDiagnostico: { destino: "diagnostico", desde: ["triage"] },
  enviarValidacion: { destino: "validacion", desde: ["diagnostico"] },
  aprobar: { destino: "aprobada", desde: ["validacion"] },
  rechazar: { destino: "rechazada", desde: ["triage", "diagnostico", "validacion"] },
};

export const ACCIONES_SOLICITUD = ["enviarTriage", "iniciarDiagnostico", "enviarValidacion", "aprobar", "rechazar"] as const;
export type AccionSolicitud = (typeof ACCIONES_SOLICITUD)[number];

/* --------------------------------- Aggregate ----------------------------- */
export interface SolicitudMantenimiento {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly descripcion: string | null;
  /** Clave del catálogo `origenes-solicitud`. */
  readonly origen: string;
  /** Identificador de la fuente que originó la solicitud (usuario/sensor/API). */
  readonly fuenteId: string | null;
  readonly objeto: ObjetoAfectado;
  /** Clave del catálogo `prioridades`. */
  readonly prioridad: string;
  /** Clave del catálogo `criticidades` (opcional). */
  readonly criticidad: string | null;
  readonly sintomas: readonly Sintoma[];
  readonly clasificacion: Clasificacion;
  /** Evidencias SÓLO por referencia (platform.attachment). */
  readonly evidencias: readonly Evidencia[];
  /** Diagnóstico anclado (id del registro de diagnóstico); null hasta registrarlo. */
  readonly diagnosticoId: string | null;
  /** Ancla conceptual a platform.qr (opcional). */
  readonly qr: AnclaQr | null;
  readonly estado: EstadoSolicitud;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioSolicitud {
  readonly solicitud: SolicitudMantenimiento;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(
  s: SolicitudMantenimiento,
  tipo: string,
  actorId: string,
  extra: Record<string, unknown> = {},
): CambioSolicitud["evento"] {
  return {
    tipo,
    payload: {
      tenantId: s.tenantId,
      id: s.id,
      entityRef: `solicitud-correctiva:${s.id}`,
      codigo: s.codigo,
      titulo: s.titulo,
      origen: s.origen,
      activoId: s.objeto.activoId,
      prioridad: s.prioridad,
      estado: s.estado,
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
  readonly origen: string;
  readonly fuenteId?: string | null;
  readonly objeto: ObjetoAfectado;
  readonly prioridad: string;
  readonly criticidad?: string | null;
  readonly sintomas: readonly Sintoma[];
  readonly clasificacion: Clasificacion;
  readonly evidencias?: readonly Evidencia[];
  readonly qr?: AnclaQr | null;
  readonly workflow: ReferenciaWorkflow;
  readonly estadoInicial: EstadoSolicitud;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearSolicitud(input: CrearSolicitudInput): Result<CambioSolicitud, KernelError> {
  if (input.titulo.trim() === "") return fail(KernelErrors.validation("El título de la solicitud es obligatorio"));
  if (input.origen.trim() === "") return fail(KernelErrors.validation("El origen de la solicitud es obligatorio"));
  if (input.prioridad.trim() === "") return fail(KernelErrors.validation("La prioridad de la solicitud es obligatoria"));
  if (input.sintomas.length === 0) return fail(KernelErrors.validation("Se requiere al menos un síntoma"));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));

  const s: SolicitudMantenimiento = {
    id: input.id,
    tenantId: input.tenantId,
    codigo: input.codigo,
    titulo: input.titulo,
    descripcion: input.descripcion ?? null,
    origen: input.origen,
    fuenteId: input.fuenteId ?? null,
    objeto: input.objeto,
    prioridad: input.prioridad,
    criticidad: input.criticidad ?? null,
    sintomas: Object.freeze([...input.sintomas]),
    clasificacion: input.clasificacion,
    evidencias: Object.freeze([...(input.evidencias ?? [])]),
    diagnosticoId: null,
    qr: input.qr ?? null,
    estado: input.estadoInicial,
    workflow: input.workflow,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ solicitud: Object.freeze(s), evento: eventoDe(s, SOLICITUD_CREADA, input.actorId) });
}

/* -------------------------------- Editar --------------------------------- */
export interface CambiosSolicitud {
  titulo?: string;
  descripcion?: string | null;
  prioridad?: string;
  criticidad?: string | null;
  clasificacion?: Clasificacion;
  sintomas?: readonly Sintoma[];
}

export function editarSolicitud(
  s: SolicitudMantenimiento,
  cambios: CambiosSolicitud,
  actorId: string,
  ahora: string,
): Result<CambioSolicitud, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (ESTADOS_SOLICITUD_TERMINALES.includes(s.estado)) {
    return fail(KernelErrors.conflict(`Una solicitud "${s.estado}" es inmutable`));
  }
  const actualizado: SolicitudMantenimiento = {
    ...s,
    titulo: cambios.titulo ?? s.titulo,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : s.descripcion,
    prioridad: cambios.prioridad ?? s.prioridad,
    criticidad: cambios.criticidad !== undefined ? cambios.criticidad : s.criticidad,
    clasificacion: cambios.clasificacion ?? s.clasificacion,
    sintomas: cambios.sintomas ? Object.freeze([...cambios.sintomas]) : s.sintomas,
    version: s.version + 1,
    updatedAt: ahora,
  };
  return ok({ solicitud: Object.freeze(actualizado), evento: eventoDe(actualizado, SOLICITUD_ACTUALIZADA, actorId) });
}

/* --------------------------- Adjuntar evidencia -------------------------- */
export function adjuntarEvidencia(
  s: SolicitudMantenimiento,
  evidencia: Evidencia,
  actorId: string,
  ahora: string,
): Result<CambioSolicitud, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (ESTADOS_SOLICITUD_TERMINALES.includes(s.estado)) {
    return fail(KernelErrors.conflict(`Una solicitud "${s.estado}" no admite nuevas evidencias`));
  }
  if (s.evidencias.some((e) => e.attachmentId === evidencia.attachmentId)) {
    return fail(KernelErrors.conflict(`La evidencia "${evidencia.attachmentId}" ya está adjunta`));
  }
  const actualizado: SolicitudMantenimiento = {
    ...s,
    evidencias: Object.freeze([...s.evidencias, evidencia]),
    version: s.version + 1,
    updatedAt: ahora,
  };
  return ok({
    solicitud: Object.freeze(actualizado),
    evento: eventoDe(actualizado, SOLICITUD_EVIDENCIA_ADJUNTADA, actorId, { attachmentId: evidencia.attachmentId }),
  });
}

/* ----------------------------- Anclar diagnóstico ------------------------ */
export function anclarDiagnostico(
  s: SolicitudMantenimiento,
  diagnosticoId: string,
  clasificacion: Clasificacion,
  actorId: string,
  ahora: string,
): Result<CambioSolicitud, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  const actualizado: SolicitudMantenimiento = {
    ...s,
    diagnosticoId,
    clasificacion,
    version: s.version + 1,
    updatedAt: ahora,
  };
  return ok({ solicitud: Object.freeze(actualizado), evento: eventoDe(actualizado, SOLICITUD_ACTUALIZADA, actorId, { diagnosticoId }) });
}

/* ------------------------------ Transicionar ----------------------------- */
export function aplicarAccionSolicitud(
  s: SolicitudMantenimiento,
  accion: AccionSolicitud,
  actorId: string,
  ahora: string,
): Result<CambioSolicitud, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  const t = TRANSICIONES[accion];
  if (!t) return fail(KernelErrors.validation(`Acción desconocida: "${accion}"`));
  if (!t.desde.includes(s.estado)) {
    return fail(KernelErrors.conflict(`La acción "${accion}" no es admisible desde el estado "${s.estado}"`));
  }
  const actualizado: SolicitudMantenimiento = {
    ...s,
    estado: t.destino,
    version: s.version + 1,
    updatedAt: ahora,
  };
  return ok({
    solicitud: Object.freeze(actualizado),
    evento: eventoDe(actualizado, SOLICITUD_TRANSICIONADA, actorId, { accion }),
  });
}

/* ----------------------------- Comentario (evento) ----------------------- */
export function eventoComentario(
  s: SolicitudMantenimiento,
  comentarioId: string,
  actorId: string,
): CambioSolicitud["evento"] {
  return eventoDe(s, SOLICITUD_COMENTARIO_REGISTRADO, actorId, { comentarioId });
}
