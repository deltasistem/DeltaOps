/**
 * DGP-014 · Pruebas PURAS del calendario y del Gantt del preventivo, y de los
 * deep links (ruta → estado inicial de filtros). Sin red ni DOM: la lógica de
 * agrupación por vista, densidad, filtros, orden topológico por dependencias y
 * validación de dependencias es determinista.
 */
import { describe, it, expect } from "vitest";
import {
  claveDia, claveMes, claveAnio, claveSemana,
  agruparPorVista, filtrarProgramaciones, construirGantt, validarDependencias,
} from "../lib/preventivo/calendario";
import type { Programacion, ActividadRow } from "../lib/preventivo/tipos";
import {
  urlProgramas, urlPrograma, urlNuevoPrograma, urlCalendario, urlEscanear,
  urlSincronizacion, leerParam,
} from "../lib/preventivo/deep-links";
import {
  ACCIONES_PROGRAMA_POR_ESTADO, ETIQUETA_ESTADO_PROGRAMA,
} from "../lib/preventivo/constantes";

/* ------------------------------ Claves de fecha ------------------------- */

describe("calendario · claves de fecha deterministas (UTC)", () => {
  it("día/mes/año se derivan por corte del ISO", () => {
    expect(claveDia("2026-02-14T09:30:00Z")).toBe("2026-02-14");
    expect(claveMes("2026-02-14")).toBe("2026-02");
    expect(claveAnio("2026-02-14")).toBe("2026");
  });
  it("semana ISO-8601: 2026-01-01 es W01 y 2025-12-29 (lunes) es W01/2026", () => {
    expect(claveSemana("2026-01-01")).toBe("2026-W01");
    expect(claveSemana("2025-12-29")).toBe("2026-W01");
  });
});

/* ------------------------------ Agrupación ------------------------------ */

const OCURRENCIAS: Programacion[] = [
  { fecha: "2026-01-10", programaId: "p1", activoId: "a1", estado: "planificado" },
  { fecha: "2026-01-10", programaId: "p1", activoId: "a2", estado: "vencido" },
  { fecha: "2026-01-11", programaId: "p2", activoId: "a1", estado: "planificado" },
  { fecha: "2026-02-01", programaId: "p1", activoId: "a1", estado: "generado" },
];

describe("calendario · agrupación por vista y densidad", () => {
  it("vista anual agrupa por mes y ordena por clave ascendente", () => {
    const grupos = agruparPorVista(OCURRENCIAS, "anual");
    expect(grupos.map((g) => g.clave)).toEqual(["2026-01", "2026-02"]);
    expect(grupos[0]!.densidad).toBe(3);
    expect(grupos[1]!.densidad).toBe(1);
  });
  it("vista mensual/semanal/diaria agrupan por día", () => {
    const g = agruparPorVista(OCURRENCIAS, "mensual");
    expect(g.map((x) => x.clave)).toEqual(["2026-01-10", "2026-01-11", "2026-02-01"]);
    expect(g[0]!.densidad).toBe(2);
  });
  it("ignora ocurrencias sin fecha", () => {
    const con = [...OCURRENCIAS, { fecha: "" } as Programacion];
    expect(agruparPorVista(con, "mensual").reduce((n, x) => n + x.densidad, 0)).toBe(4);
  });
});

describe("calendario · filtros por programa/activo/estado", () => {
  it("filtra por programa", () => {
    expect(filtrarProgramaciones(OCURRENCIAS, { programaId: "p2" }).length).toBe(1);
  });
  it("filtra por activo", () => {
    expect(filtrarProgramaciones(OCURRENCIAS, { activoId: "a1" }).length).toBe(3);
  });
  it("filtra por estado", () => {
    expect(filtrarProgramaciones(OCURRENCIAS, { estado: "planificado" }).length).toBe(2);
  });
  it("combina filtros y se aplica dentro de agruparPorVista", () => {
    const g = agruparPorVista(OCURRENCIAS, "anual", { programaId: "p1", activoId: "a1" });
    expect(g.reduce((n, x) => n + x.densidad, 0)).toBe(2);
  });
});

/* -------------------------------- Gantt --------------------------------- */

const ACTIVIDADES: ActividadRow[] = [
  { id: "c", programaId: "p1", nombre: "Montaje", orden: 3, dependencias: ["b"], tiempoEstimado: { valor: 8, unidad: "h" } },
  { id: "a", programaId: "p1", nombre: "Desmontaje", orden: 1, tiempoEstimado: { valor: 8, unidad: "h" } },
  { id: "b", programaId: "p1", nombre: "Inspección", orden: 2, dependencias: ["a"], tiempoEstimado: { valor: 8, unidad: "h" } },
];

