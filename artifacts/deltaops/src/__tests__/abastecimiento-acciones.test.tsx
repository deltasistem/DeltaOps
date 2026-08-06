/**
 * DGP-013 (integración UI→request) · Acciones de Workflow de Abastecimiento.
 *
 * Verifica que CADA botón de la ficha emite SU transición real al endpoint
 * gobernado — sin colapsar varios botones en un comando único — y que:
 *  · las acciones ofrecidas dependen del estado (por `*_POR_ESTADO`);
 *  · toda transición envía `expectedVersion` y su `accion` concreta;
 *  · SÓLO `rechazar` (solicitud) exige y envía `motivoRechazo`; el botón de
 *    confirmación no dispara efecto sin motivo;
 *  · las transiciones de OC NO llevan motivo alguno.
 * Las aserciones son sobre el REQUEST emitido.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { AccionesWorkflow as AccionesSolicitud } from "../pages/abastecimiento-solicitud-ficha";
import { AccionesWorkflow as AccionesOC } from "../pages/abastecimiento-orden-ficha";
import type { SolicitudRow, OrdenCompraRow } from "../lib/abastecimiento/tipos";

interface Emitido { url: string; body: Record<string, unknown> }
let emitidos: Emitido[] = [];

function mockFetch(): void {
  emitidos = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    if (/\/(solicitudes|ordenes-compra)\/[^/]+\/transicion$/.test(url)) {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      emitidos.push({ url, body });
      return new Response(JSON.stringify({ id: "x", estado: "OK", version: 3, idempotente: false }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function solicitud(estado: string): SolicitudRow {
  return {
    id: "sol-1", titulo: "Reposición", prioridad: "alta", estado, version: 3,
    origen: { tipo: "inventario" }, lineas: [],
  } as SolicitudRow;
}

function oc(estado: string): OrdenCompraRow {
  return {
    id: "oc-1", codigo: "OC-1", proveedorId: "prov-1", proveedorNombre: "Prov", moneda: "USD",
    estado, version: 3, lineas: [], total: 100,
  } as OrdenCompraRow;
}

function montarSolicitud(estado: string) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="abastecimiento">
          <AccionesSolicitud solicitud={solicitud(estado)} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

function montarOC(estado: string) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="abastecimiento">
          <AccionesOC oc={oc(estado)} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("UI→request · acciones de Workflow de la solicitud", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("en BORRADOR ofrece SOLO enviar", async () => {
    montarSolicitud("BORRADOR");
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
  });

  it("en ENVIADA ofrece aprobar/rechazar y NO enviar/cerrar", async () => {
    montarSolicitud("ENVIADA");
    await waitFor(() => expect(screen.getByRole("button", { name: "Aprobar" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
  });

  it("en APROBADA ofrece SOLO cerrar", async () => {
    montarSolicitud("APROBADA");
    await waitFor(() => expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
  });

  it("«Enviar» emite accion=enviar con expectedVersion y SIN motivo", async () => {
    montarSolicitud("BORRADOR");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.url).toMatch(/\/solicitudes\/sol-1\/transicion$/);
    expect(emitidos[0]!.body.accion).toBe("enviar");
    expect(emitidos[0]!.body.expectedVersion).toBe(3);
    expect(emitidos[0]!.body.motivoRechazo).toBeUndefined();
  });

  it("«Rechazar» exige motivo: sin motivo NO emite; con motivo emite accion=rechazar + motivoRechazo", async () => {
    montarSolicitud("ENVIADA");
    fireEvent.click(await screen.findByRole("button", { name: "Rechazar" }));
    // Sin motivo, confirmar NO emite efecto.
    fireEvent.click(await screen.findByRole("button", { name: /confirmar rechazar/i }));
    await waitFor(() => expect(screen.getAllByText(/motivo de rechazo es obligatorio/i).length).toBeGreaterThan(0));
    expect(emitidos.length).toBe(0);
    // Con motivo, emite su acción real.
    fireEvent.change(screen.getByLabelText(/Motivo de rechazo/), { target: { value: "no cumple especificación" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar rechazar/i }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("rechazar");
    expect(emitidos[0]!.body.motivoRechazo).toBe("no cumple especificación");
    expect(emitidos[0]!.url).toMatch(/\/transicion$/);
  });

  it("«Aprobar» (no destructiva) emite accion=aprobar SIN motivo", async () => {
    montarSolicitud("ENVIADA");
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("aprobar");
    expect(emitidos[0]!.body.motivoRechazo).toBeUndefined();
  });
});

describe("UI→request · acciones de Workflow de la orden de compra", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("en BORRADOR ofrece aprobar/cancelar y NO enviar", async () => {
    montarOC("BORRADOR");
    await waitFor(() => expect(screen.getByRole("button", { name: "Aprobar" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enviar al proveedor" })).toBeNull();
  });

  it("en APROBADA ofrece enviar/cancelar y NO aprobar", async () => {
    montarOC("APROBADA");
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar al proveedor" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
  });

  it("«Aprobar» emite accion=aprobar con expectedVersion y SIN motivo", async () => {
    montarOC("BORRADOR");
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.url).toMatch(/\/ordenes-compra\/oc-1\/transicion$/);
    expect(emitidos[0]!.body.accion).toBe("aprobar");
    expect(emitidos[0]!.body.expectedVersion).toBe(3);
    expect(emitidos[0]!.body.motivo).toBeUndefined();
    expect(emitidos[0]!.body.motivoRechazo).toBeUndefined();
  });

  it("«Cancelar» (destructiva) confirma y emite accion=cancelar SIN motivo", async () => {
    montarOC("APROBADA");
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar cancelar/i }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("cancelar");
    expect(emitidos[0]!.body.motivo).toBeUndefined();
  });

  it("«Enviar al proveedor» emite accion=enviar (no colapsa con aprobar)", async () => {
    montarOC("APROBADA");
    fireEvent.click(await screen.findByRole("button", { name: "Enviar al proveedor" }));
    await waitFor(() => expect(emitidos.length).toBe(1));
    expect(emitidos[0]!.body.accion).toBe("enviar");
  });
});
