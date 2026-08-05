/**
 * DGP-010 · Calendario operacional INTEGRADO (punto 6, lógica PURA).
 *
 * Une la AGENDA de planificación (`EntradaAgenda`, con día/ventana/conflicto y
 * responsable) con el READ MODEL de órdenes (`OrdenRow`, con activo, prioridad y
 * SLA) para mostrar SIMULTÁNEAMENTE, sincronizados por la misma OT: órdenes +
 * programaciones + técnico/cuadrilla + activo + ventanas + señal de SLA. No abre
 * fuentes nuevas: compone dos lecturas existentes por el id de la OT. Puro.
 */
import type { EntradaAgenda, OrdenRow } from "../ordenes/tipos";
import { estadoSla, type EstadoSla } from "./sla";

export interface EntradaIntegrada extends EntradaAgenda {
  /** OT enriquecida (si está en el listado). */
  readonly orden?: OrdenRow;
  readonly activoId?: string | null;
  readonly prioridad?: string | null;
  readonly cuadrilla?: string | null;
  readonly sla: EstadoSla;
}

export interface FiltroAgenda {
  readonly tecnico?: string | null;
  readonly cuadrilla?: string | null;
  readonly activoId?: string | null;
  /** Sólo mostrar OTs con SLA en riesgo/crítico/vencido. */
  readonly soloRiesgoSla?: boolean;
}

function cuadrillaDe(o: OrdenRow | undefined): string | null {
  if (!o) return null;
  const d = (o.datos ?? {}) as Record<string, unknown>;
  const c = d.cuadrilla ?? d.equipo ?? (o as unknown as { cuadrilla?: string }).cuadrilla;
  return c == null ? null : String(c);
}

/**
 * Enriquece las entradas de la agenda con los datos de la orden y su SLA.
 * @param ahoraMs marca temporal inyectada (determinismo en pruebas).
 */
export function integrarAgenda(
  entradas: readonly EntradaAgenda[] | null | undefined,
  ordenes: readonly OrdenRow[] | null | undefined,
  ahoraMs: number,
): EntradaIntegrada[] {
  const porId = new Map<string, OrdenRow>();
  const porCodigo = new Map<string, OrdenRow>();
  for (const o of ordenes ?? []) {
    porId.set(o.id, o);
    if (o.codigo) porCodigo.set(o.codigo, o);
  }
  return (entradas ?? []).map((e) => {
    const orden = porId.get(e.id) ?? (e.codigo ? porCodigo.get(e.codigo) : undefined);
    return {
      ...e,
      orden,
      activoId: orden?.activoPrincipalId ?? null,
      prioridad: orden?.prioridad ?? null,
      cuadrilla: cuadrillaDe(orden),
      sla: estadoSla(orden ?? ({ datos: {} } as OrdenRow), ahoraMs),
    };
  });
}

/** Aplica los filtros de capa (técnico/cuadrilla/activo/SLA) sobre las entradas. */
export function filtrarAgenda(entradas: readonly EntradaIntegrada[], filtro: FiltroAgenda): EntradaIntegrada[] {
  return entradas.filter((e) => {
    if (filtro.tecnico && (e.responsable ?? "") !== filtro.tecnico) return false;
    if (filtro.cuadrilla && (e.cuadrilla ?? "") !== filtro.cuadrilla) return false;
    if (filtro.activoId && (e.activoId ?? "") !== filtro.activoId) return false;
    if (filtro.soloRiesgoSla) {
      const r = e.sla.riesgo;
      if (r !== "vencido" && r !== "critico" && r !== "riesgo") return false;
    }
    return true;
  });
}

/** Opciones únicas (para poblar los selectores de filtro) desde las entradas. */
export function opcionesAgenda(entradas: readonly EntradaIntegrada[]): {
  tecnicos: string[]; cuadrillas: string[]; activos: string[];
} {
  const tecnicos = new Set<string>();
  const cuadrillas = new Set<string>();
  const activos = new Set<string>();
  for (const e of entradas) {
    if (e.responsable) tecnicos.add(e.responsable);
    if (e.cuadrilla) cuadrillas.add(e.cuadrilla);
    if (e.activoId) activos.add(e.activoId);
  }
  return {
    tecnicos: [...tecnicos].sort(),
    cuadrillas: [...cuadrillas].sort(),
    activos: [...activos].sort(),
  };
}
