/**
 * DGP-010 · Punto 7 (UI): la pestaña de dependencias de la OT muestra los grupos
 * bloqueante/dependiente y la alerta «lista pero bloqueada». Mockea el read model.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { TabDependencias } from "../pages/ordenes/tab-dependencias";
import type { OrdenRow } from "../lib/ordenes/tipos";

function orden(p: Partial<OrdenRow> & { id: string; estado: string }): OrdenRow {
  return {
    tenantId: "t", codigo: "OT-1", titulo: "Tarea", tipo: "correctiva",
    categoria: null, prioridad: null, severidad: null, responsable: null, supervisor: null,
    activoPrincipalId: null, ubicacionId: null, datos: {}, version: 1, lastEventId: "e",
    actualizadoAt: "2024-06-10T00:00:00Z", ...p,
  } as OrdenRow;
}

let dependencias: unknown[] = [];

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/dependencias/.test(url)) {
      return new Response(JSON.stringify({ dependencias }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrap({ o }: { o: OrdenRow }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <TabDependencias orden={o} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("TabDependencias", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("muestra bloqueantes y la alerta «lista pero bloqueada»", async () => {
    dependencias = [
      { id: "1", categoria: "orden", tipo: "bloqueada-por", ordenId: "M", destinoId: "X", destinoCodigo: "OT-X", destinoNombre: null },
    ];
    render(<Wrap o={orden({ id: "M", estado: "ABIERTA" })} />);
    await waitFor(() => expect(screen.getByText(/Bloquean a esta orden/i)).toBeInTheDocument());
    expect(screen.getAllByText("OT-X").length).toBeGreaterThan(0);
    expect(screen.getByText(/OT lista pero bloqueada/i)).toBeInTheDocument();
  });

  it("muestra vacío cuando no hay dependencias", async () => {
    dependencias = [];
    render(<Wrap o={orden({ id: "M", estado: "ABIERTA" })} />);
    await waitFor(() => expect(screen.getByText(/Sin dependencias/i)).toBeInTheDocument());
  });
});
