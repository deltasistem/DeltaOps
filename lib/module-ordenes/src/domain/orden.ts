/**
 * DGP-009.1 · Módulo Órdenes de Trabajo Empresariales — Aggregate "OrdenTrabajo".
 *
 * Aggregate PURO (sin IO). Reúne TODOS los campos de la especificación, mantiene
 * sus invariantes y produce eventos AUTOSUFICIENTES (payload-only para
 * proyecciones futuras). Es NEUTRO por diseño: cualquier tipo de trabajo se
 * soporta por configuración/catálogos, nunca con código específico por tipo.
 *
 * REGLA DURA DGP-009.1: el aggregate NO decide transiciones de estado. El estado
 * es gobernado por el Workflow Engine; el aggregate solo REFLEJA el estado
 * resultante (`aplicarEstado`) y registra los datos de negocio.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { ESTADO_INICIAL, type EstadoOrdenEfectivo } from "./maquina-estados";
import type {
  CodigoOrden,
  Costo,
  Diagnostico,
  Duracion,
  Evidencia,
  Fechas,
  ReferenciaActivo,
  ReferenciaPlantilla,
  ReferenciaWorkflow,
  RiesgoImpacto,
  Sla,
  Ubicacion,
} from "./value-objects";

/* --------------------------- Eventos de dominio -------------------------- */

export const ORDEN_CREADA = "modulo.ordenes.creada";
export const ORDEN_ACTUALIZADA = "modulo.ordenes.actualizada";
export const ORDEN_ESTADO_CAMBIADO = "modulo.ordenes.estado-cambiado";
export const ORDEN_ASIGNACION_ACTUALIZADA = "modulo.ordenes.asignacion-actualizada";
export const ORDEN_EJECUCION_ACTUALIZADA = "modulo.ordenes.ejecucion-actualizada";
export const ORDEN_FORMULARIO_ASOCIADO = "modulo.ordenes.formulario-asociado";
export const ORDEN_CHECKLIST_ASOCIADO = "modulo.ordenes.checklist-asociado";
export const ORDEN_EVIDENCIA_AGREGADA = "modulo.ordenes.evidencia-agregada";

export const EVENTOS_MODULO = [
  ORDEN_CREADA,
  ORDEN_ACTUALIZADA,
  ORDEN_ESTADO_CAMBIADO,
  ORDEN_ASIGNACION_ACTUALIZADA,
  ORDEN_EJECUCION_ACTUALIZADA,
  ORDEN_FORMULARIO_ASOCIADO,
  ORDEN_CHECKLIST_ASOCIADO,
  ORDEN_EVIDENCIA_AGREGADA,
] as const;

/* ------------------------------ Aggregate -------------------------------- */

export interface OrdenTrabajo {
  readonly id: string;
  readonly tenantId: string;

  /** Código consecutivo empresarial configurable (VO). */
  readonly codigo: CodigoOrden;
  readonly titulo: string;
  readonly descripcion: string;
  readonly estado: EstadoOrdenEfectivo;

  // Clasificación (claves de catálogo, validadas en la aplicación)
  readonly tipo: string;
  readonly categoria: string | null;
  readonly prioridad: string | null;
  readonly severidad: string | null;

  // Compromiso de servicio
  readonly sla: Sla | null;

  // Activos
  readonly activoPrincipal: ReferenciaActivo | null;
  readonly activosRelacionados: readonly ReferenciaActivo[];

  // Personas (identificadores de principal, no catálogo)
  readonly responsable: string | null;
  readonly supervisor: string | null;
  readonly solicitante: string | null;

  // Organización
  readonly empresa: string | null;
  readonly proyecto: string | null;
  readonly centroCosto: string | null;
  readonly ubicacion: Ubicacion | null;

  // Ciclo temporal
  readonly fechas: Fechas;

  // Tiempos
  readonly tiempoEstimado: Duracion | null;
  readonly tiempoReal: Duracion | null;

  // Costos
  readonly costoEstimado: Costo | null;
  readonly costoReal: Costo | null;

  // Ejecución técnica
  readonly observaciones: string;
  readonly diagnostico: Diagnostico;
  readonly riesgoImpacto: RiesgoImpacto | null;

  // Asociaciones (Dynamic Forms + Workflow Engine)
  readonly checklist: ReferenciaPlantilla | null;
  readonly formulario: ReferenciaPlantilla | null;
  readonly workflow: ReferenciaWorkflow;

