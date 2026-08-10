/**
 * DGP-016 · Dashboard DECLARATIVO — aggregate por tenant.
 *
 * Un dashboard es una lista ordenada de WIDGETS; cada widget referencia un
 * indicador (por clave) + filtros de ejecución + presentación. 8 dashboards del
 * SISTEMA se declaran como configuración canónica (COMO DATOS) y los tenants
 * pueden crear/editar/clonar/eliminar dashboards PROPIOS (propiedad = usuario).
 * Versionado con OCC (expectedVersion) en la capa de aplicación.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import { DASHBOARD_ACTUALIZADO, DASHBOARD_CLONADO, DASHBOARD_CREADO } from "./events";
import type { Filtro } from "./filtros";

/** Tipos de widget soportados por el motor de presentación. */
export const TIPOS_WIDGET = [
  "card",
  "line",
  "bar",
  "area",
  "pie",
  "donut",
  "gauge",
  "table",
  "heatmap",
  "timeline",
  "calendar",
  "ranking",
  "comparativo",
] as const;
export type TipoWidget = (typeof TIPOS_WIDGET)[number];

/** Modo de ranking (topN/bottomN). */
export type ModoRanking = "topN" | "bottomN";

export interface Widget {
  readonly id: string;
  readonly tipo: TipoWidget;
  readonly titulo: string;
  /** Indicador referenciado por clave (nunca por código embebido). */
  readonly indicadorClave: string;
  /** Filtros de ejecución del widget (se componen con los del indicador). */
  readonly filtros: readonly Filtro[];
  /** Presentación libre (colores, orientación, ejes) — neutra. */
  readonly presentacion: Record<string, unknown>;
  /** Config de ranking (solo tipo=ranking). */
  readonly ranking?: { modo: ModoRanking; n: number } | null;
  /** Posición en la retícula. */
  readonly posicion: number;
}

export interface Dashboard {
  readonly id: string;
  readonly tenantId: string;
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly widgets: readonly Widget[];
  /** true ⇒ dashboard del sistema (canónico, no editable por usuarios). */
  readonly delSistema: boolean;
  /** Propietario (usuario) del dashboard personalizado; null para los del sistema. */
  readonly propietarioId: string | null;
  readonly version: number;
  readonly actualizadoAt: string;
  readonly actorId: string;
}

interface Evento {
  readonly tipo: string;
  readonly payload: Record<string, unknown>;
}

const esTipoWidget = (t: string): t is TipoWidget => (TIPOS_WIDGET as readonly string[]).includes(t);

export interface EntradaWidget {
  readonly id: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly indicadorClave: string;
  readonly filtros?: readonly Filtro[];
  readonly presentacion?: Record<string, unknown>;
  readonly ranking?: { modo: ModoRanking; n: number } | null;
  readonly posicion?: number;
}

export function crearWidget(input: EntradaWidget): Result<Widget, KernelError> {
  if (!esTipoWidget(input.tipo)) return fail(KernelErrors.validation(`Tipo de widget desconocido: "${input.tipo}"`));
  if (input.indicadorClave.trim() === "") return fail(KernelErrors.validation("El widget requiere un indicador"));
  if (input.tipo === "ranking" && (!input.ranking || input.ranking.n <= 0)) {
    return fail(KernelErrors.validation("Un widget de ranking requiere modo topN/bottomN y n>0"));
  }
  return ok(
    Object.freeze({
      id: input.id,
      tipo: input.tipo,
      titulo: input.titulo,
      indicadorClave: input.indicadorClave,
      filtros: Object.freeze([...(input.filtros ?? [])]),
      presentacion: Object.freeze({ ...(input.presentacion ?? {}) }),
      ranking: input.ranking ?? null,
      posicion: input.posicion ?? 0,
    }),
  );
}

