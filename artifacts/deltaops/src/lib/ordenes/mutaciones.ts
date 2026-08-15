/**
 * DGP-009.3 · Mutaciones del módulo de Órdenes con degradación offline.
 *
 * Cada mutación intenta el POST/PUT directo; si falla por red, encola la
 * operación (mismo comando del módulo que consume /sync) para sincronización
 * posterior. NO contiene lógica de negocio: solo transporta el comando.
 */
import { ordenesFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO } from "./constantes";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/** Crea una orden (estado BORRADOR). */
export async function crearOrden(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear`,
    input: cuerpo,
    descripcion: `Crear orden ${String(input.titulo ?? "")}`,
    directo: () => ordenesFetch("", { method: "POST", body: cuerpo }),
  });
}

/** Edita una orden. */
export async function editarOrden(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  cambios: Record<string, unknown>,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, opId, ...cambios };
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar`,
    input: cuerpo,
    descripcion: `Editar orden ${id}`,
    directo: () => ordenesFetch(`/${id}`, { method: "PUT", body: cuerpo }),
  });
}

/**
 * Dispara una transición del Workflow Engine. `comando` es el nombre NEUTRO
 * (abrir/planificar/iniciar/…); el motor resuelve la transición aplicable.
 */
export async function transicionar(
  cola: ColaSync,
  id: string,
  comando: string,
  extra: Record<string, unknown> = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, comando, opId, ...extra };
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar`,
    input: cuerpo,
    descripcion: `Transición «${comando}» de ${id}`,
    directo: () => ordenesFetch(`/${id}/transicionar`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Aprueba (o rechaza) el cierre de una orden en validación.
 *
 * El contrato CONGELADO de Órdenes (`modulo.ordenes.aprobarCierre`) exige
 * `decision: "aprobar" | "rechazar"` (no un booleano): aquí se traduce la
 * intención de la UI al shape EXACTO que valida el backend, tanto en el POST
 * directo como en el replay de la cola offline (mismo `input`). Enviar `aprobado`
 * hacía fallar la validación con «Entrada inválida» (HTTP 400).
 */
export async function aprobarCierre(
  cola: ColaSync,
  id: string,
  aprobado: boolean,
  motivo?: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const decision = aprobado ? "aprobar" : "rechazar";
  const cuerpo = {
    id,
    decision,
    opId,
    ...(!aprobado && motivo ? { motivo } : {}),
  };
  return mutarConOffline(cola, {
    comando: `${MODULO}.aprobarCierre`,
    input: cuerpo,
    descripcion: `${aprobado ? "Aprobar" : "Rechazar"} cierre de ${id}`,
    directo: () => ordenesFetch(`/${id}/aprobar-cierre`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Resuelve el cierre gobernado de una OT en EN_VALIDACION en los DOS pasos que
 * exige el contrato CONGELADO de Órdenes:
 *   1) `transicionar("cerrar")` — ABRE el gate de aprobación `validacionCierre`
 *      (la OT permanece en EN_VALIDACION; el motor es IDEMPOTENTE si el gate ya
 *      está pendiente, por lo que reintentos/reclics son seguros).
 *   2) `aprobarCierre(decision)` — DECIDE ese gate (aprobar⇒CERRADA, rechazar⇒
 *      vuelve a EN_EJECUCION).
 *
 * La ficha (y el panel de supervisor) mapeaban el botón «Aprobar y cerrar»
 * DIRECTAMENTE a `aprobarCierre`, SALTÁNDOSE el paso 1. Como el gate nunca se
 * abría, el backend respondía «No hay aprobación pendiente para "cerrar"»
 * (KRN-CFL) —o, según el estado del agregado, «No encontrado: orden-trabajo»—,
 * bloqueando el cierre por HTTP. Esta función encadena ambos pasos con el mismo
 * soporte offline que el resto de mutaciones (cada paso se encola por separado y
 * es idempotente por su propio opId).
 */
export async function resolverCierre(
  cola: ColaSync,
  id: string,
  aprobado: boolean,
  motivo?: string,
): Promise<ResultadoMutacion> {
  // Paso 1: abrir el gate. Si queda ENCOLADO (offline) o falla, no seguimos: el
  // paso 2 sin gate abierto sería un conflicto garantizado.
  const abrir = await transicionar(cola, id, "cerrar");
  if (abrir.error || abrir.encolada) return abrir;
  // Paso 2: decidir el gate ya pendiente.
  return aprobarCierre(cola, id, aprobado, motivo);
}

/** Asigna responsable/supervisor. */
export async function asignar(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  campos: { responsable?: string | null; supervisor?: string | null },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, opId, ...campos };
  return mutarConOffline(cola, {
    comando: `${MODULO}.asignar`,
    input: cuerpo,
    descripcion: `Asignar recursos de ${id}`,
    directo: () => ordenesFetch(`/${id}/asignar`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Campos de la ejecución de una OT (todos opcionales; se completan a lo largo
 * del ciclo). Espeja el `inputSchema` del comando backend
 * `modulo.ordenes.registrarEjecucion`: `diagnostico` (bloque técnico strict),
 * `tiempoReal`/`costoReal` (duración/costo) y `observaciones` (texto libre).
 *
 * IMPORTANTE (bug histórico corregido): NO se debe enviar el diagnóstico como un
 * objeto con claves ajenas al esquema `Diagnostico` ({motivo,causa,diagnostico,
 * solucion}); hacerlo dispara "Diagnóstico inválido" por el `.strict()` del
 * dominio. Horas → `tiempoReal.minutos`; observaciones → `observaciones`.
 */
export interface CamposEjecucion {
  readonly diagnostico?: {
    motivo?: string;
    causa?: string;
    diagnostico?: string;
    solucion?: string;
  };
  readonly tiempoReal?: { minutos: number; detalle?: string };
  readonly costoReal?: unknown;
  readonly observaciones?: string;
}

/** Registra ejecución (diagnóstico/tiempos/costos/observaciones). */
export async function registrarEjecucion(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  campos: CamposEjecucion = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  // Sólo se envían los campos presentes: el backend actualiza lo aportado y
  // conserva el resto de la ejecución (no pisa con undefined).
  const cuerpo: Record<string, unknown> = { id, expectedVersion, opId };
  if (campos.diagnostico !== undefined) cuerpo.diagnostico = campos.diagnostico;
  if (campos.tiempoReal !== undefined) cuerpo.tiempoReal = campos.tiempoReal;
  if (campos.costoReal !== undefined) cuerpo.costoReal = campos.costoReal;
  if (campos.observaciones !== undefined) cuerpo.observaciones = campos.observaciones;
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrarEjecucion`,
    input: cuerpo,
    descripcion: `Registrar ejecución de ${id}`,
    directo: () => ordenesFetch(`/${id}/ejecucion`, { method: "POST", body: cuerpo }),
  });
}

