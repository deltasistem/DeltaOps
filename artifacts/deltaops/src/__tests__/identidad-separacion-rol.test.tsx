/**
 * DGP-017 (corrección de separación por rol) · La experiencia de aterrizaje y la
 * navegación se separan por ROL CANÓNICO de la sesión de identidad. Verifica:
 *  A. SUPER_ADMIN → consola global técnica.
 *  B. TENANT_ADMIN → experiencia empresarial (SIN infraestructura) + admin.
 *  C. SUPERVISOR → landing operacional con navegación por capacidades.
 *  D. TECNICO → landing de ejecución (mis órdenes).
 *  E. CONSULTA → superficie de negocio, sin admin ni infraestructura.
 *  F. Aislamiento: un rol no-global no accede por URL a superficies SUPER_ADMIN.
 *  G. Refresh: el contexto se conserva (la sesión se recarga desde /auth/session).
 *  H. Logout/login: el AppShell se reconstruye según la identidad actual.
 *
 * La autorización real permanece en el backend; esto sólo enruta/compone la UI.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Inicio from "../pages/inicio";
import { SoloSuperAdmin } from "../lib/identidad/GuardaRuta";
import { AppShellIdentidad } from "../lib/identidad/AppShell";
import { SesionProvider } from "../lib/identidad/sesion";
import { landingOperacional, esRutaSoloSuperAdmin } from "../lib/identidad/rbac";
import type { Sesion, Rol } from "../lib/identidad/tipos";

const MODULOS_9 = [
  "referencia", "activos", "ordenes", "inventario", "planes",
  "abastecimiento", "preventivo", "correctivo", "analytics",
] as const;

function sesion(rol: Rol, over: Partial<Sesion> = {}): Sesion {
  const esSuper = rol === "SUPER_ADMIN";
  return {
    identityId: esSuper ? "sa" : "u1",
    email: esSuper ? "admin@deltaops.dev" : "admin@delta.demo",
    nombre: esSuper ? "Super Admin" : "Admin Demo",
    tenant: esSuper
      ? { id: "deltaops", codigo: "DELTAOPS", nombre: "DeltaOps", estado: "ACTIVO", branding: {} }
      : { id: "delta-demo", codigo: "DEMO", nombre: "Delta Demo", estado: "ACTIVO", branding: {} },
    rol,
    modulos: esSuper ? ["referencia", "activos"] : [...MODULOS_9],
    membresias: [],
    ...over,
  };
}

function resp(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status: status === 204 ? 200 : status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Instala un backend simulado consciente del rol (identity + legacy /auth/me). */
function backend(ses: Sesion, contador?: { session: number }) {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (url.includes("/auth/session")) {
      if (contador) contador.session += 1;
      return resp(ses);
    }
    // Legacy /auth/me que consume la consola técnica del SUPER_ADMIN.
    if (url.includes("/auth/me")) {
      return resp({ identityId: ses.identityId, nombre: ses.nombre, rol: ses.rol === "SUPER_ADMIN" ? "admin" : ses.rol });
    }
    if (url.includes("/tenant/branding")) return resp(ses.tenant.branding ?? {});
    // Superficies globales de infraestructura (consola técnica).
    if (url.includes("/health")) return resp({ status: "ok", timestamp: new Date(0).toISOString() });
    if (url.includes("/ready")) return resp({ status: "ok", checks: [] });
    if (url.includes("/info")) return resp({ name: "deltaops", version: "1", environment: "test", nodeVersion: "20", uptimeSeconds: 1 });
    if (url.includes("/metrics")) return resp({ uptimeSeconds: 1, avgResponseTimeMs: 5, requestCount: 1, errorCount: 0 });
    return resp(null);
  });
}

