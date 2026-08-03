/**
 * DGP-007 · Workflow Engine — Definición declarativa de workflows.
 *
 * Una `DefinicionWorkflow` describe COMO DATOS un proceso: estados
 * (inicial/finales/suspendibles), transiciones con guardas declarativas
 * (permiso, capacidad, policy, precondiciones/postcondiciones vía el motor de
 * condiciones), acciones declarativas (emitirEvento, asignar, escalar,
 * notificar), aprobación inline que GOBIERNA la transición (gate) y
 * operaciones estándar integradas (cancelar, reabrir,
 * suspender, reanudar).
 *
 * Reutiliza y extiende `DefinicionMaquinaEstados`/`DefinicionTransicion` del
 * Business Foundation: una `DefinicionWorkflow` es proyectable a una máquina de
 * estados neutra (ver `maquinaDeWorkflow`). NO se duplican conceptos.
 *
 * 100% neutro: cero vocabulario de negocio. Los ejemplos son de "proceso de
 * solicitud genérica" (ver docs/).
 */
import {
  type DefinicionMaquinaEstados,
  type DefinicionTransicion,
} from "@workspace/business-foundation";
import type { ExpresionCondicion } from "./condiciones";
import type { DefinicionAprobacionTransicion } from "./aprobaciones";

/* -------------------------------- Estados --------------------------------- */

export interface EstadoWorkflow {
  readonly nombre: string;
  /** Estado inicial al iniciar la instancia (exactamente uno). */
  readonly inicial?: boolean;
  /** Estado terminal: sin transiciones salientes (salvo reabrir). */
  readonly final?: boolean;
  /** El estado admite suspensión (suspender → suspendido → reanudar). */
  readonly suspendible?: boolean;
  /** Etiqueta legible opcional (UI). */
  readonly etiqueta?: string;
}

/* ------------------------- Acciones declarativas -------------------------- */

/** Emite un evento de dominio adicional con el payload de la instancia. */
export interface AccionEmitirEvento {
  readonly tipo: "emitirEvento";
  /** Sufijo del evento (`<servicio>.instancia.<evento>`). */
  readonly evento: string;
}

/** Asigna la instancia a un principal/rol (guardado en `data._asignadoA`). */
export interface AccionAsignar {
  readonly tipo: "asignar";
  /** Principal explícito, o `"solicitante"` para el iniciador, o rol. */
  readonly a: string;
}

/** Programa un escalamiento con vencimiento declarado (procesado por comando). */
export interface AccionEscalar {
  readonly tipo: "escalar";
  /** Rol/principal destino del escalamiento. */
  readonly a: string;
  /** Vencimiento relativo en minutos desde la transición. */
  readonly enMinutos: number;
}

/** Encola una notificación vía la plataforma (platform.notification). */
export interface AccionNotificar {
  readonly tipo: "notificar";
  /** Destinatario explícito, `"solicitante"` o `"asignado"`. */
  readonly a: string;
  readonly asunto: string;
  readonly cuerpo: string;
  readonly canal?: "inapp" | "email" | "sms" | "push";
}

/**
 * Acción declarativa ejecutada dentro de la MISMA UoW que la transición.
 * Solo hay tipos cerrados: JAMÁS funciones de negocio ni código arbitrario.
 */
export type AccionDeclarativa =
  | AccionEmitirEvento
  | AccionAsignar
  | AccionEscalar
  | AccionNotificar;

/* ------------------------------ Transiciones ------------------------------ */

export interface TransicionWorkflow {
  readonly de: string;
  readonly a: string;
  /** Comando lógico que dispara la transición (camelCase). */
  readonly comando: string;
  /** Permiso adicional exigido. */
  readonly permiso?: string;
  /** Capacidad adicional exigida (AuthorizationRuntime). */
  readonly capacidad?: string;
  /** Política contextual exigida (AuthorizationRuntime + subject = data). */
  readonly policy?: string;
  /** Condiciones que deben cumplirse ANTES de aplicar la transición. */
  readonly precondiciones?: readonly ExpresionCondicion[];
  /** Condiciones que deben cumplirse DESPUÉS de aplicar la transición. */
  readonly postcondiciones?: readonly ExpresionCondicion[];
  /** Acciones declarativas ejecutadas en la misma UoW tras transicionar. */
  readonly acciones?: readonly AccionDeclarativa[];
  /**
   * Aprobación declarada que GOBIERNA esta transición. Si está presente, el
   * comando de transición NO cambia el estado destino: crea una aprobación
   * pendiente ligada a la transición. Solo cuando la aprobación se RESUELVE
   * favorablemente (según el modo) se ejecuta la transición completa
   * (validaciones + acciones + evento). No hace falta declarar `solicitarAprobacion`.
   */
  readonly aprobacion?: DefinicionAprobacionTransicion;
  /**
   * Estado destino cuando la aprobación se rechaza. Si se omite, la instancia
   * permanece en el estado origen (`de`) al rechazarse.
   */
  readonly rechazoA?: string;
}

/* --------------------------- Operaciones estándar ------------------------- */

