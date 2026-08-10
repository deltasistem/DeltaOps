/**
 * DGP-017 · Experiencia de login de producción. Éxito, errores diferenciados y
 * accesibles (credenciales, usuario deshabilitado, empresa no operativa, sesión
 * expirada) y el flujo 409 SELECT_TENANT → selección de empresa. Sólo DS.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Login from "../pages/login";

const SESION_OK = {
  identityId: "u1",
  email: "ada@acme.com",
  nombre: "Ada Lovelace",
  tenant: { id: "t1", codigo: "ACME", nombre: "ACME", estado: "ACTIVO" },
  rol: "TENANT_ADMIN",
  modulos: ["activos"],
  membresias: [],
};

function respuesta(status: number, body: unknown) {
  const esVacio = status === 204;
  return new Response(esVacio ? null : JSON.stringify(body), {
    status: esVacio ? 200 : status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockLogin(status: number, body: unknown, capturas?: unknown[]) {
  return vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    if (String(u).includes("/auth/login")) {
      if (capturas && init?.body) capturas.push(JSON.parse(init.body as string));
      return respuesta(status, body);
    }
    return respuesta(200, null);
  });
}

function renderLogin(ruta = "/login") {
  const { hook, history } = memoryLocation({ path: ruta, static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <Login />
      </Router>
    </QueryClientProvider>,
  );
  return { history, qc };
}

async function escribirCredenciales() {
  fireEvent.change(document.querySelector('input[name="email"]')!, { target: { value: "ada@acme.com" } });
  fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "secreta1" } });
}

beforeEach(() => cleanup());
afterEach(() => vi.restoreAllMocks());

describe("login · accesibilidad base", () => {
  it("expone campos etiquetados y un botón de ingreso", () => {
    mockLogin(200, SESION_OK);
    renderLogin();
    expect(screen.getByLabelText(/Correo electrónico/i)).toBeInTheDocument();
    expect(document.querySelector('input[name="password"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ingresar/i })).toBeInTheDocument();
    // El área de errores es una región asertiva para lectores de pantalla.
    expect(document.querySelector('[aria-live="assertive"]')).toBeTruthy();
    // Enlace a recuperación disponible.
    expect(screen.getByRole("button", { name: /Olvidaste tu contraseña/i })).toBeInTheDocument();
  });
});

describe("login · éxito", () => {
  it("inicia sesión y navega a la consola", async () => {
    const capturas: unknown[] = [];
    mockLogin(200, SESION_OK, capturas);
    const { history } = renderLogin();
    await escribirCredenciales();
    fireEvent.click(screen.getByRole("button", { name: /Ingresar/i }));
    await waitFor(() => expect(history.at(-1)).toBe("/"));
    expect(capturas[0]).toMatchObject({ email: "ada@acme.com", password: "secreta1" });
  });
});

describe("login · errores diferenciados y accesibles", () => {
  it("401 → credenciales inválidas", async () => {
    mockLogin(401, { error: "Credenciales inválidas" });
    renderLogin();
    await escribirCredenciales();
    fireEvent.click(screen.getByRole("button", { name: /Ingresar/i }));
    await screen.findByText(/Credenciales inválidas/i);
  });

  it("403 USER_DISABLED → usuario deshabilitado", async () => {
    mockLogin(403, { error: "x", code: "USER_DISABLED" });
    renderLogin();
    await escribirCredenciales();
    fireEvent.click(screen.getByRole("button", { name: /Ingresar/i }));
    await screen.findByText(/deshabilitada/i);
  });

  it("403 TENANT_NOT_OPERATIONAL → empresa no operativa", async () => {
    mockLogin(403, { error: "x", code: "TENANT_NOT_OPERATIONAL", estado: "SUSPENDIDO" });
    renderLogin();
    await escribirCredenciales();
    fireEvent.click(screen.getByRole("button", { name: /Ingresar/i }));
    await screen.findByText(/no está activa/i);
  });

  it("?expirada=1 muestra aviso de sesión expirada", () => {
    mockLogin(200, SESION_OK);
    renderLogin("/login?expirada=1");
    expect(screen.getByText(/Sesión expirada/i)).toBeInTheDocument();
  });
});

describe("login · 409 SELECT_TENANT", () => {
  it("muestra el selector de empresas y reintenta con el tenant elegido", async () => {
    const capturas: unknown[] = [];
    let intento = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      if (String(u).includes("/auth/login")) {
        if (init?.body) capturas.push(JSON.parse(init.body as string));
        intento += 1;
        if (intento === 1) {
          return respuesta(409, {
            code: "SELECT_TENANT",
            membresias: [
              { tenantId: "t1", nombre: "ACME", rol: "TENANT_ADMIN" },
              { tenantId: "t2", nombre: "Beta", rol: "CONSULTA" },
            ],
          });
        }
        return respuesta(200, { ...SESION_OK, tenant: { ...SESION_OK.tenant, id: "t2", nombre: "Beta" } });
      }
      return respuesta(200, null);
    });

    const { history } = renderLogin();
    await escribirCredenciales();
    fireEvent.click(screen.getByRole("button", { name: /Ingresar/i }));

    // Paso de selección de empresa.
    await screen.findByText(/Selecciona tu empresa/i);
    expect(screen.getByRole("button", { name: /ACME/i })).toBeInTheDocument();
    const beta = screen.getByRole("button", { name: /Beta/i });
    fireEvent.click(beta);

    await waitFor(() => expect(history.at(-1)).toBe("/"));
    // El segundo intento envió el tenantId elegido.
    expect(capturas[1]).toMatchObject({ tenantId: "t2" });
  });
});
