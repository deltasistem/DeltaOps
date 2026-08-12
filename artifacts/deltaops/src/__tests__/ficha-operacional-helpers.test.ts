/**
 * DGP-019.2 · Pruebas de los helpers PUROS de la Ficha Operacional 360°.
 *
 * Sólo presentación/derivación: ventanas temporales, clasificación por medidor
 * (maquinaria L/h vs vehículo L/100 km), tendencia de consumo, mapeo de estado
 * visual y formato. Ningún cálculo de dominio se prueba aquí (vive en backend).
 */
import { describe, it, expect } from "vitest";
import {
  ventanasComparacion,
  etiquetaPeriodo,
  clasificarActivo,
  metricaCombustible,
  tendenciaConsumo,
  estadoVisual,
  fmtNumero,
  fmtFecha,
  fmtFechaHora,
} from "../lib/utilizacion/ficha-operacional";
import type { ResumenActivo, ResultadoCalculo } from "../lib/utilizacion/tipos";

const valor = (v: number): ResultadoCalculo => ({ tipo: "valor", valor: v });
const sinDatos: ResultadoCalculo = { tipo: "sin-datos" };

function resumen(parcial: Partial<ResumenActivo>): ResumenActivo {
  return {
    deltaHorometro: sinDatos,
    deltaOdometro: sinDatos,
    litrosPorHora: sinDatos,
    litrosPor100Km: sinDatos,
    ...parcial,
  } as ResumenActivo;
}

describe("ventanasComparacion", () => {
  it("genera período actual y anterior contiguos de igual duración", () => {
    const ahora = new Date("2026-01-31T00:00:00.000Z");
    const v = ventanasComparacion(ahora, 30);
    expect(v.actual.hasta).toBe("2026-01-31T00:00:00.000Z");
    expect(v.actual.desde).toBe("2026-01-01T00:00:00.000Z");
    // el anterior termina donde empieza el actual
    expect(v.anterior.hasta).toBe(v.actual.desde);
    expect(v.anterior.desde).toBe("2025-12-02T00:00:00.000Z");
  });
  it("etiqueta el período de forma legible", () => {
    expect(etiquetaPeriodo(30)).toBe("últimos 30 días");
  });
});

describe("clasificarActivo / metricaCombustible (§6)", () => {
  it("maquinaria cuando hay Δ horómetro → L/h", () => {
    const r = resumen({ deltaHorometro: valor(12), litrosPorHora: valor(4.5) });
    expect(clasificarActivo(r)).toBe("maquinaria");
    const m = metricaCombustible(r);
    expect(m.clase).toBe("maquinaria");
    expect(m.unidad).toBe("L/h");
    expect(m.resultado).toEqual(valor(4.5));
  });
  it("vehículo cuando sólo hay Δ odómetro → L/100 km", () => {
    const r = resumen({ deltaOdometro: valor(300), litrosPor100Km: valor(18) });
    expect(clasificarActivo(r)).toBe("vehiculo");
    const m = metricaCombustible(r);
    expect(m.clase).toBe("vehiculo");
    expect(m.unidad).toBe("L/100 km");
    expect(m.resultado).toEqual(valor(18));
  });
  it("prioriza maquinaria si hay ambos medidores", () => {
    const r = resumen({ deltaHorometro: valor(10), deltaOdometro: valor(200) });
    expect(clasificarActivo(r)).toBe("maquinaria");
  });
  it("indeterminado sin medidores con datos → L/h con resultado sin-datos", () => {
    const r = resumen({});
    expect(clasificarActivo(r)).toBe("indeterminado");
    expect(metricaCombustible(r).resultado).toEqual(sinDatos);
  });
  it("null/undefined es indeterminado", () => {
    expect(clasificarActivo(null)).toBe("indeterminado");
    expect(clasificarActivo(undefined)).toBe("indeterminado");
  });
});

describe("tendenciaConsumo", () => {
  it("subir consumo es tono error (peor)", () => {
    const t = tendenciaConsumo(valor(12), valor(10));
    expect(t?.direccion).toBe("sube");
    expect(t?.tono).toBe("error");
    expect(t?.etiqueta).toContain("20,0 %");
  });
  it("bajar consumo es tono éxito (ahorro)", () => {
    const t = tendenciaConsumo(valor(8), valor(10));
    expect(t?.direccion).toBe("baja");
    expect(t?.tono).toBe("exito");
  });
  it("sin cambios es neutro", () => {
    const t = tendenciaConsumo(valor(10), valor(10));
    expect(t?.direccion).toBe("igual");
    expect(t?.tono).toBe("neutro");
  });
  it("devuelve null si falta cualquier dato (no inventa tendencia)", () => {
    expect(tendenciaConsumo(sinDatos, valor(10))).toBeNull();
    expect(tendenciaConsumo(valor(10), sinDatos)).toBeNull();
    expect(tendenciaConsumo(valor(10), valor(0))).toBeNull();
  });
});

describe("estadoVisual (§4 · sólo estados reales)", () => {
  it("mapea estados del dominio a semáforo + variante", () => {
    expect(estadoVisual("OPERATIVO")).toMatchObject({ semaforo: "operativo", variante: "exito" });
    expect(estadoVisual("MANTENIMIENTO")).toMatchObject({ semaforo: "mantenimiento", variante: "advertencia" });
    expect(estadoVisual("FUERA_SERVICIO")).toMatchObject({ semaforo: "fuera", variante: "error" });
    expect(estadoVisual("REGISTRADO")).toMatchObject({ semaforo: "atencion", variante: "info" });
    expect(estadoVisual("RETIRADO")).toMatchObject({ semaforo: "neutro" });
  });
  it("no inventa estados fuera del dominio", () => {
    const ev = estadoVisual("CUALQUIERA");
    expect(ev.semaforo).toBe("neutro");
    expect(ev.etiqueta).toBe("CUALQUIERA");
  });
});

describe("formato", () => {
  it("fmtNumero devuelve 'Sin datos' para nulos (nunca 0)", () => {
    expect(fmtNumero(null)).toBe("Sin datos");
    expect(fmtNumero(undefined)).toBe("Sin datos");
    expect(fmtNumero(0)).not.toBe("Sin datos");
  });
  it("fmtNumero aplica unidad", () => {
    expect(fmtNumero(1234.5, 1, "L")).toContain("L");
  });
  it("fmtFecha / fmtFechaHora toleran ausencia", () => {
    expect(fmtFecha(undefined)).toBe("Sin datos");
    expect(fmtFechaHora(null)).toBe("Sin datos");
  });
});
