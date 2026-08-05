/**
 * DGP-010 · Punto 11: el supervisor gestiona la OT IN-PLACE (Drawer) sin cambiar
 * de contexto — prioridad, esperas y acceso al activo desde el mismo panel.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { PanelSupervisor } from "../pages/ordenes/panel-supervisor";

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/ordenes\/OT-9$/.test(url)) {
      return new Response(JSON.stringify({ orden: {
        id: "OT-9", tenantId: "t", codigo: "OT-9", titulo: "Cambio de aceite", tipo: "preventiva",
        estado: "EN_EJECUCION", prioridad: "media", categoria: null, severidad: null,
        responsable: "Ana", supervisor: null, activoPrincipalId: null, ubicacionId: null,
        datos: {}, version: 4, lastEventId: "e", actualizadoAt: "2024-06-10T00:00:00Z",
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrap() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <PanelSupervisor ordenId="OT-9" onCerrar={() => {}} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("PanelSupervisor (gestión in-place)", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("abre la OT en un panel con controles de prioridad y esperas", async () => {
    render(<Wrap />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText(/OT-9 · Cambio de aceite/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Cambiar prioridad/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Poner en espera/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reanudar/i })).toBeInTheDocument();
  });
});
