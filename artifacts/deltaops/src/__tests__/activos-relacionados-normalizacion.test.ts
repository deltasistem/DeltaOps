/**
 * DGP-019.2 · Regresión de la normalización de `/{id}/relacionados`.
 *
 * Deuda saldada (defecto preexistente DGP-008.x): el read model del backend
 * `activos.relacionados` devuelve un OBJETO `{ id, salientes, entrantes }`, no un
 * arreglo. `TabRelaciones` hacía `datos.map(...)` y, como el `Tabs` del DS monta
 * TODOS los paneles de forma eager, la ficha ENTERA reventaba. `normalizarRelacionados`
 * aplana la respuesta a `Relacion[]` conservando la dirección y deduplicando por id,
 * tolerando además la forma legada (array) y valores nulos/inesperados.
 */
import { describe, it, expect } from "vitest";
import { normalizarRelacionados } from "../lib/activos/hooks";
import type { Relacion } from "../lib/activos/tipos";

function rel(id: string, extra: Partial<Relacion> = {}): Relacion {
  return { id, tipo: "relacionado-con", origenId: "a", destinoId: "b", ...extra } as Relacion;
}

describe("normalizarRelacionados", () => {
  it("aplana la forma REAL del backend {id, salientes, entrantes} conservando dirección", () => {
    const respuesta = {
      id: "act-1",
      salientes: [rel("s1", { origenId: "act-1", destinoId: "hijo" })],
      entrantes: [rel("e1", { origenId: "padre", destinoId: "act-1" })],
    };
    const out = normalizarRelacionados(respuesta);
    expect(Array.isArray(out)).toBe(true);
    expect(out.map((r) => r.id)).toEqual(["s1", "e1"]);
    // La dirección se conserva: cada fila mantiene su origen/destino.
    expect(out[0]).toMatchObject({ origenId: "act-1", destinoId: "hijo" });
    expect(out[1]).toMatchObject({ origenId: "padre", destinoId: "act-1" });
  });

  it("respuesta con salientes/entrantes vacíos → arreglo vacío (no crash)", () => {
    expect(normalizarRelacionados({ id: "act-1", salientes: [], entrantes: [] })).toEqual([]);
  });

  it("deduplica por id cuando una relación aparece en ambos sentidos", () => {
    const r = rel("dup");
    const out = normalizarRelacionados({ id: "x", salientes: [r], entrantes: [r] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("dup");
  });

  it("tolera la forma legada (array directo)", () => {
    const arr = [rel("l1"), rel("l2")];
    expect(normalizarRelacionados(arr)).toEqual(arr);
  });

  it("tolera null/undefined y tipos inesperados devolviendo []", () => {
    expect(normalizarRelacionados(null)).toEqual([]);
    expect(normalizarRelacionados(undefined)).toEqual([]);
    expect(normalizarRelacionados(42 as unknown)).toEqual([]);
    expect(normalizarRelacionados("nope" as unknown)).toEqual([]);
    expect(normalizarRelacionados({ id: "x" })).toEqual([]);
    expect(normalizarRelacionados({ id: "x", salientes: "bad", entrantes: null })).toEqual([]);
  });
});
