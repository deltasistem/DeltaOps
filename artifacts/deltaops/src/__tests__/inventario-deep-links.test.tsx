/**
 * DGP-011.3 · Consumo de enlaces profundos (ruta→filtro/estado) + resolución QR.
 *
 * No basta con CONSTRUIR el enlace: el destino debe CONSUMIR el contexto de la
 * URL. Aquí se verifica de extremo a extremo que:
 *  - El listado montado en `/inventario?estado=…&tipoItem=…` consulta la API con
 *    ESE filtro (no la lista global).
 *  - La ficha lee `?tab=` para abrir la pestaña indicada.
 *  - La resolución QR (`inv:<sku>` / UUID / URL) mapea al `itemId` correcto,
 *    priorizando el resolvedor de servidor y degradando localmente.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { Listado as InventarioListado } from "../pages/inventario-listado";
import {
  urlItem,
  urlItemTab,
  urlMovimientos,
  urlBodegas,
  leerParam,
} from "../lib/inventario/deep-links";
import { resolverCodigoItem, valorQrItem } from "../lib/inventario/EtiquetaItem";

let listadoUrls: string[] = [];

function mockFetch(): void {
  listadoUrls = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/deltaops\/inventario(\?|$)/.test(url) && !/\/(catalogos|sync)/.test(url)) {
      listadoUrls.push(url);
      const soloFiltrados = /estado=ACTIVO/.test(url) && /tipoItem=filtro/.test(url);
      const items = soloFiltrados
        ? [{ id: "I-1", tenantId: "t", sku: "FLT-1", nombre: "Filtro filtrado", tipoItem: "filtro", estado: "ACTIVO", categoria: "consumibles", version: 1 }]
        : [
            { id: "G-1", tenantId: "t", sku: "G-1", nombre: "Global A", tipoItem: "otro", estado: "INACTIVO", categoria: "x", version: 1 },
            { id: "G-2", tenantId: "t", sku: "G-2", nombre: "Global B", tipoItem: "otro", estado: "INACTIVO", categoria: "x", version: 1 },
          ];
      return new Response(JSON.stringify({ items }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    // Catálogos u otras lecturas: vacío tolerante.
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function montar(path: string) {
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

describe("consumo ruta→filtro · listado de inventario", () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("consulta la API con el filtro de la URL (no la lista global)", async () => {
    montar("/inventario?estado=ACTIVO&tipoItem=filtro&categoria=consumibles");
    await waitFor(() => expect(screen.getByText("Filtro filtrado")).toBeTruthy());
    expect(screen.queryByText("Global A")).toBeNull();
    // La API se llamó ANCLADA al filtro de la URL.
    expect(listadoUrls.some((u) => /estado=ACTIVO/.test(u) && /tipoItem=filtro/.test(u))).toBe(true);
  });
});

describe("construcción + lectura de enlaces profundos", () => {
  it("urlItem / urlItemTab / urlMovimientos / urlBodegas codifican el contexto", () => {
    expect(urlItem("I 1")).toBe("/inventario/I%201");
    expect(urlItemTab("I-1", "existencias")).toBe("/inventario/I-1?tab=existencias");
    expect(urlMovimientos("I-1")).toBe("/inventario/movimientos?itemId=I-1");
    expect(urlMovimientos()).toBe("/inventario/movimientos");
    expect(urlBodegas("B-1")).toBe("/inventario/bodegas?bodega=B-1");
  });

  it("leerParam recupera el tab que consumirá la ficha", () => {
    expect(leerParam("tab=lotes&x=1", "tab")).toBe("lotes");
    expect(leerParam("?tab=series", "tab")).toBe("series");
    expect(leerParam("", "tab") ?? null).toBeNull();
  });
});

describe("resolución QR de inventario (Platform QR)", () => {
  const sinServidor = async () => null;

  it("codifica el SKU como valor de plataforma", () => {
    expect(valorQrItem("FLT-1")).toBe("inv:FLT-1");
  });

  it("prioriza el resolvedor del servidor cuando devuelve itemId", async () => {
    const r = await resolverCodigoItem("inv:FLT-1", async () => ({ itemId: "I-99" }), () => "I-local");
    expect(r).toEqual({ origen: "servidor", itemId: "I-99" });
  });

  it("degrada a búsqueda local por SKU (prefijo inv:)", async () => {
    const r = await resolverCodigoItem("inv:FLT-1", sinServidor, (sku) => (sku === "FLT-1" ? "I-7" : null));
    expect(r).toEqual({ origen: "local", itemId: "I-7" });
  });

  it("degrada a UUID directo y a URL de ficha", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    expect(await resolverCodigoItem(uuid, sinServidor, () => null)).toEqual({ origen: "local", itemId: uuid });
    const r = await resolverCodigoItem("https://x/deltaops/inventario/I-42", sinServidor, () => null);
    expect(r).toEqual({ origen: "local", itemId: "I-42" });
  });

  it("marca no-resuelto cuando no hay servidor ni coincidencia local", async () => {
    const r = await resolverCodigoItem("inv:DESCONOCIDO", sinServidor, () => null);
    expect(r.origen).toBe("no-resuelto");
  });
});
