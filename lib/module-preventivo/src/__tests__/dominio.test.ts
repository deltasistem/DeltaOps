/**
 * DGP-014 · Pruebas de DOMINIO PURO (ETAPA 1): jerarquía sin ciclos, DAG de
 * actividades con orden topológico determinista, motor de programación
 * (reprogramación/suspensión/exclusión), anti-duplicados e idempotencia de
 * materialización, costos estimados (incl. moneda incompatible), SLA, vigencia,
 * versionado/rollback/comparación y validadores de VOs.
 */
import { describe, expect, it } from "vitest";
import {
  aplicarAccionPrograma,
  calcularCostoEstimado,
  calcularProgramacion,
  claveDedup,
  compararProgramas,
  crearActividad,
  crearExclusion,
  crearGeneracion,
  crearPrograma,
  crearRecursosRequeridos,
  crearReprogramacion,
  crearSla,
  crearSuspension,
  crearVigencia,
  decidirGeneracionPreventiva,
  detectarCicloJerarquia,
  editarPrograma,
  evaluarSla,
  materializarGeneracion,
  revertirPrograma,
  tiempoDeActividadMinutos,
  validarDependencias,
  versionarPrograma,
  vigenciaIncluye,
  type ActividadPreventiva,
  type ProgramaPreventivo,
  type ReferenciaWorkflow,
} from "..";

const AHORA = "2025-01-15T00:00:00.000Z";
const TENANT = "t-1";
const WF: ReferenciaWorkflow = { proceso: "programa", definicion: "prog", instanciaId: "i-1", version: 1 };

function programaBase(over: Record<string, unknown> = {}): ProgramaPreventivo {
  const vig = crearVigencia({ desde: "2025-01-01T00:00:00.000Z" });
  if (!vig.ok) throw new Error("vig");
  const cambio = crearPrograma({
    id: "p-1", tenantId: TENANT, codigo: "PRG-00001", nombre: "Preventivo motores", tipo: "correctivo-programado",
    clasificacion: null, padreId: null, planes: [], activos: [], vigencia: vig.value, sla: null, workflow: WF,
    estadoInicial: "preparacion", actorId: "u-1", ahora: AHORA, ...over,
  });
  if (!cambio.ok) throw new Error(cambio.error.message);
  return cambio.value.programa;
}

function actividad(id: string, orden: number, dependencias: string[] = []): ActividadPreventiva {
  const rec = crearRecursosRequeridos({});
  if (!rec.ok) throw new Error("rec");
  const c = crearActividad({
    id, tenantId: TENANT, programaId: "p-1", nombre: `Act ${id}`, orden, dependencias,
    checklist: { plantillaId: "chk", version: 1, obligatorio: true }, recursos: rec.value,
    tiempoEstimado: { valor: 2, unidad: "horas" }, moneda: "usd", actorId: "u-1", ahora: AHORA,
  });
  if (!c.ok) throw new Error(c.error.message);
  return c.value.actividad;
}

/* ----------------------------- Programa: crear --------------------------- */
describe("crearPrograma", () => {
  it("crea un programa en preparación con versionPrograma=1", () => {
    const p = programaBase();
    expect(p.estado).toBe("preparacion");
    expect(p.versionPrograma).toBe(1);
    expect(p.version).toBe(1);
  });
  it("rechaza nombre vacío", () => {
    const vig = crearVigencia({ desde: "2025-01-01T00:00:00.000Z" });
    if (!vig.ok) throw new Error("vig");
    const c = crearPrograma({
      id: "p", tenantId: TENANT, codigo: "PRG-1", nombre: "  ", tipo: "t", clasificacion: null, padreId: null,
      planes: [], activos: [], vigencia: vig.value, sla: null, workflow: WF, estadoInicial: "preparacion", actorId: "u", ahora: AHORA,
    });
    expect(c.ok).toBe(false);
  });
  it("rechaza 'ahora' no ISO", () => {
    const vig = crearVigencia({ desde: "2025-01-01T00:00:00.000Z" });
    if (!vig.ok) throw new Error("vig");
    const c = crearPrograma({
      id: "p", tenantId: TENANT, codigo: "PRG-1", nombre: "X", tipo: "t", clasificacion: null, padreId: null,
      planes: [], activos: [], vigencia: vig.value, sla: null, workflow: WF, estadoInicial: "preparacion", actorId: "u", ahora: "no-fecha",
    });
    expect(c.ok).toBe(false);
  });
  it("rechaza ser su propio padre", () => {
    const vig = crearVigencia({ desde: "2025-01-01T00:00:00.000Z" });
    if (!vig.ok) throw new Error("vig");
    const c = crearPrograma({
      id: "p", tenantId: TENANT, codigo: "PRG-1", nombre: "X", tipo: "t", clasificacion: null, padreId: "p",
      planes: [], activos: [], vigencia: vig.value, sla: null, workflow: WF, estadoInicial: "preparacion", actorId: "u", ahora: AHORA,
    });
    expect(c.ok).toBe(false);
  });
});

