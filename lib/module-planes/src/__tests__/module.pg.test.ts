/**
 * DGP-012.2 · Módulo Enterprise Maintenance Plans — Pruebas de integración PostgreSQL.
 * Cubre: repositorio real + RLS/set_config (aislamiento tenant en lectura y
 * escritura), event log durable + proyección por outbox (read models: planes,
 * generaciones), reconstrucción por REPLAY con EQUIVALENCIA, consola técnica
 * real, offline por orquestación con recibo durable (idempotencia) y generación
 * de OT idempotente (sin duplicados aún ante re-evaluación). Se OMITE sin
 * DATABASE_URL. Al terminar deja el outbox drenado y purga sus filas por tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
// LITE-11 §2/§3/§4 — guard FAIL-CLOSED de BD de test (subpath sin efectos @workspace/db/test-guard).
import { suiteDestructiva, crearPoolDestructivo } from "@workspace/db/test-guard";
import {
  createExecutionContext,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearPlanesRuntimeOperacional,
  MODULO,
  type MaterializadorOrdenes,
  type PlanesRuntimeOperacional,
} from "..";

const suite = suiteDestructiva(describe);

const MODULE_PERMISSIONS = [
  "modulo.planes.read", "modulo.planes.write", "modulo.planes.govern",
  "modulo.planes.generate", "modulo.planes.admin",
];
const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MODULE_PERMISSIONS]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: ["*"] };

const T_A = `pgpln-a-${Date.now()}`;
const T_B = `pgpln-b-${Date.now()}`;

const READ_TABLES = ["pln_planes_read", "pln_calendarios_read", "pln_generaciones_read", "pln_historial_read"];
const AGG_TABLES = [
  "pln_planes", "pln_calendarios", "pln_generaciones", "pln_historial",
  "pln_catalogos", "pln_secuencias", "pln_recibos", "pln_eventos", "pln_sync_receipts",
];

const planBase = () => ({
  nombre: "Plan bombas",
  tipoPlan: "preventivo",
  estrategia: "basado-tiempo",
  prioridad: "alta",
  alcance: { categorias: ["bombas"] },
  rutina: { id: "ru1", nombre: "Rutina", actividades: [{ id: "a1", orden: 0, tipo: "inspeccion", titulo: "Revisar" }] },
  programa: { frecuencia: { reglas: [{ tipo: "meses", cada: 3 }] }, vigenteDesde: "2024-01-01T00:00:00.000Z" },
});

suite("Módulo Enterprise Maintenance Plans · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: PlanesRuntimeOperacional;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, name, input);
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

  async function crearYPublicar(tenantId: string) {
    const c = ctx(tenantId);
    const cr = await exec(c, `${MODULO}.crear-plan`, planBase());
    if (!cr.ok) throw new Error(cr.error.message);
    const plan = cr.value as { id: string; version: number };
    const pub = await exec(c, `${MODULO}.publicar-plan`, { id: plan.id, expectedVersion: plan.version });
    if (!pub.ok) throw new Error(pub.error.message);
    await drenar();
    return { id: plan.id, version: (pub.value as { version: number }).version };
  }

  // Materializador de PRUEBA (PG): OT determinista e idempotente por opId; NO
  // depende de otro runtime. El runtime operacional real compone el comando
  // OFICIAL `modulo.ordenes.crear`.
  const otPorClave = new Map<string, string>();
  let otCreadas = 0;
  const materializador: MaterializadorOrdenes = {
    async crearOrden(tenantId, _actorId, orden) {
      const k = `${tenantId}::${orden.opId}`;
      const existente = otPorClave.get(k);
      if (existente) return { ok: true, value: { ordenTrabajoId: existente, idempotente: true } };
      const id = `ot-${orden.claveDedup}`;
      otPorClave.set(k, id);
      otCreadas += 1;
      return { ok: true, value: { ordenTrabajoId: id, idempotente: false } };
    },
  };

  beforeAll(() => {
    pool = crearPoolDestructivo();
    rt = crearPlanesRuntimeOperacional({ pool, materializador });
  });

  afterAll(async () => {
    await drenar().catch(() => undefined);
    for (const t of [T_A, T_B]) {
      for (const tabla of [...READ_TABLES, ...AGG_TABLES]) {
        await conTenant(t, `delete from deltaops.${tabla}`).catch(() => undefined);
      }
    }
    await pool.end();
  });

  it("persiste plan con RLS y aísla por tenant en lectura y escritura", async () => {
    const { id } = await crearYPublicar(T_A);

    const enA = await conTenant<{ id: string; tenant_id: string }>(
      T_A, "select id, tenant_id from deltaops.pln_planes where id = $1", [id],
    );
    expect(enA.length).toBe(1);
    expect(enA[0]!.tenant_id).toBe(T_A);

    // El detalle por query respeta el tenant del contexto (read model filtrado).
    const dA = await query(ctx(T_A), `${MODULO}.plan`, { id });
    const dB = await query(ctx(T_B), `${MODULO}.plan`, { id });
    expect(dA.ok).toBe(true);
    expect(dB.ok).toBe(false);
  });

  it("proyecta por outbox al read model de planes (detalle y listado desde CQRS)", async () => {
    const { id } = await crearYPublicar(T_A);

    const det = await query(ctx(T_A), `${MODULO}.plan`, { id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { estado: string }).estado).toBe("vigente");

    const lista = await query(ctx(T_A), `${MODULO}.planes`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("genera OT (evaluar-generacion) de forma idempotente: sin duplicados ante re-evaluación", async () => {
    const { id, version } = await crearYPublicar(T_A);
    const c = ctx(T_A);
    const input = {
      planId: id, activoId: "activo-1", origen: "manual", ahora: "2024-06-01T00:00:00.000Z",
      anclaje: { desde: "2024-01-01T00:00:00.000Z" }, ocurrenciaManual: "orden-adhoc-1", opId: `gen-${id}`,
    };
    void version;
    const g1 = await exec(c, `${MODULO}.evaluar-generacion`, input);
    expect(g1.ok).toBe(true);
    if (!g1.ok) return;
    await drenar();

    // Re-evaluación con la MISMA ocurrencia: idempotente (mismo recibo/opId).
    const g2 = await exec(c, `${MODULO}.evaluar-generacion`, input);
    expect(g2.ok).toBe(true);
    if (g2.ok) expect((g2.value as { idempotente?: boolean }).idempotente).toBe(true);
    await drenar();

    const gens = await query(c, `${MODULO}.generaciones`, { planId: id });
    expect(gens.ok).toBe(true);
    if (!gens.ok) return;
    const claves = (gens.value as Array<{ claveDedup: string }>).map((x) => x.claveDedup);
    const unicas = new Set(claves);
    expect(unicas.size).toBe(claves.length); // sin duplicados
    expect(claves.some((k) => k.includes("orden-adhoc-1"))).toBe(true);
  });

  it("materializa OT REAL: persiste vínculo (estado) atómico y NO duplica en reintento/replay", async () => {
    const { id } = await crearYPublicar(T_A);
    const c = ctx(T_A);
    const gen = await exec(c, `${MODULO}.evaluar-generacion`, {
      planId: id, activoId: "activo-mat", origen: "manual", ahora: "2024-07-01T00:00:00.000Z",
      anclaje: { desde: "2024-01-01T00:00:00.000Z" }, ocurrenciaManual: "ot-mat-1", opId: `gm-${id}`,
    });
    expect(gen.ok).toBe(true);
    await drenar();

    const otAntes = otCreadas;
    const m1 = await exec(c, `${MODULO}.generar-ordenes-preventivas`, { planId: id, opId: `mat-${id}` });
    expect(m1.ok).toBe(true);
    if (!m1.ok) return;
    const v1 = m1.value as { ordenesCreadas: Array<{ ordenTrabajoId: string }> };
    expect(v1.ordenesCreadas.length).toBeGreaterThanOrEqual(1);
    await drenar();
    expect(otCreadas).toBe(otAntes + 1);

    // El read model refleja el vínculo con estado=materializada.
    const gens = await query(c, `${MODULO}.generaciones`, { planId: id });
    expect(gens.ok).toBe(true);
    if (!gens.ok) return;
    const g = (gens.value as Array<{ ordenTrabajoId: string | null; estado?: string; ocurrencia: string }>)
      .find((x) => x.ocurrencia.includes("ot-mat-1"));
    expect(g?.ordenTrabajoId).toBeTruthy();
    expect(g?.estado).toBe("materializada");

    // Reintento SIN opId: no hay pendientes ⇒ no crea otra OT (vínculo reconocido).
    const m2 = await exec(c, `${MODULO}.generar-ordenes-preventivas`, { planId: id });
    expect(m2.ok).toBe(true);
    await drenar();
    expect(otCreadas).toBe(otAntes + 1);

    // REPLAY (reproyectar) conserva el vínculo en el read model.
    const rep = await exec(c, `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    const gens2 = await query(c, `${MODULO}.generaciones`, { planId: id });
    expect(gens2.ok).toBe(true);
    if (!gens2.ok) return;
    const g2 = (gens2.value as Array<{ ordenTrabajoId: string | null; ocurrencia: string }>)
      .find((x) => x.ocurrencia.includes("ot-mat-1"));
    expect(g2?.ordenTrabajoId).toBe(g?.ordenTrabajoId);
  });

  it("reconstruye por REPLAY del event log durable con EQUIVALENCIA", async () => {
    const before = await query(ctx(T_A), `${MODULO}.planes`, {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const antes = (before.value as { id: string }[]).map((o) => o.id).sort();

    const r = await exec(ctx(T_A), `${MODULO}.reproyectar`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { reproyectados: number }).reproyectados).toBeGreaterThan(0);

    const after = await query(ctx(T_A), `${MODULO}.planes`, {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const despues = (after.value as { id: string }[]).map((o) => o.id).sort();
    expect(despues).toEqual(antes);
  });

  it("la consola técnica (admin) reporta read models, event log y outbox reales", async () => {
    const r = await query(ctx(T_A), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { eventLog: unknown; outbox: unknown; proyecciones: unknown; tablasRLS: unknown[] };
    expect(v.eventLog).toBeDefined();
    expect(v.outbox).toBeDefined();
    expect(v.proyecciones).toBeDefined();
    expect(Array.isArray(v.tablasRLS) && v.tablasRLS.length).toBeGreaterThan(10);
  });

  it("sincronización offline durable: idempotente por opId (recibo)", async () => {
    const c = ctx(T_A);
    const id = crypto.randomUUID();
    const op = {
      opId: `sync-plan-${id}`,
      comando: "crear-plan",
      input: { ...planBase(), id },
    };
    const r1 = await rt.sincronizar(c, [op]);
    expect(r1.total).toBe(1);
    expect(["aplicada", "idempotente"]).toContain(r1.resultados[0]!.estado);

    // Reintento con el MISMO opId ⇒ idempotente (recibo durable).
    const r2 = await rt.sincronizar(c, [op]);
    expect(r2.resultados[0]!.estado).toBe("idempotente");
    await drenar();
  });

  // SABOTAJE (CQRS puro): las CONSULTAS se sirven EXCLUSIVAMENTE del read model
  // (incluido el DETALLE), nunca del aggregate. Se ejecuta en la MISMA suite/
  // runtime que el resto de pruebas PG para evitar contención de outbox
  // compartido entre runtimes paralelos sobre la misma base.
  it("SABOTAJE: detalle y listado se sirven del read model aunque el aggregate esté vacío", async () => {
    const c = ctx(T_B);
    const cr = await exec(c, `${MODULO}.crear-plan`, planBase());
    expect(cr.ok).toBe(true);
    if (!cr.ok) return;
    const id = (cr.value as { id: string }).id;
    await drenar();

    // SABOTAJE: vaciar la tabla aggregate. El read model NO debe depender de ella.
    await conTenant(T_B, "delete from deltaops.pln_planes");
    const quedan = await conTenant<{ n: number }>(T_B, "select count(*)::int n from deltaops.pln_planes where id=$1", [id]);
    expect(Number(quedan[0]?.n ?? -1)).toBe(0);

    // El DETALLE sigue disponible desde el read model (snapshot en payload).
    const det = await query(c, `${MODULO}.plan`, { id });
    expect(det.ok).toBe(true);
    if (det.ok) {
      const v = det.value as { id: string; nombre: string };
      expect(v.id).toBe(id);
      expect(v.nombre).toBe("Plan bombas");
    }

    // El LISTADO también.
    const lista = await query(c, `${MODULO}.planes`, {});
    expect(lista.ok).toBe(true);
    if (lista.ok) expect((lista.value as Array<{ id: string }>).map((x) => x.id)).toContain(id);
  });

  it("SABOTAJE CQRS: calendario, historial y comparar-versiones se sirven del read model con aggregates vacíos", async () => {
    const c = ctx(T_B);

    // Calendario: crear ⇒ proyectar ⇒ vaciar aggregate ⇒ query sigue sirviendo.
    const calId = crypto.randomUUID();
    const cal = await exec(c, `${MODULO}.crear-calendario`, {
      id: calId, tipo: "empresa", ambito: "planta-b", nombre: "Cal sabotaje", diasLaborales: [1, 2, 3, 4, 5],
    });
    expect(cal.ok).toBe(true);
    await drenar();

    // Plan publicado ⇒ historial (creado/publicado) proyectado + comparar-versiones.
    const { id: planId } = await crearYPublicar(T_B);

    // SABOTAJE: vaciar los aggregates de calendarios, historial y planes.
    await conTenant(T_B, "delete from deltaops.pln_calendarios");
    await conTenant(T_B, "delete from deltaops.pln_historial");
    await conTenant(T_B, "delete from deltaops.pln_planes");

    const detCal = await query(c, `${MODULO}.calendario`, { id: calId });
    expect(detCal.ok).toBe(true);
    if (detCal.ok) expect((detCal.value as { nombre?: string }).nombre).toBe("Cal sabotaje");

    const hist = await query(c, `${MODULO}.historial`, { planId });
    expect(hist.ok).toBe(true);
    if (hist.ok) {
      const hitos = (hist.value as Array<{ hito: string }>).map((x) => x.hito);
      expect(hitos).toContain("creado");
      expect(hitos).toContain("publicado");
    }

    const cmp = await query(c, `${MODULO}.comparar-versiones`, { id: planId, a: 1, b: 1 });
    expect(cmp.ok).toBe(true); // servido desde el snapshot del read model
  });
});
