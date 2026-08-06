/**
 * DGP-012 · Mutaciones del módulo de Planes con degradación Offline First.
 *
 * Cada mutación intenta el POST/PUT directo; si falla por red, encola la
 * operación (mismo comando que consume `/sync`, entrada COMPLETA + opId) para
 * replay idempotente posterior. NO contiene lógica de negocio: sólo transporta
 * el comando. Las operaciones gobernadas por Workflow (transiciones, publicar,
 * rollback, archivar) NUNCA hacen bypass: envían la decisión explícita del
 * usuario (incluida SU acción concreta y el motivo obligatorio) al motor.
 *
 * Los cuerpos coinciden EXACTAMENTE con los esquemas del contrato OpenAPI
 * congelado (verificado por `planes-contract.test.ts`). Los comandos de
 * CREACIÓN acuñan el `id` en cliente (UUID) para idempotencia del alta.
 */
import { planesFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO, type AccionPlan } from "./constantes";
import type { Alcance, Rutina, Programa } from "./tipos";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/* -------------------------------- Planes -------------------------------- */

export interface EntradaCrearPlan {
  nombre: string;
  descripcion?: string | null;
  tipoPlan: string;
  estrategia: string;
  prioridad: string;
  alcance: Alcance;
  rutina: Rutina;
  programa: Programa;
  id?: string;
  opId?: string;
}

/** Crea un plan (queda en BORRADOR, gobernado por Workflow). Acuña `id`. */
export async function crearPlan(cola: ColaSync, input: EntradaCrearPlan): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id,
    opId,
    nombre: input.nombre,
    tipoPlan: input.tipoPlan,
    estrategia: input.estrategia,
    prioridad: input.prioridad,
    alcance: input.alcance,
    rutina: input.rutina,
    programa: input.programa,
  };
  if (input.descripcion !== undefined) cuerpo.descripcion = input.descripcion;
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-plan`,
    input: cuerpo,
    descripcion: `Crear plan ${input.nombre}`,
    directo: () => planesFetch("", { method: "POST", body: cuerpo }),
  });
}

export interface EntradaEditarPlan {
  nombre?: string;
  descripcion?: string | null;
  alcance?: Alcance;
  rutina?: Rutina;
  programa?: Programa;
}

/** Edita un plan (anclado a expectedVersion; nunca versiones publicadas). */
export async function editarPlan(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  cambios: EntradaEditarPlan,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, expectedVersion, opId };
  for (const [k, v] of Object.entries(cambios)) {
    if (v !== undefined) cuerpo[k] = v;
  }
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar-plan`,
    input: cuerpo,
    descripcion: `Editar plan ${id}`,
    directo: () => planesFetch(`/${id}`, { method: "PUT", body: cuerpo }),
  });
}

/* ---------------------------- Workflow del plan ------------------------- */

/** Publica la versión de trabajo (BORRADOR → VIGENTE). Anclado a versión. */
export async function publicarPlan(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.publicar-plan`,
    input: cuerpo,
    descripcion: `Publicar plan ${id}`,
    directo: () => planesFetch(`/${id}/publicar`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Aplica una transición REAL del Workflow al plan. La UI envía SU acción
 * concreta (`suspender`/`reanudar`/`posponer`/`extender`/`cancelar`/
 * `reprogramar`) — nunca se mapea todo a un comando único. El contrato exige
 * SIEMPRE `motivo`; las acciones con horizonte temporal envían además `hasta`.
 * Endpoint gobernado: `POST /:id/transicion`.
 */
export async function transicionarPlan(
  cola: ColaSync,
  id: string,
  accion: AccionPlan,
  expectedVersion: number,
  motivo: string,
  opciones: { hasta?: string; nota?: string } = {},
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, accion, expectedVersion, motivo, opId };
  if (opciones.hasta !== undefined && opciones.hasta !== "") cuerpo.hasta = opciones.hasta;
  if (opciones.nota !== undefined && opciones.nota !== "") cuerpo.nota = opciones.nota;
  return mutarConOffline(cola, {
    comando: `${MODULO}.transicionar-plan`,
    input: cuerpo,
    descripcion: `Plan ${id}: ${accion}`,
    directo: () => planesFetch(`/${id}/transicion`, { method: "POST", body: cuerpo }),
  });
}

/** Archiva un plan (retiro definitivo). Anclado a versión. */
export async function archivarPlan(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.archivar-plan`,
    input: cuerpo,
    descripcion: `Archivar plan ${id}`,
    directo: () => planesFetch(`/${id}/archivar`, { method: "POST", body: cuerpo }),
  });
}

