/** DGP-012 · Pruebas del MOTOR de FRECUENCIAS (puro/determinista, sin reloj). */
import { describe, expect, it } from "vitest";
import { crearFrecuencia, type Frecuencia } from "../domain/value-objects";
import {
  evaluarFrecuencia,
  type AnclajeFrecuencia,
  type ContextoEvaluacion,
} from "../domain/frecuencia-engine";

function frec(input: unknown): Frecuencia {
  const r = crearFrecuencia(input);
  if (!r.ok) throw new Error("frecuencia inválida en test");
  return r.value;
}

const ancla = (desde: string, medidoresBase: Record<string, number> = {}, eventosBase: Record<string, number> = {}): AnclajeFrecuencia => ({
  desde, medidoresBase, eventosBase,
});
const ctx = (ahora: string, medidores: Record<string, number> = {}, eventos: Record<string, number> = {}): ContextoEvaluacion => ({
  ahora, medidores, eventos,
});

describe("Reglas temporales", () => {
  it("no vence antes de cumplir el intervalo (días)", () => {
    const r = evaluarFrecuencia(frec({ reglas: [{ tipo: "dias", cada: 30 }] }), ancla("2024-01-01T00:00:00.000Z"), ctx("2024-01-15T00:00:00.000Z"));
    expect(r.vencida).toBe(false);
  });
  it("vence justo al alcanzar la meta (días)", () => {
    const r = evaluarFrecuencia(frec({ reglas: [{ tipo: "dias", cada: 30 }] }), ancla("2024-01-01T00:00:00.000Z"), ctx("2024-01-31T00:00:00.000Z"));
    expect(r.vencida).toBe(true);
  });
  it("meses ajusta fin de mes (31 ene + 1 mes → 29 feb en año bisiesto)", () => {
    const r = evaluarFrecuencia(frec({ reglas: [{ tipo: "meses", cada: 1 }] }), ancla("2024-01-31T00:00:00.000Z"), ctx("2024-02-28T00:00:00.000Z"));
    expect(r.disparadora?.proximaMeta.slice(0, 10)).toBe("2024-02-29");
    expect(r.vencida).toBe(false);
  });
  it("años equivale a 12 meses", () => {
    const r = evaluarFrecuencia(frec({ reglas: [{ tipo: "anios", cada: 1 }] }), ancla("2023-05-10T00:00:00.000Z"), ctx("2024-05-10T00:00:00.000Z"));
    expect(r.vencida).toBe(true);
    expect(r.disparadora?.proximaMeta.slice(0, 10)).toBe("2024-05-10");
  });
});

describe("Reglas de uso (medidor)", () => {
  it("vence al alcanzar la meta de horómetro", () => {
    const f = frec({ reglas: [{ tipo: "horometro", cada: 250, unidad: "horometro" }] });
    const noVence = evaluarFrecuencia(f, ancla("2024-01-01T00:00:00.000Z", { horometro: 1000 }), ctx("2024-06-01T00:00:00.000Z", { horometro: 1200 }));
    expect(noVence.vencida).toBe(false);
    const vence = evaluarFrecuencia(f, ancla("2024-01-01T00:00:00.000Z", { horometro: 1000 }), ctx("2024-06-01T00:00:00.000Z", { horometro: 1260 }));
    expect(vence.vencida).toBe(true);
    expect(vence.disparadora?.proximaMeta).toBe("1250");
  });
  it("sin lectura actual usa la base (no avanza)", () => {
    const f = frec({ reglas: [{ tipo: "odometro", cada: 5000, unidad: "odometro" }] });
    const r = evaluarFrecuencia(f, ancla("2024-01-01T00:00:00.000Z", { odometro: 45000 }), ctx("2024-06-01T00:00:00.000Z"));
    expect(r.vencida).toBe(false);
    expect(r.disparadora?.progreso).toBe(0);
  });
});

describe("Reglas por eventos", () => {
  it("vence al acumular el conteo de eventos", () => {
    const f = frec({ reglas: [{ tipo: "eventos", cada: 3, evento: "arranque-critico" }] });
    const no = evaluarFrecuencia(f, ancla("2024-01-01T00:00:00.000Z", {}, { "arranque-critico": 0 }), ctx("2024-02-01T00:00:00.000Z", {}, { "arranque-critico": 2 }));
    expect(no.vencida).toBe(false);
    const si = evaluarFrecuencia(f, ancla("2024-01-01T00:00:00.000Z", {}, { "arranque-critico": 0 }), ctx("2024-02-01T00:00:00.000Z", {}, { "arranque-critico": 3 }));
    expect(si.vencida).toBe(true);
  });
});

describe("Combinaciones (modos)", () => {
  const compuesta = frec({
    reglas: [{ tipo: "meses", cada: 6 }, { tipo: "horometro", cada: 500, unidad: "horometro" }],
    modo: "lo-que-ocurra-primero",
  });
  it("lo-que-ocurra-primero: vence si CUALQUIERA vence (por medidor)", () => {
    const r = evaluarFrecuencia(compuesta, ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }), ctx("2024-02-01T00:00:00.000Z", { horometro: 600 }));
    expect(r.vencida).toBe(true);
    expect(r.disparadora?.regla.tipo).toBe("horometro");
  });
  it("lo-que-ocurra-primero: vence por tiempo aunque el medidor no llegue", () => {
    const r = evaluarFrecuencia(compuesta, ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }), ctx("2024-07-05T00:00:00.000Z", { horometro: 100 }));
    expect(r.vencida).toBe(true);
    expect(r.disparadora?.regla.tipo).toBe("meses");
  });
  it("modo 'todas': sólo vence si TODAS vencen", () => {
    const todas = frec({
      reglas: [{ tipo: "meses", cada: 6 }, { tipo: "horometro", cada: 500, unidad: "horometro" }],
      modo: "todas",
    });
    const parcial = evaluarFrecuencia(todas, ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }), ctx("2024-07-05T00:00:00.000Z", { horometro: 100 }));
    expect(parcial.vencida).toBe(false);
    const completa = evaluarFrecuencia(todas, ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }), ctx("2024-07-05T00:00:00.000Z", { horometro: 600 }));
    expect(completa.vencida).toBe(true);
  });
  it("modo 'cualquiera' se comporta como lo-que-ocurra-primero", () => {
    const cualquiera = frec({
      reglas: [{ tipo: "meses", cada: 6 }, { tipo: "horometro", cada: 500, unidad: "horometro" }],
      modo: "cualquiera",
    });
    const r = evaluarFrecuencia(cualquiera, ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }), ctx("2024-02-01T00:00:00.000Z", { horometro: 600 }));
    expect(r.vencida).toBe(true);
  });
});

describe("Determinismo", () => {
  it("dos evaluaciones idénticas producen el mismo resultado", () => {
    const f = frec({ reglas: [{ tipo: "dias", cada: 7 }] });
    const a = evaluarFrecuencia(f, ancla("2024-01-01T00:00:00.000Z"), ctx("2024-01-09T00:00:00.000Z"));
    const b = evaluarFrecuencia(f, ancla("2024-01-01T00:00:00.000Z"), ctx("2024-01-09T00:00:00.000Z"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
