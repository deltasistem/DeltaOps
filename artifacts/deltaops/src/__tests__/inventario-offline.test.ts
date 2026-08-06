/**
 * DGP-011.3 · Offline First de Inventario: aislamiento de cola por módulo,
 * persistencia con el namespace `deltaops:inventario:cola:<tenant>`, acuñado de
 * id de cliente para la creación y replay idempotente por `/sync`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearItem,
  transferir,
  mover,
  cerrarConteo,
} from "../lib/inventario/mutaciones";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "inventario");

describe("cola offline de inventario", () => {
  beforeEach(() => localStorage.clear());

  it("persiste con el namespace del módulo y no colisiona con otros dominios", () => {
    const inv = nuevaCola();
    inv.encolar({ comando: "modulo.inventario.mover", input: {}, descripcion: "m" });
    expect(localStorage.getItem("deltaops:inventario:cola:deltaops")).toBeTruthy();
    expect(localStorage.getItem("deltaops:ordenes:cola:deltaops")).toBeNull();
    expect(localStorage.getItem("deltaops:activos:cola:deltaops")).toBeNull();
  });

  it("aísla la cola de inventario de la de otros módulos", () => {
    const activos = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "activos");
    activos.encolar({ comando: "modulo.activos.crear", input: {}, descripcion: "a" });
    const inv = nuevaCola();
    expect(inv.getSnapshot().length).toBe(0);
  });
});

describe("mutaciones de inventario · degradación offline", () => {
  beforeEach(() => localStorage.clear());

  it("crear item online no encola y devuelve resultado", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "I-1" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await crearItem(cola, { sku: "S", nombre: "N", tipoItem: "t", modoTrazabilidad: "ninguna", unidadBase: { clave: "u" } });
    expect(r.encolada).toBe(false);
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("crear item offline ENCOLA con id de cliente acuñado (idempotencia de replay)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await crearItem(cola, { sku: "S", nombre: "N", tipoItem: "t", modoTrazabilidad: "ninguna", unidadBase: { clave: "u" } });
    expect(r.encolada).toBe(true);
    expect(cola.pendientes()).toBe(1);
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    expect(input.opId).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("transferir offline acuña id de cabecera para el replay", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transferir(cola, { origen: { bodegaId: "b1", ubicacionId: "u1" }, destino: { bodegaId: "b2", ubicacionId: "u2" }, lineas: [{ itemId: "i1", cantidad: 1 }] });
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("un error de negocio (no de red) NO encola y propaga el error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ mensaje: "conflicto" }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await mover(cola, { itemId: "i1", bodegaId: "b1", ubicacionId: "u1", tipo: "entrada", cantidad: 1 });
    expect(r.encolada).toBe(false);
    expect(r.error).toBeTruthy();
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("cerrar conteo offline conserva la decisión explícita (aplicarDiferencias)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await cerrarConteo(cola, "c1", 2, false);
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.aplicarDiferencias).toBe(false);
    expect(input.aprobado).toBeUndefined();
    expect(input.opId).toBeTruthy();
    vi.restoreAllMocks();
  });
});
