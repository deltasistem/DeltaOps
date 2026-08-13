/**
 * DGP-021.3 R1 · El combustible del activo es CONTEXTUAL y NO expone ningún total
 * monetario (§26): la tarjeta muestra CONTEO de tanqueos y valores de ORIGEN por
 * tanqueo (sin sumar), y queda SEPARADO del total económico.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { TarjetaCombustible } from "../componentes";
import { VistaCostosActivo } from "../CostosActivo";
import type { CombustibleActivo, ComposicionActivo } from "../tipos";

afterEach(cleanup);

const combFloat: CombustibleActivo = {
  estado: "CONTEXTUAL",
  atribuibleAOt: "NO_APLICA",
  precisionOrigen: "float-utilizacion-no-exacto",
  gapMoneda: "GAP-FUEL-MONEY",
  tanqueos: 3,
  tanqueosConCosto: 3,
  tanqueosSinCosto: 0,
  conteoPorMoneda: [
    { moneda: "CLP", tanqueos: 2 },
    { moneda: "USD", tanqueos: 1 },
  ],
  eventos: [
    { tanqueoId: "t1", cuando: "2024-05-06T07:00:00.000Z", moneda: "CLP", costoOrigen: "0.1", litros: "1.1" },
    { tanqueoId: "t2", cuando: "2024-05-07T07:00:00.000Z", moneda: "CLP", costoOrigen: "0.2", litros: "2.2" },
    { tanqueoId: "t3", cuando: "2024-05-08T07:00:00.000Z", moneda: "USD", costoOrigen: "10.005", litros: "3.33" },
  ],
};

describe("TarjetaCombustible (R1)", () => {
  it("muestra CONTEO por moneda, no un total monetario sumado", () => {
    render(<TarjetaCombustible c={combFloat} />);
    expect(screen.getByText(/tanqueo\(s\) en el período/i)).toBeTruthy();
    expect(screen.getByText(/CLP: 2 tanqueo/i)).toBeTruthy();
    expect(screen.getByText(/USD: 1 tanqueo/i)).toBeTruthy();
    // JAMÁS aparece la suma float mal redondeada (0.1 + 0.2), ni el agregado "0.3".
    expect(screen.queryByText(/0\.30000000000000004/)).toBeNull();
    expect(screen.queryByText(/≈\s*0\.3\b/)).toBeNull();
    // El desglose por moneda no incluye ningún campo monetario (solo conteo).
    expect(screen.queryByText(/CLP:\s*\$/)).toBeNull();
  });

  it("los valores de origen por tanqueo son individuales (aprox.), sin sumar", () => {
    render(<TarjetaCombustible c={combFloat} />);
    const detalle = screen.getByText(/valor de origen/i).closest("details")!;
    // Aparecen los valores individuales tal cual.
    expect(within(detalle).getByText(/≈ 0\.1 CLP/)).toBeTruthy();
    expect(within(detalle).getByText(/≈ 0\.2 CLP/)).toBeTruthy();
    expect(within(detalle).getByText(/≈ 10\.005 USD/)).toBeTruthy();
  });

  it("ausencia de tanqueos ⇒ «Sin datos suficientes», nunca 0", () => {
    render(<TarjetaCombustible c={{ estado: "SIN_DATOS_SUFICIENTES", tanqueos: 0, conteoPorMoneda: [], eventos: [] }} />);
    expect(screen.getByText(/Sin datos suficientes/i)).toBeTruthy();
    expect(screen.queryByText(/\$\s?0/)).toBeNull();
  });
});

describe("VistaCostosActivo · combustible fuera del total económico", () => {
  const datos: ComposicionActivo = {
    activo: "a1",
    periodo: "total",
    rango: { desde: null, hasta: null },
    estado: "COMPLETO",
    componentes: {
      manoObra: { tipo: "MANO_OBRA", estado: "COMPLETO", porMoneda: [{ moneda: "CLP", total: "50000.000000", cargos: "50000.000000", abonos: "0.000000", componentes: 1 }] },
      materiales: { tipo: "MATERIALES", estado: "SIN_DATOS_SUFICIENTES", porMoneda: [] },
      otros: { tipo: "OTROS", estado: "SIN_DATOS_SUFICIENTES", porMoneda: [] },
      combustible: combFloat,
    },
    totalesPorMoneda: [{ moneda: "CLP", total: "50000.000000", cargos: "50000.000000", abonos: "0.000000", componentes: 1 }],
    costoPorHora: { tipoMedidor: "horometro", unidad: "h", estado: "SIN_DATOS_SUFICIENTES", delta: null, tramos: 0, porMoneda: [], nota: "n/a" },
    costoPorKm: { tipoMedidor: "odometro", unidad: "km", estado: "NO_APLICA", delta: null, tramos: 0, porMoneda: [], nota: "Sin odómetro" },
  };

  const noop = () => undefined;

  it("el total económico refleja SOLO mano de obra/materiales/otros (no combustible)", () => {
    render(
      <VistaCostosActivo
        datos={datos}
        periodo="total"
        desde=""
        hasta=""
        onPeriodo={noop}
        onDesde={noop}
        onHasta={noop}
      />,
    );
    // Aviso explícito de que el total no incluye combustible.
    expect(screen.getByText(/No incluye combustible/i)).toBeTruthy();
    // Combustible presente como sección contextual separada.
    expect(screen.getByText(/Combustible \(contextual\)/i)).toBeTruthy();
  });
});
