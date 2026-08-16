/**
 * FINAL-02 · Shell de la superficie INFORMES (solo lectura).
 *
 * Espejo del patrón de ShellCostos: ThemeProvider del DS subordinado al raíz +
 * do-root, control de sesión (redirige a /login en 401 de sesión) y navegación
 * accesible. La superficie es de SOLO LECTURA: el backend es la autoridad de
 * permisos (401/403 reales por dataset).
 */
import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useDeltaopsMe, getDeltaopsMeQueryKey } from "@workspace/api-client-react";
import { ThemeProvider, Spinner, Button } from "@workspace/design-system";

export interface ShellInformesProps {
  children: React.ReactNode;
  activo?: string;
}

export function ShellInformes({ children, activo }: ShellInformesProps) {
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
  const enHub = rutaActiva === "/informes";

  return (
    <ThemeProvider>
      <div className="do-root" style={{ minHeight: "100vh", background: "var(--do-bg)" }}>
        <nav
          aria-label="Navegación de informes"
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
          <strong style={{ marginRight: "var(--do-sp-2)" }}>Informes operacionales</strong>
          <Link href="/informes">
            <Button variant={enHub ? "primario" : "fantasma"} size="sm" aria-current={enHub ? "page" : undefined}>
              Catálogo
            </Button>
          </Link>
        </nav>
        <main
          style={{
            maxWidth: "var(--do-max-ancho)",
            margin: "0 auto",
            padding: "var(--do-sp-6)",
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
