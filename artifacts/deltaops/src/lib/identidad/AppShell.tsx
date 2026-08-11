/**
 * DGP-017 · AppShell empresarial de DeltaOps.
 *
 * Compone exclusivamente sobre el Design System (ThemeProvider + tokens --do-*,
 * AppShell, Logo, Dropdown, Button). Muestra empresa/tenant actual, usuario,
 * rol; menú de perfil (perfil, cambiar contraseña, configuración si el rol lo
 * permite, cerrar sesión); selector de empresa cuando hay >1 membresía
 * (switch-tenant seguro que invalida TODO el estado local); y navegación que
 * expone SÓLO los módulos habilitados (entitlements). El backend rechaza
 * igualmente los no habilitados: nunca se confía en ocultar botones.
 */
import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ThemeProvider,
  Logo,
  Button,
  Dropdown,
  Spinner,
  Badge,
  Modal,
  Field,
  Select,
  AppShell,
  type DropdownItem,
} from "@workspace/design-system";
import { Building2, UserCircle, Palette } from "lucide-react";
import { useSesion } from "./sesion";
import { OpcionesApariencia } from "./SelectorApariencia";
import { BrandingProvider, useBranding } from "./branding";
import { esAdminEmpresa, esSuperAdmin, modulosVisibles, nombreRol } from "./rbac";
import { utilizacionVisible } from "../utilizacion/capacidades";
import type { Sesion } from "./tipos";

/* --------------------------------- Marca -------------------------------- */

function Marca() {
  const branding = useBranding();
  if (branding.esDeltaOficial || !branding.logoUrl) {
    return <Logo variant="imagotipo" width={132} alt={branding.nombreApp} />;
  }
  // Logo permitido del tenant (URL segura), con alto controlado por token.
  return (
    <img
      src={branding.logoUrl}
      alt={branding.nombreEmpresa}
      style={{ height: "var(--do-sp-8, 2rem)", width: "auto", maxWidth: 180 }}
    />
  );
}

/* --------------------------- Selector de empresa ------------------------ */

function SelectorEmpresa({ sesion }: { sesion: Sesion }) {
  const { cambiarEmpresa } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState(sesion.tenant.id);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sesion.membresias.length <= 1) return null;

  async function confirmar() {
    if (destino === sesion.tenant.id) {
      setAbierto(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      await cambiarEmpresa(destino);
      setAbierto(false);
    } catch {
      setError("No se pudo cambiar de empresa. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <Button
        variant="secundario"
        size="sm"
        onClick={() => {
          setDestino(sesion.tenant.id);
          setError(null);
          setAbierto(true);
        }}
        aria-haspopup="dialog"
      >
        <Building2 size={16} aria-hidden="true" /> {sesion.tenant.nombre}
      </Button>
      <Modal
        abierto={abierto}
        onClose={() => setAbierto(false)}
        titulo="Cambiar de empresa"
        size="sm"
        pie={
          <>
            <Button variant="fantasma" onClick={() => setAbierto(false)} disabled={cargando}>
              Cancelar
            </Button>
            <Button variant="primario" onClick={() => void confirmar()} disabled={cargando}>
              {cargando ? "Cambiando…" : "Cambiar"}
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: "var(--do-sp-4)", color: "var(--do-texto-suave)" }}>
          Al cambiar de empresa se renueva tu sesión y se descarta cualquier dato local del
          contexto anterior.
        </p>
        <Field label="Empresa">
          <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
            {sesion.membresias.map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.nombre} — {nombreRol(m.rol)}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p role="alert" style={{ marginTop: "var(--do-sp-3)", color: "var(--do-error)" }}>
            {error}
          </p>
        )}
      </Modal>
    </>
  );
}

/* ---------------------------- Menú de perfil ---------------------------- */

