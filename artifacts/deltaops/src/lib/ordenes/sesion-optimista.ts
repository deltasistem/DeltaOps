/**
 * DGP-020.2 (§19/§39) · Estado OPTIMISTA local de la sesión de trabajo a partir
 * de las operaciones ENCOLADAS (misma cola offline; NO hay una segunda cola).
 *
 * Motivación: sin conexión, al pulsar «Iniciar» la operación se encola pero el
 * read model del servidor aún dice «sin sesión». Para poder ejecutar la cadena
 * completa ABRIR→PAUSAR→REANUDAR→CERRAR offline —y ver estados intermedios
 * coherentes— derivamos un estado local plegando (fold) las operaciones de
 * sesión pendientes de ESTA OT, en orden FIFO, sobre el estado del servidor.
 *
 * Las duraciones locales se derivan de los `ocurridoAt` de cada click (la fuente
 * de campo real): esto es lo que el backend recomputará al sincronizar, porque
 * `/sync` reproduce cada comando con su `ocurridoAt` en orden. Se marcan como
 * «pendiente de sincronizar»: NO son definitivas; al reconectar y refrescar, el
 * read model del servidor SUSTITUYE este estado (§22).
 *
 * 100% puro y sin dependencias de React para poder probarse aislado.
 */
import type { OperacionCola } from "../offline/tipos";
import type { SesionTrabajo, DuracionesSesion, EstadoSesion } from "./tipos";
import { MODULO } from "./constantes";

/** Acción de sesión derivada del nombre de comando encolado. */
type AccionSesionCola = "abrir" | "pausar" | "reanudar" | "cerrar";

const SUFIJO_ACCION: Record<string, AccionSesionCola> = {
  [`${MODULO}.sesion.abrir`]: "abrir",
  [`${MODULO}.sesion.pausar`]: "pausar",
  [`${MODULO}.sesion.reanudar`]: "reanudar",
  [`${MODULO}.sesion.cerrar`]: "cerrar",
};

/** Operación de sesión normalizada (acción + ocurridoAt de campo). */
interface OpSesion {
  readonly accion: AccionSesionCola;
  readonly ocurridoAt: string;
}

/** ¿La operación está aún pendiente (no aplicada por el servidor)? */
function esPendiente(estado: string): boolean {
  return estado === "pendiente" || estado === "enviando" || estado === "reintentable";
}

/**
 * Extrae, en orden FIFO, las operaciones de sesión PENDIENTES de una OT.
 * (Filtra por `input.ordenId`; ignora acciones desconocidas y ops ya aplicadas.)
 */
export function opsSesionPendientes(operaciones: readonly OperacionCola[], ordenId: string): OpSesion[] {
  const out: OpSesion[] = [];
  for (const op of operaciones) {
    if (!esPendiente(op.estado)) continue;
    const accion = SUFIJO_ACCION[op.comando];
    if (!accion) continue;
    if ((op.input?.ordenId as string | undefined) !== ordenId) continue;
    const ocurridoAt = String(op.input?.ocurridoAt ?? op.encoladaAt);
    out.push({ accion, ocurridoAt });
  }
  return out;
}

/** Estado + duraciones optimistas resultantes del pliegue. */
export interface SesionOptimista {
  readonly sesion: SesionTrabajo | null;
  readonly duraciones: DuracionesSesion | null;
  /** Hay ≥1 operación de sesión encolada sin sincronizar para esta OT. */
  readonly pendienteSync: boolean;
}

const ESTADOS_ABIERTOS = new Set(["ABIERTA"]);

/**
 * Pliega las operaciones encoladas sobre el estado del servidor. `ahoraMs` marca
 * la frontera para el tramo aún abierto (efectivo/pausado en curso).
 *
 * Transiciones (espejo de la máquina de sesión pura del dominio):
 *   sin sesión --abrir--> ABIERTA
 *   ABIERTA    --pausar--> PAUSADA        (cierra tramo de trabajo)
 *   PAUSADA    --reanudar--> ABIERTA      (cierra tramo de pausa)
 *   *          --cerrar--> CERRADA        (frontera final)
 * Las transiciones inválidas se ignoran (defensa; el backend es la autoridad).
 */
