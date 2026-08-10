/**
 * DGP-017 · Superficies de administración: usuarios (listar/crear/invitar/editar/
 * activar-desactivar/roles/auditoría), configuración del tenant (regional +
 * branding + módulos read-only) y SaaS global (tenants + estados). El backend es
 * la autoridad de seguridad; la UI ofrece según capacidades y muestra avisos
 * honestos cuando el rol no corresponde.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import AdministracionUsuarios from "../pages/administracion-usuarios";
import AdministracionConfiguracion from "../pages/administracion-configuracion";
import AdministracionSaaS from "../pages/administracion-saas";
import { SesionProvider } from "../lib/identidad/sesion";
import type { Sesion } from "../lib/identidad/tipos";

function sesion(rol: Sesion["rol"] = "TENANT_ADMIN"): Sesion {
  return {
    identityId: "u1",
    email: "ada@acme.com",
    nombre: "Ada Lovelace",
    tenant: { id: "t1", codigo: "ACME", nombre: "ACME", estado: "ACTIVO", branding: {} },
    rol,
    modulos: ["activos"],
    membresias: [],
  };
}

function resp(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status: status === 204 ? 200 : status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Ruteo {
  ses?: Sesion;
  handler?: (url: string, init?: RequestInit) => Response | null;
}

function renderPagina(Comp: React.ComponentType, { ses = sesion(), handler }: Ruteo = {}) {
  const capturas: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    capturas.push({ url, method: (init?.method ?? "GET").toUpperCase(), body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (handler) {
      const r = handler(url, init);
      if (r) return r;
    }
    if (url.includes("/auth/session")) return resp(ses);
    if (url.includes("/tenant/branding")) return resp({});
    return resp(null);
  });
  const { hook } = memoryLocation({ path: "/", static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <SesionProvider>
          <Comp />
        </SesionProvider>
      </Router>
    </QueryClientProvider>,
  );
  return { capturas };
}

beforeEach(() => cleanup());
afterEach(() => vi.restoreAllMocks());

/* ------------------------------- Usuarios ------------------------------- */

const USUARIOS = [
  { identityId: "a", email: "ada@acme.com", nombre: "Ada", rol: "TENANT_ADMIN", estado: "ACTIVO" },
  { identityId: "b", email: "bob@acme.com", nombre: "Bob", rol: "TECNICO", estado: "INACTIVO" },
];

