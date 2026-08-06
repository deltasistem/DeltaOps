/**
 * DGP-013.1 · QR de Abastecimiento anclado a `platform.qr` (mandato:
 * «Etiquetas para recepción. Etiquetas para almacenamiento.»).
 *
 * Verifica:
 *  · el resolvedor PURO de códigos de abastecimiento (servidor prioritario,
 *    degradación local `abr:rec:`/`abr:oc:`/URL/UUID);
 *  · el destino de navegación de una resolución;
 *  · el render de las etiquetas (recepción → QR de plataforma; almacenamiento →
 *    reutiliza `EtiquetaItem` del item de inventario, sin fabricar QR propio);
 *  · la navegación de resolución en la página de escaneo.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import {
  valorQrRecepcion, valorQrOrdenCompra, valorQrItem,
  resolverCodigoAbastecimiento, destinoResolucion,
  EtiquetaRecepcion, EtiquetaItem,
} from "../lib/abastecimiento/EtiquetaAbastecimiento";
import { TarjetaRecepcion } from "../pages/abastecimiento-orden-ficha";
import { Escanear } from "../pages/abastecimiento-escanear";
import type { RecepcionRow } from "../lib/abastecimiento/tipos";

/* ------------------------------ valores QR ------------------------------ */

describe("valores QR · códigos de plataforma (no URLs)", () => {
  it("recepción/OC/item codifican el código de plataforma", () => {
    expect(valorQrRecepcion("rec-1")).toBe("abr:rec:rec-1");
    expect(valorQrOrdenCompra("oc-1")).toBe("abr:oc:oc-1");
    expect(valorQrItem("SKU-1")).toBe("inv:SKU-1");
    expect(valorQrRecepcion("rec-1")).not.toMatch(/^https?:\/\//);
  });
});

/* --------------------------- resolvedor puro ---------------------------- */

describe("resolverCodigoAbastecimiento · servidor prioritario, degradación local", () => {
  it("usa el resultado del servidor (recepción con su OC)", async () => {
    const r = await resolverCodigoAbastecimiento("abr:rec:X", async () => ({ tipo: "recepcion", recepcionId: "rec-9", ordenCompraId: "oc-9" }));
    expect(r).toEqual({ origen: "servidor", tipo: "recepcion", recepcionId: "rec-9", ordenCompraId: "oc-9" });
  });

  it("acepta la forma { tipo: 'orden-compra', id } del servidor", async () => {
    const r = await resolverCodigoAbastecimiento("abr:oc:X", async () => ({ tipo: "orden-compra", id: "oc-2" }));
    expect(r).toEqual({ origen: "servidor", tipo: "orden-compra", ordenCompraId: "oc-2" });
  });

  it("degrada a interpretación local del prefijo abr:rec:", async () => {
    const r = await resolverCodigoAbastecimiento("abr:rec:rec-1", async () => null);
    expect(r).toEqual({ origen: "local", tipo: "recepcion", recepcionId: "rec-1" });
  });

  it("degrada a interpretación local del prefijo abr:oc:", async () => {
    const r = await resolverCodigoAbastecimiento("abr:oc:oc-1", async () => null);
    expect(r).toEqual({ origen: "local", tipo: "orden-compra", ordenCompraId: "oc-1" });
  });

  it("degrada desde una URL de ficha de OC", async () => {
    const r = await resolverCodigoAbastecimiento("https://x/deltaops/abastecimiento/ordenes-compra/oc-7?y=1", async () => null);
    expect(r).toEqual({ origen: "local", tipo: "orden-compra", ordenCompraId: "oc-7" });
  });

  it("un UUID directo se interpreta como recepción (caso del mandato)", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const r = await resolverCodigoAbastecimiento(uuid, async () => null);
    expect(r).toEqual({ origen: "local", tipo: "recepcion", recepcionId: uuid });
  });

  it("marca no-resuelto cuando nada aplica", async () => {
    const r = await resolverCodigoAbastecimiento("DOP-QR-000999", async () => null);
    expect(r).toEqual({ origen: "no-resuelto", codigo: "DOP-QR-000999" });
  });

  it("prioriza el servidor aunque el contenido sea un prefijo local", async () => {
    const r = await resolverCodigoAbastecimiento("abr:rec:rec-1", async () => ({ recepcionId: "SERVIDOR", ordenCompraId: "oc-s" }));
    expect(r).toEqual({ origen: "servidor", tipo: "recepcion", recepcionId: "SERVIDOR", ordenCompraId: "oc-s" });
  });
});