function payloadDe(d: Dashboard, eventoTipo: string): Record<string, unknown> {
  return {
    tenantId: d.tenantId,
    id: d.id,
    entityRef: `dashboard:${d.id}`,
    clave: d.clave,
    nombre: d.nombre,
    descripcion: d.descripcion,
    widgets: d.widgets,
    delSistema: d.delSistema,
    propietarioId: d.propietarioId,
    version: d.version,
    actorId: d.actorId,
    actualizadoAt: d.actualizadoAt,
    eventoTipo,
  };
}

export interface EntradaDashboard {
  readonly id: string;
  readonly tenantId: string;
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  readonly widgets: readonly Widget[];
  readonly delSistema?: boolean;
  readonly propietarioId?: string | null;
  readonly actorId: string;
  readonly ahora: string;
}

export function crearDashboard(input: EntradaDashboard): Result<{ dashboard: Dashboard; evento: Evento }, KernelError> {
  if (input.clave.trim() === "") return fail(KernelErrors.validation("La clave del dashboard es obligatoria"));
  if (input.nombre.trim() === "") return fail(KernelErrors.validation("El nombre del dashboard es obligatorio"));
  const dashboard: Dashboard = Object.freeze({
    id: input.id,
    tenantId: input.tenantId,
    clave: input.clave,
    nombre: input.nombre,
    descripcion: input.descripcion ?? null,
    widgets: Object.freeze([...input.widgets]),
    delSistema: input.delSistema ?? false,
    propietarioId: input.propietarioId ?? null,
    version: 1,
    actualizadoAt: input.ahora,
    actorId: input.actorId,
  });
  return ok({ dashboard, evento: { tipo: DASHBOARD_CREADO, payload: payloadDe(dashboard, DASHBOARD_CREADO) } });
}

export interface CambiosDashboard {
  nombre?: string;
  descripcion?: string | null;
  widgets?: readonly Widget[];
}

export function actualizarDashboard(
  actual: Dashboard,
  cambios: CambiosDashboard,
  actorId: string,
  ahora: string,
): Result<{ dashboard: Dashboard; evento: Evento }, KernelError> {
  if (actual.delSistema) {
    return fail(KernelErrors.conflict("Un dashboard del sistema es inmutable; clónalo para personalizarlo"));
  }
  const dashboard: Dashboard = Object.freeze({
    ...actual,
    nombre: cambios.nombre ?? actual.nombre,
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion : actual.descripcion,
    widgets: cambios.widgets ? Object.freeze([...cambios.widgets]) : actual.widgets,
    version: actual.version + 1,
    actualizadoAt: ahora,
    actorId,
  });
  return ok({ dashboard, evento: { tipo: DASHBOARD_ACTUALIZADO, payload: payloadDe(dashboard, DASHBOARD_ACTUALIZADO) } });
}

/** Clona un dashboard (del sistema o propio) hacia uno PROPIO del usuario. */
export function clonarDashboard(
  origen: Dashboard,
  nuevo: { id: string; clave: string; nombre: string; propietarioId: string },
  actorId: string,
  ahora: string,
): Result<{ dashboard: Dashboard; evento: Evento }, KernelError> {
  if (nuevo.clave.trim() === "") return fail(KernelErrors.validation("La clave del clon es obligatoria"));
  const dashboard: Dashboard = Object.freeze({
    id: nuevo.id,
    tenantId: origen.tenantId,
    clave: nuevo.clave,
    nombre: nuevo.nombre,
    descripcion: origen.descripcion,
    widgets: origen.widgets,
    delSistema: false,
    propietarioId: nuevo.propietarioId,
    version: 1,
    actualizadoAt: ahora,
    actorId,
  });
  return ok({
    dashboard,
    evento: { tipo: DASHBOARD_CLONADO, payload: { ...payloadDe(dashboard, DASHBOARD_CLONADO), origenId: origen.id, origenClave: origen.clave } },
  });
}

/** Verifica propiedad para editar/eliminar un dashboard personalizado. */
export function esPropietario(d: Dashboard, usuarioId: string): boolean {
  return !d.delSistema && d.propietarioId === usuarioId;
}
