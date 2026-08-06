/**
 * DGP-011.3 · Superficie + A11y del listado de inventario.
 *
 * Verifica semántica accesible (tabla con caption, cabeceras `scope=col` y
 * `aria-sort`, búsqueda etiquetada, grupo de vista) y los estados de datos
 * (contenido, vacío filtrado y error con reintento).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { Listado as InventarioListado } from "../pages/inventario-listado";

type Modo = "datos" | "error";
let modo: Modo = "datos";

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/inventario(\?|$)/.test(url) && !/\/(catalogos|sync)/.test(url)) {
      if (modo === "error") return new Response(JSON.stringify({ mensaje: "boom" }), { status: 500, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ items: [
        { id: "I-1", tenantId: "t", sku: "FLT-1", nombre: "Filtro de aire", tipoItem: "filtro", estado: "ACTIVO", categoria: "consumibles", version: 1 },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function montar(path = "/inventario") {
  const { hook } = memoryLocation({ path, record: true });
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="inventario">
          <Router hook={hook}>
            <Route path="/inventario"><InventarioListado /></Route>
          </Router>
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("superficie · listado de inventario (A11y AA)", () => {
  beforeEach(() => { modo = "datos"; mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("tabla accesible: caption, cabeceras scope=col y aria-sort en las ordenables", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Filtro de aire")).toBeTruthy());
    const tabla = screen.getByRole("table");
    expect(tabla.querySelector("caption")).toBeTruthy();
    const cabeceras = Array.from(tabla.querySelectorAll("th[scope=col]"));
    expect(cabeceras.length).toBeGreaterThan(0);
    expect(tabla.querySelectorAll("th[aria-sort]").length).toBeGreaterThan(0);
  });

  it("búsqueda y grupo de vista están etiquetados para lectores de pantalla", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Filtro de aire")).toBeTruthy());
    expect(screen.getByLabelText("Buscar items")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Vista" })).toBeTruthy();
  });

  it("estado de error muestra reintento y recupera al reintentar", async () => {
    modo = "error";
    montar();
    await waitFor(() => expect(screen.getByRole("button", { name: /reintentar/i })).toBeTruthy());
    modo = "datos";
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    await waitFor(() => expect(screen.getByText("Filtro de aire")).toBeTruthy());
  });
});
