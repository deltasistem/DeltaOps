/**
 * DGP-016 · Experiencia Analytics: contrato de rutas, filtros→URL (deep links),
 * accesibilidad y responsividad del renderizador de dashboards.
 *
 * Se renderizan componentes internos (sin Shell) con fetch mockeado, siguiendo
 * el patrón de las pruebas de página del monorepo.
 */
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DashboardRenderer } from "../lib/analytics/DashboardRenderer";
import { FiltrosGlobalesPanel } from "../lib/analytics/FiltrosGlobales";
import { CacheAnalytics } from "../lib/analytics/cache";
import { leerFiltrosDeUrl, escribirFiltrosEnUrl, type FiltrosGlobales } from "../lib/analytics/filtros";
import type { Dashboard, Evaluacion, Indicador } from "../lib/analytics/tipos";

/* ------------------------------- Fixtures ------------------------------- */

const EVALUACION: Evaluacion = {
  clave: "disponibilidad", unidad: "%", formato: "porcentaje", valor: 88, muestras: 10,
  grupos: [{ clave: "A", valor: 90, muestras: 5 }, { clave: "B", valor: 86, muestras: 5 }],
  semaforo: "bueno", cumplimiento: 0.9, evaluadoEn: "2024-05-06T10:00:00.000Z",
};
const INDICADORES: Indicador[] = [
  { clave: "disponibilidad", nombre: "Disponibilidad", categoria: "confiabilidad", fuente: { modulo: "activos", dataset: "activos" }, expresion: { tipo: "promedio", filtros: [] }, unidad: "%", formato: "porcentaje", delSistema: true },
];
const DASHBOARD: Dashboard = {
  id: "d1", clave: "ejecutivo", nombre: "Ejecutivo", descripcion: "KPIs", delSistema: true,
  widgets: [
    { id: "w1", tipo: "card", titulo: "Disponibilidad", indicadorClave: "disponibilidad", filtros: [], presentacion: {}, ranking: null, posicion: 0 },
    { id: "w2", tipo: "bar", titulo: "Por activo", indicadorClave: "disponibilidad", filtros: [], presentacion: {}, ranking: null, posicion: 1 },
  ],
};

function mockApi(capturas?: { evaluarBodies: unknown[] }) {
  return vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    if (/\/indicadores\/[^/]+\/evaluar/.test(url)) {
      if (capturas && init?.body) capturas.evaluarBodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify(EVALUACION), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/indicadores(\?|$)/.test(url)) {
      return new Response(JSON.stringify({ indicadores: INDICADORES }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function renderEn(ruta: string, ui: React.ReactNode) {
  const { hook } = memoryLocation({ path: ruta, static: true });
  return render(<Router hook={hook}>{ui}</Router>);
}

/* -------------------------------- Contrato ------------------------------ */

describe("contrato de rutas · Analytics registra las superficies esperadas", () => {
  it("App declara las rutas de la sección (estáticas antes de :id)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
    for (const ruta of [
      '/analytics"',
      '/analytics/indicadores"',
      '/analytics/indicadores/:clave"',
      '/analytics/sincronizacion"',
      '/analytics/dashboards/nuevo"',
      '/analytics/dashboards/:id/editar"',
      '/analytics/dashboards/:id"',
    ]) {
      expect(src).toContain(ruta);
    }
    // La ruta estática de dashboards/nuevo va ANTES de dashboards/:id.
    expect(src.indexOf("/analytics/dashboards/nuevo")).toBeLessThan(src.indexOf('/analytics/dashboards/:id"'));
  });
});

/* ------------------------------ Filtros→URL ----------------------------- */

describe("filtros globales → URL (deep links) y consumo por evaluar", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("el panel refleja filtros de la URL y notifica cambios serializables a URL", async () => {
    function Host() {
      const [f, setF] = useState<FiltrosGlobales>(leerFiltrosDeUrl("?activo=A1"));
      return (
        <>
          <FiltrosGlobalesPanel valor={f} onCambio={setF} />
          <output data-testid="url">{escribirFiltrosEnUrl(f)}</output>
        </>
      );
    }
    mockApi();
    renderEn("/analytics/dashboards/d1?activo=A1", <Host />);
    // El valor inicial viene de la URL.
    const activo = await screen.findByLabelText("Activo");
    expect((activo as HTMLInputElement).value).toBe("A1");
    // Cambiar una dimensión produce una URL determinista.
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "abierta" } });
    await waitFor(() => expect(screen.getByTestId("url").textContent).toContain("estado=abierta"));
    expect(screen.getByTestId("url").textContent).toContain("activo=A1");
  });

  it("los filtros globales viajan en el cuerpo de evaluar (combinados por widget)", async () => {
    const capturas = { evaluarBodies: [] as unknown[] };
    mockApi(capturas);
    renderEn(
      "/analytics/dashboards/d1",
      <DashboardRenderer dashboard={DASHBOARD} filtrosGlobales={{ activo: "A1" }} cache={new CacheAnalytics("t1")} />,
    );
    await waitFor(() => expect(capturas.evaluarBodies.length).toBeGreaterThan(0));
    const body = capturas.evaluarBodies[0] as { filtros: { dimension: string; valor: unknown }[] };
    expect(body.filtros.some((f) => f.dimension === "activo" && f.valor === "A1")).toBe(true);
  });
});

/* -------------------------- Accesibilidad / responsive ------------------ */

describe("accesibilidad y responsividad del dashboard", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("la retícula es una lista accesible con un listitem por widget", async () => {
    mockApi();
    renderEn("/analytics/dashboards/d1", <DashboardRenderer dashboard={DASHBOARD} cache={new CacheAnalytics("t2")} />);
    const lista = await screen.findByRole("list", { name: /Widgets de Ejecutivo/i });
    expect(lista).toBeInTheDocument();
    const items = within(lista).getAllByRole("listitem");
    expect(items).toHaveLength(2);
  });

  it("la retícula usa columnas fluidas (auto-fill/minmax) para responsividad", async () => {
    mockApi();
    renderEn("/analytics/dashboards/d1", <DashboardRenderer dashboard={DASHBOARD} cache={new CacheAnalytics("t3")} />);
    const lista = await screen.findByRole("list", { name: /Widgets de Ejecutivo/i });
    expect((lista as HTMLElement).style.gridTemplateColumns).toContain("auto-fill");
    expect((lista as HTMLElement).style.gridTemplateColumns).toContain("minmax");
  });

  it("cada widget es un group con nombre accesible", async () => {
    mockApi();
    renderEn("/analytics/dashboards/d1", <DashboardRenderer dashboard={DASHBOARD} cache={new CacheAnalytics("t4")} />);
    expect(await screen.findByRole("group", { name: "Disponibilidad" })).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "Por activo" })).toBeInTheDocument();
  });

  it("el panel de filtros es una región con nombre accesible", async () => {
    mockApi();
    renderEn("/analytics/dashboards/d1", <FiltrosGlobalesPanel valor={{}} onCambio={() => {}} />);
    expect(await screen.findByRole("region", { name: /Filtros globales/i })).toBeInTheDocument();
  });
});
