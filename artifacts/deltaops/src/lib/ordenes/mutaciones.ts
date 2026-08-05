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

/** Aprueba (o rechaza) el cierre de una orden en validación. */
export async function aprobarCierre(
  cola: ColaSync,
  id: string,
  aprobado: boolean,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, aprobado, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.aprobarCierre`,
    input: cuerpo,
    descripcion: `${aprobado ? "Aprobar" : "Rechazar"} cierre de ${id}`,
    directo: () => ordenesFetch(`/${id}/aprobar-cierre`, { method: "POST", body: cuerpo }),
  });
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

/** Registra ejecución (diagnóstico/tiempos). */
export async function registrarEjecucion(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  diagnostico: Record<string, unknown> = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, diagnostico, opId };
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
  },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = {
    ordenId,
    opId,
    clase: datos.clase,
    referenciaId: datos.referenciaId,
    descripcion: datos.descripcion ?? null,
    cantidad: datos.cantidad ?? null,
    unidad: datos.unidad ?? null,
  };
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
