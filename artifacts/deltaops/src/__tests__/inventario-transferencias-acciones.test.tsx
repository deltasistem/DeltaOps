/**
 * DGP-011.3 (ronda 2) · Integración UI→request de transiciones de transferencia.
 *
 * Verifica que CADA botón del detalle envía SU acción real a
 * `POST /transferencias/:id/transicion` (recibir/completar/cancelar/rechazar) —
 * nada se mapea a "completar" — y que ninguna acción distinta de recibir/completar
 * es la que la UI declara como "ingreso a destino": las aserciones son sobre el
 * REQUEST emitido (cuerpo `accion`, `expectedVersion`, `motivo`), no sobre el
 * builder. Cancelar/rechazar exigen motivo antes de emitir.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { ModalDetalle } from "../pages/inventario-transferencias";

interface Emitido { url: string; body: Record<string, unknown> }
let emitidos: Emitido[] = [];
let estadoActual = "EN_TRANSITO";

function mockFetch(): void {
  emitidos = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    if (/\/transferencias\/T-1\/transicion$/.test(url)) {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      emitidos.push({ url, body });
      return new Response(JSON.stringify({ id: "T-1", estado: "COMPLETADA", accion: body.accion, version: 3, idempotente: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/transferencias\/T-1$/.test(url)) {
      return new Response(JSON.stringify({
        id: "T-1", tenantId: "t", estado: estadoActual, version: 2,
        origen: { bodegaId: "b1", ubicacionId: "u1" }, destino: { bodegaId: "b2", ubicacionId: "u2" },
        lineas: [{ itemId: "i1", cantidad: 3 }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function montar() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="inventario">
          <ModalDetalle id="T-1" onCerrar={() => {}} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("UI→request · transiciones de transferencia", () => {
  beforeEach(() => { estadoActual = "EN_TRANSITO"; mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("«Recibir» envía accion=recibir con expectedVersion (ingreso a destino)", async () => {
    montar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Recibir" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Recibir" }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("recibir");
    expect(emitidos[0]!.body.expectedVersion).toBe(2);
    expect(emitidos[0]!.body.motivo).toBeUndefined();
  });

  it("«Completar» envía accion=completar (ingreso a destino)", async () => {
    montar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Completar" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Completar" }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("completar");
  });

  it("«Cancelar» exige motivo y envía accion=cancelar (restitución al origen)", async () => {
    montar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    // Se abre el diálogo de confirmación; sin motivo el botón está deshabilitado.
    const confirmar = await screen.findByRole("button", { name: /confirmar cancelar/i });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    expect(emitidos.length).toBe(0); // aún NO se emite ningún efecto
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "error de captura" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar cancelar/i }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("cancelar");
    expect(emitidos[0]!.body.motivo).toBe("error de captura");
  });

  it("«Rechazar» exige motivo y envía accion=rechazar (restitución al origen)", async () => {
    montar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    fireEvent.change(await screen.findByLabelText("Motivo"), { target: { value: "sin stock" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar rechazar/i }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("rechazar");
    expect(emitidos[0]!.body.motivo).toBe("sin stock");
  });

  it("NINGUNA acción se mapea a 'completar' salvo el botón Completar; recibir/completar NO llevan motivo", async () => {
    // Recorremos recibir y completar y comprobamos que la acción emitida coincide
    // exactamente con el botón (no hay colapso a 'completar').
    for (const etiqueta of ["Recibir", "Completar"] as const) {
      cleanup(); mockFetch();
      montar();
      await waitFor(() => expect(screen.getByRole("button", { name: etiqueta })).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: etiqueta }));
      await waitFor(() => expect(emitidos.length).toBe(1));
      const esperado = etiqueta === "Recibir" ? "recibir" : "completar";
      expect(emitidos[0]!.body.accion).toBe(esperado);
      expect(emitidos[0]!.body.motivo).toBeUndefined();
    }
  });

  it("en estado RECIBIDA sólo se ofrece 'completar' (no recibir/cancelar/rechazar)", async () => {
    estadoActual = "RECIBIDA";
    montar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Completar" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Recibir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });
});
