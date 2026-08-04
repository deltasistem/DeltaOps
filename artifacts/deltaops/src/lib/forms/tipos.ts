/**
 * DGP-008.3 · Renderer de Dynamic Forms — tipos de apoyo.
 *
 * El renderer interpreta una `DefinicionFormulario` del Dynamic Forms Engine
 * (lib/dynamic-forms) usando EXCLUSIVAMENTE componentes de formulario del DS.
 * Las reglas condicionales por campo se aportan como un mapa por clave.
 */
import type { ReglasCampo } from "@workspace/dynamic-forms/condiciones";
import type { DefinicionFormulario } from "@workspace/dynamic-forms/definicion";

export type ValoresFormulario = Record<string, unknown>;

/** Reglas condicionales indexadas por clave de campo. */
export type MapaReglas = Record<string, ReglasCampo>;

export interface HallazgoCampo {
  readonly campo: string;
  readonly mensaje: string;
  readonly severidad: "error" | "advertencia" | "bloqueo";
}

export interface PlantillaActivo {
  readonly definicion: DefinicionFormulario;
  readonly reglas?: MapaReglas;
}
