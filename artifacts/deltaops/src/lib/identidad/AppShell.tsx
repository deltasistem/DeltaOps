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
  Switch,
  AppShell,
  type DropdownItem,
} from "@workspace/design-system";
import { Building2, UserCircle, Palette, MapPin, Eye } from "lucide-react";
import { useSesion } from "./sesion";
import { OpcionesApariencia } from "./SelectorApariencia";
import { BrandingProvider, useBranding } from "./branding";
import { esAdminEmpresa, esSuperAdmin, gruposNavegacion, esGrupoSecundario, nombreRol } from "./rbac";
import {
  useVisibilidadNav,
  guardarVisibilidadNav,
  GRUPOS_CONFIGURABLES,
} from "./visibilidad-nav";
import { utilizacionVisible } from "../utilizacion/capacidades";
import { useCatalogo } from "../activos/hooks";
import { CentroCostosProvider, useCentroCostos, CENTRO_TODOS, type OpcionCentro } from "../centro/contexto";
import type { Sesion } from "./tipos";

/* --------------------------------- Marca -------------------------------- */

function Marca() {
  const branding = useBranding();
  if (branding.esDeltaOficial || !branding.logoUrl) {
    // DGP-021.3 (§30.1/§31) · el shell/nav vive sobre una superficie que cambia
    // con el tema; `imagotipo-auto` elige el asset por tema efectivo para NO
    // perder contraste en oscuro (delta rojo + tipografía crema).
    return <Logo variant="imagotipo-auto" width={132} alt={branding.nombreApp} />;
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
  // §21 · Modal de visibilidad de módulos (sólo admin de empresa/SUPER_ADMIN).
  const [visibilidadAbierta, setVisibilidadAbierta] = useState(false);

  const items: DropdownItem[] = [
    { etiqueta: "Mi perfil", onSelect: () => setLocation("/perfil") },
    { etiqueta: "Cambiar contraseña", onSelect: () => setLocation("/perfil/contrasena") },
    { etiqueta: "Apariencia", icono: Palette, onSelect: () => setAparienciaAbierta(true) },
  ];
  if (esAdminEmpresa(sesion.rol)) {
    items.push({ etiqueta: "Configuración de empresa", onSelect: () => setLocation("/administracion/configuracion") });
    items.push({ etiqueta: "Visibilidad de módulos", icono: Eye, onSelect: () => setVisibilidadAbierta(true) });
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
      {esAdminEmpresa(sesion.rol) && (
        <ConfiguracionVisibilidad
          abierto={visibilidadAbierta}
          onClose={() => setVisibilidadAbierta(false)}
          tenantId={sesion.tenant.id}
        />
      )}
    </>
  );
}

/* -------------------- Visibilidad de módulos (§21) --------------------- */

/**
 * DELTAOPS LITE-08 §21 · Configuración de VISIBILIDAD de módulos por el admin.
 * Compone sobre la preferencia del tenant (Record Store): decide qué GRUPOS del
 * nav se OCULTAN. Visibilidad ≠ seguridad: el backend sigue rechazando accesos
 * no autorizados; ocultar un grupo no revoca ni concede permisos. Sólo escribe
 * si el backend lo autoriza (admin de empresa/SUPER_ADMIN).
 */
function ConfiguracionVisibilidad({
  abierto,
  onClose,
  tenantId,
}: {
  abierto: boolean;
  onClose: () => void;
  tenantId: string;
}) {
  const { lista, cargando, recargar } = useVisibilidadNav(tenantId);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza el estado editable cuando se abre / cambia la preferencia.
  React.useEffect(() => {
    if (abierto) setOcultos(new Set(lista));
  }, [abierto, lista]);

  function alternar(clave: string, mostrar: boolean) {
    setOcultos((prev) => {
      const next = new Set(prev);
      if (mostrar) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await guardarVisibilidadNav([...ocultos]);
      recargar();
      onClose();
    } catch {
      setError("No se pudo guardar la preferencia. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto={abierto}
      onClose={onClose}
      titulo="Visibilidad de módulos"
      size="sm"
      pie={
        <>
          <Button variant="fantasma" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button variant="primario" onClick={() => void guardar()} disabled={guardando || cargando} style={{ minHeight: 48 }}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <p style={{ margin: "0 0 var(--do-sp-4)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
        Elige qué grupos de módulos se muestran en la navegación de tu empresa.
        Ocultar un grupo sólo cambia la presentación: no afecta a la seguridad ni
        a los permisos (el sistema sigue protegiendo cada acceso).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
        {GRUPOS_CONFIGURABLES.map((g) => {
          const visible = !ocultos.has(g.clave);
          return (
            <div
              key={g.clave}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", minHeight: 48 }}
            >
              <Switch
                label={g.etiqueta}
                checked={visible}
                onChange={(e) => alternar(g.clave, e.target.checked)}
                aria-label={`Mostrar ${g.etiqueta}`}
              />
            </div>
          );
        })}
      </div>
      {error && (
        <p role="alert" style={{ marginTop: "var(--do-sp-3)", color: "var(--do-error)" }}>{error}</p>
      )}
    </Modal>
  );
}

/* --------------------------- Selector de centro ------------------------- */

/**
 * DELTAOPS LITE-03 §3 · Contexto de CENTRO DE COSTOS en la barra. Valores REALES
 * del catálogo `centros-costo`; si está vacío no se muestra (estado vacío
 * honesto). Sólo cambia el contexto de navegación (estado cliente): jamás
 * duplica activos ni datos. Reutiliza el `Select` del DS (tokenizado, legible en
 * claro/oscuro) para no introducir un control nuevo.
 */
function SelectorCentro() {
  const { centro, setCentro, opciones } = useCentroCostos();
  if (opciones.length === 0) return null;
  return (
    <label
      style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)", color: "var(--do-shell-texto)" }}
    >
      <MapPin size={16} aria-hidden="true" />
      <span className="do-solo-desktop" style={{ fontSize: "var(--do-text-xs)" }}>
        Centro de costos
      </span>
      <span style={{ minWidth: 180, display: "inline-block" }}>
        <Select
          size="sm"
          value={centro}
          onChange={(e) => setCentro(e.target.value)}
          aria-label="Centro de costos activo"
        >
          <option value={CENTRO_TODOS}>Todos los centros</option>
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </Select>
      </span>
    </label>
  );
}

/* ------------------------------ Navegación ------------------------------ */

function esActiva(location: string, ruta: string): boolean {
  return location === ruta || location.startsWith(ruta + "/");
}

/**
 * DELTAOPS LITE-03 §1 · Navegación agrupada por PROCESO. Cada grupo muestra su
 * título y sus ítems (rutas existentes) como enlaces visibles. En escritorio se
 * despliega como clústeres horizontales; en móvil, el AppShell del DS la
 * convierte en un cajón vertical. No se crean rutas ni se elimina ninguna: sólo
 * se reagrupa la presentación por entitlement/capacidad reales.
 */
function Navegacion({ sesion }: { sesion: Sesion }) {
  const [location, setLocation] = useLocation();
  // §21 · Preferencia de visibilidad de módulos por tenant (nunca seguridad).
  const { ocultos } = useVisibilidadNav(sesion.tenant.id);
  const grupos = gruposNavegacion(sesion, {
    utilizacionVisible: utilizacionVisible(sesion),
    ocultos,
  });
  // §22 · Los grupos secundarios se colapsan bajo «Más» con menor peso visual;
  // los primarios (priorizados por perfil) se muestran en línea.
  const primarios = grupos.filter((g) => !esGrupoSecundario(g.clave));
  const secundarios = grupos.filter((g) => esGrupoSecundario(g.clave));
  const itemsMas: DropdownItem[] = secundarios.flatMap((g) =>
    g.items.map((it) => ({ etiqueta: `${g.titulo} · ${it.nombre}`, onSelect: () => setLocation(it.ruta) })),
  );
  return (
    <>
      <Link href="/">
        <Button variant={location === "/" ? "primario" : "fantasma"} size="sm" aria-current={location === "/" ? "page" : undefined}>
          Inicio
        </Button>
      </Link>
      {primarios.map((g) => (
        <div key={g.clave} className="do-nav-grupo" role="group" aria-label={g.titulo}>
          <span className="do-nav-grupo__titulo">{g.titulo}</span>
          <div className="do-nav-grupo__items">
            {g.items.map((it) => (
              <Link key={it.clave} href={it.ruta}>
                <Button
                  variant={esActiva(location, it.ruta) ? "primario" : "fantasma"}
                  size="sm"
                  aria-current={esActiva(location, it.ruta) ? "page" : undefined}
                >
                  {it.nombre}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      ))}
      {itemsMas.length > 0 && (
        <div className="do-nav-grupo" role="group" aria-label="Más">
          <span className="do-nav-grupo__titulo">Más</span>
          <div className="do-nav-grupo__items">
            <Dropdown etiquetaMenu="Más módulos" disparador={<span>Más</span>} items={itemsMas} />
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------- Shell --------------------------------- */

export interface AppShellIdentidadProps {
  children: React.ReactNode;
}

function ShellInterno({ sesion, children }: { sesion: Sesion; children: React.ReactNode }) {
  // Catálogo REAL de centros de costos (módulo Activos). Degradación elegante:
  // sin datos o sin módulo → sin opciones → el selector no se muestra.
  const puedeCentro = sesion.modulos.includes("activos");
  // `toleraNoAutorizado`: este catálogo es SÓLO de presentación (selector de
  // centro) y se dispara al montar el shell, justo tras login/logout→login. Un
  // 401 transitorio (cookie de sesión aún no propagada a esta petición inmediata)
  // NO debe arrastrar el navegador a /login: eso reventaba la navegación a la
  // Home de forma intermitente. La AUTORIDAD de sesión es `useSesion`; aquí el
  // 401 se degrada a "sin opciones" y el selector simplemente no se muestra.
  const catCentros = useCatalogo(puedeCentro ? "centros-costo" : "", { toleraNoAutorizado: true });
  const opcionesCentro: OpcionCentro[] = (catCentros.datos ?? []).map((o) => ({
    valor: o.valor,
    etiqueta: o.etiqueta,
  }));
  return (
    <BrandingProvider tenant={sesion.tenant}>
      <CentroCostosProvider tenantId={sesion.tenant.id} opciones={opcionesCentro}>
        <div className="do-root">
          <AppShell
            logo={<Marca />}
            nav={<Navegacion sesion={sesion} />}
            labelNav="Navegación por proceso"
            acciones={
              <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-3)" }}>
                {sesion.tenant.estado && sesion.tenant.estado.toUpperCase() !== "ACTIVO" && (
                  <Badge variant="advertencia">Empresa {sesion.tenant.estado}</Badge>
                )}
                <SelectorCentro />
                <SelectorEmpresa sesion={sesion} />
                <MenuPerfil sesion={sesion} />
              </div>
            }
          >
            {children}
          </AppShell>
        </div>
      </CentroCostosProvider>
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
