/**
 * DGP-009.3 · Pruebas del calendario de planificación (agrupación por día,
 * conflictos visibles y entradas sin fecha). Fecha inyectada (determinista).
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { Calendario } from "../pages/ordenes-planificacion";
import type { EntradaIntegrada } from "../lib/ecosistema/agenda-integrada";

const SIN_SLA = { riesgo: "sin-sla", vencimiento: null, restanteMs: null, etiqueta: "Sin SLA", escalar: false } as const;

function entrada(p: Partial<EntradaIntegrada>): EntradaIntegrada {
  return {
    id: "e", codigo: "OT-1", titulo: "Tarea", estado: "PLANIFICADA", responsable: null,
    inicioPlanificado: null, finPlanificado: null, ventanaInicio: null, ventanaFin: null,
    programacionEstado: null, enConflicto: false, version: 1,
    activoId: null, prioridad: null, cuadrilla: null, sla: SIN_SLA, ...p,
  };
}

// Semana del lunes 2024-06-03 al domingo 2024-06-09.
const dias = Array.from({ length: 7 }, (_, i) => {
  const d = new Date("2024-06-03T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + i);
  return d;
});

function Wrap({ entradas }: { entradas: EntradaIntegrada[] }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <Calendario dias={dias} entradas={entradas} ahoraMs={Date.parse("2024-06-03T00:00:00Z")} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("Calendario de planificación", () => {
  it("ubica una orden en su día por inicioPlanificado", () => {
    render(<Wrap entradas={[entrada({ id: "a", codigo: "OT-A", titulo: "Rev A", inicioPlanificado: "2024-06-04T09:00:00Z" })]} />);
    expect(screen.getByText("OT-A")).toBeInTheDocument();
    expect(screen.getByText("Rev A")).toBeInTheDocument();
  });

  it("marca conflictos de programación", () => {
    render(<Wrap entradas={[entrada({ id: "b", codigo: "OT-B", inicioPlanificado: "2024-06-05T10:00:00Z", enConflicto: true })]} />);
    expect(screen.getByText(/Conflicto/i)).toBeInTheDocument();
  });

  it("agrupa las entradas sin fecha en su propia sección", () => {
    render(<Wrap entradas={[entrada({ id: "c", codigo: "OT-C", titulo: "Sin fecha" })]} />);
    expect(screen.getByText(/Sin fecha planificada/i)).toBeInTheDocument();
    expect(screen.getByText("OT-C")).toBeInTheDocument();
  });

  it("las tarjetas del calendario son arrastrables (drag & drop)", () => {
    render(<Wrap entradas={[entrada({ id: "d", codigo: "OT-D", inicioPlanificado: "2024-06-06T08:00:00Z" })]} />);
    const codigo = screen.getByText("OT-D");
    const tarjeta = codigo.closest("[draggable]");
    expect(tarjeta).not.toBeNull();
    expect(tarjeta).toHaveAttribute("draggable", "true");
  });
});
