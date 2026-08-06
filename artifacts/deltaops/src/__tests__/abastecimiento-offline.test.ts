/**
 * DGP-013 · Offline First de Abastecimiento: aislamiento de cola por módulo con
 * el namespace `deltaops:abastecimiento:cola:<tenant>`, acuñado de id/opId (UUID)
 * de cliente para el replay idempotente, degradación SÓLO ante errores de red
 * (los de negocio propagan) y sincronización con recibos por `/sync`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearArticulo,
  crearProveedor,
  crearSolicitud,
  transicionarSolicitud,
  transicionarOrdenCompra,
  registrarRecepcion,
  materializarRecepcion,
} from "../lib/abastecimiento/mutaciones";
import {
  construirInputArticulo, construirInputProveedor, construirInputSolicitud, construirInputRecepcion,
} from "../lib/abastecimiento/alta";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}

const VALORES_ARTICULO = { nombre: "Rodamiento", tipo: "componente", unidad: "unidad", metodoValoracion: "promedio", moneda: "USD" };
const VALORES_PROVEEDOR = { razonSocial: "Prov", tipo: "distribuidor" };
const VALORES_SOLICITUD = {
  titulo: "Reposición", prioridad: "alta", origenTipo: "inventario",
  lineas: [{ descripcion: "Rodamiento", cantidad: 5, unidad: "unidad" }],
};
const VALORES_RECEPCION = { lineas: [{ numeroLineaOC: 1, cantidad: 3, unidad: "unidad" }] };

const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "abastecimiento");

describe("cola offline de abastecimiento · aislamiento y namespace", () => {
  beforeEach(() => localStorage.clear());

  it("persiste con el namespace del módulo `deltaops:abastecimiento:cola:deltaops`", () => {
    const c = nuevaCola();
    c.encolar({ comando: "modulo.abastecimiento.crear-articulo", input: {}, descripcion: "c" });
    expect(localStorage.getItem("deltaops:abastecimiento:cola:deltaops")).toBeTruthy();
    expect(localStorage.getItem("deltaops:planes:cola:deltaops")).toBeNull();
    expect(localStorage.getItem("deltaops:inventario:cola:deltaops")).toBeNull();
    expect(localStorage.getItem("deltaops:ordenes:cola:deltaops")).toBeNull();
  });

  it("aísla la cola de abastecimiento de la de otros módulos", () => {
    const planes = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "planes");
    planes.encolar({ comando: "modulo.planes.crear-plan", input: {}, descripcion: "p" });
    expect(nuevaCola().getSnapshot().length).toBe(0);
  });

  it("aísla por tenant (otro tenant no ve la cola)", () => {
    const t1 = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "abastecimiento");
    t1.encolar({ comando: "modulo.abastecimiento.crear-articulo", input: {}, descripcion: "c" });
    const t2 = new ColaSync("otro", async () => reciboOk([]), localStorage, "abastecimiento");
    expect(t2.getSnapshot().length).toBe(0);
  });
});

describe("mutaciones de abastecimiento · degradación offline", () => {
  beforeEach(() => localStorage.clear());

  it("crear artículo online no encola y devuelve resultado", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "A-1" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await crearArticulo(cola, construirInputArticulo(VALORES_ARTICULO));
    expect(r.encolada).toBe(false);
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("crear artículo offline ENCOLA con id y opId (UUID) para replay idempotente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await crearArticulo(cola, construirInputArticulo(VALORES_ARTICULO));
    expect(r.encolada).toBe(true);
    expect(cola.pendientes()).toBe(1);
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    expect(String(input.opId)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    vi.restoreAllMocks();
  });

  it("crear proveedor y solicitud offline acuñan id de cabecera", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("network"));
    const cola = nuevaCola();
    await crearProveedor(cola, construirInputProveedor(VALORES_PROVEEDOR));
    await crearSolicitud(cola, construirInputSolicitud(VALORES_SOLICITUD));
    const inputs = cola.getSnapshot().map((o) => o.input as Record<string, unknown>);
    expect(inputs.every((i) => Boolean(i.id) && Boolean(i.opId))).toBe(true);
    vi.restoreAllMocks();
  });

  it("transición de solicitud offline ENCOLA conservando su acción real y el motivo de rechazo", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarSolicitud(cola, "sol-1", "rechazar", 2, { motivoRechazo: "precio alto" });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.abastecimiento.transicionar-solicitud");
    const input = op.input as Record<string, unknown>;
    expect(input.accion).toBe("rechazar");
    expect(input.motivoRechazo).toBe("precio alto");
    vi.restoreAllMocks();
  });

  it("transición de OC offline ENCOLA su acción real (sin motivo)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarOrdenCompra(cola, "oc-1", "aprobar", 1);
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.abastecimiento.transicionar-orden-compra");
    expect((op.input as Record<string, unknown>).accion).toBe("aprobar");
    vi.restoreAllMocks();
  });

  it("un error de negocio (409, no de red) NO encola y propaga el error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ mensaje: "conflicto de versión" }), { status: 409, headers: { "Content-Type": "application/json" } }));
    const cola = nuevaCola();
    const r = await transicionarOrdenCompra(cola, "oc-1", "aprobar", 1);
    expect(r.encolada).toBe(false);
    expect(r.error).toBeTruthy();
    expect(cola.pendientes()).toBe(0);
    vi.restoreAllMocks();
  });

  it("materializar recepción offline ENCOLA con opId estable (mismo en sobre e input)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await materializarRecepcion(cola, "rec-1");
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.abastecimiento.materializar-recepcion");
    expect((op.input as Record<string, unknown>).opId).toBe(op.opId);
    vi.restoreAllMocks();
  });

  it("registrar recepción offline acuña id/opId y descarta líneas vacías", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await registrarRecepcion(cola, construirInputRecepcion(VALORES_RECEPCION, "oc-1", 2));
    const input = cola.getSnapshot()[0]!.input as Record<string, unknown>;
    expect(input.id).toBeTruthy();
    expect(input.opId).toBeTruthy();
    expect((input.lineas as unknown[]).length).toBe(1);
    vi.restoreAllMocks();
  });
});

describe("sincronización por /sync · recibos y replay", () => {
  beforeEach(() => localStorage.clear());

  it("procesar la cola aplica las operaciones y las marca aplicadas (recibo)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("network"));
    const enviadas: OperacionCola[] = [];
    const cola = new ColaSync("deltaops", async (ops) => { enviadas.push(...ops); return reciboOk(ops); }, localStorage, "abastecimiento");
    await crearArticulo(cola, construirInputArticulo(VALORES_ARTICULO));
    await transicionarSolicitud(cola, "sol-1", "aprobar", 1);
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
      "abastecimiento",
    );
    await materializarRecepcion(cola, "rec-1");
    vi.restoreAllMocks();
    await cola.procesar();
    expect(cola.getSnapshot()[0]!.estado).toBe("idempotente");
  });
});