function renderInicio(ses: Sesion, contador?: { session: number }, ruta = "/") {
  backend(ses, contador);
  const { hook, history } = memoryLocation({ path: ruta, static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <SesionProvider>
          <Inicio />
        </SesionProvider>
      </Router>
    </QueryClientProvider>,
  );
  return { history, qc };
}

beforeEach(() => { cleanup(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

/* --------------------------- A. SUPER_ADMIN ----------------------------- */

describe("A · SUPER_ADMIN aterriza en la consola global técnica", () => {
  it("muestra la consola de infraestructura (Estado Global / Información de Sistema)", async () => {
    renderInicio(sesion("SUPER_ADMIN"));
    expect(await screen.findByText("DeltaOps Console")).toBeInTheDocument();
    expect(screen.getByText(/Estado Global/i)).toBeInTheDocument();
    expect(screen.getByText(/Información de Sistema/i)).toBeInTheDocument();
  });
});

/* --------------------------- B. TENANT_ADMIN ---------------------------- */

describe("B · TENANT_ADMIN aterriza en la experiencia empresarial", () => {
  it("NO muestra la consola técnica ni conceptos de infraestructura", async () => {
    renderInicio(sesion("TENANT_ADMIN"));
    await screen.findByText(/Bienvenido, Admin Demo/i);
    expect(screen.queryByText("DeltaOps Console")).toBeNull();
    expect(screen.queryByText(/Estado Global/i)).toBeNull();
    expect(screen.queryByText(/Uptime/i)).toBeNull();
    expect(screen.queryByText(/Readiness/i)).toBeNull();
    expect(screen.queryByText(/Información de Sistema/i)).toBeNull();
  });

  it("muestra su empresa, administración de empresa y NO navegación de plataforma/motores", async () => {
    renderInicio(sesion("TENANT_ADMIN"));
    await screen.findByText(/Bienvenido, Admin Demo/i);
    // Nombre de la empresa presente (encabezado y bienvenida).
    expect(screen.getAllByText(/Delta Demo/i).length).toBeGreaterThan(0);
    // Accesos de administración de la empresa.
    expect(screen.getByRole("button", { name: /Administrar usuarios/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Configurar empresa/i })).toBeInTheDocument();
    // Nunca navegación de plataforma/motores/consola de infraestructura.
    const nav = screen.getByRole("navigation");
    expect(nav).not.toHaveTextContent(/Plataforma/i);
    expect(nav).not.toHaveTextContent(/Motores/i);
  });
});

/* ---------------------------- C. SUPERVISOR ----------------------------- */

describe("C · SUPERVISOR aterriza en superficie operacional", () => {
  it("no ve administración de empresa ni infraestructura", async () => {
    renderInicio(sesion("SUPERVISOR"));
    await screen.findByText(/Bienvenido, Admin Demo/i);
    expect(screen.queryByText("DeltaOps Console")).toBeNull();
    expect(screen.queryByRole("button", { name: /Administrar usuarios/i })).toBeNull();
    // El CTA operacional principal del supervisor es el centro de mantenimiento.
    expect(landingOperacional(sesion("SUPERVISOR"))!.ruta).toBe("/centro");
  });
});

/* ------------------------------ D. TECNICO ------------------------------ */

describe("D · TECNICO aterriza en ejecución (mis órdenes)", () => {
  it("prioriza /ordenes como landing y no muestra admin ni infra", async () => {
    renderInicio(sesion("TECNICO"));
    await screen.findByText(/Bienvenido, Admin Demo/i);
    expect(landingOperacional(sesion("TECNICO"))!.ruta).toBe("/ordenes");
    expect(screen.queryByRole("button", { name: /Administrar usuarios/i })).toBeNull();
    expect(screen.queryByText(/Información de Sistema/i)).toBeNull();
  });
});

/* ------------------------------ E. CONSULTA ----------------------------- */

describe("E · CONSULTA sólo ve superficies de negocio (sin admin/infra)", () => {
  it("no expone administración ni consola técnica", async () => {
    renderInicio(sesion("CONSULTA"));
    await screen.findByText(/Bienvenido, Admin Demo/i);
    expect(screen.queryByRole("button", { name: /Administrar usuarios/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Configurar empresa/i })).toBeNull();
    expect(screen.queryByText("DeltaOps Console")).toBeNull();
  });
});

/* ----------------------------- F. Aislamiento --------------------------- */

describe("F · aislamiento por URL a superficies SUPER_ADMIN", () => {
  it("clasifica las rutas globales como exclusivas de SUPER_ADMIN", () => {
    expect(esRutaSoloSuperAdmin("/plataforma")).toBe(true);
    expect(esRutaSoloSuperAdmin("/motores")).toBe(true);
    expect(esRutaSoloSuperAdmin("/motores/playground")).toBe(true);
    expect(esRutaSoloSuperAdmin("/consola-activos")).toBe(true);
    expect(esRutaSoloSuperAdmin("/administracion/saas")).toBe(true);
    // Superficies empresariales NO son globales.
    expect(esRutaSoloSuperAdmin("/centro")).toBe(false);
    expect(esRutaSoloSuperAdmin("/administracion/usuarios")).toBe(false);
    expect(esRutaSoloSuperAdmin("/ordenes")).toBe(false);
  });

  it("TENANT_ADMIN en /administracion/saas: la URL cambia a / (no queda en la ruta prohibida)", async () => {
    backend(sesion("TENANT_ADMIN"));
    const { hook, history } = memoryLocation({ path: "/administracion/saas", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Router hook={hook}>
          <SesionProvider>
            <SoloSuperAdmin><div>Superficie global</div></SoloSuperAdmin>
          </SesionProvider>
        </Router>
      </QueryClientProvider>,
    );
    // La redirección debe ser REAL de URL: la barra de direcciones termina en "/",
    // nunca en la ruta prohibida.
    await waitFor(() => expect(history.at(-1)).toBe("/"));
    expect(history.at(-1)).not.toBe("/administracion/saas");
    expect(screen.queryByText("Superficie global")).toBeNull();
  });

  it("bajo un base path, el destino se resuelve con el prefijo del router (URL real = base + /)", async () => {
    backend(sesion("TENANT_ADMIN"));
    // memoryLocation modela el historial REAL del navegador: la ruta inicial y
    // los destinos incluyen el prefijo /deltaops. El Router usa ese base.
    const { hook, history } = memoryLocation({ path: "/deltaops/administracion/saas", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Router base="/deltaops" hook={hook}>
          <SesionProvider>
            <SoloSuperAdmin><div>Superficie global</div></SoloSuperAdmin>
          </SesionProvider>
        </Router>
      </QueryClientProvider>,
    );
    // La redirección a "/" (relativa al router) produce la URL real /deltaops/,
    // nunca se queda en la ruta prohibida con prefijo.
    await waitFor(() => expect(history.at(-1)).toBe("/deltaops/"));
    expect(history.at(-1)).not.toBe("/deltaops/administracion/saas");
    expect(screen.queryByText("Superficie global")).toBeNull();
  });

  it("SUPER_ADMIN sí ve la superficie global protegida", async () => {
    backend(sesion("SUPER_ADMIN"));
    const { hook } = memoryLocation({ path: "/administracion/saas", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Router hook={hook}>
          <SesionProvider>
            <SoloSuperAdmin><div>Superficie global</div></SoloSuperAdmin>
          </SesionProvider>
        </Router>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Superficie global")).toBeInTheDocument();
  });

  it("sin sesión, la superficie global redirige a /login", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      if (String(u).includes("/auth/session")) return resp({ error: "no auth" }, 401);
      return resp(null);
    });
    const { hook, history } = memoryLocation({ path: "/administracion/saas", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Router hook={hook}>
          <SesionProvider>
            <SoloSuperAdmin><div>Superficie global</div></SoloSuperAdmin>
          </SesionProvider>
        </Router>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(history.at(-1)).toBe("/login"));
  });
});

/* ------------------------------- G. Refresh ----------------------------- */

describe("G · refresh conserva el contexto (recarga /auth/session)", () => {
  it("al montar de nuevo, la experiencia se resuelve desde la sesión del backend", async () => {
    const contador = { session: 0 };
    const { qc } = renderInicio(sesion("TENANT_ADMIN"), contador);
    await screen.findByText(/Bienvenido, Admin Demo/i);
    expect(contador.session).toBeGreaterThanOrEqual(1);
    // Simular refresh: nuevo árbol/QueryClient parte de la misma sesión del backend.
    cleanup();
    qc.clear();
    const contador2 = { session: 0 };
    renderInicio(sesion("TENANT_ADMIN"), contador2);
    await screen.findByText(/Bienvenido, Admin Demo/i);
    expect(contador2.session).toBeGreaterThanOrEqual(1);
  });
});

/* ---------------------------- H. Logout/login --------------------------- */

describe("H · logout/login reconstruye el AppShell según la identidad", () => {
  it("un segundo login con otro rol produce otra experiencia (super → empresarial)", async () => {
    // Primer login: SUPER_ADMIN → consola técnica.
    const primero = renderInicio(sesion("SUPER_ADMIN"));
    expect(await screen.findByText("DeltaOps Console")).toBeInTheDocument();
    // Logout + login con TENANT_ADMIN: se reconstruye desde cero.
    cleanup();
    primero.qc.clear();
    vi.restoreAllMocks();
    renderInicio(sesion("TENANT_ADMIN"));
    await screen.findByText(/Bienvenido, Admin Demo/i);
    expect(screen.queryByText("DeltaOps Console")).toBeNull();
  });

  it("cerrar sesión desde el menú de perfil limpia caches y navega a /login de inmediato", async () => {
    const ses = sesion("TENANT_ADMIN");
    let logoutLlamado = false;
    const contador = { session: 0 };
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      const url = String(u);
      if (url.includes("/auth/logout") || (init && (init as RequestInit).method === "POST" && url.includes("/auth/"))) {
        logoutLlamado = true;
        return resp(null, 200);
      }
      if (url.includes("/auth/session")) {
        contador.session += 1;
        return resp(ses);
      }
      if (url.includes("/tenant/branding")) return resp(ses.tenant.branding ?? {});
      return resp(null);
    });
    const { hook, history } = memoryLocation({ path: "/", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spyClear = vi.spyOn(qc, "clear");
    render(
      <QueryClientProvider client={qc}>
        <Router hook={hook}>
          <SesionProvider>
            <AppShellIdentidad><div>Contenido empresarial</div></AppShellIdentidad>
          </SesionProvider>
        </Router>
      </QueryClientProvider>,
    );
    // Abrir el menú de perfil (disparador con aria-haspopup="menu") y ejecutar
    // "Cerrar sesión".
    await screen.findByText("Contenido empresarial");
    const disparador = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    expect(disparador).not.toBeNull();
    fireEvent.click(disparador!);
    const cerrar = await screen.findByRole("menuitem", { name: /Cerrar sesión/i });
    fireEvent.click(cerrar);
    // Debe navegar a /login de inmediato y haber limpiado el cache.
    await waitFor(() => expect(history.at(-1)).toBe("/login"));
    expect(logoutLlamado).toBe(true);
    expect(spyClear).toHaveBeenCalled();
  });
});
