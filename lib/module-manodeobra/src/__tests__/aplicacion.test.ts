/**
 * DGP-020.3 · Mano de Obra — Aplicación end-to-end sobre el runtime con FAKES.
 * Cubre: pipeline de comandos/queries, RBAC por permisos, idempotencia por opId,
 * flujo procesar-sesion (VALORADA / SIN_TARIFA / SIN_RECURSO), doble
 * procesar-sesion ⇒ una sola valoración, cambio de tarifa NO altera histórico,
 * revalorar sólo revalorables, resumen con pendientes y costo-estimado.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, type ExecutionContext, type Principal, type Result } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { crearManodeobraRuntime, manodeobraModule, MODULO, type ManodeobraRuntime } from "..";
import { FakeIdentidadPort, FakeOrdenesSesionPort } from "../infrastructure/fakes";

const TENANT = "t-mdo";

// Permisos del corpus + los del módulo (para el admin/servicio).
const MDO_PERMS = manodeobraModule({
  recursos: null as never, tarifas: null as never, valoraciones: null as never, recibos: null as never,
  identidad: null as never, ordenes: null as never, catalogos: null as never, eventLog: null as never,
}).permissions;
const ALL_PERMS = [...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MDO_PERMS])];

const admin: Principal = { id: "admin", rol: "admin", permisos: ALL_PERMS, capacidades: ["*"] };
const tecnico = (perms: string[]): Principal => ({ id: "mirror-1", rol: "tecnico", permisos: perms, capacidades: [] });

let rt: ManodeobraRuntime;
let identidad: FakeIdentidadPort;
let ordenes: FakeOrdenesSesionPort;

const ctx = (p: Principal = admin, identityId?: string): ExecutionContext =>
  createExecutionContext({ principal: p, metadata: identityId ? { tenantId: TENANT, identityId } : { tenantId: TENANT } });
const exec = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.commands.execute(c, name, input);
const query = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.queries.execute(c, name, input);
const must = <T>(r: Result<T, { message: string }>): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

const D = (iso: string) => new Date(iso);
function sesionCerrada(sesionId: string, ordenId: string, identityId: string, efectivoMs: number, iniciadoAt = "2024-03-01T00:00:00Z") {
  ordenes.set(TENANT, {
    sesionId, ordenId, activoId: "act1", identityId, estado: "CERRADA", efectivoMs, abierta: false,
    iniciadoAt: D(iniciadoAt), cerradoAt: D("2024-03-01T05:00:00Z"),
  });
}

beforeEach(() => {
  identidad = new FakeIdentidadPort();
  ordenes = new FakeOrdenesSesionPort();
  identidad.registrar(TENANT, "u1", "Ana Soto");
  rt = crearManodeobraRuntime({ identidad, ordenes });
});

async function definirRecursoYTarifa(valor: string = "40000") {
  must(await exec(ctx(), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" }));
  must(await exec(ctx(), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor, moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" }));
}

describe("DGP-020.3 · aplicación (fakes)", () => {
  it("procesar-sesion CERRADA con recurso + tarifa ⇒ VALORADA con costo exacto", async () => {
    await definirRecursoYTarifa();
    sesionCerrada("s1", "o1", "u1", 9_000_000); // 2h30m
    const r = must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1", ordenId: "o1" })) as Record<string, unknown>;
    expect(r["estado"]).toBe("VALORADA");
    expect(r["costo"]).toBe("100000.000000");
    expect(r["moneda"]).toBe("CLP");
  });

  it("SIN_TARIFA ⇒ costo NULL (nunca 0); SIN_RECURSO ⇒ costo NULL", async () => {
    // sin tarifa
    must(await exec(ctx(), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" }));
    sesionCerrada("s1", "o1", "u1", 9_000_000);
    const sinTarifa = must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" })) as Record<string, unknown>;
    expect(sinTarifa["estado"]).toBe("SIN_TARIFA");
    expect(sinTarifa["costo"]).toBeNull();
    // identidad sin recurso
    identidad.registrar(TENANT, "u2", "Sin Recurso");
    sesionCerrada("s2", "o1", "u2", 9_000_000);
    const sinRec = must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s2" })) as Record<string, unknown>;
    expect(sinRec["estado"]).toBe("SIN_RECURSO");
    expect(sinRec["costo"]).toBeNull();
  });

  it("doble procesar-sesion ⇒ una sola valoración (idempotente por sesión)", async () => {
    await definirRecursoYTarifa();
    sesionCerrada("s1", "o1", "u1", 9_000_000);
    const a = must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" })) as Record<string, unknown>;
    const b = must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" })) as Record<string, unknown>;
    expect(a["yaExistia"]).toBe(false);
    expect(b["yaExistia"]).toBe(true);
    const vals = must(await query(ctx(), `${MODULO}.valoraciones`, { ordenId: "o1" })) as { valoraciones: unknown[] };
    expect(vals.valoraciones.length).toBe(1);
  });

  it("idempotencia por opId ⇒ mismo comando repetido no re-ejecuta", async () => {
    const op = "op-tarifa-1";
    must(await exec(ctx(), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" }));
    const a = must(await exec(ctx(), `${MODULO}.tarifa.crear`, { opId: op, sujetoId: "soldador", valor: "40000", moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" })) as Record<string, unknown>;
    const b = must(await exec(ctx(), `${MODULO}.tarifa.crear`, { opId: op, sujetoId: "soldador", valor: "40000", moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" })) as Record<string, unknown>;
    expect(a["idempotente"]).toBe(false);
    expect(b["idempotente"]).toBe(true);
    const tarifas = must(await query(ctx(), `${MODULO}.tarifas`, { sujetoId: "soldador" })) as { tarifas: unknown[] };
    expect(tarifas.tarifas.length).toBe(1);
  });

  it("cambio de tarifa (actualizar) NO altera el histórico valorado", async () => {
    await definirRecursoYTarifa("40000");
    sesionCerrada("s1", "o1", "u1", 9_000_000);
    const v = must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" })) as Record<string, unknown>;
    expect(v["costo"]).toBe("100000.000000");
    // Sube la tarifa: cierra la vigente y crea una nueva.
    must(await exec(ctx(), `${MODULO}.tarifa.actualizar`, { sujetoId: "soldador", valor: "80000", moneda: "CLP", vigenciaDesde: "2024-07-01T00:00:00Z" }));
    // Reprocesar la MISMA sesión: sigue siendo la valoración original (VALORADA inmutable).
    const again = must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" })) as Record<string, unknown>;
    expect(again["yaExistia"]).toBe(true);
    expect(again["costo"]).toBe("100000.000000");
    // Hay 2 filas de tarifa (histórico versionado).
    const tarifas = must(await query(ctx(), `${MODULO}.tarifas`, { sujetoId: "soldador" })) as { tarifas: unknown[] };
    expect(tarifas.tarifas.length).toBe(2);
  });

  it("revalorar sólo aplica a SIN_TARIFA/SIN_RECURSO; VALORADA es inmutable", async () => {
    // SIN_TARIFA → definir tarifa → revalorar ⇒ VALORADA
    must(await exec(ctx(), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" }));
    sesionCerrada("s1", "o1", "u1", 9_000_000);
    must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" }));
    must(await exec(ctx(), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: "40000", moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" }));
    const rev = must(await exec(ctx(), `${MODULO}.valoracion.revalorar`, { sesionId: "s1" })) as Record<string, unknown>;
    expect(rev["estado"]).toBe("VALORADA");
    expect(rev["costo"]).toBe("100000.000000");
    // Ahora VALORADA ⇒ revalorar rechaza.
    const r2 = await exec(ctx(), `${MODULO}.valoracion.revalorar`, { sesionId: "s1" });
    expect(r2.ok).toBe(false);
  });

  it("resumen por OT: agrega valoradas y reporta pendientes (sesiones cerradas sin valorar)", async () => {
    await definirRecursoYTarifa();
    sesionCerrada("s1", "o1", "u1", 9_000_000);
    sesionCerrada("s2", "o1", "u1", 4_800_000); // no valorada
    must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" }));
    const res = must(await query(ctx(), `${MODULO}.resumen`, { ordenId: "o1" })) as Record<string, unknown>;
    expect((res["valoraciones"] as unknown[]).length).toBe(1);
    expect((res["pendientes"] as unknown[]).length).toBe(1);
    expect(res["efectivoMsTotal"]).toBe(13_800_000);
    expect(res["costoPorMoneda"]).toEqual([{ moneda: "CLP", costo: "100000.000000" }]);
  });

  it("valoraciones por ACTIVO (hoja de vida) muestra HORAS de sesiones cerradas SIN valorar (PENDIENTE)", async () => {
    // Sesión cerrada del activo pero NUNCA procesada ⇒ sin snapshot de
    // valoración. Antes del fix DGP-020.3 la hoja de vida quedaba VACÍA aunque
    // hubiera horas efectivas. Ahora se compone como PENDIENTE con sus horas.
    sesionCerrada("s1", "o1", "u1", 9_000_000); // 2h30, jamás procesar-sesion
    const porActivo = must(await query(ctx(), `${MODULO}.valoraciones`, { activoId: "act1" })) as {
      valoraciones: { sesionId: string; estado: string; efectivoMs: number; costo: string | null; ordenId: string }[];
    };
    expect(porActivo.valoraciones.length).toBe(1);
    const fila = porActivo.valoraciones[0]!;
    expect(fila.estado).toBe("PENDIENTE");
    expect(fila.efectivoMs).toBe(9_000_000); // horas reales visibles (autoridad = sesión)
    expect(fila.costo).toBeNull(); // costo NULL, nunca 0 (§15)
    expect(fila.ordenId).toBe("o1");
  });

  it("valoraciones por ACTIVO mezcla VALORADA (con snapshot) y PENDIENTE (cerrada sin snapshot), sin duplicar", async () => {
    await definirRecursoYTarifa();
    sesionCerrada("s1", "o1", "u1", 9_000_000); // se valora
    sesionCerrada("s2", "o1", "u1", 4_800_000); // cerrada, NO procesada ⇒ PENDIENTE
    must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" }));
    const porActivo = must(await query(ctx(), `${MODULO}.valoraciones`, { activoId: "act1" })) as {
      valoraciones: { sesionId: string; estado: string }[];
    };
    expect(porActivo.valoraciones.length).toBe(2);
    const porEstado = Object.fromEntries(porActivo.valoraciones.map((v) => [v.sesionId, v.estado]));
    expect(porEstado["s1"]).toBe("VALORADA");
    expect(porEstado["s2"]).toBe("PENDIENTE");
  });

  it("valoraciones por ACTIVO sin sesiones ni valoraciones ⇒ vacío honesto (0 filas)", async () => {
    const porActivo = must(await query(ctx(), `${MODULO}.valoraciones`, { activoId: "act-vacio" })) as { valoraciones: unknown[] };
    expect(porActivo.valoraciones.length).toBe(0);
  });

  it("valoraciones por ACTIVO surte la sesión ABIERTA como EN_CURSO con horas (causa raíz en vivo)", async () => {
    // Causa raíz verificada en vivo: CAM-001/OT-000022 dejó su sesión ABIERTA
    // (nunca cerrada). Componer sólo CERRADAs dejaba la ficha «Sin mano de obra»
    // pese a haber trabajo real. La abierta debe salir como EN_CURSO con horas.
    ordenes.set(TENANT, { sesionId: "s-viva", ordenId: "o1", activoId: "act1", identityId: "u1", estado: "ABIERTA", efectivoMs: 81, abierta: true, iniciadoAt: D("2024-03-01T00:00:00Z"), cerradoAt: null });
    const porActivo = must(await query(ctx(), `${MODULO}.valoraciones`, { activoId: "act1" })) as {
      valoraciones: { sesionId: string; estado: string; efectivoMs: number; costo: unknown }[];
    };
    const fila = porActivo.valoraciones.find((v) => v.sesionId === "s-viva")!;
    expect(fila).toBeDefined();
    expect(fila.estado).toBe("EN_CURSO");
    expect(fila.efectivoMs).toBe(81); // horas reales, jamás 0
    expect(fila.costo).toBeNull(); // sin costo falso (§15)
  });

  it("costo-estimado de sesión ABIERTA usa duraciones actuales × tarifa vigente", async () => {
    await definirRecursoYTarifa("35000");
    ordenes.set(TENANT, { sesionId: "sa", ordenId: "o1", activoId: "act1", identityId: "u1", estado: "ABIERTA", efectivoMs: 4_800_000, abierta: true, iniciadoAt: D("2024-03-01T00:00:00Z"), cerradoAt: null });
    const est = must(await query(ctx(), `${MODULO}.costo-estimado`, { sesionId: "sa" })) as Record<string, unknown>;
    expect(est["estimado"]).toBe(true);
    expect(est["costo"]).toBe("46666.666700");
    expect(est["sinTarifa"]).toBe(false);
  });

  it("procesar-sesion sobre sesión NO cerrada ⇒ error de negocio (no rompe)", async () => {
    await definirRecursoYTarifa();
    ordenes.set(TENANT, { sesionId: "sa", ordenId: "o1", activoId: "act1", identityId: "u1", estado: "ABIERTA", efectivoMs: 1000, abierta: true, iniciadoAt: D("2024-03-01T00:00:00Z"), cerradoAt: null });
    const r = await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "sa" });
    expect(r.ok).toBe(false);
  });

  it("RBAC: técnico sin permiso de config/tarifa es rechazado; 'mias' filtra por su identidad", async () => {
    await definirRecursoYTarifa();
    sesionCerrada("s1", "o1", "u1", 9_000_000);
    must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" }));

    const tec = tecnico([`${MODULO}.read`, `${MODULO}.mias`]);
    // Técnico NO puede crear tarifas.
    const noTarifa = await exec(ctx(tec, "u1"), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: "1", moneda: "CLP" });
    expect(noTarifa.ok).toBe(false);
    // Técnico NO puede definir recursos.
    const noCfg = await exec(ctx(tec, "u1"), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" });
    expect(noCfg.ok).toBe(false);
    // 'mias' devuelve SÓLO su identidad canónica (metadata.identityId).
    const mias = must(await query(ctx(tec, "u1"), `${MODULO}.mias`, {})) as { valoraciones: { identityId: string }[] };
    expect(mias.valoraciones.length).toBe(1);
    expect(mias.valoraciones.every((v) => v.identityId === "u1")).toBe(true);
    // 'mias' de OTRA identidad no ve las de u1.
    const otras = must(await query(ctx(tec, "u2"), `${MODULO}.mias`, {})) as { valoraciones: unknown[] };
    expect(otras.valoraciones.length).toBe(0);
  });

  it("RBAC same-tenant: técnico SÓLO ve/estima lo SUYO en las 4 queries; supervisor ve todo", async () => {
    // Dos técnicos del mismo tenant, cada uno con una sesión CERRADA valorada.
    identidad.registrar(TENANT, "u2", "Beto Díaz");
    await definirRecursoYTarifa(); // recurso u1 + tarifa soldador
    must(await exec(ctx(), `${MODULO}.recurso.definir`, { identityId: "u2", categoriaClave: "soldador" }));
    sesionCerrada("s1", "o1", "u1", 9_000_000);
    sesionCerrada("s2", "o1", "u2", 4_800_000); // misma OT, otra identidad
    must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" }));
    must(await exec(ctx(), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s2" }));

    const tec = tecnico([`${MODULO}.read`, `${MODULO}.mias`]); // técnico = u1 (id espejo mirror-1, identidad u1)

    // (a) valoraciones por OT: el técnico VE SÓLO su propia fila (filtrado), no la de u2.
    const porOT = must(await query(ctx(tec, "u1"), `${MODULO}.valoraciones`, { ordenId: "o1" })) as { valoraciones: { identityId: string }[] };
    expect(porOT.valoraciones.length).toBe(1);
    expect(porOT.valoraciones.every((v) => v.identityId === "u1")).toBe(true);

    // (b) valoraciones por identityId AJENO ⇒ RECHAZO explícito (no fuga).
    const ajena = await query(ctx(tec, "u1"), `${MODULO}.valoraciones`, { identityId: "u2" });
    expect(ajena.ok).toBe(false);

    // (b') valoraciones por activo (vía indirecta): filtrado a lo propio.
    const porActivo = must(await query(ctx(tec, "u1"), `${MODULO}.valoraciones`, { activoId: "act1" })) as { valoraciones: { identityId: string }[] };
    expect(porActivo.valoraciones.every((v) => v.identityId === "u1")).toBe(true);

    // (c) resumen de la OT: el técnico ve SÓLO sus filas y sus pendientes.
    const resumen = must(await query(ctx(tec, "u1"), `${MODULO}.resumen`, { ordenId: "o1" })) as { valoraciones: { identityId: string }[]; efectivoMsTotal: number };
    expect(resumen.valoraciones.every((v) => v.identityId === "u1")).toBe(true);
    expect(resumen.efectivoMsTotal).toBe(9_000_000); // sólo el tiempo de u1

    // (d) costo-estimado de una sesión AJENA (u2) ⇒ RECHAZO.
    ordenes.set(TENANT, { sesionId: "sa2", ordenId: "o1", activoId: "act1", identityId: "u2", estado: "ABIERTA", efectivoMs: 3_600_000, abierta: true, iniciadoAt: D("2024-03-01T00:00:00Z"), cerradoAt: null });
    const estAjeno = await query(ctx(tec, "u1"), `${MODULO}.costo-estimado`, { sesionId: "sa2" });
    expect(estAjeno.ok).toBe(false);

    // (e) modo 'mias' sin identidad canónica en el contexto ⇒ fail-closed (nunca lectura amplia).
    const sinId = await query(ctx(tec), `${MODULO}.valoraciones`, { ordenId: "o1" });
    expect(sinId.ok).toBe(false);

    // (f) SUPERVISOR (P_READ sin P_MIAS) ve TODO el tenant en la OT.
    const sup = tecnico([`${MODULO}.read`]);
    const todo = must(await query(ctx(sup, "sup-1"), `${MODULO}.valoraciones`, { ordenId: "o1" })) as { valoraciones: unknown[] };
    expect(todo.valoraciones.length).toBe(2);
    const supResumen = must(await query(ctx(sup, "sup-1"), `${MODULO}.resumen`, { ordenId: "o1" })) as { efectivoMsTotal: number };
    expect(supResumen.efectivoMsTotal).toBe(13_800_000);
    // Supervisor puede consultar por identityId ajeno sin rechazo.
    const supAjena = must(await query(ctx(sup, "sup-1"), `${MODULO}.valoraciones`, { identityId: "u2" })) as { valoraciones: unknown[] };
    expect(supAjena.valoraciones.length).toBe(1);
  });

  it("frontera ESTRICTA (R2): tarifa.crear/actualizar RECHAZAN el dinero como NÚMERO JSON", async () => {
    must(await exec(ctx(), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" }));
    // Número JSON con decimales que YA perdió precisión ⇒ rechazo de validación.
    const numFrac = await exec(ctx(), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: 35000.123456789 as unknown as string, moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" });
    expect(numFrac.ok).toBe(false);
    if (!numFrac.ok) expect(numFrac.error.kind).toBe("validation");
    // Notación científica como número ⇒ rechazo.
    const numExp = await exec(ctx(), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: 1e5 as unknown as string, moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" });
    expect(numExp.ok).toBe(false);
    // Cadena con notación científica ⇒ rechazo (no calza el pattern).
    const strExp = await exec(ctx(), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: "1e5", moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" });
    expect(strExp.ok).toBe(false);
    // actualizar también rechaza número.
    must(await exec(ctx(), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: "40000", moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" }));
    const updNum = await exec(ctx(), `${MODULO}.tarifa.actualizar`, { sujetoId: "soldador", valor: 80000 as unknown as string, moneda: "CLP", vigenciaDesde: "2024-07-01T00:00:00Z" });
    expect(updNum.ok).toBe(false);
    // La CADENA canónica sí se acepta.
    const okStr = await exec(ctx(), `${MODULO}.tarifa.actualizar`, { sujetoId: "soldador", valor: "80000", moneda: "CLP", vigenciaDesde: "2024-07-01T00:00:00Z" });
    expect(okStr.ok).toBe(true);
  });

  it("catálogo vacío expone categorías canónicas; unidad no soportada rechazada", async () => {
    const ops = must(await query(ctx(), `${MODULO}.catalogo.opciones`, { catalogo: "categorias-mdo" })) as { opciones: { value: string }[]; unidades: string[] };
    expect(ops.opciones.map((o) => o.value)).toContain("soldador");
    expect(ops.unidades).toEqual(["HORA"]);
    must(await exec(ctx(), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" }));
    const mala = await exec(ctx(), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: "1", moneda: "CLP", unidad: "DIA" });
    expect(mala.ok).toBe(false);
  });
});
