/** DGP-011.1 · Pruebas del MODELO DE STOCK: invariantes y movimientos-evento. */
import { describe, expect, it } from "vitest";
import {
  aplicarDelta,
  aplicarMovimiento,
  deltaDeMovimiento,
  ESTADOS_STOCK,
  STOCK_CERO,
  stockConsistente,
  totalStock,
  type Stock,
} from "..";

function stock(p: Partial<Stock>): Stock {
  return { ...STOCK_CERO, ...p };
}

describe("Stock · invariantes", () => {
  it("total = suma de cubetas", () => {
    const s = stock({ disponible: 5, reservado: 3, enTransito: 2 });
    expect(totalStock(s)).toBe(10);
    expect(stockConsistente(s)).toBe(true);
  });
  it("todas las cubetas conocidas están cubiertas", () => {
    expect(ESTADOS_STOCK.length).toBe(7);
  });
  it("aplicarDelta rechaza cubetas negativas (no se consume de más)", () => {
    const s = stock({ disponible: 2 });
    const r = aplicarDelta(s, { disponible: -3 });
    expect(r.ok).toBe(false);
  });
  it("aplicarDelta preserva no-negatividad", () => {
    const s = stock({ disponible: 10 });
    const r = aplicarDelta(s, { disponible: -4, reservado: +4 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.disponible).toBe(6);
      expect(r.value.reservado).toBe(4);
      expect(totalStock(r.value)).toBe(10);
    }
  });
});

describe("Stock · semántica de movimientos", () => {
  it("entrada incrementa disponible", () => {
    const r = aplicarMovimiento(STOCK_CERO, { familia: "entrada", cantidad: 5 });
    if (r.ok) expect(r.value.disponible).toBe(5);
  });
  it("reserva mueve disponible→reservado conservando masa", () => {
    const r = aplicarMovimiento(stock({ disponible: 5 }), { familia: "reserva", cantidad: 2 });
    if (r.ok) {
      expect(r.value.disponible).toBe(3);
      expect(r.value.reservado).toBe(2);
      expect(totalStock(r.value)).toBe(5);
    }
  });
  it("liberación revierte reservado→disponible", () => {
    const r = aplicarMovimiento(stock({ disponible: 3, reservado: 2 }), { familia: "liberacion", cantidad: 2 });
    if (r.ok) {
      expect(r.value.disponible).toBe(5);
      expect(r.value.reservado).toBe(0);
    }
  });
  it("transferencia salida/entrada conserva masa vía en-tránsito", () => {
    const salida = aplicarMovimiento(stock({ disponible: 5 }), { familia: "transferencia-salida", cantidad: 5 });
    expect(salida.ok).toBe(true);
    if (salida.ok) {
      expect(salida.value.enTransito).toBe(5);
      const entrada = aplicarMovimiento(salida.value, { familia: "transferencia-entrada", cantidad: 5 });
      if (entrada.ok) {
        expect(entrada.value.disponible).toBe(5);
        expect(entrada.value.enTransito).toBe(0);
      }
    }
  });
  it("conteo concilia disponible al valor objetivo (positivo y negativo)", () => {
    const arriba = aplicarMovimiento(stock({ disponible: 3 }), { familia: "conteo", cantidad: 0, objetivo: 8 });
    if (arriba.ok) expect(arriba.value.disponible).toBe(8);
    const abajo = aplicarMovimiento(stock({ disponible: 3 }), { familia: "conteo", cantidad: 0, objetivo: 1 });
    if (abajo.ok) expect(abajo.value.disponible).toBe(1);
  });
  it("vencimiento retira de disponible hacia vencido", () => {
    const r = aplicarMovimiento(stock({ disponible: 4 }), { familia: "vencimiento", cantidad: 4 });
    if (r.ok) {
      expect(r.value.disponible).toBe(0);
      expect(r.value.vencido).toBe(4);
    }
  });
  it("salida sin stock suficiente falla (invariante dura)", () => {
    const r = aplicarMovimiento(stock({ disponible: 1 }), { familia: "salida", cantidad: 5 });
    expect(r.ok).toBe(false);
  });
  it("cantidad no positiva es rechazada para familias de flujo", () => {
    expect(deltaDeMovimiento(STOCK_CERO, { familia: "entrada", cantidad: 0 }).ok).toBe(false);
  });
});
