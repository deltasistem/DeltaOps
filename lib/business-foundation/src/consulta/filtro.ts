/**
 * DGP-006 · Business Foundation Framework — Generic Filter Runtime.
 *
 * A partir de los campos filtrables de una DefinicionEntidad deriva una
 * DefinicionFiltro (metadatos) y un esquema Zod que valida expresiones de
 * filtro declarativas y serializables. Las expresiones se pueden combinar con
 * `y`/`o`, se aplican en memoria sobre el `data` de los registros (útil para
 * read models fake / listados) y se serializan de forma estable para usarlas
 * como query params (Offline First / cacheo de consultas).
 *
 * 100% neutro: sin ningún concepto de negocio.
 */
import { z } from "zod";
import type { DefinicionCampo, DefinicionEntidad, TipoCampo } from "../nucleo/definicion";

/* ----------------------------- Operadores -------------------------------- */

export const OPERADORES_FILTRO = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contiene",
  "en",
  "entre",
] as const;

export type OperadorFiltro = (typeof OPERADORES_FILTRO)[number];

/** Metadato de un campo filtrable derivado de la definición de la entidad. */
export interface CampoFiltrable {
  readonly nombre: string;
  readonly tipo: TipoCampo;
  readonly operadores: readonly OperadorFiltro[];
}

/** Definición de filtro derivada de los campos filtrables de una entidad. */
export interface DefinicionFiltro {
  readonly entidad: string;
  readonly campos: readonly CampoFiltrable[];
}

/* -------- Expresiones de filtro (árbol) — serializables y puras ---------- */

/** Comparación atómica sobre un campo. */
export interface Comparacion {
  readonly campo: string;
  readonly operador: OperadorFiltro;
  readonly valor: unknown;
}

export interface CombinacionY {
  readonly y: readonly ExpresionFiltro[];
}
export interface CombinacionO {
  readonly o: readonly ExpresionFiltro[];
}

/** Árbol de filtro: hoja (Comparacion) o combinación (y/o). */
export type ExpresionFiltro = Comparacion | CombinacionY | CombinacionO;

/* ------------------------- Operadores por tipo --------------------------- */

const ORDENABLES: readonly OperadorFiltro[] = ["eq", "neq", "gt", "gte", "lt", "lte", "en", "entre"];
const TEXTUALES: readonly OperadorFiltro[] = ["eq", "neq", "contiene", "en"];
const IGUALDAD: readonly OperadorFiltro[] = ["eq", "neq", "en"];

function operadoresDe(campo: DefinicionCampo): readonly OperadorFiltro[] {
  switch (campo.tipo) {
    case "numero":
    case "fecha":
      return ORDENABLES;
    case "texto":
      return TEXTUALES;
    case "enum":
    case "referencia":
    case "booleano":
    case "json":
      return IGUALDAD;
  }
}

/** Deriva la DefinicionFiltro de una entidad (solo campos `filtrable`). */
export function derivarDefinicionFiltro(def: DefinicionEntidad): DefinicionFiltro {
  const campos: CampoFiltrable[] = def.campos
    .filter((c) => c.filtrable)
    .map((c) => ({ nombre: c.nombre, tipo: c.tipo, operadores: operadoresDe(c) }));
  return { entidad: def.nombre, campos };
}

/* ---------------------------- Validador Zod ------------------------------ */

/** Valor escalar admisible como operando de un filtro (serializable). */
const escalarSchema = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Construye un esquema Zod que valida expresiones de filtro contra la
 * DefinicionFiltro: campo permitido, operador válido para el campo, y forma
 * del `valor` acorde al operador (`en` → arreglo, `entre` → tupla de 2).
 */
