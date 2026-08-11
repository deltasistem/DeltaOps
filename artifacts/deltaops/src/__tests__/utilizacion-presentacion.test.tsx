/**
 * DGP-019.1 · Pruebas de PRESENTACIÓN del módulo Utilización (DOM).
 *
 * Verifican reglas visibles del mandato:
 *  - la CONSULTA (rol sin capacidades de escritura) NO muestra CTA de anular;
 *  - un rol con `lecturas.anular` SÍ muestra la acción;
 *  - "sin datos" se representa literalmente como "Sin datos" (nunca 0);
 *  - las tablas se montan dentro del envoltorio desplazable del DS
 *    (`do-tabla__envoltura`), evitando overflow horizontal.
 * Se mockean los hooks de datos/sesión/offline para aislar la presentación.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";
import { ValorCalculo, BadgeSyncActivo } from "../lib/utilizacion/componentes";

/* --------- Mocks de dependencias de datos/sesión/offline (por defecto) ---- */

let ROL = "CONSULTA";
const LECTURAS = [
  { id: "l1", activoId: "act-1", tipoMedidor: "horometro", valor: 100, unidad: "h", fechaHora: "2024-01-01T10:00:00.000Z", estado: "vigente", inconsistente: false, sincronizacionActivo: "confirmada", origen: "manual" },
];

vi.mock("../lib/utilizacion/hooks", () => ({
  useLecturas: () => ({ datos: LECTURAS, cargando: false, error: null, recargar: () => {} }),
  useTanqueos: () => ({ datos: [], cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: ROL, modulos: ["utilizacion"] } }),
}));
vi.mock("../lib/offline/contexto", () => ({
  useOffline: () => ({ cola: {}, enLinea: true, pendientes: 0, procesar: () => {} }),
}));
vi.mock("../lib/activos/hooks", () => ({
  useListado: () => ({ datos: [{ id: "act-1", codigoEmpresarial: "A-1", nombre: "Excavadora" }], cargando: false, error: null, recargar: () => {} }),
}));

import { Consulta as ConsultaLecturas } from "../pages/utilizacion-lecturas";

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

afterEach(() => cleanup());

describe("presentación · ValorCalculo (sin datos ≠ 0)", () => {
  it("muestra 'Sin datos' cuando el resultado es sin-datos", () => {
    wrap(<ValorCalculo resultado={{ tipo: "sin-datos" }} unidad="L/h" />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("muestra 'Sin datos' cuando el valor es nulo aunque el tipo sea valor", () => {
    wrap(<ValorCalculo resultado={{ tipo: "valor", valor: null }} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it("muestra el valor formateado cuando hay dato", () => {
    wrap(<ValorCalculo resultado={{ tipo: "valor", valor: 12.5 }} unidad="L/h" />);
    expect(screen.getByText(/12\.50 L\/h/)).toBeInTheDocument();
  });
});

describe("presentación · sincronización hacia Activos visible", () => {
  it("etiqueta el estado de sincronización", () => {
    wrap(<BadgeSyncActivo valor="fallida" motivo="timeout" />);
    expect(screen.getByText("Sincronización fallida")).toBeInTheDocument();
  });
});

describe("presentación · consulta de lecturas y gating de CTAs", () => {
  beforeEach(() => { ROL = "CONSULTA"; });

  it("la tabla se monta en el envoltorio desplazable del DS", () => {
    const { container } = wrap(<ConsultaLecturas />);
    expect(container.querySelector(".do-tabla__envoltura")).toBeTruthy();
  });

  it("CONSULTA no muestra el botón de anular (sin capacidad de escritura)", () => {
    wrap(<ConsultaLecturas />);
    expect(screen.queryByRole("button", { name: /anular/i })).not.toBeInTheDocument();
  });

  it("muestra el estado de sincronización en la fila", () => {
    wrap(<ConsultaLecturas />);
    expect(screen.getByText("Sincronizada")).toBeInTheDocument();
  });

  it("SUPERVISOR sí muestra el botón de anular", () => {
    ROL = "SUPERVISOR";
    wrap(<ConsultaLecturas />);
    expect(screen.getAllByRole("button", { name: /anular/i }).length).toBeGreaterThan(0);
  });
});
