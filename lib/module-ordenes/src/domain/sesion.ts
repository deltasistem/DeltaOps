/**
 * DGP-020.2 · Sesiones de trabajo y DURACIÓN REAL de las OT — DOMINIO PURO.
 *
 * Registro operacional AUDITABLE de las sesiones de trabajo de una OT. La FUENTE
 * DE VERDAD de la duración son los TRAMOS APPEND-ONLY (inmutables): la cabecera
 * de la sesión (`estado`, `iniciadoAt`, `cerradoAt`) es un derivado de
 * conveniencia. NUNCA se calcula la duración desde el workflow/bitácora/Timeline
 * (que son señal auxiliar, con posible desfase de reloj — «GAP-CLOCK»).
 *
 * Este módulo es PURO (sin IO): la máquina de estados, el cálculo de duraciones
 * y las reglas de monotonicidad/reloj-sospechoso. Los efectos (persistir tramos,
 * emitir eventos, reclamar opId) viven en la capa de aplicación (`module.ts`).
 *
 * REGLAS NORMATIVAS (directiva DGP-020.2):
 *  - §2/§23  Fuente de verdad = tramos append-only. Duración SOLO desde tramos.
 *  - §4      ABIERTA ⇄ PAUSADA … → CERRADA (final). Múltiples ciclos. Sin
 *            reapertura. Transición inválida ⇒ error de NEGOCIO (nunca 500).
 *  - §12/§13 efectivo/pausado/transcurrido; varias pausas SUMAN; sesión abierta
 *            = acumulados "hasta ahora" (no definitivos).
 *  - §18     Bordes huérfanos (pausar/reanudar/cerrar sin apertura) ⇒ negocio.
 *  - §9-11   ocurridoAt (device) ≠ registradoAt (server); nunca se reemplaza
 *            ocurridoAt; reloj sospechoso ⇒ ANOMALÍA marcada, sin destruir el
 *            hecho; monotonicidad determinista (evento no monótono ⇒ anomalía,
 *            no borrado).
 */

/* ----------------------------- Eventos de dominio ------------------------ */

/** La sesión quedó ABIERTA (primer tramo de trabajo). */
export const SESION_INICIADA = "modulo.ordenes.sesion-iniciada";
/** Un tramo de trabajo cerró y comenzó una pausa (transición ABIERTA→PAUSADA). */
export const SESION_PAUSADA = "modulo.ordenes.sesion-pausada";
/** Terminó la pausa y comenzó un nuevo tramo de trabajo (PAUSADA→ABIERTA). */
export const SESION_REANUDADA = "modulo.ordenes.sesion-reanudada";
/** La sesión quedó CERRADA (estado FINAL, sin reapertura). */
export const SESION_CERRADA = "modulo.ordenes.sesion-cerrada";

/** Eventos del sub-dominio de sesiones (para `events`/`eventHandlers`/replay). */
export const EVENTOS_SESION = [
  SESION_INICIADA,
  SESION_PAUSADA,
  SESION_REANUDADA,
  SESION_CERRADA,
] as const;
export type EventoSesion = (typeof EVENTOS_SESION)[number];

/* -------------------------------- Estados -------------------------------- */

export const ESTADOS_SESION = ["ABIERTA", "PAUSADA", "CERRADA"] as const;
export type EstadoSesion = (typeof ESTADOS_SESION)[number];

/** Estado final: una sesión CERRADA nunca se reabre (§4). */
export const ESTADOS_SESION_FINALES: readonly EstadoSesion[] = ["CERRADA"];

/* --------------------------------- Tramos -------------------------------- */

/**
 * Tipo de tramo APPEND-ONLY. La secuencia de tramos es la ÚNICA fuente de verdad
 * de la duración:
 *  - `trabajo`  : intervalo en el que se trabajó (abre en INICIAR/REANUDAR).
 *  - `pausa`    : intervalo de pausa (abre en PAUSAR).
 * El cierre de un tramo se registra como el `ocurridoAt` del tramo siguiente (o
 * el `cerradoAt` de la sesión). Modelamos cada tramo con su propio `ocurridoAt`
 * de inicio; la duración se deriva por diferencias entre tramos consecutivos.
 */
export const TIPOS_TRAMO = ["trabajo", "pausa"] as const;
export type TipoTramo = (typeof TIPOS_TRAMO)[number];

/** El comando que ORIGINÓ el tramo (trazabilidad append-only). */
export const ORIGENES_TRAMO = ["iniciar", "pausar", "reanudar", "cerrar"] as const;
export type OrigenTramo = (typeof ORIGENES_TRAMO)[number];

/**
 * Tramo append-only. `ocurridoAt` es device-time (nunca se reemplaza);
 * `registradoAt` es server-time. `anomaliaReloj` marca (sin destruir el hecho)
 * cuando el `ocurridoAt` es sospechoso o rompe la monotonicidad respecto al
 * tramo previo (§9-11). `secuencia` es el orden append determinista (0..n).
 */
