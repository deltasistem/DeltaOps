/**
 * DGP-016 · Pruebas de MÓDULO (end-to-end, ETAPA 1 — DOMINIO): motor de
 * evaluación (cada tipo de expresión, MTBF/MTTR desde eventos crudos, umbrales,
 * metas, filtros, ventanas, agrupadores, ratios/tasas), definiciones con
 * versionado inmutable, dashboards del sistema y personalizados con policies de
 * propiedad, snapshots idempotentes por clave determinista + opId, capacidades
 * por permiso, fail-safe por fuente ausente, catálogos y OCC.
 *
 * NO toca persistencia real: todo se ejerce con FAKES en memoria vía el runtime
 * de pruebas (`crearAnalyticsRuntime`).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MODULO,
  crearAnalyticsRuntime,
  crearFuentesDemo,
  principalCon,
  CATALOGO_INDICADORES,
  CATALOGO_DASHBOARDS,
  CLAVES_INDICADORES_SISTEMA,
  CLAVES_DASHBOARDS_SISTEMA,
  crearExpresion,
  crearFiltro,
  evaluarExpresion,
  aplicarFiltros,
  clasificarSemaforo,
  cumplimientoMeta,
  claveDeterminista,
  crearDefinicion,
  actualizarDefinicion,
  crearWidget,
  DIMENSIONES,
  OPERADORES,
  TIPOS_EXPRESION,
  TIPOS_WIDGET,
  type AnalyticsRuntime,
  type Filtro,
} from "..";

const TENANT = "t-analytics";
let rt: AnalyticsRuntime;

async function exec(nombre: string, input: Record<string, unknown> = {}, principal = rt.ctx(TENANT).principal) {
  const r = await rt.platform.kernel.commands.execute(rt.ctx(TENANT, principal), nombre, input);
  await rt.platform.kernel.outboxProcessor.processPending();
  return r;
}
async function query(nombre: string, input: Record<string, unknown> = {}, principal = rt.ctx(TENANT).principal) {
  return rt.platform.kernel.queries.execute(rt.ctx(TENANT, principal), nombre, input);
}

async function sembrar() {
  const r = await exec(`${MODULO}.sembrar-sistema`, {});
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { indicadores: number; dashboards: number };
}

beforeEach(() => {
  rt = crearAnalyticsRuntime();
});

/* --------------------------- Catálogo canónico --------------------------- */

describe("catálogo canónico de indicadores (COMO DATOS)", () => {
  it("define al menos 28 indicadores canónicos", () => {
    expect(CATALOGO_INDICADORES.length).toBeGreaterThanOrEqual(28);
  });
  it("todas las claves son únicas", () => {
    const set = new Set(CLAVES_INDICADORES_SISTEMA);
    expect(set.size).toBe(CLAVES_INDICADORES_SISTEMA.length);
  });
  it("incluye los indicadores obligatorios de la fase", () => {
    for (const c of ["disponibilidad", "utilizacion", "confiabilidad", "mtbf", "mttr", "backlog", "cumplimiento-sla", "compras-generadas"]) {
      expect(CLAVES_INDICADORES_SISTEMA).toContain(c);
    }
  });
  it("cada indicador tiene fuente declarativa y expresión válida", () => {
    for (const i of CATALOGO_INDICADORES) {
      expect(i.fuente.modulo).toBeTruthy();
      expect(i.fuente.dataset).toBeTruthy();
      expect(TIPOS_EXPRESION).toContain(i.expresion.tipo);
    }
  });
  it("declara exactamente 8 dashboards del sistema", () => {
    expect(CATALOGO_DASHBOARDS.length).toBe(8);
    expect(CLAVES_DASHBOARDS_SISTEMA).toEqual([
      "ejecutivo", "operativo", "inventario", "activos", "ordenes", "correctivo", "preventivo", "compras",
    ]);
  });
  it("cada widget del sistema referencia un indicador existente", () => {
    for (const d of CATALOGO_DASHBOARDS) {
      for (const w of d.widgets) {
        expect(CLAVES_INDICADORES_SISTEMA).toContain(w.indicadorClave);
        expect(TIPOS_WIDGET).toContain(w.tipo);
      }
    }
  });
});

/* -------------------------- Siembra del sistema -------------------------- */

