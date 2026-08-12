/**
 * DGP-020.1 (post-review) · Pruebas de PRESENTACIÓN de la superficie
 * «Centro de Operaciones» de Órdenes (bandeja "Mis órdenes — Asignadas a mí").
 *
 * Regla del programa (§22 de DGP-019.2): CONSULTA no debe ver acciones de
 * ESCRITURA. Las acciones inmediatas de transición de la tarjeta de OT
 * (Abrir/Planificar/Asignar/Iniciar/Pausar/Reanudar/Enviar a validación/Cancelar)
 * disparan `POST /:id/transicionar`, que el backend autoriza con
 * `modulo.ordenes.operar` → capacidad canónica `ejecutar`. Por tanto:
 *  - CONSULTA (lector, `ejecutar=false`) NO ve ninguna de esas acciones (incl. "Cancelar");
 *  - un rol con `ejecutar` (operador/admin) SÍ las ve;
 *  - la acción de NAVEGACIÓN "Abrir" (enlace a la ficha, lectura) permanece SIEMPRE.
 * Se ocultan (no se deshabilitan).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";

vi.mock("../lib/offline/contexto", () => ({
  useOffline: () => ({ cola: {}, enLinea: true, pendientes: 0, procesar: () => {} }),
}));

import { FilaOrden } from "../pages/ordenes-operaciones";
import { capacidadesOrdenes } from "../lib/ordenes/capacidades";
import type { OrdenRow } from "../lib/ordenes/tipos";

function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

/** Orden en estado con transición de escritura visible ("Cancelar" incluida). */
const ORDEN: OrdenRow = {
  id: "ot-1",
  codigo: "OT-0001",
  titulo: "Mantenimiento excavadora",
  estado: "ASIGNADA",
  tipo: "correctivo",
  prioridad: "alta",
  activoPrincipalId: "act-1",
  responsable: "Yo",
} as unknown as OrdenRow;

afterEach(() => cleanup());

describe("presentación · Centro de Operaciones (RBAC de transiciones)", () => {
  it("CONSULTA (ejecutar=false): NO muestra 'Cancelar' ni 'Iniciar ejecución'; SÍ 'Abrir'", () => {
    const puedeEjecutar = capacidadesOrdenes({ rol: "CONSULTA" }).ejecutar;
    expect(puedeEjecutar).toBe(false);
    wrap(<FilaOrden orden={ORDEN} onCambio={() => {}} puedeEjecutar={puedeEjecutar} />);
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar ejecución" })).not.toBeInTheDocument();
    // La navegación de sólo lectura permanece.
    expect(screen.getByRole("button", { name: "Abrir" })).toBeInTheDocument();
  });

  it("SUPERVISOR (operador, ejecutar=true): SÍ muestra 'Cancelar' e 'Iniciar ejecución'", () => {
    const puedeEjecutar = capacidadesOrdenes({ rol: "SUPERVISOR" }).ejecutar;
    expect(puedeEjecutar).toBe(true);
    wrap(<FilaOrden orden={ORDEN} onCambio={() => {}} puedeEjecutar={puedeEjecutar} />);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar ejecución" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir" })).toBeInTheDocument();
  });

  it("TENANT_ADMIN (admin, ejecutar=true): SÍ muestra las transiciones de escritura", () => {
    const puedeEjecutar = capacidadesOrdenes({ rol: "TENANT_ADMIN" }).ejecutar;
    expect(puedeEjecutar).toBe(true);
    wrap(<FilaOrden orden={ORDEN} onCambio={() => {}} puedeEjecutar={puedeEjecutar} />);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("rol desconocido → tratado como lector: sin acciones de escritura", () => {
    const puedeEjecutar = capacidadesOrdenes({ rol: "OTRO" as never }).ejecutar;
    expect(puedeEjecutar).toBe(false);
    wrap(<FilaOrden orden={ORDEN} onCambio={() => {}} puedeEjecutar={puedeEjecutar} />);
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });
});
