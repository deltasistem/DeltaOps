/**
 * DGP-017 · Login real de producción de DeltaOps.
 *
 * Pantalla empresarial construida SOLO con el Design System (tokens --do-*,
 * ThemeProvider, Logo, Field, Input, PasswordInput, Button, Alert). Cubre:
 * correo, contraseña con mostrar/ocultar, botón con estado de carga, errores
 * accesibles diferenciados (credenciales, usuario deshabilitado, empresa no
 * operativa, sesión expirada), enlace de recuperación y, si el backend responde
 * 409 SELECT_TENANT, un paso de selección de empresa. AA + responsive.
 *
 * "Recordar sesión": la sesión se gestiona por cookie httpOnly del backend; el
 * cliente no puede prolongarla de forma segura, por lo que se OMITE una casilla
 * de "recordarme" (documentado en docs/identidad-experiencia.md) para no dar una
 * falsa sensación de persistencia controlada por el frontend.
 */
import React, { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ThemeProvider,
  Logo,
  Field,
  Input,
  PasswordInput,
  Button,
  Alert,
} from "@workspace/design-system";
import { login } from "@/lib/identidad/endpoints";
import { IdentidadError, esFalloDeRed } from "@/lib/identidad/api";
import { CLAVE_SESION, purgarCacheExceptoSesion } from "@/lib/identidad/sesion";
import { guardarTenantActivo, purgarColasDeOtrosTenants } from "@/lib/identidad/guardas-offline";
import { nombreRol } from "@/lib/identidad/rbac";
import type { MembresiaResumen, Sesion } from "@/lib/identidad/tipos";

interface EstadoError {
  readonly titulo: string;
  readonly descripcion: string;
}

