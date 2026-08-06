/**
 * DGP-014 · Mutaciones del módulo preventivo con degradación Offline First.
 *
 * Cada mutación intenta el POST/PUT directo; si falla por red, encola la
 * operación (mismo comando que consume `/sync`, entrada COMPLETA + opId) para
 * replay idempotente posterior. NO contiene lógica de negocio: sólo transporta
 * el comando. Las operaciones gobernadas por Workflow (transiciones) NUNCA hacen
 * bypass: envían SU acción explícita al motor. Los conflictos 409 propagan (no
 * se encolan). Los cuerpos coinciden EXACTAMENTE con los esquemas del contrato
 * OpenAPI congelado (verificado por `preventivo-contract.test.ts`). Las
 * creaciones acuñan el `id` en cliente (UUID) para idempotencia del alta.
 */
import { preventivoFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO, type AccionPrograma } from "./constantes";
import type { EntradaPrograma, EntradaActividad, EntradaGenerar } from "./alta";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/* ------------------------------- Programas ------------------------------ */

/** Crea un programa preventivo (queda en BORRADOR). Acuña `id` y `opId`. */
export async function crearPrograma(cola: ColaSync, input: EntradaPrograma, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId, nombre: input.nombre, tipo: input.tipo };
  if (input.descripcion !== undefined) cuerpo.descripcion = input.descripcion;
  if (input.codigo !== undefined) cuerpo.codigo = input.codigo;
  if (input.clasificacion !== undefined) cuerpo.clasificacion = input.clasificacion;
  if (input.padreId !== undefined) cuerpo.padreId = input.padreId;
  if (input.planes !== undefined) cuerpo.planes = input.planes;
  if (input.activos !== undefined) cuerpo.activos = input.activos;
  if (input.vigencia !== undefined) cuerpo.vigencia = input.vigencia;
  if (input.sla !== undefined) cuerpo.sla = input.sla;
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-programa`,
    input: cuerpo,
    descripcion: `Crear programa ${input.nombre}`,
    directo: () => preventivoFetch("/programas", { method: "POST", body: cuerpo }),
  });
}

export interface EntradaEditarPrograma {
  nombre?: string;
  descripcion?: string | null;
  planes?: EntradaPrograma["planes"];
  activos?: string[];
  vigencia?: EntradaPrograma["vigencia"];
  sla?: Record<string, unknown> | null;
}

/** Edita un programa (anclado a expectedVersion). */
export async function editarPrograma(cola: ColaSync, id: string, expectedVersion: number, cambios: EntradaEditarPrograma): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, expectedVersion, opId };
  for (const [k, val] of Object.entries(cambios)) if (val !== undefined) cuerpo[k] = val;
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar-programa`,
    input: cuerpo,
    descripcion: `Editar programa ${id}`,
    directo: () => preventivoFetch(`/programas/${encodeURIComponent(id)}`, { method: "PUT", body: cuerpo }),
  });
}

/**
 * Aplica una transición REAL del Workflow al programa. La UI envía SU acción
 * concreta (enviarRevision|publicar|suspender|reanudar|archivar) anclada a
 * `expectedVersion`. Endpoint gobernado: `POST /programas/:id/transicion`.
 */
export async function transicionarPrograma(cola: ColaSync, id: string, accion: AccionPrograma, expectedVersion: number): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, accion, expectedVersion, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar-programa`,
    input: cuerpo,
    descripcion: `Programa ${id}: ${accion}`,
    directo: () => preventivoFetch(`/programas/${encodeURIComponent(id)}/transicion`, { method: "POST", body: cuerpo }),
  });
}

/** Crea una nueva versión de trabajo del programa (anclada a versión). */
export async function versionarPrograma(cola: ColaSync, id: string, expectedVersion: number, cambios: EntradaEditarPrograma = {}): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, expectedVersion, opId };
  for (const [k, val] of Object.entries(cambios)) if (val !== undefined) cuerpo[k] = val;
  return mutarConOffline(cola, {
    comando: `${MODULO}.versionar-programa`,
    input: cuerpo,
    descripcion: `Versionar programa ${id}`,
    directo: () => preventivoFetch(`/programas/${encodeURIComponent(id)}/versionar`, { method: "POST", body: cuerpo }),
  });
}

/** Revierte el programa a una versión histórica concreta (anclado a versión). */
export async function revertirPrograma(cola: ColaSync, id: string, expectedVersion: number, haciaVersion: number): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, haciaVersion, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.revertir-programa`,
    input: cuerpo,
    descripcion: `Revertir programa ${id} → v${haciaVersion}`,
    directo: () => preventivoFetch(`/programas/${encodeURIComponent(id)}/revertir`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------ Actividades ----------------------------- */

/** Define una actividad del programa. Acuña `id` y `opId`. */
export async function definirActividad(cola: ColaSync, input: EntradaActividad, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    programaId: input.programaId,
    nombre: input.nombre,
    orden: input.orden,
    checklist: input.checklist,
    tiempoEstimado: input.tiempoEstimado,
    moneda: input.moneda,
  };
  if (input.descripcion !== undefined) cuerpo.descripcion = input.descripcion;
  if (input.dependencias !== undefined) cuerpo.dependencias = input.dependencias;
  if (input.recursos !== undefined) cuerpo.recursos = input.recursos;
  if (input.sla !== undefined) cuerpo.sla = input.sla;
  return mutarConOffline(cola, {
    comando: `${MODULO}.definir-actividad`,
    input: cuerpo,
    descripcion: `Definir actividad ${input.nombre}`,
    directo: () => preventivoFetch(`/actividades`, { method: "POST", body: cuerpo }),
  });
}

