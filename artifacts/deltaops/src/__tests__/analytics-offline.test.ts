/**
 * DGP-016 · Offline First de Analytics: caché por tenant con timestamp,
 * namespace `deltaops:analytics:cache:<tenant>`, snapshot ENCOLABLE por /sync con
 * opId de cliente y degradación SÓLO ante errores de red (negocio propaga).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import { CacheAnalytics, claveEvaluacion, claveDashboard } from "../lib/analytics/cache";
import { CACHE_NAMESPACE } from "../lib/analytics/constantes";
import { materializarSnapshot } from "../lib/analytics/mutaciones";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "analytics");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("CacheAnalytics · namespace y timestamp por tenant", () => {
  beforeEach(() => localStorage.clear());

  it("persiste bajo el namespace del tenant", () => {
    const c = new CacheAnalytics("deltaops", () => "2024-01-01T00:00:00.000Z");
    c.guardar(claveDashboard("ejecutivo"), { nombre: "Ejecutivo" });
    expect(localStorage.getItem(`${CACHE_NAMESPACE}:deltaops`)).toBeTruthy();
    expect(localStorage.getItem(`${CACHE_NAMESPACE}:otro`)).toBeNull();
  });

  it("guarda dato + timestamp y lo recupera", () => {
    const c = new CacheAnalytics("deltaops", () => "2024-05-06T10:00:00.000Z");
    c.guardar(claveEvaluacion("mttr", []), { valor: 42 });
    const leido = c.leer<{ valor: number }>(claveEvaluacion("mttr", []));
    expect(leido).not.toBeNull();
    expect(leido!.dato.valor).toBe(42);
    expect(leido!.guardadoEn).toBe("2024-05-06T10:00:00.000Z");
  });

  it("NO inventa datos: sin caché la lectura es null", () => {
    const c = new CacheAnalytics("deltaops");
    expect(c.leer("inexistente")).toBeNull();
  });

  it("aísla por tenant", () => {
    new CacheAnalytics("deltaops", () => "t").guardar("k", 1);
    expect(new CacheAnalytics("otro").leer("k")).toBeNull();
  });

  it("claveEvaluacion diferencia por filtros", () => {
    expect(claveEvaluacion("mttr", [])).not.toBe(claveEvaluacion("mttr", [{ dimension: "activo", operador: "eq", valor: "A1" }]));
  });

  it("entradas() lista clave + timestamp; vaciar() limpia", () => {
    const c = new CacheAnalytics("deltaops", () => "2024-01-01T00:00:00.000Z");
    c.guardar("a", 1);
    c.guardar("b", 2);
    expect(c.entradas()).toHaveLength(2);
    expect(c.entradas()[0]).toHaveProperty("guardadoEn");
    c.vaciar();
    expect(c.entradas()).toHaveLength(0);
  });
});

describe("materializarSnapshot · online vs encolado offline", () => {
  beforeEach(() => localStorage.clear());

  it("online: NO encola y devuelve resultado; cuerpo con opId+clave+filtros", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "snap-1" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const cola = nuevaCola();
    const r = await materializarSnapshot(cola, "mttr", { filtros: [{ dimension: "activo", campo: "activo", operador: "eq", valor: "A1" }] });
    expect(r.encolada).toBe(false);
    expect(cola.getSnapshot()).toHaveLength(0);
    const [, init] = spy.mock.calls[0]!;
    const cuerpo = JSON.parse((init as RequestInit).body as string);
    expect(cuerpo.clave).toBe("mttr");
    expect(cuerpo.opId).toMatch(UUID);
    expect(cuerpo.filtros).toHaveLength(1);
    spy.mockRestore();
  });

  it("offline (fallo de red): ENCOLA con comando y opId idempotente", async () => {
    const spy = vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    const r = await materializarSnapshot(cola, "mttr");
    expect(r.encolada).toBe(true);
    const ops = cola.getSnapshot();
    expect(ops).toHaveLength(1);
    expect(ops[0]!.comando).toBe("modulo.analytics.materializar-snapshot");
    expect(ops[0]!.opId).toMatch(UUID);
    // La cola inyecta el opId en el input para replay idempotente por /sync.
    expect((ops[0]!.input as { opId?: string }).opId).toBe(ops[0]!.opId);
    spy.mockRestore();
  });

  it("error de NEGOCIO (no red) propaga y NO encola", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "no autorizado", code: "KRN-AUTH" }), { status: 403, headers: { "Content-Type": "application/json" } }),
    );
    const cola = nuevaCola();
    const r = await materializarSnapshot(cola, "mttr");
    expect(r.encolada).toBe(false);
    expect(r.error).toBeInstanceOf(Error);
    expect(cola.getSnapshot()).toHaveLength(0);
    spy.mockRestore();
  });
});
