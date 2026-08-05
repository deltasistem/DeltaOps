/**
 * DGP-010 · Ejecución integrada — pestaña «Activo» de la ficha de la OT.
 *
 * Permite al técnico consultar SIN salir de la orden el activo intervenido:
 * datos generales, medidores y actividad reciente (Shared Timeline del activo),
 * más navegación contextual profunda (abrir la Vista 360°). Compone el read
 * model de Activos (DGP-008) mediante `useActivoResumen` / `useTimelineActivo`;
 * degrada con elegancia si la orden no tiene activo o el detalle no existe.
 */
import React, { useMemo } from "react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Spinner,
  EmptyState,
  Alert,
  Timeline,
} from "@workspace/design-system";
import { useActivoResumen, useTimelineActivo } from "../../lib/ecosistema/hooks";
import { urlActivo, urlActivoTab } from "../../lib/ecosistema/deep-links";
import type { OrdenRow } from "../../lib/ordenes/tipos";

export function TabActivoOrden({ orden }: { orden: OrdenRow }) {
  const activoId = orden.activoPrincipalId;
  const { datos: activo, cargando } = useActivoResumen(activoId);
  const timeline = useTimelineActivo(activoId);

  const eventos = useMemo(
    () =>
      (timeline.datos ?? [])
        .map((e) => ({
          titulo: e.resumen || e.descripcion || e.tipo || "Actividad",
          hora: e.ocurridoAt ?? e.occurredAt ?? e.fecha,
          descripcion: e.actor ? `por ${e.actor}` : e.descripcion,
          tono: (e.estado ? "info" : "neutro") as "info" | "neutro",
        }))
        .slice(0, 20),
    [timeline.datos],
  );

  if (!activoId) {
    return (
      <Card><CardContent>
        <EmptyState titulo="Orden sin activo asociado" descripcion="Esta orden no está anclada a un activo del inventario." />
      </CardContent></Card>
    );
  }

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <Card>
        <CardHeader>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <strong>{activo?.nombre ?? "Activo"}</strong>
            <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
              <Link href={urlActivo(activoId)}><Button variant="secundario" size="sm">Vista 360°</Button></Link>
              <Link href={urlActivoTab(activoId, "documentacion")}><Button variant="fantasma" size="sm">Manuales</Button></Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!activo ? (
            <Alert variant="advertencia" titulo="Detalle del activo no disponible">
              Se muestra la referencia ({activoId}); el detalle completo se verá al recuperar conexión.
            </Alert>
          ) : (
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--do-sp-3)", margin: 0 }}>
              <Campo etiqueta="Código" valor={activo.codigoEmpresarial} />
              <Campo etiqueta="Estado" valor={<Badge variant="info">{activo.estado}</Badge>} />
              <Campo etiqueta="Referencia" valor={<span style={{ wordBreak: "break-all" }}>{activoId}</span>} />
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><strong>Actividad reciente del activo</strong></CardHeader>
        <CardContent>
          {timeline.cargando ? (
            <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>
          ) : eventos.length === 0 ? (
            <EmptyState titulo="Sin actividad reciente" descripcion="No hay eventos registrados en el timeline del activo." />
          ) : (
            <Timeline label="Actividad reciente del activo" eventos={eventos} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)", textTransform: "uppercase", letterSpacing: "var(--do-tracking-etiquetas)" }}>{etiqueta}</dt>
      <dd style={{ margin: "var(--do-sp-1) 0 0" }}>{valor}</dd>
    </div>
  );
}
