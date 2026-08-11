/**
 * DGP-017 (corrección de separación por rol) · Dispatcher de la ruta raíz `/`.
 *
 * CAUSA RAÍZ que corrige: antes `/` renderizaba SIEMPRE la consola técnica
 * global (`Console`, heredada pre-DGP-017, basada en el `useDeltaopsMe` legacy y
 * en salud/uptime/readiness), por lo que TODOS los roles —incluido TENANT_ADMIN—
 * aterrizaban en una consola de infraestructura.
 *
 * Ahora el aterrizaje se decide por el ROL CANÓNICO de la sesión de identidad
 * (`GET /auth/session`), sin hardcodear email/tenant:
 *   - SUPER_ADMIN  → consola global técnica (superficie de plataforma actual).
 *   - resto de roles → experiencia empresarial del tenant (AppShell de identidad).
 *
 * La autorización real permanece en el backend; esto sólo enruta/compone la UI.
 */
import React from "react";
import { Redirect } from "wouter";
import { ThemeProvider, Spinner } from "@workspace/design-system";
import { useSesion } from "@/lib/identidad/sesion";
import { esConsolaGlobal } from "@/lib/identidad/rbac";
import Console from "@/pages/console";
import InicioEmpresa from "@/pages/inicio-empresa";

function PantallaCargando() {
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

export default function Inicio() {
  const { sesion, cargando, error } = useSesion();

  if (cargando) return <PantallaCargando />;
  // Sin sesión (o 401/error) → login con redirección real de URL.
  if (error || !sesion) return <Redirect to="/login" replace />;

  // SUPER_ADMIN conserva la consola global técnica (infraestructura / plataforma).
  if (esConsolaGlobal(sesion.rol)) return <Console />;

  // El resto de roles aterriza en la experiencia empresarial del tenant.
  return <InicioEmpresa />;
}
