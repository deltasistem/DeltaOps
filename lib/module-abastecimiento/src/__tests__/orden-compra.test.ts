/** DGP-013 · Pruebas de ORDEN DE COMPRA: recepción acumulada, tolerancias, estado derivado. */
import { describe, expect, it } from "vitest";
import {
  aplicarAccionOrdenCompra,
  aplicarRecepcionOrdenCompra,
  crearOrdenCompra,
  recibidoDeLinea,
  topeLinea,
  totalOrdenCompra,
  type OrdenCompra,
} from "../domain/orden-compra";
import { crearLineaOrdenCompra, type LineaOrdenCompra } from "../domain/value-objects";
import type { ReferenciaWorkflow } from "../domain/workflow";

const WF: ReferenciaWorkflow = { proceso: "ordenCompra", definicion: "d", instanciaId: "i", version: 1 };
const AHORA = "2024-01-01T00:00:00.000Z";

function linea(numero: number, cantidad: number, precio: number, tolerancia = 0): LineaOrdenCompra {
  const r = crearLineaOrdenCompra({
    numero, articuloId: `art-${numero}`, cantidad: { valor: cantidad, unidad: "unidad" },
    precioUnitario: { moneda: "usd", monto: precio }, toleranciaSobreRecepcion: tolerancia,
  });
  if (!r.ok) throw new Error("linea");
  return r.value;
}

function oc(estado: OrdenCompra["estado"], lineas: LineaOrdenCompra[]): OrdenCompra {
  const r = crearOrdenCompra({
    id: "oc1", tenantId: "t", codigo: "OC-1", proveedorId: "p1", moneda: "usd",
    lineas, workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA,
  });
  if (!r.ok) throw new Error("oc");
  return { ...r.value.orden, estado };
}

describe("creación y totales", () => {
  it("calcula el total ordenado", () => {
    expect(totalOrdenCompra([linea(1, 2, 10), linea(2, 3, 5)])).toBe(35);
  });
  it("rechaza líneas con moneda distinta", () => {
    const l = crearLineaOrdenCompra({ numero: 1, cantidad: { valor: 1, unidad: "unidad" }, precioUnitario: { moneda: "eur", monto: 1 } });
    if (!l.ok) throw new Error("l");
    const r = crearOrdenCompra({ id: "o", tenantId: "t", codigo: "OC", proveedorId: "p", moneda: "usd", lineas: [l.value], workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA });
    expect(r.ok).toBe(false);
  });
});

describe("transiciones explícitas", () => {
  it("cada acción es una transición real desde el estado correcto", () => {
    const enviada = oc("aprobada", [linea(1, 1, 1)]);
    const r = aplicarAccionOrdenCompra(enviada, "enviar", "u", AHORA);
    expect(r.ok && r.value.orden.estado === "enviada").toBe(true);
  });
  it("rechaza acción inválida desde el estado actual", () => {
    const borrador = oc("borrador", [linea(1, 1, 1)]);
    expect(aplicarAccionOrdenCompra(borrador, "enviar", "u", AHORA).ok).toBe(false); // requiere aprobada
  });
  it("estado terminal es inmutable", () => {
    const recibida = oc("recibida", [linea(1, 1, 1)]);
    expect(aplicarAccionOrdenCompra(recibida, "cancelar", "u", AHORA).ok).toBe(false);
  });
});

describe("recepción acumulada y estado derivado", () => {
  it("recepción parcial deja la OC en parcialmenteRecibida", () => {
    const enviada = oc("enviada", [linea(1, 10, 5)]);
    const r = aplicarRecepcionOrdenCompra(enviada, [{ numeroLineaOC: 1, cantidad: 4 }], "u", AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.orden.estado).toBe("parcialmenteRecibida");
    expect(recibidoDeLinea(r.value.orden, 1)).toBe(4);
  });

  it("recepciones acumulan hasta completar y derivan 'recibida'", () => {
    let orden = oc("enviada", [linea(1, 10, 5)]);
    const r1 = aplicarRecepcionOrdenCompra(orden, [{ numeroLineaOC: 1, cantidad: 4 }], "u", AHORA);
    if (!r1.ok) throw new Error("r1");
    orden = r1.value.orden;
    const r2 = aplicarRecepcionOrdenCompra(orden, [{ numeroLineaOC: 1, cantidad: 6 }], "u", AHORA);
    if (!r2.ok) throw new Error("r2");
    expect(recibidoDeLinea(r2.value.orden, 1)).toBe(10);
    expect(r2.value.orden.estado).toBe("recibida");
  });

  it("total sólo cuando TODAS las líneas alcanzan su cantidad ordenada", () => {
    const enviada = oc("enviada", [linea(1, 5, 2), linea(2, 5, 2)]);
    const r = aplicarRecepcionOrdenCompra(enviada, [{ numeroLineaOC: 1, cantidad: 5 }], "u", AHORA);
    if (!r.ok) throw new Error("r");
    expect(r.value.orden.estado).toBe("parcialmenteRecibida");
  });

  it("no permite recibir contra una OC no enviada", () => {
    const aprobada = oc("aprobada", [linea(1, 5, 2)]);
    expect(aplicarRecepcionOrdenCompra(aprobada, [{ numeroLineaOC: 1, cantidad: 1 }], "u", AHORA).ok).toBe(false);
  });
});

describe("tolerancia de sobre-recepción", () => {
  it("permite recibir hasta la cantidad ordenada más la tolerancia", () => {
    const enviada = oc("enviada", [linea(1, 10, 5, 0.1)]); // tope = 11
    expect(topeLinea(enviada.lineas[0]!)).toBe(11);
    const r = aplicarRecepcionOrdenCompra(enviada, [{ numeroLineaOC: 1, cantidad: 11 }], "u", AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.orden.estado).toBe("recibida"); // >= ordenado
  });

  it("rechaza recibir por encima del tope (ordenado + tolerancia)", () => {
    const enviada = oc("enviada", [linea(1, 10, 5, 0.1)]); // tope = 11
    const r = aplicarRecepcionOrdenCompra(enviada, [{ numeroLineaOC: 1, cantidad: 12 }], "u", AHORA);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain("tope");
  });

  it("acumulado excede el tope aunque cada parcial sea válido", () => {
    let orden = oc("enviada", [linea(1, 10, 5, 0)]); // tope = 10
    const r1 = aplicarRecepcionOrdenCompra(orden, [{ numeroLineaOC: 1, cantidad: 7 }], "u", AHORA);
    if (!r1.ok) throw new Error("r1");
    orden = r1.value.orden;
    const r2 = aplicarRecepcionOrdenCompra(orden, [{ numeroLineaOC: 1, cantidad: 4 }], "u", AHORA);
    expect(r2.ok).toBe(false); // 7 + 4 = 11 > 10
  });

  it("rechaza recepción de línea inexistente o cantidad no positiva", () => {
    const enviada = oc("enviada", [linea(1, 10, 5)]);
    expect(aplicarRecepcionOrdenCompra(enviada, [{ numeroLineaOC: 9, cantidad: 1 }], "u", AHORA).ok).toBe(false);
    expect(aplicarRecepcionOrdenCompra(enviada, [{ numeroLineaOC: 1, cantidad: 0 }], "u", AHORA).ok).toBe(false);
  });
});
