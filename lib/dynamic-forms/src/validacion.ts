/**
 * DGP-007 · Dynamic Forms Engine — Validation Runtime.
 *
 * Valida los datos capturados contra la definición del formulario y sus reglas
 * condicionales. Clases de validación: obligatoriedad, longitud, rangos,
 * formato (email/uri/patrón), dependencias entre campos, validaciones cruzadas
 * declarativas y validaciones ASINCRÓNICAS por contrato (ValidadorAsincrono,
 * resuelto vía QueryBus del Kernel — p. ej. unicidad).
 *
 * Severidades: `error` (bloquea el envío), `advertencia` (no bloquea, se
 * registra) y `bloqueo` (impide incluso guardar borrador). El resultado es
 * estructurado: {campo, severidad, mensaje, regla}.
 */
import { ok, type ExecutionContext, type KernelError, type Result } from "@workspace/kernel";
import {
  camposHoja,
  campoPorClave,
  esquemaCampo,
  type CampoFormulario,
  type DefinicionFormulario,
} from "./definicion";
import {
  evaluarCondicion,
  evaluarReglasFormulario,
  type Condicion,
  type ReglasCampo,
  type ReglaValidacionCondicional,
} from "./condiciones";

/* -------------------------------- Tipos ----------------------------------- */

export type Severidad = "error" | "advertencia" | "bloqueo";

/** Hallazgo estructurado de validación. */
export interface HallazgoValidacion {
  readonly campo: string;
  readonly severidad: Severidad;
  readonly mensaje: string;
  readonly regla: string;
}

/**
 * Validación cruzada declarativa a nivel de formulario: si `cuando` se cumple,
 * el formulario es inválido con la severidad y mensaje indicados.
 */
export interface ValidacionCruzada {
  readonly cuando: Condicion;
  readonly campo?: string;
  readonly severidad?: Severidad;
  readonly mensaje: string;
  readonly regla: string;
}

/**
 * Validador asincrónico por CONTRATO: se resuelve ejecutando una Query del
 * Kernel (`query`) que recibe `{ campo, valor, datos }` y debe devolver
 * `{ valido: boolean, mensaje?: string }`. Nunca contiene código embebido.
 */
export interface ValidadorAsincrono {
  readonly nombre: string;
  readonly campo: string;
  readonly query: string;
  readonly severidad?: Severidad;
  readonly mensaje: string;
  /** Solo se ejecuta cuando esta condición se cumple (por defecto: siempre). */
  readonly cuando?: Condicion;
}

/** Puerto para ejecutar validaciones asincrónicas vía QueryBus del Kernel. */
export interface EjecutorQuery {
  execute(
    ctx: ExecutionContext,
    query: string,
    input: unknown,
  ): Promise<Result<unknown, KernelError>>;
}

/** Contrato de validación de un formulario (además de la definición). */
export interface ContratoValidacion {
  readonly reglasCampo?: readonly ReglasCampo[];
  readonly cruzadas?: readonly ValidacionCruzada[];
  readonly asincronas?: readonly ValidadorAsincrono[];
}

export interface ResultadoValidacion {
  readonly valido: boolean;
  readonly hallazgos: readonly HallazgoValidacion[];
  /** `true` si algún hallazgo tiene severidad `bloqueo` (impide guardar borrador). */
  readonly hayBloqueo: boolean;
  /** `true` si algún hallazgo tiene severidad `error` (impide enviar). */
  readonly hayError: boolean;
}

/* --------------------------- Validación síncrona -------------------------- */

function validarValorCampo(campo: CampoFormulario, valor: unknown): HallazgoValidacion[] {
  const hallazgos: HallazgoValidacion[] = [];
  if (valor === undefined || valor === null) return hallazgos;
  const parsed = esquemaCampo(campo).safeParse(valor);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      hallazgos.push({
        campo: campo.clave,
        severidad: "error",
        mensaje: issue.message,
        regla: `formato:${campo.tipo}`,
      });
    }
  }
  return hallazgos;
}

/**
 * Validación totalmente SÍNCRONA (offline-safe): obligatoriedad efectiva
 * (condicional), formato/longitud/rango del valor y validaciones cruzadas.
 */
