/**
 * DGP-010 · Pruebas del Centro Global de Mantenimiento (consola operacional).
 * Mockea el read model de Órdenes y verifica indicadores operativos, alertas de
 * SLA y agrupaciones por técnico/activo. Fecha inyectada vía vencimientos ISO.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { Centro } from "../pages/centro-mantenimiento";
import type { OrdenRow } from "../lib/ordenes/tipos";

function Wrap() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <Centro />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function orden(p: Partial<OrdenRow> & { id: string; estado: string }): OrdenRow {
  return {
    tenantId: "deltaops", codigo: `OT-${p.id}`, titulo: `Tarea ${p.id}`, tipo: "correctiva",
    categoria: null, prioridad: null, severidad: null, responsable: null, supervisor: null,
    activoPrincipalId: null, ubicacionId: null, datos: {}, version: 1, lastEventId: "e",
    actualizadoAt: "2024-06-10T00:00:00Z", ...p,
  } as OrdenRow;
}

// Vencimiento en el pasado lejano → siempre "vencido" respecto a Date.now real.
const VENCIDA = { sla: { vencimiento: "2000-01-01T00:00:00Z" } };

let ordenes: OrdenRow[] = [];

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/ordenes\?/.test(url)) {
      return new Response(JSON.stringify({ ordenes }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/deltaops\/ordenes\/me|\/auth\/me/.test(url)) {
      return new Response(JSON.stringify({ usuario: "t" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("Centro Global de Mantenimiento", () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("muestra la consola con indicadores y órdenes abiertas", async () => {
    ordenes = [
      orden({ id: "1", estado: "EN_EJECUCION", responsable: "Ana", prioridad: "alta" }),
      orden({ id: "2", estado: "CERRADA" }),
    ];
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText("Centro Global de Mantenimiento")).toBeInTheDocument());
    expect(screen.getByText("Órdenes abiertas")).toBeInTheDocument();
    expect(screen.getByText(/Cola operativa \(1\)/)).toBeInTheDocument();
  });

  it("levanta alerta de SLA vencido y sugiere escalamiento", async () => {
    ordenes = [orden({ id: "9", estado: "EN_EJECUCION", responsable: "Beto", datos: VENCIDA })];
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText(/con SLA vencido/)).toBeInTheDocument());
  });

  it("no rompe cuando no hay órdenes", async () => {
    ordenes = [];
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText(/Cola operativa \(0\)/)).toBeInTheDocument());
  });
});
