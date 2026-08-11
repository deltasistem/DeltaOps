/**
 * DGP-016 · Shell de la experiencia Enterprise Analytics & KPI Platform.
 *
 * Compone (sin marcos/layouts nuevos) sobre el Experience Foundation:
 * ThemeProvider + do-root, control de sesión (redirige a /login en 401),
 * navegación de la sección con foco/ARIA y el framework offline (OfflineProvider
 * con espacio de nombres "analytics" + banner de estado). Expone las capacidades
 * del rol vía contexto (admin/operador/lector) para decidir qué OFRECER; el
 * backend es la autoridad de permisos. Réplica del patrón de los Shells previos.
 */
import React, { createContext, useContext, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useDeltaopsMe, getDeltaopsMeQueryKey } from "@workspace/api-client-react";
import { ThemeProvider, Spinner, OfflineBadge, Button } from "@workspace/design-system";
import { OfflineProvider, useOffline } from "../offline/contexto";
import { TENANT, SYNC_URL, MODULO_OFFLINE, capacidadesDe, type CapacidadesRol } from "./constantes";

const NAV: { href: string; etiqueta: string }[] = [
  { href: "/analytics", etiqueta: "Inicio" },
  { href: "/analytics/indicadores", etiqueta: "Indicadores" },
  { href: "/analytics/dashboards/nuevo", etiqueta: "Nuevo dashboard" },
  { href: "/analytics/sincronizacion", etiqueta: "Sincronización" },
];

/** Sesión + capacidades del rol para la sección Analytics. */
export interface SesionAnalytics {
  readonly usuarioId: string;
  readonly nombre: string;
  readonly rol: string;
  readonly capacidades: CapacidadesRol;
}

const CtxSesion = createContext<SesionAnalytics | null>(null);

export function useSesionAnalytics(): SesionAnalytics {
  const ctx = useContext(CtxSesion);
  if (!ctx) throw new Error("useSesionAnalytics debe usarse dentro de <ShellAnalytics>");
  return ctx;
}

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

export interface ShellAnalyticsProps {
  children: React.ReactNode;
  /** Ruta activa para resaltar en la navegación. */
  activo?: string;
}

export function ShellAnalytics({ children, activo }: ShellAnalyticsProps) {
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
  const sesion: SesionAnalytics = {
    usuarioId: String(user.id),
    nombre: user.nombre,
    rol: user.rol,
    capacidades: capacidadesDe(user.rol),
  };

  return (
    <ThemeProvider>
      <OfflineProvider tenant={TENANT} modulo={MODULO_OFFLINE} syncUrl={SYNC_URL}>
        <CtxSesion.Provider value={sesion}>
          <div className="do-root" style={{ minHeight: "100vh", background: "var(--do-bg)" }}>
            <BannerOffline />
            <nav
              aria-label="Navegación de analytics"
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
              <strong style={{ marginRight: "var(--do-sp-2)" }}>Analytics</strong>
              {NAV.filter((n) => n.href !== "/analytics/dashboards/nuevo" || sesion.capacidades.dashboard).map((n) => {
                const base = "/analytics";
                const esBase = n.href === base;
                const esActivo = esBase
                  ? rutaActiva === base
                  : rutaActiva === n.href || rutaActiva.startsWith(n.href + "/");
                return (
                  <Link key={n.href} href={n.href}>
                    <Button variant={esActivo ? "primario" : "fantasma"} size="sm" aria-current={esActivo ? "page" : undefined}>
                      {n.etiqueta}
                    </Button>
                  </Link>
                );
              })}
              <span style={{ marginLeft: "auto", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                {sesion.nombre} · <strong>{sesion.rol}</strong>
              </span>
            </nav>
            <main
              style={{
                maxWidth: "var(--do-max-ancho)",
                margin: "0 auto",
                padding: "var(--do-sp-6)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--do-sp-5)",
                width: "100%",
              }}
            >
              {children}
            </main>
          </div>
        </CtxSesion.Provider>
      </OfflineProvider>
    </ThemeProvider>
  );
}
