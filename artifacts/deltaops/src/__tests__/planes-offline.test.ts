/**
 * DGP-012 · Offline First de Planes: aislamiento de cola por módulo con el
 * namespace `deltaops:planes:cola:<tenant>`, acuñado de id/opId (UUID) de
 * cliente para el replay idempotente, degradación sólo ante errores de red
 * (los de negocio propagan) y sincronización con recibos por `/sync`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearPlan,
  transicionarPlan,
  generarOrdenesPreventivas,
  crearCalendario,
} from "../lib/planes/mutaciones";
import { construirInputPlan, construirInputCalendario } from "../lib/planes/alta";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}
const VALORES_PLAN = {
  nombre: "Plan", tipoPlan: "preventivo", estrategia: "tiempo", prioridad: "alta",
  alcanceActivos: "a1", frecuenciaModo: "simple",
  reglas: [{ tipo: "dias", cada: 30, unidad: "dias" }],
  rutinaNombre: "R", actividades: [{ titulo: "T", tipo: "inspeccion" }],
  vigenteDesde: "2026-01-01",
};

const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "planes");

describe("cola offline de planes · aislamiento y namespace", () => {
  beforeEach(() => localStorage.clear());

  it("persiste con el namespace del módulo y no colisiona con otros dominios", () => {
    const p = nuevaCola();
    p.encolar({ comando: "modulo.planes.crear-plan", input: {}, descripcion: "c" });
    expect(localStorage.getItem("deltaops:planes:cola:deltaops")).toBeTruthy();
    expect(localStorage.getItem("deltaops:inventario:cola:deltaops")).toBeNull();
    expect(localStorage.getItem("deltaops:ordenes:cola:deltaops")).toBeNull();
  });

  it("aísla la cola de planes de la de otros módulos", () => {
    const inv = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "inventario");
    inv.encolar({ comando: "modulo.inventario.mover", input: {}, descripcion: "m" });
    expect(nuevaCola().getSnapshot().length).toBe(0);
  });
});

describe("mutaciones de planes · degradación offline", () => {
  beforeEach(() => localStorage.clear());

  it("crear plan online no encola y devuelve resultado", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "P-1" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await crearPlan(cola, construirInputPlan(VALORES_PLAN));
    expect(r.encolada).toBe(false);
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("crear plan offline ENCOLA con id y opId (UUID) acuñados para replay idempotente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await crearPlan(cola, construirInputPlan(VALORES_PLAN));
    expect(r.encolada).toBe(true);
    expect(cola.pendientes()).toBe(1);
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    expect(input.opId).toBeTruthy();
    expect(String(input.opId)).toMatch(/[0-9a-f-]{8,}/i);
    vi.restoreAllMocks();
  });

  it("transición offline ENCOLA conservando su acción real y el motivo", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarPlan(cola, "p1", "posponer", 2, "clima", { hasta: "2026-06-01" });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.planes.transicionar-plan");
    const input = op.input as Record<string, unknown>;
    expect(input.accion).toBe("posponer");
    expect(input.motivo).toBe("clima");
    expect(input.hasta).toBe("2026-06-01");
    vi.restoreAllMocks();
  });

  it("un error de negocio (no de red) NO encola y propaga el error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ mensaje: "conflicto de versión" }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await generarOrdenesPreventivas(cola, "p1", { limite: 5 });
    expect(r.encolada).toBe(false);
    expect(r.error).toBeTruthy();
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("calendario offline acuña id de cabecera para el replay", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await crearCalendario(cola, construirInputCalendario({ nombre: "C", tipo: "op", ambito: "empresa" }));
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    expect(input.opId).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("generar órdenes offline ENCOLA como comando oficial con opId UUID en el input (dedup estable)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await generarOrdenesPreventivas(cola, "p1", { limite: 5, tipoOrden: "preventiva" });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.planes.generar-ordenes-preventivas");
    const input = op.input as Record<string, unknown>;
    expect(input.planId).toBe("p1");
    expect(input.limite).toBe(5);
    expect(input.tipoOrden).toBe("preventiva");
    expect(input.opId).toBe(op.opId);
    expect(String(input.opId)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    vi.restoreAllMocks();
  });
});

describe("sincronización por /sync · recibos y replay", () => {
  beforeEach(() => localStorage.clear());

  it("procesar la cola aplica las operaciones y las marca aplicadas (recibo)", async () => {
    // Encolamos dos operaciones offline.
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("network"));
    const enviadas: OperacionCola[] = [];
    const cola = new ColaSync("deltaops", async (ops) => { enviadas.push(...ops); return reciboOk(ops); }, localStorage, "planes");
    await crearPlan(cola, construirInputPlan(VALORES_PLAN));
    await transicionarPlan(cola, "p1", "suspender", 1, "motivo");
    expect(cola.pendientes()).toBe(2);
    vi.restoreAllMocks();

    // Recuperada la red, el replay envía el lote y recibe recibos "aplicada".
    await cola.procesar();
    expect(enviadas.length).toBe(2);
    expect(cola.pendientes()).toBe(0);
    const estados = cola.getSnapshot().map((o) => o.estado);
    expect(estados.every((e) => e === "aplicada")).toBe(true);
  });

  it("un recibo idempotente marca la operación como idempotente (no duplica efectos)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = new ColaSync(
      "deltaops",
      async (ops) => ({ total: ops.length, aplicadas: 0, idempotentes: ops.length, conflictos: 0, reintentables: 0, rechazadas: 0, resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "idempotente" as const })) }),
      localStorage,
      "planes",
    );
    await generarOrdenesPreventivas(cola, "p1", { limite: 3 });
    vi.restoreAllMocks();
    await cola.procesar();
    expect(cola.getSnapshot()[0]!.estado).toBe("idempotente");
  });
});
