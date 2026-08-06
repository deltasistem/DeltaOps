/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Aggregate `ProgramaPreventivo`.
 *
 * Programa de mantenimiento preventivo que COMPONE planes PUBLICADOS de Planes
 * (DGP-012) por REFERENCIA (planId+version, sólo lectura), asocia múltiples
 * activos (validados por puerto en la app), tiene vigencia propia y un ciclo de
 * vida NEUTRO gobernado por el Workflow Engine. Soporta jerarquía padre/hijo (sin
 * ciclos) y VERSIONADO inmutable N/N-1 con rollback y comparación deterministas.
 *
 * Dominio PURO: fecha/actor por INPUT (validados). El aggregate REFLEJA el estado
 * neutro que el motor autoriza; nunca lo decide.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  PROGRAMA_ACTUALIZADO,
  PROGRAMA_CREADO,
  PROGRAMA_REVERTIDO,
  PROGRAMA_TRANSICIONADO,
  PROGRAMA_VERSIONADO,
} from "./events";
import type { ReferenciaWorkflow } from "./workflow";
import type { ReferenciaPlan, Sla, Vigencia } from "./value-objects";

/* --------------------------------- Estados ------------------------------- */
export const ESTADOS_PROGRAMA = ["preparacion", "revision", "publicado", "suspendido", "archivado"] as const;
export type EstadoPrograma = (typeof ESTADOS_PROGRAMA)[number];

/** Estados terminales (inmutables). */
export const ESTADOS_PROGRAMA_TERMINALES: readonly EstadoPrograma[] = ["archivado"];

/** Acción neutra → estado resultante, evento y estados admisibles de origen. */
const TRANSICIONES: Record<string, { destino: EstadoPrograma; desde: readonly EstadoPrograma[] }> = {
  enviarRevision: { destino: "revision", desde: ["preparacion"] },
  publicar: { destino: "publicado", desde: ["revision"] },
  suspender: { destino: "suspendido", desde: ["publicado"] },
  reanudar: { destino: "publicado", desde: ["suspendido"] },
  archivar: { destino: "archivado", desde: ["preparacion", "revision", "publicado", "suspendido"] },
};

export const ACCIONES_PROGRAMA = ["enviarRevision", "publicar", "suspender", "reanudar", "archivar"] as const;
export type AccionPrograma = (typeof ACCIONES_PROGRAMA)[number];

