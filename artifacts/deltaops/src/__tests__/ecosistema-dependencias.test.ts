/**
 * DGP-010 · Pruebas de la lógica de dependencias OT↔OT (punto 7).
 * Clasificación bloqueante/dependiente/relacionada, impacto, secuencia y la
 * alerta «lista pero bloqueada». Lógica pura.
 */
import { describe, it, expect } from "vitest";
import { analizarDependencias, secuenciaEjecucion } from "../lib/ecosistema/dependencias";
import type { RelacionOrden, OrdenRow } from "../lib/ordenes/tipos";

function rel(p: Partial<RelacionOrden> & { id: string; tipo: string; destinoId: string }): RelacionOrden {
  return { categoria: "orden", ordenId: "O", destinoCodigo: null, destinoNombre: null, ...p };
}

describe("analizarDependencias", () => {
  it("clasifica bloqueantes, dependientes y relacionadas", () => {
    const a = analizarDependencias([
      rel({ id: "1", tipo: "bloqueada-por", destinoId: "X", destinoCodigo: "OT-X" }),
      rel({ id: "2", tipo: "bloquea", destinoId: "Y", destinoCodigo: "OT-Y" }),
      rel({ id: "3", tipo: "relacionada", destinoId: "Z" }),
    ]);
    expect(a.bloqueantes).toHaveLength(1);
    expect(a.dependientes).toHaveLength(1);
    expect(a.relacionadas).toHaveLength(1);
    expect(a.bloqueada).toBe(true);
    expect(a.impacto).toEqual(["Y"]);
  });

  it("marca «lista pero bloqueada» sólo en estados ejecutables", () => {
    const deps = [rel({ id: "1", tipo: "depende-de", destinoId: "X" })];
    const abierta = analizarDependencias(deps, { estado: "ABIERTA" } as OrdenRow);
    expect(abierta.listaPeroBloqueada).toBe(true);
    const cerrada = analizarDependencias(deps, { estado: "CERRADA" } as OrdenRow);
    expect(cerrada.listaPeroBloqueada).toBe(false);
  });

  it("no bloquea cuando sólo hay relaciones neutras", () => {
    const a = analizarDependencias([rel({ id: "1", tipo: "relacionada", destinoId: "Z" })], { estado: "ABIERTA" } as OrdenRow);
    expect(a.bloqueada).toBe(false);
    expect(a.listaPeroBloqueada).toBe(false);
  });

  it("tolera entrada vacía o nula", () => {
    expect(analizarDependencias(null).bloqueantes).toEqual([]);
    expect(analizarDependencias(undefined).bloqueada).toBe(false);
  });
});

describe("secuenciaEjecucion", () => {
  it("ordena predecesoras → actual → sucesoras", () => {
    const a = analizarDependencias([
      rel({ id: "1", tipo: "bloqueada-por", destinoId: "P", destinoCodigo: "OT-P" }),
      rel({ id: "2", tipo: "bloquea", destinoId: "S", destinoCodigo: "OT-S" }),
    ]);
    const seq = secuenciaEjecucion(a, { id: "M", codigo: "OT-M" });
    expect(seq.map((s) => s.rol)).toEqual(["predecesora", "actual", "sucesora"]);
    expect(seq.map((s) => s.etiqueta)).toEqual(["OT-P", "OT-M", "OT-S"]);
  });
});