export interface Tramo {
  readonly sesionId: string;
  readonly secuencia: number;
  readonly tipo: TipoTramo;
  readonly origen: OrigenTramo;
  /** Instante en el dispositivo del hecho (device-time). Inmutable. */
  readonly ocurridoAt: Date;
  /** Instante en el servidor del registro (server-time). Inmutable. */
  readonly registradoAt: Date;
  /** Marca de anomalía de reloj (futuro/retroceso/no-monótono). No corrige el hecho. */
  readonly anomaliaReloj: AnomaliaReloj | null;
}

/* --------------------------- Reloj sospechoso ---------------------------- */

export const TIPOS_ANOMALIA_RELOJ = ["futuro", "retroceso", "no-monotono"] as const;
export type TipoAnomaliaReloj = (typeof TIPOS_ANOMALIA_RELOJ)[number];

export interface AnomaliaReloj {
  readonly tipo: TipoAnomaliaReloj;
  /** Descripción legible del motivo (auditoría). */
  readonly motivo: string;
  /** ocurridoAt reportado (device) que disparó la anomalía. */
  readonly ocurridoAt: string;
  /** registradoAt del servidor (referencia). */
  readonly registradoAt: string;
}

/**
 * Tolerancia por delante del reloj del servidor antes de marcar `futuro`
 * (compensa desfases benignos device/servidor). 2 minutos.
 */
export const TOLERANCIA_FUTURO_MS = 2 * 60 * 1000;

/**
 * Evalúa la política de RELOJ SOSPECHOSO sobre un evento entrante SIN mutar el
 * hecho: devuelve la marca de anomalía (o `null`). El `ocurridoAt` NUNCA se
 * reemplaza ni se corrige; sólo se anota. Reglas deterministas (§9-11):
 *  - `futuro`      : ocurridoAt > registradoAt + tolerancia.
 *  - `retroceso`   : ocurridoAt < ocurridoAt del tramo previo (no monótono en
 *                    device-time). Se marca `no-monotono` si hay previo, o
 *                    `retroceso` respecto al inicio de la sesión.
 */
export function evaluarReloj(args: {
  readonly ocurridoAt: Date;
  readonly registradoAt: Date;
  readonly previoOcurridoAt: Date | null;
}): AnomaliaReloj | null {
  const oc = args.ocurridoAt.getTime();
  const reg = args.registradoAt.getTime();
  if (oc > reg + TOLERANCIA_FUTURO_MS) {
    return {
      tipo: "futuro",
      motivo: `ocurridoAt (${args.ocurridoAt.toISOString()}) está en el futuro respecto al servidor (${args.registradoAt.toISOString()})`,
      ocurridoAt: args.ocurridoAt.toISOString(),
      registradoAt: args.registradoAt.toISOString(),
    };
  }
  if (args.previoOcurridoAt && oc < args.previoOcurridoAt.getTime()) {
    return {
      tipo: "no-monotono",
      motivo: `ocurridoAt (${args.ocurridoAt.toISOString()}) es anterior al tramo previo (${args.previoOcurridoAt.toISOString()})`,
      ocurridoAt: args.ocurridoAt.toISOString(),
      registradoAt: args.registradoAt.toISOString(),
    };
  }
  return null;
}

/* -------------------------- Máquina de estados --------------------------- */

export type ComandoSesion = "iniciar" | "pausar" | "reanudar" | "cerrar";

/** Error de negocio de la máquina de sesión (transición/borde inválido). */
export interface ErrorTransicionSesion {
  readonly codigo:
    | "sesion-ya-abierta"
    | "sesion-no-abierta"
    | "sesion-no-pausada"
    | "sesion-cerrada"
    | "sin-sesion";
  readonly mensaje: string;
}

/**
 * Determina el tramo que produce un comando sobre una sesión en un estado dado.
 * PURO: no persiste; devuelve el `{ tipo, estadoResultante }` o un error de
 * NEGOCIO explícito (bordes huérfanos §18 y transiciones inválidas §4). El
 * llamador decide cómo mapear el error (jamás 500).
 *
 * `estadoActual === null` significa que la sesión aún no existe (para `iniciar`).
 */