describe("gantt · orden topológico por dependencias", () => {
  it("a(inicio 0) → b(inicio 1) → c(inicio 2), cada uno 1 carril (8h)", () => {
    const barras = construirGantt(ACTIVIDADES);
    const porId = Object.fromEntries(barras.map((x) => [x.actividadId, x]));
    expect(porId.a!.inicio).toBe(0);
    expect(porId.b!.inicio).toBe(1);
    expect(porId.c!.inicio).toBe(2);
    expect(porId.a!.duracion).toBe(1);
    // presentación ordenada por inicio
    expect(barras.map((x) => x.actividadId)).toEqual(["a", "b", "c"]);
  });
  it("duración: días y minutos se normalizan a carriles de 8h", () => {
    const barras = construirGantt([
      { id: "x", programaId: "p", nombre: "X", orden: 1, tiempoEstimado: { valor: 2, unidad: "d" } },
      { id: "y", programaId: "p", nombre: "Y", orden: 2, tiempoEstimado: { valor: 30, unidad: "min" } },
    ]);
    const porId = Object.fromEntries(barras.map((b) => [b.actividadId, b]));
    expect(porId.x!.duracion).toBe(2); // 2d = 16h → 2 carriles
    expect(porId.y!.duracion).toBe(1); // 30min → mínimo 1
  });
  it("degrada de forma estable ante ciclos (no lanza, inicio finito)", () => {
    const ciclo: ActividadRow[] = [
      { id: "m", programaId: "p", nombre: "M", orden: 1, dependencias: ["n"] },
      { id: "n", programaId: "p", nombre: "N", orden: 2, dependencias: ["m"] },
    ];
    const barras = construirGantt(ciclo);
    expect(barras.length).toBe(2);
    for (const b of barras) expect(Number.isFinite(b.inicio)).toBe(true);
  });
});

describe("gantt · validación de dependencias del editor", () => {
  it("detecta auto-referencia", () => {
    expect(validarDependencias(ACTIVIDADES, "a", ["a"])).toContain("Una actividad no puede depender de sí misma.");
  });
  it("detecta dependencia inexistente", () => {
    expect(validarDependencias(ACTIVIDADES, "a", ["zzz"]).some((m) => m.includes("zzz"))).toBe(true);
  });
  it("detecta ciclo transitivo", () => {
    // a depende de b, b de a: objetivo a con dep b crea ciclo
    const acts: ActividadRow[] = [
      { id: "a", programaId: "p", nombre: "A", orden: 1, dependencias: ["b"] },
      { id: "b", programaId: "p", nombre: "B", orden: 2, dependencias: ["a"] },
    ];
    expect(validarDependencias(acts, "a", ["b"])).toContain("Las dependencias crean un ciclo.");
  });
  it("acepta dependencias válidas sin problemas", () => {
    expect(validarDependencias(ACTIVIDADES, "c", ["b"])).toEqual([]);
  });
});

/* ------------------------------ Deep links ------------------------------ */

describe("deep links · ruta ↔ estado de filtros", () => {
  it("urlProgramas codifica estado/tipo y se releen con leerParam", () => {
    const url = urlProgramas({ estado: "PUBLICADO", tipo: "preventivo" });
    const qs = url.split("?")[1] ?? "";
    expect(leerParam(qs, "estado")).toBe("PUBLICADO");
    expect(leerParam(qs, "tipo")).toBe("preventivo");
  });
  it("urlCalendario codifica vista/programa/activo", () => {
    const url = urlCalendario({ vista: "mensual", programa: "p1", activo: "a1" });
    const qs = url.split("?")[1] ?? "";
    expect(leerParam(qs, "vista")).toBe("mensual");
    expect(leerParam(qs, "programa")).toBe("p1");
    expect(leerParam(qs, "activo")).toBe("a1");
  });
  it("urlNuevoPrograma ancla activo/padreId", () => {
    const qs = urlNuevoPrograma({ activo: "a1", padreId: "p0" }).split("?")[1] ?? "";
    expect(leerParam(qs, "activo")).toBe("a1");
    expect(leerParam(qs, "padreId")).toBe("p0");
  });
  it("rutas base son estables", () => {
    expect(urlPrograma("p1")).toContain("/preventivo/programas/p1");
    expect(urlEscanear()).toContain("/preventivo/escanear");
    expect(urlSincronizacion()).toContain("/preventivo/sincronizacion");
  });
});

/* ------------------------ Workflow por estado --------------------------- */

describe("workflow · las acciones disponibles dependen del estado (por botón)", () => {
  it("BORRADOR ofrece enviarRevision; PUBLICADO ofrece suspender/archivar", () => {
    expect(ACCIONES_PROGRAMA_POR_ESTADO.BORRADOR).toContain("enviarRevision");
    expect(ACCIONES_PROGRAMA_POR_ESTADO.PUBLICADO).toContain("suspender");
    expect(ACCIONES_PROGRAMA_POR_ESTADO.SUSPENDIDO).toContain("reanudar");
  });
  it("ARCHIVADO no ofrece transiciones de avance", () => {
    expect(ACCIONES_PROGRAMA_POR_ESTADO.ARCHIVADO ?? []).not.toContain("publicar");
  });
  it("todos los estados tienen etiqueta legible", () => {
    for (const e of ["BORRADOR", "EN_REVISION", "PUBLICADO", "SUSPENDIDO", "ARCHIVADO"] as const) {
      expect(ETIQUETA_ESTADO_PROGRAMA[e]).toBeTruthy();
    }
  });
});
