/**
 * DGP-017 · Recuperación de contraseña (neutra, anti-enumeración), restablecer
 * con token (validez + requisitos) y aceptación de invitación. Sólo DS y A11y.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Recuperar from "../pages/recuperar";
import Restablecer from "../pages/restablecer";
import Invitacion from "../pages/invitacion";

function resp(status: number, body: unknown = {}) {
  const vacio = status === 202 || status === 204;
  return new Response(vacio ? null : JSON.stringify(body), {
    status: status === 204 ? 200 : status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderEn(ruta: string, ui: React.ReactNode) {
  const { hook, history } = memoryLocation({ path: ruta, static: false, record: true });
  render(<Router hook={hook}>{ui}</Router>);
  return { history };
}

beforeEach(() => cleanup());
afterEach(() => vi.restoreAllMocks());

describe("recuperación · respuesta neutra (anti-enumeración)", () => {
  it("muestra el mismo mensaje neutro tras enviar", async () => {
    let body: unknown;
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      if (String(u).includes("/auth/password/forgot")) {
        body = init?.body ? JSON.parse(init.body as string) : undefined;
        return resp(202);
      }
      return resp(200, null);
    });
    renderEn("/recuperar", <Recuperar />);
    fireEvent.change(document.querySelector('input[name="email"]')!, { target: { value: "ada@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar instrucciones/i }));
    await screen.findByText(/Si el correo corresponde a una cuenta/i);
    expect((body as { email: string }).email).toBe("ada@acme.com");
  });
});

describe("restablecer · token y requisitos", () => {
  it("sin token muestra enlace incompleto y no permite enviar", () => {
    vi.spyOn(global, "fetch").mockResolvedValue(resp(200, null));
    renderEn("/restablecer", <Restablecer />);
    expect(screen.getByText(/Enlace incompleto/i)).toBeInTheDocument();
  });

  it("con token válido cambia la contraseña y redirige a login", async () => {
    let body: unknown;
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      if (String(u).includes("/auth/password/reset")) {
        body = init?.body ? JSON.parse(init.body as string) : undefined;
        return resp(204);
      }
      return resp(200, null);
    });
    const { history } = renderEn("/restablecer?token=tok&tenantId=t1", <Restablecer />);
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "secreta1" } });
    fireEvent.change(document.querySelector('input[name="confirmacion"]')!, { target: { value: "secreta1" } });
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contraseña/i }));
    await screen.findByText(/Contraseña actualizada/i);
    expect(body).toMatchObject({ token: "tok", tenantId: "t1", password: "secreta1" });
    await waitFor(() => expect(history.at(-1)).toBe("/login"), { timeout: 2500 });
  });

  it("token inválido muestra error accesible", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      if (String(u).includes("/auth/password/reset")) return resp(400, { error: "token inválido" });
      return resp(200, null);
    });
    renderEn("/restablecer?token=malo&tenantId=t1", <Restablecer />);
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "secreta1" } });
    fireEvent.change(document.querySelector('input[name="confirmacion"]')!, { target: { value: "secreta1" } });
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contraseña/i }));
    await screen.findByText(/inválido o expiró/i);
  });

  it("contraseñas que no coinciden muestran error y bloquean el envío", () => {
    vi.spyOn(global, "fetch").mockResolvedValue(resp(200, null));
    renderEn("/restablecer?token=tok&tenantId=t1", <Restablecer />);
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "secreta1" } });
    fireEvent.change(document.querySelector('input[name="confirmacion"]')!, { target: { value: "otra9999" } });
    expect(screen.getByText(/no coinciden/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cambiar contraseña/i })).toBeDisabled();
  });
});

describe("invitación · aceptar y activar", () => {
  it("acepta la invitación con nombre+password y redirige a login", async () => {
    let body: unknown;
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      if (String(u).includes("/auth/invitations/accept")) {
        body = init?.body ? JSON.parse(init.body as string) : undefined;
        return resp(201, { ok: true });
      }
      return resp(200, null);
    });
    const { history } = renderEn("/invitacion?token=tok&tenantId=t1", <Invitacion />);
    fireEvent.change(document.querySelector('input[name="nombre"]')!, { target: { value: "Ada" } });
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "secreta1" } });
    fireEvent.change(document.querySelector('input[name="confirmacion"]')!, { target: { value: "secreta1" } });
    fireEvent.click(screen.getByRole("button", { name: /Aceptar y activar/i }));
    await screen.findByText(/Cuenta activada/i);
    expect(body).toMatchObject({ token: "tok", tenantId: "t1", nombre: "Ada", password: "secreta1" });
    await waitFor(() => expect(history.at(-1)).toBe("/login"), { timeout: 2500 });
  });

  it("invitación inválida se comunica de forma accesible", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      if (String(u).includes("/auth/invitations/accept")) return resp(410, { error: "expirada" });
      return resp(200, null);
    });
    renderEn("/invitacion?token=malo&tenantId=t1", <Invitacion />);
    fireEvent.change(document.querySelector('input[name="nombre"]')!, { target: { value: "Ada" } });
    fireEvent.change(document.querySelector('input[name="password"]')!, { target: { value: "secreta1" } });
    fireEvent.change(document.querySelector('input[name="confirmacion"]')!, { target: { value: "secreta1" } });
    fireEvent.click(screen.getByRole("button", { name: /Aceptar y activar/i }));
    await screen.findByText(/inválida, expiró o ya fue utilizada/i);
  });
});
