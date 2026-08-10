/**
 * DGP-016.2 · Módulo Enterprise Analytics & KPI Platform — Pruebas de integración
 * PostgreSQL. Cubre: repositorio real + RLS/set_config (aislamiento tenant en
 * lectura y escritura), event log durable + proyección por outbox (read models:
 * definiciones, dashboards, snapshots), SABOTAJE del aggregate (CQRS puro: el
 * detalle/listado se sirven del read model), reconstrucción por REPLAY con
 * EQUIVALENCIA, idempotencia de snapshot por clave determinista, evaluación REAL
 * sobre fuentes read-only fail-safe (y FALLO SEGURO sin fuente), offline por
 * orquestación con recibo durable (idempotencia) y consola técnica real. Se OMITE
 * sin DATABASE_URL. Al terminar deja el outbox drenado y purga sus filas.
 *
 * Igual que module-correctivo (DGP-015.2): bajo `pnpm -r` el outbox global es
 * compartido; para determinismo, esta suite proyecta SIEMPRE por REPLAY de su
 * bitácora durable propia (`an_eventos`) vía el comando idempotente `reproyectar`
 * y drena el outbox global SÓLO en afterAll (sin robar eventos ajenos).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  createExecutionContext,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearAnalyticsRuntimeOperacional,
  MODULO,
  type AnalyticsRuntimeOperacional,
  type CriterioFuente,
  type FuenteHechos,
  type Hecho,
  type RegistroFuentes,
} from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const MODULE_PERMISSIONS = [
  "modulo.analytics.read", "modulo.analytics.admin", "modulo.analytics.dashboard", "modulo.analytics.export",
];
const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MODULE_PERMISSIONS]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: ["*"] };

const T_A = `pgan-a-${Date.now()}`;
const T_B = `pgan-b-${Date.now()}`;

const READ_TABLES = ["an_definiciones_read", "an_dashboards_read", "an_snapshots_read"];
const AGG_TABLES = [
  "an_definiciones", "an_dashboards", "an_snapshots", "an_catalogos", "an_recibos",
  "an_eventos", "an_sync_receipts",
];

/** Fuente read-only de PRUEBA: series deterministas por dataset. */
class FuentePrueba implements FuenteHechos {
  constructor(private readonly porDataset: Record<string, Hecho[]>) {}
  datasets(): readonly string[] {
    return Object.keys(this.porDataset);
  }
  async hechos(_tenantId: string, criterio: CriterioFuente): Promise<Result<Hecho[], KernelError>> {
    const filas = this.porDataset[criterio.dataset] ?? [];
    // Emula el FAN-OUT del adaptador real: con filtro de activo, restringe a
    // ese activo; sin filtro, agrega los eventos de TODOS los activos.
    const activoId = typeof criterio.extra?.["activoId"] === "string" ? criterio.extra["activoId"] : null;
    if (activoId) return ok(filas.filter((h) => h["activo"] === activoId));
    return ok(filas);
  }
}

const FUENTES_PRUEBA: RegistroFuentes = {
  ordenes: new FuentePrueba({
    ordenes: [
      { id: "ot-1", estado: "abierta", prioridad: "alta", tipo: "correctiva" },
      { id: "ot-2", estado: "ejecucion", prioridad: "critica", tipo: "correctiva" },
      { id: "ot-3", estado: "cerrada", prioridad: "media", tipo: "preventiva" },
    ],
  }),
  // Eventos de activo MULTI-ACTIVO (fan-out): dos activos con fallas + eventos
  // no-falla, con insumos crudos de MTBF/MTTR y una reincidencia.
  correctivo: new FuentePrueba({
    "eventos-activo": [
      { id: "ev-1", activo: "act-1", tipo: "falla", esFalla: true, reincidente: false, tiempoEntreFallasMin: 600, tiempoReparacionMin: 120 },
      { id: "ev-2", activo: "act-1", tipo: "falla", esFalla: true, reincidente: true, tiempoEntreFallasMin: 400, tiempoReparacionMin: 60 },
      { id: "ev-3", activo: "act-1", tipo: "inspeccion", esFalla: false, reincidente: false, tiempoEntreFallasMin: 0, tiempoReparacionMin: 0 },
      { id: "ev-4", activo: "act-2", tipo: "falla", esFalla: true, reincidente: false, tiempoEntreFallasMin: 800, tiempoReparacionMin: 240 },
      { id: "ev-5", activo: "act-2", tipo: "inspeccion", esFalla: false, reincidente: false, tiempoEntreFallasMin: 0, tiempoReparacionMin: 0 },
    ],
  }),
};

