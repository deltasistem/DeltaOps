/**
 * DGP-016 · 8 dashboards del SISTEMA como configuración canónica (COMO DATOS).
 *
 * ejecutivo / operativo / inventario / activos / ordenes / correctivo /
 * preventivo / compras. Cada widget referencia un indicador del catálogo por
 * clave + presentación; nunca hay código por dashboard. Los tenants pueden
 * clonarlos para personalizarlos.
 */
import type { ModoRanking, TipoWidget } from "./dashboard";

export interface EspecWidget {
  readonly tipo: TipoWidget;
  readonly titulo: string;
  readonly indicadorClave: string;
  readonly presentacion?: Record<string, unknown>;
  readonly ranking?: { modo: ModoRanking; n: number };
}

export interface EspecDashboard {
  readonly clave: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly widgets: readonly EspecWidget[];
}

export const CATALOGO_DASHBOARDS: readonly EspecDashboard[] = [
  {
    clave: "ejecutivo",
    nombre: "Dashboard Ejecutivo",
    descripcion: "Vista de alto nivel de disponibilidad, confiabilidad, costos y cumplimiento",
    widgets: [
      { tipo: "gauge", titulo: "Disponibilidad", indicadorClave: "disponibilidad" },
      { tipo: "gauge", titulo: "Cumplimiento SLA", indicadorClave: "cumplimiento-sla" },
      { tipo: "card", titulo: "MTBF", indicadorClave: "mtbf" },
      { tipo: "card", titulo: "MTTR", indicadorClave: "mttr" },
      { tipo: "card", titulo: "Costo de mantenimiento", indicadorClave: "costo-mantenimiento" },
      { tipo: "line", titulo: "Backlog", indicadorClave: "backlog" },
    ],
  },
  {
    clave: "operativo",
    nombre: "Dashboard Operativo",
    descripcion: "Estado operacional de órdenes y cargas de trabajo",
    widgets: [
      { tipo: "card", titulo: "OT abiertas", indicadorClave: "ot-abiertas" },
      { tipo: "card", titulo: "OT vencidas", indicadorClave: "ot-vencidas" },
      { tipo: "card", titulo: "OT críticas", indicadorClave: "ot-criticas" },
      { tipo: "bar", titulo: "Carga de técnicos", indicadorClave: "carga-tecnicos" },
      { tipo: "bar", titulo: "Carga de cuadrillas", indicadorClave: "carga-cuadrillas" },
      { tipo: "ranking", titulo: "Top activos con fallas", indicadorClave: "fallas-por-activo", ranking: { modo: "topN", n: 10 } },
    ],
  },
  {
    clave: "inventario",
    nombre: "Dashboard Inventario",
    descripcion: "Consumo, rotación, nivel de servicio y movimientos de inventario",
    widgets: [
      { tipo: "card", titulo: "Consumo", indicadorClave: "consumo-inventario" },
      { tipo: "gauge", titulo: "Nivel de servicio", indicadorClave: "nivel-servicio" },
      { tipo: "card", titulo: "Rotación", indicadorClave: "rotacion-inventario" },
      { tipo: "card", titulo: "Reservas", indicadorClave: "reservas" },
      { tipo: "card", titulo: "Transferencias", indicadorClave: "transferencias" },
    ],
  },
  {
    clave: "activos",
    nombre: "Dashboard Activos",
    descripcion: "Disponibilidad, utilización y confiabilidad de activos",
    widgets: [
      { tipo: "gauge", titulo: "Disponibilidad", indicadorClave: "disponibilidad" },
      { tipo: "gauge", titulo: "Utilización", indicadorClave: "utilizacion" },
      { tipo: "gauge", titulo: "Confiabilidad", indicadorClave: "confiabilidad" },
      { tipo: "heatmap", titulo: "Fallas por activo", indicadorClave: "fallas-por-activo" },
      { tipo: "pie", titulo: "Fallas por tipo", indicadorClave: "fallas-por-tipo" },
    ],
  },
  {
    clave: "ordenes",
    nombre: "Dashboard Órdenes",
    descripcion: "Ciclo de vida y tiempos de las órdenes de trabajo",
    widgets: [
      { tipo: "card", titulo: "OT abiertas", indicadorClave: "ot-abiertas" },
      { tipo: "line", titulo: "Backlog", indicadorClave: "backlog" },
      { tipo: "card", titulo: "Tiempo promedio ejecución", indicadorClave: "tiempo-promedio-ejecucion" },
      { tipo: "card", titulo: "Tiempo promedio cierre", indicadorClave: "tiempo-promedio-cierre" },
      { tipo: "gauge", titulo: "Cumplimiento SLA", indicadorClave: "cumplimiento-sla" },
    ],
  },
  {
    clave: "correctivo",
    nombre: "Dashboard Correctivo",
    descripcion: "Fallas, reincidencias y tiempos de atención correctivos",
    widgets: [
      { tipo: "card", titulo: "MTBF", indicadorClave: "mtbf" },
      { tipo: "card", titulo: "MTTR", indicadorClave: "mttr" },
      { tipo: "card", titulo: "Tiempo promedio atención", indicadorClave: "tiempo-promedio-atencion" },
      { tipo: "card", titulo: "Reincidencias", indicadorClave: "reincidencias" },
      { tipo: "donut", titulo: "Fallas por tipo", indicadorClave: "fallas-por-tipo" },
      { tipo: "card", titulo: "Costo correctivo", indicadorClave: "costo-correctivo" },
    ],
  },
  {
    clave: "preventivo",
    nombre: "Dashboard Preventivo",
    descripcion: "Cumplimiento y adherencia de mantenimiento preventivo",
    widgets: [
      { tipo: "gauge", titulo: "Cumplimiento preventivo", indicadorClave: "cumplimiento-preventivo" },
      { tipo: "gauge", titulo: "Adherencia al plan", indicadorClave: "adherencia-plan" },
      { tipo: "card", titulo: "Costo preventivo", indicadorClave: "costo-preventivo" },
      { tipo: "calendar", titulo: "Programaciones", indicadorClave: "cumplimiento-preventivo" },
    ],
  },
  {
    clave: "compras",
    nombre: "Dashboard Compras",
    descripcion: "Solicitudes de compra generadas y abastecimiento",
    widgets: [
      { tipo: "card", titulo: "Compras generadas", indicadorClave: "compras-generadas" },
      { tipo: "line", titulo: "Compras en el tiempo", indicadorClave: "compras-generadas" },
      { tipo: "table", titulo: "Detalle de compras", indicadorClave: "compras-generadas" },
    ],
  },
];

/** Claves de los 8 dashboards del sistema. */
export const CLAVES_DASHBOARDS_SISTEMA: readonly string[] = CATALOGO_DASHBOARDS.map((d) => d.clave);
