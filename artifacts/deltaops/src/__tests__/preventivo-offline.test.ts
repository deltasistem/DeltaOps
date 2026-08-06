/**
 * DGP-014 · Offline First del Preventivo: aislamiento de cola por módulo con el
 * namespace `deltaops:preventivo:cola:<tenant>`, acuñado de id/opId (UUID) de
 * cliente para el replay idempotente, degradación SÓLO ante errores de red (los
 * de negocio propagan) y sincronización con recibos por `/sync`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearPrograma, editarPrograma, transicionarPrograma, definirActividad,
  generar, reprogramar,
} from "../lib/preventivo/mutaciones";
import {
  construirInputPrograma, construirInputActividad, construirInputGenerar,
} from "../lib/preventivo/alta";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}

const VALORES_PROGRAMA = { nombre: "Preventivo bombas", tipo: "preventivo" };
const VALORES_ACTIVIDAD = {
  nombre: "Cambio aceite", orden: 1, checklistPlantillaId: "lubricacion",
  checklistVersion: 1, tiempoValor: 2, tiempoUnidad: "h", moneda: "USD",
};
const VALORES_GENERAR = {
  programaId: "p1", actividadId: "a1", activoId: "act-1",
  ventana: "programada", origen: "manual", fechaObjetivo: "2026-02-01",
};

const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "preventivo");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("cola offline del preventivo · aislamiento y namespace", () => {
  beforeEach(() => localStorage.clear());

  it("persiste con el namespace del módulo `deltaops:preventivo:cola:deltaops`", () => {
    const c = nuevaCola();
    c.encolar({ comando: "modulo.preventivo.crear-programa", input: {}, descripcion: "c" });
    expect(localStorage.getItem("deltaops:preventivo:cola:deltaops")).toBeTruthy();
    expect(localStorage.getItem("deltaops:planes:cola:deltaops")).toBeNull();
    expect(localStorage.getItem("deltaops:abastecimiento:cola:deltaops")).toBeNull();
  });

  it("aísla la cola de preventivo de la de otros módulos", () => {
    const planes = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "planes");
    planes.encolar({ comando: "modulo.planes.crear-plan", input: {}, descripcion: "p" });
    expect(nuevaCola().getSnapshot().length).toBe(0);
  });

  it("aísla por tenant (otro tenant no ve la cola)", () => {
    const t1 = nuevaCola();
    t1.encolar({ comando: "modulo.preventivo.crear-programa", input: {}, descripcion: "c" });
    const t2 = new ColaSync("otro", async () => reciboOk([]), localStorage, "preventivo");
    expect(t2.getSnapshot().length).toBe(0);
  });
});

describe("mutaciones del preventivo · degradación offline", () => {
  beforeEach(() => localStorage.clear());

  it("crear programa online no encola y devuelve resultado", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "P-1" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await crearPrograma(cola, construirInputPrograma(VALORES_PROGRAMA));
    expect(r.encolada).toBe(false);
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("crear programa offline ENCOLA con id y opId (UUID) para replay idempotente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await crearPrograma(cola, construirInputPrograma(VALORES_PROGRAMA));
    expect(r.encolada).toBe(true);
    expect(cola.pendientes()).toBe(1);
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    expect(String(input.opId)).toMatch(UUID);
    vi.restoreAllMocks();
  });

  it("definir actividad y generar offline acuñan opId estable (mismo en sobre e input)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("network"));
    const cola = nuevaCola();
    await definirActividad(cola, construirInputActividad("p1", VALORES_ACTIVIDAD));
    await generar(cola, construirInputGenerar(VALORES_GENERAR));
    for (const op of cola.getSnapshot()) {
      expect((op.input as Record<string, unknown>).opId).toBe(op.opId);
    }
    vi.restoreAllMocks();
  });

  it("transición offline ENCOLA conservando su acción real", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarPrograma(cola, "p1", "publicar", 2);
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.preventivo.transicionar-programa");
    const input = op.input as Record<string, unknown>;
    expect(input.accion).toBe("publicar");
    expect(input.expectedVersion).toBe(2);
    vi.restoreAllMocks();
  });

  it("reprogramar offline ENCOLA con su motivo obligatorio", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await reprogramar(cola, { programaId: "p1", fechaOriginal: "2026-02-01", fechaNueva: "2026-02-05", motivo: "clima" });
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.motivo).toBe("clima");
    expect(input.opId).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("un error de negocio (409, no de red) NO encola y propaga el error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ mensaje: "conflicto de versión" }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await editarPrograma(cola, "p1", 1, { nombre: "x" });
    expect(r.encolada).toBe(false);
    expect(r.error).toBeTruthy();
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });
});

describe("sincronización por /sync · recibos y replay", () => {
  beforeEach(() => localStorage.clear());

  it("procesar la cola aplica las operaciones y las marca aplicadas (recibo)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("network"));
    const enviadas: OperacionCola[] = [];
    const cola = new ColaSync("deltaops", async (ops) => { enviadas.push(...ops); return reciboOk(ops); }, localStorage, "preventivo");
    await crearPrograma(cola, construirInputPrograma(VALORES_PROGRAMA));
    await transicionarPrograma(cola, "p1", "publicar", 1);
    expect(cola.pendientes()).toBe(2);
    vi.restoreAllMocks();

    await cola.procesar();
    expect(enviadas.length).toBe(2);
    expect(cola.pendientes()).toBe(0);
    expect(cola.getSnapshot().every((o) => o.estado === "aplicada")).toBe(true);
  });

  it("un recibo idempotente marca la operación como idempotente (no duplica efectos)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = new ColaSync(
      "deltaops",
      async (ops) => ({ total: ops.length, aplicadas: 0, idempotentes: ops.length, conflictos: 0, reintentables: 0, rechazadas: 0, resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "idempotente" as const })) }),
      localStorage,
      "preventivo",
    );
    await generar(cola, construirInputGenerar(VALORES_GENERAR));
    vi.restoreAllMocks();
    await cola.procesar();
    expect(cola.getSnapshot()[0]!.estado).toBe("idempotente");
  });
});
