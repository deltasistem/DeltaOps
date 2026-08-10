/**
 * DGP-016 · Filtros globales reutilizables — serialización ruta→filtro (deep
 * links). Los filtros globales de un dashboard/indicador se persisten en la URL
 * (querystring) para que un enlace reproduzca exactamente el mismo estado.
 *
 * Cada dimensión canónica se codifica como un parámetro de query. Al construir
 * el cuerpo de `evaluar`, las dimensiones simples se traducen a filtros con
 * operador de igualdad (`eq`); `fecha`/`rango` se traducen a operadores de
 * comparación temporal que el backend interpreta por ventana.
 */
import { DIMENSIONES_FILTRO, type DimensionFiltro } from "./constantes";
import type { Filtro } from "./tipos";

/** Estado plano de los filtros globales (dimensión → valor de texto). */
export type FiltrosGlobales = Partial<Record<DimensionFiltro, string>>;

/** Lee los filtros globales desde una querystring (`?activo=A1&estado=abierta`). */
export function leerFiltrosDeUrl(search: string): FiltrosGlobales {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: FiltrosGlobales = {};
  for (const dim of DIMENSIONES_FILTRO) {
    const v = params.get(dim);
    if (v !== null && v !== "") out[dim] = v;
  }
  return out;
}

/**
 * Serializa los filtros globales a una querystring estable (orden canónico de
 * dimensiones) para que los deep links sean deterministas. Preserva parámetros
 * ajenos (p.ej. `tab`) presentes en `searchActual`.
 */
export function escribirFiltrosEnUrl(filtros: FiltrosGlobales, searchActual = ""): string {
  const params = new URLSearchParams(searchActual.startsWith("?") ? searchActual.slice(1) : searchActual);
  for (const dim of DIMENSIONES_FILTRO) params.delete(dim);
  for (const dim of DIMENSIONES_FILTRO) {
    const v = filtros[dim];
    if (v !== undefined && v !== "") params.set(dim, v);
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

/** Cuenta cuántas dimensiones tienen valor (para badges "N filtros"). */
export function contarFiltros(filtros: FiltrosGlobales): number {
  return DIMENSIONES_FILTRO.reduce((n, dim) => (filtros[dim] ? n + 1 : n), 0);
}

/**
 * Traduce los filtros globales a filtros del contrato (`{dimension, campo,
 * operador, valor}`) que viajan en el cuerpo de `evaluar`. Las dimensiones
 * simples usan igualdad; `fecha` es un límite inferior (`gte`) y `rango`
 * codifica `desde|hasta` como dos filtros (`gte`/`lte`).
 */
export function aFiltrosContrato(filtros: FiltrosGlobales): Filtro[] {
  const out: Filtro[] = [];
  for (const dim of DIMENSIONES_FILTRO) {
    const v = filtros[dim];
    if (v === undefined || v === "") continue;
    if (dim === "fecha") {
      out.push({ dimension: "fecha", campo: "fecha", operador: "gte", valor: v });
      continue;
    }
    if (dim === "rango") {
      const [desde, hasta] = v.split("|");
      if (desde) out.push({ dimension: "fecha", campo: "fecha", operador: "gte", valor: desde });
      if (hasta) out.push({ dimension: "fecha", campo: "fecha", operador: "lte", valor: hasta });
      continue;
    }
    out.push({ dimension: dim, campo: dim, operador: "eq", valor: v });
  }
  return out;
}

/**
 * Combina los filtros globales con los de un widget (definidos en la
 * configuración del dashboard). Los del widget se anteponen; ambos se aplican.
 */
export function combinarFiltros(globales: FiltrosGlobales, widget: readonly Filtro[]): Filtro[] {
  return [...widget, ...aFiltrosContrato(globales)];
}
