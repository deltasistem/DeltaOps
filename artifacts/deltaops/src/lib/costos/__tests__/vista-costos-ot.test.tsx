/**
 * DGP-021.3 · La sección de costos de OT distingue «Sin datos suficientes» de un
 * «$0» real (§4/§8) y separa el combustible como NO APLICA (GAP-FUEL-OT).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { VistaCostosOt } from "../SeccionCostosOt";
import type { ComposicionOt } from "../tipos";

afterEach(cleanup);

const base: ComposicionOt = {
  ot: "ot-1",
  periodo: "total",
  rango: { desde: null, hasta: null },
  estado: "SIN_DATOS_SUFICIENTES",
  componentes: {
    manoObra: { tipo: "MANO_OBRA", estado: "SIN_DATOS_SUFICIENTES", porMoneda: [] },
    materiales: { tipo: "MATERIALES", estado: "SIN_DATOS_SUFICIENTES", porMoneda: [] },
    otros: { tipo: "OTROS", estado: "SIN_DATOS_SUFICIENTES", porMoneda: [] },
    combustible: { estado: "NO_APLICA", nota: "n/a" },
  },
  totalesPorMoneda: [],
  pendientesMaterializacion: [],
};

describe("VistaCostosOt", () => {
  it("ausencia total ⇒ «Sin datos suficientes», nunca «$0»", () => {
    render(<VistaCostosOt datos={base} />);
    expect(screen.getAllByText(/Sin datos suficientes/i).length).toBeGreaterThan(0);
    // No debe aparecer un cero monetario cuando NO hay datos.
    expect(screen.queryByText(/\$\s?0([.,]0+)?$/)).toBeNull();
  });

  it("$0 REAL (hay hechos que netean cero) se muestra como monto, no como ausencia", () => {
    const conCero: ComposicionOt = {
      ...base,
      estado: "COMPLETO",
      componentes: {
        ...base.componentes,
        materiales: {
          tipo: "MATERIALES",
          estado: "COMPLETO",
          porMoneda: [{ moneda: "CLP", total: "0.000000", cargos: "5000.000000", abonos: "5000.000000", componentes: 2 }],
        },
      },
      totalesPorMoneda: [{ moneda: "CLP", total: "0.000000", cargos: "5000.000000", abonos: "5000.000000", componentes: 2 }],
    };
    render(<VistaCostosOt datos={conCero} />);
    // Aparece el desglose cargos/abonos (evidencia de $0 real, no ausencia).
    expect(screen.getAllByText(/Cargos/i).length).toBeGreaterThan(0);
  });

  it("combustible se rotula NO APLICA en la OT", () => {
    render(<VistaCostosOt datos={base} />);
    expect(screen.getAllByText(/No aplica/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/no se atribuye a órdenes/i)).toBeTruthy();
  });

  it("vista recortada avisa al TECNICO", () => {
    render(<VistaCostosOt datos={base} vistaRecortada />);
    expect(screen.getByText(/Vista parcial/i)).toBeTruthy();
  });
});
