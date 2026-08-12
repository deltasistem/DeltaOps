/**
 * DGP-020.3 · Mutaciones administrativas del módulo Mano de Obra.
 *
 * Son operaciones ADMINISTRATIVAS online-only (§26: NO se crea una segunda cola
 * offline; las tarifas no están disponibles sin conexión, así que no se
 * inventan offline). Toda mutación lleva `opId` (§25 idempotencia) y el backend
 * es la autoridad de RBAC/tenant (§13/§22/§23).
 *
 * El frontend NUNCA envía identityId/activoId/costo como autoridad de una
 * valoración: sólo dispara comandos administrativos (catálogo/recurso/tarifa) y,
 * a lo sumo, la orquestación de valorar una sesión CERRADA (por sesionId).
 */
import { mdoFetch, mensajeDeError } from "./api";

/** Genera un opId único (idempotencia; mismo espíritu que la cola offline). */
export function nuevoOpId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* noop */ }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ResultadoMutacion {
  ok: boolean;
  resultado?: unknown;
  error?: string;
}

async function ejecutar(path: string, body: Record<string, unknown>): Promise<ResultadoMutacion> {
  try {
    const resultado = await mdoFetch(path, { method: "POST", body });
    return { ok: true, resultado };
  } catch (e) {
    return { ok: false, error: mensajeDeError(e) };
  }
}

/* ------------------------------ Catálogo -------------------------------- */

/** Alta/edición de una categoría (idempotente por clave). */
export function upsertCategoria(datos: {
  clave: string;
  etiqueta?: string;
  orden?: number;
  catalogo?: string;
}): Promise<ResultadoMutacion> {
  return ejecutar("/catalogo", { ...datos, opId: nuevoOpId() });
}

/** Habilitar/deshabilitar una categoría. */
export function habilitarCategoria(datos: {
  clave: string;
  habilitado: boolean;
  catalogo?: string;
}): Promise<ResultadoMutacion> {
  return ejecutar("/catalogo/habilitar", { ...datos, opId: nuevoOpId() });
}

/* ------------------------------ Recursos -------------------------------- */

/** Definir/actualizar un recurso (upsert idempotente por identityId). */
export function definirRecurso(datos: {
  identityId: string;
  categoriaClave: string;
}): Promise<ResultadoMutacion> {
  return ejecutar("/recursos", { ...datos, opId: nuevoOpId() });
}

/** Cambiar el estado de un recurso (ACTIVO/INACTIVO). */
export function cambiarEstadoRecurso(datos: {
  identityId: string;
  estado: "ACTIVO" | "INACTIVO";
}): Promise<ResultadoMutacion> {
  return ejecutar("/recursos/estado", { ...datos, opId: nuevoOpId() });
}

/* ------------------------------- Tarifas -------------------------------- */

/** Crear tarifa (no-solape de vigencias; unidad sólo HORA). */
export function crearTarifa(datos: {
  sujetoId: string;
  /** DINERO en PUNTO FIJO: SÓLO CADENA decimal canónica (numeric(18,6)); el backend rechaza números (R2). */
  valor: string;
  sujetoTipo?: "CATEGORIA" | "IDENTIDAD";
  moneda?: string;
  unidad?: "HORA";
  vigenciaDesde?: string;
  motivo?: string;
}): Promise<ResultadoMutacion> {
  return ejecutar("/tarifas", { ...datos, opId: nuevoOpId() });
}

/**
 * Versionar tarifa: cierra la vigente y crea una nueva en UNA sola UoW. NO
 * altera valoraciones históricas (§10/§16).
 */
export function actualizarTarifa(datos: {
  sujetoId: string;
  /** DINERO en PUNTO FIJO: SÓLO CADENA decimal canónica (numeric(18,6)); el backend rechaza números (R2). */
  valor: string;
  vigenciaDesde: string;
  sujetoTipo?: "CATEGORIA" | "IDENTIDAD";
  moneda?: string;
  unidad?: "HORA";
  motivo?: string;
}): Promise<ResultadoMutacion> {
  return ejecutar("/tarifas/actualizar", { ...datos, opId: nuevoOpId() });
}

/** Cerrar la vigencia abierta de un sujeto. */
export function cerrarTarifa(datos: {
  sujetoId: string;
  vigenciaHasta: string;
  sujetoTipo?: "CATEGORIA" | "IDENTIDAD";
  motivo?: string;
}): Promise<ResultadoMutacion> {
  return ejecutar("/tarifas/cerrar", { ...datos, opId: nuevoOpId() });
}

/* ----------------------------- Valoración ------------------------------- */

/**
 * Revalorar una sesión (sólo SIN_TARIFA/SIN_RECURSO; VALORADA es inmutable). El
 * backend deriva tiempo/costo de la sesión; el frontend sólo aporta `sesionId`.
 */
export function revalorar(datos: { sesionId: string }): Promise<ResultadoMutacion> {
  return ejecutar("/valoraciones/revalorar", { ...datos, opId: nuevoOpId() });
}

/** Valorar una sesión CERRADA (idempotente por sesión; red de seguridad). */
export function procesarSesion(datos: { sesionId: string; ordenId?: string }): Promise<ResultadoMutacion> {
  return ejecutar("/valoraciones/procesar-sesion", { ...datos, opId: nuevoOpId() });
}
