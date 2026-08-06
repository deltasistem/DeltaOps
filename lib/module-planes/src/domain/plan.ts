/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Aggregate `PlanMantenimiento`
 * (+ `ProgramaMantenimiento` embebido y VERSIONADO inmutable).
 *
 * Un plan describe QUÉ mantener (alcance de activos declarativo), CÓMO (rutina)
 * y CUÁNDO (programa: frecuencia + calendario). Está PREPARADO/gobernado por el
 * Workflow Engine: el aggregate REFLEJA el estado neutro resultante, NUNCA
 * decide la transición.
 *
 * VERSIONADO (lección DGP-007): las versiones PUBLICADAS son INMUTABLES. Editar
 * un plan publicado crea un BORRADOR de la siguiente versión (N/N-1); la versión
 * activa es la última publicada; el rollback reactiva una versión histórica.
 * Dominio PURO: la fecha llega como INPUT (jamás reloj interno).
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  PLAN_ACTUALIZADO,
  PLAN_ARCHIVADO,
  PLAN_CREADO,
  PLAN_PUBLICADO,
  PLAN_REANUDADO,
  PLAN_SUSPENDIDO,
} from "./events";
import type { ReferenciaWorkflow } from "./workflow";
import type { AlcanceActivos, Frecuencia } from "./value-objects";
import type { Rutina } from "./rutina";

/* --------------------------------- Estados ------------------------------- */
export const ESTADOS_PLAN = ["borrador", "vigente", "suspendido", "finalizado", "archivado"] as const;
export type EstadoPlan = (typeof ESTADOS_PLAN)[number];

/** Estados terminales del ciclo de vida (inmutables). */
export const ESTADOS_PLAN_TERMINALES: readonly EstadoPlan[] = ["archivado"];

/* ---------------------------- Programa de mantenimiento ------------------ */
/**
 * El PROGRAMA es la política temporal/uso del plan: la frecuencia compuesta, el
 * calendario operacional que rige la resolución de fechas y las fechas de
 * inicio/fin de vigencia. Embebido en la versión del plan.
 */
export interface ProgramaMantenimiento {
  readonly frecuencia: Frecuencia;
  /** Id del `CalendarioOperacional` que rige la resolución de fechas (o null). */
  readonly calendarioId: string | null;
  /** Inicio de vigencia (ISO) del programa. */
  readonly vigenteDesde: string;
  /** Fin de vigencia (ISO) o null si es indefinido. */
  readonly vigenteHasta: string | null;
}

/* ------------------------------- Versión de plan ------------------------- */
export interface VersionPlan {
  readonly numero: number;
  readonly publicada: boolean;
  readonly alcance: AlcanceActivos;
  readonly rutina: Rutina;
  readonly programa: ProgramaMantenimiento;
  /** Instantes ISO (input). */
  readonly creadaEn: string;
  readonly publicadaEn: string | null;
  readonly creadaPor: string;
}

/* ---------------------------------- Plan --------------------------------- */
export interface PlanMantenimiento {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  /** Clave del catálogo `tipos-plan`. */
  readonly tipoPlan: string;
  /** Clave del catálogo `estrategias`. */
  readonly estrategia: string;
  /** Clave del catálogo `prioridades`. */
  readonly prioridad: string;
  readonly estado: EstadoPlan;
  /** Nº de la versión ACTIVA (última publicada) o 0 si aún no hay ninguna. */
  readonly versionActiva: number;
  /** Todas las versiones (histórico inmutable + el borrador en curso). */
  readonly versiones: readonly VersionPlan[];
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioPlan {
  readonly plan: PlanMantenimiento;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

/* ------------------------------ Emisión de evento ------------------------ */
function eventoDe(p: PlanMantenimiento, tipo: string, actorId: string, extra: Record<string, unknown> = {}): CambioPlan["evento"] {
  return {
    tipo,
    payload: {
      tenantId: p.tenantId,
      id: p.id,
      entityRef: `plan-mantenimiento:${p.id}`,
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      tipoPlan: p.tipoPlan,
      estrategia: p.estrategia,
      prioridad: p.prioridad,
      estado: p.estado,
      versionActiva: p.versionActiva,
      workflow: p.workflow,
      version: p.version,
      actualizadoAt: p.updatedAt,
      actorId,
      eventoTipo: tipo,
      // Snapshot COMPLETO del aggregate en el payload (Offline First): permite
      // proyectar el DETALLE del read model sin releer el aggregate (lección 009.2).
      snapshot: p,
      ...extra,
    },
  };
}

/* -------------------------------- Crear plan ----------------------------- */
export interface CrearPlanInput {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly tipoPlan: string;
  readonly estrategia: string;
  readonly prioridad: string;
  readonly alcance: AlcanceActivos;
  readonly rutina: Rutina;
  readonly programa: ProgramaMantenimiento;
  readonly workflow: ReferenciaWorkflow;
  readonly estadoInicial: EstadoPlan;
  readonly actorId: string;
  readonly ahora: string;
  readonly maxLongitudNombre?: number;
}

export function crearPlan(input: CrearPlanInput): Result<CambioPlan, KernelError> {
  if (input.nombre.trim() === "") return fail(KernelErrors.validation("El nombre del plan es obligatorio"));
  const max = input.maxLongitudNombre ?? 200;
  if (input.nombre.length > max) return fail(KernelErrors.validation(`El nombre supera ${max} caracteres`));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));

