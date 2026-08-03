/**
 * DGP-007 · Dynamic Forms Engine — Conditional Engine.
 *
 * El motor de condiciones BASE (expresiones JSON tipadas {campo, operador,
 * valor} componibles con y/o/no, seguro y sin `eval`) vive en el paquete
 * `@workspace/workflow-engine` y se REUTILIZA aquí: NO se duplica la evaluación.
 * Este módulo re-exporta ese motor y añade ENCIMA las extensiones propias del
 * Dynamic Forms Engine que el workflow no necesita:
 *   - `ExpresionCalculo` / `evaluarCalculo` (cálculo declarativo por campo).
 *   - `ReglasCampo` / `evaluarReglasCampo` / `evaluarReglasFormulario`
 *     (visible/oculto/obligatorio/soloLectura/calculado/validación por campo).
 *
 * Convenio de expresión unificado con el workflow: mismos operadores cerrados
 * (`igual`, `distinto`, `mayor`, `mayorIgual`, `menor`, `menorIgual`,
 * `contiene`, `empiezaCon`, `terminaCon`, `en`, `existe`, `vacio`).
 */

// ---- Motor base compartido (reutilizado, no duplicado) ----
export {
  OPERADORES,
  ExpresionCondicionSchema,
  validarExpresion,
  evaluarCondicion,
  evaluarTodas,
  type Operador,
  type ValorCondicion,
  type CondicionCampo,
  type CondicionY,
  type CondicionO,
  type CondicionNo,
  type ExpresionCondicion,
} from "@workspace/workflow-engine/condiciones";

import {
  evaluarCondicion,
  type ExpresionCondicion,
} from "@workspace/workflow-engine/condiciones";

/**
 * Alias local: en el Dynamic Forms Engine las reglas se declaran sobre la misma
 * forma de expresión que el workflow (`ExpresionCondicion`).
 */
export type Condicion = ExpresionCondicion;

/* ------------------------- Expresiones calculadas ------------------------- */

/** Nodo de una expresión de cálculo declarativa (aritmética/concatenación). */
export type ExpresionCalculo =
  | { readonly ref: string }
  | { readonly literal: string | number | boolean }
  | { readonly op: "+" | "-" | "*" | "/"; readonly args: readonly ExpresionCalculo[] }
  | { readonly concat: readonly ExpresionCalculo[] }
  | { readonly redondear: ExpresionCalculo; readonly decimales?: number };

/** Evalúa una expresión de cálculo de forma segura (sin `eval`). */
export function evaluarCalculo(
  expr: ExpresionCalculo,
  datos: Record<string, unknown>,
): string | number | boolean | null {
  if ("literal" in expr) return expr.literal;
  if ("ref" in expr) {
    const v = datos[expr.ref];
    return v === undefined ? null : (v as string | number | boolean);
  }
  if ("concat" in expr) {
    return expr.concat.map((e) => String(evaluarCalculo(e, datos) ?? "")).join("");
  }
  if ("redondear" in expr) {
    const base = Number(evaluarCalculo(expr.redondear, datos) ?? 0);
    const factor = 10 ** (expr.decimales ?? 0);
    return Math.round(base * factor) / factor;
  }
  if ("op" in expr) {
    const valores = expr.args.map((e) => Number(evaluarCalculo(e, datos) ?? 0));
    switch (expr.op) {
      case "+":
        return valores.reduce((a, b) => a + b, 0);
      case "-":
        return valores.slice(1).reduce((a, b) => a - b, valores[0] ?? 0);
      case "*":
        return valores.reduce((a, b) => a * b, 1);
      case "/":
        return valores.slice(1).reduce((a, b) => (b === 0 ? a : a / b), valores[0] ?? 0);
    }
  }
  return null;
}

/* --------------------------- Reglas por campo ----------------------------- */

/** Regla de validación declarativa disparada por una condición. */
export interface ReglaValidacionCondicional {
  readonly cuando: Condicion;
  readonly severidad?: "error" | "advertencia" | "bloqueo";
  readonly mensaje: string;
  readonly regla?: string;
}