  // Evidencias (platform.attachment, referencia-only)
  readonly evidencias: readonly Evidencia[];

  // Metadatos técnicos
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CambioOrden {
  readonly orden: OrdenTrabajo;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/* --------------------------- Evento autosuficiente ----------------------- */

/**
 * Payload AUTOSUFICIENTE: contiene el estado completo del aggregate para que
 * ni la proyección ni los efectos derivados necesiten releerlo. El read model
 * se protege con last_event_id + version (idempotencia).
 */
function eventoDe(o: OrdenTrabajo, tipo: string, actorId: string): CambioOrden["evento"] {
  return {
    tipo,
    payload: {
      tenantId: o.tenantId,
      id: o.id,
      entityRef: `orden:${o.id}`,
      codigo: o.codigo,
      titulo: o.titulo,
      descripcion: o.descripcion,
      estado: o.estado,
      tipo: o.tipo,
      categoria: o.categoria,
      prioridad: o.prioridad,
      severidad: o.severidad,
      sla: o.sla,
      activoPrincipal: o.activoPrincipal,
      activosRelacionados: o.activosRelacionados,
      responsable: o.responsable,
      supervisor: o.supervisor,
      solicitante: o.solicitante,
      empresa: o.empresa,
      proyecto: o.proyecto,
      centroCosto: o.centroCosto,
      ubicacion: o.ubicacion,
      fechas: o.fechas,
      tiempoEstimado: o.tiempoEstimado,
      tiempoReal: o.tiempoReal,
      costoEstimado: o.costoEstimado,
      costoReal: o.costoReal,
      observaciones: o.observaciones,
      diagnostico: o.diagnostico,
      riesgoImpacto: o.riesgoImpacto,
      checklist: o.checklist,
      formulario: o.formulario,
      workflow: o.workflow,
      evidencias: o.evidencias,
      version: o.version,
      createdBy: o.createdBy,
      actualizadoAt: o.updatedAt.toISOString(),
      actorId,
      eventoTipo: tipo,
    },
  };
}

/* --------------------------- Datos de creación --------------------------- */

export interface DatosNuevaOrden {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: CodigoOrden;
  readonly titulo: string;
  readonly descripcion?: string;
  readonly tipo: string;
  readonly categoria?: string | null;
  readonly prioridad?: string | null;
  readonly severidad?: string | null;
  readonly sla?: Sla | null;
  readonly activoPrincipal?: ReferenciaActivo | null;
  readonly activosRelacionados?: readonly ReferenciaActivo[];
  readonly responsable?: string | null;
  readonly supervisor?: string | null;
  readonly solicitante?: string | null;
  readonly empresa?: string | null;
  readonly proyecto?: string | null;
  readonly centroCosto?: string | null;
  readonly ubicacion?: Ubicacion | null;
  readonly fechas?: Fechas;
  readonly tiempoEstimado?: Duracion | null;
  readonly costoEstimado?: Costo | null;
  readonly observaciones?: string;
  readonly riesgoImpacto?: RiesgoImpacto | null;
  readonly checklist?: ReferenciaPlantilla | null;
  readonly formulario?: ReferenciaPlantilla | null;
  readonly workflow: ReferenciaWorkflow;
  readonly actorId: string;
  readonly maxLongitudTitulo: number;
  readonly ahora: Date;
}

export function crearOrden(d: DatosNuevaOrden): Result<CambioOrden, KernelError> {
  const titulo = d.titulo.trim();
  if (titulo.length === 0) return fail(KernelErrors.validation("El título es obligatorio"));
  if (titulo.length > d.maxLongitudTitulo) {
    return fail(KernelErrors.validation(`El título excede ${d.maxLongitudTitulo} caracteres`));
  }
  if (!d.tipo) return fail(KernelErrors.validation("El tipo de OT es obligatorio"));

  const orden: OrdenTrabajo = {
    id: d.id,
    tenantId: d.tenantId,
    codigo: d.codigo,
    titulo,
    descripcion: (d.descripcion ?? "").trim(),
    estado: ESTADO_INICIAL,
    tipo: d.tipo,
    categoria: d.categoria ?? null,
    prioridad: d.prioridad ?? null,
    severidad: d.severidad ?? null,
    sla: d.sla ?? null,
    activoPrincipal: d.activoPrincipal ?? null,
    activosRelacionados: d.activosRelacionados ?? [],
    responsable: d.responsable ?? null,
    supervisor: d.supervisor ?? null,
    solicitante: d.solicitante ?? d.actorId,
    empresa: d.empresa ?? null,
    proyecto: d.proyecto ?? null,
    centroCosto: d.centroCosto ?? null,
    ubicacion: d.ubicacion ?? null,
    fechas: d.fechas ?? { solicitada: d.ahora.toISOString() },
    tiempoEstimado: d.tiempoEstimado ?? null,
    tiempoReal: null,
    costoEstimado: d.costoEstimado ?? null,
    costoReal: null,
    observaciones: (d.observaciones ?? "").trim(),
    diagnostico: {},
    riesgoImpacto: d.riesgoImpacto ?? null,
    checklist: d.checklist ?? null,
    formulario: d.formulario ?? null,
    workflow: d.workflow,
    evidencias: [],
    version: 1,
    createdBy: d.actorId,
    createdAt: d.ahora,
    updatedAt: d.ahora,
  };
  return ok({ orden, evento: eventoDe(orden, ORDEN_CREADA, d.actorId) });
}

/* ------------------------------ Edición ---------------------------------- */

export type PatchOrden = Partial<
  Pick<
    OrdenTrabajo,
    | "titulo"
    | "descripcion"
    | "categoria"
    | "prioridad"
    | "severidad"
    | "sla"
    | "activoPrincipal"
    | "empresa"
    | "proyecto"
    | "centroCosto"
    | "ubicacion"
    | "tiempoEstimado"
    | "costoEstimado"
    | "riesgoImpacto"
    | "observaciones"
  >
> & { activosRelacionados?: readonly ReferenciaActivo[]; fechas?: Fechas };

export function editarOrden(
  actual: OrdenTrabajo,
  patch: PatchOrden,
  actorId: string,
  maxLongitudTitulo: number,
  ahora: Date,
): Result<CambioOrden, KernelError> {
  const titulo = patch.titulo != null ? patch.titulo.trim() : actual.titulo;
  if (titulo.length === 0) return fail(KernelErrors.validation("El título es obligatorio"));
  if (titulo.length > maxLongitudTitulo) {
    return fail(KernelErrors.validation(`El título excede ${maxLongitudTitulo} caracteres`));
  }
  const orden: OrdenTrabajo = {
    ...actual,
    titulo,
    descripcion: patch.descripcion != null ? patch.descripcion.trim() : actual.descripcion,
    categoria: patch.categoria !== undefined ? patch.categoria : actual.categoria,
    prioridad: patch.prioridad !== undefined ? patch.prioridad : actual.prioridad,
    severidad: patch.severidad !== undefined ? patch.severidad : actual.severidad,
    sla: patch.sla !== undefined ? patch.sla : actual.sla,
    activoPrincipal: patch.activoPrincipal !== undefined ? patch.activoPrincipal : actual.activoPrincipal,
    activosRelacionados: patch.activosRelacionados ?? actual.activosRelacionados,
    empresa: patch.empresa !== undefined ? patch.empresa : actual.empresa,
    proyecto: patch.proyecto !== undefined ? patch.proyecto : actual.proyecto,
    centroCosto: patch.centroCosto !== undefined ? patch.centroCosto : actual.centroCosto,
    ubicacion: patch.ubicacion !== undefined ? patch.ubicacion : actual.ubicacion,
    fechas: patch.fechas ?? actual.fechas,
    tiempoEstimado: patch.tiempoEstimado !== undefined ? patch.tiempoEstimado : actual.tiempoEstimado,
    costoEstimado: patch.costoEstimado !== undefined ? patch.costoEstimado : actual.costoEstimado,
    riesgoImpacto: patch.riesgoImpacto !== undefined ? patch.riesgoImpacto : actual.riesgoImpacto,
    observaciones: patch.observaciones != null ? patch.observaciones.trim() : actual.observaciones,
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ orden, evento: eventoDe(orden, ORDEN_ACTUALIZADA, actorId) });
}

/* ------------------------------ Asignación ------------------------------- */

export function actualizarAsignacion(
  actual: OrdenTrabajo,
  cambio: { responsable?: string | null; supervisor?: string | null; solicitante?: string | null },
  actorId: string,
  ahora: Date,
): Result<CambioOrden, KernelError> {
  const orden: OrdenTrabajo = {
    ...actual,
    responsable: cambio.responsable !== undefined ? cambio.responsable : actual.responsable,
    supervisor: cambio.supervisor !== undefined ? cambio.supervisor : actual.supervisor,
    solicitante: cambio.solicitante !== undefined ? cambio.solicitante : actual.solicitante,
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ orden, evento: eventoDe(orden, ORDEN_ASIGNACION_ACTUALIZADA, actorId) });
}