/** Registra un evento de bitácora operacional (8 acciones canónicas). */
export async function registrarBitacora(
  cola: ColaSync,
  ordenId: string,
  accion: string,
  detalle: Record<string, unknown> = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { ordenId, accion, detalle, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.bitacora.registrar`,
    input: cuerpo,
    descripcion: `Bitácora «${accion}» de ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/bitacora`, { method: "POST", body: cuerpo }),
  });
}

/** Planifica/reprograma una orden (ventanas y fechas). */
export async function planificar(
  cola: ColaSync,
  ordenId: string,
  datos: Record<string, unknown>,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { ordenId, opId, ...datos };
  return mutarConOffline(cola, {
    comando: `${MODULO}.planificar`,
    input: cuerpo,
    descripcion: `Planificar ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/planificar`, { method: "POST", body: cuerpo }),
  });
}

/** Asigna un recurso humano (técnico/cuadrilla). */
export async function asignarRecursoHumano(
  cola: ColaSync,
  ordenId: string,
  datos: Record<string, unknown>,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { ordenId, opId, ...datos };
  return mutarConOffline(cola, {
    comando: `${MODULO}.asignar-recurso-humano`,
    input: cuerpo,
    descripcion: `Asignar recurso humano a ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/asignar-recurso-humano`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Registra un recurso. Alineado con el comando `registrar-recurso`:
 * `clase` (herramienta/material/epp/vehiculo/equipo-auxiliar) + `referenciaId`
 * obligatorios; `descripcion/cantidad/unidad` opcionales.
 */
export async function registrarRecurso(
  cola: ColaSync,
  ordenId: string,
  datos: {
    clase: string;
    referenciaId: string;
    descripcion?: string | null;
    cantidad?: number | null;
    unidad?: string | null;
    // §15 · Consumo ligero: costo (dinero string), proveedor y observación.
    costo?: string | null;
    proveedorId?: string | null;
    observacion?: string | null;
  },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    ordenId,
    opId,
    clase: datos.clase,
    referenciaId: datos.referenciaId,
    descripcion: datos.descripcion ?? null,
    cantidad: datos.cantidad ?? null,
    unidad: datos.unidad ?? null,
  };
  // Sólo enviar los opcionales de consumo ligero si vienen con contenido: el
  // backend valida el costo como decimal string estricto.
  if (datos.costo != null && datos.costo !== "") cuerpo["costo"] = datos.costo;
  if (datos.proveedorId != null && datos.proveedorId !== "") cuerpo["proveedorId"] = datos.proveedorId;
  if (datos.observacion != null && datos.observacion !== "") cuerpo["observacion"] = datos.observacion;
  return mutarConOffline(cola, {
    comando: `${MODULO}.registrar-recurso`,
    input: cuerpo,
    descripcion: `Registrar recurso ${datos.clase} (${datos.referenciaId}) en ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/recursos`, { method: "POST", body: cuerpo }),
  });
}

/** Define/actualiza el SLA de la orden. */
export async function definirSla(
  cola: ColaSync,
  ordenId: string,
  datos: Record<string, unknown>,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { ordenId, opId, ...datos };
  return mutarConOffline(cola, {
    comando: `${MODULO}.sla.definir`,
    input: cuerpo,
    descripcion: `Definir SLA de ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/sla`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Registra una evidencia REFERENCIA-ONLY. El flujo REAL (patrón Attachment
 * Service, igual que Activos DGP-008.3) es en dos fases en el servidor:
 * `platform.attachment.register` (obtiene el attachmentId a partir de los
 * metadatos + hash, sin subir el binario) → `agregarEvidencia` anclada a
 * `expectedVersion`. Como el registro del adjunto es un paso ONLINE de
 * plataforma, esta operación NO se encola offline: si falla la red devuelve un
 * error explícito (no se puede obtener un attachmentId sin conexión).
 */
export async function agregarEvidencia(
  _cola: ColaSync,
  id: string,
  expectedVersion: number,
  meta: {
    categoria?: string;
    nombreArchivo: string;
    mimeType: string;
    tamanoBytes: number;
    hashSha256: string;
  },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { ...meta, expectedVersion, opId };
  try {
    const resultado = await ordenesFetch(`/${id}/documentacion`, { method: "POST", body: cuerpo });
    return { encolada: false, resultado };
  } catch (e) {
    const err = e as Error;
    const esRed = err.name === "TypeError" || /fetch|network|failed/i.test(err.message);
    return {
      encolada: false,
      error: esRed
        ? new Error("El registro de evidencias requiere conexión (el Attachment Service de plataforma asigna la referencia).")
        : err,
    };
  }
}

export interface RefPlantilla {
  servicio?: string;
  clave: string;
  version: number;
  etiqueta?: string;
}

/**
 * Asocia un formulario (Dynamic Forms) a la OT. Alineado con el comando
 * `asociarFormulario`: `{expectedVersion, plantilla:{servicio?,clave,version,
 * etiqueta?}, respuestaId?}`. El módulo VERIFICA la plantilla contra el runtime
 * real de Dynamic Forms (existencia/clase/versión N|N-1); el frontend no valida.
 */
export async function asociarFormulario(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  plantilla: RefPlantilla,
  respuestaId?: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, plantilla, ...(respuestaId ? { respuestaId } : {}), opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.asociarFormulario`,
    input: cuerpo,
    descripcion: `Asociar formulario ${plantilla.clave} a ${id}`,
    directo: () => ordenesFetch(`/${id}/formulario`, { method: "POST", body: cuerpo }),
  });
}

