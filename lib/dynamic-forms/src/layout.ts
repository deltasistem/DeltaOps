/**
 * DGP-007 · Dynamic Forms Engine — Dynamic Layout Runtime.
 *
 * Layout DECLARATIVO por breakpoint (escritorio/tableta/movil). Solo DATOS que
 * la UI interpretará: columnas de la rejilla, orden y ancho por campo. No hay
 * CSS ni presentación — el motor es agnóstico a React. Se derivan defaults
 * sensatos a partir de la estructura de la definición.
 */
import { camposHoja, type DefinicionFormulario } from "./definicion";

export type Breakpoint = "escritorio" | "tableta" | "movil";

/** Ubicación de un campo dentro de la rejilla de un breakpoint. */
export interface UbicacionCampo {
  readonly clave: string;
  /** Orden relativo dentro del breakpoint (menor primero). */
  readonly orden: number;
  /** Nº de columnas de la rejilla que ocupa el campo. */
  readonly ancho: number;
}

/** Layout de un breakpoint concreto. */
export interface LayoutBreakpoint {
  /** Nº total de columnas de la rejilla. */
  readonly columnas: number;
  readonly campos: readonly UbicacionCampo[];
}

/** Layout completo del formulario (uno por breakpoint). */
export interface LayoutFormulario {
  readonly escritorio: LayoutBreakpoint;
  readonly tableta: LayoutBreakpoint;
  readonly movil: LayoutBreakpoint;
}

const COLUMNAS_DEFECTO: Record<Breakpoint, number> = {
  escritorio: 12,
  tableta: 8,
  movil: 4,
};

/** Ancho por defecto de un campo según el breakpoint (fracción de la rejilla). */
function anchoDefecto(bp: Breakpoint): number {
  switch (bp) {
    case "escritorio":
      return 6; // media fila (2 campos por fila)
    case "tableta":
      return 8; // fila completa
    case "movil":
      return 4; // fila completa
  }
}

function layoutBreakpointDefecto(
  def: DefinicionFormulario,
  bp: Breakpoint,
): LayoutBreakpoint {
  const campos = camposHoja(def).map((c, i) => ({
    clave: c.clave,
    orden: i,
    // Los campos "grandes" ocupan fila completa en escritorio.
    ancho:
      bp === "escritorio" &&
      (c.tipo === "tabla" || c.tipo === "firma" || c.tipo === "checklist")
        ? COLUMNAS_DEFECTO.escritorio
        : anchoDefecto(bp),
  }));
  return { columnas: COLUMNAS_DEFECTO[bp], campos };
}

/** Deriva un layout por defecto sensato a partir de la estructura del formulario. */
export function layoutPorDefecto(def: DefinicionFormulario): LayoutFormulario {
  return {
    escritorio: layoutBreakpointDefecto(def, "escritorio"),
    tableta: layoutBreakpointDefecto(def, "tableta"),
    movil: layoutBreakpointDefecto(def, "movil"),
  };
}

/**
 * Fusiona overrides declarativos parciales sobre el layout por defecto. Cada
 * breakpoint puede redefinir columnas y ajustar (por clave) orden/ancho de
 * campos concretos, dejando el resto con sus defaults.
 */
export interface OverrideCampo {
  readonly clave: string;
  readonly orden?: number;
  readonly ancho?: number;
}

export type OverridesLayout = {
  readonly [K in Breakpoint]?: {
    readonly columnas?: number;
    readonly campos?: readonly OverrideCampo[];
  };
};

function aplicarOverrideBp(
  base: LayoutBreakpoint,
  override?: OverridesLayout[Breakpoint],
): LayoutBreakpoint {
  if (!override) return base;
  const porClave = new Map(base.campos.map((c) => [c.clave, c]));
  for (const ov of override.campos ?? []) {
    const actual = porClave.get(ov.clave);
    if (!actual) continue;
    porClave.set(ov.clave, {
      clave: ov.clave,
      orden: ov.orden ?? actual.orden,
      ancho: ov.ancho ?? actual.ancho,
    });
  }
  const campos = [...porClave.values()].sort((a, b) => a.orden - b.orden);
  return { columnas: override.columnas ?? base.columnas, campos };
}

/** Construye el layout final combinando el default con overrides declarativos. */
export function resolverLayout(
  def: DefinicionFormulario,
  overrides: OverridesLayout = {},
): LayoutFormulario {
  const base = layoutPorDefecto(def);
  return {
    escritorio: aplicarOverrideBp(base.escritorio, overrides.escritorio),
    tableta: aplicarOverrideBp(base.tableta, overrides.tableta),
    movil: aplicarOverrideBp(base.movil, overrides.movil),
  };
}
