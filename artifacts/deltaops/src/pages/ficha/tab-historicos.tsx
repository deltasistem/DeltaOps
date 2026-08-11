/**
 * DGP-008.3 · Pestaña Históricos (ubicaciones y responsables) de la ficha.
 */
import React from "react";
import { Card, CardContent, CardHeader, Table as DoTable, EmptyState, Spinner, ErrorState } from "@workspace/design-system";
import { useHistoricoUbicaciones, useHistoricoResponsables } from "../../lib/activos/hooks";
import type { CambioHistorico } from "../../lib/activos/tipos";

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function fecha(c: CambioHistorico): string {
  const iso = c.fecha ?? c.registradoAt;
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString("es");
}

export function TabHistoricos({ id }: { id: string }) {
  const ubic = useHistoricoUbicaciones(id);
  const resp = useHistoricoResponsables(id);

  return (
    <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
      <TablaHistorico titulo="Histórico de ubicaciones" estado={ubic} campos={["ubicacionId", "etiqueta"]} />
      <TablaHistorico titulo="Histórico de responsables" estado={resp} campos={["responsable", "supervisor"]} />
    </div>
  );
}

function TablaHistorico({
  titulo,
  estado,
  campos,
}: {
  titulo: string;
  estado: { datos: CambioHistorico[] | null; cargando: boolean; error: Error | null; recargar: () => void };
  campos: string[];
}) {
  return (
    <Card>
      <CardHeader><strong>{titulo}</strong></CardHeader>
      <CardContent>
        {estado.cargando ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-5)" }}><Spinner /></div>
        ) : estado.error ? (
          <ErrorState titulo="No se pudo cargar" descripcion={estado.error.message} onReintentar={estado.recargar} />
        ) : (estado.datos ?? []).length === 0 ? (
          <EmptyState titulo="Sin registros" descripcion="No hay cambios registrados." />
        ) : (
          <DoTable caption={titulo}>
            <thead><tr><th>Fecha</th>{campos.map((c) => <th key={c}>{c}</th>)}<th>Actor</th></tr></thead>
            <tbody>
              {(estado.datos ?? []).map((c, i) => (
                <tr key={c.id ?? i}>
                  <td>{fecha(c)}</td>
                  {campos.map((k) => <td key={k}>{fmt((c as Record<string, unknown>)[k])}</td>)}
                  <td>{fmt(c.actor ?? c.actorId)}</td>
                </tr>
              ))}
            </tbody>
          </DoTable>
        )}
      </CardContent>
    </Card>
  );
}
