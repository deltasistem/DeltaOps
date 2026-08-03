/**
 * DGP-007 · Workflow Engine — Approval Runtime.
 *
 * Aprobaciones declarativas dentro de la instancia de workflow. Generaliza el
 * patrón `_aprobacion` del Business Foundation a varios modos:
 *   - individual  : una sola aprobación basta.
 *   - paralela    : N aprobadores; completa al alcanzar `minAprobaciones`.
 *   - secuencial  : lista en secuencia; cada aprobador en su turno.
 *   - mayoria     : > mitad de los aprobadores declarados.
 *   - unanimidad  : todos los aprobadores declarados.
 * Modificadores:
 *   - delegada    : un aprobador delega en otro principal (con permiso).
 *   - escalada    : tras el vencimiento, se escala a `rolEscalamiento`.
 *   - vencimiento : fecha límite ISO; `expirarAprobaciones` (comando idempotente,
 *                   SIN timers internos) aplica el escalamiento o el rechazo.
 *
 * El estado de la aprobación vive dentro de la instancia (`data._aprobaciones`),
 * indexado por `transicion` (una entrada por aprobación en curso).
 *
 * 100% neutro. Toda mutación pasa por la UoW de la transición o del comando
 * de aprobación; nunca hay comandos anidados.
 */
import { z } from "zod";

/* -------------------------------- Modos ----------------------------------- */

export const MODOS_APROBACION = [
  "individual",
  "paralela",
  "secuencial",
  "mayoria",
  "unanimidad",
] as const;

export type ModoAprobacion = (typeof MODOS_APROBACION)[number];

/**
 * Definición declarativa de una aprobación asociada a una transición.
 * Neutra: `aprobadores` son principals/roles genéricos.
 */
export interface DefinicionAprobacionTransicion {
  /** Nombre descriptivo de la aprobación (para eventos/auditoría). */
  readonly nombre: string;
  readonly modo: ModoAprobacion;
  /** Permiso exigido para aprobar/rechazar. */
  readonly permiso: string;
  /** Aprobadores declarados (principals o roles). Para secuencial define la secuencia. */
  readonly aprobadores: readonly string[];
  /** Mínimo de aprobaciones para modo `paralela` (default 1). */
  readonly minAprobaciones?: number;
  /** Vencimiento relativo en minutos desde la solicitud (fecha límite ISO). */
  readonly vencimientoMinutos?: number;
  /** Al vencer con escalamiento: rol destino del escalamiento. */
  readonly rolEscalamiento?: string;
  /**
   * Política al vencer:
   *   - `escalar`  → escala a `rolEscalamiento` una vez; si vuelve a vencer, rechaza.
   *   - `rechazar` → resuelve como rechazo (aplica `rechazoA` de la transición).
   *   - `nada`     → queda `expirada` sin efectos.
   * Default: `escalar` si hay `rolEscalamiento`, si no `rechazar`.
   */
  readonly alVencer?: "escalar" | "rechazar" | "nada";
  /** Permitir que el solicitante se auto-apruebe (default false). */
  readonly permitirAutor?: boolean;
}

export type EstadoAprobacionWorkflow = "pendiente" | "aprobada" | "rechazada" | "expirada";

export interface RegistroAprobacion {
  readonly aprobador: string;
  /** Principal que efectivamente decidió (puede ser un delegado). */
  readonly actorId: string;
  readonly decision: "aprobada" | "rechazada";
  readonly fecha: string;
}

export interface Delegacion {
  readonly de: string;
  readonly a: string;
  readonly fecha: string;
}

/** Estado persistido de una aprobación en curso (dentro de `data._aprobaciones`). */
export interface EstadoAprobacion {
  /** Clave = comando de la transición gobernada. */
  readonly transicion: string;
  readonly nombre: string;
  readonly modo: ModoAprobacion;
  readonly solicitante: string;
  readonly aprobadores: readonly string[];
  readonly decisiones: readonly RegistroAprobacion[];
  readonly delegaciones: readonly Delegacion[];
  readonly estado: EstadoAprobacionWorkflow;
  /** Fecha límite ISO (si hay vencimiento declarado). */
  readonly venceEn?: string;
  readonly rolEscalamiento?: string;
  readonly escalado?: boolean;
  /** Política al vencer sin escalamiento (default `rechazar`). */
  readonly alVencer?: "escalar" | "rechazar" | "nada";
  /** Estado origen de la transición gobernada (la instancia permanece aquí). */
  readonly estadoOrigen: string;
  /** Estado destino a aplicar cuando la aprobación se resuelve favorablemente. */
  readonly estadoDestino: string;
  /** Estado destino si se rechaza (si se omite, permanece en `estadoOrigen`). */
  readonly rechazoA?: string;
}

