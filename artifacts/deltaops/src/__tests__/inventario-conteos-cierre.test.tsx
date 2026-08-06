/**
 * DGP-011.3 (ronda 2) · Integración UI→request del cierre de conteo.
 *
 * «Cerrar sin aplicar» ⇒ aplicarDiferencias:false (no muta stock);
 * «Cerrar y aplicar diferencias» ⇒ aplicarDiferencias:true. Aserciones sobre el
 * REQUEST emitido a `POST /conteos/:id/cerrar` (sin campo `aprobado`), y la UI
 * muestra `{diferencias, aplicadas}` de la respuesta. También: «Registrar
 * conteo» envía `contados:[{inventarioId,cantidad}]`.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { ModalDetalle } from "../pages/inventario-conteos";

interface Emitido { url: string; body: Record<string, unknown> }
let emitidos: Emitido[] = [];

function mockFetch(): void {
  emitidos = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (/\/conteos\/C-1\/cerrar$/.test(url)) {
      emitidos.push({ url, body });
      return new Response(JSON.stringify({ id: "C-1", estado: "CERRADO", diferencias: [{ inventarioId: "e1", diferencia: -2 }], aplicadas: body.aplicarDiferencias ? 1 : 0 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/conteos\/C-1\/registrar$/.test(url)) {
      emitidos.push({ url, body });
      return new Response(JSON.stringify({ id: "C-1", version: 3 }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/conteos\/C-1$/.test(url)) {
      return new Response(JSON.stringify({ id: "C-1", tenantId: "t", tipo: "ciclico", estado: "EN_PROCESO", version: 2, diferencias: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function montar() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="inventario">
          <ModalDetalle id="C-1" onCerrar={() => {}} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("UI→request · cierre de conteo con decisión autoritativa", () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("«Cerrar sin aplicar» ⇒ aplicarDiferencias:false, sin campo aprobado", async () => {
    montar();
    const btn = await screen.findByRole("button", { name: "Cerrar sin aplicar" });
    fireEvent.click(btn);
    await waitFor(() => expect(emitidos.some((e) => /\/cerrar$/.test(e.url))).toBe(true));
    const cierre = emitidos.find((e) => /\/cerrar$/.test(e.url))!;
    expect(cierre.body.aplicarDiferencias).toBe(false);
    expect(cierre.body.aprobado).toBeUndefined();
    expect(cierre.body.expectedVersion).toBe(2);
  });

  it("«Cerrar y aplicar diferencias» ⇒ aplicarDiferencias:true y muestra el resultado", async () => {
    montar();
    const btn = await screen.findByRole("button", { name: "Cerrar y aplicar diferencias" });
    fireEvent.click(btn);
    await waitFor(() => expect(emitidos.some((e) => /\/cerrar$/.test(e.url))).toBe(true));
    const cierre = emitidos.find((e) => /\/cerrar$/.test(e.url))!;
    expect(cierre.body.aplicarDiferencias).toBe(true);
    // Muestra {diferencias, aplicadas} de la respuesta.
    await waitFor(() => expect(screen.getByText(/Diferencias detectadas/i)).toBeTruthy());
    expect(screen.getByText(/aplicadas:/i)).toBeTruthy();
  });

  it("«Registrar conteo» envía contados:[{inventarioId,cantidad}]", async () => {
    montar();
    await screen.findByRole("button", { name: "Registrar conteo" });
    fireEvent.change(screen.getByLabelText(/Existencia/i), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText(/Cantidad contada/i), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar conteo" }));
    await waitFor(() => expect(emitidos.some((e) => /\/registrar$/.test(e.url))).toBe(true));
    const reg = emitidos.find((e) => /\/registrar$/.test(e.url))!;
    expect(Array.isArray(reg.body.contados)).toBe(true);
    expect((reg.body.contados as Array<Record<string, unknown>>)[0]).toEqual({ inventarioId: "e1", cantidad: 5 });
  });
});
