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
import { useLocation } from "wouter";
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
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (cargando) return;
    if (error || !sesion) {
      setLocation("/login");
      return;
    }
    if (!esConsolaGlobal(sesion.rol)) {
      // Un rol no global no debe aterrizar aquí: se le devuelve a su inicio.
      setLocation("/");
    }
  }, [cargando, error, sesion, setLocation]);

  if (cargando) return <Cargando />;
  if (!sesion || !esConsolaGlobal(sesion.rol)) return null; // redirigiendo
  return <>{children}</>;
}
