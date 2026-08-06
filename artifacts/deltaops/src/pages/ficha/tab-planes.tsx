/**
 * DGP-012 · Vista 360° del Activo — pestaña «Planes».
 *
 * Integra el motor preventivo en la ficha del activo (y, por tanto, en el flujo
 * QR del activo, que NO crea un QR propio): lista los planes cuyo alcance
 * declarativo incluye este activo, con su frecuencia, estado y próxima
 * ocurrencia, y permite crear un plan ya anclado al activo. Compone el read
 * model de Planes (`usePlanesDeActivo`); no abre API nueva.
 */
import React from "react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
} from "@workspace/design-system";
import { usePlanesDeActivo } from "../../lib/planes/hooks";
import { BadgeEstadoPlan, resumenFrecuencia, fechaCorta } from "../../lib/planes/componentes";
import { urlPlan, urlNuevoPlan } from "../../lib/planes/deep-links";

export function TabPlanes({ activoId }: { activoId: string; activoNombre?: string }) {
  const { datos, cargando, error, recargar } = usePlanesDeActivo(activoId);

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar los planes del activo" descripcion={error.message} onReintentar={recargar} />;

  const planes = datos ?? [];
  const vigentes = planes.filter((p) => p.estado === "VIGENTE").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Badge variant="exito">{vigentes} vigente(s)</Badge>
          <Badge variant="neutro">{planes.length} plan(es)</Badge>
        </div>
        <Link href={urlNuevoPlan(activoId)}>
          <Button variant="primario" size="sm">Nuevo plan para este activo</Button>
        </Link>
      </div>

      {planes.length === 0 ? (
        <Card><CardContent>
          <EmptyState titulo="Sin planes" descripcion="Este activo no está cubierto por ningún plan de mantenimiento (por alcance de activos)." />
        </CardContent></Card>
      ) : (
        <ul aria-label="Planes del activo" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          {planes.map((p) => (
            <li key={p.id}>
              <Card>
                <CardHeader>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
                    <strong>{p.nombre}</strong>
                    <BadgeEstadoPlan estado={p.estado} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", fontSize: "var(--do-text-sm)" }}>
                      <span style={{ color: "var(--do-texto-suave)" }}>{p.tipoPlan} · {p.estrategia}</span>
                      <span>{resumenFrecuencia(p.programa?.frecuencia)}</span>
                      {p.proximaOcurrencia && <span style={{ color: "var(--do-texto-suave)" }}>Próxima: {fechaCorta(p.proximaOcurrencia)}</span>}
                    </div>
                    <Link href={urlPlan(p.id)}><Button size="sm" variant="secundario">Abrir plan</Button></Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