export function esquemaFiltro(definicion: DefinicionFiltro): z.ZodType<ExpresionFiltro> {
  const porCampo = new Map(definicion.campos.map((c) => [c.nombre, c]));

  const comparacion = z
    .object({
      campo: z.string(),
      operador: z.enum(OPERADORES_FILTRO),
      valor: z.unknown(),
    })
    .superRefine((val, ctx) => {
      const meta = porCampo.get(val.campo);
      if (!meta) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Campo no filtrable: ${val.campo}` });
        return;
      }
      if (!meta.operadores.includes(val.operador)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Operador "${val.operador}" no permitido para el campo "${val.campo}"`,
        });
        return;
      }
      if (val.operador === "en") {
        if (!Array.isArray(val.valor) || val.valor.length === 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El operador "en" requiere un arreglo no vacío` });
        }
      } else if (val.operador === "entre") {
        if (!Array.isArray(val.valor) || val.valor.length !== 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El operador "entre" requiere una tupla de 2 valores` });
        }
      } else if (Array.isArray(val.valor)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `El operador "${val.operador}" no admite arreglos` });
      }
    });

  const expr: z.ZodType<ExpresionFiltro> = z.lazy(() =>
    z.union([
      comparacion,
      z.object({ y: z.array(expr).min(1) }),
      z.object({ o: z.array(expr).min(1) }),
    ]),
  ) as z.ZodType<ExpresionFiltro>;

  return expr;
}

/**
 * Parsea/valida una expresión (desconocida) contra la definición. Devuelve la
 * expresión tipada o lanza el ZodError (que la capa de comando convierte en
 * KernelError de validación). Se ofrece también `safe` para uso en memoria.
 */
export function parsearFiltro(definicion: DefinicionFiltro, entrada: unknown): ExpresionFiltro {
  return esquemaFiltro(definicion).parse(entrada);
}

export function parsearFiltroSafe(
  definicion: DefinicionFiltro,
  entrada: unknown,
): z.SafeParseReturnType<unknown, ExpresionFiltro> {
  return esquemaFiltro(definicion).safeParse(entrada);
}

/* --------------------------- Aplicación en memoria ------------------------ */

function esComparacion(e: ExpresionFiltro): e is Comparacion {
  return (e as Comparacion).operador !== undefined;
}
function esY(e: ExpresionFiltro): e is CombinacionY {
  return Array.isArray((e as CombinacionY).y);
}

function comparar(op: OperadorFiltro, actual: unknown, esperado: unknown): boolean {
  switch (op) {
    case "eq":
      return actual === esperado;
    case "neq":
      return actual !== esperado;
    case "gt":
      return (actual as number) > (esperado as number);
    case "gte":
      return (actual as number) >= (esperado as number);
    case "lt":
      return (actual as number) < (esperado as number);
    case "lte":
      return (actual as number) <= (esperado as number);
    case "contiene":
      return String(actual ?? "")
        .toLowerCase()
        .includes(String(esperado ?? "").toLowerCase());
    case "en":
      return Array.isArray(esperado) && esperado.includes(actual);
    case "entre": {
      if (!Array.isArray(esperado) || esperado.length !== 2) return false;
      const [min, max] = esperado as [number, number];
      return (actual as number) >= min && (actual as number) <= max;
    }
  }
}

/** Evalúa una expresión de filtro sobre el `data` de un registro (puro). */
export function evaluarFiltro(expr: ExpresionFiltro, data: Record<string, unknown>): boolean {
  if (esComparacion(expr)) return comparar(expr.operador, data[expr.campo], expr.valor);
  if (esY(expr)) return expr.y.every((e) => evaluarFiltro(e, data));
  return expr.o.some((e) => evaluarFiltro(e, data));
}

/** Aplica un filtro a una colección de registros (con `data`) en memoria. */
export function aplicarFiltro<T extends { readonly data: Record<string, unknown> }>(
  expr: ExpresionFiltro | undefined,
  registros: readonly T[],
): T[] {
  if (!expr) return [...registros];
  return registros.filter((r) => evaluarFiltro(expr, r.data));
}

/* ------------------------ Serialización estable --------------------------- */

/**
 * Serializa una expresión a un string ESTABLE (claves ordenadas, arreglos
 * `y`/`o` conservan orden). Estable ⇒ misma expresión ⇒ mismo string, apto
 * como query param y como clave de caché.
 */
export function serializarFiltro(expr: ExpresionFiltro): string {
  return JSON.stringify(normalizar(expr));
}

function normalizar(expr: ExpresionFiltro): unknown {
  if (esComparacion(expr)) {
    return { campo: expr.campo, operador: expr.operador, valor: expr.valor };
  }
  if (esY(expr)) return { y: expr.y.map(normalizar) };
  return { o: expr.o.map(normalizar) };
}

/** Deserializa un string de query param a una expresión validada. */
export function deserializarFiltro(definicion: DefinicionFiltro, texto: string): ExpresionFiltro {
  return parsearFiltro(definicion, JSON.parse(texto));
}
