/** DGP-013 · Pruebas de INTEGRACIÓN (derivación pura de entradas de inventario y costos). */
import { describe, expect, it } from "vitest";
import { crearOrdenCompra, type OrdenCompra } from "../domain/orden-compra";
import { registrarRecepcion } from "../domain/recepcion";
import { derivarEfectosRecepcion, vinculoOrigenDeOC } from "../domain/integraciones";
import { crearLineaOrdenCompra, crearLineaRecepcion, type LineaOrdenCompra, type LineaRecepcion } from "../domain/value-objects";
import type { ReferenciaWorkflow } from "../domain/workflow";

const WF: ReferenciaWorkflow = { proceso: "ordenCompra", definicion: "d", instanciaId: "i", version: 1 };
const AHORA = "2024-01-01T00:00:00.000Z";

function lineaOC(numero: number, cantidad: number, precio: number): LineaOrdenCompra {
  const r = crearLineaOrdenCompra({
    numero, articuloId: `art-${numero}`, cantidad: { valor: cantidad, unidad: "unidad" },
    precioUnitario: { moneda: "usd", monto: precio },
    bodega: { tipo: "bodega", id: "b1" },
  });
  if (!r.ok) throw new Error("lineaOC");
  return r.value;
}

function lineaRec(numeroLineaOC: number, cantidad: number, novedad = "ninguna"): LineaRecepcion {
  const r = crearLineaRecepcion({ numeroLineaOC, cantidad: { valor: cantidad, unidad: "unidad" }, novedad, lote: "L1" });
  if (!r.ok) throw new Error("lineaRec");
  return r.value;
}

function oc(lineas: LineaOrdenCompra[]): OrdenCompra {
  const r = crearOrdenCompra({
    id: "oc1", tenantId: "t", codigo: "OC-1", proveedorId: "p1", solicitudId: "s1", moneda: "usd",
    lineas, workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA,
  });
  if (!r.ok) throw new Error("oc");
  return r.value.orden;
}

function rec(ocId: string, lineas: LineaRecepcion[]) {
  const r = registrarRecepcion({ id: "r1", tenantId: "t", ordenCompraId: ocId, consecutivo: 1, lineas, completaOrden: false, actorId: "u", ahora: AHORA });
  if (!r.ok) throw new Error("rec");
  return r.value.recepcion;
}

describe("derivarEfectosRecepcion", () => {
  it("deriva una entrada de inventario y una actualización de costo por línea sin novedad", () => {
    const orden = oc([lineaOC(1, 10, 5)]);
    const recepcion = rec(orden.id, [lineaRec(1, 4)]);
    const r = derivarEfectosRecepcion(orden, recepcion);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entradasInventario).toHaveLength(1);
    expect(r.value.entradasInventario[0]!.cantidad).toBe(4);
    expect(r.value.entradasInventario[0]!.bodega?.id).toBe("b1");
    expect(r.value.actualizacionesCosto).toHaveLength(1);
    expect(r.value.actualizacionesCosto[0]!.entrada.costoUnitario).toBe(5);
  });

  it("una novedad NO ingresable (averiado) produce entrada de cantidad 0 y NO actualiza costo", () => {
    const orden = oc([lineaOC(1, 10, 5)]);
    const recepcion = rec(orden.id, [lineaRec(1, 4, "averiado")]);
    const r = derivarEfectosRecepcion(orden, recepcion);
    if (!r.ok) throw new Error("r");
    expect(r.value.entradasInventario[0]!.cantidad).toBe(0);
    expect(r.value.entradasInventario[0]!.novedad).toBe("averiado");
    expect(r.value.actualizacionesCosto).toHaveLength(0);
  });

  it("mezcla líneas ingresables y no ingresables correctamente", () => {
    const orden = oc([lineaOC(1, 10, 5), lineaOC(2, 5, 8)]);
    const recepcion = rec(orden.id, [lineaRec(1, 4, "ninguna"), lineaRec(2, 2, "faltante")]);
    const r = derivarEfectosRecepcion(orden, recepcion);
    if (!r.ok) throw new Error("r");
    expect(r.value.entradasInventario).toHaveLength(2);
    expect(r.value.actualizacionesCosto).toHaveLength(1); // sólo la línea sin novedad
    expect(r.value.actualizacionesCosto[0]!.numeroLineaOC).toBe(1);
  });

  it("rechaza recepción que no corresponde a la OC", () => {
    const orden = oc([lineaOC(1, 10, 5)]);
    const recepcion = rec("otra-oc", [lineaRec(1, 4)]);
    expect(derivarEfectosRecepcion(orden, recepcion).ok).toBe(false);
  });
});

describe("vinculoOrigenDeOC", () => {
  it("extrae la trazabilidad OC→solicitud→origen", () => {
    const orden = oc([lineaOC(1, 1, 1)]);
    const v = vinculoOrigenDeOC(orden, { tipo: "plan", referenciaId: "plan-9", referenciaTipo: "plan-mantenimiento", etiqueta: null });
    expect(v.ordenCompraId).toBe("oc1");
    expect(v.solicitudId).toBe("s1");
    expect(v.origen?.referenciaId).toBe("plan-9");
  });
});
