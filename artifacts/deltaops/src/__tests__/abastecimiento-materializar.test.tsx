/**
 * DGP-013 · Materialización de recepciones a INVENTARIO (idempotente).
 *
 * Verifica que:
 *  · el comando `materializar-recepcion` acuña un `opId` UUID de cliente estable
 *    (clave de deduplicación) y cumple el mínimo del contrato (solo recepcionId);
 *  · la ficha distingue movimientos CREADOS vs IDEMPOTENTES a partir del
 *    resultado real (nunca fabrica);
 *  · cada movimiento ofrece un DEEP LINK a los movimientos del item en inventario
 *    (destino que ya consume `?itemId=`).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { ColaSync } from "../lib/offline/cola";
import { materializarRecepcion } from "../lib/abastecimiento/mutaciones";
import { TarjetaRecepcion } from "../pages/abastecimiento-orden-ficha";
import { urlMovimientosInventario } from "../lib/abastecimiento/deep-links";
import type { RecepcionRow, ResultadoMaterializacion } from "../lib/abastecimiento/tipos";

const nuevaCola = () => new ColaSync("deltaops", async (ops) => ({ total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0, reintentables: 0, rechazadas: 0, resultados: [] }), localStorage, "abastecimiento");

const RESULTADO: ResultadoMaterializacion = {
  recepcionId: "rec-1",
  movimientos: [
    { movimientoId: "mov-1", itemId: "item-1", cantidad: 6, idempotente: false },
    { movimientoId: "mov-2", itemId: "item-2", cantidad: 2, idempotente: true },
  ],
};

describe("mutación · materializar recepción (idempotente)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("emite recepcionId + opId UUID y devuelve el resultado con movimientos", async () => {
    let body: Record<string, unknown> | null = null;
    vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
      expect(String(u)).toMatch(/\/recepciones\/rec-1\/materializar$/);
      body = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(JSON.stringify(RESULTADO), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const r = await materializarRecepcion(nuevaCola(), "rec-1");
    expect(r.encolada).toBe(false);
    expect(body!.recepcionId).toBe("rec-1");
    expect(String(body!.opId)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const res = r.resultado as ResultadoMaterializacion;
    expect(res.movimientos).toHaveLength(2);
  });

  it("reintentar OFFLINE conserva el mismo opId en el envoltorio y en el input (dedup estable)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await materializarRecepcion(cola, "rec-1");
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.abastecimiento.materializar-recepcion");
    expect((op.input as Record<string, unknown>).opId).toBe(op.opId);
  });
});

/* ------------------------- UI: creados vs idempotentes ------------------ */

function recepcion(): RecepcionRow {
  return { id: "rec-1", ordenCompraId: "oc-1", estado: "REGISTRADA", materializada: false, lineas: [
    { numeroLineaOC: 1, cantidad: { valor: 6, unidad: "unidad" } },
  ] } as RecepcionRow;
}

function montar(navegacion: ReturnType<typeof memoryLocation>) {
  return render(
    <Router hook={navegacion.hook}>
      <ThemeProvider>
        <ToastProvider>
          <OfflineProvider tenant="deltaops" modulo="abastecimiento">
            <TarjetaRecepcion recepcion={recepcion()} onCambio={() => {}} />
          </OfflineProvider>
        </ToastProvider>
      </ThemeProvider>
    </Router>,
  );
}

describe("UI · materializar muestra creados vs idempotentes y deep links", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("tras materializar, distingue el movimiento CREADO del IDEMPOTENTE y enlaza a inventario", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      if (/\/recepciones\/rec-1\/materializar$/.test(String(u))) {
        return new Response(JSON.stringify(RESULTADO), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const nav = memoryLocation({ path: "/abastecimiento/ordenes-compra/oc-1", record: true });
    montar(nav);

    fireEvent.click(await screen.findByTestId("materializar-rec-1"));
    // Resumen: 1 creado, 1 idempotente.
    await waitFor(() => expect(screen.getByText(/1 movimiento\(s\) creado\(s\), 1 idempotente/i)).toBeTruthy());
    // Filas de movimiento presentes.
    expect(screen.getByTestId("movimiento-mov-1")).toBeTruthy();
    expect(screen.getByTestId("movimiento-mov-2")).toBeTruthy();
    // Etiquetas creado/idempotente.
    expect(screen.getByTestId("movimiento-mov-1").textContent).toMatch(/Creado/);
    expect(screen.getByTestId("movimiento-mov-2").textContent).toMatch(/Idempotente/);

    // Deep link a los movimientos del item en inventario.
    fireEvent.click(screen.getByTestId("ver-movimiento-mov-1"));
    await waitFor(() => expect(nav.history[nav.history.length - 1]).toBe(urlMovimientosInventario("item-1")));
  });

  it("el deep link de movimientos apunta a /inventario/movimientos?itemId=", () => {
    expect(urlMovimientosInventario("item-1")).toBe("/inventario/movimientos?itemId=item-1");
    expect(urlMovimientosInventario()).toBe("/inventario/movimientos");
  });
});
