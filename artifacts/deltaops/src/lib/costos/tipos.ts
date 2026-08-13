/**
 * DGP-021.3 · Tipos de LECTURA de la composición de costos.
 *
 * Estos tipos ESPEJAN el contrato del backend (`GET /composicion/ot|activo`). El
 * DINERO viaja SIEMPRE como CADENA decimal exacta (punto fijo numeric(18,6)); el
 * frontend NUNCA lo convierte a `number` ni lo recalcula: sólo lo FORMATEA.
 */

/** Estado de un componente o del agregado (§8). Nunca $0 para ausencia (§4). */
export type EstadoCosto =
  | "COMPLETO"
  | "PARCIAL"
  | "SIN_DATOS_SUFICIENTES"
  | "PENDIENTE"
  | "NO_APLICA";

/** Total económico de UNA moneda (series separadas; nunca se mezclan, §6). */
export interface TotalMoneda {
  readonly moneda: string;
  /** Neto = cargos − abonos, CADENA decimal exacta. */
  readonly total: string;
  readonly cargos: string;
  readonly abonos: string;
  /** Nº de hechos que aportan a esta moneda. */
  readonly componentes: number;
}

/** Evidencia individual (hecho/valoración) que respalda un componente (§18). */
export interface Evidencia {
  readonly fuente?: string;
  readonly origen?: string;
  readonly tipo?: string;
  readonly moneda?: string;
  readonly valor?: string;
  readonly naturaleza?: "CARGO" | "ABONO";
  readonly cuando?: string;
  readonly quien?: string;
  readonly costoId?: string;
  readonly sesionId?: string;
  readonly movimientoId?: string;
  readonly articuloId?: string;
  readonly identityId?: string;
  readonly estado?: string;
  readonly [k: string]: unknown;
}

/** Pendiente de materialización o de valoración (jamás se asume $0). */
export interface Pendiente {
  readonly fuente?: string;
  readonly movimientoId?: string;
  readonly sesionId?: string;
  readonly articuloId?: string;
  readonly moneda?: string;
  readonly cantidad?: string;
  readonly unidad?: string;
  readonly motivo?: string;
  readonly estado?: string;
  readonly cuando?: string;
  readonly [k: string]: unknown;
}

/** Componente económico (mano de obra / materiales / otros). */
export interface Componente {
  readonly tipo: "MANO_OBRA" | "MATERIALES" | "OTROS";
  readonly estado: EstadoCosto;
  readonly porMoneda: readonly TotalMoneda[];
  readonly evidencia?: readonly Evidencia[];
  readonly pendientes?: readonly Pendiente[];
}

/** Un tanqueo individual con su valor de ORIGEN tal cual (sin agregar). */
export interface EventoCombustible {
  readonly tanqueoId?: string | null;
  readonly cuando?: string | null;
  readonly moneda?: string | null;
  /** Valor de ORIGEN de ESTE tanqueo (float del módulo 019), como cadena; no es un total. */
  readonly costoOrigen?: string | null;
  /** Litros de ESTE tanqueo, como cadena; magnitud física de origen, no agregada. */
  readonly litros?: string | null;
}

/**
 * Combustible del activo (CONTEXTUAL) — SEPARADO del total económico.
 *
 * DGP-021.3 R1 (§26): esta fase NO expone NINGÚN agregado monetario de combustible
 * (GAP-FUEL-MONEY: el dinero de origen es float en la serie 019, congelado). No hay
 * `porMoneda`/`costoOrigen` sumado. Sólo se exponen conteos ENTEROS de tanqueos y los
 * valores de origen POR tanqueo (`eventos`), estrictamente contextuales y no-exactos.
 */
export interface CombustibleActivo {
  readonly tipo?: string;
  readonly estado: "CONTEXTUAL" | "SIN_DATOS_SUFICIENTES" | "NO_APLICA";
  readonly atribuibleAOt?: string;
  readonly precisionOrigen?: string;
  /** Marca del GAP declarado: sin totales monetarios de combustible en esta fase. */
  readonly gapMoneda?: string;
  readonly tanqueos?: number;
  readonly tanqueosConCosto?: number;
  readonly tanqueosSinCosto?: number;
  /** Desglose por moneda = SOLO conteo entero de tanqueos (sin dinero). */
  readonly conteoPorMoneda?: readonly { moneda: string; tanqueos: number }[];
  /** Tanqueos individuales con su valor de origen (sin sumar). */
  readonly eventos?: readonly EventoCombustible[];
  readonly nota?: string;
}

/** Combustible en la OT (SIEMPRE NO_APLICA). */
export interface CombustibleOt {
  readonly tipo?: string;
  readonly estado: "NO_APLICA";
  readonly atribuibleAOt?: string;
  readonly porMoneda?: readonly TotalMoneda[];
  readonly nota?: string;
}

export interface RangoResuelto {
  readonly desde: string | null;
  readonly hasta: string | null;
}

/** Composición de costos de una OT. */
export interface ComposicionOt {
  readonly ot: string;
  readonly periodo: string;
  readonly rango: RangoResuelto;
  readonly estado: EstadoCosto;
  readonly componentes: {
    readonly manoObra: Componente;
    readonly materiales: Componente;
    readonly otros: Componente;
    readonly combustible: CombustibleOt;
  };
  readonly totalesPorMoneda: readonly TotalMoneda[];
  readonly pendientesMaterializacion: readonly Pendiente[];
}

/** Composición de costos de un activo (con combustible contextual). */
export interface ComposicionActivo {
  readonly activo: string;
  readonly periodo: string;
  readonly rango: RangoResuelto;
  readonly estado: EstadoCosto;
  readonly componentes: {
    readonly manoObra: Componente;
    readonly materiales: Componente;
    readonly otros: Componente;
    readonly combustible: CombustibleActivo;
  };
  readonly totalesPorMoneda: readonly TotalMoneda[];
  readonly costoPorHora: { readonly estado: string; readonly nota?: string };
  readonly costoPorKm: { readonly estado: string; readonly nota?: string };
}
