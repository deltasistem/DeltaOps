/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Aggregate `ActividadPreventiva`.
 *
 * Actividad DENTRO de un programa preventivo. Declara: dependencias entre
 * actividades (DAG SIN ciclos), checklist OBLIGATORIO por referencia a plantilla
 * de Dynamic Forms, recursos requeridos (personal por rol/cantidad/horas,
 * herramientas, repuestos por REFERENCIA a inventario/artículos), tiempo estimado,
 * costo estimado DETERMINISTA y SLA por actividad. Dominio PURO: sin IO ni reloj
 * interno; fecha/actor por INPUT.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { ACTIVIDAD_ACTUALIZADA, ACTIVIDAD_CREADA } from "./events";
import {
  calcularCostoEstimado,
  tiempoAMinutos,
  type Checklist,
  type DesgloseCosto,
  type RecursosRequeridos,
  type Sla,
  type TiempoEstimado,
} from "./value-objects";

/* --------------------------------- Aggregate ----------------------------- */
export interface ActividadPreventiva {
  readonly id: string;
  readonly tenantId: string;
  readonly programaId: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  /** Orden de presentación dentro del programa (estable). */
  readonly orden: number;
  /** Ids de actividades PREDECESORAS (dependencias del DAG). */
  readonly dependencias: readonly string[];
  readonly checklist: Checklist;
  readonly recursos: RecursosRequeridos;
  readonly tiempoEstimado: TiempoEstimado;
  /** Moneda de referencia para el costo estimado (clave de catálogo `monedas`). */
  readonly moneda: string;
  readonly sla: Sla | null;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioActividad {
  readonly actividad: ActividadPreventiva;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(
  a: ActividadPreventiva,
  tipo: string,
  actorId: string,
  extra: Record<string, unknown> = {},
): CambioActividad["evento"] {
  return {
    tipo,
    payload: {
      tenantId: a.tenantId,
      id: a.id,
      entityRef: `actividad-preventiva:${a.id}`,
      programaId: a.programaId,
      nombre: a.nombre,
      orden: a.orden,
      dependencias: a.dependencias,
      version: a.version,
      actualizadoAt: a.updatedAt,
      actorId,
      eventoTipo: tipo,
      snapshot: a,
      ...extra,
    },
  };
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearActividadInput {
  readonly id: string;
  readonly tenantId: string;
  readonly programaId: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly orden: number;
  readonly dependencias?: readonly string[];
  readonly checklist: Checklist;
  readonly recursos: RecursosRequeridos;
  readonly tiempoEstimado: TiempoEstimado;
  readonly moneda: string;
  readonly sla?: Sla | null;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearActividad(input: CrearActividadInput): Result<CambioActividad, KernelError> {
  if (input.nombre.trim() === "") return fail(KernelErrors.validation("El nombre de la actividad es obligatorio"));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));

  const deps = input.dependencias ?? [];
  if (deps.includes(input.id)) return fail(KernelErrors.validation("Una actividad no puede depender de sí misma"));
  const depsUnicas = new Set(deps);
  if (depsUnicas.size !== deps.length) return fail(KernelErrors.validation("Las dependencias deben ser únicas"));

  const actividad: ActividadPreventiva = {
    id: input.id,
    tenantId: input.tenantId,
    programaId: input.programaId,
    nombre: input.nombre.trim(),
    descripcion: input.descripcion ?? null,
    orden: input.orden,
    dependencias: Object.freeze([...deps]),
    checklist: input.checklist,
    recursos: input.recursos,
    tiempoEstimado: input.tiempoEstimado,
    moneda: input.moneda,
    sla: input.sla ?? null,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({ actividad: Object.freeze(actividad), evento: eventoDe(actividad, ACTIVIDAD_CREADA, input.actorId) });
}

/* ------------------------------- Editar ---------------------------------- */
export interface EditarActividadInput {
  readonly nombre?: string;
  readonly descripcion?: string | null;
  readonly orden?: number;
  readonly dependencias?: readonly string[];
  readonly checklist?: Checklist;
  readonly recursos?: RecursosRequeridos;
  readonly tiempoEstimado?: TiempoEstimado;
  readonly sla?: Sla | null;
}

export function editarActividad(
  a: ActividadPreventiva,
  cambios: EditarActividadInput,
  actorId: string,
  ahora: string,
): Result<CambioActividad, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (cambios.nombre !== undefined && cambios.nombre.trim() === "") {
    return fail(KernelErrors.validation("El nombre de la actividad no puede quedar vacío"));
  }
  if (cambios.dependencias) {
    if (cambios.dependencias.includes(a.id)) {
      return fail(KernelErrors.validation("Una actividad no puede depender de sí misma"));
    }
    const u = new Set(cambios.dependencias);
    if (u.size !== cambios.dependencias.length) return fail(KernelErrors.validation("Las dependencias deben ser únicas"));
  }
  const actualizado: ActividadPreventiva = {
    ...a,
    nombre: cambios.nombre !== undefined ? cambios.nombre.trim() : a.nombre,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : a.descripcion,
    orden: cambios.orden !== undefined ? cambios.orden : a.orden,
    dependencias: cambios.dependencias ? Object.freeze([...cambios.dependencias]) : a.dependencias,
    checklist: cambios.checklist ?? a.checklist,
    recursos: cambios.recursos ?? a.recursos,
    tiempoEstimado: cambios.tiempoEstimado ?? a.tiempoEstimado,
    sla: cambios.sla !== undefined ? cambios.sla : a.sla,
    version: a.version + 1,
    updatedAt: ahora,
  };
  return ok({ actividad: Object.freeze(actualizado), evento: eventoDe(actualizado, ACTIVIDAD_ACTUALIZADA, actorId) });
}

/* ------------------------------ Costo y tiempo --------------------------- */

/** Costo estimado DETERMINISTA de la actividad (delegado al motor de VO). */
export function costoDeActividad(a: ActividadPreventiva): Result<DesgloseCosto, KernelError> {
  return calcularCostoEstimado(a.recursos, a.moneda);
}

/** Tiempo estimado de la actividad en minutos (determinista). */
export function tiempoDeActividadMinutos(a: ActividadPreventiva): number {
  return tiempoAMinutos(a.tiempoEstimado);
}

/* --------------------------------- DAG ----------------------------------- */

export interface ValidacionDag {
  /** Orden topológico determinista de ejecución (si no hay ciclos). */
  readonly orden: readonly string[];
}

/**
 * Valida el DAG de dependencias entre actividades y devuelve un ORDEN TOPOLÓGICO
 * DETERMINISTA (Kahn con desempate estable por `orden` y luego por `id`).
 * Detecta ciclos y dependencias hacia actividades inexistentes. Puro, sin IO.
 */
export function validarDependencias(actividades: readonly ActividadPreventiva[]): Result<ValidacionDag, KernelError> {
  const porId = new Map<string, ActividadPreventiva>();
  for (const a of actividades) {
    if (porId.has(a.id)) return fail(KernelErrors.conflict(`Actividad duplicada en el DAG: "${a.id}"`));
    porId.set(a.id, a);
  }
  // Verifica que toda dependencia exista.
  for (const a of actividades) {
    for (const d of a.dependencias) {
      if (!porId.has(d)) {
        return fail(KernelErrors.validation(`La actividad "${a.id}" depende de "${d}", que no existe en el programa`));
      }
    }
  }
  // Kahn con desempate determinista.
  const gradoEntrada = new Map<string, number>();
  for (const a of actividades) gradoEntrada.set(a.id, a.dependencias.length);
  const dependientesDe = new Map<string, string[]>();
  for (const a of actividades) {
    for (const d of a.dependencias) {
      const arr = dependientesDe.get(d) ?? [];
      arr.push(a.id);
      dependientesDe.set(d, arr);
    }
  }
  const ordenar = (ids: string[]): string[] =>
    ids.sort((x, y) => {
      const ax = porId.get(x)!;
      const ay = porId.get(y)!;
      return ax.orden - ay.orden || (ax.id < ay.id ? -1 : ax.id > ay.id ? 1 : 0);
    });

  let listos = ordenar([...gradoEntrada.entries()].filter(([, g]) => g === 0).map(([id]) => id));
  const orden: string[] = [];
  while (listos.length > 0) {
    const actual = listos.shift()!;
    orden.push(actual);
    for (const dep of dependientesDe.get(actual) ?? []) {
      gradoEntrada.set(dep, (gradoEntrada.get(dep) ?? 0) - 1);
      if (gradoEntrada.get(dep) === 0) listos.push(dep);
    }
    listos = ordenar(listos);
  }
  if (orden.length !== actividades.length) {
    return fail(KernelErrors.conflict("Las dependencias de actividades forman un ciclo (DAG inválido)"));
  }
  return ok({ orden: Object.freeze(orden) });
}
