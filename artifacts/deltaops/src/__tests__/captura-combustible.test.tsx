/**
 * DELTAOPS LITE-08 §9-13/§34 · Experiencia de combustible/abastecimiento.
 * Verifica que la superficie captura los campos §9 disponibles en el dominio
 * (tipo de energía del catálogo real, cantidad, costo, proveedor +
 * identificación, observación), muestra la lectura del activo como contexto, y
 * reutiliza el patrón offline (sin 2ª cola). GAP-TANQUEO (unidad multi-energía)
 * documentado: la cantidad se rotula "litros" por el contrato congelado.
 */
import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";

let ULTIMA: any = { activoId: "act-1", tipoMedidor: "horometro", valor: 1200, unidad: "h", fechaHora: "2025-12-01T09:00:00.000Z" };
let COMBUSTIBLES: any = [{ clave: "diesel", etiqueta: "Diésel", habilitado: true }, { clave: "electrico", etiqueta: "Eléctrico", habilitado: true }];
let RESULTADO: { encolada: boolean; error?: Error } = { encolada: false };
const registrarTanqueoMock = vi.fn(async (..._args: unknown[]) => RESULTADO);

vi.mock("../lib/offline/contexto", () => ({
  OfflineProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOffline: () => ({ cola: {}, enLinea: true, pendientes: 0, procesar: () => {} }),
  mutarConOffline: async () => ({ encolada: false }),
}));
vi.mock("../lib/utilizacion/hooks", () => ({
  useUltimaLectura: () => ({ datos: ULTIMA, cargando: false, error: null, recargar: () => {} }),
  useCombustibles: () => ({ datos: COMBUSTIBLES, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/planes/hooks", () => ({
  useEstadoRutinas: () => ({ datos: { activoId: "act-1", rutinas: [] }, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/utilizacion/mutaciones", () => ({
  registrarLectura: vi.fn(async () => ({ encolada: false })),
  registrarTanqueo: (...args: unknown[]) => registrarTanqueoMock(...(args as [])),
}));
vi.mock("@workspace/design-system", async (orig) => {
  const real = await (orig as () => Promise<any>)();
  return { ...real, useToast: () => ({ mostrar: () => 0, descartar: () => {} }) };
});

import { ModalRegistrarTanqueo } from "../lib/utilizacion/PanelOperacional";

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider temaInicial="light">{ui}</ThemeProvider>);
}

beforeEach(() => {
  ULTIMA = { activoId: "act-1", tipoMedidor: "horometro", valor: 1200, unidad: "h", fechaHora: "2025-12-01T09:00:00.000Z" };
  COMBUSTIBLES = [{ clave: "diesel", etiqueta: "Diésel", habilitado: true }, { clave: "electrico", etiqueta: "Eléctrico", habilitado: true }];
  RESULTADO = { encolada: false };
  registrarTanqueoMock.mockClear();
});
afterEach(() => cleanup());

describe("Captura de combustible", () => {
  it("muestra la lectura del activo como contexto (§9)", () => {
    wrap(<ModalRegistrarTanqueo activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    expect(screen.getByText(/Lectura del activo/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?200\s*h/)).toBeInTheDocument();
  });

  it("usa el catálogo real de tipos de energía (multi-energía)", () => {
    wrap(<ModalRegistrarTanqueo activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    expect(screen.getByText(/Tipo de energía/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Diésel" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Eléctrico" })).toBeInTheDocument();
  });

  it("registra con proveedor + identificación combinados en un snapshot string", async () => {
    let capturado: any = null;
    registrarTanqueoMock.mockImplementationOnce(async (_cola: unknown, input: any) => { capturado = input; return RESULTADO; });
    wrap(<ModalRegistrarTanqueo activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Cantidad/), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText(/^Proveedor/), { target: { value: "EDS Norte" } });
    fireEvent.change(screen.getByLabelText(/Identificación/), { target: { value: "T-778" } });
    fireEvent.change(screen.getByLabelText(/Observación/), { target: { value: "tanque lleno" } });
    fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: "2026-01-01T08:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    await waitFor(() => expect(registrarTanqueoMock).toHaveBeenCalledTimes(1));
    expect(capturado.litros).toBe(40);
    expect(capturado.proveedorId).toBe("EDS Norte · T-778");
    expect(capturado.observacion).toBe("tanque lleno");
  });

  it("no permite guardar sin cantidad válida", () => {
    wrap(<ModalRegistrarTanqueo activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    expect(registrarTanqueoMock).not.toHaveBeenCalled();
    expect(screen.getByText(/cantidad del tanqueo/i)).toBeInTheDocument();
  });
});
