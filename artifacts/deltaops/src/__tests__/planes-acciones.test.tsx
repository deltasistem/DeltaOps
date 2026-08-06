/**
 * DGP-012 (integración UI→request) · Acciones de Workflow del plan.
 *
 * Verifica que CADA botón de la ficha del plan emite SU transición real al
 * endpoint correcto — sin mapear varios botones a un único comando — y que:
 *  · toda transición envía `expectedVersion` y `motivo` (obligatorio);
 *  · posponer/extender/reprogramar envían además `hasta`;
 *  · publicar/archivar usan sus propios endpoints (no /transicion);
 *  · las acciones ofrecidas dependen del estado (VIGENTE vs SUSPENDIDO);
 *  · el motivo es exigible antes de emitir (el botón de confirmación no dispara
 *    ningún efecto sin motivo).
 * Las aserciones son sobre el REQUEST emitido, no sobre el builder.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { AccionesWorkflow } from "../pages/planes-ficha";
import type { PlanRow } from "../lib/planes/tipos";

interface Emitido { url: string; body: Record<string, unknown> }
let emitidos: Emitido[] = [];

function mockFetch(): void {
  emitidos = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    if (/\/planes\/p-1\/(transicion|publicar|archivar|rollback)$/.test(url)) {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      emitidos.push({ url, body });
      return new Response(JSON.stringify({ id: "p-1", estado: "VIGENTE", version: 4, idempotente: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function plan(estado: string): PlanRow {
  return {
    id: "p-1", nombre: "Plan X", tipoPlan: "preventivo", estrategia: "tiempo",
    prioridad: "alta", estado, version: 3, alcance: { activos: ["a1"] },
    rutina: { id: "r1", nombre: "R", actividades: [] },
    programa: { frecuencia: { reglas: [{ tipo: "dias", cada: 30 }] }, vigenteDesde: "2026-01-01" },
  } as PlanRow;
}

function montar(estado: string) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="planes">
          <AccionesWorkflow plan={plan(estado)} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("UI→request · acciones de Workflow del plan", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("en VIGENTE ofrece suspender/posponer/extender/reprogramar/cancelar y NO reanudar", async () => {
    montar("VIGENTE");
    await waitFor(() => expect(screen.getByRole("button", { name: "Suspender" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Posponer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Extender" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reprogramar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reanudar" })).toBeNull();
    // Publicar sólo en BORRADOR; aquí no aparece.
    expect(screen.queryByRole("button", { name: /Publicar/ })).toBeNull();
  });

  it("en SUSPENDIDO ofrece reanudar/cancelar y NO suspender/posponer", async () => {
    montar("SUSPENDIDO");
    await waitFor(() => expect(screen.getByRole("button", { name: "Reanudar" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Suspender" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Posponer" })).toBeNull();
  });

  it("«Suspender» exige motivo y emite accion=suspender con expectedVersion", async () => {
    montar("VIGENTE");
    fireEvent.click(await screen.findByRole("button", { name: "Suspender" }));
    // Sin motivo, confirmar NO emite efecto.
    fireEvent.click(await screen.findByRole("button", { name: /confirmar suspender/i }));
    await waitFor(() => expect(screen.getAllByText(/motivo es obligatorio/i).length).toBeGreaterThan(0));
    expect(emitidos.length).toBe(0);
    // Con motivo, emite su acción real.
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "mantenimiento mayor" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar suspender/i }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.url).toMatch(/\/transicion$/);
    expect(emitidos[0]!.body.accion).toBe("suspender");
    expect(emitidos[0]!.body.motivo).toBe("mantenimiento mayor");
    expect(emitidos[0]!.body.expectedVersion).toBe(3);
    expect(emitidos[0]!.body.hasta).toBeUndefined();
  });

  it("«Posponer» exige motivo + hasta y emite accion=posponer con hasta", async () => {
    montar("VIGENTE");
    fireEvent.click(await screen.findByRole("button", { name: "Posponer" }));
    fireEvent.change(await screen.findByLabelText(/Motivo/), { target: { value: "clima" } });
    fireEvent.change(screen.getByLabelText(/Hasta/), { target: { value: "2026-06-01" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar posponer/i }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("posponer");
    expect(emitidos[0]!.body.motivo).toBe("clima");
    expect(emitidos[0]!.body.hasta).toBe("2026-06-01");
  });

  it("cada acción de VIGENTE emite SU acción real (no colapsa en un único comando)", async () => {
    for (const [etiqueta, accion, pideHasta] of [
      ["Suspender", "suspender", false],
      ["Posponer", "posponer", true],
      ["Extender", "extender", true],
      ["Reprogramar", "reprogramar", true],
      ["Cancelar", "cancelar", false],
    ] as const) {
      cleanup(); mockFetch();
      montar("VIGENTE");
      fireEvent.click(await screen.findByRole("button", { name: etiqueta }));
      fireEvent.change(await screen.findByLabelText(/Motivo/), { target: { value: "motivo" } });
      if (pideHasta) fireEvent.change(screen.getByLabelText(/Hasta/), { target: { value: "2026-07-01" } });
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`confirmar ${etiqueta}`, "i") }));
      await waitFor(() => expect(emitidos.length).toBe(1));
      expect(emitidos[0]!.body.accion, `botón ${etiqueta}`).toBe(accion);
      expect(emitidos[0]!.url).toMatch(/\/transicion$/);
    }
  });

  it("«Publicar» (BORRADOR) usa el endpoint /publicar, no /transicion, sin motivo", async () => {
    montar("BORRADOR");
    fireEvent.click(await screen.findByRole("button", { name: /Publicar/ }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.url).toMatch(/\/publicar$/);
    expect(emitidos[0]!.body.accion).toBeUndefined();
    expect(emitidos[0]!.body.expectedVersion).toBe(3);
  });

  it("«Archivar» usa el endpoint /archivar, no /transicion", async () => {
    montar("FINALIZADO");
    fireEvent.click(await screen.findByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.url).toMatch(/\/archivar$/);
  });
});
