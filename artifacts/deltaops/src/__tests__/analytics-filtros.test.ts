/**
 * DGP-016 · Filtros globales reutilizables — serialización ruta↔filtro (deep
 * links), traducción al contrato y combinación con filtros de widget.
 */
import { describe, it, expect } from "vitest";
import {
  leerFiltrosDeUrl,
  escribirFiltrosEnUrl,
  contarFiltros,
  aFiltrosContrato,
  combinarFiltros,
  type FiltrosGlobales,
} from "../lib/analytics/filtros";

describe("filtros globales · URL round-trip", () => {
  it("lee dimensiones canónicas de la querystring (ignora vacías/ajenas)", () => {
    const f = leerFiltrosDeUrl("?activo=A1&estado=abierta&otro=x&categoria=");
    expect(f).toEqual({ activo: "A1", estado: "abierta" });
  });

  it("serializa en orden canónico y preserva parámetros ajenos", () => {
    const q = escribirFiltrosEnUrl({ estado: "abierta", activo: "A1" }, "?tab=widgets");
    // Orden canónico: activo antes que estado; tab preservado.
    expect(q).toContain("tab=widgets");
    expect(q.indexOf("activo=A1")).toBeLessThan(q.indexOf("estado=abierta"));
  });

  it("round-trip: leer(escribir(x)) === x", () => {
    const x: FiltrosGlobales = { activo: "A1", bodega: "B2", prioridad: "alta" };
    expect(leerFiltrosDeUrl(escribirFiltrosEnUrl(x))).toEqual(x);
  });

  it("escribir vacío produce cadena vacía", () => {
    expect(escribirFiltrosEnUrl({})).toBe("");
  });

  it("contarFiltros cuenta dimensiones con valor", () => {
    expect(contarFiltros({})).toBe(0);
    expect(contarFiltros({ activo: "A1", estado: "abierta" })).toBe(2);
  });
});

describe("filtros globales · traducción al contrato", () => {
  it("dimensiones simples usan igualdad (eq) con campo homónimo", () => {
    const out = aFiltrosContrato({ activo: "A1", estado: "abierta" });
    expect(out).toEqual([
      { dimension: "activo", campo: "activo", operador: "eq", valor: "A1" },
      { dimension: "estado", campo: "estado", operador: "eq", valor: "abierta" },
    ]);
  });

  it("fecha se traduce a límite inferior (gte) sobre campo fecha", () => {
    expect(aFiltrosContrato({ fecha: "2024-01-01" })).toEqual([
      { dimension: "fecha", campo: "fecha", operador: "gte", valor: "2024-01-01" },
    ]);
  });

  it("rango 'desde|hasta' se parte en gte + lte", () => {
    expect(aFiltrosContrato({ rango: "2024-01-01|2024-01-31" })).toEqual([
      { dimension: "fecha", campo: "fecha", operador: "gte", valor: "2024-01-01" },
      { dimension: "fecha", campo: "fecha", operador: "lte", valor: "2024-01-31" },
    ]);
  });

  it("rango con un solo extremo emite un único filtro", () => {
    expect(aFiltrosContrato({ rango: "2024-01-01|" })).toHaveLength(1);
    expect(aFiltrosContrato({ rango: "|2024-01-31" })).toHaveLength(1);
  });
});

describe("filtros globales · combinación con widget", () => {
  it("antepone filtros del widget y añade los globales traducidos", () => {
    const widget = [{ dimension: "tipo", campo: "tipo", operador: "eq", valor: "correctivo" }];
    const combinados = combinarFiltros({ activo: "A1" }, widget);
    expect(combinados).toEqual([
      { dimension: "tipo", campo: "tipo", operador: "eq", valor: "correctivo" },
      { dimension: "activo", campo: "activo", operador: "eq", valor: "A1" },
    ]);
  });

  it("sin globales devuelve sólo los del widget", () => {
    const widget = [{ dimension: "tipo", campo: "tipo", operador: "eq", valor: "x" }];
    expect(combinarFiltros({}, widget)).toEqual(widget);
  });
});
