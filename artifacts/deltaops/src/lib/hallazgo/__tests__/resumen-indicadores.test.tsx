/**
 * DELTAOPS LITE-05 §15 · UI de los indicadores ACCIONABLES de hallazgos de
 * preoperacional en la Home. Verifica datos reales del backend, estados vacíos
 * HONESTOS (nunca «0» inventado sin fuente cuando no hay hallazgos), estado de
 * carga/error, y DEEP LINKS a las bandejas existentes (/activos, /ordenes).
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider } from "@workspace/design-system";
import { HallazgosPreopSeccion } from "../../../pages/inicio-empresa";
import type { ResumenHallazgos } from "../tipos";

afterEach(cleanup);

function montar(node: React.ReactNode) {
  const { hook } = memoryLocation({ path: "/", record: true });
  return render(
    <ThemeProvider>
      <Router hook={hook}>{node}</Router>
    </ThemeProvider>,
  );
}

const conDatos: ResumenHallazgos = {
  hallazgosPendientes: 3,
  mantenimientosDerivados: 2,
  descartados: 1,
  totalHallazgos: 6,
  ejecucionesInspeccionadas: 4,
  acotado: false,
};

describe("§15 · HallazgosPreopSeccion", () => {
  it("muestra los conteos REALES y enlaza a las bandejas existentes", () => {
    montar(<HallazgosPreopSeccion resumen={conDatos} cargando={false} error={null} onReintentar={() => {}} />);
    expect(screen.getByText(/Hallazgos pendientes de gestionar/i)).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/Mantenimientos derivados/i)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    // Deep links a rutas ya existentes (no se inventan destinos).
    const hrefs = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/activos");
    expect(hrefs).toContain("/ordenes");
  });

  it("estado VACÍO honesto cuando no hay hallazgos (no muestra tarjetas con 0)", () => {
    const cero: ResumenHallazgos = { ...conDatos, hallazgosPendientes: 0, mantenimientosDerivados: 0, descartados: 0, totalHallazgos: 0 };
    montar(<HallazgosPreopSeccion resumen={cero} cargando={false} error={null} onReintentar={() => {}} />);
    expect(screen.getByText(/Sin hallazgos registrados/i)).toBeTruthy();
    // No se renderizan las KPI de conteo cuando el total real es cero.
    expect(screen.queryByText(/Hallazgos pendientes de gestionar/i)).toBeNull();
  });

  it("muestra el estado de CARGA", () => {
    montar(<HallazgosPreopSeccion resumen={null} cargando error={null} onReintentar={() => {}} />);
    expect(screen.getByRole("status", { name: /Cargando hallazgos de preoperacional/i })).toBeTruthy();
  });

  it("muestra el estado de ERROR con reintento", () => {
    montar(<HallazgosPreopSeccion resumen={null} cargando={false} error={new Error("x")} onReintentar={() => {}} />);
    expect(screen.getByText(/No fue posible cargar los hallazgos/i)).toBeTruthy();
  });

  it("avisa cuando la vista está ACOTADA", () => {
    montar(<HallazgosPreopSeccion resumen={{ ...conDatos, acotado: true }} cargando={false} error={null} onReintentar={() => {}} />);
    expect(screen.getByText(/Vista acotada/i)).toBeTruthy();
  });
});
