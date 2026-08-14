/**
 * DELTAOPS LITE-08 §6-7/§34 · Captura rápida de lectura (mobile-first).
 * Verifica: última lectura visible, lectura VÁLIDA con feedback de próxima
 * rutina/faltante, lectura MENOR ⇒ aviso de inconsistencia (append-only, no
 * propaga), y notificación de encolado offline (patrón existente, sin 2ª cola).
 */
import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";

// --- fixtures mutables ---
let ULTIMA: any = null;
let RUTINAS: any = { activoId: "act-1", rutinas: [] };
let RESULTADO_GUARDAR: { encolada: boolean; error?: Error } = { encolada: false };
const registrarLecturaMock = vi.fn(async () => RESULTADO_GUARDAR);

vi.mock("../lib/offline/contexto", () => ({
  OfflineProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOffline: () => ({ cola: {}, enLinea: true, pendientes: 0, procesar: () => {} }),
  mutarConOffline: async () => ({ encolada: false }),
}));
vi.mock("../lib/utilizacion/hooks", () => ({
  useUltimaLectura: () => ({ datos: ULTIMA, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/planes/hooks", () => ({
  useEstadoRutinas: () => ({ datos: RUTINAS, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/utilizacion/mutaciones", () => ({
  registrarLectura: (...args: unknown[]) => registrarLecturaMock(...(args as [])),
  registrarTanqueo: vi.fn(async () => ({ encolada: false })),
}));
vi.mock("@workspace/design-system", async (orig) => {
  const real = await (orig as () => Promise<any>)();
  return { ...real, useToast: () => ({ mostrar: () => 0, descartar: () => {} }) };
});

import { ModalRegistrarLectura } from "../lib/utilizacion/PanelOperacional";

function wrap(ui: React.ReactNode) {
  return render(<ThemeProvider temaInicial="light">{ui}</ThemeProvider>);
}

beforeEach(() => {
  ULTIMA = { activoId: "act-1", tipoMedidor: "horometro", valor: 1000, unidad: "h", fechaHora: "2025-12-01T09:00:00.000Z" };
  RUTINAS = {
    activoId: "act-1",
    rutinas: [
      { planId: "p1", nombre: "Cambio de aceite", vencida: false, semaforo: "amarillo", etiqueta: "Próximo mantenimiento", faltante: 15, excedente: -15, meta: "1200", unidad: "horometro", dominio: "uso", progreso: 0.9 },
    ],
  };
  RESULTADO_GUARDAR = { encolada: false };
  registrarLecturaMock.mockClear();
});
afterEach(() => cleanup());

describe("Captura rápida de lectura", () => {
  it("muestra la última lectura del medidor seleccionado", () => {
    wrap(<ModalRegistrarLectura activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    expect(screen.getByText(/Última lectura/)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?000\s*h/)).toBeInTheDocument();
  });

  it("lectura VÁLIDA: guarda y muestra feedback con la próxima rutina y el faltante", async () => {
    wrap(<ModalRegistrarLectura activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Nueva lectura/), { target: { value: "1185" } });
    fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: "2026-01-01T08:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    await waitFor(() => expect(registrarLecturaMock).toHaveBeenCalledTimes(1));
    // Feedback inmediato
    expect(await screen.findByTestId("lectura-feedback")).toBeInTheDocument();
    expect(screen.getByText(/Lectura registrada/)).toBeInTheDocument();
    expect(screen.getByText(/Cambio de aceite/)).toBeInTheDocument();
    expect(screen.getByText(/Faltan\s*15\s*h/)).toBeInTheDocument();
  });

  it("lectura MENOR que la última: avisa inconsistencia (append-only, no propaga)", () => {
    wrap(<ModalRegistrarLectura activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Nueva lectura/), { target: { value: "900" } });
    expect(screen.getByText(/menor que la última lectura/i)).toBeInTheDocument();
  });

  it("no permite guardar sin un valor válido", () => {
    wrap(<ModalRegistrarLectura activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    expect(registrarLecturaMock).not.toHaveBeenCalled();
    expect(screen.getByText(/valor de lectura válido/i)).toBeInTheDocument();
  });

  it("offline: notifica que la lectura quedó en cola (sin segunda cola)", async () => {
    RESULTADO_GUARDAR = { encolada: true };
    wrap(<ModalRegistrarLectura activoId="act-1" onCerrar={() => {}} onHecho={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Nueva lectura/), { target: { value: "1185" } });
    fireEvent.change(screen.getByLabelText(/Fecha y hora/), { target: { value: "2026-01-01T08:00" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/ }));
    await waitFor(() => expect(screen.getByTestId("lectura-feedback")).toBeInTheDocument());
    expect(screen.getByText(/en cola/i)).toBeInTheDocument();
  });
});
