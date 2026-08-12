/**
 * DGP-010 · Punto 13 (integración ruta→filtro): al pulsar «Ver órdenes» en el
 * menú del activo escaneado se navega a `/ordenes?activoPrincipalId=<id>` y el
 * Centro de Operaciones consulta y muestra SOLO las órdenes de ese activo (no la
 * cola global). Verifica el contrato de extremo a extremo, no sólo el enlace.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { MenuAccionesEscaneo } from "../lib/ecosistema/flujo-escaneo";

// Sesión de PRESENTACIÓN: este test verifica el filtro ruta→consulta, no el
// gating RBAC de transiciones, así que se aísla el hook de sesión (evita montar
// SesionProvider/QueryClient) con un rol operador (capacidad `ejecutar`).
vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: "SUPERVISOR", modulos: ["ordenes"], permisos: [], capacidades: [] } }),
}));

import { Contenido as OrdenesOperaciones } from "../pages/ordenes-operaciones";

// Registro de las URLs de listado consultadas (para afirmar el filtro por ruta).
let listadoUrls: string[] = [];

function ordenParaActivo(id: string) {
  return {
    id: `OT-${id}`, tenantId: "t", codigo: `OT-${id}`, titulo: `Trabajo de ${id}`, tipo: "correctiva",
    estado: "ABIERTA", categoria: null, prioridad: null, severidad: null, responsable: "Ana",
    supervisor: null, activoPrincipalId: id, ubicacionId: null, datos: {}, version: 1,
    lastEventId: "e", actualizadoAt: "2024-06-10T00:00:00Z",
  };
}

function mockFetch(): void {
  listadoUrls = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    // Detalle del activo (menú de escaneo + chip contextual).
    if (/\/activos\/ACT-1$/.test(url)) {
      return new Response(JSON.stringify({ id: "ACT-1", nombre: "Bomba 1", codigoEmpresarial: "EQ-1", version: 2, estado: "OPERATIVO", tipo: "equipo" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    // Listado de órdenes: devuelve SOLO las del activo si se filtró; si viniera
    // sin filtro (bug), devolvería la cola global (que el test detectaría).
    if (/\/deltaops\/ordenes\?/.test(url)) {
      listadoUrls.push(url);
      const filtrado = /activoPrincipalId=ACT-1/.test(url);
      const ordenes = filtrado
        ? [ordenParaActivo("ACT-1")]
        : [ordenParaActivo("OTRO-1"), ordenParaActivo("OTRO-2")];
      return new Response(JSON.stringify({ ordenes }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function App() {
  const { hook } = memoryLocation({ path: "/escanear", record: true });
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <Router hook={hook}>
            <Route path="/escanear"><MenuAccionesEscaneo activoId="ACT-1" /></Route>
            <Route path="/ordenes"><OrdenesOperaciones /></Route>
          </Router>
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("QR → Activo → Ver órdenes (ruta → filtro)", () => {
  beforeEach(() => mockFetch());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("navega a /ordenes filtrado y consulta/muestra solo las órdenes del activo", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Bomba 1")).toBeInTheDocument());

    // El enlace respeta el contrato del filtro.
    const verOrdenes = screen.getByRole("link", { name: /Ver órdenes/i });
    expect(verOrdenes).toHaveAttribute("href", expect.stringContaining("/ordenes?activoPrincipalId=ACT-1"));

    fireEvent.click(verOrdenes);

    // Tras navegar, el Centro de Operaciones carga y muestra el chip contextual.
    await waitFor(() => expect(screen.getByText(/Centro de Operaciones/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("status", { name: /Filtro contextual por activo/i })).toBeInTheDocument());

    // TODAS las consultas de listado incluyeron el filtro por activo (nunca la
    // cola global sin filtro).
    await waitFor(() => expect(listadoUrls.length).toBeGreaterThan(0));
    expect(listadoUrls.every((u) => /activoPrincipalId=ACT-1/.test(u))).toBe(true);

    // Se muestran las órdenes del activo y NO las de la cola global.
    expect(screen.getAllByText("OT-ACT-1").length).toBeGreaterThan(0);
    expect(screen.queryByText("OT-OTRO-1")).toBeNull();
  });
});
