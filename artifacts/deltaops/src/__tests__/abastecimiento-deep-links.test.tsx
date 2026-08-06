/**
 * DGP-013 · Deep links de Abastecimiento (ruta→filtro CONSUMIDO).
 *
 * Verifica que los constructores de enlaces son puros y coherentes y —lo
 * esencial— que el DESTINO consume el contexto de la URL: al abrir un listado
 * con `?estado=` / `?tipo=` esos filtros quedan aplicados (ruta→estado inicial).
 * Los enlaces cruzados (inventario, movimientos, OT, plan) apuntan a destinos
 * que ya consumen su parámetro.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { Listado as ListadoSolicitudes } from "../pages/abastecimiento-solicitudes";
import { Listado as ListadoOrdenes } from "../pages/abastecimiento-ordenes";
import {
  urlArticulos, urlArticulo, urlArticuloTab, urlNuevoArticulo,
  urlProveedores, urlProveedor,
  urlSolicitudes, urlSolicitud, urlSolicitudTab, urlNuevaSolicitud,
  urlOrdenesCompra, urlOrdenCompra, urlNuevaOrdenCompra,
  urlItemInventario, urlMovimientosInventario, urlOrdenTrabajo, urlPlan, urlOrigenSolicitud,
} from "../lib/abastecimiento/deep-links";

describe("deep links · constructores puros", () => {
  it("urlArticulos serializa tipo/familia", () => {
    expect(urlArticulos()).toBe("/abastecimiento/articulos");
    expect(urlArticulos({ tipo: "componente" })).toBe("/abastecimiento/articulos?tipo=componente");
    expect(urlArticulos({ tipo: "componente", familia: "rodamientos" })).toBe("/abastecimiento/articulos?tipo=componente&familia=rodamientos");
  });

  it("urlArticulo / urlArticuloTab / urlNuevoArticulo codifican parámetros", () => {
    expect(urlArticulo("a 1")).toBe("/abastecimiento/articulos/a%201");
    expect(urlArticuloTab("a1", "costos")).toBe("/abastecimiento/articulos/a1?tab=costos");
    expect(urlNuevoArticulo()).toBe("/abastecimiento/articulos/nuevo");
  });

  it("urlProveedores/urlProveedor y urlSolicitudes/urlSolicitud/urlSolicitudTab", () => {
    expect(urlProveedores({ tipo: "fabricante" })).toBe("/abastecimiento/proveedores?tipo=fabricante");
    expect(urlProveedor("p1")).toBe("/abastecimiento/proveedores/p1");
    expect(urlSolicitudes({ estado: "ENVIADA", prioridad: "alta" })).toBe("/abastecimiento/solicitudes?estado=ENVIADA&prioridad=alta");
    expect(urlSolicitud("s1")).toBe("/abastecimiento/solicitudes/s1");
    expect(urlSolicitudTab("s1", "cotizaciones")).toBe("/abastecimiento/solicitudes/s1?tab=cotizaciones");
  });

  it("urlNuevaSolicitud ancla el origen (tipo/refId/refTipo/etiqueta)", () => {
    expect(urlNuevaSolicitud()).toBe("/abastecimiento/solicitudes/nueva");
    const u = urlNuevaSolicitud({ tipo: "inventario", refId: "item-1", refTipo: "item", etiqueta: "Rodamiento 6205" });
    expect(u).toContain("origen=inventario");
    expect(u).toContain("refId=item-1");
    expect(u).toContain("refTipo=item");
    // La etiqueta va URL-encodeada (URLSearchParams usa '+' para el espacio).
    expect(u).toContain("etiqueta=Rodamiento+6205");
  });

  it("urlOrdenesCompra / urlOrdenCompra / urlNuevaOrdenCompra con contexto", () => {
    expect(urlOrdenesCompra({ estado: "ENVIADA" })).toBe("/abastecimiento/ordenes-compra?estado=ENVIADA");
    expect(urlOrdenCompra("oc1")).toBe("/abastecimiento/ordenes-compra/oc1");
    const u = urlNuevaOrdenCompra({ solicitudId: "sol-1", cotizacionId: "cot-1" });
    expect(u).toContain("solicitudId=sol-1");
    expect(u).toContain("cotizacionId=cot-1");
  });

  it("enlaces CRUZADOS apuntan a destinos que ya consumen su parámetro", () => {
    expect(urlItemInventario("item-1")).toBe("/inventario/item-1");
    expect(urlMovimientosInventario("item-1")).toBe("/inventario/movimientos?itemId=item-1");
    expect(urlOrdenTrabajo("OT-1")).toBe("/ordenes/OT-1");
    expect(urlPlan("plan-1")).toBe("/planes/plan-1");
  });

  it("urlOrigenSolicitud mapea el origen a su destino (o null si no aplica)", () => {
    expect(urlOrigenSolicitud({ tipo: "inventario", referenciaId: "item-1" })).toBe(urlItemInventario("item-1"));
    expect(urlOrigenSolicitud({ tipo: "orden", referenciaId: "OT-1" })).toBe(urlOrdenTrabajo("OT-1"));
    expect(urlOrigenSolicitud({ tipo: "plan", referenciaId: "plan-1" })).toBe(urlPlan("plan-1"));
    expect(urlOrigenSolicitud({ tipo: "usuario" })).toBeNull();
    expect(urlOrigenSolicitud(undefined)).toBeNull();
  });
});

/* ------------------------ ruta→filtro CONSUMIDO ------------------------- */