export function validarSincrono(
  def: DefinicionFormulario,
  datos: Record<string, unknown>,
  contrato: ContratoValidacion = {},
): ResultadoValidacion {
  const hallazgos: HallazgoValidacion[] = [];

  const bases: Record<string, { obligatorio?: boolean; soloLectura?: boolean }> = {};
  for (const c of camposHoja(def)) bases[c.clave] = { obligatorio: c.obligatorio, soloLectura: c.soloLectura };

  const { estados, datosEfectivos } = evaluarReglasFormulario(
    contrato.reglasCampo ?? [],
    datos,
    bases,
  );

  for (const campo of camposHoja(def)) {
    const estado = estados[campo.clave];
    const visible = estado?.visible ?? true;
    const obligatorio = estado?.obligatorio ?? campo.obligatorio ?? false;
    const valor = datosEfectivos[campo.clave];

    if (!visible) continue;

    if (obligatorio && (valor === undefined || valor === null || valor === "" ||
      (Array.isArray(valor) && valor.length === 0))) {
      hallazgos.push({
        campo: campo.clave,
        severidad: "error",
        mensaje: `El campo "${campo.etiqueta}" es obligatorio`,
        regla: "obligatorio",
      });
      continue;
    }

    hallazgos.push(...validarValorCampo(campo, valor));

    // Reglas de validación condicional del propio campo.
    for (const v of estado?.validacionesActivas ?? []) {
      hallazgos.push(reglaCondicionalAHallazgo(campo.clave, v));
    }
  }

  // Validaciones cruzadas a nivel de formulario.
  for (const cruzada of contrato.cruzadas ?? []) {
    if (evaluarCondicion(cruzada.cuando, datosEfectivos)) {
      hallazgos.push({
        campo: cruzada.campo ?? "*",
        severidad: cruzada.severidad ?? "error",
        mensaje: cruzada.mensaje,
        regla: cruzada.regla,
      });
    }
  }

  return construirResultado(hallazgos);
}

function reglaCondicionalAHallazgo(
  campo: string,
  v: ReglaValidacionCondicional,
): HallazgoValidacion {
  return {
    campo,
    severidad: v.severidad ?? "error",
    mensaje: v.mensaje,
    regla: v.regla ?? "condicional",
  };
}

/* -------------------------- Validación asíncrona -------------------------- */

/**
 * Validación COMPLETA: síncrona + validadores asincrónicos por contrato
 * (resueltos vía QueryBus). Server-side; usada por el comando `enviar`.
 */
export async function validarCompleto(
  def: DefinicionFormulario,
  datos: Record<string, unknown>,
  contrato: ContratoValidacion,
  ctx: ExecutionContext,
  ejecutor: EjecutorQuery,
): Promise<ResultadoValidacion> {
  const base = validarSincrono(def, datos, contrato);
  const hallazgos: HallazgoValidacion[] = [...base.hallazgos];

  for (const val of contrato.asincronas ?? []) {
    if (val.cuando && !evaluarCondicion(val.cuando, datos)) continue;
    if (!campoPorClave(def, val.campo)) continue;
    const valor = datos[val.campo];
    if (valor === undefined || valor === null) continue;

    const res = await ejecutor.execute(ctx, val.query, {
      campo: val.campo,
      valor,
      datos,
    });
    if (!res.ok) {
      hallazgos.push({
        campo: val.campo,
        severidad: val.severidad ?? "error",
        mensaje: `Validación "${val.nombre}" no disponible: ${res.error.message}`,
        regla: val.nombre,
      });
      continue;
    }
    const salida = res.value as { valido?: boolean; mensaje?: string };
    if (salida && salida.valido === false) {
      hallazgos.push({
        campo: val.campo,
        severidad: val.severidad ?? "error",
        mensaje: salida.mensaje ?? val.mensaje,
        regla: val.nombre,
      });
    }
  }

  return construirResultado(hallazgos);
}

function construirResultado(hallazgos: readonly HallazgoValidacion[]): ResultadoValidacion {
  const hayBloqueo = hallazgos.some((h) => h.severidad === "bloqueo");
  const hayError = hallazgos.some((h) => h.severidad === "error");
  return {
    valido: !hayBloqueo && !hayError,
    hallazgos,
    hayBloqueo,
    hayError,
  };
}

/** Filtra solo los hallazgos que impiden guardar un borrador (bloqueo). */
export function soloBloqueos(resultado: ResultadoValidacion): ResultadoValidacion {
  const hallazgos = resultado.hallazgos.filter((h) => h.severidad === "bloqueo");
  return construirResultado(hallazgos);
}

/** Envuelve un resultado de validación como Result del Kernel. */
export function resultadoAResult(
  resultado: ResultadoValidacion,
): Result<ResultadoValidacion, KernelError> {
  return ok(resultado);
}