function MenuPerfil({ sesion }: { sesion: Sesion }) {
  const { cerrarSesion } = useSesion();
  const [, setLocation] = useLocation();
  // Estado del modal de apariencia (Perfil → Preferencias → Apariencia). Vive
  // fuera del Dropdown para poder abrirse tras cerrarse el menú.
  const [aparienciaAbierta, setAparienciaAbierta] = useState(false);

  const items: DropdownItem[] = [
    { etiqueta: "Mi perfil", onSelect: () => setLocation("/perfil") },
    { etiqueta: "Cambiar contraseña", onSelect: () => setLocation("/perfil/contrasena") },
    { etiqueta: "Apariencia", icono: Palette, onSelect: () => setAparienciaAbierta(true) },
  ];
  if (esAdminEmpresa(sesion.rol)) {
    items.push({ etiqueta: "Configuración de empresa", onSelect: () => setLocation("/administracion/configuracion") });
    items.push({ etiqueta: "Usuarios", onSelect: () => setLocation("/administracion/usuarios") });
  }
  if (esSuperAdmin(sesion.rol)) {
    items.push({ etiqueta: "Administración SaaS", onSelect: () => setLocation("/administracion/saas") });
  }
  items.push({
    etiqueta: "Cerrar sesión",
    onSelect: () => {
      // Limpiar caches y navegar a /login de inmediato: no dejar vista stale
      // aunque la sesión del backend ya esté invalidada (401).
      void cerrarSesion().finally(() => setLocation("/login"));
    },
  });

  return (
    <>
      <Dropdown
        etiquetaMenu={`Menú de ${sesion.nombre}`}
        disparador={
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <UserCircle size={20} aria-hidden="true" />
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
              <span style={{ fontSize: "var(--do-text-sm)", fontWeight: 600 }}>{sesion.nombre}</span>
              <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                {nombreRol(sesion.rol)}
              </span>
            </span>
          </span>
        }
        items={items}
      />
      <Modal
        abierto={aparienciaAbierta}
        onClose={() => setAparienciaAbierta(false)}
        titulo="Apariencia"
        size="sm"
        pie={
          <Button variant="primario" size="md" style={{ minHeight: 48 }} onClick={() => setAparienciaAbierta(false)}>
            Listo
          </Button>
        }
      >
        <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
          Elige cómo se ve DeltaOps. La preferencia se mantiene en toda la
          plataforma y se recuerda en este dispositivo.
        </p>
        <OpcionesApariencia />
      </Modal>
    </>
  );
}

/* ------------------------------ Navegación ------------------------------ */

function esActiva(location: string, ruta: string): boolean {
  return location === ruta || location.startsWith(ruta + "/");
}

function Navegacion({ sesion }: { sesion: Sesion }) {
  const [location] = useLocation();
  const modulos = modulosVisibles(sesion);
  return (
    <>
      <Link href="/">
        <Button variant={location === "/" ? "primario" : "fantasma"} size="sm" aria-current={location === "/" ? "page" : undefined}>
          Consola
        </Button>
      </Link>
      {modulos.map((m) => (
        <Link key={m.modulo} href={m.ruta}>
          <Button
            variant={esActiva(location, m.ruta) ? "primario" : "fantasma"}
            size="sm"
            aria-current={esActiva(location, m.ruta) ? "page" : undefined}
          >
            {m.nombre}
          </Button>
        </Link>
      ))}
      {/* DGP-019.1 · Módulo emergente Utilización: se muestra sólo con el
          entitlement "utilizacion" del tenant Y capacidad de lectura del rol.
          El tipo `Modulo` del contrato de identidad aún no lo enumera, por eso
          se gobierna con un guard de presentación dedicado. */}
      {utilizacionVisible(sesion) && (
        <Link href="/utilizacion/lecturas">
          <Button
            variant={esActiva(location, "/utilizacion") ? "primario" : "fantasma"}
            size="sm"
            aria-current={esActiva(location, "/utilizacion") ? "page" : undefined}
          >
            Utilización
          </Button>
        </Link>
      )}
    </>
  );
}

/* -------------------------------- Shell --------------------------------- */

export interface AppShellIdentidadProps {
  children: React.ReactNode;
}

function ShellInterno({ sesion, children }: { sesion: Sesion; children: React.ReactNode }) {
  return (
    <BrandingProvider tenant={sesion.tenant}>
      <div className="do-root">
        <AppShell
          logo={<Marca />}
          nav={<Navegacion sesion={sesion} />}
          labelNav="Módulos habilitados"
          acciones={
            <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)" }}>
              {sesion.tenant.estado && sesion.tenant.estado.toUpperCase() !== "ACTIVO" && (
                <Badge variant="advertencia">Empresa {sesion.tenant.estado}</Badge>
              )}
              <SelectorEmpresa sesion={sesion} />
              <MenuPerfil sesion={sesion} />
            </div>
          }
        >
          {children}
        </AppShell>
      </div>
    </BrandingProvider>
  );
}

/**
 * Envuelve una superficie autenticada: exige sesión válida; si no la hay,
 * redirige a /login. En SUPER_ADMIN/otros roles la navegación se compone según
 * entitlements. Este componente NO es la autoridad de seguridad.
 */
export function AppShellIdentidad({ children }: AppShellIdentidadProps) {
  const { sesion, cargando, error } = useSesion();
  const [, setLocation] = useLocation();

  React.useEffect(() => {
    if (!cargando && (error || !sesion)) {
      setLocation("/login");
    }
  }, [cargando, error, sesion, setLocation]);

  if (cargando) {
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
  if (!sesion) return null;

  return (
    <ThemeProvider>
      <ShellInterno sesion={sesion}>{children}</ShellInterno>
    </ThemeProvider>
  );
}