/* -------------------------- Datos de ejecución --------------------------- */

export interface PatchEjecucion {
  readonly diagnostico?: Diagnostico;
  readonly tiempoReal?: Duracion | null;
  readonly costoReal?: Costo | null;
  readonly observaciones?: string;
  readonly fechas?: Fechas;
}

export function actualizarEjecucion(
  actual: OrdenTrabajo,
  patch: PatchEjecucion,
  actorId: string,
  ahora: Date,
): Result<CambioOrden, KernelError> {
  const orden: OrdenTrabajo = {
    ...actual,
    diagnostico: patch.diagnostico ? { ...actual.diagnostico, ...patch.diagnostico } : actual.diagnostico,
    tiempoReal: patch.tiempoReal !== undefined ? patch.tiempoReal : actual.tiempoReal,
    costoReal: patch.costoReal !== undefined ? patch.costoReal : actual.costoReal,
    observaciones: patch.observaciones != null ? patch.observaciones.trim() : actual.observaciones,
    fechas: patch.fechas ?? actual.fechas,
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ orden, evento: eventoDe(orden, ORDEN_EJECUCION_ACTUALIZADA, actorId) });
}

/* ---------------------- Asociaciones (Dynamic Forms) --------------------- */

export function asociarFormulario(
  actual: OrdenTrabajo,
  formulario: ReferenciaPlantilla,
  actorId: string,
  ahora: Date,
): Result<CambioOrden, KernelError> {
  const orden: OrdenTrabajo = { ...actual, formulario, version: actual.version + 1, updatedAt: ahora };
  return ok({ orden, evento: eventoDe(orden, ORDEN_FORMULARIO_ASOCIADO, actorId) });
}