describe("admin usuarios · listado, roles y acciones", () => {
  it("lista usuarios con su rol y estado", async () => {
    renderPagina(AdministracionUsuarios, {
      handler: (url) => (url.includes("/users") ? resp(USUARIOS) : null),
    });
    await screen.findByText("Ada");
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getAllByText(/Administrador de empresa/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });

  it("desactiva un usuario activo (POST /deactivate)", async () => {
    const { capturas } = renderPagina(AdministracionUsuarios, {
      handler: (url) => {
        if (url.includes("/deactivate")) return resp(null, 204);
        if (url.includes("/users")) return resp(USUARIOS);
        return null;
      },
    });
    await screen.findByText("Ada");
    // La fila de Ada (activa) ofrece "Desactivar".
    const filaAda = screen.getByText("Ada").closest("tr")!;
    fireEvent.click(within(filaAda).getByRole("button", { name: /Desactivar/i }));
    await waitFor(() => expect(capturas.some((c) => c.url.includes("/deactivate") && c.method === "POST")).toBe(true));
  });

  it("crea/invita un usuario eligiendo rol", async () => {
    const { capturas } = renderPagina(AdministracionUsuarios, {
      handler: (url, init) => {
        if (url.endsWith("/users") && (init?.method ?? "GET") === "POST") return resp({}, 201);
        if (url.includes("/users")) return resp(USUARIOS);
        return null;
      },
    });
    await screen.findByText("Ada");
    fireEvent.click(screen.getByRole("button", { name: /Crear \/ invitar/i }));
    await screen.findByRole("dialog");
    // Cambiar a modo "crear" para exigir nombre.
    const modo = screen.getByLabelText(/Modo/i);
    fireEvent.change(modo, { target: { value: "crear" } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/i), { target: { value: "eva@acme.com" } });
    fireEvent.change(screen.getByLabelText(/Nombre completo/i), { target: { value: "Eva" } });
    fireEvent.change(screen.getByLabelText(/Rol inicial/i), { target: { value: "SUPERVISOR" } });
    fireEvent.click(screen.getByRole("button", { name: /^Crear$/i }));
    await waitFor(() => {
      const c = capturas.find((x) => x.url.endsWith("/users") && x.method === "POST");
      expect(c).toBeTruthy();
      expect(c!.body).toMatchObject({ email: "eva@acme.com", nombre: "Eva", rol: "SUPERVISOR" });
    });
  });

  it("un rol sin permiso ve un aviso honesto (no la superficie)", async () => {
    renderPagina(AdministracionUsuarios, { ses: sesion("TECNICO") });
    await screen.findByText(/Acceso restringido/i);
    expect(screen.queryByRole("button", { name: /Crear \/ invitar/i })).toBeNull();
  });
});

/* --------------------------- Configuración ------------------------------ */

describe("admin configuración del tenant", () => {
  it("carga y guarda la configuración regional", async () => {
    const { capturas } = renderPagina(AdministracionConfiguracion, {
      handler: (url, init) => {
        if (url.includes("/tenant/config") && (init?.method ?? "GET") === "PATCH") return resp({ configuracion: {} });
        if (url.includes("/tenant/config")) return resp({ idioma: "es", zonaHoraria: "America/Bogota", moneda: "COP", configuracion: {}, modulos: ["activos"] });
        return null;
      },
    });
    // Panel regional visible por defecto.
    await screen.findByLabelText(/Idioma/i);
    fireEvent.change(screen.getByLabelText(/Moneda/i), { target: { value: "USD" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
    await waitFor(() => {
      const c = capturas.find((x) => x.url.includes("/tenant/config") && x.method === "PATCH");
      expect(c).toBeTruthy();
      expect(c!.body).toMatchObject({ moneda: "USD" });
    });
  });

  it("módulos se muestran de sólo lectura para TENANT_ADMIN", async () => {
    renderPagina(AdministracionConfiguracion, {
      handler: (url) => {
        if (url.includes("/tenant/config")) return resp({ idioma: "es", configuracion: {}, modulos: ["activos"] });
        if (url.includes("/tenant/modules")) return resp({ modulos: ["activos", "ordenes"] });
        return null;
      },
    });
    await screen.findByLabelText(/Idioma/i);
    fireEvent.click(screen.getByRole("tab", { name: /Módulos/i }));
    await screen.findByText(/gestiona la administración global/i);
    // No hay controles para cambiar módulos (sólo lectura).
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

/* -------------------------------- SaaS ---------------------------------- */

const TENANTS = [
  { id: "t1", codigo: "ACME", nombre: "ACME", estado: "ACTIVO" },
  { id: "t2", codigo: "BETA", nombre: "Beta", estado: "SUSPENDIDO" },
];

describe("admin SaaS global (SUPER_ADMIN)", () => {
  it("lista tenants y cambia su estado a CERRADO", async () => {
    const { capturas } = renderPagina(AdministracionSaaS, {
      ses: sesion("SUPER_ADMIN"),
      handler: (url) => {
        if (url.includes("/admin/tenants/") && url.includes("/status")) return resp({ id: "t1", codigo: "ACME", nombre: "ACME", estado: "CERRADO" });
        if (url.includes("/admin/tenants")) return resp(TENANTS);
        return null;
      },
    });
    await screen.findByRole("table");
    const tabla = screen.getByRole("table");
    expect(within(tabla).getByText("Beta")).toBeInTheDocument();
    // Selector de estado de ACME → CERRADO (etiqueta única por empresa).
    fireEvent.change(within(tabla).getByLabelText(/Estado de ACME/i), { target: { value: "CERRADO" } });
    await waitFor(() => {
      const c = capturas.find((x) => x.url.includes("/status") && x.method === "POST");
      expect(c).toBeTruthy();
      expect(c!.body).toMatchObject({ estado: "CERRADO" });
    });
  });

  it("un rol no SUPER_ADMIN ve aviso de acceso restringido", async () => {
    renderPagina(AdministracionSaaS, { ses: sesion("TENANT_ADMIN") });
    await screen.findByText(/exclusiva del administrador global/i);
  });
});