describe("siembra del catálogo del sistema", () => {
  it("siembra indicadores y dashboards canónicos", async () => {
    const r = await sembrar();
    expect(r.indicadores).toBe(CATALOGO_INDICADORES.length);
    expect(r.dashboards).toBe(8);
  });
  it("es idempotente: una segunda siembra no duplica", async () => {
    await sembrar();
    const r2 = await sembrar();
    expect(r2.indicadores).toBe(0);
    expect(r2.dashboards).toBe(0);
  });
  it("las definiciones sembradas quedan como delSistema", async () => {
    await sembrar();
    const r = await query(`${MODULO}.indicador`, { clave: "mtbf" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { delSistema: boolean }).delSistema).toBe(true);
  });
  it("los dashboards sembrados son del sistema", async () => {
    await sembrar();
    const r = await query(`${MODULO}.dashboard`, { clave: "ejecutivo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { delSistema: boolean }).delSistema).toBe(true);
  });
});

/* ------------------------ Motor: tipos de expresión ---------------------- */

const AHORA = "2024-02-01T00:00:00.000Z";

function f(dim: string, op: string, valor: unknown): Filtro {
  const r = crearFiltro({ dimension: dim, operador: op, valor: valor as never });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function expr(input: Parameters<typeof crearExpresion>[0]) {
  const r = crearExpresion(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("motor de evaluación · tipos de expresión", () => {
  const hechos = [
    { estado: "abierta", prioridad: "alta", monto: 100, fecha: "2024-01-15T00:00:00.000Z" },
    { estado: "abierta", prioridad: "baja", monto: 200, fecha: "2024-01-16T00:00:00.000Z" },
    { estado: "cerrada", prioridad: "alta", monto: 300, fecha: "2024-01-17T00:00:00.000Z" },
  ];

  it("conteo cuenta hechos filtrados", () => {
    const e = crearExpresion({ tipo: "conteo", filtros: [f("estado", "eq", "abierta")] });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && r.value.valor).toBe(2);
  });
  it("suma agrega un campo", () => {
    const e = crearExpresion({ tipo: "suma", campo: "monto" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && r.value.valor).toBe(600);
  });
  it("promedio calcula la media", () => {
    const e = crearExpresion({ tipo: "promedio", campo: "monto" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && r.value.valor).toBe(200);
  });
  it("duracion-promedio calcula la media de un campo temporal", () => {
    const e = crearExpresion({ tipo: "duracion-promedio", campo: "monto" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && r.value.valor).toBe(200);
  });
  it("ratio divide numerador entre denominador", () => {
    const e = crearExpresion({
      tipo: "ratio",
      filtros: [f("estado", "eq", "abierta")],
      filtrosDenominador: [],
      factor: 100,
    });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && Math.round(r.value.valor)).toBe(67);
  });
  it("tasa aplica factor porcentaje", () => {
    const e = crearExpresion({
      tipo: "tasa",
      filtros: [f("prioridad", "eq", "alta")],
      factor: 100,
    });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && Math.round(r.value.valor)).toBe(67);
  });
  it("promedio de serie vacía es 0 sin dividir por cero", () => {
    const e = crearExpresion({ tipo: "promedio", campo: "monto", filtros: [f("estado", "eq", "inexistente")] });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && r.value.valor).toBe(0);
  });
  it("ratio con denominador cero devuelve 0", () => {
    const e = crearExpresion({ tipo: "ratio", filtros: [], filtrosDenominador: [f("estado", "eq", "inexistente")] });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, [], AHORA);
    expect(r.ok && r.value.valor).toBe(0);
  });
  it("rechaza tipo de expresión desconocido", () => {
    const e = crearExpresion({ tipo: "cosa-rara" });
    expect(e.ok).toBe(false);
  });
  it("exige campo para suma/promedio/duracion", () => {
    expect(crearExpresion({ tipo: "suma" }).ok).toBe(false);
    expect(crearExpresion({ tipo: "promedio" }).ok).toBe(false);
    expect(crearExpresion({ tipo: "duracion-promedio" }).ok).toBe(false);
  });
  it("rechaza factor cero", () => {
    expect(crearExpresion({ tipo: "conteo", factor: 0 }).ok).toBe(false);
  });
});

/* -------------------------- Motor: MTBF / MTTR --------------------------- */

describe("motor · MTBF y MTTR desde eventos crudos", () => {
  const eventos = [
    { esFalla: true, tiempoEntreFallasMin: 6000, tiempoReparacionMin: 120 },
    { esFalla: true, tiempoEntreFallasMin: 3000, tiempoReparacionMin: 300 },
    { esFalla: false, tiempoEntreFallasMin: 0, tiempoReparacionMin: 0 },
  ];
  it("MTBF = tiempo operativo total / nº de fallas", () => {
    const e = crearExpresion({ tipo: "mtbf", campoTiempoOperativo: "tiempoEntreFallasMin", campoEsFalla: "esFalla" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, eventos, AHORA);
    // (6000+3000+0) / 2 fallas = 4500
    expect(r.ok && r.value.valor).toBe(4500);
    expect(r.ok && r.value.muestras).toBe(2);
  });
  it("MTTR = tiempo reparación total / nº de reparaciones", () => {
    const e = crearExpresion({ tipo: "mttr", campoTiempoReparacion: "tiempoReparacionMin" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, eventos, AHORA);
    // (120+300) / 2 = 210
    expect(r.ok && r.value.valor).toBe(210);
  });
  it("MTBF sin fallas devuelve 0 sin dividir por cero", () => {
    const e = crearExpresion({ tipo: "mtbf", campoTiempoOperativo: "tiempoEntreFallasMin", campoEsFalla: "esFalla" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, [{ esFalla: false, tiempoEntreFallasMin: 100 }], AHORA);
    expect(r.ok && r.value.valor).toBe(0);
  });
  it("MTTR sin reparaciones devuelve 0", () => {
    const e = crearExpresion({ tipo: "mttr", campoTiempoReparacion: "tiempoReparacionMin" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, [{ tiempoReparacionMin: 0 }], AHORA);
    expect(r.ok && r.value.valor).toBe(0);
  });
});

/* ---------------------------- Motor: filtros ----------------------------- */

describe("filtros reutilizables", () => {
  const hechos = [
    { estado: "abierta", monto: 10, fecha: "2024-01-10T00:00:00.000Z", activo: "a1" },
    { estado: "cerrada", monto: 50, fecha: "2024-01-20T00:00:00.000Z", activo: "a2" },
    { estado: "abierta", monto: 30, fecha: "2024-01-30T00:00:00.000Z", activo: "a1" },
  ];
  it("expone las 15 dimensiones canónicas", () => {
    expect(DIMENSIONES).toContain("empresa");
    expect(DIMENSIONES).toContain("cuadrilla");
    expect(DIMENSIONES).toContain("tenant");
    expect(DIMENSIONES.length).toBe(15);
  });
  it("expone los operadores esperados", () => {
    for (const o of ["eq", "in", "between", "gte", "contains", "exists"]) expect(OPERADORES).toContain(o);
  });
  it("operador eq", () => {
    expect(aplicarFiltros(hechos, [f("estado", "eq", "abierta")]).length).toBe(2);
  });
  it("operador in", () => {
    expect(aplicarFiltros(hechos, [f("estado", "in", ["cerrada"])]).length).toBe(1);
  });
  it("operador nin", () => {
    expect(aplicarFiltros(hechos, [f("estado", "nin", ["cerrada"])]).length).toBe(2);
  });
  it("operador gte numérico", () => {
    const montoGte30 = crearFiltro({ dimension: "categoria", campo: "monto", operador: "gte", valor: 30 });
    if (!montoGte30.ok) throw new Error(montoGte30.error.message);
    expect(aplicarFiltros(hechos, [montoGte30.value]).length).toBe(2);
  });
  it("operador between sobre fechas", () => {
    const filtro = crearFiltro({ dimension: "rango", campo: "fecha", operador: "between", valor: ["2024-01-15T00:00:00.000Z", "2024-01-25T00:00:00.000Z"] });
    expect(filtro.ok).toBe(true);
    if (filtro.ok) expect(aplicarFiltros(hechos, [filtro.value]).length).toBe(1);
  });
  it("operador exists", () => {
    expect(aplicarFiltros(hechos, [f("activo", "exists", true)]).length).toBe(3);
  });
  it("varios filtros combinan con AND", () => {
    const montoGt20 = crearFiltro({ dimension: "categoria", campo: "monto", operador: "gt", valor: 20 });
    if (!montoGt20.ok) throw new Error(montoGt20.error.message);
    const r = aplicarFiltros(hechos, [f("estado", "eq", "abierta"), montoGt20.value]);
    expect(r.length).toBe(1);
  });
  it("rechaza dimensión desconocida", () => {
    expect(crearFiltro({ dimension: "galaxia", operador: "eq", valor: 1 }).ok).toBe(false);
  });
  it("rechaza operador desconocido", () => {
    expect(crearFiltro({ dimension: "estado", operador: "quiza", valor: 1 }).ok).toBe(false);
  });
  it("between exige 2 valores", () => {
    expect(crearFiltro({ dimension: "rango", operador: "between", valor: [1] }).ok).toBe(false);
  });
  it("in exige lista", () => {
    expect(crearFiltro({ dimension: "estado", operador: "in", valor: "x" }).ok).toBe(false);
  });
});

/* ---------------------------- Motor: ventanas ---------------------------- */

describe("ventanas temporales", () => {
  const hechos = [
    { monto: 1, fecha: "2024-01-01T00:00:00.000Z" },
    { monto: 1, fecha: "2024-01-25T00:00:00.000Z" },
    { monto: 1, fecha: "2024-01-31T00:00:00.000Z" },
  ];
  it("ultimosDias acota por ventana relativa al 'ahora'", () => {
    const e = crearExpresion({ tipo: "conteo", ventana: { campoFecha: "fecha", ultimosDias: 10 } });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    // 25 y 31 de enero caen dentro de los 10 días previos al 1 de feb
    expect(r.ok && r.value.valor).toBe(2);
  });
  it("rango absoluto desde/hasta", () => {
    const e = crearExpresion({ tipo: "conteo", ventana: { campoFecha: "fecha", desde: "2024-01-20T00:00:00.000Z", hasta: "2024-01-28T00:00:00.000Z" } });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok && r.value.valor).toBe(1);
  });
  it("rechaza instante de evaluación inválido", () => {
    const e = crearExpresion({ tipo: "conteo" });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, "no-es-fecha");
    expect(r.ok).toBe(false);
  });
});

/* --------------------------- Motor: agrupadores -------------------------- */

describe("agrupadores", () => {
  const hechos = [
    { responsable: "t1" }, { responsable: "t1" }, { responsable: "t2" },
  ];
  it("agrupa conteos por campo", () => {
    const e = crearExpresion({ tipo: "conteo", agrupadores: ["responsable"] });
    if (!e.ok) throw new Error("");
    const r = evaluarExpresion(e.value, hechos, AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.grupos.length).toBe(2);
    const t1 = r.value.grupos.find((g) => g.clave === "t1");
    expect(t1?.valor).toBe(2);
  });
  it("las series de grupo son deterministas (orden estable)", () => {
    const e = crearExpresion({ tipo: "conteo", agrupadores: ["responsable"] });
    if (!e.ok) throw new Error("");
    const r1 = evaluarExpresion(e.value, hechos, AHORA);
    const r2 = evaluarExpresion(e.value, hechos, AHORA);
    expect(r1.ok && r2.ok && JSON.stringify(r1.value.grupos) === JSON.stringify(r2.value.grupos)).toBe(true);
  });
});

/* --------------------------- Umbrales y metas ---------------------------- */

describe("umbrales y metas", () => {
  it("semáforo mayor-es-mejor", () => {
    const u = { mayorEsMejor: true, bueno: 95, alerta: 90, critico: 0 };
    expect(clasificarSemaforo(u, 97)).toBe("bueno");
    expect(clasificarSemaforo(u, 92)).toBe("alerta");
    expect(clasificarSemaforo(u, 50)).toBe("critico");
  });
  it("semáforo menor-es-mejor (MTTR)", () => {
    const u = { mayorEsMejor: false, bueno: 4, alerta: 12, critico: 24 };
    expect(clasificarSemaforo(u, 2)).toBe("bueno");
    expect(clasificarSemaforo(u, 10)).toBe("alerta");
    expect(clasificarSemaforo(u, 30)).toBe("critico");
  });
  it("sin umbrales no hay semáforo", () => {
    expect(clasificarSemaforo(null, 10)).toBeNull();
  });
  it("cumplimiento de meta calcula valor/meta", () => {
    const def = crearDefinicion({
      id: "i", tenantId: TENANT, clave: "x", nombre: "X", categoria: "ordenes",
      fuente: { modulo: "ordenes", dataset: "ordenes" },
      expresion: expr({ tipo: "conteo" }),
      unidad: "conteo", formato: "entero", metas: [{ periodo: "mensual", valor: 200 }], actorId: "a", ahora: AHORA,
    });
    if (!def.ok) throw new Error("");
    expect(cumplimientoMeta(def.value.definicion, 150, "mensual")).toBe(0.75);
    expect(cumplimientoMeta(def.value.definicion, 150, "anual")).toBeNull();
  });
});

/* ---------------------- Definiciones · versionado ------------------------ */

describe("definiciones · versionado inmutable", () => {
  it("crear-indicador arranca en versión 1", async () => {
    const r = await exec(`${MODULO}.definir-indicador`, {
      clave: "propio-1", nombre: "Propio", categoria: "ordenes", unidad: "conteo", formato: "entero",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: { tipo: "conteo", filtros: [] },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { version: number }).version).toBe(1);
  });
  it("actualizar-indicador incrementa la versión", async () => {
    await exec(`${MODULO}.definir-indicador`, {
      clave: "propio-2", nombre: "Propio", categoria: "ordenes", unidad: "conteo", formato: "entero",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: { tipo: "conteo", filtros: [] },
    });
    const r = await exec(`${MODULO}.actualizar-indicador`, { clave: "propio-2", expectedVersion: 1, nombre: "Nuevo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { version: number }).version).toBe(2);
  });
  it("OCC: expectedVersion equivocada da conflicto", async () => {
    await exec(`${MODULO}.definir-indicador`, {
      clave: "propio-3", nombre: "Propio", categoria: "ordenes", unidad: "conteo", formato: "entero",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: { tipo: "conteo", filtros: [] },
    });
    const r = await exec(`${MODULO}.actualizar-indicador`, { clave: "propio-3", expectedVersion: 99, nombre: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-CFL-001");
  });
  it("versionado inmutable a nivel dominio: version sólo crece", () => {
    const def = crearDefinicion({
      id: "i", tenantId: TENANT, clave: "x", nombre: "X", categoria: "ordenes",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: expr({ tipo: "conteo" }),
      unidad: "conteo", formato: "entero", actorId: "a", ahora: AHORA,
    });
    if (!def.ok) throw new Error("");
    const v2 = actualizarDefinicion(def.value.definicion, { nombre: "Y" }, "a", AHORA);
    expect(v2.ok && v2.value.definicion.version).toBe(2);
    // el objeto original no se mutó
    expect(def.value.definicion.version).toBe(1);
    expect(Object.isFrozen(def.value.definicion)).toBe(true);
  });
  it("la definición del sistema no se actualiza por vía normal (policy)", async () => {
    await sembrar();
    const r = await exec(`${MODULO}.actualizar-indicador`, { clave: "mtbf", expectedVersion: 1, nombre: "hack" });
    expect(r.ok).toBe(false);
  });
  it("rechaza indicador con clave vacía (dominio)", () => {
    const def = crearDefinicion({
      id: "i", tenantId: TENANT, clave: "  ", nombre: "X", categoria: "ordenes",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: expr({ tipo: "conteo" }),
      unidad: "conteo", formato: "entero", actorId: "a", ahora: AHORA,
    });
    expect(def.ok).toBe(false);
  });
});

/* --------------------- Evaluación end-to-end (fuentes) ------------------- */

describe("evaluación end-to-end contra fuentes", () => {
  beforeEach(async () => { await sembrar(); });

  it("evalúa OT abiertas contra la fuente de órdenes", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "ot-abiertas" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { valor: number }).valor).toBe(2);
  });
  it("evalúa costo de mantenimiento (suma)", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "costo-mantenimiento" });
    expect(r.ok && (r.value as { valor: number }).valor).toBe(4000);
  });
  it("evalúa costo correctivo (filtrado)", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "costo-correctivo" });
    expect(r.ok && (r.value as { valor: number }).valor).toBe(3500);
  });
  it("evalúa MTBF desde eventos crudos de correctivo", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "mtbf" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { valor: number }).valor).toBeGreaterThan(0);
  });
  it("evalúa MTTR desde eventos crudos de correctivo", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "mttr" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { valor: number }).valor).toBe(160); // (120+300+60)/3
  });
  it("evalúa fallas-por-activo con agrupadores", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "fallas-por-activo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { grupos: unknown[] }).grupos.length).toBe(2);
  });
  it("evalúa carga-tecnicos agrupada por responsable", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "carga-tecnicos" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const grupos = (r.value as { grupos: { clave: string; valor: number }[] }).grupos;
      expect(grupos.find((g) => g.clave === "tec-1")?.valor).toBe(2);
    }
  });
  it("evalúa cumplimiento-preventivo (tasa)", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "cumplimiento-preventivo" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Math.round((r.value as { valor: number }).valor)).toBe(67); // 2/3
  });
  it("adjunta semáforo cuando hay umbrales", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "ot-vencidas" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { semaforo: string | null }).semaforo).not.toBeNull();
  });
  it("aplica filtros extra de ejecución", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "ot-abiertas", filtros: [{ dimension: "prioridad", operador: "eq", valor: "alta" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { valor: number }).valor).toBe(1);
  });
  it("evaluar de indicador inexistente da notFound", async () => {
    const r = await query(`${MODULO}.evaluar`, { clave: "no-existe" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-NF-001");
  });
});

