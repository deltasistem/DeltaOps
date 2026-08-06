/**
 * DGP-012 · Deep links de Planes (ruta→filtro CONSUMIDO).
 *
 * Verifica que los constructores de enlaces profundos son puros y coherentes y
 * —lo esencial— que el DESTINO consume el contexto de la URL: al abrir el
 * listado con `?estado=&tipoPlan=` esos filtros quedan aplicados (ruta→estado
 * inicial, lección DGP-010) y el enlace a la OT generada apunta a la ficha de
 * Órdenes, cuyo destino ya consume su `:id`.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { Listado } from "../pages/planes-listado";
import { urlPlanes, urlPlan, urlPlanTab, urlNuevoPlan, urlOrdenGenerada } from "../lib/planes/deep-links";

describe("deep links · constructores puros", () => {
  it("urlPlanes serializa estado/tipoPlan/estrategia", () => {
    expect(urlPlanes()).toBe("/planes");
    expect(urlPlanes({ estado: "VIGENTE" })).toBe("/planes?estado=VIGENTE");
    expect(urlPlanes({ estado: "VIGENTE", tipoPlan: "preventivo", estrategia: "tiempo" })).toBe(
      "/planes?estado=VIGENTE&tipoPlan=preventivo&estrategia=tiempo",
    );
  });

  it("urlPlan / urlPlanTab / urlNuevoPlan codifican sus parámetros", () => {
    expect(urlPlan("p 1")).toBe("/planes/p%201");
    expect(urlPlanTab("p1", "generaciones")).toBe("/planes/p1?tab=generaciones");
    expect(urlNuevoPlan()).toBe("/planes/nuevo");
    expect(urlNuevoPlan("act-9")).toBe("/planes/nuevo?activo=act-9");
  });

  it("urlOrdenGenerada apunta a la ficha de Órdenes (destino que ya consume :id)", () => {
    expect(urlOrdenGenerada("OT-42")).toBe("/ordenes/OT-42");
  });
});

/* ------------------------ ruta→filtro CONSUMIDO ------------------------- */

const PLANES = [
  { id: "p1", nombre: "Preventivo bomba", tipoPlan: "preventivo", estrategia: "tiempo", prioridad: "alta", estado: "VIGENTE", version: 1, alcance: {}, rutina: { id: "r", nombre: "R", actividades: [] }, programa: { frecuencia: { reglas: [] }, vigenteDesde: "2026-01-01" } },
  { id: "p2", nombre: "Predictivo motor", tipoPlan: "predictivo", estrategia: "condicion", prioridad: "media", estado: "VIGENTE", version: 1, alcance: {}, rutina: { id: "r", nombre: "R", actividades: [] }, programa: { frecuencia: { reglas: [] }, vigenteDesde: "2026-01-01" } },
];

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/me/.test(url)) return new Response(JSON.stringify({ id: "u", nombre: "User" }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (/\/catalogos\//.test(url)) return new Response(JSON.stringify({ opciones: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    // El listado filtra tipoPlan en servidor; devolvemos el conjunto para que
    // el cliente aplique estrategia/búsqueda. Filtramos según el query recibido.
    const tipo = new URL(url, "http://x").searchParams.get("tipoPlan");
    const datos = tipo ? PLANES.filter((p) => p.tipoPlan === tipo) : PLANES;
    return new Response(JSON.stringify({ planes: datos }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function montar(ruta: string) {
  const { hook } = memoryLocation({ path: ruta });
  return render(
    <Router hook={hook}>
      <ThemeProvider>
        <ToastProvider>
          <OfflineProvider tenant="deltaops" modulo="planes">
            <Listado />
          </OfflineProvider>
        </ToastProvider>
      </ThemeProvider>
    </Router>,
  );
}

describe("deep links · el listado CONSUME el filtro de la ruta", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("con ?tipoPlan=predictivo aplica el filtro y muestra sólo el predictivo", async () => {
    montar("/planes?tipoPlan=predictivo");
    await waitFor(() => expect(screen.getByText("Predictivo motor")).toBeTruthy());
    expect(screen.queryByText("Preventivo bomba")).toBeNull();
  });

  it("sin filtro muestra ambos planes", async () => {
    montar("/planes");
    await waitFor(() => expect(screen.getByText("Preventivo bomba")).toBeTruthy());
    expect(screen.getByText("Predictivo motor")).toBeTruthy();
  });
});