/* --------------------------- Programa: editar ---------------------------- */
describe("editarPrograma", () => {
  it("edita nombre en preparación e incrementa version", () => {
    const p = programaBase();
    const e = editarPrograma(p, { nombre: "Nuevo" }, "u-1", AHORA);
    expect(e.ok).toBe(true);
    if (e.ok) { expect(e.value.programa.nombre).toBe("Nuevo"); expect(e.value.programa.version).toBe(2); }
  });
  it("no edita un programa publicado", () => {
    const p = { ...programaBase(), estado: "publicado" as const };
    const e = editarPrograma(p, { nombre: "X" }, "u-1", AHORA);
    expect(e.ok).toBe(false);
  });
});

/* ------------------------ Programa: transiciones ------------------------- */
describe("aplicarAccionPrograma", () => {
  it("preparacion → revision → publicado", () => {
    const p = programaBase();
    const r1 = aplicarAccionPrograma(p, "enviarRevision", "u-1", AHORA);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.value.programa.estado).toBe("revision");
    const r2 = aplicarAccionPrograma(r1.value.programa, "publicar", "u-1", AHORA);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.programa.estado).toBe("publicado");
  });
  it("no permite publicar desde preparacion directo", () => {
    const p = programaBase();
    const r = aplicarAccionPrograma(p, "publicar", "u-1", AHORA);
    expect(r.ok).toBe(false);
  });
  it("un archivado es terminal e inmutable", () => {
    const p = { ...programaBase(), estado: "archivado" as const };
    const r = aplicarAccionPrograma(p, "publicar", "u-1", AHORA);
    expect(r.ok).toBe(false);
  });
});

/* ---------------------------- Jerarquía ---------------------------------- */
describe("detectarCicloJerarquia", () => {
  it("acepta raíz (padre null)", () => {
    expect(detectarCicloJerarquia("a", null, new Map()).ok).toBe(true);
  });
  it("rechaza auto-padre", () => {
    expect(detectarCicloJerarquia("a", "a", new Map()).ok).toBe(false);
  });
  it("acepta cadena sin ciclo", () => {
    const m = new Map<string, string | null>([["b", null], ["c", "b"]]);
    expect(detectarCicloJerarquia("a", "c", m).ok).toBe(true);
  });
  it("detecta ciclo a→b→a", () => {
    const m = new Map<string, string | null>([["a", "b"], ["b", "a"]]);
    expect(detectarCicloJerarquia("a", "b", m).ok).toBe(false);
  });
  it("detecta ciclo profundo", () => {
    const m = new Map<string, string | null>([["b", "c"], ["c", "d"], ["d", "a"]]);
    expect(detectarCicloJerarquia("a", "b", m).ok).toBe(false);
  });
});

/* -------------------------- Actividades: DAG ----------------------------- */
describe("validarDependencias", () => {
  it("orden topológico determinista sin dependencias (por orden luego id)", () => {
    const acts = [actividad("z", 2), actividad("a", 1), actividad("m", 1)];
    const r = validarDependencias(acts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.orden).toEqual(["a", "m", "z"]);
  });
  it("respeta dependencias (b depende de a)", () => {
    const r = validarDependencias([actividad("b", 1, ["a"]), actividad("a", 2)]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.orden.indexOf("a")).toBeLessThan(r.value.orden.indexOf("b"));
  });
  it("detecta dependencia inexistente", () => {
    const r = validarDependencias([actividad("b", 1, ["x"])]);
    expect(r.ok).toBe(false);
  });
  it("detecta ciclo a↔b", () => {
    const a = actividad("a", 1, ["b"]);
    const b = actividad("b", 2, ["a"]);
    const r = validarDependencias([a, b]);
    expect(r.ok).toBe(false);
  });
  it("es determinista para la misma entrada", () => {
    const acts = [actividad("d", 1, ["a"]), actividad("a", 1), actividad("c", 1, ["a"]), actividad("b", 1, ["a"])];
    const r1 = validarDependencias(acts);
    const r2 = validarDependencias(acts);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) expect(r1.value.orden).toEqual(r2.value.orden);
  });
  it("una actividad no puede depender de sí misma", () => {
    const rec = crearRecursosRequeridos({});
    if (!rec.ok) throw new Error("rec");
    const c = crearActividad({
      id: "a", tenantId: TENANT, programaId: "p-1", nombre: "A", orden: 1, dependencias: ["a"],
      checklist: { plantillaId: "chk", version: 1, obligatorio: true }, recursos: rec.value,
      tiempoEstimado: { valor: 1, unidad: "horas" }, moneda: "usd", actorId: "u", ahora: AHORA,
    });
    expect(c.ok).toBe(false);
  });
});

