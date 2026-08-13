/**
 * DGP-021.4-E · Shell de la superficie COSTOS (lectura). Compone sobre el
 * Experience Foundation existente (ThemeProvider del DS subordinado al raíz +
 * do-root), con control de sesión (redirige a /login en 401) y navegación con
 * foco/ARIA. La superficie de costos es de SÓLO LECTURA (sin CTAs de escritura ni
 * framework offline): el backend es la autoridad de permisos (403).
 */
import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useDeltaopsMe, getDeltaopsMeQueryKey } from "@workspace/api-client-react";
import { ThemeProvider, Spinner, Button } from "@workspace/design-system";

const NAV: { href: string; etiqueta: string }[] = [
  { href: "/costos", etiqueta: "Comparativa y tendencia" },
];

export interface ShellCostosProps {
  children: React.ReactNode;
  activo?: string;
}

export function ShellCostos({ children, activo }: ShellCostosProps) {
  const { data: user, error, isLoading } = useDeltaopsMe({
    query: { retry: false, queryKey: getDeltaopsMeQueryKey() },
  });
  const [location] = useLocation();

  useEffect(() => {
    if (error) window.location.assign(`${import.meta.env.BASE_URL}login`);
  }, [error]);

  if (isLoading) {
    return (
      <ThemeProvider>
        <div className="do-root" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--do-bg)" }}>
          <Spinner />
        </div>
      </ThemeProvider>
    );
  }
  if (!user) return null;

  const rutaActiva = activo ?? location;

  return (
    <ThemeProvider>
      <div className="do-root" style={{ minHeight: "100vh", background: "var(--do-bg)" }}>
        <nav
          aria-label="Navegación de costos"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--do-sp-2)",
            padding: "var(--do-sp-3) var(--do-sp-4)",
            borderBottom: "1px solid var(--do-borde)",
            flexWrap: "wrap",
            background: "var(--do-surface)",
          }}
        >
          <Link href="/" aria-label="Volver a la consola">
            <Button variant="fantasma" size="sm">← Consola</Button>
          </Link>
          <span aria-hidden="true" style={{ color: "var(--do-borde-fuerte)" }}>|</span>
          <strong style={{ marginRight: "var(--do-sp-2)" }}>Costos de mantenimiento</strong>
          {NAV.map((n) => {
            const esActivo = rutaActiva === n.href || rutaActiva.startsWith(n.href + "/");
            return (
              <Link key={n.href} href={n.href}>
                <Button variant={esActivo ? "primario" : "fantasma"} size="sm" aria-current={esActivo ? "page" : undefined}>
                  {n.etiqueta}
                </Button>
              </Link>
            );
          })}
        </nav>
        <main
          style={{
            maxWidth: "var(--do-max-ancho)",
            margin: "0 auto",
            padding: "var(--do-sp-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--do-sp-5)",
          }}
        >
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
