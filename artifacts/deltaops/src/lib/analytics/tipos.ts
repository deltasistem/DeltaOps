/**
 * DGP-016 · Tipos del frontend Analytics — reflejan las formas de lectura del
 * módulo (indicadores/dashboards/snapshots/evaluación). Son declaraciones de
 * PRESENTACIÓN; la autoridad de las formas es el backend.
 */
import type { TipoWidget } from "./constantes";

/** Filtro reutilizable (dimensión canónica + operador + valor). */
export interface Filtro {
  readonly dimension: string;
  readonly campo?: string | null;
  readonly operador: string;
  readonly valor: unknown;
}

export interface Umbrales {
  readonly mayorEsMejor: boolean;
  readonly bueno: number;
  readonly alerta: number;
  readonly critico: number;
}

export interface MetaPeriodo {
  readonly periodo: string;
  readonly valor: number;
}

export interface FuenteDeclarativa {
  readonly modulo: string;
  readonly dataset: string;
}

export interface Expresion {
  readonly tipo: string;
  readonly campo?: string | null;
  readonly filtros: readonly Filtro[];
  readonly filtrosDenominador?: readonly Filtro[];
  readonly factor?: number | null;
  readonly ventana?: {
    readonly campoFecha: string;
    readonly ultimosDias?: number | null;
    readonly desde?: string | null;
    readonly hasta?: string | null;
  } | null;
  readonly agrupadores?: readonly string[];
}

/** Definición declarativa de un indicador (read model). */
export interface Indicador {
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly categoria: string;
  readonly fuente: FuenteDeclarativa;
  readonly expresion: Expresion;
  readonly unidad: string;
  readonly formato: string;
  readonly umbrales?: Umbrales | null;
  readonly metas?: readonly MetaPeriodo[];
  readonly habilitado?: boolean;
  readonly version?: number;
  readonly delSistema?: boolean;
}

/** Configuración de ranking de un widget. */
export interface RankingWidget {
  readonly modo: "topN" | "bottomN";
  readonly n: number;
}

/** Widget declarativo de un dashboard. */
export interface Widget {
  readonly id: string;
  readonly tipo: TipoWidget;
  readonly titulo: string;
  readonly indicadorClave: string;
  readonly filtros: readonly Filtro[];
  readonly presentacion: Record<string, unknown>;
  readonly ranking?: RankingWidget | null;
  readonly posicion: number;
}

/** Dashboard declarativo (read model). */
export interface Dashboard {
  readonly id: string;
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly widgets: readonly Widget[];
  readonly delSistema: boolean;
  readonly propietarioId?: string | null;
  readonly version?: number;
}

/** Grupo de una evaluación (serie por agrupador). */
export interface GrupoEvaluacion {
  readonly clave: string;
  readonly valor: number;
  readonly muestras: number;
}

/** Resultado de POST /indicadores/:clave/evaluar. */
export interface Evaluacion {
  readonly clave: string;
  readonly unidad?: string;
  readonly formato?: string;
  readonly valor: number;
  readonly muestras: number;
  readonly grupos: readonly GrupoEvaluacion[];
  readonly semaforo: "bueno" | "alerta" | "critico" | null;
  readonly cumplimiento: number | null;
  readonly evaluadoEn: string;
}

/** Snapshot histórico de un indicador. */
export interface Snapshot {
  readonly id: string;
  readonly targetClave: string;
  readonly resultado: { valor: number; muestras: number };
  readonly evaluadoEn: string;
  readonly filtros?: readonly Filtro[];
}

/** Opción de un catálogo del tenant. */
export interface OpcionCatalogo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly padre?: string | null;
}