/**
 * Operaciones estándar integradas (pseudo-transiciones configurables). Cada una
 * tiene un comando fijo; el nombre del estado destino es configurable.
 */
export interface OperacionesEstandar {
  /** Cancelar: cualquier estado no-final → estado cancelado. Default: activado. */
  readonly cancelar?: { readonly estado?: string; readonly permiso?: string } | false;
  /** Reabrir: desde un estado final o cancelado → estado inicial (o destino). */
  readonly reabrir?: { readonly a?: string; readonly permiso?: string } | false;
  /** Suspender: estado suspendible → estado suspendido. */
  readonly suspender?: { readonly estado?: string; readonly permiso?: string } | false;
  /** Reanudar: estado suspendido → estado previo (guardado en `_estadoPrevio`). */
  readonly reanudar?: { readonly permiso?: string } | false;
}

/* -------------------------- Definición completa --------------------------- */

export interface DefinicionWorkflow {
  /** Slug técnico del workflow (kebab-case), p. ej. `solicitud-generica`. */
  readonly clave: string;
  /** Etiqueta legible del proceso. */
  readonly etiqueta: string;
  readonly estados: readonly EstadoWorkflow[];
  readonly transiciones: readonly TransicionWorkflow[];
  /** Operaciones estándar integradas (por defecto todas activadas). */
  readonly operacionesEstandar?: OperacionesEstandar;
}

/* --------------------- Nombres canónicos de estados estándar -------------- */

export const ESTADO_CANCELADO = "cancelado";
export const ESTADO_SUSPENDIDO = "suspendido";

export const COMANDO_CANCELAR = "cancelar";
export const COMANDO_REABRIR = "reabrir";
export const COMANDO_SUSPENDER = "suspender";
export const COMANDO_REANUDAR = "reanudar";

/* -------------------------------- Helpers --------------------------------- */

/** Estado inicial declarado (o el primero como fallback). */
export function estadoInicialWorkflow(def: DefinicionWorkflow): string {
  return def.estados.find((e) => e.inicial)?.nombre ?? def.estados[0]!.nombre;
}

/** ¿El estado es final? */
export function esEstadoFinal(def: DefinicionWorkflow, estado: string): boolean {
  return def.estados.find((e) => e.nombre === estado)?.final === true;
}

/** ¿El estado es suspendible? */
export function esEstadoSuspendible(def: DefinicionWorkflow, estado: string): boolean {
  return def.estados.find((e) => e.nombre === estado)?.suspendible === true;
}

/** Resuelve la configuración efectiva de operaciones estándar (con defaults). */
export function operacionesEstandarEfectivas(def: DefinicionWorkflow): {
  cancelar: { estado: string; permiso?: string } | null;
  reabrir: { a: string; permiso?: string } | null;
  suspender: { estado: string; permiso?: string } | null;
  reanudar: { permiso?: string } | null;
} {
  const op = def.operacionesEstandar ?? {};
  const inicial = estadoInicialWorkflow(def);
  return {
    cancelar:
      op.cancelar === false
        ? null
        : { estado: op.cancelar?.estado ?? ESTADO_CANCELADO, permiso: op.cancelar?.permiso },
    reabrir:
      op.reabrir === false
        ? null
        : { a: op.reabrir?.a ?? inicial, permiso: op.reabrir?.permiso },
    suspender:
      op.suspender === false
        ? null
        : { estado: op.suspender?.estado ?? ESTADO_SUSPENDIDO, permiso: op.suspender?.permiso },
    reanudar: op.reanudar === false ? null : { permiso: op.reanudar?.permiso },
  };
}

/**
 * Proyecta una DefinicionWorkflow a la `DefinicionMaquinaEstados` neutra del
 * Business Foundation (incluyendo estados estándar cancelado/suspendido). Esto
 * permite reutilizar `MaquinaEstados` y `validarDefinicionModulo` sin duplicar.
 */
export function maquinaDeWorkflow(def: DefinicionWorkflow): DefinicionMaquinaEstados {
  const ops = operacionesEstandarEfectivas(def);
  const nombresEstado = new Set(def.estados.map((e) => e.nombre));
  const estados = def.estados.map((e) => ({
    nombre: e.nombre,
    inicial: e.inicial,
    final: e.final,
  }));

  const estadosEstandar: { nombre: string; final?: boolean }[] = [];
  if (ops.cancelar && !nombresEstado.has(ops.cancelar.estado)) {
    estadosEstandar.push({ nombre: ops.cancelar.estado, final: true });
    nombresEstado.add(ops.cancelar.estado);
  }
  if (ops.suspender && !nombresEstado.has(ops.suspender.estado)) {
    estadosEstandar.push({ nombre: ops.suspender.estado });
    nombresEstado.add(ops.suspender.estado);
  }

  const transiciones: DefinicionTransicion[] = def.transiciones.map((t) => ({
    de: t.de,
    a: t.a,
    comando: t.comando,
    permiso: t.permiso,
  }));

  return {
    estados: [...estados, ...estadosEstandar],
    transiciones,
  };
}
