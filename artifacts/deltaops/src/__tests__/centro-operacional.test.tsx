/**
 * DGP-018 · Centro Operacional (landing empresarial) por ROL.
 *
 * Verifica que la landing compone DATOS REALES del read model de Órdenes y que:
 *  - Cada rol ve su resumen operacional y su bandeja "de hoy" adecuada.
 *  - CONSULTA no ve controles de escritura (Nueva orden / Nuevo activo /
 *    Registrar lectura); los roles operativos sí (según capacidades/módulos).
 *  - Los estados vacíos se muestran correctamente (sin métricas inventadas).
 *  - Los accesos rápidos se filtran por capacidad y entitlement.
 *  - Las funciones PURAS de composición del resumen agregan correctamente.
 *
 * La autorización real permanece en el backend; esto sólo compone/oculta UI.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import InicioEmpresa from "../pages/inicio-empresa";
import { SesionProvider } from "../lib/identidad/sesion";
import {
  resumenOperacional,
  activosConOrdenes,
  alertasOperacionales,
  ordenesDeHoy,
  esAbierta,
} from "../lib/centro/resumen";
import type { Sesion, Rol } from "../lib/identidad/tipos";
import type { OrdenRow } from "../lib/ordenes/tipos";

const MODULOS_9 = [
  "referencia", "activos", "ordenes", "inventario", "planes",
  "abastecimiento", "preventivo", "correctivo", "analytics",
] as const;

function sesion(rol: Rol, over: Partial<Sesion> = {}): Sesion {
  return {
    identityId: "u1",
    email: "user@delta.demo",
    nombre: "Usuaria Demo",
    tenant: { id: "delta-demo", codigo: "DEMO", nombre: "Delta Demo", estado: "ACTIVO", branding: {} },
    rol,
    modulos: [...MODULOS_9],
    membresias: [],
    ...over,
  };
}

const AHORA = Date.parse("2024-06-01T12:00:00.000Z");

function orden(over: Partial<OrdenRow> & { id: string }): OrdenRow {
  return {
    tenantId: "delta-demo",
    codigo: `OT-${over.id}`,
    titulo: `Orden ${over.id}`,
    estado: "ABIERTA",
    tipo: "correctiva",
    categoria: null,
    prioridad: null,
    severidad: null,
    responsable: "Técnico A",
    supervisor: null,
    activoPrincipalId: null,
    ubicacionId: null,
    datos: {},
    version: 1,
    lastEventId: "e1",
    actualizadoAt: "2024-06-01T00:00:00.000Z",
    ...over,
  } as OrdenRow;
}

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Backend simulado: sesión + branding + listado de órdenes real. */
function backend(ses: Sesion, ordenes: OrdenRow[]) {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (url.includes("/auth/session")) return resp(ses);
    if (url.includes("/tenant/branding")) return resp(ses.tenant.branding ?? {});
    if (url.includes("/api/deltaops/ordenes")) return resp({ ordenes });
    return resp(null);
  });
}

