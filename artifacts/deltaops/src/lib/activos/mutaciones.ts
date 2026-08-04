/**
 * DGP-008.3 · Mutaciones del módulo de Activos con degradación offline.
 * Cada mutación intenta el POST directo; si falla por red, encola la operación
 * (comando del módulo) en la cola de sincronización.
 */
import { activosFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO } from "./constantes";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/** Crea un activo (estado BORRADOR del dominio). */
export async function crearActivo(cola: ColaSync, input: Record<string, unknown>): Promise<ResultadoMutacion> {
  const opId = (input.opId as string) ?? nuevoOpId();
  const id = (input.id as string) ?? nuevoOpId();
  const cuerpo = { ...input, id, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear`,
    input: cuerpo,
    descripcion: `Crear activo ${String(input.codigoEmpresarial ?? "")}`,
    directo: () => activosFetch("", { method: "POST", body: cuerpo }),
  });
}

/** Ejecuta una transición de estado. */
export async function transicion(
  cola: ColaSync,
  id: string,
  accion: string,
  expectedVersion: number,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.${accion}`,
    input: cuerpo,
    descripcion: `Transición «${accion}» de ${id}`,
    directo: () => activosFetch(`/${id}/${accion}`, { method: "POST", body: cuerpo }),
  });
}

/** Edita un activo. */
export async function editarActivo(
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
    descripcion: `Editar activo ${id}`,
    directo: () => activosFetch(`/${id}`, { method: "PUT", body: cuerpo }),
  });
}

/** Registra un comentario. */
export async function comentar(
  cola: ColaSync,
  id: string,
  texto: string,
  parentId?: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { texto, parentId, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.comentar`,
    input: { id, ...cuerpo },
    descripcion: `Comentar en ${id}`,
    directo: () => activosFetch(`/${id}/comentarios`, { method: "POST", body: cuerpo }),
  });
}

export async function editarComentario(
  cola: ColaSync,
  comentarioId: string,
  expectedVersion: number,
  texto: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { expectedVersion, texto, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.editar-comentario`,
    input: { comentarioId, ...cuerpo },
    descripcion: `Editar comentario ${comentarioId}`,
    directo: () => activosFetch(`/comentarios/${comentarioId}`, { method: "PUT", body: cuerpo }),
  });
}

export async function borrarComentario(cola: ColaSync, comentarioId: string): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  return mutarConOffline(cola, {
    comando: `${MODULO}.borrar-comentario`,
    input: { comentarioId, opId },
    descripcion: `Borrar comentario ${comentarioId}`,
    directo: () => activosFetch(`/comentarios/${comentarioId}`, { method: "DELETE", body: { opId } }),
  });
}

/** Crea una relación entre activos. */
export async function crearRelacion(
  cola: ColaSync,
  origenId: string,
  destinoId: string,
  tipo: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { tipo, origenId, destinoId, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.crear-relacion`,
    input: cuerpo,
    descripcion: `Relación ${tipo} ${origenId}→${destinoId}`,
    directo: () => activosFetch(`/${origenId}/relaciones`, { method: "POST", body: cuerpo }),
  });
}

export async function eliminarRelacion(cola: ColaSync, relId: string): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  return mutarConOffline(cola, {
    comando: `${MODULO}.eliminar-relacion`,
    input: { id: relId, opId },
    descripcion: `Eliminar relación ${relId}`,
    directo: () => activosFetch(`/relaciones/${relId}`, { method: "DELETE", body: { id: relId, opId } }),
  });
}

/** Registra un adjunto (metadatos + hash). */
export async function adjuntar(
  cola: ColaSync,
  id: string,
  meta: {
    categoria: string;
    nombreArchivo: string;
    mimeType: string;
    tamanoBytes: number;
    hashSha256: string;
  },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { ...meta, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.adjuntar`,
    input: { id, ...cuerpo },
    descripcion: `Adjuntar ${meta.nombreArchivo} a ${id}`,
    directo: () => activosFetch(`/${id}/documentacion`, { method: "POST", body: cuerpo }),
  });
}

/** Cambia la ubicación del activo. */
export async function cambiarUbicacion(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  ubicacion: { ubicacionId: string; etiqueta: string; detalle?: string },
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, ubicacion, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.cambiar-ubicacion`,
    input: cuerpo,
    descripcion: `Cambiar ubicación de ${id}`,
    directo: () => activosFetch(`/${id}/ubicacion`, { method: "POST", body: cuerpo }),
  });
}

/** Asigna responsable. */
export async function asignarResponsable(
  cola: ColaSync,
  id: string,
  expectedVersion: number,
  responsable: string,
): Promise<ResultadoMutacion> {
  const opId = nuevoOpId();
  const cuerpo = { id, expectedVersion, responsable, opId };
  return mutarConOffline(cola, {
    comando: `${MODULO}.asignar-responsable`,
    input: cuerpo,
    descripcion: `Asignar responsable de ${id}`,
    directo: () => activosFetch(`/${id}/responsable`, { method: "POST", body: cuerpo }),
  });
}
