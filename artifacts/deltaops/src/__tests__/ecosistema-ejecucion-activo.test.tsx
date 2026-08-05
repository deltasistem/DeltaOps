/**
 * DGP-010 · Pruebas de la Ejecución integrada (pestaña «Activo» de la OT).
 * El técnico consulta el activo y su actividad sin salir de la orden. Degrada
 * con elegancia si la orden no tiene activo o el detalle no está disponible.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { TabActivoOrden } from "../pages/ordenes/tab-activo";
import type { OrdenRow } from "../lib/ordenes/tipos";

function orden(activoPrincipalId: string | null): OrdenRow {
  return {
    tenantId: "deltaops", id: "O1", codigo: "OT-1", titulo: "Tarea", estado: "EN_EJECUCION" as OrdenRow["estado"],
    tipo: "correctiva", categoria: null, prioridad: null, severidad: null, responsable: null, supervisor: null,
    activoPrincipalId, ubicacionId: null, datos: {}, version: 1, lastEventId: "e", actualizadoAt: "2024-06-10T00:00:00Z",
  };
}

function Wrap({ o }: { o: OrdenRow }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <TabActivoOrden orden={o} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function mockFetch(opts: { activo?: unknown; timeline?: unknown[]; activo404?: boolean }): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/activos\/A1\/timeline/.test(url)) {
      return new Response(JSON.stringify(opts.timeline ?? []), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/deltaops\/activos\/A1$/.test(url)) {
      if (opts.activo404) return new Response(JSON.stringify({ error: "no" }), { status: 404, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify(opts.activo ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("Ejecución integrada · pestaña Activo", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("muestra el detalle del activo y su actividad reciente", async () => {
    mockFetch({
      activo: { id: "A1", codigoEmpresarial: "EMP-9", nombre: "Bomba 1", estado: "OPERATIVO" },
      timeline: [{ id: "t1", resumen: "Horómetro 100h", ocurridoAt: "2024-06-01T08:00:00Z" }],
    });
    render(<Wrap o={orden("A1")} />);
    await waitFor(() => expect(screen.getByText("Bomba 1")).toBeInTheDocument());
    expect(screen.getByText("EMP-9")).toBeInTheDocument();
    expect(screen.getByText(/Horómetro 100h/)).toBeInTheDocument();
    const enlace = screen.getByText("Vista 360°").closest("a");
    expect(enlace?.getAttribute("href")).toBe("/activos/A1");
  });

  it("degrada elegantemente cuando el detalle del activo no está disponible (404)", async () => {
    mockFetch({ activo404: true, timeline: [] });
    render(<Wrap o={orden("A1")} />);
    await waitFor(() => expect(screen.getByText(/Detalle del activo no disponible/)).toBeInTheDocument());
  });

  it("informa cuando la orden no tiene activo asociado", async () => {
    mockFetch({});
    render(<Wrap o={orden(null)} />);
    await waitFor(() => expect(screen.getByText(/Orden sin activo asociado/)).toBeInTheDocument());
  });
});
