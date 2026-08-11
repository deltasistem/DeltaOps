/**
 * DGP-016 · Home de Analytics (/analytics).
 *
 * Navegación a los 8 dashboards del sistema, a los dashboards personalizados del
 * usuario y al catálogo de indicadores. Sólo Design System. Estados honestos
 * (cargando/error/vacío); nunca inventa datos.
 */
import React from "react";
import { Link } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Spinner,
  EmptyState,
  ErrorState,
} from "@workspace/design-system";
import { ShellAnalytics, useSesionAnalytics } from "../lib/analytics/Shell";
import { useDashboards } from "../lib/analytics/hooks";
import { DASHBOARDS_SISTEMA } from "../lib/analytics/constantes";
import { urlDashboard, urlIndicadores, urlDashboardNuevo } from "../lib/analytics/deep-links";
import type { Dashboard } from "../lib/analytics/tipos";

export default function AnalyticsHomePage() {
  return (
    <ShellAnalytics activo="/analytics">
      <Home />
    </ShellAnalytics>
  );
}

function Home() {
  const { capacidades } = useSesionAnalytics();
  const { datos, cargando, error, recargar } = useDashboards();

  const dashboards: Dashboard[] = datos ?? [];
  const porClave = new Map(dashboards.map((d) => [d.clave, d]));
  const personalizados = dashboards.filter((d) => !d.delSistema);

  return (
    <>
      <PageHeader
        titulo="Analytics"
        descripcion="Plataforma empresarial de indicadores y analítica operacional (solo lectura)."
        acciones={
          capacidades.dashboard ? (
            <Link href={urlDashboardNuevo()}>
              <Button variant="primario" size="sm">Nuevo dashboard</Button>
            </Link>
          ) : undefined
        }
      />

      <Section titulo="Dashboards del sistema">
        <p style={subtitulo}>Ocho vistas canónicas listas para consumir.</p>
        {error && <ErrorState titulo="No se pudieron cargar los dashboards" descripcion={error.message} onReintentar={recargar} />}
        {cargando && !datos && (
          <div style={{ display: "grid", placeItems: "center", minHeight: 120 }}><Spinner /></div>
        )}
        {!error && (
          <div style={rejilla}>
            {DASHBOARDS_SISTEMA.map((d) => {
              const real = porClave.get(d.clave);
              return (
                <Card key={d.clave} interactiva role="group" aria-label={`Dashboard ${d.nombre}`}>
                  <CardHeader>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                      <strong>{d.nombre}</strong>
                      <Badge variant="neutro">sistema</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{d.descripcion}</p>
                    {real ? (
                      <Link href={urlDashboard(real.id)}>
                        <Button variant="secundario" size="sm">Abrir</Button>
                      </Link>
                    ) : (
                      <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                        No sembrado en este tenant.
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section titulo="Mis dashboards">
        <p style={subtitulo}>Dashboards personalizados que has creado o clonado.</p>
        {personalizados.length === 0 ? (
          <EmptyState
            titulo="Aún no tienes dashboards propios"
            descripcion={capacidades.dashboard ? "Crea uno nuevo o clona uno del sistema para personalizarlo." : "Tu rol no permite crear dashboards."}
          />
        ) : (
          <div style={rejilla}>
            {personalizados.map((d) => (
              <Card key={d.id} interactiva role="group" aria-label={`Dashboard ${d.nombre}`}>
                <CardHeader>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                    <strong>{d.nombre}</strong>
                    <Badge variant="info">propio</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {d.descripcion && <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{d.descripcion}</p>}
                  <Link href={urlDashboard(d.id)}>
                    <Button variant="secundario" size="sm">Abrir</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section titulo="Catálogo de indicadores">
        <p style={subtitulo}>Definiciones declarativas disponibles para consultar y evaluar.</p>
        <Link href={urlIndicadores()}>
          <Button variant="primario" size="sm">Ver indicadores</Button>
        </Link>
      </Section>
    </>
  );
}

const rejilla: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
  gap: "var(--do-sp-4)",
};

const subtitulo: React.CSSProperties = {
  margin: "0 0 var(--do-sp-3)",
  color: "var(--do-texto-suave)",
  fontSize: "var(--do-text-sm)",
};