describe("destinoResolucion · a dónde navega", () => {
  it("una OC abre su ficha en la pestaña recepciones", () => {
    expect(destinoResolucion({ origen: "servidor", tipo: "orden-compra", ordenCompraId: "oc-1" }, () => null))
      .toBe("/abastecimiento/ordenes-compra/oc-1?tab=recepciones");
  });
  it("una recepción con OC conocida abre esa OC", () => {
    expect(destinoResolucion({ origen: "servidor", tipo: "recepcion", recepcionId: "rec-1", ordenCompraId: "oc-1" }, () => null))
      .toBe("/abastecimiento/ordenes-compra/oc-1?tab=recepciones");
  });
  it("una recepción sin OC usa el buscador local; null si no la encuentra", () => {
    expect(destinoResolucion({ origen: "local", tipo: "recepcion", recepcionId: "rec-1" }, () => "oc-3"))
      .toBe("/abastecimiento/ordenes-compra/oc-3?tab=recepciones");
    expect(destinoResolucion({ origen: "local", tipo: "recepcion", recepcionId: "rec-1" }, () => null)).toBeNull();
  });
  it("no-resuelto → null", () => {
    expect(destinoResolucion({ origen: "no-resuelto", codigo: "x" }, () => null)).toBeNull();
  });
});

/* ------------------------- render de etiquetas -------------------------- */

function conProviders(ui: React.ReactElement, hook = memoryLocation({ path: "/" }).hook) {
  return render(
    <Router hook={hook}>
      <ThemeProvider><ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="abastecimiento">{ui}</OfflineProvider>
      </ToastProvider></ThemeProvider>
    </Router>,
  );
}

describe("EtiquetaRecepcion · QR imprimible anclado a plataforma", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("muestra el QR de la recepción y ofrece imprimir", () => {
    conProviders(<EtiquetaRecepcion recepcionId="rec-1" ordenCompraId="oc-1" ordenCodigo="OC-1" materializada />);
    expect(screen.getByText("Recepción rec-1")).toBeTruthy();
    expect(screen.getByText(/OC: OC-1/)).toBeTruthy();
    expect(screen.getByText("Materializada")).toBeTruthy();
    const boton = screen.getByTestId("imprimir-etiqueta-recepcion-rec-1");
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(boton);
    expect(abrir).toHaveBeenCalled();
  });

  it("EtiquetaItem (almacenamiento) reutiliza el QR del item de inventario", () => {
    conProviders(<EtiquetaItem itemId="item-1" sku="SKU-1" nombre="Rodamiento" />);
    expect(screen.getByText("Rodamiento")).toBeTruthy();
    expect(screen.getByText(/ID: item-1/)).toBeTruthy();
  });
});

/* ----------- etiqueta de recepción dentro de la TarjetaRecepcion -------- */

function recepcion(): RecepcionRow {
  return { id: "rec-1", ordenCompraId: "oc-1", estado: "REGISTRADA", materializada: false, lineas: [] } as RecepcionRow;
}

describe("TarjetaRecepcion · botón Etiqueta muestra la etiqueta QR de la recepción", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("al pulsar Etiqueta aparece el panel con el QR de la recepción", () => {
    conProviders(<TarjetaRecepcion recepcion={recepcion()} onCambio={() => {}} />);
    expect(screen.queryByTestId("panel-etiqueta-recepcion-rec-1")).toBeNull();
    fireEvent.click(screen.getByTestId("etiqueta-recepcion-rec-1"));
    const panel = screen.getByTestId("panel-etiqueta-recepcion-rec-1");
    expect(panel).toBeTruthy();
    expect(within(panel).getByText("Recepción rec-1")).toBeTruthy();
  });
});

/* -------------------- navegación de resolución (escaneo) ---------------- */

describe("página de escaneo · navega al resolver", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("entrada manual `abr:oc:oc-1` navega a la OC (pestaña recepciones)", async () => {
    // Servidor de plataforma no montado → degradación local.
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "FUNCION_NO_DISPONIBLE" } }), { status: 404, headers: { "Content-Type": "application/json" } }));
    const nav = memoryLocation({ path: "/abastecimiento/escanear", record: true });
    conProviders(<Escanear />, nav.hook);

    const input = screen.getByLabelText(/Código o URL del QR/i);
    fireEvent.change(input, { target: { value: "abr:oc:oc-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolver" }));

    await waitFor(() => expect(nav.history[nav.history.length - 1]).toBe("/abastecimiento/ordenes-compra/oc-1?tab=recepciones"));
  });

  it("usa el resolvedor del servidor cuando está disponible (recepción → su OC)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ tipo: "recepcion", recepcionId: "rec-1", ordenCompraId: "oc-9" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const nav = memoryLocation({ path: "/abastecimiento/escanear", record: true });
    conProviders(<Escanear />, nav.hook);

    const input = screen.getByLabelText(/Código o URL del QR/i);
    fireEvent.change(input, { target: { value: "abr:rec:rec-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Resolver" }));

    await waitFor(() => expect(nav.history[nav.history.length - 1]).toBe("/abastecimiento/ordenes-compra/oc-9?tab=recepciones"));
  });
});