/* --------------------------------- Aggregate ----------------------------- */
export interface ProgramaPreventivo {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  /** Clave del catálogo `tipos-programa`. */
  readonly tipo: string;
  /** Clave del catálogo `clasificaciones-programa` (opcional). */
  readonly clasificacion: string | null;
  /** Programa padre en la jerarquía (null ⇒ raíz). */
  readonly padreId: string | null;
  /** Planes PUBLICADOS de Planes referenciados (sólo lectura). */
  readonly planes: readonly ReferenciaPlan[];
  /** Activos asociados (por id opaco; validados vía ActivosPort en la app). */
  readonly activos: readonly string[];
  readonly vigencia: Vigencia;
  /** SLA a nivel de programa (opcional; las actividades pueden tener el suyo). */
  readonly sla: Sla | null;
  readonly estado: EstadoPrograma;
  /** Número de versión inmutable del programa (N). */
  readonly versionPrograma: number;
  readonly workflow: ReferenciaWorkflow;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CambioPrograma {
  readonly programa: ProgramaPreventivo;
  readonly evento: { tipo: string; payload: Record<string, unknown> };
}

function eventoDe(
  p: ProgramaPreventivo,
  tipo: string,
  actorId: string,
  extra: Record<string, unknown> = {},
): CambioPrograma["evento"] {
  return {
    tipo,
    payload: {
      tenantId: p.tenantId,
      id: p.id,
      entityRef: `programa-preventivo:${p.id}`,
      codigo: p.codigo,
      nombre: p.nombre,
      tipo: p.tipo,
      estado: p.estado,
      padreId: p.padreId,
      versionPrograma: p.versionPrograma,
      version: p.version,
      actualizadoAt: p.updatedAt,
      actorId,
      eventoTipo: tipo,
      snapshot: p,
      ...extra,
    },
  };
}

/* -------------------------------- Crear ---------------------------------- */
export interface CrearProgramaInput {
  readonly id: string;
  readonly tenantId: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly tipo: string;
  readonly clasificacion?: string | null;
  readonly padreId?: string | null;
  readonly planes: readonly ReferenciaPlan[];
  readonly activos: readonly string[];
  readonly vigencia: Vigencia;
  readonly sla?: Sla | null;
  readonly workflow: ReferenciaWorkflow;
  readonly estadoInicial: EstadoPrograma;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearPrograma(input: CrearProgramaInput): Result<CambioPrograma, KernelError> {
  if (input.nombre.trim() === "") return fail(KernelErrors.validation("El nombre del programa es obligatorio"));
  if (Number.isNaN(Date.parse(input.ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (input.padreId === input.id) return fail(KernelErrors.validation("Un programa no puede ser su propio padre"));

  const activosUnicos = new Set(input.activos);
  if (activosUnicos.size !== input.activos.length) {
    return fail(KernelErrors.validation("Los activos asociados deben ser únicos"));
  }
  const planesDup = new Set(input.planes.map((r) => `${r.planId}:v${r.version}`));
  if (planesDup.size !== input.planes.length) {
    return fail(KernelErrors.validation("Los planes referenciados deben ser únicos por (planId, version)"));
  }

  const programa: ProgramaPreventivo = {
    id: input.id,
    tenantId: input.tenantId,
    codigo: input.codigo,
    nombre: input.nombre.trim(),
    descripcion: input.descripcion ?? null,
    tipo: input.tipo,
    clasificacion: input.clasificacion ?? null,
    padreId: input.padreId ?? null,
    planes: Object.freeze([...input.planes]),
    activos: Object.freeze([...input.activos]),
    vigencia: input.vigencia,
    sla: input.sla ?? null,
    estado: input.estadoInicial,
    versionPrograma: 1,
    workflow: input.workflow,
    version: 1,
    createdBy: input.actorId,
    createdAt: input.ahora,
    updatedAt: input.ahora,
  };
  return ok({
    programa: Object.freeze(programa),
    evento: eventoDe(programa, PROGRAMA_CREADO, input.actorId, {
      planes: programa.planes.length,
      activos: programa.activos.length,
    }),
  });
}

/* ------------------------------- Editar ---------------------------------- */
export interface EditarProgramaInput {
  readonly nombre?: string;
  readonly descripcion?: string | null;
  readonly clasificacion?: string | null;
  readonly planes?: readonly ReferenciaPlan[];
  readonly activos?: readonly string[];
  readonly vigencia?: Vigencia;
  readonly sla?: Sla | null;
}

/**
 * Edita un programa NO publicado/terminal. Los cambios estructurales sólo se
 * permiten en `preparacion`/`revision`: un programa `publicado` es inmutable en
 * su definición (se versiona; ver `versionarPrograma`).
 */
export function editarPrograma(
  p: ProgramaPreventivo,
  cambios: EditarProgramaInput,
  actorId: string,
  ahora: string,
): Result<CambioPrograma, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (p.estado !== "preparacion" && p.estado !== "revision") {
    return fail(
      KernelErrors.conflict(`No se puede editar un programa en estado "${p.estado}"; use versionado para publicados`),
    );
  }
  if (cambios.nombre !== undefined && cambios.nombre.trim() === "") {
    return fail(KernelErrors.validation("El nombre del programa no puede quedar vacío"));
  }
  if (cambios.activos) {
    const u = new Set(cambios.activos);
    if (u.size !== cambios.activos.length) return fail(KernelErrors.validation("Los activos deben ser únicos"));
  }
  const actualizado: ProgramaPreventivo = {
    ...p,
    nombre: cambios.nombre !== undefined ? cambios.nombre.trim() : p.nombre,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : p.descripcion,
    clasificacion: cambios.clasificacion !== undefined ? cambios.clasificacion : p.clasificacion,
    planes: cambios.planes ? Object.freeze([...cambios.planes]) : p.planes,
    activos: cambios.activos ? Object.freeze([...cambios.activos]) : p.activos,
    vigencia: cambios.vigencia ?? p.vigencia,
    sla: cambios.sla !== undefined ? cambios.sla : p.sla,
    version: p.version + 1,
    updatedAt: ahora,
  };
  return ok({ programa: Object.freeze(actualizado), evento: eventoDe(actualizado, PROGRAMA_ACTUALIZADO, actorId) });
}

/* ---------------------------- Transición gobernada ----------------------- */
/**
 * Aplica el estado neutro que el motor autorizó. Verifica admisibilidad DESDE el
 * estado actual y que el aggregate no esté en estado terminal. NO decide la
 * transición: el motor ya lo hizo (la app verifica su Result ANTES).
 */
export function aplicarAccionPrograma(
  p: ProgramaPreventivo,
  accion: AccionPrograma,
  actorId: string,
  ahora: string,
): Result<CambioPrograma, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (ESTADOS_PROGRAMA_TERMINALES.includes(p.estado)) {
    return fail(KernelErrors.conflict(`El programa está en estado terminal "${p.estado}" y es inmutable`));
  }
  const t = TRANSICIONES[accion];
  if (!t) return fail(KernelErrors.validation(`Acción de programa desconocida: "${accion}"`));
  if (!t.desde.includes(p.estado)) {
    return fail(KernelErrors.conflict(`No se puede "${accion}" un programa en estado "${p.estado}"`));
  }
  const actualizado: ProgramaPreventivo = { ...p, estado: t.destino, version: p.version + 1, updatedAt: ahora };
  return ok({
    programa: Object.freeze(actualizado),
    evento: eventoDe(actualizado, PROGRAMA_TRANSICIONADO, actorId, { accion }),
  });
}

/* ------------------------------ Jerarquía -------------------------------- */

/**
 * Resuelve el ancestro de un programa dado un mapa (id → padreId) y DETECTA
 * CICLOS de forma determinista. Devuelve error si `id` no llega a raíz por un
 * ciclo. No hace IO: la app precarga el mapa de padres desde el repositorio.
 */
export function detectarCicloJerarquia(
  id: string,
  candidatoPadreId: string | null,
  padrePorId: ReadonlyMap<string, string | null>,
): Result<void, KernelError> {
  if (candidatoPadreId == null) return ok(undefined);
  if (candidatoPadreId === id) return fail(KernelErrors.validation("Un programa no puede ser su propio padre"));

  const visitados = new Set<string>([id]);
  let actual: string | null = candidatoPadreId;
  while (actual != null) {
    if (visitados.has(actual)) {
      return fail(KernelErrors.conflict(`La jerarquía de programas formaría un ciclo en "${actual}"`));
    }
    visitados.add(actual);
    actual = padrePorId.has(actual) ? padrePorId.get(actual) ?? null : null;
  }
  return ok(undefined);
}

/* ------------------------------ Versionado ------------------------------- */

/**
 * Crea la SIGUIENTE versión inmutable (N+1) de un programa publicado. La versión
 * anterior (N) se conserva íntegra (N/N-1); el llamador la persiste como
 * histórico. El nuevo aggregate arranca en `preparacion` para su re-publicación
 * gobernada, con `versionPrograma = N+1`.
 */
export function versionarPrograma(
  p: ProgramaPreventivo,
  cambios: EditarProgramaInput,
  workflow: ReferenciaWorkflow,
  actorId: string,
  ahora: string,
): Result<CambioPrograma, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (p.estado !== "publicado" && p.estado !== "suspendido") {
    return fail(KernelErrors.conflict(`Sólo se versiona un programa publicado/suspendido; estado actual "${p.estado}"`));
  }
  if (cambios.nombre !== undefined && cambios.nombre.trim() === "") {
    return fail(KernelErrors.validation("El nombre del programa no puede quedar vacío"));
  }
  const nuevo: ProgramaPreventivo = {
    ...p,
    nombre: cambios.nombre !== undefined ? cambios.nombre.trim() : p.nombre,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : p.descripcion,
    clasificacion: cambios.clasificacion !== undefined ? cambios.clasificacion : p.clasificacion,
    planes: cambios.planes ? Object.freeze([...cambios.planes]) : p.planes,
    activos: cambios.activos ? Object.freeze([...cambios.activos]) : p.activos,
    vigencia: cambios.vigencia ?? p.vigencia,
    sla: cambios.sla !== undefined ? cambios.sla : p.sla,
    estado: "preparacion",
    versionPrograma: p.versionPrograma + 1,
    workflow,
    version: 1,
    createdBy: actorId,
    createdAt: ahora,
    updatedAt: ahora,
  };
  return ok({
    programa: Object.freeze(nuevo),
    evento: eventoDe(nuevo, PROGRAMA_VERSIONADO, actorId, { versionAnterior: p.versionPrograma }),
  });
}

/**
 * ROLLBACK determinista a una versión histórica: reconstruye el programa a
 * partir del snapshot `objetivo` (versión N-k) como una NUEVA versión (N+1),
 * preservando la identidad y aumentando `versionPrograma`. No muta el histórico.
 */
export function revertirPrograma(
  actual: ProgramaPreventivo,
  objetivo: ProgramaPreventivo,
  workflow: ReferenciaWorkflow,
  actorId: string,
  ahora: string,
): Result<CambioPrograma, KernelError> {
  if (Number.isNaN(Date.parse(ahora))) return fail(KernelErrors.validation("La fecha 'ahora' no es ISO válida"));
  if (objetivo.id !== actual.id) return fail(KernelErrors.validation("El objetivo de rollback debe ser el mismo programa"));
  if (objetivo.versionPrograma >= actual.versionPrograma) {
    return fail(KernelErrors.conflict("El objetivo de rollback debe ser una versión anterior"));
  }
  const revertido: ProgramaPreventivo = {
    ...objetivo,
    estado: "preparacion",
    versionPrograma: actual.versionPrograma + 1,
    workflow,
    version: 1,
    createdBy: actorId,
    createdAt: ahora,
    updatedAt: ahora,
  };
  return ok({
    programa: Object.freeze(revertido),
    evento: eventoDe(revertido, PROGRAMA_REVERTIDO, actorId, { revertidoDesde: actual.versionPrograma, haciaVersion: objetivo.versionPrograma }),
  });
}

/* ------------------------------ Comparación ------------------------------ */

export interface DiferenciaPrograma {
  readonly campo: string;
  readonly anterior: unknown;
  readonly nuevo: unknown;
}

/** Compara DOS versiones de un programa de forma DETERMINISTA (campo a campo). */
export function compararProgramas(a: ProgramaPreventivo, b: ProgramaPreventivo): DiferenciaPrograma[] {
  const campos: (keyof ProgramaPreventivo)[] = [
    "nombre",
    "descripcion",
    "tipo",
    "clasificacion",
    "padreId",
    "planes",
    "activos",
    "vigencia",
    "sla",
  ];
  const diffs: DiferenciaPrograma[] = [];
  for (const c of campos) {
    const va = JSON.stringify(a[c] ?? null);
    const vb = JSON.stringify(b[c] ?? null);
    if (va !== vb) diffs.push({ campo: c, anterior: a[c] ?? null, nuevo: b[c] ?? null });
  }
  return diffs;
}