/** Asocia un checklist (Dynamic Forms) a la OT. Mismo contrato que formulario. */
export async function asociarChecklist(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  plantilla: RefPlantilla,
  respuestaId?: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, plantilla, ...(respuestaId ? { respuestaId } : {}), opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.asociarChecklist`,
    input: cuerpo,
    descripcion: `Asociar checklist ${plantilla.clave} a ${id}`,
    directo: () => ordenesFetch(`/${id}/checklist`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Captura la RESPUESTA de un formulario/checklist asociado (flujo REAL Dynamic
 * Forms), **Offline First**. Se modela como una ÚNICA operación del módulo: el
 * comando orquestador `${MODULO}.capturarRespuesta` compone en el servidor
 * guardar borrador (anclado a clave+versión) → enviar → asociar a la OT
 * (re-leyendo su versión ACTUAL), es idempotente por `opId` y RECUPERABLE. Por
 * ser un comando único, si falla la red la operación se **encola** y se replaya
 * vía `/sync` con el MISMO `opId` (converge al mismo resultado, sin duplicar ni
 * dejar respuestas huérfanas). El técnico puede capturar sin conexión.
 *
 * `expectedVersion` NO se envía: el anclaje re-lee la versión actual de la OT en
 * el servidor, lo que hace el reintento inmune a conflictos de versión.
 */
export async function capturarRespuestaPlantilla(
  cola: ColaSync,
  ordenId: string,
  clase: "formulario" | "checklist",
  plantilla: { clave: string; version: number; etiqueta?: string },
  datos: Record<string, unknown>,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  // Entrada COMPLETA del comando (para el replay por /sync desde la cola).
  const input = { id: ordenId, opId, clase, plantilla, datos };
  // Cuerpo del POST directo (online): id y clase viajan por la ruta.
  const cuerpo = { clave: plantilla.clave, version: plantilla.version, etiqueta: plantilla.etiqueta, datos, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.capturarRespuesta`,
    input,
    descripcion: `Capturar ${clase} ${plantilla.clave} v${plantilla.version} en ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/${clase}/respuesta`, { method: "POST", body: cuerpo }),
  });
}

