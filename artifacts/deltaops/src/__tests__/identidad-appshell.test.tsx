/**
 * DGP-017 · AppShell empresarial: muestra empresa/usuario/rol, expone SÓLO los
 * módulos habilitados, aplica branding vía tokens seguros (DELTA/DEMO conserva
 * identidad oficial) y realiza un cambio de empresa SEGURO que invalida el
 * estado local (cache + colas offline de otros tenants).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppShellIdentidad } from "../lib/identidad/AppShell";
import { SesionProvider } from "../lib/identidad/sesion";
import type { Sesion } from "../lib/identidad/tipos";

function sesionBase(over: Partial<Sesion> = {}): Sesion {
  return {
    identityId: "u1",
    email: "ada@acme.com",
    nombre: "Ada Lovelace",
    tenant: { id: "t1", codigo: "ACME", nombre: "ACME", estado: "ACTIVO", branding: {} },
    rol: "TENANT_ADMIN",
    modulos: ["activos", "ordenes"],
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

function renderShell(sesion: Sesion, onFetch?: (u: string, init?: RequestInit) => Response | null) {
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    if (onFetch) {
      const r = onFetch(url, init);
      if (r) return r;
    }
    if (url.includes("/auth/session")) return resp(sesion);
    if (url.includes("/tenant/branding")) return resp(sesion.tenant.branding ?? {});
    return resp(null);
  });
  const { hook, history } = memoryLocation({ path: "/", static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <SesionProvider>
          <AppShellIdentidad>
            <div>Contenido</div>
          </AppShellIdentidad>
        </SesionProvider>
      </Router>
    </QueryClientProvider>,
  );
  return { history, qc };
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("AppShell · identidad visible", () => {
  it("muestra usuario, rol y empresa actual", async () => {
    renderShell(sesionBase());
    await screen.findByText(/Ada Lovelace/i);
    expect(screen.getAllByText(/Administrador de empresa/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });
});

describe("AppShell · entitlements (sólo módulos habilitados)", () => {
  it("muestra únicamente los módulos de la sesión y oculta el resto", async () => {
    renderShell(sesionBase({ modulos: ["activos"] }));
    await screen.findByText(/Ada Lovelace/i);
    const nav = screen.getByRole("navigation");
    // LITE-10 §8 · El ítem de activos se rotula «Equipos» (no-técnico) dentro
    // del macro-grupo OPERACIÓN.
    expect(nav).toHaveTextContent("Equipos");
    // "Mantenimiento"/"Órdenes" NO está contratado en esta sesión → no aparece.
    expect(nav).not.toHaveTextContent("Órdenes");
    // "Indicadores"/"Analytics" nunca (no está en modulos).
    expect(nav).not.toHaveTextContent("Indicadores");
  });
});

describe("AppShell · branding con tokens seguros", () => {
  it("un tenant externo aplica --do-primario desde su color HEX", async () => {
    renderShell(
      sesionBase({
        tenant: {
          id: "t9",
          codigo: "ACME",
          nombre: "ACME",
          estado: "ACTIVO",
          branding: { colorPrimario: "#0A5FB4", nombreApp: "ACME Ops" },
        },
      }),
    );
    await screen.findByText(/Ada Lovelace/i);
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--do-primario").toUpperCase()).toBe("#0A5FB4");
    });
  });

  it("DEMO/DELTA NO aplica color personalizado (identidad oficial)", async () => {
    document.documentElement.style.removeProperty("--do-primario");
    renderShell(
      sesionBase({
        tenant: {
          id: "t1",
          codigo: "DEMO",
          nombre: "Demo",
          estado: "ACTIVO",
          branding: { colorPrimario: "#FF0000" },
        },
      }),
    );
    await screen.findByText(/Ada Lovelace/i);
    // El color rojo del branding jamás se aplica para DEMO.
    expect(document.documentElement.style.getPropertyValue("--do-primario")).not.toBe("#FF0000");
  });

  it("un color NO HEX (intento de CSS arbitrario) se ignora", async () => {
    document.documentElement.style.removeProperty("--do-primario");
    renderShell(
      sesionBase({
        tenant: {
          id: "t9",
          codigo: "ACME",
          nombre: "ACME",
          estado: "ACTIVO",
          branding: { colorPrimario: "url(javascript:alert(1))" },
        },
      }),
    );
    await screen.findByText(/Ada Lovelace/i);
    expect(document.documentElement.style.getPropertyValue("--do-primario")).toBe("");
  });
});

describe("AppShell · cambio de empresa seguro", () => {
  it("con >1 membresía ofrece cambiar y purga colas de otros tenants", async () => {
    // Cola sembrada del tenant actual (t1) que debe purgarse al cambiar a t2.
    localStorage.setItem("deltaops:ordenes:cola:t1", JSON.stringify([{ opId: "x" }]));

    const t2 = sesionBase({
      identityId: "u1",
      tenant: { id: "t2", codigo: "BETA", nombre: "Beta", estado: "ACTIVO", branding: {} },
      rol: "CONSULTA",
    });
    let switched = false;
    const { qc } = renderShell(
      sesionBase({
        membresias: [
          { tenantId: "t1", nombre: "ACME", rol: "TENANT_ADMIN" },
          { tenantId: "t2", nombre: "Beta", rol: "CONSULTA" },
        ],
      }),
      (url, init) => {
        if (url.includes("/auth/switch-tenant")) {
          switched = true;
          expect(JSON.parse(init!.body as string)).toMatchObject({ tenantId: "t2" });
          return resp(t2);
        }
        return null;
      },
    );

    await screen.findByText(/Ada Lovelace/i);
    // Sembramos una consulta arbitraria en cache para comprobar que se limpia.
    qc.setQueryData(["algo", "viejo"], { secreto: true });

    // Abrir el diálogo del selector de empresa.
    fireEvent.click(screen.getByRole("button", { name: /ACME/i }));
    await screen.findByRole("dialog");

    // Elegir Beta y confirmar.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "t2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Cambiar$/i }));

    await waitFor(() => expect(switched).toBe(true));
    // Cache limpiada (el dato viejo ya no existe).
    await waitFor(() => expect(qc.getQueryData(["algo", "viejo"])).toBeUndefined());
    // La cola offline del tenant anterior fue purgada.
    await waitFor(() => expect(localStorage.getItem("deltaops:ordenes:cola:t1")).toBeNull());
  });

  it("con una sola membresía NO ofrece cambiar de empresa", async () => {
    renderShell(sesionBase({ membresias: [] }));
    await screen.findByText(/Ada Lovelace/i);
    expect(screen.queryByRole("button", { name: /Cambiar de empresa/i })).toBeNull();
  });
});

describe("AppShell · sin sesión redirige a /login", () => {
  it("un 401 en /auth/session lleva a /login", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      if (String(u).includes("/auth/session")) return resp({ error: "no auth" }, 401);
      return resp(null);
    });
    const { hook, history } = memoryLocation({ path: "/", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Router hook={hook}>
          <SesionProvider>
            <AppShellIdentidad>
              <div>Contenido</div>
            </AppShellIdentidad>
          </SesionProvider>
        </Router>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(history.at(-1)).toBe("/login"));
  });
});
