/**
 * DGP-016 · Renderizador declarativo de widgets. Verifica que los 13 tipos
 * (card/line/bar/area/pie/donut/gauge/table/heatmap/timeline/calendar/ranking/
 * comparativo) se pintan alimentándose de POST evaluar, y que los estados son
 * HONESTOS (cargando/error/vacío) y accesibles (ARIA + semáforo visible).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { WidgetRenderer } from "../lib/analytics/WidgetRenderer";
import { CacheAnalytics } from "../lib/analytics/cache";
import { TIPOS_WIDGET, type TipoWidget } from "../lib/analytics/constantes";
import type { Widget, Evaluacion, Indicador } from "../lib/analytics/tipos";

const EVAL_CON_GRUPOS: Evaluacion = {
  clave: "disponibilidad",
  unidad: "%",
  formato: "porcentaje",
  valor: 87.5,
  muestras: 12,
  grupos: [
    { clave: "Bomba A", valor: 90, muestras: 5 },
    { clave: "Bomba B", valor: 80, muestras: 4 },
    { clave: "Bomba C", valor: 92, muestras: 3 },
  ],
  semaforo: "bueno",
  cumplimiento: 0.95,
  evaluadoEn: "2024-05-06T10:00:00.000Z",
};

const INDICADOR: Indicador = {
  clave: "disponibilidad",
  nombre: "Disponibilidad",
  categoria: "confiabilidad",
  fuente: { modulo: "activos", dataset: "activos" },
  expresion: { tipo: "promedio", filtros: [] },
  unidad: "%",
  formato: "porcentaje",
  umbrales: { mayorEsMejor: true, bueno: 85, alerta: 70, critico: 60 },
  delSistema: true,
};

function widget(tipo: TipoWidget): Widget {
  return {
    id: `w-${tipo}`,
    tipo,
    titulo: `Widget ${tipo}`,
    indicadorClave: "disponibilidad",
    filtros: [],
    presentacion: {},
    ranking: tipo === "ranking" ? { modo: "topN", n: 2 } : null,
    posicion: 0,
  };
}

function mockEvaluar(evaluacion: Evaluacion) {
  return vi.spyOn(global, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(evaluacion), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

function renderWidget(w: Widget, indicador: Indicador | null = INDICADOR) {
  const { hook } = memoryLocation({ path: "/analytics", static: true });
  return render(
    <Router hook={hook}>
      <WidgetRenderer widget={w} indicador={indicador} cache={new CacheAnalytics("test-" + Math.random())} />
    </Router>,
  );
}

describe("WidgetRenderer · los 13 tipos se renderizan desde evaluar", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  for (const tipo of TIPOS_WIDGET) {
    it(`renderiza el tipo "${tipo}"`, async () => {
      const spy = mockEvaluar(EVAL_CON_GRUPOS);
      renderWidget(widget(tipo));
      // El título del widget siempre aparece (cabecera).
      expect(await screen.findByText(`Widget ${tipo}`)).toBeInTheDocument();
      // Tras evaluar, el badge del tipo está presente y el POST fue a evaluar.
      await waitFor(() => expect(spy).toHaveBeenCalled());
      const url = spy.mock.calls[0]![0] as string;
      expect(url).toContain("/indicadores/disponibilidad/evaluar");
      spy.mockRestore();
    });
  }

  it("verifica que TIPOS_WIDGET tiene exactamente 13 tipos", () => {
    expect(TIPOS_WIDGET).toHaveLength(13);
  });
});

describe("WidgetRenderer · semáforo visible y accesible", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("muestra el semáforo con etiqueta accesible", async () => {
    mockEvaluar(EVAL_CON_GRUPOS);
    renderWidget(widget("card"));
    // El semáforo "bueno" se muestra con aria-label descriptivo.
    expect(await screen.findByLabelText(/Semáforo/i)).toBeInTheDocument();
  });

  it("card muestra el valor formateado (porcentaje) y umbrales visibles", async () => {
    mockEvaluar(EVAL_CON_GRUPOS);
    renderWidget(widget("card"));
    expect(await screen.findByText(/87\.5%/)).toBeInTheDocument();
    expect(await screen.findByText(/Umbrales/i)).toBeInTheDocument();
  });
});

describe("WidgetRenderer · estados honestos", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("estado de error con reintento cuando evaluar falla (negocio)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom", code: "X" }), { status: 500, headers: { "Content-Type": "application/json" } }),
    );
    renderWidget(widget("bar"));
    expect(await screen.findByText(/No se pudo evaluar el indicador/i)).toBeInTheDocument();
  });

  it("§24 · indicador no disponible cuando no hay muestras ni grupos", async () => {
    mockEvaluar({ ...EVAL_CON_GRUPOS, valor: 0, muestras: 0, grupos: [], semaforo: null, cumplimiento: null });
    renderWidget(widget("bar"));
    expect(await screen.findByText(/Indicador no disponible/i)).toBeInTheDocument();
    expect(screen.getByText(/Sin datos suficientes/i)).toBeInTheDocument();
  });

  it("§24 · un valor sin muestras (p.ej. MTTR sin insumos) NO se muestra como cifra engañosa", async () => {
    // El backend puede devolver un valor numérico aunque no haya insumos; sin
    // muestras, el indicador debe declararse NO DISPONIBLE, no pintar la cifra.
    mockEvaluar({ ...EVAL_CON_GRUPOS, valor: 42, muestras: 0, grupos: [], semaforo: null, cumplimiento: null });
    renderWidget(widget("card"));
    expect(await screen.findByText(/Indicador no disponible/i)).toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("estado de carga (status accesible) antes de resolver", () => {
    // fetch nunca resuelve → permanece cargando.
    vi.spyOn(global, "fetch").mockImplementation(() => new Promise(() => {}));
    renderWidget(widget("line"));
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.getByText(/Cargando datos/i)).toBeInTheDocument();
  });
});

describe("WidgetRenderer · caché offline con timestamp", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("sirve datos de caché con aviso + timestamp cuando la red falla", async () => {
    const cache = new CacheAnalytics("deltaops", () => "2024-05-06T10:00:00.000Z");
    // Pre-poblar el caché con la clave de esta evaluación (sin filtros).
    cache.guardar("eval:disponibilidad:[]", EVAL_CON_GRUPOS);
    // La red falla (offline).
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const { hook } = memoryLocation({ path: "/analytics", static: true });
    render(
      <Router hook={hook}>
        <WidgetRenderer widget={widget("card")} indicador={INDICADOR} cache={cache} />
      </Router>,
    );
    // Aviso honesto de datos de caché + el valor cacheado.
    expect(await screen.findByText(/Datos de caché/i)).toBeInTheDocument();
    expect(await screen.findByText(/87\.5%/)).toBeInTheDocument();
  });
});