/* -------------------------- Fail-safe por fuente ------------------------- */

describe("fail-safe por fuente ausente (KRN-CFL)", () => {
  it("sin fuente de órdenes, evaluar OT abiertas falla de forma segura", async () => {
    rt = crearAnalyticsRuntime({ fuentes: {} });
    await sembrar();
    const r = await query(`${MODULO}.evaluar`, { clave: "ot-abiertas" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-CFL-001");
  });
  it("con subconjunto de fuentes, sólo falla la que no está", async () => {
    rt = crearAnalyticsRuntime({ fuentes: { ordenes: crearFuentesDemo().ordenes } });
    await sembrar();
    const ok = await query(`${MODULO}.evaluar`, { clave: "ot-abiertas" });
    expect(ok.ok).toBe(true);
    const bad = await query(`${MODULO}.evaluar`, { clave: "mtbf" });
    expect(bad.ok).toBe(false);
  });
});

/* -------------------------- Dashboards + policies ------------------------ */

describe("dashboards del sistema y personalizados", () => {
  beforeEach(async () => { await sembrar(); });

  it("lista los 8 dashboards del sistema", async () => {
    const r = await query(`${MODULO}.dashboards`, { delSistema: true });
    expect(r.ok && (r.value as unknown[]).length).toBe(8);
  });
  it("crea un dashboard personalizado propiedad del usuario", async () => {
    const u = principalCon([`${MODULO}.read`, `${MODULO}.dashboard`], "u1");
    const r = await exec(`${MODULO}.crear-dashboard`, {
      clave: "mio", nombre: "Mi tablero",
      widgets: [{ tipo: "card", titulo: "OT", indicadorClave: "ot-abiertas" }],
    }, u);
    expect(r.ok).toBe(true);
  });
  it("un dashboard del sistema es inmutable (no editable)", async () => {
    const d = await query(`${MODULO}.dashboard`, { clave: "ejecutivo" });
    if (!d.ok) throw new Error("");
    const id = (d.value as { id: string }).id;
    const r = await exec(`${MODULO}.actualizar-dashboard`, { id, expectedVersion: 1, nombre: "hack" });
    expect(r.ok).toBe(false);
  });
  it("clona un dashboard del sistema hacia uno propio editable", async () => {
    const d = await query(`${MODULO}.dashboard`, { clave: "ejecutivo" });
    if (!d.ok) throw new Error("");
    const u = principalCon([`${MODULO}.read`, `${MODULO}.dashboard`], "u2");
    const clon = await exec(`${MODULO}.clonar-dashboard`, { origenId: (d.value as { id: string }).id, clave: "ejecutivo-mio", nombre: "Mi ejecutivo" }, u);
    expect(clon.ok).toBe(true);
    if (!clon.ok) return;
    const id = (clon.value as { id: string }).id;
    const upd = await exec(`${MODULO}.actualizar-dashboard`, { id, expectedVersion: 1, nombre: "Editado" }, u);
    expect(upd.ok).toBe(true);
  });
  it("sólo el propietario puede editar su dashboard (policy de propiedad)", async () => {
    const u1 = principalCon([`${MODULO}.read`, `${MODULO}.dashboard`], "duenio");
    const crear = await exec(`${MODULO}.crear-dashboard`, { clave: "priv", nombre: "Privado", widgets: [] }, u1);
    if (!crear.ok) throw new Error("");
    const id = (crear.value as { id: string }).id;
    const u2 = principalCon([`${MODULO}.read`, `${MODULO}.dashboard`], "intruso");
    const r = await exec(`${MODULO}.actualizar-dashboard`, { id, expectedVersion: 1, nombre: "robo" }, u2);
    expect(r.ok).toBe(false);
  });
  it("sólo el propietario elimina su dashboard", async () => {
    const u1 = principalCon([`${MODULO}.read`, `${MODULO}.dashboard`], "d1");
    const crear = await exec(`${MODULO}.crear-dashboard`, { clave: "borrar", nombre: "Borrar", widgets: [] }, u1);
    if (!crear.ok) throw new Error("");
    const id = (crear.value as { id: string }).id;
    const u2 = principalCon([`${MODULO}.read`, `${MODULO}.dashboard`], "otro");
    const noOk = await exec(`${MODULO}.eliminar-dashboard`, { id, expectedVersion: 1 }, u2);
    expect(noOk.ok).toBe(false);
    const ok = await exec(`${MODULO}.eliminar-dashboard`, { id, expectedVersion: 1 }, u1);
    expect(ok.ok).toBe(true);
  });
  it("no se puede eliminar un dashboard del sistema", async () => {
    const d = await query(`${MODULO}.dashboard`, { clave: "operativo" });
    if (!d.ok) throw new Error("");
    const r = await exec(`${MODULO}.eliminar-dashboard`, { id: (d.value as { id: string }).id, expectedVersion: 1 });
    expect(r.ok).toBe(false);
  });
  it("OCC en actualización de dashboard", async () => {
    const u = principalCon([`${MODULO}.read`, `${MODULO}.dashboard`], "occ");
    const crear = await exec(`${MODULO}.crear-dashboard`, { clave: "occ-db", nombre: "OCC", widgets: [] }, u);
    if (!crear.ok) throw new Error("");
    const id = (crear.value as { id: string }).id;
    const r = await exec(`${MODULO}.actualizar-dashboard`, { id, expectedVersion: 99, nombre: "x" }, u);
    expect(r.ok).toBe(false);
  });
  it("dominio: crearWidget rechaza tipo desconocido", () => {
    expect(crearWidget({ id: "w", tipo: "cubo3d", titulo: "T", indicadorClave: "x" }).ok).toBe(false);
  });
  it("dominio: ranking exige n>0", () => {
    expect(crearWidget({ id: "w", tipo: "ranking", titulo: "T", indicadorClave: "x", ranking: { modo: "topN", n: 0 } }).ok).toBe(false);
  });
});

/* ---------------------- Snapshots idempotentes --------------------------- */

describe("snapshots de evaluación (offline)", () => {
  beforeEach(async () => { await sembrar(); });

  it("clave determinista es estable para mismos parámetros", () => {
    const filtros: Filtro[] = [f("estado", "eq", "abierta")];
    const k1 = claveDeterminista({ tenantId: TENANT, target: "indicador", targetClave: "x", filtros, evaluadoEn: AHORA });
    const k2 = claveDeterminista({ tenantId: TENANT, target: "indicador", targetClave: "x", filtros, evaluadoEn: AHORA });
    expect(k1).toBe(k2);
  });
  it("clave determinista es insensible al orden de filtros", () => {
    const a: Filtro[] = [f("estado", "eq", "abierta"), f("prioridad", "eq", "alta")];
    const b: Filtro[] = [f("prioridad", "eq", "alta"), f("estado", "eq", "abierta")];
    const k1 = claveDeterminista({ tenantId: TENANT, target: "indicador", targetClave: "x", filtros: a, evaluadoEn: AHORA });
    const k2 = claveDeterminista({ tenantId: TENANT, target: "indicador", targetClave: "x", filtros: b, evaluadoEn: AHORA });
    expect(k1).toBe(k2);
  });
  it("materializa un snapshot nuevo", async () => {
    const r = await exec(`${MODULO}.materializar-snapshot`, { clave: "ot-abiertas", evaluadoEn: AHORA });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { idempotente: boolean }).idempotente).toBe(false);
  });
  it("segunda materialización con mismos parámetros es idempotente (misma clave)", async () => {
    await exec(`${MODULO}.materializar-snapshot`, { clave: "ot-abiertas", evaluadoEn: AHORA });
    const r = await exec(`${MODULO}.materializar-snapshot`, { clave: "ot-abiertas", evaluadoEn: AHORA });
    expect(r.ok && (r.value as { idempotente: boolean }).idempotente).toBe(true);
  });
  it("idempotencia por opId devuelve el mismo recibo", async () => {
    const a = await exec(`${MODULO}.materializar-snapshot`, { opId: "op-1", clave: "backlog", evaluadoEn: AHORA });
    const b = await exec(`${MODULO}.materializar-snapshot`, { opId: "op-1", clave: "backlog", evaluadoEn: AHORA });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect((b.value as { idempotente: boolean }).idempotente).toBe(true);
  });
  it("distinto instante ⇒ distinto snapshot", async () => {
    await exec(`${MODULO}.materializar-snapshot`, { clave: "ot-abiertas", evaluadoEn: AHORA });
    const r = await exec(`${MODULO}.materializar-snapshot`, { clave: "ot-abiertas", evaluadoEn: "2024-03-01T00:00:00.000Z" });
    expect(r.ok && (r.value as { idempotente: boolean }).idempotente).toBe(false);
  });
  it("lista snapshots por targetClave", async () => {
    await exec(`${MODULO}.materializar-snapshot`, { clave: "ot-abiertas", evaluadoEn: AHORA });
    const r = await query(`${MODULO}.snapshots`, { targetClave: "ot-abiertas" });
    expect(r.ok && (r.value as unknown[]).length).toBe(1);
  });
});