export function derivarSesionOptimista(
  operaciones: readonly OperacionCola[],
  ordenId: string,
  sesionServidor: SesionTrabajo | null,
  duracionesServidor: DuracionesSesion | null,
  ahoraMs: number,
): SesionOptimista {
  const ops = opsSesionPendientes(operaciones, ordenId);
  if (ops.length === 0) {
    return { sesion: sesionServidor, duraciones: duracionesServidor, pendienteSync: false };
  }

  // Estado de partida: el del servidor si aporta una sesión no cerrada.
  let estado: EstadoSesion | "SIN_SESION" =
    sesionServidor && sesionServidor.estado !== "CERRADA" ? sesionServidor.estado : "SIN_SESION";
  let sesionId = sesionServidor?.id ?? "";
  let iniciadoAt = sesionServidor?.iniciadoAt ?? null;
  let cerradoAt: string | null = null;

  // Acumuladores derivados de los ocurridoAt de campo (base del servidor si aplica).
  let efectivoMs = duracionesServidor?.efectivoMs ?? 0;
  let pausadoMs = duracionesServidor?.pausadoMs ?? 0;
  let pausas = duracionesServidor?.pausas ?? 0;
  // Frontera del último tramo conocido: última lectura del servidor o iniciadoAt.
  let ultimaFronteraMs = iniciadoAt ? Date.parse(iniciadoAt) : NaN;
  // Si el servidor ya acumulaba, la frontera de continuación es «ahora - acumulado»
  // no es reconstruible con exactitud; para el caso offline puro (sin sesión
  // servidor) partimos del primer click, que es el escenario de §39.

  for (const op of ops) {
    const tMs = Date.parse(op.ocurridoAt);
    switch (op.accion) {
      case "abrir":
        if (estado !== "SIN_SESION") break; // inválido: ignorar
        estado = "ABIERTA";
        iniciadoAt = op.ocurridoAt;
        sesionId = sesionId || `local:${ordenId}`;
        ultimaFronteraMs = tMs;
        break;
      case "pausar":
        if (estado !== "ABIERTA") break;
        if (Number.isFinite(ultimaFronteraMs) && Number.isFinite(tMs)) efectivoMs += Math.max(0, tMs - ultimaFronteraMs);
        estado = "PAUSADA";
        pausas += 1;
        ultimaFronteraMs = tMs;
        break;
      case "reanudar":
        if (estado !== "PAUSADA") break;
        if (Number.isFinite(ultimaFronteraMs) && Number.isFinite(tMs)) pausadoMs += Math.max(0, tMs - ultimaFronteraMs);
        estado = "ABIERTA";
        ultimaFronteraMs = tMs;
        break;
      case "cerrar":
        if (estado !== "ABIERTA" && estado !== "PAUSADA") break;
        if (Number.isFinite(ultimaFronteraMs) && Number.isFinite(tMs)) {
          const delta = Math.max(0, tMs - ultimaFronteraMs);
          if (estado === "ABIERTA") efectivoMs += delta;
          else pausadoMs += delta;
        }
        estado = "CERRADA";
        cerradoAt = op.ocurridoAt;
        ultimaFronteraMs = tMs;
        break;
    }
  }

  if (estado === "SIN_SESION") {
    // Las ops no produjeron una sesión coherente (p.ej. sólo transiciones
    // inválidas): conservamos el estado del servidor.
    return { sesion: sesionServidor, duraciones: duracionesServidor, pendienteSync: true };
  }

  // Tramo en curso hasta «ahora» para sesiones no cerradas (acumulado en vivo).
  if (estado !== "CERRADA" && Number.isFinite(ultimaFronteraMs)) {
    const delta = Math.max(0, ahoraMs - ultimaFronteraMs);
    if (ESTADOS_ABIERTOS.has(estado)) efectivoMs += delta;
    else pausadoMs += delta;
  }

  const identityId = sesionServidor?.identityId ?? "";
  const activoId = sesionServidor?.activoId ?? null;
  const iniISO = iniciadoAt ?? new Date(ahoraMs).toISOString();

  const sesion: SesionTrabajo = {
    id: sesionId,
    ordenId,
    activoId,
    identityId,
    estado: estado as EstadoSesion,
    origen: "offline",
    iniciadoAt: iniISO,
    cerradoAt,
    registradoAt: iniISO,
    actualizadoAt: new Date(ahoraMs).toISOString(),
  };

  const duraciones: DuracionesSesion = {
    sesionId,
    ordenId,
    activoId,
    identityId,
    estado,
    efectivoMs,
    pausadoMs,
    transcurridoMs: efectivoMs + pausadoMs,
    pausas,
    abierta: estado !== "CERRADA",
    iniciadoAt: iniISO,
    cerradoAt,
  };

  return { sesion, duraciones, pendienteSync: true };
}
