/**
 * DGP-009.3 · Shell de la experiencia de Órdenes de Trabajo.
 *
 * Compone (ESI-008, sin marcos/shells/layouts nuevos) sobre el Experience
 * Foundation: ThemeProvider + do-root, control de sesión (redirige a /login en
 * 401), navegación de la sección con foco/ARIA y el framework offline
 * (OfflineProvider con espacio de nombres "ordenes" + banner de estado).
 *
 * Usa EXCLUSIVAMENTE componentes y tokens del Design System (@workspace/*).
 */
import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useDeltaopsMe, getDeltaopsMeQueryKey } from "@workspace/api-client-react";
import { ThemeProvider, Spinner, OfflineBadge, Button } from "@workspace/design-system";
import { OfflineProvider, useOffline } from "../offline/contexto";
import { TENANT } from "./constantes";

const SYNC_URL = "/api/deltaops/ordenes/sync";

const NAV: { href: string; etiqueta: string }[] = [
  { href: "/centro", etiqueta: "Centro Global" },
  { href: "/ordenes", etiqueta: "Operaciones" },
  { href: "/ordenes/supervisor", etiqueta: "Supervisor" },
  { href: "/ordenes/planificacion", etiqueta: "Planificación" },
  { href: "/ordenes/nueva", etiqueta: "Nueva" },
  { href: "/ordenes/escanear", etiqueta: "Escanear" },
  { href: "/ordenes/sincronizacion", etiqueta: "Sincronización" },
];

function BannerOffline() {
  const { enLinea, pendientes, procesar } = useOffline();
  const estado = !enLinea ? "offline" : pendientes > 0 ? "sincronizando" : "sincronizado";
  if (enLinea && pendientes === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--do-sp-3)",
        padding: "var(--do-sp-2) var(--do-sp-4)",
        background: "var(--do-surface-2)",
        borderBottom: "1px solid var(--do-borde)",
        flexWrap: "wrap",
      }}
    >
      <OfflineBadge estado={estado} />
      {pendientes > 0 && (
        <>
          <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
            {pendientes} operación(es) en cola
          </span>
          {enLinea && (
            <Button variant="secundario" size="sm" onClick={() => void procesar()}>
              Sincronizar ahora
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export interface ShellOrdenesProps {
  children: React.ReactNode;
  /** Ruta activa para resaltar en la navegación. */
  activo?: string;
}

export function ShellOrdenes({ children, activo }: ShellOrdenesProps) {
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
        <div className="do-root" data-do-theme="light" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--do-bg)" }}>
          <Spinner />
        </div>
      </ThemeProvider>
    );
  }
  if (!user) return null;

  const rutaActiva = activo ?? location;

  return (
    <ThemeProvider>
      <OfflineProvider tenant={TENANT} modulo="ordenes" syncUrl={SYNC_URL}>
        <div className="do-root" data-do-theme="light" style={{ minHeight: "100vh", background: "var(--do-bg)" }}>
          <BannerOffline />
          <nav
            aria-label="Navegación de órdenes de trabajo"
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
            <strong style={{ marginRight: "var(--do-sp-2)" }}>Órdenes</strong>
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
      </OfflineProvider>
    </ThemeProvider>
  );
}