function renderLanding(ses: Sesion, ordenes: OrdenRow[] = []) {
  backend(ses, ordenes);
  const { hook } = memoryLocation({ path: "/", static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <SesionProvider>
          <InicioEmpresa />
        </SesionProvider>
      </Router>
    </QueryClientProvider>,
  );
}

beforeEach(() => { cleanup(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

/* --------------------------- Funciones puras ---------------------------- */

describe("resumen operacional (composición pura, sin BI)", () => {
  const ordenes: OrdenRow[] = [
    orden({ id: "1", estado: "ABIERTA", responsable: null }),
    orden({ id: "2", estado: "EN_EJECUCION" }),
    orden({ id: "3", estado: "ASIGNADA" }),
    orden({ id: "4", estado: "CERRADA" }),
    orden({ id: "5", estado: "CANCELADA" }),
    orden({ id: "6", estado: "ABIERTA", prioridad: "critica" }),
    orden({ id: "7", estado: "ABIERTA", datos: { sla: { vencimiento: "2024-05-30T00:00:00.000Z" } } }),
    orden({ id: "8", estado: "ABIERTA", datos: { sla: { vencimiento: "2024-06-01T18:00:00.000Z" } } }),
  ];

  it("distingue abiertas de finales", () => {
    expect(esAbierta(orden({ id: "a", estado: "ABIERTA" }))).toBe(true);
    expect(esAbierta(orden({ id: "b", estado: "CERRADA" }))).toBe(false);
    expect(esAbierta(orden({ id: "c", estado: "CANCELADA" }))).toBe(false);
  });

  it("agrega abiertas, en ejecución, pendientes, sin asignar, críticas y SLA", () => {
    const r = resumenOperacional(ordenes, AHORA);
    expect(r.abiertas.length).toBe(6); // 4 y 5 son finales
    expect(r.enEjecucion.length).toBe(1);
    expect(r.pendientes.map((o) => o.id).sort()).toEqual(["1", "3", "6", "7", "8"]);
    expect(r.sinAsignar.map((o) => o.id)).toEqual(["1"]);
    expect(r.criticas.map((o) => o.id)).toEqual(["6"]);
    expect(r.vencidas.map((x) => x.o.id)).toEqual(["7"]); // vence en el pasado
    expect(r.enRiesgo.map((x) => x.o.id)).toEqual(["8"]); // vence en 6h → crítico
  });

  it("compone alertas sólo a partir de señales reales", () => {
    const r = resumenOperacional(ordenes, AHORA);
    const claves = alertasOperacionales(r).map((a) => a.clave).sort();
    expect(claves).toEqual(["criticas", "sin-asignar", "sla-riesgo", "sla-vencido"]);
    expect(alertasOperacionales(resumenOperacional([], AHORA))).toEqual([]);
  });

  it("agrupa activos con órdenes y marca los que requieren atención", () => {
    const conActivo: OrdenRow[] = [
      orden({ id: "a1", estado: "ABIERTA", activoPrincipalId: "ACT-1", prioridad: "critica" }),
      orden({ id: "a2", estado: "ABIERTA", activoPrincipalId: "ACT-1" }),
      orden({ id: "a3", estado: "ABIERTA", activoPrincipalId: "ACT-2" }),
    ];
    const grupos = activosConOrdenes(conActivo, AHORA);
    expect(grupos.length).toBe(2);
    expect(grupos[0].activoId).toBe("ACT-1"); // atención primero
    expect(grupos[0].requiereAtencion).toBe(true);
    expect(grupos.find((g) => g.activoId === "ACT-2")!.requiereAtencion).toBe(false);
  });

  it("selecciona órdenes de hoy por vencimiento/inicio dentro del día local", () => {
    const hoy = ordenesDeHoy(ordenes, AHORA).map((o) => o.id);
    expect(hoy).toContain("8"); // vence hoy 18:00Z
    expect(hoy).not.toContain("7"); // venció ayer
  });
});

/* --------------------------- Landing por rol ---------------------------- */

describe("Centro Operacional · resumen con datos reales", () => {
  it("TENANT_ADMIN ve el resumen operacional con conteos reales", async () => {
    renderLanding(sesion("TENANT_ADMIN"), [
      orden({ id: "1", estado: "ABIERTA" }),
      orden({ id: "2", estado: "EN_EJECUCION" }),
    ]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    // LITE-08 §23: sección de indicadores (antes «Resumen operacional»). Se
    // consulta por rol de encabezado para no confundir con el grupo de nav.
    expect(await screen.findByRole("heading", { name: "Indicadores" })).toBeInTheDocument();
    expect(screen.getByText("Abiertas")).toBeInTheDocument();
    // "En ejecución" aparece como KPI y como acceso de integración → basta con ≥1.
    expect(screen.getAllByText("En ejecución").length).toBeGreaterThan(0);
  });

  it("muestra estado vacío correcto cuando no hay órdenes abiertas", async () => {
    renderLanding(sesion("SUPERVISOR"), []);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(await screen.findByText(/Sin órdenes abiertas/i)).toBeInTheDocument();
  });

  it("TECNICO sin órdenes de hoy ve su estado vacío específico", async () => {
    renderLanding(sesion("TECNICO"), [
      // Abierta con responsable de otra persona (nombre) → no hay match estricto
      // con la identidad de la sesión → no entra en "mi trabajo de hoy" ni foco.
      orden({ id: "9", estado: "ABIERTA", responsable: "Técnico A" }),
    ]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    // El mensaje aparece tanto en el foco como en la bandeja "Mi trabajo": ≥1.
    expect((await screen.findAllByText(/No tienes órdenes asignadas para hoy/i)).length).toBeGreaterThan(0);
  });
});

/* ------------------- Controles gated por capacidad --------------------- */

describe("Centro Operacional · accesos gated por capacidad/entitlement", () => {
  it("CONSULTA no ve controles de escritura (Nueva orden / Nuevo activo / Registrar lectura)", async () => {
    renderLanding(sesion("CONSULTA"), [orden({ id: "1", estado: "ABIERTA" })]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(await screen.findByText("Accesos rápidos")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Nueva orden/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Nuevo activo/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Registrar lectura/i })).toBeNull();
    // Los accesos de solo lectura sí están disponibles (aparece en accesos y navegación).
    expect(screen.getAllByRole("link", { name: /Inventario/i }).length).toBeGreaterThan(0);
  });

  it("TENANT_ADMIN sí ve los accesos de escritura", async () => {
    renderLanding(sesion("TENANT_ADMIN"), [orden({ id: "1", estado: "ABIERTA" })]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(await screen.findByRole("link", { name: /Nueva orden/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nuevo activo/i })).toBeInTheDocument();
  });

  it("oculta accesos cuyo módulo no está habilitado", async () => {
    renderLanding(sesion("TECNICO", { modulos: ["ordenes"] }), []);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    await screen.findByText("Accesos rápidos");
    // Inventario no está habilitado → su acceso rápido no aparece.
    expect(screen.queryByRole("link", { name: /^Inventario$/i })).toBeNull();
    // Mis órdenes (módulo ordenes) sí (aparece en foco técnico y accesos rápidos).
    expect(screen.getAllByRole("link", { name: /Mis órdenes/i }).length).toBeGreaterThan(0);
  });

  it("sólo TENANT_ADMIN ve administración de empresa", async () => {
    renderLanding(sesion("SUPERVISOR"), []);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(screen.queryByRole("button", { name: /Administrar usuarios/i })).toBeNull();
  });
});