const SOLICITUDES = [
  { id: "s1", titulo: "Reposición rodamientos", prioridad: "alta", estado: "ENVIADA", version: 1, origen: { tipo: "inventario" }, lineas: [] },
  { id: "s2", titulo: "Compra de grasa", prioridad: "media", estado: "BORRADOR", version: 1, origen: { tipo: "usuario" }, lineas: [] },
];
const ORDENES = [
  { id: "o1", codigo: "OC-1", proveedorId: "p1", proveedorNombre: "Alfa", moneda: "USD", estado: "ENVIADA", version: 1, lineas: [], total: 100 },
  { id: "o2", codigo: "OC-2", proveedorId: "p2", proveedorNombre: "Beta", moneda: "USD", estado: "BORRADOR", version: 1, lineas: [], total: 50 },
];

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/me/.test(url)) return new Response(JSON.stringify({ id: "u", nombre: "User" }), { status: 200, headers: { "Content-Type": "application/json" } });
    if (/\/catalogos\//.test(url)) return new Response(JSON.stringify({ opciones: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    const params = new URL(url, "http://x").searchParams;
    if (/\/solicitudes(\?|$)/.test(url)) {
      const estado = params.get("estado");
      const datos = estado ? SOLICITUDES.filter((s) => s.estado === estado) : SOLICITUDES;
      return new Response(JSON.stringify({ solicitudes: datos }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/ordenes-compra(\?|$)/.test(url)) {
      const estado = params.get("estado");
      const datos = estado ? ORDENES.filter((o) => o.estado === estado) : ORDENES;
      return new Response(JSON.stringify({ ordenesCompra: datos }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function montarSolicitudes(ruta: string) {
  const { hook } = memoryLocation({ path: ruta });
  return render(
    <Router hook={hook}>
      <ThemeProvider><ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="abastecimiento"><ListadoSolicitudes /></OfflineProvider>
      </ToastProvider></ThemeProvider>
    </Router>,
  );
}

function montarOrdenes(ruta: string) {
  const { hook } = memoryLocation({ path: ruta });
  return render(
    <Router hook={hook}>
      <ThemeProvider><ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="abastecimiento"><ListadoOrdenes /></OfflineProvider>
      </ToastProvider></ThemeProvider>
    </Router>,
  );
}

describe("deep links · el listado de solicitudes CONSUME ?estado=", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("con ?estado=ENVIADA aplica el filtro y muestra sólo la enviada", async () => {
    montarSolicitudes("/abastecimiento/solicitudes?estado=ENVIADA");
    await waitFor(() => expect(screen.getByText("Reposición rodamientos")).toBeTruthy());
    expect(screen.queryByText("Compra de grasa")).toBeNull();
  });

  it("sin filtro muestra todas", async () => {
    montarSolicitudes("/abastecimiento/solicitudes");
    await waitFor(() => expect(screen.getByText("Reposición rodamientos")).toBeTruthy());
    expect(screen.getByText("Compra de grasa")).toBeTruthy();
  });
});

describe("deep links · el listado de órdenes CONSUME ?estado=", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("con ?estado=ENVIADA muestra sólo la OC enviada", async () => {
    montarOrdenes("/abastecimiento/ordenes-compra?estado=ENVIADA");
    await waitFor(() => expect(screen.getByText(/OC-1/)).toBeTruthy());
    expect(screen.queryByText(/OC-2/)).toBeNull();
  });
});
