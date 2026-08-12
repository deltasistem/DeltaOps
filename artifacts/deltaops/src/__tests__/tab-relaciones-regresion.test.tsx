/**
 * DGP-019.2 · Regresión de render de TabRelaciones (deuda DGP-008.x).
 *
 * Antes, un `datos` no-arreglo (la forma real `{id,salientes,entrantes}` del
 * backend) provocaba `datos.map is not a function` y reventaba la ficha entera
 * (los `Tabs` del DS montan todos los paneles). Aquí verificamos que:
 *  - con datos normalizados (Relacion[]) se listan las relaciones;
 *  - con un `datos` no-arreglo inesperado, la guarda evita el crash y muestra el
 *    estado vacío en vez de romper.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";

let DATOS: unknown = [];

vi.mock("../lib/activos/hooks", () => ({
  useRelacionados: () => ({ datos: DATOS, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/offline/contexto", () => ({
  useOffline: () => ({ cola: {}, enLinea: true, pendientes: 0, procesar: () => {} }),
}));
vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: "TENANT_ADMIN", modulos: ["activos"], permisos: [], capacidades: [] } }),
}));

import { TabRelaciones } from "../pages/ficha/tab-relaciones";

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}
afterEach(() => cleanup());

describe("TabRelaciones · regresión de crash", () => {
  it("lista relaciones cuando llegan normalizadas (Relacion[])", () => {
    DATOS = [
      { id: "r1", tipo: "padre-de", origenId: "act-1", origenNombre: "Excavadora", destinoId: "hijo-1", destinoNombre: "Motor" },
    ];
    wrap(<TabRelaciones id="act-1" nombre="Excavadora" onNavegar={() => {}} />);
    // "padre-de" aparece en el grafo y en la tabla: basta con que se renderice.
    expect(screen.getAllByText("padre-de").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Motor").length).toBeGreaterThan(0);
  });

  it("NO crashea con un `datos` no-arreglo inesperado: muestra estado vacío", () => {
    // Simula una respuesta no normalizada llegando a la vista (defensa en profundidad).
    DATOS = { id: "act-1", salientes: [], entrantes: [] } as unknown;
    expect(() => wrap(<TabRelaciones id="act-1" nombre="Excavadora" onNavegar={() => {}} />)).not.toThrow();
    expect(screen.getByText("Sin relaciones")).toBeInTheDocument();
  });
});
