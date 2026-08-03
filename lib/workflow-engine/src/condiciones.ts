/**
 * DGP-007 · Workflow & Dynamic Forms Engine — Motor de condiciones declarativo.
 *
 * Expresiones JSON tipadas evaluables sobre el payload (`data`) de una instancia
 * de workflow. NUNCA se ejecuta código arbitrario: solo hay operadores cerrados
 * y combinadores lógicos (y / o / no). El mismo motor es reutilizable por el
 * Dynamic Forms Engine (visibilidad/validación condicional de campos).
 *
 * La propia expresión se valida con Zod (`ExpresionCondicionSchema`), de modo que
 * una definición de workflow con condiciones malformadas se rechaza al publicar.
 *
 * 100% neutro: cero vocabulario de negocio. Función pura, sin efectos.
 */
import { z } from "zod";

/* ------------------------------ Operadores -------------------------------- */

/** Operadores de comparación soportados sobre un campo del payload. */
export const OPERADORES = [
  "igual",
  "distinto",
  "mayor",
  "mayorIgual",
  "menor",
  "menorIgual",
  "contiene",
  "empiezaCon",
  "terminaCon",
  "en",
  "existe",
  "vacio",
] as const;

export type Operador = (typeof OPERADORES)[number];

/** Valor comparable admitido en una condición (serializable / Offline First). */
export type ValorCondicion =
  | string
  | number
  | boolean
  | null
  | readonly (string | number | boolean)[];

/* ------------------------------ Expresiones ------------------------------- */

/** Condición hoja: compara el valor de `campo` con `valor` según `operador`. */
export interface CondicionCampo {
  readonly campo: string;
  readonly operador: Operador;
  readonly valor?: ValorCondicion;
}

/** Combinador Y: verdadero si TODAS las subexpresiones son verdaderas. */
export interface CondicionY {
  readonly y: readonly ExpresionCondicion[];
}

/** Combinador O: verdadero si ALGUNA subexpresión es verdadera. */
export interface CondicionO {
  readonly o: readonly ExpresionCondicion[];
}

/** Negación: invierte el resultado de la subexpresión. */
export interface CondicionNo {
  readonly no: ExpresionCondicion;
}

/** Expresión de condición combinable (árbol declarativo). */
export type ExpresionCondicion =
  | CondicionCampo
  | CondicionY
  | CondicionO
  | CondicionNo;

/* -------------------------------- Zod ------------------------------------- */

const ValorSchema: z.ZodType<ValorCondicion> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

/** Esquema Zod recursivo de una expresión de condición. */
export const ExpresionCondicionSchema: z.ZodType<ExpresionCondicion> = z.lazy(() =>
  z.union([
    z.object({
      campo: z.string().min(1),
      operador: z.enum(OPERADORES),
      valor: ValorSchema.optional(),
    }),
    z.object({ y: z.array(ExpresionCondicionSchema).min(1) }),
    z.object({ o: z.array(ExpresionCondicionSchema).min(1) }),
    z.object({ no: ExpresionCondicionSchema }),
  ]),
) as z.ZodType<ExpresionCondicion>;

/** Valida una expresión declarativa; devuelve el resultado de Zod (safeParse). */
export function validarExpresion(expr: unknown): z.SafeParseReturnType<unknown, ExpresionCondicion> {
  return ExpresionCondicionSchema.safeParse(expr);
}

/* ------------------------------ Evaluación -------------------------------- */

function esCampo(e: ExpresionCondicion): e is CondicionCampo {
  return typeof (e as CondicionCampo).campo === "string";
}
function esY(e: ExpresionCondicion): e is CondicionY {
  return Array.isArray((e as CondicionY).y);
}
function esO(e: ExpresionCondicion): e is CondicionO {
  return Array.isArray((e as CondicionO).o);
}
function esNo(e: ExpresionCondicion): e is CondicionNo {
  return (e as CondicionNo).no !== undefined;
}

/** Lee un campo del payload admitiendo rutas con punto (`a.b.c`). */
function leerCampo(datos: Record<string, unknown>, campo: string): unknown {
  if (!campo.includes(".")) return datos[campo];
  let actual: unknown = datos;
  for (const parte of campo.split(".")) {
    if (actual == null || typeof actual !== "object") return undefined;
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}

function comparar(actual: unknown, cond: CondicionCampo): boolean {
  const esperado = cond.valor;
  switch (cond.operador) {
    case "existe":
      return actual !== undefined && actual !== null;
    case "vacio":
      return (
        actual === undefined ||
        actual === null ||
        actual === "" ||
        (Array.isArray(actual) && actual.length === 0)
      );
    case "igual":
      return actual === esperado;
    case "distinto":
      return actual !== esperado;
    case "mayor":
      return typeof actual === "number" && typeof esperado === "number" && actual > esperado;
    case "mayorIgual":
      return typeof actual === "number" && typeof esperado === "number" && actual >= esperado;
    case "menor":
      return typeof actual === "number" && typeof esperado === "number" && actual < esperado;
    case "menorIgual":
      return typeof actual === "number" && typeof esperado === "number" && actual <= esperado;
    case "contiene":
      if (typeof actual === "string" && typeof esperado === "string") return actual.includes(esperado);
      if (Array.isArray(actual)) return actual.includes(esperado as never);
      return false;
    case "empiezaCon":
      return typeof actual === "string" && typeof esperado === "string" && actual.startsWith(esperado);
    case "terminaCon":
      return typeof actual === "string" && typeof esperado === "string" && actual.endsWith(esperado);
    case "en":
      return Array.isArray(esperado) && esperado.includes(actual as never);
    default:
      return false;
  }
}

/**
 * Evalúa una expresión declarativa sobre el payload `datos`. Puro y total:
 * cualquier operador desconocido o tipo incompatible devuelve `false` (nunca
 * lanza ni ejecuta código del payload).
 */
export function evaluarCondicion(
  expr: ExpresionCondicion,
  datos: Record<string, unknown>,
): boolean {
  if (esNo(expr)) return !evaluarCondicion(expr.no, datos);
  if (esY(expr)) return expr.y.every((sub) => evaluarCondicion(sub, datos));
  if (esO(expr)) return expr.o.some((sub) => evaluarCondicion(sub, datos));
  if (esCampo(expr)) return comparar(leerCampo(datos, expr.campo), expr);
  return false;
}

/**
 * Evalúa una lista de condiciones (semántica Y: todas deben cumplirse).
 * Devuelve `{ ok: true }` o `{ ok: false, motivo }` con la primera que falla.
 */
export function evaluarTodas(
  condiciones: readonly ExpresionCondicion[] | undefined,
  datos: Record<string, unknown>,
): { ok: true } | { ok: false; motivo: string } {
  for (let i = 0; i < (condiciones?.length ?? 0); i++) {
    const c = condiciones![i]!;
    if (!evaluarCondicion(c, datos)) {
      return { ok: false, motivo: `Condición #${i + 1} no satisfecha` };
    }
  }
  return { ok: true };
}
