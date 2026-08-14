/**
 * DGP-010 · Punto 13: el flujo QR unificado ofrece, desde un único activo
 * resuelto, todas las acciones contextuales (abrir/historial/órdenes/crear OT +
 * registrar lectura de medidor + registrar evidencia).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";

// DGP-LITE-04 · El menú del QR ahora ofrece «Iniciar preoperacional» para roles
// con escritura; la sesión se mockea igual que en el resto de pruebas de UI.
vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: "TENANT_ADMIN", tenant: { id: "deltaops" }, modulos: ["activos"], permisos: [], capacidades: [] } }),
}));
vi.mock("../lib/identidad/rbac", () => ({ moduloHabilitado: () => true }));

import { MenuAccionesEscaneo } from "../lib/ecosistema/flujo-escaneo";

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/activos\/ACT-1$/.test(url)) {
      return new Response(JSON.stringify({ id: "ACT-1", nombre: "Bomba 1", codigoEmpresarial: "EQ-1", version: 3, estado: "OPERATIVO", tipo: "equipo" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrap() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="activos">
          <MenuAccionesEscaneo activoId="ACT-1" />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("MenuAccionesEscaneo (flujo QR unificado)", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("ofrece navegación + captura de lectura y evidencia", async () => {
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText("Bomba 1")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Abrir activo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver historial/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver órdenes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear orden/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Registrar lectura/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Registrar evidencia/i })).toBeInTheDocument();
    // DGP-LITE-04 §3c · Acceso al preoperacional desde el QR (rol con escritura).
    expect(screen.getByRole("button", { name: /Iniciar preoperacional/i })).toBeInTheDocument();
  });

  it("abre el diálogo de lectura de medidor con horómetro/odómetro", async () => {
    render(<Wrap />);
    await waitFor(() => screen.getByRole("button", { name: /Registrar lectura/i }));
    fireEvent.click(screen.getByRole("button", { name: /Registrar lectura/i }));
    expect(screen.getByRole("button", { name: /Horómetro/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Odómetro/i })).toBeInTheDocument();
  });
});
