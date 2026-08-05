/**
 * DGP-009.3 · Defecto #3 (Ronda 2): la captura de checklist/formulario debe
 * RENDERIZAR la definición REALMENTE asociada (clave+versión exacta, resuelta
 * desde Dynamic Forms) y PERSISTIR la respuesta ANCLADA a esa clave+versión
 * (no una plantilla fija ni un diagnóstico genérico sin ancla).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { validarDefinicion } from "@workspace/dynamic-forms/definicion";
import { OfflineProvider } from "../lib/offline/contexto";
import {
  CapturaPlantilla,
  refDeAsociacion,
  coaccionarDefinicion,
  type AsociacionPlantilla,
} from "../pages/ordenes/tab-ejecucion";
import type { OrdenRow } from "../lib/ordenes/tipos";

// Definición ASOCIADA concreta (clave+versión), con una etiqueta distintiva
// que sólo aparece si se renderiza la definición resuelta (no una fija).
const DEF_ASOCIADA = validarDefinicion({
  clave: "chk.seguridad.pozo",
  titulo: "Checklist de seguridad de pozo",
  nodos: [
    {
      clase: "contenedor", clave: "g", tipo: "grupo", etiqueta: "Grupo",
      hijos: [
        { clase: "campo", clave: "valvula", tipo: "texto", etiqueta: "Estado de la válvula maestra", restricciones: {} },
      ],
    },
  ],
});

const ORDEN: OrdenRow = {
  tenantId: "deltaops", id: "OT-000002", codigo: "OT-000002", titulo: "Mantención",
  estado: "ABIERTA", tipo: "correctiva", categoria: null, prioridad: null, severidad: null,
  responsable: null, supervisor: null, activoPrincipalId: null, ubicacionId: null,
  datos: {}, version: 7, lastEventId: "ev1", actualizadoAt: "2024-01-01T00:00:00Z",
};

const ASOCIACION: AsociacionPlantilla = {
  clase: "checklist", clave: "chk.seguridad.pozo", version: 3, titulo: "Seguridad de pozo", respuestaId: null,
};

function Wrap({ asociacion }: { asociacion: AsociacionPlantilla }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <CapturaPlantilla orden={ORDEN} asociacion={asociacion} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

let peticiones: { url: string; body: Record<string, unknown> | null }[] = [];

function mockFetch(): void {
  peticiones = [];
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    peticiones.push({ url, body });
    // Resolución de la definición asociada por clave+versión exacta.
    if (/\/plantillas\/chk\.seguridad\.pozo\/3$/.test(url)) {
      return new Response(
        JSON.stringify({ clave: "chk.seguridad.pozo", version: 3, titulo: "Seguridad de pozo", definicion: DEF_ASOCIADA }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // Captura de respuesta (composición en el servidor).
    if (/\/checklist\/respuesta$/.test(url)) {
      return new Response(JSON.stringify({ ok: true, respuestaId: "resp:1" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

describe("refDeAsociacion + coaccionarDefinicion (puros)", () => {
  it("normaliza una fila de documentación a {clase, clave, version, titulo, respuestaId}", () => {
    const ref = refDeAsociacion(
      { clase: "checklist", referenciaClave: "chk.x", referenciaVersion: 4, respuestaId: "r9", titulo: "T", datos: {} } as never,
      "checklist",
    );
    expect(ref).toMatchObject({ clase: "checklist", clave: "chk.x", version: 4, respuestaId: "r9" });
  });

  it("coaccionarDefinicion valida y devuelve null ante entrada inválida", () => {
    expect(coaccionarDefinicion(DEF_ASOCIADA)).toBeTruthy();
    expect(coaccionarDefinicion({ no: "es-definicion" })).toBeNull();
    expect(coaccionarDefinicion(null)).toBeNull();
  });
});

describe("CapturaPlantilla · renderiza la definición ASOCIADA y ancla la respuesta", () => {
  beforeEach(() => { localStorage.clear(); mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("resuelve la plantilla por clave+versión EXACTA y muestra su campo distintivo", async () => {
    render(<Wrap asociacion={ASOCIACION} />);
    // El campo sólo existe en la definición ASOCIADA resuelta desde Dynamic Forms.
    await waitFor(() => expect(screen.getByText("Estado de la válvula maestra")).toBeInTheDocument());
    // Se solicitó exactamente la versión asociada (v3), no otra.
    expect(peticiones.some((p) => /\/plantillas\/chk\.seguridad\.pozo\/3$/.test(p.url))).toBe(true);
    // Muestra el ancla visible clave · versión.
    expect(screen.getByText("chk.seguridad.pozo · v3")).toBeInTheDocument();
  });

  it("al guardar, POSTea a /:clase/respuesta ANCLADO a la clave+versión asociada", async () => {
    render(<Wrap asociacion={ASOCIACION} />);
    await waitFor(() => expect(screen.getByText("Estado de la válvula maestra")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Guardar checklist/i }));
    await waitFor(() => {
      const captura = peticiones.find((p) => /\/OT-000002\/checklist\/respuesta$/.test(p.url));
      expect(captura, "no se emitió la captura de respuesta").toBeTruthy();
      expect(captura!.body!["clave"]).toBe("chk.seguridad.pozo");
      expect(captura!.body!["version"]).toBe(3);
      // Sin expectedVersion: el anclaje re-lee la versión actual (recuperable);
      // la operación viaja idempotente por opId (replay por /sync offline).
      expect(captura!.body!["expectedVersion"]).toBeUndefined();
      expect(captura!.body!["opId"]).toBeTruthy();
    });
  });

  it("si la definición no está disponible (404), muestra el aviso y NO renderiza el formulario", async () => {
    render(<Wrap asociacion={{ ...ASOCIACION, clave: "inexistente", version: 9 }} />);
    await waitFor(() => expect(screen.getByText(/Definición no disponible/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Guardar/i })).toBeNull();
  });
});
