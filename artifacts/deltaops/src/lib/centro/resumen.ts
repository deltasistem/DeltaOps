/**
 * DGP-018 · Composición PURA del resumen operacional del Centro.
 *
 * No abre endpoints ni contiene lógica de dominio: deriva, a partir del read
 * model YA existente de Órdenes (`OrdenRow`) y del estado de SLA (`estadoSla`,
 * PURO), las agregaciones de presentación que responden a "¿qué está pasando y
 * qué debo hacer ahora?". Prohibido BI: no hay tendencias, proyecciones ni KPIs
 * financieros; sólo conteos y agrupaciones del estado puntual del tenant actual.
 */
import type { OrdenRow } from "../ordenes/tipos";
import { ESTADOS_FINALES } from "../ordenes/constantes";
import { esCritica, vencimientoSla } from "../ordenes/componentes";
import { estadoSla, type EstadoSla } from "../ecosistema/sla";

/** ¿La orden está abierta (no cerrada ni cancelada)? */
export function esAbierta(o: OrdenRow): boolean {
  return !ESTADOS_FINALES.includes(o.estado);
}

export interface OrdenConSla {
  readonly o: OrdenRow;
  readonly sla: EstadoSla;
}

export interface ResumenOperacional {
  /** Todas las órdenes abiertas (no finales). */
  readonly abiertas: OrdenRow[];
  /** Abiertas en ejecución. */
  readonly enEjecucion: OrdenRow[];
  /** Abiertas pendientes (asignadas/planificadas/abiertas sin ejecutar). */
  readonly pendientes: OrdenRow[];
  /** Abiertas sin responsable asignado. */
  readonly sinAsignar: OrdenRow[];
  /** Abiertas de prioridad/severidad alta. */
  readonly criticas: OrdenRow[];
  /** Abiertas con SLA vencido (con su estado SLA). */
  readonly vencidas: OrdenConSla[];
  /** Abiertas con SLA en riesgo/crítico (aún no vencido). */
  readonly enRiesgo: OrdenConSla[];
}

const PENDIENTES = new Set(["ABIERTA", "PLANIFICADA", "ASIGNADA"]);

/**
 * Deriva el resumen operacional del conjunto de órdenes del tenant.
 * @param ordenes read model de órdenes (ya filtrado por tenant vía RLS).
 * @param ahoraMs epoch actual (inyectable para pruebas deterministas).
 */
export function resumenOperacional(ordenes: readonly OrdenRow[], ahoraMs: number): ResumenOperacional {
  const abiertas = ordenes.filter(esAbierta);
  const conSla = abiertas.map((o) => ({ o, sla: estadoSla(o, ahoraMs) }));
  return {
    abiertas,
    enEjecucion: abiertas.filter((o) => o.estado === "EN_EJECUCION"),
    pendientes: abiertas.filter((o) => PENDIENTES.has(o.estado)),
    sinAsignar: abiertas.filter((o) => o.responsable == null),
    criticas: abiertas.filter(esCritica),
    vencidas: conSla.filter((x) => x.sla.riesgo === "vencido"),
    enRiesgo: conSla.filter((x) => x.sla.riesgo === "critico" || x.sla.riesgo === "riesgo"),
  };
}

/** Grupo de activo con sus órdenes abiertas (activos que requieren atención). */
export interface ActivoConOrdenes {
  readonly activoId: string;
  readonly etiqueta: string;
  readonly ordenes: OrdenRow[];
  /** ¿Alguna de sus órdenes es crítica o tiene SLA en riesgo/vencido? */
  readonly requiereAtencion: boolean;
}

/**
 * Agrupa las órdenes abiertas por activo principal. "Requiere atención" =
 * el activo tiene alguna OT crítica o con SLA en riesgo/vencido (gap G-2:
 * derivado de órdenes, no de un read model de salud de activo inexistente).
 */
export function activosConOrdenes(ordenes: readonly OrdenRow[], ahoraMs: number): ActivoConOrdenes[] {
  const abiertas = ordenes.filter(esAbierta);
  const porActivo = new Map<string, OrdenRow[]>();
  for (const o of abiertas) {
    const id = o.activoPrincipalId;
    if (!id) continue;
    const arr = porActivo.get(id) ?? [];
    arr.push(o);
    porActivo.set(id, arr);
  }
  const grupos: ActivoConOrdenes[] = [];
  for (const [activoId, ots] of porActivo) {
    const etiqueta = ots.find((o) => o.datos?.activoPrincipal?.etiqueta)?.datos?.activoPrincipal?.etiqueta ?? activoId;
    const requiereAtencion = ots.some(
      (o) => esCritica(o) || ["vencido", "critico", "riesgo"].includes(estadoSla(o, ahoraMs).riesgo),
    );
    grupos.push({ activoId, etiqueta: String(etiqueta), ordenes: ots, requiereAtencion });
  }
  // Los que requieren atención primero, luego por nº de órdenes descendente.
  return grupos.sort((a, b) => Number(b.requiereAtencion) - Number(a.requiereAtencion) || b.ordenes.length - a.ordenes.length);
}

/** Señal para las alertas operacionales compuestas (gap G-4, sin sistema nuevo). */
export interface AlertaOperacional {
  readonly clave: string;
  readonly tono: "error" | "advertencia" | "info";
  readonly titulo: string;
  readonly cantidad: number;
}

/**
 * Compone alertas operacionales a partir de señales reales del resumen. No crea
 * un sistema de alertas ni notificaciones: sólo resume conteos accionables.
 */
export function alertasOperacionales(r: ResumenOperacional): AlertaOperacional[] {
  const alertas: AlertaOperacional[] = [];
  if (r.vencidas.length > 0)
    alertas.push({ clave: "sla-vencido", tono: "error", titulo: "Órdenes con SLA vencido", cantidad: r.vencidas.length });
  if (r.enRiesgo.length > 0)
    alertas.push({ clave: "sla-riesgo", tono: "advertencia", titulo: "Órdenes con SLA en riesgo", cantidad: r.enRiesgo.length });
  if (r.sinAsignar.length > 0)
    alertas.push({ clave: "sin-asignar", tono: "advertencia", titulo: "Órdenes sin asignar", cantidad: r.sinAsignar.length });
  if (r.criticas.length > 0)
    alertas.push({ clave: "criticas", tono: "info", titulo: "Órdenes críticas abiertas", cantidad: r.criticas.length });
  return alertas;
}

/** Órdenes "de hoy": inicio planificado o vencimiento SLA dentro del día local. */
export function ordenesDeHoy(ordenes: readonly OrdenRow[], ahoraMs: number): OrdenRow[] {
  const inicioDia = new Date(ahoraMs);
  inicioDia.setHours(0, 0, 0, 0);
  const finDia = inicioDia.getTime() + 24 * 3600_000;
  const desde = inicioDia.getTime();
  const dentroDeHoy = (iso: unknown): boolean => {
    if (typeof iso !== "string") return false;
    const t = Date.parse(iso);
    return !Number.isNaN(t) && t >= desde && t < finDia;
  };
  return ordenes.filter(esAbierta).filter((o) => {
    const fechas = (o.datos?.fechas ?? {}) as Record<string, unknown>;
    return dentroDeHoy(fechas["inicioPlanificado"]) || dentroDeHoy(fechas["inicio"]) || dentroDeHoy(vencimientoSla(o));
  });
}
