/**
 * DGP-020.3 · Valoración de mano de obra (SNAPSHOT histórico) — DOMINIO PURO.
 *
 * §10 CRÍTICO: la valoración es un SNAPSHOT AUDITABLE de la tarifa aplicada a una
 * sesión CERRADA. La FUENTE DE VERDAD del tiempo sigue siendo DGP-020.2 (el
 * `efectivoMs` se COPIA de la query pública de duraciones — snapshot documentado,
 * NO segunda fuente de verdad). Una valoración VALORADA es INMUTABLE: cambios de
 * tarifa posteriores NUNCA alteran el histórico (§16/§30).
 *
 * Política de vigencia (§16): se aplica la tarifa vigente en `iniciadoAt` de la
 * sesión. Si la sesión cruza períodos tarifarios ⇒ se aplica igualmente la de
 * `iniciadoAt` y se marca `cruzaPeriodos=true` (GAP documentado).
 *
 * Estados:
 *  - VALORADA    : había recurso y tarifa vigente ⇒ costo calculado (inmutable).
 *  - SIN_TARIFA  : hay recurso y tiempo, pero NO tarifa ⇒ costo NULL (nunca 0, §15).
 *  - SIN_RECURSO : la identidad de la sesión no es un recurso ⇒ costo NULL.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { calcularCosto, type Dinero, type UnidadTarifa } from "./dinero";
import { cruzaPeriodos, tarifaVigenteEn, type Tarifa } from "./tarifa";
import type { RecursoHumano } from "./recurso";

export const ESTADOS_VALORACION = ["VALORADA", "SIN_TARIFA", "SIN_RECURSO"] as const;
export type EstadoValoracion = (typeof ESTADOS_VALORACION)[number];

/** Estados revalorables: sólo los NO definitivos (§7 decisión). */
export const ESTADOS_REVALORABLES: readonly EstadoValoracion[] = ["SIN_TARIFA", "SIN_RECURSO"];

export interface Valoracion {
  readonly tenantId: string;
  readonly sesionId: string;
  readonly ordenId: string;
  readonly activoId: string | null;
  readonly identityId: string;
  readonly categoriaClave: string | null;
  readonly tarifaId: string | null;
  readonly tarifaValor: Dinero | null; // cadena decimal exacta
  readonly moneda: string | null;
  readonly unidad: UnidadTarifa | null;
  readonly efectivoMs: number; // snapshot copiado de DGP-020.2 (autoridad externa)
  readonly costo: Dinero | null; // cadena decimal exacta; NULL si SIN_TARIFA/SIN_RECURSO (§15)
  readonly estado: EstadoValoracion;
  readonly vigenciaDesde: Date | null; // vigencia de la tarifa aplicada
  readonly vigenciaHasta: Date | null;
  readonly cruzaPeriodos: boolean; // §16 GAP flag
  readonly iniciadoAt: Date;
  readonly cerradoAt: Date | null;
  readonly valoradoAt: Date;
  readonly valoradoPor: string;
}

export interface DatosSesionCerrada {
  readonly tenantId: string;
  readonly sesionId: string;
  readonly ordenId: string;
  readonly activoId: string | null;
  readonly identityId: string;
  readonly efectivoMs: number;
  readonly iniciadoAt: Date;
  readonly cerradoAt: Date | null;
}

export interface ValorarInput {
  readonly sesion: DatosSesionCerrada;
  /** Recurso de la identidad de la sesión (null ⇒ SIN_RECURSO). */
  readonly recurso: RecursoHumano | null;
  /** Tarifas del sujeto (categoría del recurso) para resolver la vigente. */
  readonly tarifas: readonly Tarifa[];
  readonly actorId: string;
  readonly ahora: Date;
}

/**
 * Construye el snapshot de valoración de una sesión CERRADA. Determinista y
 * PURO: no consulta nada, recibe recurso + tarifas ya cargados.
 */
