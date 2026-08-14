/**
 * DGP-LITE-04 · Tipos de presentación del PREOPERACIONAL. Espejo de las formas
 * que devuelve la superficie HTTP (backend-autoritativa). No duplican lógica.
 */
import type { EstadoItem, Veredicto } from "./constantes";

/** Ítem del checklist con su criticidad DECLARADA en la plantilla (versionada). */
export interface ItemPlantilla {
  readonly clave: string;
  readonly etiqueta: string;
  readonly obligatorio?: boolean;
  readonly critico?: boolean;
  readonly categoria?: string;
  readonly evidenciasRequeridas?: readonly string[];
}

/** Plantilla de preoperacional resuelta (definición + checklist embebido). */
export interface PlantillaPreoperacional {
  readonly clave: string;
  readonly version: number;
  readonly titulo: string;
  readonly items: readonly ItemPlantilla[];
  readonly vigenciaDias?: number;
}

/** Estado local editable de un ítem (antes de mapear al contrato del motor). */
export interface RespuestaLocal {
  estado?: EstadoItem;
  comentario?: string;
  evidencias?: string[];
}

/** Incumplimiento/observación tal como lo SELLA el backend (procedencia). */
export interface IncumplimientoSellado {
  readonly clave: string;
  readonly etiqueta: string;
  readonly critico: boolean;
  readonly comentario?: string;
  readonly evidencias?: readonly string[];
}

/** Resultado del registro (veredicto sellado + procedencia del hallazgo). */
export interface ResultadoRegistro {
  readonly id: string;
  readonly respuestaId: string;
  readonly plantilla: { clave: string; version: number };
  readonly veredicto: Veredicto;
  readonly incumplimientos: readonly IncumplimientoSellado[];
  readonly observaciones: readonly IncumplimientoSellado[];
  readonly hayCriticoIncumplido: boolean;
  readonly idempotente: boolean;
}

/** Ejecución sellada (registro persistido). */
export interface EjecucionSellada {
  readonly id: string;
  readonly data: {
    readonly activoId: string;
    readonly plantillaClave: string;
    readonly plantillaVersion: number;
    readonly respuestaId: string;
    readonly veredicto: Veredicto;
    readonly incumplimientos: readonly IncumplimientoSellado[];
    readonly observaciones: readonly IncumplimientoSellado[];
    readonly selladoPor: string;
    readonly selladoAt: string;
    readonly contexto?: Record<string, unknown>;
  };
}