export function transicion(
  estadoActual: EstadoSesion | null,
  comando: ComandoSesion,
): { readonly ok: true; readonly tipo: TipoTramo; readonly estado: EstadoSesion }
  | { readonly ok: false; readonly error: ErrorTransicionSesion } {
  switch (comando) {
    case "iniciar":
      if (estadoActual === null) return { ok: true, tipo: "trabajo", estado: "ABIERTA" };
      return {
        ok: false,
        error: { codigo: "sesion-ya-abierta", mensaje: "Ya existe una sesión para esta OT/identidad; no puede iniciarse de nuevo" },
      };
    case "pausar":
      if (estadoActual === null) return { ok: false, error: { codigo: "sin-sesion", mensaje: "No hay sesión abierta que pausar" } };
      if (estadoActual === "CERRADA") return { ok: false, error: { codigo: "sesion-cerrada", mensaje: "La sesión está cerrada y no admite operaciones" } };
      if (estadoActual !== "ABIERTA") return { ok: false, error: { codigo: "sesion-no-abierta", mensaje: "Solo una sesión ABIERTA puede pausarse" } };
      return { ok: true, tipo: "pausa", estado: "PAUSADA" };
    case "reanudar":
      if (estadoActual === null) return { ok: false, error: { codigo: "sin-sesion", mensaje: "No hay sesión pausada que reanudar" } };
      if (estadoActual === "CERRADA") return { ok: false, error: { codigo: "sesion-cerrada", mensaje: "La sesión está cerrada y no admite operaciones" } };
      if (estadoActual !== "PAUSADA") return { ok: false, error: { codigo: "sesion-no-pausada", mensaje: "Solo una sesión PAUSADA puede reanudarse" } };
      return { ok: true, tipo: "trabajo", estado: "ABIERTA" };
    case "cerrar":
      if (estadoActual === null) return { ok: false, error: { codigo: "sin-sesion", mensaje: "No hay sesión abierta que cerrar" } };
      if (estadoActual === "CERRADA") return { ok: false, error: { codigo: "sesion-cerrada", mensaje: "La sesión ya está cerrada" } };
      // Se puede cerrar tanto desde ABIERTA como desde PAUSADA. El tramo `cerrar`
      // no abre trabajo nuevo: sólo fija el `cerradoAt` (frontera final).
      return { ok: true, tipo: "trabajo", estado: "CERRADA" };
    default:
      return { ok: false, error: { codigo: "sin-sesion", mensaje: "Comando de sesión desconocido" } };
  }
}

/* ------------------------- Cálculo de duraciones ------------------------- */

export interface Duraciones {
  /** ms efectivamente TRABAJADOS (suma de tramos `trabajo`). */
  readonly efectivoMs: number;
  /** ms en PAUSA (suma de tramos `pausa`). */
  readonly pausadoMs: number;
  /** ms TRANSCURRIDOS entre el primer tramo y el cierre/ahora (efectivo+pausado). */
  readonly transcurridoMs: number;
  /** Número de ciclos de pausa observados. */
  readonly pausas: number;
  /** ¿La sesión sigue abierta? (acumulados "hasta ahora", no definitivos). */
  readonly abierta: boolean;
}

/**
 * Calcula las duraciones EXCLUSIVAMENTE desde los tramos append-only (§12/§13).
 * La duración de cada tramo es la diferencia entre su `ocurridoAt` y el
 * `ocurridoAt` del tramo SIGUIENTE (o el `cerradoAt`/`ahora` para el último).
 *
 * - Múltiples pausas SUMAN (se recorre toda la secuencia).
 * - Sesión ABIERTA (cerradoAt === null): se usa `ahora` como frontera y los
 *   acumulados son "hasta ahora" (no definitivos); `abierta = true`.
 * - Robusto ante anomalías de reloj: los intervalos NEGATIVOS (por retroceso de
 *   ocurridoAt no corregido) se acotan a 0 para no restar duración; el hecho
 *   permanece intacto en el tramo (la anomalía ya quedó marcada).
 *
 * Los tramos deben venir ORDENADOS por `secuencia` ascendente.
 */
export function calcularDuraciones(
  tramos: readonly Tramo[],
  cerradoAt: Date | null,
  ahora: Date,
): Duraciones {
  if (tramos.length === 0) {
    return { efectivoMs: 0, pausadoMs: 0, transcurridoMs: 0, pausas: 0, abierta: cerradoAt === null };
  }
  const orden = [...tramos].sort((a, b) => a.secuencia - b.secuencia);
  const frontera = cerradoAt ?? ahora;
  let efectivo = 0;
  let pausado = 0;
  let pausas = 0;
  for (let i = 0; i < orden.length; i += 1) {
    const t = orden[i]!;
    const fin = i + 1 < orden.length ? orden[i + 1]!.ocurridoAt : frontera;
    const dur = Math.max(0, fin.getTime() - t.ocurridoAt.getTime());
    if (t.tipo === "pausa") {
      pausado += dur;
      pausas += 1;
    } else {
      efectivo += dur;
    }
  }
  return {
    efectivoMs: efectivo,
    pausadoMs: pausado,
    transcurridoMs: efectivo + pausado,
    pausas,
    abierta: cerradoAt === null,
  };
}