/* -------------------------- Capacidades por permiso ---------------------- */

describe("capacidades por permiso", () => {
  beforeEach(async () => { await sembrar(); });

  it("read puede consultar indicadores", async () => {
    const u = principalCon([`${MODULO}.read`]);
    const r = await query(`${MODULO}.indicadores`, {}, u);
    expect(r.ok).toBe(true);
  });
  it("sin permiso read, la consulta es denegada", async () => {
    const u = principalCon([]);
    const r = await query(`${MODULO}.indicadores`, {}, u);
    expect(r.ok).toBe(false);
  });
  it("dashboard requiere permiso analytics.dashboard", async () => {
    const soloRead = principalCon([`${MODULO}.read`]);
    const r = await exec(`${MODULO}.crear-dashboard`, { clave: "no", nombre: "No", widgets: [] }, soloRead);
    expect(r.ok).toBe(false);
  });
  it("definir-indicador requiere permiso analytics.admin", async () => {
    const soloRead = principalCon([`${MODULO}.read`]);
    const r = await exec(`${MODULO}.definir-indicador`, {
      clave: "z", nombre: "Z", categoria: "ordenes", unidad: "conteo", formato: "entero",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: { tipo: "conteo", filtros: [] },
    }, soloRead);
    expect(r.ok).toBe(false);
  });
  it("eventos (bitácora) requiere admin", async () => {
    const soloRead = principalCon([`${MODULO}.read`]);
    const r = await query(`${MODULO}.eventos`, {}, soloRead);
    expect(r.ok).toBe(false);
  });
});

