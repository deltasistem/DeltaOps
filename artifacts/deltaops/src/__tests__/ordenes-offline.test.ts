/**
 * DGP-009.3 · Pruebas de la cola offline generalizada por módulo y de las
 * mutaciones de Órdenes con degradación offline.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import { transicionar, crearOrden, registrarBitacora } from "../lib/ordenes/mutaciones";
import { MODULO } from "../lib/ordenes/constantes";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}

describe("cola offline por módulo", () => {
  beforeEach(() => localStorage.clear());

  it("aísla la cola de ordenes de la de activos para el mismo tenant", () => {
    const activos = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "activos");
    activos.encolar({ comando: "modulo.activos.crear", input: {}, descripcion: "a" });
    const ordenes = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    expect(ordenes.getSnapshot().length).toBe(0);
    ordenes.encolar({ comando: `${MODULO}.crear`, input: {}, descripcion: "o" });
    expect(ordenes.getSnapshot().length).toBe(1);
    // La cola de activos no se ve afectada.
    expect(activos.getSnapshot().length).toBe(1);
  });

  it("persiste con el prefijo del módulo", () => {
    const ordenes = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    ordenes.encolar({ comando: `${MODULO}.crear`, input: {}, descripcion: "o" });
    expect(localStorage.getItem("deltaops:ordenes:cola:deltaops")).toBeTruthy();
    expect(localStorage.getItem("deltaops:activos:cola:deltaops")).toBeNull();
  });
});

describe("mutaciones de ordenes (degradación offline)", () => {
  beforeEach(() => localStorage.clear());

  it("transicionar directo (online) no encola", async () => {
    const cola = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ estado: "ABIERTA" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const r = await transicionar(cola, "o1", "abrir");
    expect(r.encolada).toBe(false);
    expect(r.error).toBeUndefined();
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("crearOrden encola ante fallo de red", async () => {
    const cola = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await crearOrden(cola, { titulo: "x", tipo: "correctiva" });
    expect(r.encolada).toBe(true);
    expect(cola.pendientes()).toBe(1);
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe(`${MODULO}.crear`);
    expect(op.input.titulo).toBe("x");
    vi.restoreAllMocks();
  });

  it("registrarBitacora usa el comando multi-segmento", async () => {
    const cola = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network error"));
    await registrarBitacora(cola, "o1", "inicio", { nota: "arranque" });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe(`${MODULO}.bitacora.registrar`);
    expect(op.input.accion).toBe("inicio");
    vi.restoreAllMocks();
  });
});
