/**
 * DGP-016 · Renderizador declarativo de un DASHBOARD completo.
 *
 * Toma la configuración del dashboard (widgets ordenados por posición) + los
 * filtros globales y renderiza una retícula RESPONSIVE (1 columna móvil, 2
 * tablet, 3+ desktop, mediante CSS grid auto-fill). Cada widget se resuelve con
 * el WidgetRenderer, que carga su indicador declarativo y lo evalúa. Las
 * definiciones de indicadores se cargan UNA vez y se pasan por clave para
 * mostrar unidad/formato/umbrales.
 */
import React, { useMemo } from "react";
import { WidgetRenderer } from "./WidgetRenderer";
import { useIndicadores } from "./hooks";
import type { FiltrosGlobales } from "./filtros";
import type { Dashboard, Indicador } from "./tipos";
import type { CacheAnalytics } from "./cache";

export interface DashboardRendererProps {
  dashboard: Dashboard;
  filtrosGlobales?: FiltrosGlobales;
  periodo?: string;
  cache?: CacheAnalytics;
}

export function DashboardRenderer({ dashboard, filtrosGlobales = {}, periodo, cache }: DashboardRendererProps) {
  const { datos: indicadores } = useIndicadores();
  const porClave = useMemo(() => {
    const m = new Map<string, Indicador>();
    for (const ind of indicadores ?? []) m.set(ind.clave, ind);
    return m;
  }, [indicadores]);

  const widgets = useMemo(() => [...dashboard.widgets].sort((a, b) => a.posicion - b.posicion), [dashboard.widgets]);

  if (widgets.length === 0) {
    return (
      <p role="note" style={{ color: "var(--do-texto-suave)" }}>
        Este dashboard no tiene widgets configurados.
      </p>
    );
  }

  return (
    <div
      role="list"
      aria-label={`Widgets de ${dashboard.nombre}`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "var(--do-sp-4)",
        alignItems: "start",
      }}
    >
      {widgets.map((w) => (
        <div role="listitem" key={w.id}>
          <WidgetRenderer
            widget={w}
            indicador={porClave.get(w.indicadorClave) ?? null}
            filtrosGlobales={filtrosGlobales}
            periodo={periodo}
            cache={cache}
          />
        </div>
      ))}
    </div>
  );
}
