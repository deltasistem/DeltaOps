/**
 * DGP-017 (corrección de separación por rol) · Guardas de ruta de PRESENTACIÓN.
 *
 * Ocultan/redirigen superficies según el rol de la sesión. NO son la autoridad
 * de seguridad: el backend sigue devolviendo 403 a los accesos no autorizados
 * (verificado: las superficies /admin responden 403 a TENANT_ADMIN). Estas
 * guardas evitan que un rol aterrice por URL directa en una superficie que no le
 * corresponde y lo llevan a su propia experiencia.
 */
import React from "react";
import { Redirect } from "wouter";
import { ThemeProvider, Spinner } from "@workspace/design-system";
import { useSesion } from "./sesion";
import { esConsolaGlobal } from "./rbac";

function Cargando() {
  return (
    <ThemeProvider>
      <div
        className="do-root"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--do-bg)" }}
      >
        <Spinner />
      </div>
    </ThemeProvider>
  );
}

/**
 * Envuelve una superficie EXCLUSIVA del SUPER_ADMIN (administración global /
 * infraestructura). Sin sesión → /login. Con sesión de otro rol → se redirige a
 * la raíz (su propia experiencia empresarial), nunca se muestra la superficie.
 */
export function SoloSuperAdmin({ children }: { children: React.ReactNode }) {
  const { sesion, cargando, error } = useSesion();

  if (cargando) return <Cargando />;
  // Sin sesión (o 401/error) → login. `Redirect` cambia la URL real (respeta el
  // base path del router), no sólo el render.
  if (error || !sesion) return <Redirect to="/login" replace />;
  // Un rol no global no debe aterrizar aquí: se le devuelve a su inicio (`/`),
  // de modo que la barra de direcciones NUNCA se quede en la ruta prohibida.
  if (!esConsolaGlobal(sesion.rol)) return <Redirect to="/" replace />;
  return <>{children}</>;
}
