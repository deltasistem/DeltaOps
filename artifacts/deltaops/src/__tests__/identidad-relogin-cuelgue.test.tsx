/**
 * DELTAOPS LITE-03 · Regresión del CUELGUE del SEGUNDO login (login→logout→login).
 *
 * Fallo real reproducible: en el mismo contexto de navegador, el 1.º login PASA;
 * tras logout, el 2.º login responde 200 en el servidor (cookie puesta) pero la
 * UI se queda en /login con el botón «Ingresando…» (cargando===true), como si la
 * promesa de `login()` nunca se asentara / el árbol quedara congelado.
 *
 * Este test monta el enrutado REAL (dispatcher de `/` = Inicio, y `/login`) bajo
 * un único `SesionProvider` + `QueryClient`, y ejercita el ciclo completo con los
 * mocks mínimos. El contrato: tras el 2.º login la app aterriza en `/` y NO queda
 * ningún botón «Ingresando…» colgado.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Login from "../pages/login";
import Inicio from "../pages/inicio";
import { SesionProvider } from "../lib/identidad/sesion";
import type { Sesion } from "../lib/identidad/tipos";

const SESION: Sesion = {
  identityId: "u1",
  email: "ada@acme.com",
  nombre: "Ada Lovelace",
  tenant: { id: "t1", codigo: "ACME", nombre: "ACME", estado: "ACTIVO", branding: {} },
  rol: "TENANT_ADMIN",
  modulos: ["activos", "ordenes"],
  membresias: [],
};

function resp(status: number, body: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status: status === 204 ? 200 : status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Servidor simulado con COOKIE de sesión: `/auth/session` devuelve 200 sólo si
 * hay "cookie"; `/auth/login` la pone; `/auth/logout` la quita. Reproduce el
 * ciclo real donde la sesión del backend cambia entre login/logout.
 */
function servidorConCookie() {
  const estado = { autenticado: false, loginCount: 0 };
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (url.includes("/auth/login")) {
      estado.autenticado = true;
      estado.loginCount += 1;
      return resp(200, SESION);
    }
    if (url.includes("/auth/logout")) {
      estado.autenticado = false;
      return resp(204, null);
    }
    if (url.includes("/auth/session")) {
      return estado.autenticado ? resp(200, SESION) : resp(401, { error: "no auth" });
    }
    if (url.includes("/tenant/branding")) return resp(200, {});
    // Datos de la Home / catálogos: degradan a vacío (no relevantes al cuelgue).
    if (url.includes("/ordenes")) return resp(200, { ordenes: [] });
    return resp(200, []);
  });
  return estado;
}

function App() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Inicio} />
      <Route>{() => <Login />}</Route>
    </Switch>
  );
}

function renderApp(ruta = "/login") {
  const { hook, history } = memoryLocation({ path: ruta, static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <SesionProvider>
          <App />
        </SesionProvider>
      </Router>
    </QueryClientProvider>,
  );
  return { history, qc };
}

async function ingresar() {
  fireEvent.change(document.querySelector('input[name="email"]')!, { target: { value: "ada@acme.com" } });
  fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "secreta1" } });
  fireEvent.click(screen.getByRole("button", { name: /^Ingresar$/i }));
}

async function cerrarSesionDesdeMenu() {
  // Abrir el menú de perfil (disparador con el nombre del usuario) y pulsar
  // "Cerrar sesión". El disparador es el botón que contiene el nombre.
  const disparador = screen
    .getAllByRole("button")
    .find((b) => /Ada Lovelace/.test(b.textContent ?? ""));
  if (!disparador) throw new Error("no se encontró el disparador del menú de perfil");
  fireEvent.click(disparador);
  const cerrar = await screen.findByText(/Cerrar sesión/i);
  fireEvent.click(cerrar);
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("Identidad · ciclo login→logout→login (regresión de cuelgue)", () => {
  it("el SEGUNDO login aterriza en la Home y NO deja el botón «Ingresando…» colgado", async () => {
    const estado = servidorConCookie();
    const { history } = renderApp("/login");

    // ---- LOGIN 1 ----
    await screen.findByRole("button", { name: /^Ingresar$/i });
    await ingresar();
    // Aterriza en la Home (saludo del contenido empresarial).
    await screen.findByText(/Bienvenido, Ada/i, {}, { timeout: 3000 });
    expect(history.at(-1)).toBe("/");

    // ---- LOGOUT ----
    await cerrarSesionDesdeMenu();
    await screen.findByRole("button", { name: /^Ingresar$/i }, { timeout: 3000 });
    expect(history.at(-1)).toBe("/login");

    // ---- LOGIN 2 (el que se colgaba) ----
    await ingresar();
    // Debe volver a aterrizar en la Home …
    await screen.findByText(/Bienvenido, Ada/i, {}, { timeout: 3000 });
    expect(history.at(-1)).toBe("/");
    // … y NO debe quedar ningún botón en estado «Ingresando…».
    expect(screen.queryByRole("button", { name: /Ingresando/i })).toBeNull();
    // Se ejercitaron dos autenticaciones reales.
    expect(estado.loginCount).toBe(2);
  });

  it("tres ciclos consecutivos login→logout no cuelgan (estabilidad)", async () => {
    servidorConCookie();
    const { history } = renderApp("/login");
    for (let i = 0; i < 3; i++) {
      await screen.findByRole("button", { name: /^Ingresar$/i }, { timeout: 3000 });
      await ingresar();
      await screen.findByText(/Bienvenido, Ada/i, {}, { timeout: 3000 });
      expect(history.at(-1)).toBe("/");
      expect(screen.queryByRole("button", { name: /Ingresando/i })).toBeNull();
      await cerrarSesionDesdeMenu();
      await screen.findByRole("button", { name: /^Ingresar$/i }, { timeout: 3000 });
    }
  });
});
