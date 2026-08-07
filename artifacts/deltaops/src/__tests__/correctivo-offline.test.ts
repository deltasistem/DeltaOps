/**
 * DGP-015 · Offline First del Correctivo: aislamiento de cola por módulo con el
 * namespace `deltaops:correctivo:cola:<tenant>`, acuñado de id/opId (UUID) de
 * cliente para el replay idempotente, degradación SÓLO ante errores de red (los
 * de negocio propagan) y sincronización con recibos por `/sync`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearSolicitud, editarSolicitud, transicionarSolicitud, transicionarIntervencion,
  generarOrden, reservarRepuestos, consumirRepuesto, registrarEventoActivo,
} from "../lib/correctivo/mutaciones";
import { construirInputSolicitud, construirInputEventoActivo } from "../lib/correctivo/alta";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}

const VALORES_SOLICITUD = { titulo: "Falla bomba", origen: "operador", activoId: "act-1" };
const LINEA = { inventarioId: "inv-1", articuloId: "art-1", cantidad: 2, unidad: "u" };

const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "correctivo");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("cola offline del correctivo · aislamiento y namespace", () => {
  beforeEach(() => localStorage.clear());

  it("persiste con el namespace del módulo `deltaops:correctivo:cola:deltaops`", () => {
    const c = nuevaCola();
    c.encolar({ comando: "modulo.correctivo.crear-solicitud", input: {}, descripcion: "c" });
    expect(localStorage.getItem("deltaops:correctivo:cola:deltaops")).toBeTruthy();
    expect(localStorage.getItem("deltaops:preventivo:cola:deltaops")).toBeNull();
    expect(localStorage.getItem("deltaops:planes:cola:deltaops")).toBeNull();
  });

  it("aísla la cola de correctivo de la de otros módulos", () => {
    const preventivo = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "preventivo");
    preventivo.encolar({ comando: "modulo.preventivo.crear-programa", input: {}, descripcion: "p" });
    expect(nuevaCola().getSnapshot().length).toBe(0);
  });

  it("aísla por tenant (otro tenant no ve la cola)", () => {
    const t1 = nuevaCola();
    t1.encolar({ comando: "modulo.correctivo.crear-solicitud", input: {}, descripcion: "c" });
    const t2 = new ColaSync("otro", async () => reciboOk([]), localStorage, "correctivo");
    expect(t2.getSnapshot().length).toBe(0);
  });
});

describe("mutaciones del correctivo · degradación offline", () => {
  beforeEach(() => localStorage.clear());

  it("crear solicitud online NO encola y devuelve resultado", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "S-1" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await crearSolicitud(cola, construirInputSolicitud(VALORES_SOLICITUD));
    expect(r.encolada).toBe(false);
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("crear solicitud offline ENCOLA con id y opId (UUID) para replay idempotente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await crearSolicitud(cola, construirInputSolicitud(VALORES_SOLICITUD));
    expect(r.encolada).toBe(true);
    expect(cola.pendientes()).toBe(1);
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    expect(String(input.opId)).toMatch(UUID);
    vi.restoreAllMocks();
  });

  it("generar OT offline acuña opId estable (mismo en sobre e input)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("network"));
    const cola = nuevaCola();
    await generarOrden(cola, "sol-1", {});
    for (const op of cola.getSnapshot()) {
      expect((op.input as Record<string, unknown>).opId).toBe(op.opId);
    }
    vi.restoreAllMocks();
  });

  it("evento de activo offline: el opId inyectado en el input coincide con el sobre", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await registrarEventoActivo(cola, construirInputEventoActivo({ tipo: "falla-reportada" }, "act-1"));
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.correctivo.registrar-evento-activo");
    expect((op.input as Record<string, unknown>).opId).toBe(op.opId);
    vi.restoreAllMocks();
  });

  it("transición de solicitud offline ENCOLA conservando su acción real", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarSolicitud(cola, "sol-1", "aprobar");
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.correctivo.transicionar-solicitud");
    expect((op.input as Record<string, unknown>).accion).toBe("aprobar");
    vi.restoreAllMocks();
  });

  it("transición de intervención offline ENCOLA conservando su acción real", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarIntervencion(cola, "int-1", "iniciarEjecucion");
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.correctivo.transicionar-intervencion");
    expect((op.input as Record<string, unknown>).accion).toBe("iniciarEjecucion");
    vi.restoreAllMocks();
  });

  it("reservar/consumir repuestos offline ENCOLAN con su intervención", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("network"));
    const cola = nuevaCola();
    await reservarRepuestos(cola, "int-1", [LINEA]);
    await consumirRepuesto(cola, "int-1", LINEA);
    const [a, b] = cola.getSnapshot();
    expect(a!.comando).toBe("modulo.correctivo.reservar-repuestos");
    expect(b!.comando).toBe("modulo.correctivo.consumir-repuesto");
    expect((a!.input as Record<string, unknown>).intervencionId).toBe("int-1");
    expect((b!.input as Record<string, unknown>).linea).toEqual(LINEA);
    vi.restoreAllMocks();
  });

  it("un error de negocio (409, no de red) NO encola y propaga el error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: "conflicto de versión" }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await editarSolicitud(cola, "sol-1", { titulo: "x" });
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
    const cola = new ColaSync("deltaops", async (ops) => { enviadas.push(...ops); return reciboOk(ops); }, localStorage, "correctivo");
    await crearSolicitud(cola, construirInputSolicitud(VALORES_SOLICITUD));
    await transicionarSolicitud(cola, "sol-1", "aprobar");
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
      "correctivo",
    );
    await generarOrden(cola, "sol-1", {});
    vi.restoreAllMocks();
    await cola.procesar();
    expect(cola.getSnapshot()[0]!.estado).toBe("idempotente");
  });
});