suite("Módulo Enterprise Analytics & KPI Platform · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: AnalyticsRuntimeOperacional;
  let rtSinFuentes: AnalyticsRuntimeOperacional;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, name, input);
  const reproyectar = (tenantId: string) => exec(ctx(tenantId), `${MODULO}.reproyectar`, {});
  const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

  async function conTenant<Reg extends pg.QueryResultRow = pg.QueryResultRow>(
    tenantId: string, sql: string, params: unknown[] = [],
  ): Promise<Reg[]> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const r = await c.query<Reg>(sql, params);
      await c.query("commit");
      return r.rows;
    } finally {
      c.release();
    }
  }

  /** Define un indicador de conteo simple sobre el dataset `ordenes`. */
  async function definirIndicadorOrdenes(tenantId: string, clave: string) {
    const r = await exec(ctx(tenantId), `${MODULO}.definir-indicador`, {
      clave, nombre: `Conteo ${clave}`, categoria: "ordenes",
      fuente: { modulo: "ordenes", dataset: "ordenes" },
      expresion: { tipo: "conteo" },
      unidad: "conteo", formato: "entero",
    });
    if (!r.ok) throw new Error(r.error.message);
    return r.value as { clave: string; version: number };
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    rt = crearAnalyticsRuntimeOperacional({ pool, fuentes: FUENTES_PRUEBA });
    // Runtime paralelo SIN fuentes para verificar el fallo seguro (KRN-CFL).
    rtSinFuentes = crearAnalyticsRuntimeOperacional({ pool });
  });

  afterAll(async () => {
    await drenar().catch(() => undefined); // deja el outbox global limpio
    for (const t of [T_A, T_B]) {
      for (const tabla of [...READ_TABLES, ...AGG_TABLES]) {
        await conTenant(t, `delete from deltaops.${tabla}`).catch(() => undefined);
      }
    }
    await pool.end();
  });

  it("persiste con RLS y aísla por tenant en lectura y escritura", async () => {
    await definirIndicadorOrdenes(T_A, "rls-ind");

    const enA = await conTenant<{ clave: string; tenant_id: string }>(
      T_A, "select clave, tenant_id from deltaops.an_definiciones where clave = $1", ["rls-ind"],
    );
    expect(enA.length).toBe(1);
    expect(enA[0]!.tenant_id).toBe(T_A);

    await reproyectar(T_A); // proyección propia race-immune
    const dA = await query(ctx(T_A), `${MODULO}.indicador`, { clave: "rls-ind" });
    const dB = await query(ctx(T_B), `${MODULO}.indicador`, { clave: "rls-ind" });
    expect(dA.ok).toBe(true);
    expect(dB.ok).toBe(false); // otro tenant no ve el read model
  });

  it("proyecta por outbox al read model (detalle y listado desde CQRS)", async () => {
    await definirIndicadorOrdenes(T_A, "proj-ind");
    await reproyectar(T_A);
    const det = await query(ctx(T_A), `${MODULO}.indicador`, { clave: "proj-ind" });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { clave: string }).clave).toBe("proj-ind");

    const lista = await query(ctx(T_A), `${MODULO}.indicadores`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it("crea dashboards y los proyecta al read model", async () => {
    const cr = await exec(ctx(T_A), `${MODULO}.crear-dashboard`, {
      clave: `dash-${Date.now()}`, nombre: "Panel PG",
      widgets: [{ tipo: "card", titulo: "OT", indicadorClave: "proj-ind", presentacion: {} }],
    });
    expect(cr.ok).toBe(true);
    if (!cr.ok) return;
    const id = (cr.value as { id: string }).id;
    await reproyectar(T_A);
    const det = await query(ctx(T_A), `${MODULO}.dashboard`, { id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { nombre: string }).nombre).toBe("Panel PG");
  });

  it("evalúa un indicador REAL sobre fuentes read-only (lectura pura)", async () => {
    await definirIndicadorOrdenes(T_A, "eval-ind");
    await reproyectar(T_A);
    const r = await query(ctx(T_A), `${MODULO}.evaluar`, { clave: "eval-ind" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { valor: number }).valor).toBe(3); // 3 órdenes de prueba
  });

  /** Define un indicador de eventos-activo (fan-out multi-activo) con descripción. */
  async function definirIndicadorEventos(tenantId: string, clave: string, expresion: unknown, extras?: Record<string, unknown>) {
    const r = await exec(ctx(tenantId), `${MODULO}.definir-indicador`, {
      clave, nombre: `KPI ${clave}`, descripcion: `Descripción de ${clave}`, categoria: "confiabilidad",
      fuente: { modulo: "correctivo", dataset: "eventos-activo" },
      expresion, unidad: "conteo", formato: "entero", ...extras,
    });
    if (!r.ok) throw new Error(r.error.message);
    return r.value as { clave: string; version: number };
  }

  it("MTBF/MTTR/confiabilidad/reincidencias evalúan sobre TODOS los activos (fan-out) y NO quedan vacíos", async () => {
    // Sin filtro de activo: agrega los 5 eventos de act-1 + act-2.
    await definirIndicadorEventos(T_A, "fanout-mtbf", { tipo: "mtbf", campoTiempoOperativo: "tiempoEntreFallasMin", campoEsFalla: "esFalla" });
    await definirIndicadorEventos(T_A, "fanout-mttr", { tipo: "mttr", campoTiempoReparacion: "tiempoReparacionMin" });
    await definirIndicadorEventos(T_A, "fanout-reinc", { tipo: "conteo", filtros: [{ dimension: "estado", campo: "reincidente", operador: "eq", valor: true }] });
    await definirIndicadorEventos(T_A, "fanout-conf", { tipo: "ratio", filtros: [{ dimension: "tipo", campo: "tipo", operador: "neq", valor: "falla" }], factor: 100 });
    await reproyectar(T_A);

    const c = ctx(T_A);
    // MTBF = (600+400+800) / 3 fallas = 600
    const mtbf = await query(c, `${MODULO}.evaluar`, { clave: "fanout-mtbf" });
    expect(mtbf.ok).toBe(true);
    if (mtbf.ok) {
      expect((mtbf.value as { valor: number }).valor).toBeGreaterThan(0);
      expect((mtbf.value as { valor: number }).valor).toBeCloseTo(600, 0);
      expect((mtbf.value as { muestras: number }).muestras).toBe(3);
    }
    // MTTR = (120+60+240) / 3 reparaciones = 140
    const mttr = await query(c, `${MODULO}.evaluar`, { clave: "fanout-mttr" });
    expect(mttr.ok).toBe(true);
    if (mttr.ok) expect((mttr.value as { valor: number }).valor).toBeCloseTo(140, 0);
    // Reincidencias = 1 evento reincidente
    const reinc = await query(c, `${MODULO}.evaluar`, { clave: "fanout-reinc" });
    expect(reinc.ok).toBe(true);
    if (reinc.ok) expect((reinc.value as { valor: number }).valor).toBe(1);
    // Confiabilidad = 2 no-falla / 5 total * 100 = 40
    const conf = await query(c, `${MODULO}.evaluar`, { clave: "fanout-conf" });
    expect(conf.ok).toBe(true);
    if (conf.ok) expect((conf.value as { valor: number }).valor).toBeCloseTo(40, 0);
  });

  it("con filtro de activo, la evaluación se restringe SOLO a ese activo", async () => {
    await definirIndicadorEventos(T_A, "filtro-mtbf", { tipo: "mtbf", campoTiempoOperativo: "tiempoEntreFallasMin", campoEsFalla: "esFalla" });
    await reproyectar(T_A);
    // act-1: 2 fallas (600+400)/2 = 500
    const r = await query(ctx(T_A), `${MODULO}.evaluar`, {
      clave: "filtro-mtbf",
      filtros: [{ dimension: "activo", campo: "activo", operador: "eq", valor: "act-1" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { muestras: number }).muestras).toBe(2);
      expect((r.value as { valor: number }).valor).toBeCloseTo(500, 0);
    }
  });

  it("descripcion se proyecta en el read model del indicador (payload de evento)", async () => {
    await definirIndicadorEventos(T_A, "desc-ind", { tipo: "conteo" });
    await reproyectar(T_A);
    const r = await query(ctx(T_A), `${MODULO}.indicador`, { clave: "desc-ind" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { descripcion?: string }).descripcion).toBe("Descripción de desc-ind");
  });

  it("FALLO SEGURO: sin la fuente requerida, la evaluación es rechazada (KRN-CFL)", async () => {
    // El runtime sin fuentes comparte el mismo read model persistido; el indicador
    // ya existe, pero su fuente no está registrada ⇒ rechazo fail-safe.
    const c = createExecutionContext({ principal: ADMIN, metadata: { tenantId: T_A } });
    const r = await rtSinFuentes.platform.kernel.queries.execute(c, `${MODULO}.evaluar`, { clave: "eval-ind" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code.startsWith("KRN-CFL")).toBe(true);
  });

  it("materializa snapshots idempotentes por clave determinista", async () => {
    await definirIndicadorOrdenes(T_A, "snap-ind");
    const c = ctx(T_A);
    const evaluadoEn = "2025-01-01T00:00:00.000Z";
    const m1 = await exec(c, `${MODULO}.materializar-snapshot`, { clave: "snap-ind", evaluadoEn });
    expect(m1.ok).toBe(true);
    const m2 = await exec(c, `${MODULO}.materializar-snapshot`, { clave: "snap-ind", evaluadoEn });
    expect(m2.ok).toBe(true);
    if (m1.ok && m2.ok) {
      expect((m1.value as { claveSnapshot: string }).claveSnapshot).toBe((m2.value as { claveSnapshot: string }).claveSnapshot);
      expect((m2.value as { idempotente: boolean }).idempotente).toBe(true);
    }
    await reproyectar(T_A);
    const snaps = await query(c, `${MODULO}.snapshots`, { targetClave: "snap-ind" });
    expect(snaps.ok).toBe(true);
    if (snaps.ok) expect((snaps.value as unknown[]).length).toBe(1); // append-only, 1 sola fila
  });

  it("reconstruye por REPLAY del event log durable con EQUIVALENCIA", async () => {
    const r0 = await reproyectar(T_A);
    expect(r0.ok).toBe(true);
    if (!r0.ok) return;
    expect((r0.value as { reproyectados: number }).reproyectados).toBeGreaterThan(0);

    const before = await query(ctx(T_A), `${MODULO}.indicadores`, {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const antes = (before.value as { clave: string }[]).map((o) => o.clave).sort();

    const r = await reproyectar(T_A);
    expect(r.ok).toBe(true);

    const after = await query(ctx(T_A), `${MODULO}.indicadores`, {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const despues = (after.value as { clave: string }[]).map((o) => o.clave).sort();
    expect(despues).toEqual(antes); // REPLAY idempotente y equivalente
  });

  it("SABOTAJE: detalle y listado se sirven del read model aunque el aggregate esté vacío", async () => {
    await definirIndicadorOrdenes(T_B, "sabotaje-ind");
    // SABOTAJE: vaciar la tabla aggregate. El read model NO debe depender de ella.
    await conTenant(T_B, "delete from deltaops.an_definiciones");
    const quedan = await conTenant<{ n: number }>(
      T_B, "select count(*)::int n from deltaops.an_definiciones where clave=$1", ["sabotaje-ind"],
    );
    expect(Number(quedan[0]?.n ?? -1)).toBe(0);

    const repro = await exec(ctx(T_B), `${MODULO}.reproyectar`, {});
    expect(repro.ok).toBe(true);

    const det = await query(ctx(T_B), `${MODULO}.indicador`, { clave: "sabotaje-ind" });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { clave: string }).clave).toBe("sabotaje-ind");

    const lista = await query(ctx(T_B), `${MODULO}.indicadores`, {});
    expect(lista.ok).toBe(true);
    if (lista.ok) expect((lista.value as Array<{ clave: string }>).map((x) => x.clave)).toContain("sabotaje-ind");
  });

  it("sincronización offline durable: idempotente por opId (recibo)", async () => {
    const c = ctx(T_A);
    await definirIndicadorOrdenes(T_A, "sync-ind");
    const op = {
      opId: `sync-snap-${Date.now()}`,
      comando: "materializar-snapshot",
      input: { clave: "sync-ind", evaluadoEn: "2025-02-02T00:00:00.000Z" },
    };
    const r1 = await rt.sincronizar(c, [op]);
    expect(r1.total).toBe(1);
    expect(["aplicada", "idempotente"]).toContain(r1.resultados[0]!.estado);

    const r2 = await rt.sincronizar(c, [op]);
    expect(r2.resultados[0]!.estado).toBe("idempotente");
  });

  it("la consola técnica (admin) reporta outbox del módulo, read models y tablas RLS", async () => {
    const r = await query(ctx(T_A), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as {
      eventos: number; tablasRLS: unknown[];
      outbox: { pendientes: number; procesados: number; ultimos: unknown[] } | null;
      readModels: Record<string, number> | null;
    };
    expect(typeof v.eventos).toBe("number");
    expect(Array.isArray(v.tablasRLS) && v.tablasRLS.length).toBeGreaterThanOrEqual(9);
    expect(v.outbox).not.toBeNull();
    if (v.outbox) expect(typeof v.outbox.procesados).toBe("number");
    expect(v.readModels).not.toBeNull();
  });
});