  const versionInicial: VersionPlan = {
    numero: 1,
    publicada: false,
    alcance: input.alcance,
    rutina: input.rutina,
    programa: input.programa,
    creadaEn: input.ahora,
    publicadaEn: null,
    creadaPor: input.actorId,
  };
  const plan: PlanMantenimiento = {
    id: input.id,
    tenantId: input.tenantId,
    codigo: input.codigo,
    nombre: input.nombre.trim(),
    descripcion: input.descripcion ?? null,
    tipoPlan: input.tipoPlan,
    estrategia: input.estrategia,
    prioridad: input.prioridad,
    estado: input.estadoInicial,
    versionActiva: 0,
    versiones: Object.freeze([Object.freeze(versionInicial)]),
    workflow: input.workflow,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ plan: Object.freeze(plan), evento: eventoDe(plan, PLAN_CREADO, input.actorId, { versiones: 1 }) });
}

/** Versión en curso (última no publicada) o `null` si todas están publicadas. */
export function versionBorrador(p: PlanMantenimiento): VersionPlan | null {
  const ultima = p.versiones[p.versiones.length - 1];
  return ultima && !ultima.publicada ? ultima : null;
}

/** Versión ACTIVA (la última publicada) o `null`. */
export function versionActiva(p: PlanMantenimiento): VersionPlan | null {
  return p.versiones.find((v) => v.numero === p.versionActiva) ?? null;
}

/* ------------------------------- Editar plan ----------------------------- */
/**
 * Aplica cambios de contenido (alcance/rutina/programa). NUNCA muta una versión
 * publicada: si la última versión ya está publicada, ABRE una nueva versión
 * borrador N+1 con los cambios; si hay un borrador en curso, lo reemplaza.
 */
export function editarPlan(
  p: PlanMantenimiento,
  cambios: { alcance?: AlcanceActivos; rutina?: Rutina; programa?: ProgramaMantenimiento; nombre?: string; descripcion?: string | null },
  actorId: string,
  ahora: string,
): Result<CambioPlan, KernelError> {
  if (p.estado === "archivado") return fail(KernelErrors.conflict("Un plan archivado es inmutable"));
  const borrador = versionBorrador(p);
  const baseVersion = borrador ?? p.versiones[p.versiones.length - 1]!;
  const nuevaVersion: VersionPlan = {
    numero: borrador ? borrador.numero : baseVersion.numero + 1,
    publicada: false,
    alcance: cambios.alcance ?? baseVersion.alcance,
    rutina: cambios.rutina ?? baseVersion.rutina,
    programa: cambios.programa ?? baseVersion.programa,
    creadaEn: ahora,
    publicadaEn: null,
    creadaPor: actorId,
  };
  const versiones = borrador
    ? [...p.versiones.slice(0, -1), Object.freeze(nuevaVersion)]
    : [...p.versiones, Object.freeze(nuevaVersion)];
  const actualizado: PlanMantenimiento = {
    ...p,
    nombre: cambios.nombre?.trim() ?? p.nombre,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : p.descripcion,
    versiones: Object.freeze(versiones),
    version: p.version + 1,
    updatedAt: ahora,
  };
  return ok({
    plan: Object.freeze(actualizado),
    evento: eventoDe(actualizado, PLAN_ACTUALIZADO, actorId, { versionBorrador: nuevaVersion.numero }),
  });
}

/* ------------------------------ Publicar versión ------------------------- */
/**
 * Publica el borrador en curso: lo marca inmutable, lo fija como versión ACTIVA
 * y pone el plan `vigente`. Requiere que el estado de workflow ya lo permita
 * (la app verifica el motor ANTES). Idempotente-safe: si no hay borrador, falla.
 */
