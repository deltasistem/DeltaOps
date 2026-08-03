/**
 * DGP-006 · Business Foundation Framework — Generic State Machine Runtime.
 *
 * Evalúa transiciones declarativas de forma pura: dado un estado actual y un
 * comando lógico, devuelve el estado destino o un KernelError de tipo
 * `conflict` (transición ilegal / guard rechazado). No toca infraestructura.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import type { DefinicionMaquinaEstados, DefinicionTransicion } from "./definicion";

export interface ResultadoTransicion {
  readonly estadoAnterior: string;
  readonly estadoNuevo: string;
  readonly transicion: DefinicionTransicion;
}

/** Runtime genérico de máquina de estados construido desde la definición. */
export class MaquinaEstados {
  constructor(private readonly def: DefinicionMaquinaEstados) {}

  /** Nombres de todos los estados válidos. */
  estados(): readonly string[] {
    return this.def.estados.map((e) => e.nombre);
  }

  esEstadoValido(estado: string): boolean {
    return this.def.estados.some((e) => e.nombre === estado);
  }

  esFinal(estado: string): boolean {
    return this.def.estados.find((e) => e.nombre === estado)?.final === true;
  }

  /** Transiciones salientes desde un estado. */
  transicionesDesde(estado: string): readonly DefinicionTransicion[] {
    return this.def.transiciones.filter((t) => t.de === estado);
  }

  /** Encuentra la transición que corresponde a `estado + comando`. */
  buscarTransicion(estado: string, comando: string): DefinicionTransicion | undefined {
    return this.def.transiciones.find((t) => t.de === estado && t.comando === comando);
  }

  /**
   * Evalúa una transición por comando lógico. Aplica el guard (puro) sobre los
   * datos del registro. Devuelve el estado destino o un KernelError.
   */
  evaluar(
    estadoActual: string,
    comando: string,
    datos: Record<string, unknown>,
  ): Result<ResultadoTransicion, KernelError> {
    if (!this.esEstadoValido(estadoActual)) {
      return fail(KernelErrors.conflict(`Estado desconocido: ${estadoActual}`));
    }
    const transicion = this.buscarTransicion(estadoActual, comando);
    if (!transicion) {
      return fail(
        KernelErrors.conflict(
          `Transición ilegal: no existe "${comando}" desde el estado "${estadoActual}"`,
        ),
      );
    }
    if (transicion.guard) {
      const resultado = transicion.guard(datos);
      if (resultado === false) {
        return fail(KernelErrors.conflict(`Transición "${comando}" rechazada por guard`));
      }
      if (typeof resultado === "string") {
        return fail(KernelErrors.conflict(resultado));
      }
    }
    return ok({ estadoAnterior: estadoActual, estadoNuevo: transicion.a, transicion });
  }
}
