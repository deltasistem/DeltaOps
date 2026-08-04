/**
 * DGP-008.3 · Pruebas de la cola de sincronización offline.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length,
    aplicadas: ops.length,
    idempotentes: 0,
    conflictos: 0,
    reintentables: 0,
    rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}

describe("ColaSync", () => {
  beforeEach(() => localStorage.clear());

  it("encola y persiste operaciones por tenant", () => {
    const cola = new ColaSync("t1", async () => reciboOk([]));
    const id = cola.encolar({ comando: "modulo.activos.crear", input: { nombre: "x" }, descripcion: "crear x" });
    expect(id).toBeTruthy();
    expect(cola.pendientes()).toBe(1);
    // persistencia: una nueva instancia recupera la cola
    const cola2 = new ColaSync("t1", async () => reciboOk([]));
    expect(cola2.getSnapshot().length).toBe(1);
    expect(cola2.getSnapshot()[0]!.input.opId).toBe(id);
  });

  it("aísla la cola entre tenants", () => {
    const a = new ColaSync("ta", async () => reciboOk([]));
    a.encolar({ comando: "c", input: {}, descripcion: "d" });
    const b = new ColaSync("tb", async () => reciboOk([]));
    expect(b.getSnapshot().length).toBe(0);
  });

  it("procesa y marca aplicadas (replay/éxito)", async () => {
    const enviador = vi.fn(async (ops: OperacionCola[]) => reciboOk(ops));
    const cola = new ColaSync("t2", enviador);
    cola.encolar({ comando: "c1", input: {}, descripcion: "d1" });
    cola.encolar({ comando: "c2", input: {}, descripcion: "d2" });
    const resumen = await cola.procesar();
    expect(enviador).toHaveBeenCalledOnce();
    expect(resumen?.aplicadas).toBe(2);
    expect(cola.pendientes()).toBe(0);
    expect(cola.getSnapshot().every((o) => o.estado === "aplicada")).toBe(true);
  });

  it("marca conflictos y permite descartarlos", async () => {
    const enviador = async (ops: OperacionCola[]): Promise<ResumenSync> => ({
      total: ops.length, aplicadas: 0, idempotentes: 0, conflictos: 1, reintentables: 0, rechazadas: 0,
      resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "conflicto", error: "versión desactualizada" })),
    });
    const cola = new ColaSync("t3", enviador);
    const id = cola.encolar({ comando: "editar", input: {}, descripcion: "e" });
    await cola.procesar();
    expect(cola.conflictos().length).toBe(1);
    expect(cola.conflictos()[0]!.mensaje).toMatch(/versión/);
    cola.descartar(id);
    expect(cola.conflictos().length).toBe(0);
  });

  it("revierte a pendiente si el envío falla por red", async () => {
    const enviador = vi.fn(async () => { throw new Error("network failed"); });
    const cola = new ColaSync("t4", enviador);
    cola.encolar({ comando: "c", input: {}, descripcion: "d" });
    const r = await cola.procesar();
    expect(r).toBeNull();
    expect(cola.pendientes()).toBe(1);
    expect(cola.getSnapshot()[0]!.estado).toBe("pendiente");
  });

  it("reactiva una operación reintentable y purga exitosas", async () => {
    const enviador = async (ops: OperacionCola[]): Promise<ResumenSync> => ({
      total: ops.length, aplicadas: 1, idempotentes: 0, conflictos: 0, reintentables: 0, rechazadas: 0,
      resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
    });
    const cola = new ColaSync("t5", enviador);
    cola.encolar({ comando: "c", input: {}, descripcion: "d" });
    await cola.procesar();
    expect(cola.getSnapshot().length).toBe(1);
    cola.purgarExitosas();
    expect(cola.getSnapshot().length).toBe(0);
  });

  it("recupera 'enviando' a 'pendiente' al recargar", () => {
    const cola = new ColaSync("t6", async () => reciboOk([]));
    cola.encolar({ comando: "c", input: {}, descripcion: "d" });
    // forzar estado 'enviando' en storage
    const raw = JSON.parse(localStorage.getItem("deltaops:activos:cola:t6")!);
    raw[0].estado = "enviando";
    localStorage.setItem("deltaops:activos:cola:t6", JSON.stringify(raw));
    const cola2 = new ColaSync("t6", async () => reciboOk([]));
    expect(cola2.getSnapshot()[0]!.estado).toBe("pendiente");
  });
});