/** Clave-metadato con el mapa de aprobaciones (por transición). */
export const APROBACIONES_KEY = "_aprobaciones";

/* --------------------------------- Zod ------------------------------------ */

export const DefinicionAprobacionSchema: z.ZodType<DefinicionAprobacionTransicion> = z.object({
  nombre: z.string().min(1),
  modo: z.enum(MODOS_APROBACION),
  permiso: z.string().min(1),
  aprobadores: z.array(z.string().min(1)).min(1),
  minAprobaciones: z.number().int().positive().optional(),
  vencimientoMinutos: z.number().int().positive().optional(),
  rolEscalamiento: z.string().min(1).optional(),
  alVencer: z.enum(["escalar", "rechazar", "nada"]).optional(),
  permitirAutor: z.boolean().optional(),
}) as z.ZodType<DefinicionAprobacionTransicion>;

/* ------------------------------- Lecturas --------------------------------- */

export function leerAprobaciones(data: Record<string, unknown>): EstadoAprobacion[] {
  const raw = data[APROBACIONES_KEY];
  return Array.isArray(raw) ? (raw as EstadoAprobacion[]) : [];
}

export function aprobacionDe(
  data: Record<string, unknown>,
  transicion: string,
): EstadoAprobacion | undefined {
  return leerAprobaciones(data).find((a) => a.transicion === transicion);
}

/** Escribe/reemplaza el estado de una aprobación en el mapa por transición. */
export function guardarAprobacion(
  data: Record<string, unknown>,
  aprobacion: EstadoAprobacion,
): Record<string, unknown> {
  const otras = leerAprobaciones(data).filter((a) => a.transicion !== aprobacion.transicion);
  return { ...data, [APROBACIONES_KEY]: [...otras, aprobacion] };
}

/* ------------------------------ Creación ---------------------------------- */

/** Objetivo de la transición gobernada por una aprobación. */
export interface ObjetivoTransicion {
  readonly comando: string;
  readonly estadoOrigen: string;
  readonly estadoDestino: string;
  readonly rechazoA?: string;
}

/** Crea el estado inicial (pendiente) de una aprobación al solicitarla. */
export function iniciarAprobacion(
  def: DefinicionAprobacionTransicion,
  objetivo: ObjetivoTransicion,
  solicitante: string,
  ahora: Date,
): EstadoAprobacion {
  const venceEn =
    def.vencimientoMinutos !== undefined
      ? new Date(ahora.getTime() + def.vencimientoMinutos * 60_000).toISOString()
      : undefined;
  const alVencer: "escalar" | "rechazar" | "nada" =
    def.alVencer ?? (def.rolEscalamiento ? "escalar" : "rechazar");
  return {
    transicion: objetivo.comando,
    nombre: def.nombre,
    modo: def.modo,
    solicitante,
    aprobadores: def.aprobadores,
    decisiones: [],
    delegaciones: [],
    estado: "pendiente",
    venceEn,
    rolEscalamiento: def.rolEscalamiento,
    escalado: false,
    alVencer,
    estadoOrigen: objetivo.estadoOrigen,
    estadoDestino: objetivo.estadoDestino,
    rechazoA: objetivo.rechazoA,
  };
}

/* ------------------------------ Resolución -------------------------------- */