/* -------------------------- Costos y tiempo ------------------------------ */
describe("calcularCostoEstimado", () => {
  it("suma personal + herramientas + repuestos en la misma moneda", () => {
    const rec = crearRecursosRequeridos({
      personal: [{ rol: "tecnico", cantidad: 2, horasPorPersona: 3, costoHora: { moneda: "usd", monto: 10 } }],
      herramientas: [{ tipo: "torque", descripcion: "Llave", cantidad: 1, costoEstimado: { moneda: "usd", monto: 5 } }],
      repuestos: [{ referencia: { tipo: "articulo", id: "r-1" }, cantidad: 4, unidad: "unidad", costoUnitario: { moneda: "usd", monto: 2.5 } }],
    });
    if (!rec.ok) throw new Error("rec");
    const r = calcularCostoEstimado(rec.value, "usd");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.personal).toBe(60); expect(r.value.herramientas).toBe(5); expect(r.value.repuestos).toBe(10); expect(r.value.total).toBe(75); }
  });
  it("rechaza moneda incompatible sin conversión implícita", () => {
    const rec = crearRecursosRequeridos({
      personal: [{ rol: "tecnico", cantidad: 1, horasPorPersona: 1, costoHora: { moneda: "eur", monto: 10 } }],
    });
    if (!rec.ok) throw new Error("rec");
    const r = calcularCostoEstimado(rec.value, "usd");
    expect(r.ok).toBe(false);
  });
  it("costo cero sin recursos con costo", () => {
    const rec = crearRecursosRequeridos({});
    if (!rec.ok) throw new Error("rec");
    const r = calcularCostoEstimado(rec.value, "usd");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.total).toBe(0);
  });
  it("tiempo de actividad en minutos", () => {
    expect(tiempoDeActividadMinutos(actividad("a", 1))).toBe(120);
  });
});

/* ---------------------------------- SLA ---------------------------------- */
describe("evaluarSla", () => {
  const sla = crearSla({ clasificacion: "critico", ventanaRespuestaHoras: 2, ventanaCumplimientoHoras: 8, toleranciaHoras: 1 });
  it("dentro de respuesta y cumplimiento", () => {
    if (!sla.ok) throw new Error("sla");
    const r = evaluarSla(sla.value, "2025-01-01T00:00:00.000Z", "2025-01-01T01:00:00.000Z");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.dentroDeRespuesta).toBe(true); expect(r.value.dentroDeCumplimiento).toBe(true); expect(r.value.vencido).toBe(false); }
  });
  it("vencido pasada la ventana + tolerancia", () => {
    if (!sla.ok) throw new Error("sla");
    const r = evaluarSla(sla.value, "2025-01-01T00:00:00.000Z", "2025-01-01T10:00:00.000Z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.vencido).toBe(true);
  });
  it("rechaza SLA con cumplimiento menor que respuesta", () => {
    expect(crearSla({ clasificacion: "x", ventanaRespuestaHoras: 8, ventanaCumplimientoHoras: 2 }).ok).toBe(false);
  });
});

/* -------------------------------- Vigencia ------------------------------- */
describe("vigencia", () => {
  it("incluye instante dentro del rango", () => {
    const v = crearVigencia({ desde: "2025-01-01T00:00:00.000Z", hasta: "2025-12-31T00:00:00.000Z" });
    expect(v.ok).toBe(true);
    if (v.ok) expect(vigenciaIncluye(v.value, "2025-06-01T00:00:00.000Z")).toBe(true);
  });
  it("excluye antes de desde", () => {
    const v = crearVigencia({ desde: "2025-06-01T00:00:00.000Z" });
    if (!v.ok) throw new Error("v");
    expect(vigenciaIncluye(v.value, "2025-01-01T00:00:00.000Z")).toBe(false);
  });
  it("rechaza hasta anterior a desde", () => {
    expect(crearVigencia({ desde: "2025-06-01T00:00:00.000Z", hasta: "2025-01-01T00:00:00.000Z" }).ok).toBe(false);
  });
});

