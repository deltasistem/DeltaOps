/** DGP-012 · Pruebas de GENERACIÓN de órdenes (decisión pura + idempotencia). */
import { describe, expect, it } from "vitest";
import { crearFrecuencia, type Frecuencia } from "../domain/value-objects";
import { claveDedup, crearGeneracionOrden, decidirGeneracion } from "../domain/generacion";
import type { AnclajeFrecuencia, ContextoEvaluacion } from "../domain/frecuencia-engine";

function frec(input: unknown): Frecuencia {
  const r = crearFrecuencia(input);
  if (!r.ok) throw new Error("frecuencia inválida");
  return r.value;
}
const ancla: AnclajeFrecuencia = { desde: "2024-01-01T00:00:00.000Z", medidoresBase: { horometro: 0 }, eventosBase: {} };

describe("claveDedup", () => {
  it("es determinista y con formato estable", () => {
    const k = claveDedup({ planId: "P1", version: 2, activoId: "A1", ocurrencia: "meses=2024-07-01T00:00:00.000Z" });
    expect(k).toBe("plan:P1:v2:A1:meses=2024-07-01T00:00:00.000Z");
  });
});

describe("decidirGeneracion · manual", () => {
  it("corresponde cuando la ocurrencia manual no existe aún", () => {
    const ctx: ContextoEvaluacion = { ahora: "2024-06-01T00:00:00.000Z", medidores: {}, eventos: {} };
    const d = decidirGeneracion({ planId: "P1", version: 1, activoId: "A1", frecuencia: frec({ reglas: [{ tipo: "dias", cada: 30 }] }), anclaje: ancla, ctx, origen: "manual", generadasPrevias: new Set(), ocurrenciaManual: "orden-adhoc-1" });
    expect(d.corresponde).toBe(true);
    expect(d.claveDedup).toContain("orden-adhoc-1");
  });
  it("NO corresponde si la ocurrencia ya fue generada (idempotencia)", () => {
    const ctx: ContextoEvaluacion = { ahora: "2024-06-01T00:00:00.000Z", medidores: {}, eventos: {} };
    const clave = claveDedup({ planId: "P1", version: 1, activoId: "A1", ocurrencia: "orden-adhoc-1" });
    const d = decidirGeneracion({ planId: "P1", version: 1, activoId: "A1", frecuencia: frec({ reglas: [{ tipo: "dias", cada: 30 }] }), anclaje: ancla, ctx, origen: "manual", generadasPrevias: new Set([clave]), ocurrenciaManual: "orden-adhoc-1" });
    expect(d.corresponde).toBe(false);
  });
});

describe("decidirGeneracion · por frecuencia", () => {
  it("no corresponde si la frecuencia no venció", () => {
    const ctx: ContextoEvaluacion = { ahora: "2024-01-10T00:00:00.000Z", medidores: {}, eventos: {} };
    const d = decidirGeneracion({ planId: "P1", version: 1, activoId: "A1", frecuencia: frec({ reglas: [{ tipo: "dias", cada: 30 }] }), anclaje: ancla, ctx, origen: "frecuencia", generadasPrevias: new Set() });
    expect(d.corresponde).toBe(false);
  });
  it("corresponde cuando la frecuencia venció y no está previamente generada", () => {
    const ctx: ContextoEvaluacion = { ahora: "2024-02-01T00:00:00.000Z", medidores: {}, eventos: {} };
    const d = decidirGeneracion({ planId: "P1", version: 1, activoId: "A1", frecuencia: frec({ reglas: [{ tipo: "dias", cada: 30 }] }), anclaje: ancla, ctx, origen: "frecuencia", generadasPrevias: new Set() });
    expect(d.corresponde).toBe(true);
  });
  it("es idempotente: la MISMA ocurrencia no se regenera", () => {
    const ctx: ContextoEvaluacion = { ahora: "2024-02-01T00:00:00.000Z", medidores: {}, eventos: {} };
    const primero = decidirGeneracion({ planId: "P1", version: 1, activoId: "A1", frecuencia: frec({ reglas: [{ tipo: "dias", cada: 30 }] }), anclaje: ancla, ctx, origen: "frecuencia", generadasPrevias: new Set() });
    expect(primero.corresponde).toBe(true);
    const segundo = decidirGeneracion({ planId: "P1", version: 1, activoId: "A1", frecuencia: frec({ reglas: [{ tipo: "dias", cada: 30 }] }), anclaje: ancla, ctx, origen: "frecuencia", generadasPrevias: new Set([primero.claveDedup]) });
    expect(segundo.corresponde).toBe(false);
    expect(segundo.claveDedup).toBe(primero.claveDedup);
  });
});

describe("crearGeneracionOrden", () => {
  it("valida coherencia de la clave de dedup", () => {
    const buena = crearGeneracionOrden({
      id: "g1", tenantId: "t", planId: "P1", version: 1, activoId: "A1", ocurrencia: "orden-x",
      claveDedup: claveDedup({ planId: "P1", version: 1, activoId: "A1", ocurrencia: "orden-x" }),
      origen: "manual", fechaObjetivo: "2024-06-01T00:00:00.000Z", generadaEn: "2024-06-01T00:00:00.000Z", generadaPor: "u1",
    });
    expect(buena.ok).toBe(true);
    const mala = crearGeneracionOrden({
      id: "g2", tenantId: "t", planId: "P1", version: 1, activoId: "A1", ocurrencia: "orden-x",
      claveDedup: "plan:MAL", origen: "manual", fechaObjetivo: "2024-06-01T00:00:00.000Z", generadaEn: "2024-06-01T00:00:00.000Z", generadaPor: "u1",
    });
    expect(mala.ok).toBe(false);
  });
});
