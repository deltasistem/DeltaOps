/**
 * DGP-LITE-04 §24 · Pruebas de UI del PREOPERACIONAL.
 *
 * Cubre el mínimo exigido por la Dirección:
 *  - El control segmentado mapea al CONTRATO del motor (`estado` boolean|"na" +
 *    comentario) sin romperlo, incluida la OBSERVACIÓN (cumple con salvedad).
 *  - Un incumplimiento CRÍTICO se presenta como NO APTO con TEXTO (color/icono).
 *  - El HISTORIAL (tab del equipo) renderiza estados vacíos HONESTOS y muestra
 *    fecha/usuario/resultado; el detalle sellado presenta el veredicto con texto.
 * No se recalcula el veredicto en el cliente: el backend ya lo selló.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { Router } from "wouter";
import { aContratoMotor, PRESENTACION_VEREDICTO } from "../lib/preoperacional/constantes";

// Sesión con rol de ESCRITURA (habilita «Iniciar preoperacional» en el tab).
vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: "TENANT_ADMIN", tenant: { id: "deltaops" }, modulos: ["activos"], permisos: [], capacidades: [] } }),
}));
vi.mock("../lib/identidad/rbac", () => ({ moduloHabilitado: () => true }));

import { TabPreoperacional } from "../pages/ficha/tab-preoperacional";

/* ------------------------- 1. Mapeo al contrato ------------------------- */

describe("DGP-LITE-04 · control segmentado → contrato del motor", () => {
  it("CUMPLE ⇒ estado true", () => {
    expect(aContratoMotor("cumple")).toEqual({ estado: true });
  });
  it("NO CUMPLE ⇒ estado false (con comentario)", () => {
    expect(aContratoMotor("no_cumple", "sin presión")).toEqual({ estado: false, comentario: "sin presión" });
  });
  it("OBSERVACIÓN ⇒ estado true + comentario (cumple con salvedad, nunca falla)", () => {
    const r = aContratoMotor("observacion", "ruido leve");
    expect(r.estado).toBe(true);
    expect(r.comentario).toBe("ruido leve");
  });
  it("NO APLICA ⇒ estado 'na' (neutro)", () => {
    expect(aContratoMotor("na")).toEqual({ estado: "na" });
  });
});

/* ---------------------- 2. Presentación del veredicto ------------------- */

describe("DGP-LITE-04 · presentación del veredicto", () => {
  it("NO_APTO se presenta con texto y tono de error", () => {
    const p = PRESENTACION_VEREDICTO.NO_APTO;
    expect(p.etiqueta).toBe("NO APTO");
    expect(p.tono).toBe("error");
    expect(p.descripcion.length).toBeGreaterThan(0);
  });
  it("APTO_CON_OBSERVACIONES se presenta con texto y tono de advertencia", () => {
    expect(PRESENTACION_VEREDICTO.APTO_CON_OBSERVACIONES.tono).toBe("advertencia");
  });
});

/* ----------------------- 3. Historial (tab) UI -------------------------- */

interface EjecMock {
  id: string;
  data: Record<string, unknown>;
}
let ejecuciones: EjecMock[] = [];
let detalle: EjecMock | null = null;

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (/\/preoperacional\/ejecuciones\/[^?]+$/.test(url)) {
      return new Response(JSON.stringify(detalle), { status: detalle ? 200 : 404, headers: { "Content-Type": "application/json" } });
    }
    if (/\/preoperacional\/ejecuciones\?/.test(url)) {
      return new Response(JSON.stringify(ejecuciones), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrap() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router>
          <TabPreoperacional activoId="A1" activoNombre="Camión 1" />
        </Router>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("DGP-LITE-04 · historial de preoperacionales (tab del equipo)", () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); ejecuciones = []; detalle = null; });

  it("estado vacío HONESTO cuando el equipo no tiene preoperacionales", async () => {
    ejecuciones = [];
    render(<Wrap />);
    await waitFor(() => expect(screen.getByText(/Sin preoperacionales/i)).toBeInTheDocument());
    // Nunca datos falsos ni tablas fabricadas.
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lista ejecuciones con fecha, usuario y resultado; el detalle sellado muestra NO APTO con texto", async () => {
    ejecuciones = [
      {
        id: "ej-1",
        data: {
          activoId: "A1", plantillaClave: "preop-movil", plantillaVersion: 1,
          respuestaId: "preop-resp:A1:v1", veredicto: "NO_APTO",
          incumplimientos: [{ clave: "frenos", etiqueta: "Sistema de frenos", critico: true, comentario: "sin presión" }],
          observaciones: [], selladoPor: "operador@demo", selladoAt: "2024-07-01T12:00:00.000Z",
        },
      },
    ];
    detalle = ejecuciones[0]!;
    render(<Wrap />);

    await waitFor(() => expect(screen.getByRole("table")).toBeInTheDocument());
    expect(screen.getByText("operador@demo")).toBeInTheDocument();
    // El resultado aparece como NO APTO (texto), no como código interno.
    expect(screen.getAllByText("NO APTO").length).toBeGreaterThan(0);

    // Abrir el detalle sellado.
    fireEvent.click(screen.getByText("Detalle"));
    await waitFor(() => expect(screen.getByText(/Detalle del preoperacional/i)).toBeInTheDocument());
    // Procedencia: ítem crítico con su observación.
    expect(screen.getByText("Sistema de frenos")).toBeInTheDocument();
    expect(screen.getByText(/sin presión/)).toBeInTheDocument();
    // La versión anclada de la plantilla aparece (fila + detalle).
    expect(screen.getAllByText(/preop-movil v1/).length).toBeGreaterThan(0);
  });
});
