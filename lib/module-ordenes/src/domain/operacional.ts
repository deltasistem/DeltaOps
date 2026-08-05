/**
 * DGP-009.2 · Módulo Órdenes de Trabajo — Eventos y tipos del MOTOR OPERACIONAL.
 *
 * Superficies operacionales (bitácora operacional, planificación, asignaciones,
 * recursos, SLA, relaciones). Todas mutan SIEMPRE por eventos autosuficientes
 * (payload completo) que se registran en la bitácora durable (`ord_eventos`) y
 * en el outbox con el MISMO event.id, y proyectan read models idempotentes.
 *
 * NO se toca `orden.ts` (aggregate frozen de 009.1): estos eventos describen
 * hechos OPERACIONALES asociados a una OT, no cambios del aggregate.
 */

/* ------------------------------- Bitácora -------------------------------- */

export const BITACORA_REGISTRADA = "modulo.ordenes.bitacora-registrada";

/** Acciones canónicas de la bitácora operacional. */
export const ACCIONES_BITACORA = [
  "inicio",
  "pausa",
  "reanudacion",
  "espera",
  "cambio-responsable",
  "llegada",
  "salida",
  "finalizacion",
] as const;
export type AccionBitacora = (typeof ACCIONES_BITACORA)[number];

/* ----------------------------- Planificación ----------------------------- */

export const PLANIFICACION_ACTUALIZADA = "modulo.ordenes.planificacion-actualizada";
export const PLANIFICACION_BLOQUEADA = "modulo.ordenes.planificacion-bloqueada";

/* ----------------------------- Asignaciones ------------------------------ */

export const ASIGNACION_REGISTRADA = "modulo.ordenes.asignacion-registrada";
export const TIPOS_ASIGNACION = ["persona", "grupo", "cuadrilla", "contratista"] as const;
export type TipoAsignacion = (typeof TIPOS_ASIGNACION)[number];

/* ------------------------------- Recursos -------------------------------- */

export const RECURSO_REGISTRADO = "modulo.ordenes.recurso-registrado";
export const CLASES_RECURSO = ["herramienta", "material", "epp", "vehiculo", "equipo-auxiliar"] as const;
export type ClaseRecurso = (typeof CLASES_RECURSO)[number];

/* --------------------------------- SLA ----------------------------------- */

export const SLA_ACTUALIZADO = "modulo.ordenes.sla-actualizado";
export const ESTADOS_SLA = ["vigente", "en-riesgo", "vencido", "suspendido", "cumplido"] as const;
export type EstadoSla = (typeof ESTADOS_SLA)[number];

/* ------------------------------ Relaciones ------------------------------- */

export const RELACION_CREADA = "modulo.ordenes.relacion-creada";
export const CATEGORIAS_RELACION = ["activo", "orden", "formulario", "checklist", "evidencia", "recurso"] as const;
export type CategoriaRelacion = (typeof CATEGORIAS_RELACION)[number];

/** Todos los eventos OPERACIONALES del módulo (independientes del aggregate). */
export const EVENTOS_OPERACIONALES = [
  BITACORA_REGISTRADA,
  PLANIFICACION_ACTUALIZADA,
  PLANIFICACION_BLOQUEADA,
  ASIGNACION_REGISTRADA,
  RECURSO_REGISTRADO,
  SLA_ACTUALIZADO,
  RELACION_CREADA,
] as const;