export function publicarPlan(p: PlanMantenimiento, actorId: string, ahora: string): Result<CambioPlan, KernelError> {
  if (p.estado === "archivado") return fail(KernelErrors.conflict("Un plan archivado no puede publicarse"));
  const borrador = versionBorrador(p);
  if (!borrador) return fail(KernelErrors.conflict("No hay una versión borrador pendiente de publicar"));
  const publicada: VersionPlan = { ...borrador, publicada: true, publicadaEn: ahora };
  const versiones = [...p.versiones.slice(0, -1), Object.freeze(publicada)];
  const actualizado: PlanMantenimiento = {
    ...p,
    estado: "vigente",
    versionActiva: publicada.numero,
    versiones: Object.freeze(versiones),
    version: p.version + 1,
    updatedAt: ahora,
  };
  return ok({
    plan: Object.freeze(actualizado),
    evento: eventoDe(actualizado, PLAN_PUBLICADO, actorId, { versionPublicada: publicada.numero }),
  });
}

/* --------------------------------- Rollback ------------------------------ */
/**
 * Reactiva una versión histórica PUBLICADA como versión ACTIVA (rollback). NO
 * modifica el contenido histórico (inmutabilidad); sólo cambia el puntero de
 * versión activa. Descarta cualquier borrador en curso.
 */
export function rollbackPlan(p: PlanMantenimiento, numeroDestino: number, actorId: string, ahora: string): Result<CambioPlan, KernelError> {
  if (p.estado === "archivado") return fail(KernelErrors.conflict("Un plan archivado no admite rollback"));
  const destino = p.versiones.find((v) => v.numero === numeroDestino && v.publicada);
  if (!destino) return fail(KernelErrors.conflict(`No existe una versión publicada ${numeroDestino}`));
  const versiones = p.versiones.filter((v) => v.publicada); // descarta borrador en curso
  const actualizado: PlanMantenimiento = {
    ...p,
    estado: "vigente",
    versionActiva: numeroDestino,
    versiones: Object.freeze(versiones),
    version: p.version + 1,
    updatedAt: ahora,
  };
  return ok({
    plan: Object.freeze(actualizado),
    evento: eventoDe(actualizado, PLAN_ACTUALIZADO, actorId, { rollbackA: numeroDestino }),
  });
}

/* ------------------------- Transición de estado gobernada ---------------- */
/** Mapa acción de suspensión → estado de dominio resultante. */
const ESTADO_POR_ACCION: Record<string, EstadoPlan> = {
  suspender: "suspendido",
  reanudar: "vigente",
  posponer: "suspendido",
  extender: "vigente",
  reprogramar: "vigente",
  cancelar: "finalizado",
  archivar: "archivado",
};

const EVENTO_POR_ESTADO: Record<EstadoPlan, string> = {
  borrador: PLAN_ACTUALIZADO,
  vigente: PLAN_REANUDADO,
  suspendido: PLAN_SUSPENDIDO,
  finalizado: PLAN_ARCHIVADO,
  archivado: PLAN_ARCHIVADO,
};

/**
 * Aplica el estado neutro que el motor autorizó. Verifica terminalidad
 * (inmutabilidad de estados terminales) y coherencia de la acción.
 */
export function aplicarAccionPlan(p: PlanMantenimiento, accion: string, actorId: string, ahora: string): Result<CambioPlan, KernelError> {
  if (ESTADOS_PLAN_TERMINALES.includes(p.estado)) {
    return fail(KernelErrors.conflict(`El plan está en estado terminal "${p.estado}" y es inmutable`));
  }
  const destino = ESTADO_POR_ACCION[accion];
  if (!destino) return fail(KernelErrors.validation(`Acción de plan desconocida: "${accion}"`));
  const actualizado: PlanMantenimiento = { ...p, estado: destino, version: p.version + 1, updatedAt: ahora };
  return ok({
    plan: Object.freeze(actualizado),
    evento: eventoDe(actualizado, EVENTO_POR_ESTADO[destino], actorId, { accion }),
  });
}

/* -------------------------------- Comparación ---------------------------- */
export interface DiferenciaVersion {
  readonly campo: string;
  readonly a: unknown;
  readonly b: unknown;
}

/** Compara dos versiones del plan (para la experiencia de "comparación"). */
export function compararVersiones(p: PlanMantenimiento, na: number, nb: number): Result<DiferenciaVersion[], KernelError> {
  const va = p.versiones.find((v) => v.numero === na);
  const vb = p.versiones.find((v) => v.numero === nb);
  if (!va || !vb) return fail(KernelErrors.notFound("version-plan", `${na}/${nb}`));
  const difs: DiferenciaVersion[] = [];
  const jsA = JSON.stringify(va.alcance);
  const jsB = JSON.stringify(vb.alcance);
  if (jsA !== jsB) difs.push({ campo: "alcance", a: va.alcance, b: vb.alcance });
  if (JSON.stringify(va.rutina) !== JSON.stringify(vb.rutina)) difs.push({ campo: "rutina", a: va.rutina, b: vb.rutina });
  if (JSON.stringify(va.programa) !== JSON.stringify(vb.programa)) difs.push({ campo: "programa", a: va.programa, b: vb.programa });
  return ok(difs);
}
