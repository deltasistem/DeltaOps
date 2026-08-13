/**
 * DGP-021.4-E · Superficie de costos: comparativa (§13) y tendencia (§14).
 *  - Comparativa SIEMPRE por moneda; jamás ranking combinado entre monedas.
 *  - Orden por CADENA decimal exacta (`compararDecimal`), sin aritmética float;
 *    los valores nulos (ausencia) se ordenan al final, nunca como 0.
 *  - Tendencia: los meses sin datos se rotulan «Sin datos suficientes», NUNCA 0.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PanelComparativa, PanelTendencia, compararDecimal } from "../SuperficieCostos";
import type { ComparativaActivos, TendenciaActivo } from "../tipos";

afterEach(cleanup);

describe("compararDecimal (string-safe)", () => {
  it("ordena por magnitud exacta sin convertir a float", () => {
    // Diferencia en el 7º dígito decimal: float la perdería; string no.
    expect(compararDecimal("1000.000001", "1000.000000")).toBeGreaterThan(0);
    expect(compararDecimal("999.999999", "1000.000000")).toBeLessThan(0);
    expect(compararDecimal("10.000000", "9.000000")).toBeGreaterThan(0); // más dígitos enteros
  });
  it("ubica null (ausencia) SIEMPRE al final, nunca como 0", () => {
    expect(compararDecimal(null, "0.000000")).toBeGreaterThan(0);
    expect(compararDecimal("0.000000", null)).toBeLessThan(0);
    expect(compararDecimal(null, null)).toBe(0);
  });
});

const comparativa: ComparativaActivos = {
  periodo: "anio",
  rango: { desde: "2024-01-01", hasta: "2024-12-31" },
  rankingPorMoneda: [
    {
      moneda: "CLP",
      activos: [
        { activoId: "a1", total: "100000.000000", costoPorHora: "4000.000000", costoPorKm: null },
        { activoId: "a2", total: "300000.000000", costoPorHora: "2000.000000", costoPorKm: "500.000000" },
      ],
    },
    {
      moneda: "USD",
      activos: [{ activoId: "a3", total: "500.000000", costoPorHora: null, costoPorKm: null }],
    },
  ],
  activos: [],
};

describe("PanelComparativa", () => {
  it("compara dentro de UNA moneda y avisa cuando hay varias (nunca combina)", () => {
    render(<PanelComparativa datos={comparativa} nombrePorId={{ a1: "Retro 1", a2: "Retro 2" }} />);
    // Aviso explícito de comparación por moneda.
    expect(screen.getByText(/Comparación por moneda/i)).toBeTruthy();
    // La tabla muestra los activos de la primera moneda.
    expect(screen.getByText("Retro 1")).toBeTruthy();
    expect(screen.getByText("Retro 2")).toBeTruthy();
  });

  it("una fila sin costo/km muestra «Sin datos», no un 0", () => {
    render(<PanelComparativa datos={comparativa} nombrePorId={{ a1: "Retro 1", a2: "Retro 2" }} />);
    const fila = screen.getByText("Retro 1").closest("tr")!;
    expect(within(fila).getAllByText(/Sin datos suficientes/i).length).toBeGreaterThan(0);
  });

  it("sin selección de activos invita a elegir (no muestra $0)", () => {
    render(<PanelComparativa datos={null} vacioSeleccion />);
    expect(screen.getByText(/Elige activos para comparar/i)).toBeTruthy();
  });
});

const tendencia: TendenciaActivo = {
  activo: "a1",
  periodo: "rango",
  rango: { desde: "2024-01-01", hasta: "2024-03-31" },
  puntos: [
    {
      mes: "2024-01",
      estado: "COMPLETO",
      costoPorMoneda: [{ moneda: "CLP", total: "120000.000000", cargos: "120000.000000", abonos: "0.000000", componentes: 2 }],
      horas: "40.000000",
      km: null,
      costoPorHora: [{ moneda: "CLP", costoTotal: "120000.000000", valor: "3000.000000" }],
      costoPorKm: null,
    },
    { mes: "2024-02", estado: "SIN_DATOS_SUFICIENTES", costoPorMoneda: null, horas: null, km: null, costoPorHora: null, costoPorKm: null },
  ],
};

describe("PanelTendencia", () => {
  it("mes sin datos se rotula «Sin datos suficientes», nunca 0", () => {
    render(<PanelTendencia datos={tendencia} />);
    expect(screen.getAllByText(/Sin datos suficientes/i).length).toBeGreaterThan(0);
    // El mes con datos muestra su costo y horas.
    expect(screen.getAllByText(/40/).length).toBeGreaterThan(0);
  });

  it("exige rango antes de consultar la tendencia", () => {
    render(<PanelTendencia datos={null} requiereRango />);
    expect(screen.getByText(/Elige un rango de fechas/i)).toBeTruthy();
  });
});