export function valorarSesion(input: ValorarInput): Result<Valoracion, KernelError> {
  const s = input.sesion;
  const base = {
    tenantId: s.tenantId,
    sesionId: s.sesionId,
    ordenId: s.ordenId,
    activoId: s.activoId,
    identityId: s.identityId,
    efectivoMs: s.efectivoMs,
    iniciadoAt: s.iniciadoAt,
    cerradoAt: s.cerradoAt,
    valoradoAt: input.ahora,
    valoradoPor: input.actorId,
  };

  // Sin recurso: hecho operacional preservado, costo NULL (§15).
  if (!input.recurso) {
    return ok(
      Object.freeze({
        ...base,
        categoriaClave: null,
        tarifaId: null,
        tarifaValor: null,
        moneda: null,
        unidad: null,
        costo: null,
        estado: "SIN_RECURSO" as EstadoValoracion,
        vigenciaDesde: null,
        vigenciaHasta: null,
        cruzaPeriodos: false,
      }),
    );
  }

  // Política de vigencia (§16): tarifa vigente en iniciadoAt.
  const tarifa = tarifaVigenteEn(input.tarifas, s.iniciadoAt);
  if (!tarifa) {
    return ok(
      Object.freeze({
        ...base,
        categoriaClave: input.recurso.categoriaClave,
        tarifaId: null,
        tarifaValor: null,
        moneda: null,
        unidad: null,
        costo: null,
        estado: "SIN_TARIFA" as EstadoValoracion,
        vigenciaDesde: null,
        vigenciaHasta: null,
        cruzaPeriodos: false,
      }),
    );
  }

  const costo = calcularCosto(s.efectivoMs, tarifa.valor);
  if (!costo.ok) return costo;
  return ok(
    Object.freeze({
      ...base,
      categoriaClave: input.recurso.categoriaClave,
      tarifaId: tarifa.id,
      tarifaValor: tarifa.valor,
      moneda: tarifa.moneda,
      unidad: tarifa.unidad,
      costo: costo.value,
      estado: "VALORADA" as EstadoValoracion,
      vigenciaDesde: tarifa.vigenciaDesde,
      vigenciaHasta: tarifa.vigenciaHasta,
      cruzaPeriodos: cruzaPeriodos(input.tarifas, s.iniciadoAt, s.cerradoAt),
    }),
  );
}

/** ¿Puede revalorarse? Sólo SIN_TARIFA/SIN_RECURSO (VALORADA es inmutable). */
export function esRevalorable(v: Valoracion): Result<void, KernelError> {
  if (v.estado === "VALORADA") {
    return fail(KernelErrors.conflict(`La valoración ${v.sesionId} está VALORADA y es inmutable (histórico intacto)`));
  }
  if (!ESTADOS_REVALORABLES.includes(v.estado)) {
    return fail(KernelErrors.conflict(`Estado no revalorable: ${v.estado}`));
  }
  return ok(undefined);
}

/**
 * Costo ESTIMADO de una sesión ABIERTA (§14/§29): duraciones actuales × tarifa
 * vigente en iniciadoAt. NUNCA es costo final; sin tarifa ⇒ sinTarifa=true (jamás
 * $0). No se persiste como valoración.
 */
export interface CostoEstimado {
  readonly sesionId: string;
  readonly efectivoMs: number;
  readonly estimado: true;
  readonly sinTarifa: boolean;
  readonly tarifaValor: Dinero | null;
  readonly moneda: string | null;
  readonly unidad: UnidadTarifa | null;
  readonly costo: Dinero | null;
}

export function costoEstimado(
  sesion: { sesionId: string; efectivoMs: number; iniciadoAt: Date },
  tarifas: readonly Tarifa[],
): Result<CostoEstimado, KernelError> {
  const tarifa = tarifaVigenteEn(tarifas, sesion.iniciadoAt);
  if (!tarifa) {
    return ok({
      sesionId: sesion.sesionId,
      efectivoMs: sesion.efectivoMs,
      estimado: true,
      sinTarifa: true,
      tarifaValor: null,
      moneda: null,
      unidad: null,
      costo: null,
    });
  }
  const costo = calcularCosto(sesion.efectivoMs, tarifa.valor);
  if (!costo.ok) return costo;
  return ok({
    sesionId: sesion.sesionId,
    efectivoMs: sesion.efectivoMs,
    estimado: true,
    sinTarifa: false,
    tarifaValor: tarifa.valor,
    moneda: tarifa.moneda,
    unidad: tarifa.unidad,
    costo: costo.value,
  });
}
