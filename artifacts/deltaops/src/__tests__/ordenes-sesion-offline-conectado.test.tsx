/**
 * DGP-020.2 (§19/§39) · Prueba del PanelSesion CONECTADO en flujo offline:
 *  - Refleja el estado OPTIMISTA derivado de la cola (sesión ABIERTA aunque el
 *    servidor aún diga «sin sesión»), habilitando Pausar/Finalizar offline.
 *  - Al DRENAR la cola (mock del flush ⇒ `operaciones` vacías) invalida/refresca
 *    las queries de lectura para tomar la verdad del servidor (§22).
 *
 * Se mockean los providers/hooks para aislar la lógica de wiring (no hay red).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import type { OperacionCola } from "../lib/offline/tipos";
import type { SesionTrabajo, DuracionesSesion } from "../lib/ordenes/tipos";
import { MODULO } from "../lib/ordenes/constantes";

/* --------- Estado mutable compartido con los mocks (hoisted-safe) --------- */
const estado = vi.hoisted(() => ({
  operaciones: [] as OperacionCola[],
  enLinea: false,
  sesionServidor: null as SesionTrabajo | null,
  duracionesServidor: [] as DuracionesSesion[],
  recargarActiva: vi.fn(),
  recargarDuraciones: vi.fn(),
  recargarHistorial: vi.fn(),
}));

vi.mock("../lib/offline/contexto", () => ({
  useOffline: () => ({
    cola: {},
    operaciones: estado.operaciones,
    enLinea: estado.enLinea,
    pendientes: estado.operaciones.length,
    conflictos: [],
    procesar: async () => null,
  }),
}));

vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: "TECNICO", identityId: "id-tec" } }),
}));

vi.mock("../lib/ordenes/hooks", () => ({
  useSesionActiva: () => ({ datos: estado.sesionServidor, cargando: false, error: null, recargar: estado.recargarActiva }),
  useDuracionesSesion: () => ({ datos: estado.duracionesServidor, cargando: false, error: null, recargar: estado.recargarDuraciones }),
  useSesionesOrden: () => ({ datos: [], cargando: false, error: null, recargar: estado.recargarHistorial }),
}));

import { PanelSesion } from "../lib/ordenes/PanelSesion";
import type { OrdenRow } from "../lib/ordenes/tipos";

const ORDEN = { id: "ot-39", codigo: "OT-39", estado: "EN_EJECUCION", datos: {} } as unknown as OrdenRow;

function opCola(accion: string, ocurridoAt: string): OperacionCola {
  return {
    opId: `op-${accion}`,
    comando: `${MODULO}.sesion.${accion}`,
    input: { id: "ot-39", ordenId: "ot-39", ocurridoAt, origen: "offline", opId: `op-${accion}` },
    descripcion: accion,
    encoladaAt: ocurridoAt,
    estado: "pendiente",
    intentos: 0,
  };
}

function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  estado.operaciones = [];
  estado.enLinea = false;
  estado.sesionServidor = null;
  estado.duracionesServidor = [];
  estado.recargarActiva.mockReset();
  estado.recargarDuraciones.mockReset();
  estado.recargarHistorial.mockReset();
});

describe("PanelSesion conectado · flujo offline (§39)", () => {
  it("con «abrir» en cola y servidor «sin sesión»: muestra ABIERTA optimista + CTAs de trabajo", () => {
    // Servidor dice sin sesión; la cola tiene un ABRIR pendiente.
    estado.operaciones = [opCola("abrir", "2024-07-01T08:00:00.000Z")];
    wrap(<PanelSesion orden={ORDEN} />);
    expect(screen.getByText("Pendiente de sincronizar")).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar" })).toBeInTheDocument();
  });

  it("con la cadena ABRIR→PAUSAR en cola: estado local PAUSADA con Reanudar/Finalizar", () => {
    estado.operaciones = [
      opCola("abrir", "2024-07-01T08:00:00.000Z"),
      opCola("pausar", "2024-07-01T08:30:00.000Z"),
    ];
    wrap(<PanelSesion orden={ORDEN} />);
    expect(screen.getByText("En pausa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
  });

  it("al DRENAR la cola tras estar pendiente, refresca las queries del servidor", () => {
    estado.operaciones = [opCola("abrir", "2024-07-01T08:00:00.000Z")];
    const { rerender } = wrap(<PanelSesion orden={ORDEN} />);
    // Simula el flush del /sync: cola vacía y servidor ya con la sesión aplicada.
    estado.operaciones = [];
    estado.enLinea = true;
    rerender(
      <ThemeProvider>
        <ToastProvider>
          <PanelSesion orden={ORDEN} />
        </ToastProvider>
      </ThemeProvider>,
    );
    expect(estado.recargarActiva).toHaveBeenCalled();
    expect(estado.recargarDuraciones).toHaveBeenCalled();
  });
});
