/**
 * DGP-021.4-E · La ficha del activo muestra INDICADORES económicos reales
 * (costo/hora, costo/km) por moneda, con estado de calidad. Reglas duras (§4/§26):
 *  - Ausencia (SIN_DATOS_SUFICIENTES / NO_APLICA) se rotula explícita; JAMÁS «$0».
 *  - NO APLICA (p. ej. km sin odómetro) se distingue de «Sin datos».
 *  - Sólo se FORMATEA la cadena exacta del backend; nunca `parseFloat`/`Number`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TarjetaIndicador } from "../componentes";
import type { IndicadorMedidor } from "../tipos";

afterEach(cleanup);

const conDatos: IndicadorMedidor = {
  tipoMedidor: "horometro",
  unidad: "h",
  estado: "COMPLETO",
  delta: "120.000000",
  tramos: 1,
  porMoneda: [{ moneda: "CLP", costoTotal: "480000.000000", valor: "4000.000000" }],
};

describe("TarjetaIndicador", () => {
  it("muestra el ratio por moneda con la unidad (/h) y el avance del medidor", () => {
    render(<TarjetaIndicador titulo="Costo por hora" ind={conDatos} />);
    // El ratio incluye la unidad «/h».
    expect(screen.getByText(/\/h$/)).toBeTruthy();
    // Muestra las horas del período (denominador exacto).
    expect(screen.getAllByText(/120/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Horas de operación/i)).toBeTruthy();
  });

  it("NO APLICA (km sin odómetro) se rotula explícito y NO como «$0»", () => {
    const noAplica: IndicadorMedidor = {
      tipoMedidor: "odometro",
      unidad: "km",
      estado: "NO_APLICA",
      delta: null,
      tramos: 0,
      porMoneda: [],
      nota: "El activo no registra odómetro.",
    };
    render(<TarjetaIndicador titulo="Costo por km" ind={noAplica} />);
    expect(screen.getAllByText(/No aplica/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/no registra odómetro/i)).toBeTruthy();
    // Nunca un cero monetario por ausencia.
    expect(screen.queryByText(/\$\s?0([.,]0+)?/)).toBeNull();
  });

  it("SIN DATOS SUFICIENTES nunca produce un ratio 0", () => {
    const sinDatos: IndicadorMedidor = {
      tipoMedidor: "horometro",
      unidad: "h",
      estado: "SIN_DATOS_SUFICIENTES",
      delta: null,
      tramos: 0,
      porMoneda: [],
    };
    render(<TarjetaIndicador titulo="Costo por hora" ind={sinDatos} />);
    expect(screen.getAllByText(/Sin datos suficientes/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\/h/)).toBeNull();
  });

  it("señala tramos múltiples cuando el medidor se reinició", () => {
    const conReinicio: IndicadorMedidor = { ...conDatos, tramos: 3 };
    render(<TarjetaIndicador titulo="Costo por hora" ind={conReinicio} />);
    expect(screen.getByText(/3 tramos/i)).toBeTruthy();
  });
});