function traducirError(err: unknown): EstadoError {
  if (esFalloDeRed(err)) {
    return { titulo: "Sin conexión", descripcion: "No se pudo contactar el servidor. Verifica tu red e intenta de nuevo." };
  }
  if (err instanceof IdentidadError) {
    if (err.code === "USER_DISABLED") {
      return { titulo: "Usuario deshabilitado", descripcion: "Tu cuenta está deshabilitada. Contacta al administrador de tu empresa." };
    }
    if (err.code === "TENANT_NOT_OPERATIONAL") {
      return { titulo: "Empresa no operativa", descripcion: "La empresa no está activa en este momento. Contacta a soporte." };
    }
    if (err.status === 401) {
      return { titulo: "Credenciales inválidas", descripcion: "El correo o la contraseña no son correctos." };
    }
    return { titulo: "No se pudo iniciar sesión", descripcion: err.message };
  }
  return { titulo: "Error inesperado", descripcion: "Ocurrió un problema al iniciar sesión." };
}

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<EstadoError | null>(null);
  const [membresias, setMembresias] = useState<readonly MembresiaResumen[] | null>(null);

  // Aviso de sesión expirada vía ?expirada=1 (lo pone el AppShell al 401).
  const expirada = new URLSearchParams(search).get("expirada") === "1";

  function establecerSesion(sesion: Sesion) {
    // Reinicio del estado del cliente para no arrastrar datos del usuario
    // anterior tras un logout→login con OTRA identidad:
    // 1) cancelar cualquier consulta de sesión en vuelo para que no reescriba la
    //    nueva identidad por una carrera con un refetch en segundo plano;
    // 2) SEMBRAR la nueva sesión con la respuesta del login PRIMERO, para que el
    //    dispatcher de `/` la vea al aterrizar sin parpadeo ni refetch a mitad
    //    de camino y SIN romper la suscripción del observador (no usar
    //    qc.clear(): destruiría la sesión recién sembrada);
    // 3) descartar el resto de la cache (datos derivados del usuario previo);
    // 4) purgar las colas offline de otros tenants.
    void qc.cancelQueries({ queryKey: CLAVE_SESION });
    qc.setQueryData(CLAVE_SESION, sesion);
    purgarCacheExceptoSesion(qc);
    guardarTenantActivo(sesion.tenant.id, sesion.identityId);
    purgarColasDeOtrosTenants(sesion.tenant.id);
    setLocation("/");
  }

  async function ingresar(tenantId?: string) {
    setCargando(true);
    setError(null);
    try {
      const sesion = await login({ email, password, tenantId });
      establecerSesion(sesion);
    } catch (err) {
      if (err instanceof IdentidadError && err.code === "SELECT_TENANT") {
        setMembresias((err.datos.membresias as MembresiaResumen[]) ?? []);
      } else {
        setError(traducirError(err));
      }
    } finally {
      setCargando(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void ingresar();
  }

  return (
    <ThemeProvider>
      <div className="do-root do-login">
        {/* Zona A · BRANDING corporativo (fondo oscuro con degradado sutil). El
            logo usa la variante para fondos oscuros (delta rojo + tipografía
            crema); nunca pierde contraste porque esta zona es oscura por diseño. */}
        <BrandingLogin />

        {/* Zona B · FORMULARIO limpio (superficie del tema efectivo). */}
        <main className="do-login__form-zone" aria-labelledby="login-titulo">
          <div className="do-login__form-card">
            {/* Logo prioritario en móvil (§30.6): en desktop la marca vive en la
                zona A, aquí se refuerza con el imagotipo automático por tema. */}
            <div className="do-login__form-brand">
              <Logo variant="imagotipo-auto" width={148} alt="DeltaOps" />
            </div>

            <div className="do-login__head">
              <h1 id="login-titulo" style={{ fontSize: "var(--do-text-2xl)", margin: 0, lineHeight: 1.2 }}>
                {membresias ? "Selecciona tu empresa" : "Iniciar sesión"}
              </h1>
              <p style={{ color: "var(--do-texto-suave)", margin: 0, fontSize: "var(--do-text-sm)" }}>
                {membresias
                  ? "Perteneces a varias empresas. Elige con cuál deseas ingresar."
                  : "Accede a tu plataforma de gestión de mantenimiento."}
              </p>
            </div>

            {expirada && !error && !membresias && (
              <Alert variant="advertencia" titulo="Sesión expirada">
                Tu sesión expiró por seguridad. Vuelve a iniciar sesión.
              </Alert>
            )}

            <div aria-live="assertive">
              {error && (
                <Alert variant="error" titulo={error.titulo} onClose={() => setError(null)}>
                  {error.descripcion}
                </Alert>
              )}
            </div>

            {membresias ? (
              <SelectorTenant
                membresias={membresias}
                cargando={cargando}
                onElegir={(tenantId) => void ingresar(tenantId)}
                onVolver={() => {
                  setMembresias(null);
                  setError(null);
                }}
              />
            ) : (
              <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }} noValidate>
                <Field label="Correo electrónico" required>
                  <Input
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="nombre@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </Field>
                <Field label="Contraseña" required>
                  <PasswordInput
                    name="password"
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <Button type="submit" variant="primario" disabled={cargando || !email || !password} style={{ minHeight: 48 }}>
                  {cargando ? "Ingresando…" : "Ingresar"}
                </Button>
                <div style={{ textAlign: "center" }}>
                  <Button variant="fantasma" size="sm" onClick={() => setLocation("/recuperar")} type="button" style={{ minHeight: 48 }}>
                    ¿Olvidaste tu contraseña?
                  </Button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}

/**
 * Zona de BRANDING del login (§30.3–§30.5). Composición corporativa sobre fondo
 * oscuro con degradado sutil: logo, marca «DeltaOps», titular grande, subtítulo
 * operacional, descripción breve, chip «Plataforma corporativa / Acceso
 * controlado y auditado» y footer discreto. Es SIEMPRE oscura por diseño, por lo
 * que el logo usa la variante para fondos oscuros. NO inventa cifras/clientes.
 */
function BrandingLogin() {
  return (
    <aside className="do-login__brand-zone" aria-hidden="false">
      <div className="do-login__brand-top">
        <Logo variant="imagotipo-oscuro" width={160} alt="DeltaOps" />
      </div>

      <div className="do-login__brand-main">
        <h2 className="do-login__titular">Plataforma empresarial de gestión de mantenimiento</h2>
        <p className="do-login__subtitulo">
          Órdenes de trabajo, activos, inventario y costos en un solo lugar, con
          trazabilidad y control operacional.
        </p>

        <div className="do-login__chip" role="note">
          <span className="do-login__chip-icono" aria-hidden="true">🛡️</span>
          <span>
            <strong style={{ display: "block", fontSize: "var(--do-text-sm)" }}>Plataforma corporativa</strong>
            <span style={{ fontSize: "var(--do-text-xs)", opacity: 0.85 }}>Acceso controlado y auditado</span>
          </span>
        </div>
      </div>

      <footer className="do-login__brand-footer">
        <strong style={{ display: "block", fontSize: "var(--do-text-xs)", letterSpacing: "0.04em" }}>DELTAOPS</strong>
        <span style={{ fontSize: "var(--do-text-xs)", opacity: 0.75 }}>Gestión de mantenimiento empresarial</span>
      </footer>
    </aside>
  );
}

function SelectorTenant({
  membresias,
  cargando,
  onElegir,
  onVolver,
}: {
  membresias: readonly MembresiaResumen[];
  cargando: boolean;
  onElegir: (tenantId: string) => void;
  onVolver: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
        {membresias.map((m) => (
          <li key={m.tenantId}>
            <Button
              variant="secundario"
              onClick={() => onElegir(m.tenantId)}
              disabled={cargando}
              style={{ width: "100%", justifyContent: "space-between" }}
            >
              <span>{m.nombre}</span>
              <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>{nombreRol(m.rol)}</span>
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="fantasma" size="sm" onClick={onVolver} disabled={cargando} type="button">
        ← Volver
      </Button>
    </div>
  );
}
