/**
 * DGP-010 · Pruebas de la Vista 360° (pestaña «Órdenes» del activo).
 * Mockea el listado de Órdenes filtrado por activo y verifica agrupación,
 * navegación contextual y estado vacío. Composición sin API nueva.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { TabOrdenes } from "../pages/ficha/tab-ordenes";
import type { OrdenRow } from "../lib/ordenes/tipos";

function orden(p: Partial<OrdenRow> & { id: string; estado: string }): OrdenRow {
  return {
    tenantId: "deltaops", codigo: `OT-${p.id}`, titulo: `Tarea ${p.id}`, tipo: "correctiva",
    categoria: null, prioridad: null, severidad: null, responsable: null, supervisor: null,
    activoPrincipalId: "A1", ubicacionId: null, datos: {}, version: 1, lastEventId: "e",
    actualizadoAt: "2024-06-10T00:00:00Z", ...p,
  } as OrdenRow;
}

function Wrap() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <TabOrdenes activoId="A1" activoNombre="Bomba 1" />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

let ordenes: OrdenRow[] = [];

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/ordenes\?/.test(url) && /activoPrincipalId=A1/.test(url)) {
      return new Response(JSON.stringify({ ordenes }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("Vista 360° · pestaña Órdenes", () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("agrupa abiertas, cerradas y próximos mantenimientos", async () => {
    ordenes = [
      orden({ id: "1", estado: "EN_EJECUCION" }),
      orden({ id: "2", estado: "PLANIFICADA" }),
      orden({ id: "3", estado: "CERRADA" }),
    ];
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText("Órdenes abiertas")).toBeInTheDocument());
    expect(screen.getByText("Próximos mantenimientos")).toBeInTheDocument();
    expect(screen.getByText("Historial de órdenes cerradas")).toBeInTheDocument();
    expect(screen.getByText(/2 abierta/)).toBeInTheDocument();
    expect(screen.getByText(/1 cerrada/)).toBeInTheDocument();
  });

  it("ofrece crear una OT anclada al activo (deep link)", async () => {
    ordenes = [];
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText("Sin órdenes")).toBeInTheDocument());
    const enlace = screen.getByText(/Nueva orden para este activo/i).closest("a");
    expect(enlace?.getAttribute("href")).toMatch(/\/ordenes\/nueva\?activo=A1/);
  });
});
