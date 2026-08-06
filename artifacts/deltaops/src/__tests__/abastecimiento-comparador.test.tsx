/**
 * DGP-013 · Comparador multi-proveedor de cotizaciones + selección explícita.
 *
 * Parte pura: totales, plazo máximo, normalización ponderada y ranking (mejor
 * primero) — la lógica NO decide; sólo ordena y resalta para apoyar la decisión.
 * Parte UI→request: al seleccionar una fila, la ficha emite el comando
 * `seleccionar-cotizacion` al endpoint gobernado con `solicitudId` + `cotizacionId`
 * (la autoridad de la decisión es el motor).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import {
  compararCotizaciones, totalCotizacion, plazoMaximo, PESOS_POR_DEFECTO,
} from "../lib/abastecimiento/comparador";
import { Comparador } from "../pages/abastecimiento-solicitud-ficha";
import type { CotizacionRow, SolicitudRow } from "../lib/abastecimiento/tipos";

function cot(id: string, proveedorId: string, total: number, plazo: number): CotizacionRow {
  return {
    id, solicitudId: "sol-1", proveedorId, proveedorNombre: `Prov ${proveedorId}`, moneda: "USD",
    total, plazoEntregaMaxDias: plazo, seleccionada: false,
    lineas: [{ numeroLineaSolicitud: 1, descripcion: "x", cantidad: { valor: 1, unidad: "u" }, precioUnitario: { monto: total, moneda: "USD" }, plazoEntregaDias: plazo }],
  } as CotizacionRow;
}

describe("comparador · lógica pura", () => {
  it("totalCotizacion usa el total del read model si existe, si no suma líneas", () => {
    expect(totalCotizacion(cot("c1", "p1", 500, 5))).toBe(500);
    const sinTotal = { id: "c2", solicitudId: "s", proveedorId: "p", moneda: "USD", lineas: [
      { numeroLineaSolicitud: 1, descripcion: "a", cantidad: { valor: 3, unidad: "u" }, precioUnitario: { monto: 10, moneda: "USD" } },
      { numeroLineaSolicitud: 2, descripcion: "b", cantidad: { valor: 2, unidad: "u" }, precioUnitario: { monto: 20, moneda: "USD" } },
    ] } as CotizacionRow;
    expect(totalCotizacion(sinTotal)).toBe(3 * 10 + 2 * 20);
  });

  it("plazoMaximo toma el mayor plazo entre las líneas", () => {
    const c = { id: "c", solicitudId: "s", proveedorId: "p", moneda: "USD", lineas: [
      { numeroLineaSolicitud: 1, descripcion: "a", cantidad: { valor: 1, unidad: "u" }, precioUnitario: { monto: 1, moneda: "USD" }, plazoEntregaDias: 3 },
      { numeroLineaSolicitud: 2, descripcion: "b", cantidad: { valor: 1, unidad: "u" }, precioUnitario: { monto: 1, moneda: "USD" }, plazoEntregaDias: 9 },
    ] } as CotizacionRow;
    expect(plazoMaximo(c)).toBe(9);
  });

  it("rankea mejor precio primero cuando el peso del precio domina", () => {
    const filas = compararCotizaciones(
      [cot("c1", "p1", 1000, 5), cot("c2", "p2", 600, 10), cot("c3", "p3", 800, 3)],
      { precio: 1, plazoEntrega: 0, calificacion: 0 },
    );
    expect(filas[0]!.cotizacion.id).toBe("c2"); // el más barato
    expect(filas[0]!.ranking).toBe(1);
    expect(filas.map((f) => f.ranking)).toEqual([1, 2, 3]);
  });

  it("rankea mejor plazo primero cuando el peso del plazo domina", () => {
    const filas = compararCotizaciones(
      [cot("c1", "p1", 1000, 5), cot("c2", "p2", 600, 10), cot("c3", "p3", 800, 3)],
      { precio: 0, plazoEntrega: 1, calificacion: 0 },
    );
    expect(filas[0]!.cotizacion.id).toBe("c3"); // plazo 3 días
  });

  it("marca esMejorPrecio y esMejorPlazo en las cotizaciones correctas", () => {
    const filas = compararCotizaciones([cot("c1", "p1", 1000, 5), cot("c2", "p2", 600, 10), cot("c3", "p3", 800, 3)]);
    const porId = Object.fromEntries(filas.map((f) => [f.cotizacion.id, f]));
    expect(porId.c2!.esMejorPrecio).toBe(true);
    expect(porId.c3!.esMejorPlazo).toBe(true);
    expect(porId.c1!.esMejorPrecio).toBe(false);
  });

  it("la calificación del proveedor pondera el ranking cuando su peso domina", () => {
    const filas = compararCotizaciones(
      [cot("c1", "p1", 1000, 5), cot("c2", "p2", 1000, 5)],
      { precio: 0, plazoEntrega: 0, calificacion: 1 },
      { p1: 2, p2: 5 },
    );
    expect(filas[0]!.cotizacion.proveedorId).toBe("p2"); // mejor calificado
  });

  it("los pesos por defecto suman 1 (precio 0.5, plazo 0.3, calificación 0.2)", () => {
    expect(PESOS_POR_DEFECTO.precio + PESOS_POR_DEFECTO.plazoEntrega + PESOS_POR_DEFECTO.calificacion).toBeCloseTo(1);
  });

  it("con lista vacía devuelve []", () => {
    expect(compararCotizaciones([])).toEqual([]);
  });
});

/* ------------------------ UI→request · selección ------------------------ */

let emitidos: { url: string; body: Record<string, unknown> }[] = [];
function mockFetch(cotizaciones: CotizacionRow[]): void {
  emitidos = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    if (/\/seleccionar-cotizacion$/.test(url)) {
      emitidos.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/solicitudes\/sol-1\/cotizaciones/.test(url)) {
      return new Response(JSON.stringify({ cotizaciones }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function solicitud(): SolicitudRow {
  return { id: "sol-1", titulo: "s", prioridad: "alta", estado: "ENVIADA", version: 2, origen: { tipo: "usuario" }, lineas: [] } as SolicitudRow;
}

function montar() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="abastecimiento">
          <Comparador solicitud={solicitud()} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("UI→request · seleccionar cotización desde el comparador", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("muestra las cotizaciones ordenadas y la #1 recomendada", async () => {
    mockFetch([cot("c1", "p1", 1000, 5), cot("c2", "p2", 600, 10)]);
    montar();
    await waitFor(() => expect(screen.getByTestId("fila-cotizacion-c2")).toBeTruthy());
    expect(screen.getByText(/#1 recomendada/i)).toBeTruthy();
  });

  it("al seleccionar una fila emite seleccionar-cotizacion con solicitudId + cotizacionId", async () => {
    mockFetch([cot("c1", "p1", 1000, 5), cot("c2", "p2", 600, 10)]);
    montar();
    const boton = await screen.findByTestId("seleccionar-c1");
    fireEvent.click(boton);
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.url).toMatch(/\/solicitudes\/sol-1\/seleccionar-cotizacion$/);
    expect(emitidos[0]!.body.solicitudId).toBe("sol-1");
    expect(emitidos[0]!.body.cotizacionId).toBe("c1");
  });

  it("degrada con aviso cuando no hay cotizaciones", async () => {
    mockFetch([]);
    montar();
    await waitFor(() => expect(screen.getByText(/Sin cotizaciones/i)).toBeTruthy());
  });
});
