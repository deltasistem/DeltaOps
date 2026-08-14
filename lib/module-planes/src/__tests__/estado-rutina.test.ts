/**
 * DELTAOPS LITE-08 · Pruebas del ESTADO OPERACIONAL de una RUTINA
 * (derivación de presentación pura sobre el motor de frecuencias).
 * Cubre §34: cálculo de próxima rutina, rutina vencida, "faltan N", semáforo.
 */
import { describe, expect, it } from "vitest";
import { crearFrecuencia, type Frecuencia } from "../domain/value-objects";
import {
  evaluarFrecuencia,
  type AnclajeFrecuencia,
  type ContextoEvaluacion,
} from "../domain/frecuencia-engine";
import { estadoRutina } from "../domain/estado-rutina";

function frec(input: unknown): Frecuencia {
  const r = crearFrecuencia(input);
  if (!r.ok) throw new Error("frecuencia inválida en test");
  return r.value;
}
const ancla = (desde: string, medidoresBase: Record<string, number> = {}): AnclajeFrecuencia => ({ desde, medidoresBase, eventosBase: {} });
const ctx = (ahora: string, medidores: Record<string, number> = {}): ContextoEvaluacion => ({ ahora, medidores, eventos: {} });

describe("estadoRutina · uso por horómetro", () => {
  it("calcula la próxima rutina y el faltante (Faltan 15 h)", () => {
    // Meta = 1200 h (base 0 + cada 1200). Actual 1185 h → faltan 15.
    const ev = evaluarFrecuencia(
      frec({ reglas: [{ tipo: "horometro", cada: 1200, unidad: "horometro" }] }),
      ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }),
      ctx("2024-06-01T00:00:00.000Z", { horometro: 1185 }),
    );
    const est = estadoRutina(ev);
    expect(est.vencida).toBe(false);
    expect(est.meta).toBe("1200");
    expect(est.faltante).toBe(15);
    expect(est.unidad).toBe("horometro");
    expect(est.dominio).toBe("uso");
  });

  it("marca vencido y excedente cuando se supera la meta", () => {
    const ev = evaluarFrecuencia(
      frec({ reglas: [{ tipo: "horometro", cada: 1200, unidad: "horometro" }] }),
      ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }),
      ctx("2024-06-01T00:00:00.000Z", { horometro: 1215 }),
    );
    const est = estadoRutina(ev);
    expect(est.vencida).toBe(true);
    expect(est.semaforo).toBe("rojo");
    expect(est.etiqueta).toBe("Mantenimiento vencido");
    expect(est.excedente).toBe(15);
    expect(est.faltante).toBe(-15);
  });

  it("semáforo amarillo cuando el progreso supera el umbral de proximidad", () => {
    // 1185/1200 = 0.9875 ≥ 0.9 → amarillo.
    const ev = evaluarFrecuencia(
      frec({ reglas: [{ tipo: "horometro", cada: 1200, unidad: "horometro" }] }),
      ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }),
      ctx("2024-06-01T00:00:00.000Z", { horometro: 1185 }),
    );
    const est = estadoRutina(ev);
    expect(est.semaforo).toBe("amarillo");
    expect(est.etiqueta).toBe("Próximo mantenimiento");
  });

  it("semáforo verde cuando aún está lejos de la meta", () => {
    const ev = evaluarFrecuencia(
      frec({ reglas: [{ tipo: "horometro", cada: 1200, unidad: "horometro" }] }),
      ancla("2024-01-01T00:00:00.000Z", { horometro: 0 }),
      ctx("2024-06-01T00:00:00.000Z", { horometro: 300 }),
    );
    const est = estadoRutina(ev);
    expect(est.semaforo).toBe("verde");
    expect(est.etiqueta).toBe("Al día");
    expect(est.faltante).toBe(900);
  });

  it("respeta un anclaje con base distinta de cero (último cumplimiento)", () => {
    // Último mantenimiento a 1200; siguiente meta 2400; actual 2390 → faltan 10.
    const ev = evaluarFrecuencia(
      frec({ reglas: [{ tipo: "horometro", cada: 1200, unidad: "horometro" }] }),
      ancla("2024-03-01T00:00:00.000Z", { horometro: 1200 }),
      ctx("2024-09-01T00:00:00.000Z", { horometro: 2390 }),
    );
    const est = estadoRutina(ev);
    expect(est.meta).toBe("2400");
    expect(est.faltante).toBe(10);
    expect(est.vencida).toBe(false);
  });
});

describe("estadoRutina · temporal", () => {
  it("deriva días de faltante y unidad 'días'", () => {
    const ev = evaluarFrecuencia(
      frec({ reglas: [{ tipo: "dias", cada: 30 }] }),
      ancla("2024-01-01T00:00:00.000Z"),
      ctx("2024-01-20T00:00:00.000Z"),
    );
    const est = estadoRutina(ev);
    expect(est.dominio).toBe("temporal");
    expect(est.unidad).toBe("días");
    expect(est.vencida).toBe(false);
    // El motor entrega el faltante temporal en días; verificamos que sea > 0.
    expect(est.faltante).toBeGreaterThan(0);
  });
});

describe("estadoRutina · sin datos", () => {
  it("no inventa faltante cuando no hay regla disparadora medible", () => {
    // Frecuencia por eventos sin conteo: disparadora existe pero comprobamos
    // el camino sin-datos con una evaluación vacía simulada.
    const ev = { vencida: false, modo: "lo-que-ocurra-primero", reglas: [], disparadora: null } as const;
    const est = estadoRutina(ev);
    expect(est.semaforo).toBe("sin-datos");
    expect(est.etiqueta).toBe("Sin datos suficientes");
    expect(est.faltante).toBeNull();
  });
});
