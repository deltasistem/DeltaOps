/**
 * DGP-016 · Pruebas de CONTRATO frontend ↔ API Analytics.
 *
 * El módulo analytics NO publica un OpenAPI congelado; la fuente de verdad son
 * los esquemas de comando de `lib/module-analytics/src/module.ts` y las rutas de
 * `api-server/.../analytics-module.ts`. Estas pruebas verifican que los cuerpos
 * que construyen las mutaciones del frontend cumplen esos esquemas: campos
 * requeridos, tipos, `expectedVersion` (OCC) y forma de widget. Se validan tanto
 * el envío directo (online) como la operación ENCOLADA (offline, /sync).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearDashboard,
  actualizarDashboard,
  clonarDashboard,
  eliminarDashboard,
  materializarSnapshot,
  construirWidget,
  type EntradaWidget,
} from "../lib/analytics/mutaciones";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return { total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0, reintentables: 0, rechazadas: 0, resultados: [] };
}
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "analytics");

function okResponse(body: unknown = { id: "x", version: 1 }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
function cuerpoDeFetch(spy: ReturnType<typeof vi.spyOn>): any {
  const [, init] = spy.mock.calls[0]! as [string, RequestInit];
  return JSON.parse(init.body as string);
}
function urlDeFetch(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls[0]![0] as string;
}

const WIDGET_VALIDO: EntradaWidget = {
  tipo: "card",
  titulo: "Disponibilidad",
  indicadorClave: "disponibilidad",
  filtros: [{ dimension: "activo", campo: "activo", operador: "eq", valor: "A1" }],
  presentacion: { periodo: "2024-Q1" },
};

const TIPOS_WIDGET_CONTRATO = new Set([
  "card", "line", "bar", "area", "pie", "donut", "gauge", "table", "heatmap", "timeline", "calendar", "ranking", "comparativo",
]);

describe("construirWidget · forma de widget del contrato", () => {
  it("emite tipo/titulo/indicadorClave/filtros/presentacion/posicion", () => {
    const w = construirWidget(WIDGET_VALIDO, 3);
    expect(w.tipo).toBe("card");
    expect(TIPOS_WIDGET_CONTRATO.has(w.tipo as string)).toBe(true);
    expect(w.titulo).toBe("Disponibilidad");
    expect(w.indicadorClave).toBe("disponibilidad");
    expect(Array.isArray(w.filtros)).toBe(true);
    expect(typeof w.presentacion).toBe("object");
    expect(w.posicion).toBe(3);
    // Cada filtro cumple {dimension, operador} (campo/valor opcionales).
    for (const f of w.filtros as any[]) {
      expect(typeof f.dimension).toBe("string");
      expect(typeof f.operador).toBe("string");
    }
  });

  it("ranking sólo se incluye cuando se define (topN/bottomN + n>0)", () => {
    const sin = construirWidget(WIDGET_VALIDO, 0);
    expect(sin.ranking).toBeUndefined();
    const con = construirWidget({ ...WIDGET_VALIDO, tipo: "ranking", ranking: { modo: "topN", n: 5 } }, 0);
    expect(con.ranking).toEqual({ modo: "topN", n: 5 });
  });
});

describe("crear-dashboard · POST /dashboards", () => {
  beforeEach(() => localStorage.clear());
  it("acuña id UUID y envía clave/nombre/widgets", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse());
    const r = await crearDashboard({ clave: "personal-1", nombre: "Mío", descripcion: "d", widgets: [WIDGET_VALIDO] });
    expect(r.error).toBeUndefined();
    expect(urlDeFetch(spy)).toContain("/dashboards");
    const cuerpo = cuerpoDeFetch(spy);
    expect(cuerpo.id).toMatch(UUID); // id debe ser UUID (z.string().uuid())
    expect(cuerpo.clave).toBe("personal-1");
    expect(cuerpo.nombre).toBe("Mío");
    expect(cuerpo.descripcion).toBe("d");
    expect(cuerpo.widgets).toHaveLength(1);
    expect(cuerpo.widgets[0].posicion).toBe(0);
    spy.mockRestore();
  });
});

describe("actualizar-dashboard · PUT /dashboards/:id (OCC)", () => {
  it("incluye id + expectedVersion y sólo los cambios definidos", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse());
    await actualizarDashboard("d1", 4, { nombre: "Nuevo", widgets: [WIDGET_VALIDO] });
    expect(urlDeFetch(spy)).toContain("/dashboards/d1");
    const cuerpo = cuerpoDeFetch(spy);
    expect(cuerpo.id).toBe("d1");
    expect(cuerpo.expectedVersion).toBe(4);
    expect(cuerpo.nombre).toBe("Nuevo");
    expect(cuerpo.widgets).toHaveLength(1);
    expect(cuerpo).not.toHaveProperty("descripcion"); // no definido → omitido
    spy.mockRestore();
  });
});

describe("clonar-dashboard · POST /dashboards/:id/clonar", () => {
  it("envía origenId + clave + nombre; la ruta consume :id=origen", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse());
    await clonarDashboard("origen-1", { clave: "personal-2", nombre: "Copia" });
    expect(urlDeFetch(spy)).toContain("/dashboards/origen-1/clonar");
    const cuerpo = cuerpoDeFetch(spy);
    expect(cuerpo.origenId).toBe("origen-1");
    expect(cuerpo.clave).toBe("personal-2");
    expect(cuerpo.nombre).toBe("Copia");
    spy.mockRestore();
  });
});

describe("eliminar-dashboard · DELETE /dashboards/:id (OCC)", () => {
  it("envía expectedVersion", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse({}));
    await eliminarDashboard("d1", 2);
    const [url, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain("/dashboards/d1");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string).expectedVersion).toBe(2);
    spy.mockRestore();
  });
});

describe("materializar-snapshot · comando encolable", () => {
  beforeEach(() => localStorage.clear());
  it("online: cuerpo {opId, clave, filtros}", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(okResponse({ id: "s1" }));
    await materializarSnapshot(nuevaCola(), "mttr", { filtros: [] });
    expect(urlDeFetch(spy)).toContain("/indicadores/mttr/snapshot");
    const cuerpo = cuerpoDeFetch(spy);
    expect(cuerpo.opId).toMatch(UUID);
    expect(cuerpo.clave).toBe("mttr");
    expect(Array.isArray(cuerpo.filtros)).toBe(true);
    spy.mockRestore();
  });

  it("offline: la operación encolada usa el comando calificado del módulo", async () => {
    const spy = vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await materializarSnapshot(cola, "mttr");
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.analytics.materializar-snapshot");
    expect(op.input).toHaveProperty("clave", "mttr");
    expect(op.input).toHaveProperty("opId");
    spy.mockRestore();
  });
});
