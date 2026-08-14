/**
 * DGP-020.3 · Tipos del módulo Fundación de Mano de Obra (frontend).
 *
 * Espejo EXACTO del contrato OpenAPI (`lib/module-manodeobra/openapi/…`). El
 * frontend NUNCA envía horas ni costo como autoridad (§13): el tiempo efectivo
 * proviene de las sesiones de DGP-020.2 y el backend deriva costo/tarifa.
 */

/**
 * Estado de valoración de una sesión. `PENDIENTE` = sesión CERRADA con horas
 * efectivas pero AÚN sin snapshot de valoración. `EN_CURSO` = sesión ABIERTA/
 * PAUSADA con horas acumuladas (trabajo activo). Ambos aparecen sólo en la hoja
 * de vida por activo: horas sin costo ≠ sin datos (DGP-020.3 fix).
 */
export type EstadoValoracion = "VALORADA" | "SIN_TARIFA" | "SIN_RECURSO" | "PENDIENTE" | "EN_CURSO";

/** Estado operacional de un recurso humano. */
export type EstadoRecurso = "ACTIVO" | "INACTIVO";

/** Estado de una versión de tarifa. */
export type EstadoTarifa = "VIGENTE" | "CERRADA";

/** Sujeto sobre el que aplica una tarifa (hoy sólo CATEGORIA). */
export type SujetoTarifa = "CATEGORIA" | "IDENTIDAD";

/** Unidad de tarifa soportada en esta fase. */
export type UnidadTarifa = "HORA";

/** Opción del catálogo de categorías de mano de obra. */
export interface OpcionCategoria {
  readonly value: string;
  readonly label: string;
  readonly habilitado?: boolean;
  readonly canonica?: boolean;
}

/** Respuesta del catálogo (categorías + unidades soportadas). */
export interface OpcionesCatalogo {
  readonly catalogo: string;
  readonly opciones: readonly OpcionCategoria[];
  readonly unidades: readonly UnidadTarifa[];
}

/** Recurso humano de mantenimiento (identidad canónica → categoría + estado). */
export interface Recurso {
  readonly identityId: string;
  readonly nombre?: string | null;
  readonly categoriaClave: string;
  readonly estado: EstadoRecurso;
  readonly creadoAt?: string;
  readonly actualizadoAt?: string;
}

/** Una versión de tarifa (histórico versionado, no se sobreescribe). */
export interface Tarifa {
  readonly id: string;
  readonly sujetoTipo?: string;
  readonly sujetoId: string;
  /** DINERO en PUNTO FIJO: CADENA decimal exacta (numeric(18,6)), nunca number. */
  readonly valor: string;
  readonly moneda: string;
  readonly unidad: UnidadTarifa;
  readonly vigenciaDesde?: string;
  readonly vigenciaHasta?: string | null;
  readonly estado: EstadoTarifa;
  readonly valorAnterior?: string | null;
  readonly motivo?: string | null;
}

/** Valoración (snapshot inmutable) de una sesión cerrada. */
export interface Valoracion {
  readonly sesionId: string;
  readonly ordenId: string;
  readonly activoId?: string | null;
  readonly identityId: string;
  readonly categoriaClave?: string | null;
  readonly tarifaId?: string | null;
  /** DINERO en PUNTO FIJO: CADENA decimal exacta (numeric(18,6)), nunca number. */
  readonly tarifaValor?: string | null;
  readonly moneda?: string | null;
  readonly unidad?: string | null;
  readonly efectivoMs: number;
  /** DINERO en PUNTO FIJO: CADENA decimal exacta (numeric(18,6)), nunca number. */
  readonly costo?: string | null;
  readonly estado: EstadoValoracion;
  readonly cruzaPeriodos?: boolean;
  readonly iniciadoAt?: string;
  readonly cerradoAt?: string | null;
  readonly valoradoAt?: string;
  /** Nombre de presentación resuelto por backend (algunas rutas lo adjuntan). */
  readonly nombre?: string | null;
}

/** Sesión cerrada aún sin valoración (red de seguridad de orquestación). */
export interface Pendiente {
  readonly sesionId: string;
  readonly ordenId: string;
  readonly identityId: string;
  readonly efectivoMs?: number;
  readonly cerradoAt?: string | null;
  readonly nombre?: string | null;
}

/** Costo estimado de una sesión en curso (nunca $0 sin tarifa). */
export interface CostoEstimado {
  readonly sesionId: string;
  readonly estimado: boolean;
  readonly sinTarifa: boolean;
  /** DINERO en PUNTO FIJO: CADENA decimal exacta (numeric(18,6)), nunca number. */
  readonly costo?: string | null;
  readonly moneda?: string | null;
  readonly efectivoMs?: number;
}

/** Costo agregado por moneda (el resumen puede mezclar monedas históricas). */
export interface CostoPorMoneda {
  readonly moneda: string;
  /** DINERO en PUNTO FIJO: CADENA decimal exacta (numeric(18,6)), nunca number. */
  readonly costo: string;
}

/** Resumen de mano de obra de una OT (agregado + pendientes). */
export interface Resumen {
  readonly ordenId: string;
  readonly efectivoMsTotal?: number;
  readonly costoPorMoneda?: readonly CostoPorMoneda[];
  readonly valoraciones?: readonly Valoracion[];
  readonly pendientes?: readonly Pendiente[];
}

/** Resultado genérico de comando idempotente. */
export interface ResultadoComando {
  readonly ok?: boolean;
  readonly idempotente?: boolean;
}
