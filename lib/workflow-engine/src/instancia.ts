/**
 * DGP-007 · Workflow Engine — Workflow Runtime (instancia + lógica pura).
 *
 * La instancia de workflow es una entidad persistida vía RecordStorePort
 * (recordType `instancia`, servicio del motor). Aquí vive la LÓGICA PURA de la
 * transición: dado el estado actual + comando + payload, valida estado
 * origen/destino, precondiciones/postcondiciones (motor de condiciones) y
 * produce el nuevo estado + evento autosuficiente. Las guardas de autorización
 * (permiso/capacidad/policy) y la persistencia las orquesta `motor.ts` dentro
 * de la UoW del comando (nunca hay comandos anidados).
 *
 * 100% neutro. Offline First: los recibos `_opIds` viven en el propio registro.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { evaluarTodas } from "./condiciones";
import {
  COMANDO_CANCELAR,
  COMANDO_REABRIR,
  COMANDO_REANUDAR,
  COMANDO_SUSPENDER,
  esEstadoFinal,
  esEstadoSuspendible,
  estadoInicialWorkflow,
  operacionesEstandarEfectivas,
  type DefinicionWorkflow,
  type TransicionWorkflow,
} from "./definicion";

/** Clave-metadato: estado previo a una suspensión (para reanudar). */
export const ESTADO_PREVIO_KEY = "_estadoPrevio";
/** Clave-metadato: principal/rol asignado. */
export const ASIGNADO_KEY = "_asignadoA";
/** Clave-metadato: solicitante/iniciador de la instancia. */
export const SOLICITANTE_KEY = "_solicitante";
/** Clave-metadato: clave del workflow y versión de la definición. */
export const WORKFLOW_KEY = "_workflow";
export const VERSION_DEF_KEY = "_versionDefinicion";

/** Estado de una instancia (proyección del Record Store). */
export interface RegistroInstancia {
  readonly id: string;
  readonly tenantId: string;
  readonly estado: string;
  readonly version: number;
  readonly data: Record<string, unknown>;
  readonly createdBy: string;
  readonly updatedAt: Date;
}

/** Descriptor de la transición estándar resuelta (incluye pseudo-transiciones). */
export interface TransicionResuelta {
  readonly de: string;
  readonly a: string;
  readonly comando: string;
  /** Transición declarada (undefined en operaciones estándar). */
  readonly declarada?: TransicionWorkflow;
  /** Marca operación estándar (cancelar/reabrir/suspender/reanudar). */
  readonly estandar?: "cancelar" | "reabrir" | "suspender" | "reanudar";
}

/**
 * Runtime PURO de una instancia para una definición concreta. No persiste;
 * devuelve Result con el registro resultante para que `motor.ts` lo guarde.
 */
export class RuntimeInstancia {
  constructor(readonly def: DefinicionWorkflow) {}

  /** Estados válidos (incluye estándar cancelado/suspendido). */
  estados(): readonly string[] {
    const ops = operacionesEstandarEfectivas(this.def);
    const set = new Set(this.def.estados.map((e) => e.nombre));
    if (ops.cancelar) set.add(ops.cancelar.estado);
    if (ops.suspender) set.add(ops.suspender.estado);
    return [...set];
  }

  /** Resuelve la transición correspondiente a `estado + comando`. */
  resolver(estado: string, comando: string): Result<TransicionResuelta, KernelError> {
    const ops = operacionesEstandarEfectivas(this.def);

    // Operaciones estándar (pseudo-transiciones).
    if (comando === COMANDO_CANCELAR && ops.cancelar) {
      if (esEstadoFinal(this.def, estado) || estado === ops.cancelar.estado) {
        return fail(KernelErrors.conflict(`No se puede cancelar desde el estado "${estado}"`));
      }
      return ok({ de: estado, a: ops.cancelar.estado, comando, estandar: "cancelar" });
    }
    if (comando === COMANDO_REABRIR && ops.reabrir) {
      const reabribles = esEstadoFinal(this.def, estado) || (ops.cancelar && estado === ops.cancelar.estado);
      if (!reabribles) {
        return fail(KernelErrors.conflict(`No se puede reabrir desde el estado "${estado}"`));
      }
      return ok({ de: estado, a: ops.reabrir.a, comando, estandar: "reabrir" });
    }
    if (comando === COMANDO_SUSPENDER && ops.suspender) {
      if (!esEstadoSuspendible(this.def, estado)) {
        return fail(KernelErrors.conflict(`El estado "${estado}" no es suspendible`));
      }
      return ok({ de: estado, a: ops.suspender.estado, comando, estandar: "suspender" });
    }
    if (comando === COMANDO_REANUDAR && ops.reanudar && ops.suspender) {
      if (estado !== ops.suspender.estado) {
        return fail(KernelErrors.conflict(`Solo se puede reanudar desde "${ops.suspender.estado}"`));
      }
      // El destino se resuelve en aplicar() leyendo `_estadoPrevio`.
      return ok({ de: estado, a: estado, comando, estandar: "reanudar" });
    }

    // Transición declarada.
    const declarada = this.def.transiciones.find((t) => t.de === estado && t.comando === comando);
    if (!declarada) {
      return fail(
        KernelErrors.conflict(`Transición ilegal: no existe "${comando}" desde el estado "${estado}"`),
      );
    }
    return ok({ de: declarada.de, a: declarada.a, comando, declarada });
  }

  /**
   * Aplica una transición (ya resuelta) de forma pura: valida
   * precondiciones/postcondiciones y produce el nuevo registro (sin subir
   * versión: eso lo hace la persistencia). Gestiona metadatos estándar de
   * suspensión/reanudación.
   */
  aplicar(
    actual: RegistroInstancia,
    resuelta: TransicionResuelta,
    dataMutada: Record<string, unknown>,
  ): Result<{ estado: string; data: Record<string, unknown> }, KernelError> {
    const decl = resuelta.declarada;

    // Precondiciones (sobre el payload actual).
    if (decl?.precondiciones) {
      const pre = evaluarTodas(decl.precondiciones, dataMutada);
      if (!pre.ok) return fail(KernelErrors.conflict(`Precondición fallida: ${pre.motivo}`));
    }

    let estadoDestino = resuelta.a;
    let data = { ...dataMutada };

    if (resuelta.estandar === "suspender") {
      data[ESTADO_PREVIO_KEY] = actual.estado;
    } else if (resuelta.estandar === "reanudar") {
      const previo = data[ESTADO_PREVIO_KEY];
      if (typeof previo !== "string") {
        return fail(KernelErrors.conflict("No hay estado previo para reanudar"));
      }
      estadoDestino = previo;
      delete data[ESTADO_PREVIO_KEY];
    }

    // Postcondiciones (sobre el payload resultante).
    if (decl?.postcondiciones) {
      const post = evaluarTodas(decl.postcondiciones, data);
      if (!post.ok) return fail(KernelErrors.conflict(`Postcondición fallida: ${post.motivo}`));
    }

    return ok({ estado: estadoDestino, data });
  }

  /** Estado inicial de una instancia nueva. */
  estadoInicial(): string {
    return estadoInicialWorkflow(this.def);
  }
}
