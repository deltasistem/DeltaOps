/**
 * DGP-016 · Filtros REUTILIZABLES — modelo declarativo único.
 *
 * Un único modelo de filtro sirve a indicadores, widgets y snapshots. Un filtro
 * es una tripleta (campo, operador, valor) sobre las DIMENSIONES canónicas del
 * negocio. NO es un enum de negocio: la dimensión describe QUÉ atributo del hecho
 * se compara, de forma neutra y reutilizable por cualquier módulo futuro.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

/** Dimensiones canónicas sobre las que se filtra (neutras, reutilizables). */
export const DIMENSIONES = [
  "empresa",
  "proyecto",
  "activo",
  "ubicacion",
  "bodega",
  "categoria",
  "tipo",
  "estado",
  "prioridad",
  "responsable",
  "supervisor",
  "cuadrilla",
  "fecha",
  "rango",
  "tenant",
] as const;
export type Dimension = (typeof DIMENSIONES)[number];

/** Operadores declarativos soportados por el motor de filtrado. */
export const OPERADORES = [
  "eq",
  "neq",
  "in",
  "nin",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "contains",
  "exists",
] as const;
export type Operador = (typeof OPERADORES)[number];

export type ValorFiltro = string | number | boolean | null | readonly (string | number)[];

/** Filtro declarativo único, reutilizable en indicadores/widgets/snapshots. */
export interface Filtro {
  readonly dimension: Dimension;
  /** Campo del hecho a comparar. Si se omite, se usa la dimensión como campo. */
  readonly campo?: string | null;
  readonly operador: Operador;
  readonly valor: ValorFiltro;
}

const esDimension = (d: string): d is Dimension => (DIMENSIONES as readonly string[]).includes(d);
const esOperador = (o: string): o is Operador => (OPERADORES as readonly string[]).includes(o);

/** Construye un filtro validando dimensión/operador y coherencia del valor. */
export function crearFiltro(input: {
  dimension: string;
  campo?: string | null;
  operador: string;
  valor: ValorFiltro;
}): Result<Filtro, KernelError> {
  if (!esDimension(input.dimension)) {
    return fail(KernelErrors.validation(`Dimensión de filtro desconocida: "${input.dimension}"`));
  }
  if (!esOperador(input.operador)) {
    return fail(KernelErrors.validation(`Operador de filtro desconocido: "${input.operador}"`));
  }
  const listado = input.operador === "in" || input.operador === "nin" || input.operador === "between";
  if (listado && !Array.isArray(input.valor)) {
    return fail(KernelErrors.validation(`El operador "${input.operador}" requiere una lista de valores`));
  }
  if (input.operador === "between" && Array.isArray(input.valor) && input.valor.length !== 2) {
    return fail(KernelErrors.validation(`El operador "between" requiere exactamente 2 valores`));
  }
  return ok(
    Object.freeze({
      dimension: input.dimension,
      campo: input.campo ?? null,
      operador: input.operador,
      valor: Array.isArray(input.valor) ? Object.freeze([...input.valor]) : input.valor,
    }),
  );
}

/** Un hecho (fila) es un mapa neutro campo→valor. */
export type Hecho = Record<string, unknown>;

function leerCampo(hecho: Hecho, filtro: Filtro): unknown {
  const campo = filtro.campo ?? filtro.dimension;
  return hecho[campo];
}

function comparableNumero(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  // Fechas ISO → epoch para comparación temporal.
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/** Evalúa un ÚNICO filtro contra un hecho (puro y determinista). */
export function evaluarFiltro(hecho: Hecho, filtro: Filtro): boolean {
  const actual = leerCampo(hecho, filtro);
  const v = filtro.valor;
  switch (filtro.operador) {
    case "eq":
      return actual === v;
    case "neq":
      return actual !== v;
    case "in":
      return Array.isArray(v) && (v as readonly unknown[]).includes(actual as never);
    case "nin":
      return Array.isArray(v) && !(v as readonly unknown[]).includes(actual as never);
    case "exists": {
      const existe = actual !== undefined && actual !== null;
      return v === false ? !existe : existe;
    }
    case "contains":
      return typeof actual === "string" && typeof v === "string" && actual.includes(v);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = comparableNumero(actual);
      const b = comparableNumero(v as unknown);
      if (a === null || b === null) return false;
      if (filtro.operador === "gt") return a > b;
      if (filtro.operador === "gte") return a >= b;
      if (filtro.operador === "lt") return a < b;
      return a <= b;
    }
    case "between": {
      if (!Array.isArray(v)) return false;
      const a = comparableNumero(actual);
      const lo = comparableNumero(v[0]);
      const hi = comparableNumero(v[1]);
      if (a === null || lo === null || hi === null) return false;
      return a >= lo && a <= hi;
    }
    default:
      return false;
  }
}

/** Aplica un conjunto de filtros (AND) a una serie de hechos. */
export function aplicarFiltros(hechos: readonly Hecho[], filtros: readonly Filtro[]): Hecho[] {
  if (filtros.length === 0) return [...hechos];
  return hechos.filter((h) => filtros.every((f) => evaluarFiltro(h, f)));
}
