/**
 * DGP-016 · SnapshotEvaluacion — base de Offline First.
 *
 * Resultado MATERIALIZADO de evaluar un indicador (o dashboard) con un conjunto
 * de filtros + un timestamp. La clave determinista permite idempotencia: dos
 * evaluaciones con el mismo (tenant, target, filtros, ventana) producen la misma
 * clave y NO duplican snapshots. Cacheable y sincronizable.
 */
import { ok, type KernelError, type Result } from "@workspace/kernel";
import { SNAPSHOT_MATERIALIZADO } from "./events";
import type { Filtro } from "./filtros";
import type { ResultadoEvaluacion } from "./motor";

export type TargetSnapshot = "indicador" | "dashboard";

export interface SnapshotEvaluacion {
  readonly id: string;
  readonly tenantId: string;
  /** Clave determinista de idempotencia. */
  readonly claveSnapshot: string;
  readonly target: TargetSnapshot;
  /** Clave del indicador o del dashboard evaluado. */
  readonly targetClave: string;
  readonly filtros: readonly Filtro[];
  readonly resultado: ResultadoEvaluacion;
  /** Instante de evaluación (ISO). */
  readonly evaluadoEn: string;
  readonly actorId: string;
}

/** Normaliza filtros para una clave estable (orden canónico). */
function normalizarFiltros(filtros: readonly Filtro[]): string {
  return [...filtros]
    .map((f) => `${f.dimension}:${f.campo ?? ""}:${f.operador}:${JSON.stringify(f.valor)}`)
    .sort()
    .join(";");
}

/**
 * Clave determinista: mismo (tenant, target, targetClave, filtros, instante) ⇒
 * misma clave. El instante puede truncarse por el llamador (p.ej. al día) para
 * cachear por periodo; aquí se toma tal cual para máxima precisión.
 */
export function claveDeterminista(input: {
  tenantId: string;
  target: TargetSnapshot;
  targetClave: string;
  filtros: readonly Filtro[];
  evaluadoEn: string;
}): string {
  return [
    input.tenantId,
    input.target,
    input.targetClave,
    normalizarFiltros(input.filtros),
    input.evaluadoEn,
  ].join("::");
}

interface Evento {
  readonly tipo: string;
  readonly payload: Record<string, unknown>;
}

/** Materializa un snapshot idempotente por clave determinista. */
export function crearSnapshot(input: {
  id: string;
  tenantId: string;
  target: TargetSnapshot;
  targetClave: string;
  filtros: readonly Filtro[];
  resultado: ResultadoEvaluacion;
  evaluadoEn: string;
  actorId: string;
}): Result<{ snapshot: SnapshotEvaluacion; evento: Evento }, KernelError> {
  const claveSnapshot = claveDeterminista(input);
  const snapshot: SnapshotEvaluacion = Object.freeze({
    id: input.id,
    tenantId: input.tenantId,
    claveSnapshot,
    target: input.target,
    targetClave: input.targetClave,
    filtros: Object.freeze([...input.filtros]),
    resultado: input.resultado,
    evaluadoEn: input.evaluadoEn,
    actorId: input.actorId,
  });
  return ok({
    snapshot,
    evento: {
      tipo: SNAPSHOT_MATERIALIZADO,
      payload: {
        tenantId: input.tenantId,
        id: input.id,
        entityRef: `snapshot:${input.id}`,
        claveSnapshot,
        target: input.target,
        targetClave: input.targetClave,
        valor: input.resultado.valor,
        muestras: input.resultado.muestras,
        evaluadoEn: input.evaluadoEn,
        actorId: input.actorId,
        actualizadoAt: input.evaluadoEn,
        eventoTipo: SNAPSHOT_MATERIALIZADO,
      },
    },
  });
}