/**
 * Conjunto de reglas condicionales aplicables a un campo. Todas las condiciones
 * son declarativas y evaluables offline (sin acceso a red ni código).
 */
export interface ReglasCampo {
  readonly campo: string;
  readonly visibleCuando?: Condicion;
  readonly ocultoCuando?: Condicion;
  readonly obligatorioCuando?: Condicion;
  readonly soloLecturaCuando?: Condicion;
  readonly calculadoCuando?: {
    readonly cuando?: Condicion;
    readonly expresion: ExpresionCalculo;
  };
  readonly validacionCuando?: readonly ReglaValidacionCondicional[];
}

/** Estado efectivo de un campo tras evaluar sus reglas condicionales. */
export interface EstadoCampoEvaluado {
  readonly campo: string;
  readonly visible: boolean;
  readonly obligatorio: boolean;
  readonly soloLectura: boolean;
  /** Valor calculado (si `calculadoCuando` aplica), o `undefined`. */
  readonly valorCalculado?: string | number | boolean | null;
  readonly validacionesActivas: readonly ReglaValidacionCondicional[];
}

/**
 * Evalúa las reglas condicionales de un campo sobre los datos. `base` aporta la
 * obligatoriedad/solo-lectura estática declarada en la definición del campo.
 * La evaluación de las condiciones se delega en el motor base compartido.
 */
export function evaluarReglasCampo(
  reglas: ReglasCampo,
  datos: Record<string, unknown>,
  base: { obligatorio?: boolean; soloLectura?: boolean } = {},
): EstadoCampoEvaluado {
  let visible = true;
  if (reglas.visibleCuando) visible = evaluarCondicion(reglas.visibleCuando, datos);
  if (reglas.ocultoCuando && evaluarCondicion(reglas.ocultoCuando, datos)) visible = false;

  let obligatorio = base.obligatorio ?? false;
  if (reglas.obligatorioCuando) {
    obligatorio = obligatorio || evaluarCondicion(reglas.obligatorioCuando, datos);
  }
  // Un campo no visible nunca es obligatorio.
  if (!visible) obligatorio = false;

  let soloLectura = base.soloLectura ?? false;
  if (reglas.soloLecturaCuando) {
    soloLectura = soloLectura || evaluarCondicion(reglas.soloLecturaCuando, datos);
  }

  let valorCalculado: string | number | boolean | null | undefined;
  if (reglas.calculadoCuando) {
    const aplica = reglas.calculadoCuando.cuando
      ? evaluarCondicion(reglas.calculadoCuando.cuando, datos)
      : true;
    if (aplica) valorCalculado = evaluarCalculo(reglas.calculadoCuando.expresion, datos);
  }

  const validacionesActivas = (reglas.validacionCuando ?? []).filter((v) =>
    evaluarCondicion(v.cuando, datos),
  );

  return { campo: reglas.campo, visible, obligatorio, soloLectura, valorCalculado, validacionesActivas };
}

/**
 * Evalúa TODAS las reglas de un formulario, aplicando los valores calculados a
 * una copia de los datos (para que campos derivados de otros derivados se
 * resuelvan en orden de declaración). Devuelve el estado por campo y los datos
 * con los valores calculados ya aplicados.
 */
export function evaluarReglasFormulario(
  reglas: readonly ReglasCampo[],
  datos: Record<string, unknown>,
  bases: Record<string, { obligatorio?: boolean; soloLectura?: boolean }> = {},
): {
  estados: Record<string, EstadoCampoEvaluado>;
  datosEfectivos: Record<string, unknown>;
} {
  const datosEfectivos: Record<string, unknown> = { ...datos };
  const estados: Record<string, EstadoCampoEvaluado> = {};
  for (const r of reglas) {
    const estado = evaluarReglasCampo(r, datosEfectivos, bases[r.campo] ?? {});
    estados[r.campo] = estado;
    if (estado.valorCalculado !== undefined) datosEfectivos[r.campo] = estado.valorCalculado;
  }
  return { estados, datosEfectivos };
}