/* -------------------------------- Catálogos ------------------------------ */

describe("catálogos configurables", () => {
  it("valida categoría contra el fallback canónico cuando está vacío", async () => {
    const r = await exec(`${MODULO}.definir-indicador`, {
      clave: "cat-ok", nombre: "Cat", categoria: "costos", unidad: "moneda", formato: "moneda",
      fuente: { modulo: "ordenes", dataset: "costos" }, expresion: { tipo: "suma", campo: "costoTotal", filtros: [] },
    });
    expect(r.ok).toBe(true);
  });
  it("rechaza categoría no canónica con catálogo vacío", async () => {
    const r = await exec(`${MODULO}.definir-indicador`, {
      clave: "cat-bad", nombre: "Cat", categoria: "inventada", unidad: "conteo", formato: "entero",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: { tipo: "conteo", filtros: [] },
    });
    expect(r.ok).toBe(false);
  });
  it("upsert de catálogo y luego exige pertenencia", async () => {
    const up = await exec(`${MODULO}.catalogo-upsert`, { catalogo: "categorias-indicador", clave: "especial", etiqueta: "Especial" });
    expect(up.ok).toBe(true);
    // ahora que el catálogo tiene entradas, un valor canónico previo ya no vale
    const r = await exec(`${MODULO}.definir-indicador`, {
      clave: "cat-especial", nombre: "E", categoria: "especial", unidad: "conteo", formato: "entero",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: { tipo: "conteo", filtros: [] },
    });
    expect(r.ok).toBe(true);
  });
  it("catalogo-opciones devuelve entradas habilitadas", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "unidades", clave: "kwh", etiqueta: "kWh" });
    const r = await query(`${MODULO}.catalogo-opciones`, { catalogo: "unidades" });
    expect(r.ok && (r.value as unknown[]).length).toBe(1);
  });
  it("habilitar/deshabilitar afecta a las opciones", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "unidades", clave: "kwh", etiqueta: "kWh" });
    await exec(`${MODULO}.catalogo-habilitar`, { catalogo: "unidades", clave: "kwh", habilitado: false });
    const r = await query(`${MODULO}.catalogo-opciones`, { catalogo: "unidades" });
    expect(r.ok && (r.value as unknown[]).length).toBe(0);
  });
});

/* ---------------------------- Eventos / bitácora ------------------------- */

describe("eventos del módulo y bitácora", () => {
  it("definir-indicador emite un evento durable", async () => {
    await exec(`${MODULO}.definir-indicador`, {
      clave: "ev-1", nombre: "Ev", categoria: "ordenes", unidad: "conteo", formato: "entero",
      fuente: { modulo: "ordenes", dataset: "ordenes" }, expresion: { tipo: "conteo", filtros: [] },
    });
    const r = await query(`${MODULO}.eventos`, {});
    expect(r.ok && (r.value as unknown[]).length).toBeGreaterThan(0);
  });
  it("la consola técnica lista tablas RLS del módulo", async () => {
    const r = await query(`${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { tablasRLS: string[] }).tablasRLS.length).toBeGreaterThan(0);
  });
});