export function asociarChecklist(
  actual: OrdenTrabajo,
  checklist: ReferenciaPlantilla,
  actorId: string,
  ahora: Date,
): Result<CambioOrden, KernelError> {
  const orden: OrdenTrabajo = { ...actual, checklist, version: actual.version + 1, updatedAt: ahora };
  return ok({ orden, evento: eventoDe(orden, ORDEN_CHECKLIST_ASOCIADO, actorId) });
}

/* ------------------------------- Evidencias ------------------------------ */

export function agregarEvidencia(
  actual: OrdenTrabajo,
  evidencia: Evidencia,
  actorId: string,
  ahora: Date,
): Result<CambioOrden, KernelError> {
  if (actual.evidencias.some((e) => e.attachmentId === evidencia.attachmentId)) {
    // Idempotente: la misma evidencia no se duplica.
    return ok({ orden: actual, evento: eventoDe(actual, ORDEN_EVIDENCIA_AGREGADA, actorId) });
  }
  const orden: OrdenTrabajo = {
    ...actual,
    evidencias: [...actual.evidencias, evidencia],
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return ok({ orden, evento: eventoDe(orden, ORDEN_EVIDENCIA_AGREGADA, actorId) });
}

/* ------------------------------ Estado (WF) ------------------------------ */

/**
 * REFLEJA el estado resuelto por el Workflow Engine. NO decide la transición
 * (eso lo hace el motor); solo sella el nuevo estado + la instancia y, cuando
 * corresponde, las marcas temporales derivadas del ciclo.
 */
export function aplicarEstado(
  actual: OrdenTrabajo,
  nuevoEstado: EstadoOrdenEfectivo,
  instanciaId: string,
  actorId: string,
  ahora: Date,
): CambioOrden {
  const fechas: Fechas = { ...actual.fechas };
  const mut = fechas as { inicio?: string; finalizacion?: string; cierre?: string };
  if (nuevoEstado === "EN_EJECUCION" && !fechas.inicio) mut.inicio = ahora.toISOString();
  if (nuevoEstado === "EN_VALIDACION" && !fechas.finalizacion) mut.finalizacion = ahora.toISOString();
  if (nuevoEstado === "CERRADA") mut.cierre = ahora.toISOString();

  const orden: OrdenTrabajo = {
    ...actual,
    estado: nuevoEstado,
    workflow: { ...actual.workflow, instanciaId },
    fechas,
    version: actual.version + 1,
    updatedAt: ahora,
  };
  return { orden, evento: eventoDe(orden, ORDEN_ESTADO_CAMBIADO, actorId) };
}
