/**
 * DGP-014 · Pruebas de MÓDULO (end-to-end, ETAPA 1): comandos gobernados,
 * fallo-seguro del workflow, catálogos con semántica canónica, idempotencia por
 * recibo, composición fail-safe (activos/planes/materializador) y consultas.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MODULO,
  crearPreventivoRuntime,
  ActivosPruebaFaltantes,
  MaterializadorPrueba,
  PlanesPruebaNoPublicados,
  WorkflowPruebaRechazo,
  WorkflowPruebaRechazoTransicion,
  type PreventivoRuntime,
} from "..";

const TENANT = "t-preventivo";
let rt: PreventivoRuntime;

async function exec(nombre: string, input: Record<string, unknown>) {
  const r = await rt.platform.kernel.commands.execute(rt.ctx(TENANT), nombre, input);
  await rt.platform.kernel.outboxProcessor.processPending();
  return r;
}
async function query(nombre: string, input: Record<string, unknown>) {
  return rt.platform.kernel.queries.execute(rt.ctx(TENANT), nombre, input);
}

async function crearPrograma(extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-programa`, {
    nombre: "Preventivo motores", tipo: "ruta",
    vigencia: { desde: "2025-01-01T00:00:00.000Z" }, ...extra,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; estado: string; version: number };
}

async function publicar(id: string, version: number): Promise<number> {
  const r1 = await exec(`${MODULO}.transicionar-programa`, { id, accion: "enviarRevision", expectedVersion: version });
  if (!r1.ok) throw new Error(r1.error.message);
  const r2 = await exec(`${MODULO}.transicionar-programa`, { id, accion: "publicar", expectedVersion: (r1.value as { version: number }).version });
  if (!r2.ok) throw new Error(r2.error.message);
  return (r2.value as { version: number }).version;
}

describe("crear-programa", () => {
  beforeEach(() => { rt = crearPreventivoRuntime(); });
  it("crea con código consecutivo y estado inicial de preparación", async () => {
    const p = await crearPrograma();
    expect(p.codigo).toMatch(/^PRG-/);
    expect(p.estado).toBe("preparacion");
  });
  it("es idempotente por opId", async () => {
    const r1 = await exec(`${MODULO}.crear-programa`, { opId: "op-1", nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    const r2 = await exec(`${MODULO}.crear-programa`, { opId: "op-1", nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
      expect((r1.value as { id: string }).id).toBe((r2.value as { id: string }).id);
    }
  });
  it("rechaza tipo fuera del catálogo canónico", async () => {
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "inexistente-xyz", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    expect(r.ok).toBe(false);
  });
  it("crea consecutivos distintos para dos programas", async () => {
    const a = await crearPrograma({ nombre: "A" });
    const b = await crearPrograma({ nombre: "B" });
    expect(a.codigo).not.toBe(b.codigo);
  });
});

describe("gobierno de workflow (fail-safe)", () => {
  it("SIN adaptador de workflow, crear-programa falla sin efecto", async () => {
    rt = crearPreventivoRuntime({ workflow: null });
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    expect(r.ok).toBe(false);
    const lista = await query(`${MODULO}.programas`, {});
    expect(lista.ok).toBe(true);
    if (lista.ok) expect((lista.value as unknown[]).length).toBe(0);
  });
  it("con workflow que RECHAZA la apertura, no crea", async () => {
    rt = crearPreventivoRuntime({ workflow: new WorkflowPruebaRechazo() });
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    expect(r.ok).toBe(false);
  });
  it("con workflow que RECHAZA transiciones, crea pero no transiciona", async () => {
    rt = crearPreventivoRuntime({ workflow: new WorkflowPruebaRechazoTransicion() });
    const p = await crearPrograma();
    const t = await exec(`${MODULO}.transicionar-programa`, { id: p.id, accion: "enviarRevision", expectedVersion: p.version });
    expect(t.ok).toBe(false);
    const actual = await query(`${MODULO}.programa`, { id: p.id });
    if (actual.ok) expect((actual.value as { estado: string }).estado).toBe("preparacion");
  });
});

describe("transiciones gobernadas", () => {
  beforeEach(() => { rt = crearPreventivoRuntime(); });
  it("preparacion → revision → publicado", async () => {
    const p = await crearPrograma();
    const v = await publicar(p.id, p.version);
    expect(v).toBeGreaterThan(p.version);
    const actual = await query(`${MODULO}.programa`, { id: p.id });
    if (actual.ok) expect((actual.value as { estado: string }).estado).toBe("publicado");
  });
  it("transición es idempotente por opId", async () => {
    const p = await crearPrograma();
    const r1 = await exec(`${MODULO}.transicionar-programa`, { id: p.id, accion: "enviarRevision", expectedVersion: p.version, opId: "t-1" });
    const r2 = await exec(`${MODULO}.transicionar-programa`, { id: p.id, accion: "enviarRevision", expectedVersion: p.version, opId: "t-1" });
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
  it("conflicto de versión al transicionar con expectedVersion stale", async () => {
    const p = await crearPrograma();
    await exec(`${MODULO}.transicionar-programa`, { id: p.id, accion: "enviarRevision", expectedVersion: p.version });
    const stale = await exec(`${MODULO}.transicionar-programa`, { id: p.id, accion: "publicar", expectedVersion: p.version });
    expect(stale.ok).toBe(false);
  });
});

describe("versionado por comando", () => {
  beforeEach(() => { rt = crearPreventivoRuntime(); });
  it("versiona un publicado y lo devuelve a preparación (v2)", async () => {
    const p = await crearPrograma();
    const v = await publicar(p.id, p.version);
    const r = await exec(`${MODULO}.versionar-programa`, { id: p.id, expectedVersion: v, nombre: "v2" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect((r.value as { versionPrograma: number }).versionPrograma).toBe(2); expect((r.value as { estado: string }).estado).toBe("preparacion"); }
  });
  it("conserva la versión anterior consultable", async () => {
    const p = await crearPrograma();
    const v = await publicar(p.id, p.version);
    await exec(`${MODULO}.versionar-programa`, { id: p.id, expectedVersion: v, nombre: "v2" });
    const versiones = await query(`${MODULO}.versiones`, { programaId: p.id });
    expect(versiones.ok).toBe(true);
    if (versiones.ok) expect((versiones.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
  it("no versiona un programa en preparación", async () => {
    const p = await crearPrograma();
    const r = await exec(`${MODULO}.versionar-programa`, { id: p.id, expectedVersion: p.version });
    expect(r.ok).toBe(false);
  });
});

describe("actividades", () => {
  beforeEach(() => { rt = crearPreventivoRuntime(); });
  it("define una actividad en un programa existente", async () => {
    const p = await crearPrograma();
    const r = await exec(`${MODULO}.definir-actividad`, {
      programaId: p.id, nombre: "Inspección", orden: 1, checklist: { plantillaId: "chk", version: 1 },
      tiempoEstimado: { valor: 2, unidad: "horas" }, moneda: "usd",
    });
    expect(r.ok).toBe(true);
    const acts = await query(`${MODULO}.actividades`, { programaId: p.id });
    if (acts.ok) expect((acts.value as unknown[]).length).toBe(1);
  });
  it("rechaza dependencia inexistente", async () => {
    const p = await crearPrograma();
    const r = await exec(`${MODULO}.definir-actividad`, {
      programaId: p.id, nombre: "B", orden: 2, dependencias: ["no-existe"],
      checklist: { plantillaId: "chk", version: 1 }, tiempoEstimado: { valor: 1, unidad: "horas" }, moneda: "usd",
    });
    expect(r.ok).toBe(false);
  });
  it("acepta dependencia entre actividades del mismo programa", async () => {
    const p = await crearPrograma();
    const a = await exec(`${MODULO}.definir-actividad`, {
      programaId: p.id, nombre: "A", orden: 1, checklist: { plantillaId: "chk", version: 1 },
      tiempoEstimado: { valor: 1, unidad: "horas" }, moneda: "usd",
    });
    if (!a.ok) throw new Error(a.error.message);
    const aId = (a.value as { id: string }).id;
    const b = await exec(`${MODULO}.definir-actividad`, {
      programaId: p.id, nombre: "B", orden: 2, dependencias: [aId],
      checklist: { plantillaId: "chk", version: 1 }, tiempoEstimado: { valor: 1, unidad: "horas" }, moneda: "usd",
    });
    expect(b.ok).toBe(true);
  });
  it("rechaza moneda no canónica", async () => {
    const p = await crearPrograma();
    const r = await exec(`${MODULO}.definir-actividad`, {
      programaId: p.id, nombre: "A", orden: 1, checklist: { plantillaId: "chk", version: 1 },
      tiempoEstimado: { valor: 1, unidad: "horas" }, moneda: "moneda-inexistente",
    });
    expect(r.ok).toBe(false);
  });
});

describe("composición fail-safe (activos / planes)", () => {
  it("crear con activo inexistente falla (ActivosPort)", async () => {
    rt = crearPreventivoRuntime({ activos: new ActivosPruebaFaltantes(["act-x"]) });
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" }, activos: ["act-x"] });
    expect(r.ok).toBe(false);
  });
  it("crear con plan no publicado falla (PlanesPort)", async () => {
    rt = crearPreventivoRuntime({ planes: new PlanesPruebaNoPublicados([{ planId: "pl-1", version: 1 }]) });
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" }, planes: [{ planId: "pl-1", version: 1 }] });
    expect(r.ok).toBe(false);
  });
  it("crear sin ActivosPort configurado y con activos falla seguro", async () => {
    rt = crearPreventivoRuntime({ activos: null });
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" }, activos: ["act-1"] });
    expect(r.ok).toBe(false);
  });
});

describe("generación idempotente", () => {
  async function programaPublicado() {
    const p = await crearPrograma();
    await publicar(p.id, p.version);
    return p;
  }
  it("SIN materializador la generación queda pendiente", async () => {
    rt = crearPreventivoRuntime();
    const p = await programaPublicado();
    const r = await exec(`${MODULO}.generar`, { programaId: p.id, actividadId: "a-1", activoId: "act-1", ventana: "2025-03-01", origen: "programada", fechaObjetivo: "2025-03-01T00:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { estado: string }).estado).toBe("pendiente");
  });
  it("CON materializador crea la OT y materializa", async () => {
    rt = crearPreventivoRuntime({ materializador: new MaterializadorPrueba() });
    const p = await programaPublicado();
    const r = await exec(`${MODULO}.generar`, { programaId: p.id, actividadId: "a-1", activoId: "act-1", ventana: "2025-03-01", origen: "programada", fechaObjetivo: "2025-03-01T00:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect((r.value as { estado: string }).estado).toBe("materializada"); expect((r.value as { ordenTrabajoId: string | null }).ordenTrabajoId).toBeTruthy(); }
  });
  it("no genera duplicado para la misma ocurrencia", async () => {
    rt = crearPreventivoRuntime({ materializador: new MaterializadorPrueba() });
    const p = await programaPublicado();
    const base = { programaId: p.id, actividadId: "a-1", activoId: "act-1", ventana: "2025-03-01", origen: "programada", fechaObjetivo: "2025-03-01T00:00:00.000Z" };
    const r1 = await exec(`${MODULO}.generar`, base);
    const r2 = await exec(`${MODULO}.generar`, base);
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { corresponde: boolean }).corresponde).toBe(false);
    const gens = await query(`${MODULO}.generaciones`, { programaId: p.id });
    if (gens.ok) expect((gens.value as unknown[]).length).toBe(1);
  });
  it("es idempotente por opId", async () => {
    rt = crearPreventivoRuntime();
    const p = await programaPublicado();
    const base = { opId: "g-op-1", programaId: p.id, actividadId: "a-1", activoId: "act-1", ventana: "2025-03-01", origen: "programada", fechaObjetivo: "2025-03-01T00:00:00.000Z" };
    const r1 = await exec(`${MODULO}.generar`, base);
    const r2 = await exec(`${MODULO}.generar`, base);
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
  it("no genera desde un programa NO publicado", async () => {
    rt = crearPreventivoRuntime();
    const p = await crearPrograma();
    const r = await exec(`${MODULO}.generar`, { programaId: p.id, actividadId: "a-1", activoId: "act-1", ventana: "2025-03-01", origen: "programada", fechaObjetivo: "2025-03-01T00:00:00.000Z" });
    expect(r.ok).toBe(false);
  });
});

describe("catálogos configurables", () => {
  beforeEach(() => { rt = crearPreventivoRuntime(); });
  it("upsert de una entrada y su uso posterior", async () => {
    const up = await exec(`${MODULO}.catalogo-upsert`, { catalogo: "tipos-programa", clave: "predictivo", etiqueta: "Predictivo" });
    expect(up.ok).toBe(true);
    // Con entradas presentes, un valor canónico que no está registrado debe fallar.
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "predictivo", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    expect(r.ok).toBe(true);
  });
  it("habilitar/deshabilitar afecta la validación de referencia", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "tipos-programa", clave: "predictivo", etiqueta: "Predictivo" });
    await exec(`${MODULO}.catalogo-habilitar`, { catalogo: "tipos-programa", clave: "predictivo", habilitado: false });
    const r = await exec(`${MODULO}.crear-programa`, { nombre: "A", tipo: "predictivo", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    expect(r.ok).toBe(false);
  });
});

describe("multitenancy", () => {
  it("exige tenantId en el contexto", async () => {
    rt = crearPreventivoRuntime();
    const ctxSinTenant = rt.platform.kernel; // usamos ctx del runtime con tenant vacío
    const r = await ctxSinTenant.commands.execute(rt.ctx(""), `${MODULO}.crear-programa`, { nombre: "A", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" } });
    expect(r.ok).toBe(false);
  });
});