/** Crea una relación entre órdenes/activos. */
export async function crearRelacion(
  cola: ColaSync,
  ordenId: string,
  datos: { tipo: string; destinoId: string; categoria?: string },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { ordenId, opId, ...datos };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-relacion`,
    input: cuerpo,
    descripcion: `Relación ${datos.tipo} de ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/relaciones`, { method: "POST", body: cuerpo }),
  });
}

/* ===================== DGP-020.2 · Sesiones de trabajo ==================== */

/** Acciones del ciclo de una sesión de trabajo (HTTP + comando /sync). */
export type AccionSesion = "abrir" | "pausar" | "reanudar" | "cerrar";

/**
 * Dispara un comando de la MÁQUINA DE SESIÓN de trabajo (abrir/pausar/reanudar/
 * cerrar), Offline First. Contrato DGP-020.2:
 *  - `identityId` y `activoId` NUNCA se envían: los deriva el backend del
 *    contexto autenticado y de la OT (evita identidad manipulable desde cliente).
 *  - `ocurridoAt` es HORA DEL DISPOSITIVO capturada AL PULSAR (no al sincronizar);
 *    se conserva íntegra al encolar para que el servidor la use como device-time
 *    y jamás la reemplace por su `registradoAt`.
 *  - `opId` garantiza idempotencia (una sola operación por opId, online u offline).
 *  - Ante fallo de red, `mutarConOffline` encola el MISMO comando oficial del
 *    runtime (`modulo.ordenes.sesion.<accion>`) que consume `/sync` — no hay una
 *    segunda cola ni rutas HTTP inventadas. El `input` encolado incluye `ordenId`
 *    (requerido por el comando) y `origen: "offline"`.
 *
 * `ocurridoAtIso` es inyectable para pruebas deterministas; por defecto es la
 * hora del dispositivo en el instante de la llamada (click).
 */
export async function ejecutarSesion(
  cola: ColaSync,
  ordenId: string,
  accion: AccionSesion,
  opts: { sesionId?: string; ocurridoAtIso?: string } = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const ocurridoAt = opts.ocurridoAtIso ?? new Date().toISOString();
  // Cuerpo del POST directo (online): `ordenId` viaja por la ruta.
  const cuerpo: Record<string, unknown> = { opId, ocurridoAt, origen: "online" };
  if (opts.sesionId) cuerpo.sesionId = opts.sesionId;
  // Entrada COMPLETA del comando para el replay por /sync desde la cola: incluye
  // `ordenId` (requerido) y marca `origen: "offline"` (conserva ocurridoAt).
  const input: Record<string, unknown> = { id: ordenId, ordenId, opId, ocurridoAt, origen: "offline" };
  if (opts.sesionId) input.sesionId = opts.sesionId;
  const etiqueta = { abrir: "Iniciar trabajo", pausar: "Pausar", reanudar: "Reanudar", cerrar: "Finalizar" }[accion];
  return mutarConOffline(cola, {
    comando: `${MODULO}.sesion.${accion}`,
    input,
    descripcion: `${etiqueta} sesión de ${ordenId}`,
    directo: () => ordenesFetch(`/${ordenId}/sesion/${accion}`, { method: "POST", body: cuerpo }),
  });
}

/** Abre una sesión de trabajo (primer tramo). */
export const abrirSesion = (cola: ColaSync, ordenId: string, opts?: { sesionId?: string; ocurridoAtIso?: string }) =>
  ejecutarSesion(cola, ordenId, "abrir", opts);
/** Pausa la sesión de trabajo abierta. */
export const pausarSesion = (cola: ColaSync, ordenId: string, opts?: { ocurridoAtIso?: string }) =>
  ejecutarSesion(cola, ordenId, "pausar", opts);
/** Reanuda la sesión de trabajo pausada. */
export const reanudarSesion = (cola: ColaSync, ordenId: string, opts?: { ocurridoAtIso?: string }) =>
  ejecutarSesion(cola, ordenId, "reanudar", opts);
/** Cierra la sesión de trabajo (estado final, sin reapertura). */
export const cerrarSesion = (cola: ColaSync, ordenId: string, opts?: { ocurridoAtIso?: string }) =>
  ejecutarSesion(cola, ordenId, "cerrar", opts);