/** Restaura una versión histórica concreta (rollback). Anclado a versión. */
export async function rollbackPlan(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  versionDestino: number,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, versionDestino, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.rollback-plan`,
    input: cuerpo,
    descripcion: `Rollback plan ${id} → v${versionDestino}`,
    directo: () => planesFetch(`/${id}/rollback`, { method: "POST", body: cuerpo }),
  });
}

/* ----------------------------- Calendarios ------------------------------ */

export interface EntradaCalendario {
  tipo: string;
  ambito: string;
  nombre: string;
  turnos?: Array<{ clave: string; inicioMin: number; finMin: number }>;
  ventanas?: Array<{ tipo: string; desde: string; hasta: string; etiqueta?: string }>;
  exclusiones?: Array<{ tipo: string; desde: string; hasta: string; etiqueta?: string }>;
  id?: string;
  opId?: string;
}

/** Crea un calendario operacional (por empresa/proyecto/activo). Acuña `id`. */
export async function crearCalendario(cola: ColaSync, input: EntradaCalendario): Promise<ResultadoMutacion> {
  const opId = input.opId ?? nuevoOpId();
  const id = input.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { id, opId, tipo: input.tipo, ambito: input.ambito, nombre: input.nombre };
  if (input.turnos) cuerpo.turnos = input.turnos;
  if (input.ventanas) cuerpo.ventanas = input.ventanas;
  if (input.exclusiones) cuerpo.exclusiones = input.exclusiones;
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-calendario`,
    input: cuerpo,
    descripcion: `Crear calendario ${input.nombre}`,
    directo: () => planesFetch("/calendarios", { method: "POST", body: cuerpo }),
  });
}

/* ----------------------------- Generación ------------------------------- */

export interface EntradaEvaluar {
  activoId: string;
  origen: string;
  ahora: string;
  anclaje: { desde: string; medidoresBase?: Record<string, unknown>; eventosBase?: Record<string, unknown> };
  medidores?: Record<string, unknown>;
  eventos?: Record<string, unknown>;
  ocurrenciaManual?: string;
}

/**
 * Evalúa si el plan debe generar una orden AHORA (sin efectos). El resultado
 * (debe generar, ocurrencia, clave de deduplicación) se muestra al usuario.
 */
export async function evaluarGeneracion(
  cola: ColaSync,
  planId: string,
  input: EntradaEvaluar,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    planId,
    activoId: input.activoId,
    origen: input.origen,
    ahora: input.ahora,
    anclaje: input.anclaje,
    opId,
  };
  if (input.medidores) cuerpo.medidores = input.medidores;
  if (input.eventos) cuerpo.eventos = input.eventos;
  if (input.ocurrenciaManual !== undefined && input.ocurrenciaManual !== "") cuerpo.ocurrenciaManual = input.ocurrenciaManual;
  return mutarConOffline(cola, {
    comando: `${MODULO}.evaluar-generacion`,
    input: cuerpo,
    descripcion: `Evaluar generación ${planId} (${input.origen})`,
    directo: () => planesFetch(`/${planId}/evaluar-generacion`, { method: "POST", body: cuerpo }),
  });
}

/**
 * Orquesta la materialización de Órdenes de Trabajo preventivas (IDEMPOTENTE:
 * nunca duplica; la respuesta distingue creadas vs idempotentes vs errores).
 *
 * Es un COMANDO OFICIAL aceptado por `/sync`: la UI acuña un `opId` (UUID) de
 * cliente que actúa como clave de deduplicación estable, por lo que la operación
 * se ENCOLA offline por el protocolo estándar y su replay es idempotente por
 * `opId` (el contrato permite `opId` en el input: additionalProperties:false).
 */
export async function generarOrdenesPreventivas(
  cola: ColaSync,
  planId: string,
  opciones: { limite?: number; tipoOrden?: string; opId?: string } = {},
): Promise<ResultadoMutacion> {
  const opId = opciones.opId ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { planId, opId };
  if (opciones.limite !== undefined) cuerpo.limite = opciones.limite;
  if (opciones.tipoOrden !== undefined && opciones.tipoOrden !== "") cuerpo.tipoOrden = opciones.tipoOrden;
  return mutarConOffline(cola, {
    comando: `${MODULO}.generar-ordenes-preventivas`,
    input: cuerpo,
    descripcion: `Generar órdenes preventivas de ${planId}`,
    directo: () => planesFetch(`/${planId}/generar-ordenes-preventivas`, { method: "POST", body: cuerpo }),
  });
}

/* ------------------------------- Catálogos ------------------------------ */

export interface EntradaCatalogoUpsert {
  catalogo: string;
  clave: string;
  etiqueta: string;
  posicion?: number;
  padre?: string | null;
}

/** Da de alta/actualiza una opción de un catálogo del tenant. */
export async function upsertCatalogo(cola: ColaSync, input: EntradaCatalogoUpsert): Promise<ResultadoMutacion> {
  const cuerpo: Record<string, unknown> = { catalogo: input.catalogo, clave: input.clave, etiqueta: input.etiqueta };
  if (input.posicion !== undefined) cuerpo.posicion = input.posicion;
  if (input.padre !== undefined) cuerpo.padre = input.padre;
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-upsert`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.clave}`,
    directo: () => planesFetch("/catalogos", { method: "POST", body: cuerpo }),
  });
}

/** Habilita/deshabilita una opción de un catálogo. */
export async function habilitarCatalogo(
  cola: ColaSync,
  input: { catalogo: string; clave: string; habilitado: boolean },
): Promise<ResultadoMutacion> {
  const cuerpo = { catalogo: input.catalogo, clave: input.clave, habilitado: input.habilitado };
  return mutarConOffline(cola, {
    comando: `${MODULO}.catalogo-habilitar`,
    input: cuerpo,
    descripcion: `Catálogo ${input.catalogo}: ${input.habilitado ? "habilitar" : "deshabilitar"} ${input.clave}`,
    directo: () => planesFetch("/catalogos/habilitar", { method: "POST", body: cuerpo }),
  });
}