/* -------------------------------- Generar ------------------------------- */

/**
 * Genera (materializa) una OT preventiva por vencimiento. IDEMPOTENTE por
 * `opId`: la respuesta distingue `materializada` vs `pendiente` e `idempotente`.
 */
export async function generar(cola: ColaSync, input: EntradaGenerar, ids: { id?: string; opId?: string } = {}): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    programaId: input.programaId,
    actividadId: input.actividadId,
    activoId: input.activoId,
    ventana: input.ventana,
    origen: input.origen,
    fechaObjetivo: input.fechaObjetivo,
  };
  if (input.corresponde !== undefined) cuerpo.corresponde = input.corresponde;
  return mutarConOffline(cola, {
    comando: `${MODULO}.generar`,
    input: cuerpo,
    descripcion: `Generar OT (${input.programaId}/${input.activoId})`,
    directo: () => preventivoFetch(`/generar`, { method: "POST", body: cuerpo }),
  });
}

/* --------------------- Acciones de programación ------------------------- */

export interface EntradaReprogramar {
  programaId: string;
  fechaOriginal: string;
  fechaNueva: string;
  motivo: string;
  actividadId?: string | null;
  activoId?: string | null;
}

/** Reprograma una ocurrencia (motivo obligatorio, de catálogo). */
export async function reprogramar(cola: ColaSync, input: EntradaReprogramar): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const id = nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    programaId: input.programaId,
    fechaOriginal: input.fechaOriginal,
    fechaNueva: input.fechaNueva,
    motivo: input.motivo,
  };
  if (input.actividadId !== undefined) cuerpo.actividadId = input.actividadId;
  if (input.activoId !== undefined) cuerpo.activoId = input.activoId;
  return mutarConOffline(cola, {
    comando: `${MODULO}.reprogramar`,
    input: cuerpo,
    descripcion: `Reprogramar ${input.programaId}`,
    directo: () => preventivoFetch(`/reprogramar`, { method: "POST", body: cuerpo }),
  });
}

export interface EntradaSuspender {
  programaId: string;
  ambito: string;
  sujetoId: string;
  motivo: string;
  desde: string;
  hasta?: string | null;
  actividadId?: string | null;
  activoId?: string | null;
}

/** Suspende un ámbito (programa|actividad|activo). Motivo y desde obligatorios. */
export async function suspender(cola: ColaSync, input: EntradaSuspender): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const id = nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    programaId: input.programaId,
    ambito: input.ambito,
    sujetoId: input.sujetoId,
    motivo: input.motivo,
    desde: input.desde,
  };
  if (input.hasta !== undefined) cuerpo.hasta = input.hasta;
  if (input.actividadId !== undefined) cuerpo.actividadId = input.actividadId;
  if (input.activoId !== undefined) cuerpo.activoId = input.activoId;
  return mutarConOffline(cola, {
    comando: `${MODULO}.suspender`,
    input: cuerpo,
    descripcion: `Suspender ${input.ambito} ${input.sujetoId}`,
    directo: () => preventivoFetch(`/suspender`, { method: "POST", body: cuerpo }),
  });
}

export interface EntradaExcluir {
  programaId: string;
  desde: string;
  hasta: string;
  motivo: string;
  activos?: string[];
}

/** Excluye un rango de fechas (opcionalmente por activos). */
export async function excluir(cola: ColaSync, input: EntradaExcluir): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const id = nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id, opId,
    programaId: input.programaId,
    desde: input.desde,
    hasta: input.hasta,
    motivo: input.motivo,
  };
  if (input.activos !== undefined && input.activos.length > 0) cuerpo.activos = input.activos;
  return mutarConOffline(cola, {
    comando: `${MODULO}.excluir`,
    input: cuerpo,
    descripcion: `Excluir rango ${input.desde}…${input.hasta}`,
    directo: () => preventivoFetch(`/excluir`, { method: "POST", body: cuerpo }),
  });
}

/** Reproyecta el calendario preventivo (recalcula ocurrencias). */
export async function reproyectar(cola: ColaSync, programaId: string): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { programaId, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.reproyectar`,
    input: cuerpo,
    descripcion: `Reproyectar ${programaId}`,
    directo: () => preventivoFetch(`/reproyectar`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------- Catálogos ------------------------------ */

export interface EntradaCatalogoUpsert {
  catalogo: string;
  clave: string;
  etiqueta?: string;
  habilitado?: boolean;
}

/** Da de alta/actualiza una opción de un catálogo del tenant. */
export async function upsertCatalogo(cola: ColaSync, input: EntradaCatalogoUpsert): Promise<ResultadoMutacion> {
  const cuerpo: Record<string, unknown> = { catalogo: input.catalogo, clave: input.clave };
  if (input.etiqueta !== undefined) cuerpo.etiqueta = input.etiqueta;
  if (input.habilitado !== undefined) cuerpo.habilitado = input.habilitado;
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-upsert`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.clave}`,
    directo: () => preventivoFetch("/catalogos", { method: "POST", body: cuerpo }),
  });
}

/** Habilita/deshabilita una opción de un catálogo. */
export async function habilitarCatalogo(cola: ColaSync, input: { catalogo: string; clave: string; habilitado: boolean }): Promise<ResultadoMutacion> {
  const cuerpo = { catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado };
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-habilitar`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.habilitado ? "habilitar" : "deshabilitar"} ${input.clave}`,
    directo: () => preventivoFetch("/catalogos/habilitar", { method: "POST", body: cuerpo }),
  });
}
