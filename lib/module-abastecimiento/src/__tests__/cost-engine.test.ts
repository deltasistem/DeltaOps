/** DGP-013 · Pruebas del MOTOR DE COSTOS (puro/determinista, casos límite). */
import { describe, expect, it } from "vitest";
import { estadoCostosInicial, type EstadoCostos } from "../domain/articulo";
import {
  aplicarEntradaCosto,
  aplicarEntradasCosto,
  fijarCostoEstandar,
  valorTotal,
  type EntradaCosto,
} from "../domain/cost-engine";

const e = (moneda: string, cantidad: number, costoUnitario: number): EntradaCosto => ({ moneda, cantidad, costoUnitario });

describe("promedio ponderado", () => {
  it("sin saldo previo, el promedio es el costo de la entrada", () => {
    const r = aplicarEntradaCosto(estadoCostosInicial("usd"), e("usd", 10, 5));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costoPromedio).toBe(5);
    expect(r.value.ultimoCosto).toBe(5);
    expect(r.value.cantidadValorizada).toBe(10);
  });

  it("pondera correctamente dos entradas de distinto costo", () => {
    // 10 @ 5 = 50 ; luego 10 @ 15 = 150 ⇒ 200 / 20 = 10
    let estado = estadoCostosInicial("usd");
    const r1 = aplicarEntradaCosto(estado, e("usd", 10, 5));
    if (!r1.ok) throw new Error("r1");
    estado = r1.value;
    const r2 = aplicarEntradaCosto(estado, e("usd", 10, 15));
    if (!r2.ok) throw new Error("r2");
    expect(r2.value.costoPromedio).toBe(10);
    expect(r2.value.ultimoCosto).toBe(15);
    expect(r2.value.cantidadValorizada).toBe(20);
  });

  it("es determinista aplicando una secuencia (fold)", () => {
    const entradas = [e("usd", 3, 2), e("usd", 7, 4), e("usd", 5, 10)];
    // valor = 6 + 28 + 50 = 84 ; cantidad = 15 ⇒ 5.6
    const r = aplicarEntradasCosto(estadoCostosInicial("usd"), entradas);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costoPromedio).toBe(5.6);
    expect(r.value.cantidadValorizada).toBe(15);
    expect(r.value.ultimoCosto).toBe(10);
  });

  it("no altera el costo estándar en las recepciones", () => {
    const estado = estadoCostosInicial("usd", 7);
    const r = aplicarEntradaCosto(estado, e("usd", 4, 9));
    if (!r.ok) throw new Error("r");
    expect(r.value.costoEstandar).toBe(7);
  });

  it("acepta costo unitario cero (donación/muestra)", () => {
    const r = aplicarEntradaCosto(estadoCostosInicial("usd", 0), e("usd", 5, 0));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costoPromedio).toBe(0);
  });

  it("redondea de forma estable evitando arrastre de error", () => {
    // 1 @ 0.1 y 2 @ 0.2 ⇒ (0.1 + 0.4)/3 = 0.16667 (4 decimales)
    let estado = estadoCostosInicial("usd");
    const r1 = aplicarEntradaCosto(estado, e("usd", 1, 0.1));
    if (!r1.ok) throw new Error("r1");
    estado = r1.value;
    const r2 = aplicarEntradaCosto(estado, e("usd", 2, 0.2));
    if (!r2.ok) throw new Error("r2");
    expect(r2.value.costoPromedio).toBe(0.1667);
  });
});

describe("casos límite y validación", () => {
  it("rechaza cantidad no positiva", () => {
    const r = aplicarEntradaCosto(estadoCostosInicial("usd"), e("usd", 0, 5));
    expect(r.ok).toBe(false);
  });
  it("rechaza costo unitario negativo", () => {
    const r = aplicarEntradaCosto(estadoCostosInicial("usd"), e("usd", 5, -1));
    expect(r.ok).toBe(false);
  });
  it("rechaza moneda distinta a la del artículo", () => {
    const r = aplicarEntradaCosto(estadoCostosInicial("usd"), e("eur", 5, 5));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain("moneda");
  });
  it("una entrada inválida en la secuencia detiene el fold sin efectos visibles", () => {
    const r = aplicarEntradasCosto(estadoCostosInicial("usd"), [e("usd", 5, 5), e("usd", -1, 5)]);
    expect(r.ok).toBe(false);
  });
});

describe("costo estándar y valorización", () => {
  it("fija el costo estándar sin tocar promedio/último", () => {
    const base: EstadoCostos = { moneda: "usd", costoPromedio: 4, ultimoCosto: 6, costoEstandar: 3, cantidadValorizada: 2 };
    const r = fijarCostoEstandar(base, 9);
    if (!r.ok) throw new Error("r");
    expect(r.value.costoEstandar).toBe(9);
    expect(r.value.costoPromedio).toBe(4);
    expect(r.value.ultimoCosto).toBe(6);
  });
  it("rechaza costo estándar negativo", () => {
    expect(fijarCostoEstandar(estadoCostosInicial("usd"), -1).ok).toBe(false);
  });
  it("valorTotal = cantidad · promedio", () => {
    const base: EstadoCostos = { moneda: "usd", costoPromedio: 2.5, ultimoCosto: 3, costoEstandar: 0, cantidadValorizada: 4 };
    expect(valorTotal(base)).toBe(10);
  });
});