/* -------------------------- Motor de programación ------------------------ */
const FREC = { reglas: [{ tipo: "dias", cada: 30, unidad: null, evento: null }], modo: "lo-que-ocurra-primero", toleranciaAntes: 0, toleranciaDespues: 0 };
const ANCLAJE = { desde: "2025-01-01T00:00:00.000Z", medidoresBase: {} as Record<string, number> };

function entradaProg(over: Record<string, unknown> = {}) {
  return {
    programaId: "p-1", actividadId: "a-1", activoId: "act-1", frecuencia: FREC, anclaje: ANCLAJE,
    ctx: { ahora: "2025-03-01T00:00:00.000Z", medidores: {} }, toleranciaHoras: 12, ...over,
  };
}

describe("calcularProgramacion", () => {
  it("vencida corresponde programar", () => {
    const r = calcularProgramacion(entradaProg());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.vencida).toBe(true); expect(r.value.corresponde).toBe(true); expect(r.value.descartadaPor).toBeNull(); }
  });
  it("no vencida no corresponde", () => {
    const r = calcularProgramacion(entradaProg({ ctx: { ahora: "2025-01-10T00:00:00.000Z", medidores: {} } }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.vencida).toBe(false); expect(r.value.corresponde).toBe(false); }
  });
  it("es determinista (mismo input ⇒ mismo output)", () => {
    const r1 = calcularProgramacion(entradaProg());
    const r2 = calcularProgramacion(entradaProg());
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
  it("ventana aplica tolerancia en horas", () => {
    const r = calcularProgramacion(entradaProg());
    if (!r.ok) throw new Error("r");
    const dur = Date.parse(r.value.ventana.fin) - Date.parse(r.value.ventana.inicio);
    expect(dur).toBe(24 * 3_600_000);
  });
  it("suspensión de programa descarta la ocurrencia", () => {
    const s = crearSuspension({ ambito: "programa", sujetoId: "p-1", motivo: "clima", desde: "2025-01-01T00:00:00.000Z", hasta: null });
    if (!s.ok) throw new Error("s");
    const r = calcularProgramacion(entradaProg({ suspensiones: [s.value] }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.corresponde).toBe(false); expect(r.value.descartadaPor).toBe("suspension"); }
  });
  it("suspensión de otro activo NO descarta", () => {
    const s = crearSuspension({ ambito: "activo", sujetoId: "otro", motivo: "clima", desde: "2025-01-01T00:00:00.000Z", hasta: null });
    if (!s.ok) throw new Error("s");
    const r = calcularProgramacion(entradaProg({ suspensiones: [s.value] }));
    if (r.ok) expect(r.value.corresponde).toBe(true);
  });
  it("exclusión por rango de fechas descarta", () => {
    const e = crearExclusion({ desde: "2025-01-31T00:00:00.000Z", hasta: "2025-01-31T23:59:59.000Z", activos: [], motivo: "feriado" });
    if (!e.ok) throw new Error("e");
    const r = calcularProgramacion(entradaProg({ exclusiones: [e.value] }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.descartadaPor).toBe("exclusion"); }
  });
  it("reprogramación redirige la ventana objetivo", () => {
    const rep = crearReprogramacion({ fechaOriginal: "2025-01-31T00:00:00.000Z", fechaNueva: "2025-02-10T00:00:00.000Z", motivo: "recursos", registradaEn: "2025-01-20T00:00:00.000Z", registradaPor: "u-1" });
    if (!rep.ok) throw new Error("rep");
    const r = calcularProgramacion(entradaProg({ reprogramaciones: [rep.value] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ventana.objetivo).toBe("2025-02-10T00:00:00.000Z");
  });
  it("rechaza 'ahora' de contexto no ISO", () => {
    const r = calcularProgramacion(entradaProg({ ctx: { ahora: "malo", medidores: {} } }));
    expect(r.ok).toBe(false);
  });
});

/* ---------------------------- Generación --------------------------------- */
describe("decidirGeneracionPreventiva / claveDedup", () => {
  const oc = { programaId: "p-1", actividadId: "a-1", activoId: "act-1", ventana: "2025-03-01" };
  it("clave de dedup lleva el programaId como primer discriminante", () => {
    expect(claveDedup(oc).startsWith("prog:p-1:")).toBe(true);
  });
  it("dos programas distintos nunca colisionan en la clave", () => {
    const otra = { ...oc, programaId: "p-2" };
    expect(claveDedup(oc)).not.toBe(claveDedup(otra));
  });
  it("genera cuando corresponde y no hay previa", () => {
    const d = decidirGeneracionPreventiva({ ocurrencia: oc, fechaObjetivo: "2025-03-01T00:00:00.000Z", corresponde: true, generadasPrevias: new Set() });
    expect(d.corresponde).toBe(true);
  });
  it("no genera si ya existe la clave (anti-duplicado)", () => {
    const d = decidirGeneracionPreventiva({ ocurrencia: oc, fechaObjetivo: "2025-03-01T00:00:00.000Z", corresponde: true, generadasPrevias: new Set([claveDedup(oc)]) });
    expect(d.corresponde).toBe(false);
  });
  it("no genera si no corresponde", () => {
    const d = decidirGeneracionPreventiva({ ocurrencia: oc, fechaObjetivo: "2025-03-01T00:00:00.000Z", corresponde: false, generadasPrevias: new Set() });
    expect(d.corresponde).toBe(false);
  });
});

describe("crearGeneracion / materializarGeneracion", () => {
  const oc = { programaId: "p-1", actividadId: "a-1", activoId: "act-1", ventana: "2025-03-01" };
  function gen() {
    const c = crearGeneracion({ id: "g-1", tenantId: TENANT, ocurrencia: oc, origen: "programado", fechaObjetivo: "2025-03-01T00:00:00.000Z", generadaPor: "u-1", ahora: AHORA });
    if (!c.ok) throw new Error(c.error.message);
    return c.value.generacion;
  }
  it("nace pendiente", () => {
    expect(gen().estado).toBe("pendiente");
  });
  it("materializa pendiente → materializada", () => {
    const r = materializarGeneracion(gen(), "ot-1", "u-1", AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.generacion.estado).toBe("materializada"); expect(r.value.generacion.ordenTrabajoId).toBe("ot-1"); }
  });
  it("materializar con la MISMA OT es idempotente (no-op)", () => {
    const m1 = materializarGeneracion(gen(), "ot-1", "u-1", AHORA);
    if (!m1.ok) throw new Error("m1");
    const m2 = materializarGeneracion(m1.value.generacion, "ot-1", "u-1", AHORA);
    expect(m2.ok).toBe(true);
    if (m2.ok) expect(m2.value.generacion.version).toBe(m1.value.generacion.version);
  });
  it("materializar con OTRA OT es conflicto", () => {
    const m1 = materializarGeneracion(gen(), "ot-1", "u-1", AHORA);
    if (!m1.ok) throw new Error("m1");
    const m2 = materializarGeneracion(m1.value.generacion, "ot-2", "u-1", AHORA);
    expect(m2.ok).toBe(false);
  });
  it("rechaza fecha objetivo no ISO", () => {
    const c = crearGeneracion({ id: "g", tenantId: TENANT, ocurrencia: oc, origen: "x", fechaObjetivo: "malo", generadaPor: "u", ahora: AHORA });
    expect(c.ok).toBe(false);
  });
});

/* ----------------------- Versionado / rollback / diff -------------------- */
describe("versionado y rollback", () => {
  function publicado() {
    return { ...programaBase(), estado: "publicado" as const, versionPrograma: 1, version: 3 };
  }
  it("versiona N → N+1 volviendo a preparación", () => {
    const r = versionarPrograma(publicado(), { nombre: "v2" }, WF, "u-1", AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.programa.versionPrograma).toBe(2); expect(r.value.programa.estado).toBe("preparacion"); expect(r.value.programa.version).toBe(1); }
  });
  it("no versiona un programa en preparación", () => {
    const r = versionarPrograma(programaBase(), {}, WF, "u-1", AHORA);
    expect(r.ok).toBe(false);
  });
  it("revierte a una versión anterior aumentando versionPrograma", () => {
    const actual = { ...publicado(), versionPrograma: 3 };
    const objetivo = { ...programaBase(), nombre: "v1 original", versionPrograma: 1 };
    const r = revertirPrograma(actual, objetivo, WF, "u-1", AHORA);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.programa.versionPrograma).toBe(4); expect(r.value.programa.nombre).toBe("v1 original"); expect(r.value.programa.estado).toBe("preparacion"); }
  });
  it("rechaza rollback a versión no anterior", () => {
    const actual = { ...publicado(), versionPrograma: 1 };
    const objetivo = { ...programaBase(), versionPrograma: 2 };
    expect(revertirPrograma(actual, objetivo, WF, "u-1", AHORA).ok).toBe(false);
  });
  it("compara dos versiones y reporta diferencias", () => {
    const a = programaBase();
    const b = { ...a, nombre: "Distinto" };
    const diff = compararProgramas(a, b);
    expect(diff.some((d) => d.campo === "nombre")).toBe(true);
  });
  it("compara versiones iguales sin diferencias de nombre", () => {
    const a = programaBase();
    const diff = compararProgramas(a, a);
    expect(diff.some((d) => d.campo === "nombre")).toBe(false);
  });
});
