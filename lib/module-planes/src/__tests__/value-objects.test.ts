/** DGP-012 · Pruebas de VALUE OBJECTS del dominio de planes. */
import { describe, expect, it } from "vitest";
import {
  alcanceIncluye,
  crearAlcanceActivos,
  crearCodigoPlan,
  crearDuracion,
  crearFrecuencia,
  crearLecturaMedidor,
  crearReferenciaExterna,
} from "../domain/value-objects";

describe("CodigoPlan", () => {
  it("acepta un código bien formado", () => {
    const r = crearCodigoPlan({ valor: "PLN-00001", prefijo: "PLN", secuencia: 1 });
    expect(r.ok).toBe(true);
  });
  it("rechaza secuencia no positiva", () => {
    const r = crearCodigoPlan({ valor: "PLN-0", prefijo: "PLN", secuencia: 0 });
    expect(r.ok).toBe(false);
  });
});

describe("LecturaMedidor", () => {
  it("acepta lectura no negativa", () => {
    const r = crearLecturaMedidor({ unidad: "horometro", valor: 1200, tomadaEn: "2024-01-01T00:00:00.000Z" });
    expect(r.ok).toBe(true);
  });
  it("rechaza valor negativo", () => {
    const r = crearLecturaMedidor({ unidad: "horometro", valor: -1, tomadaEn: "2024-01-01T00:00:00.000Z" });
    expect(r.ok).toBe(false);
  });
  it("rechaza fecha no ISO", () => {
    const r = crearLecturaMedidor({ unidad: "horometro", valor: 10, tomadaEn: "no-es-fecha" });
    expect(r.ok).toBe(false);
  });
});

describe("Frecuencia", () => {
  it("acepta regla temporal", () => {
    const r = crearFrecuencia({ reglas: [{ tipo: "meses", cada: 3 }] });
    expect(r.ok).toBe(true);
  });
  it("exige unidad en reglas de uso", () => {
    const r = crearFrecuencia({ reglas: [{ tipo: "horometro", cada: 250 }] });
    expect(r.ok).toBe(false);
  });
  it("acepta regla de uso con unidad", () => {
    const r = crearFrecuencia({ reglas: [{ tipo: "horometro", cada: 250, unidad: "horometro" }] });
    expect(r.ok).toBe(true);
  });
  it("exige clave de evento en reglas por eventos", () => {
    const r = crearFrecuencia({ reglas: [{ tipo: "eventos" }] });
    expect(r.ok).toBe(false);
  });
  it("rechaza tipo desconocido", () => {
    const r = crearFrecuencia({ reglas: [{ tipo: "lunas", cada: 1 }] });
    expect(r.ok).toBe(false);
  });
  it("acepta combinación con modo", () => {
    const r = crearFrecuencia({
      reglas: [{ tipo: "meses", cada: 6 }, { tipo: "horometro", cada: 500, unidad: "horometro" }],
      modo: "lo-que-ocurra-primero",
    });
    expect(r.ok).toBe(true);
  });
});

describe("AlcanceActivos", () => {
  it("exige al menos una dimensión", () => {
    const r = crearAlcanceActivos({});
    expect(r.ok).toBe(false);
  });
  it("acepta una dimensión declarada", () => {
    const r = crearAlcanceActivos({ categorias: ["bombas"] });
    expect(r.ok).toBe(true);
  });
  it("resuelve la INTERSECCIÓN (todas las dimensiones deben cumplirse)", () => {
    const a = crearAlcanceActivos({ categorias: ["bombas"], empresas: ["e1"] });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(alcanceIncluye(a.value, { activoId: "x", categoria: "bombas", empresa: "e1" })).toBe(true);
    expect(alcanceIncluye(a.value, { activoId: "x", categoria: "bombas", empresa: "e2" })).toBe(false);
    expect(alcanceIncluye(a.value, { activoId: "x", categoria: "motores", empresa: "e1" })).toBe(false);
  });
  it("dimensión vacía actúa como comodín", () => {
    const a = crearAlcanceActivos({ clases: ["rotativo"] });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(alcanceIncluye(a.value, { activoId: "z", clase: "rotativo", empresa: "cualquiera" })).toBe(true);
  });
  it("activo específico restringe por id", () => {
    const a = crearAlcanceActivos({ activos: ["A-1"] });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(alcanceIncluye(a.value, { activoId: "A-1" })).toBe(true);
    expect(alcanceIncluye(a.value, { activoId: "A-2" })).toBe(false);
  });
});

describe("Duracion y ReferenciaExterna", () => {
  it("duración admite 0 minutos", () => {
    expect(crearDuracion({ minutos: 0 }).ok).toBe(true);
  });
  it("duración rechaza minutos negativos", () => {
    expect(crearDuracion({ minutos: -1 }).ok).toBe(false);
  });
  it("referencia externa exige tipo e id", () => {
    expect(crearReferenciaExterna({ tipo: "repuesto", id: "R-1" }).ok).toBe(true);
    expect(crearReferenciaExterna({ tipo: "", id: "R-1" }).ok).toBe(false);
  });
});