/** ¿El actor (o el aprobador al que representa) puede decidir esta aprobación? */
export function aprobadorEfectivo(
  aprobacion: EstadoAprobacion,
  actorId: string,
  actorRol: string,
): string | undefined {
  // Delegación: si algún aprobador delegó en este actor, actúa por él.
  const delegado = aprobacion.delegaciones.find((d) => d.a === actorId);
  if (delegado) return delegado.de;
  if (aprobacion.aprobadores.includes(actorId)) return actorId;
  if (aprobacion.aprobadores.includes(actorRol)) return actorRol;
  // Escalamiento: tras escalar, quien tenga el rol de escalamiento puede decidir.
  if (aprobacion.escalado && aprobacion.rolEscalamiento && aprobacion.rolEscalamiento === actorRol) {
    return actorRol;
  }
  return undefined;
}

/** Calcula si la aprobación queda resuelta tras registrar una decisión. */
export function resolverEstado(
  def: DefinicionAprobacionTransicion,
  decisiones: readonly RegistroAprobacion[],
): EstadoAprobacionWorkflow {
  if (decisiones.some((d) => d.decision === "rechazada")) return "rechazada";
  const aprobadas = decisiones.filter((d) => d.decision === "aprobada").length;
  const total = def.aprobadores.length;
  switch (def.modo) {
    case "individual":
      return aprobadas >= 1 ? "aprobada" : "pendiente";
    case "paralela":
      return aprobadas >= (def.minAprobaciones ?? 1) ? "aprobada" : "pendiente";
    case "secuencial":
      return aprobadas >= total ? "aprobada" : "pendiente";
    case "mayoria":
      return aprobadas > Math.floor(total / 2) ? "aprobada" : "pendiente";
    case "unanimidad":
      return aprobadas >= total ? "aprobada" : "pendiente";
    default:
      return "pendiente";
  }
}

/** En modo secuencial, aprobador esperado en el turno actual. */
export function turnoSecuencial(aprobacion: EstadoAprobacion): string | undefined {
  if (aprobacion.modo !== "secuencial") return undefined;
  return aprobacion.aprobadores[aprobacion.decisiones.length];
}

/** ¿La aprobación está vencida respecto a `ahora`? */
export function estaVencida(aprobacion: EstadoAprobacion, ahora: Date): boolean {
  if (aprobacion.estado !== "pendiente" || !aprobacion.venceEn) return false;
  return new Date(aprobacion.venceEn).getTime() <= ahora.getTime();
}

/**
 * Aplica la política de vencimiento (`alVencer`) a una aprobación pendiente
 * vencida, respetando EXACTAMENTE lo declarado:
 *   - `escalar`  → si aún no se ha escalado, marca `escalado` (renueva pendiente,
 *                  actualiza `venceEn`) para que `rolEscalamiento` decida; si ya
 *                  se escaló y vuelve a vencer, resuelve como `rechazada`.
 *   - `rechazar` → resuelve como `rechazada` (el motor aplicará `rechazoA`).
 *   - `nada`     → queda `expirada`, sin más efectos.
 * NUNCA fuerza rechazo si se declaró escalamiento y todavía no ha escalado.
 * Idempotente: si ya no es pendiente o no está vencida, devuelve igual.
 */
export function aplicarVencimiento(
  aprobacion: EstadoAprobacion,
  ahora: Date,
): { aprobacion: EstadoAprobacion; cambio: boolean; escalada: boolean } {
  if (!estaVencida(aprobacion, ahora)) return { aprobacion, cambio: false, escalada: false };

  const politica = aprobacion.alVencer ?? (aprobacion.rolEscalamiento ? "escalar" : "rechazar");

  if (politica === "escalar" && aprobacion.rolEscalamiento && !aprobacion.escalado) {
    // Escala una vez: renueva la ventana de vencimiento manteniendo pendiente.
    const venceEn = aprobacion.venceEn
      ? new Date(ahora.getTime() + (new Date(aprobacion.venceEn).getTime() - ahora.getTime() || 0)).toISOString()
      : undefined;
    return {
      aprobacion: { ...aprobacion, escalado: true, venceEn: venceEn ?? aprobacion.venceEn },
      cambio: true,
      escalada: true,
    };
  }

  if (politica === "nada") {
    return { aprobacion: { ...aprobacion, estado: "expirada" }, cambio: true, escalada: false };
  }

  // `rechazar`, o `escalar` ya escalado que vuelve a vencer → rechazada.
  return {
    aprobacion: { ...aprobacion, estado: "rechazada" },
    cambio: true,
    escalada: false,
  };
}
