/**
 * DGP-016 · Mutaciones del módulo Analytics con degradación Offline First.
 *
 * - Dashboards: CRUD + clonado directos (POST/PUT/DELETE + /clonar). El backend
 *   gobierna propiedad/permisos por policy; el frontend nunca hace bypass. Los
 *   409 (OCC/propiedad) propagan (no se encolan).
 * - Snapshots: encolables vía /sync con `opId` cliente (comando
 *   `modulo.analytics.materializar-snapshot`), idempotente por clave
 *   determinista en el backend.
 *
 * Los cuerpos coinciden EXACTAMENTE con los esquemas del módulo
 * (lib/module-analytics/src/module.ts). Las creaciones acuñan `id` (UUID) en
 * cliente para idempotencia del alta. Verificado por el test de contrato.
 */
import { analyticsFetch } from "./api";
import { mutarConOffline } from "../offline/contexto";
import type { ColaSync } from "../offline/cola";
import { nuevoOpId } from "../offline/cola";
import { MODULO } from "./constantes";
import type { Filtro, Widget } from "./tipos";

export interface ResultadoMutacion {
  encolada: boolean;
  resultado?: unknown;
  error?: Error;
}

/** Widget en forma de entrada para crear/actualizar (sin id obligatorio). */
export interface EntradaWidget {
  id?: string;
  tipo: string;
  titulo: string;
  indicadorClave: string;
  filtros?: readonly Filtro[];
  presentacion?: Record<string, unknown>;
  ranking?: { modo: "topN" | "bottomN"; n: number } | null;
  posicion?: number;
}

/** Normaliza un widget de entrada al cuerpo del contrato (omite vacíos). */
export function construirWidget(w: EntradaWidget, posicion: number): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    tipo: w.tipo,
    titulo: w.titulo,
    indicadorClave: w.indicadorClave,
    filtros: [...(w.filtros ?? [])],
    presentacion: { ...(w.presentacion ?? {}) },
    posicion: w.posicion ?? posicion,
  };
  if (w.id) cuerpo.id = w.id;
  if (w.ranking) cuerpo.ranking = w.ranking;
  return cuerpo;
}

export interface EntradaDashboard {
  clave: string;
  nombre: string;
  descripcion?: string | null;
  widgets: readonly EntradaWidget[];
}

/* ------------------------------ Dashboards ------------------------------ */

/** Crea un dashboard personalizado. Acuña `id` (UUID) en cliente. */
export async function crearDashboard(input: EntradaDashboard, ids: { id?: string } = {}): Promise<ResultadoMutacion> {
  const id = ids.id ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = {
    id,
    clave: input.clave,
    nombre: input.nombre,
    widgets: input.widgets.map((w, i) => construirWidget(w, i)),
  };
  if (input.descripcion !== undefined) cuerpo.descripcion = input.descripcion;
  try {
    const resultado = await analyticsFetch("/dashboards", { method: "POST", body: cuerpo });
    return { encolada: false, resultado };
  } catch (e) {
    return { encolada: false, error: e as Error };
  }
}

/** Actualiza un dashboard propio (OCC por expectedVersion). */
export async function actualizarDashboard(
  id: string,
  expectedVersion: number,
  cambios: { nombre?: string; descripcion?: string | null; widgets?: readonly EntradaWidget[] },
): Promise<ResultadoMutacion> {
  const cuerpo: Record<string, unknown> = { id, expectedVersion };
  if (cambios.nombre !== undefined) cuerpo.nombre = cambios.nombre;
  if (cambios.descripcion !== undefined) cuerpo.descripcion = cambios.descripcion;
  if (cambios.widgets !== undefined) cuerpo.widgets = cambios.widgets.map((w, i) => construirWidget(w, i));
  try {
    const resultado = await analyticsFetch(`/dashboards/${encodeURIComponent(id)}`, { method: "PUT", body: cuerpo });
    return { encolada: false, resultado };
  } catch (e) {
    return { encolada: false, error: e as Error };
  }
}

/**
 * Clona un dashboard (del sistema o propio) hacia uno propio del usuario.
 * El endpoint es `POST /dashboards/:id/clonar`; el comando exige `origenId`, por
 * lo que se envía explícitamente en el cuerpo (además del `:id` de la ruta).
 */
export async function clonarDashboard(
  origenId: string,
  input: { clave: string; nombre: string; id?: string },
): Promise<ResultadoMutacion> {
  const cuerpo: Record<string, unknown> = {
    origenId,
    clave: input.clave,
    nombre: input.nombre,
  };
  try {
    const resultado = await analyticsFetch(`/dashboards/${encodeURIComponent(origenId)}/clonar`, { method: "POST", body: cuerpo });
    return { encolada: false, resultado };
  } catch (e) {
    return { encolada: false, error: e as Error };
  }
}

/** Elimina un dashboard propio (OCC por expectedVersion). */
export async function eliminarDashboard(id: string, expectedVersion: number): Promise<ResultadoMutacion> {
  const cuerpo = { expectedVersion };
  try {
    const resultado = await analyticsFetch(`/dashboards/${encodeURIComponent(id)}`, { method: "DELETE", body: cuerpo });
    return { encolada: false, resultado };
  } catch (e) {
    return { encolada: false, error: e as Error };
  }
}

/* ------------------------------ Snapshots ------------------------------- */

/**
 * Materializa un snapshot de un indicador (idempotente por clave determinista
 * en el backend). Encolable vía /sync con `opId` cliente: si el POST directo
 * falla por red, la operación se persiste y se replica al recuperar conexión.
 */
export async function materializarSnapshot(
  cola: ColaSync,
  clave: string,
  input: { filtros?: readonly Filtro[]; evaluadoEn?: string } = {},
  ids: { opId?: string } = {},
): Promise<ResultadoMutacion> {
  const opId = ids.opId ?? nuevoOpId();
  const cuerpo: Record<string, unknown> = { opId, clave, filtros: [...(input.filtros ?? [])] };
  if (input.evaluadoEn !== undefined) cuerpo.evaluadoEn = input.evaluadoEn;
  return mutarConOffline(cola, {
    comando: `${MODULO}.materializar-snapshot`,
    input: cuerpo,
    descripcion: `Snapshot de ${clave}`,
    directo: () => analyticsFetch(`/indicadores/${encodeURIComponent(clave)}/snapshot`, { method: "POST", body: cuerpo }),
  });
}
