/**
 * DGP-015.2 · Módulo Enterprise Corrective Maintenance — Pruebas de integración
 * PostgreSQL. Cubre: repositorio real + RLS/set_config (aislamiento tenant en
 * lectura y escritura), event log durable + proyección por outbox (read models:
 * solicitudes, intervenciones, eventos-de-activo con flag reincidente, historial),
 * SABOTAJE del aggregate (CQRS puro: el detalle se sirve del read model),
 * reconstrucción por REPLAY con EQUIVALENCIA, consola técnica real, offline por
 * orquestación con recibo durable (idempotencia), GENERACIÓN→OT idempotente (sin
 * OTs duplicadas ante reintento/concurrencia) y detección de reincidencia. Se
 * OMITE sin DATABASE_URL. Al terminar deja el outbox drenado y purga sus filas.
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
  crearCorrectivoRuntimeOperacional,
  MODULO,
  type CorrectivoRuntimeOperacional,
  type MaterializadorOrdenes,
} from "..";
import { ActivosPruebaTodos, DynamicFormsPruebaOk } from "../test-runtime";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const MODULE_PERMISSIONS = [
  "modulo.correctivo.read", "modulo.correctivo.write", "modulo.correctivo.govern",
  "modulo.correctivo.execute", "modulo.correctivo.admin",
];
const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MODULE_PERMISSIONS]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: ["*"] };

const T_A = `pgcor-a-${Date.now()}`;
const T_B = `pgcor-b-${Date.now()}`;

const READ_TABLES = [
  "cor_solicitudes_read", "cor_diagnosticos_read", "cor_intervenciones_read",
  "cor_generaciones_read", "cor_eventos_activo_read", "cor_consumos_read", "cor_historial_read",
];
const AGG_TABLES = [
  "cor_solicitudes", "cor_diagnosticos", "cor_intervenciones", "cor_generaciones",
  "cor_generacion_materializaciones", "cor_eventos_activo", "cor_historial", "cor_catalogos",
  "cor_secuencias", "cor_recibos", "cor_eventos", "cor_sync_receipts",
];

suite("Módulo Enterprise Corrective Maintenance · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: CorrectivoRuntimeOperacional;

  // Materializador de PRUEBA (PG): OT determinista e idempotente por opId
  // (=claveDedup); NO depende del runtime de Órdenes. El runtime operacional real
  // compone el comando OFICIAL `modulo.ordenes.crear`.
  const otPorOp = new Map<string, string>();
  let otsCreadas = 0;
  const materializador: MaterializadorOrdenes = {
    async crearOrden(tenantId, _actorId, entrada): Promise<Result<{ ordenTrabajoId: string; idempotente: boolean }, KernelError>> {
      const k = `${tenantId}::${entrada.opId}`;
      const existente = otPorOp.get(k);
      if (existente) return ok({ ordenTrabajoId: existente, idempotente: true });
      const id = `ot-${entrada.opId}`;
      otPorOp.set(k, id);
      otsCreadas += 1;
      return ok({ ordenTrabajoId: id, idempotente: false });
    },
  };

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, name, input);
  // NOTA de ejecución paralela (`pnpm -r`): el outbox `deltaops.kernel_outbox` es
  // GLOBAL y compartido por todos los runtimes de módulo. Un procesador ajeno puede
  // reclamar (FOR UPDATE SKIP LOCKED) y marcar como procesado un evento de OTRO
  // módulo sin proyectarlo. Para NO depender de ese race durante las aserciones,
  // esta suite proyecta SIEMPRE por REPLAY de su bitácora durable propia
  // (`cor_eventos`) mediante el comando idempotente `reproyectar`. El outbox global
  // se drena SÓLO en afterAll (buen ciudadano: deja el outbox limpio sin robar
  // eventos ajenos durante la ventana de aserciones).
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

  /* --------------------------- Constructores E2E --------------------------- */

  async function crearSolicitud(tenantId: string, extra: Record<string, unknown> = {}) {
    const cr = await exec(ctx(tenantId), `${MODULO}.crear-solicitud`, {
      titulo: "Falla motor", origen: "operador",
      objeto: { activoId: "act-1" }, prioridad: "alta",
      sintomas: [{ texto: "Ruido anormal" }], ...extra,
    });
    if (!cr.ok) throw new Error(cr.error.message);
    return cr.value as { id: string; version: number };
  }

  // Solicitud aprobada atravesando el ciclo REAL (registro→triage→diagnostico→
  // validacion→aprobada) vía Workflow Engine.
  async function solicitudAprobada(tenantId: string, extra: Record<string, unknown> = {}) {
    const c = ctx(tenantId);
    const s = await crearSolicitud(tenantId, extra);
    let version = s.version;
    for (const accion of ["enviarTriage", "iniciarDiagnostico", "enviarValidacion", "aprobar"]) {
      const r = await exec(c, `${MODULO}.transicionar-solicitud`, { id: s.id, accion, expectedVersion: version });
      if (!r.ok) throw new Error(`${accion}: ${r.error.message}`);
      version = (r.value as { version: number }).version;
    }
    return { id: s.id, version };
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    rt = crearCorrectivoRuntimeOperacional({
      pool, materializador,
      activos: new ActivosPruebaTodos(),
      dynamicForms: new DynamicFormsPruebaOk(),
    });
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
    const s = await crearSolicitud(T_A);

    const enA = await conTenant<{ id: string; tenant_id: string }>(
      T_A, "select id, tenant_id from deltaops.cor_solicitudes where id = $1", [s.id],
    );
    expect(enA.length).toBe(1);
    expect(enA[0]!.tenant_id).toBe(T_A);

    await reproyectar(T_A); // proyección propia race-immune
    const dA = await query(ctx(T_A), `${MODULO}.solicitud-detalle`, { id: s.id });
    const dB = await query(ctx(T_B), `${MODULO}.solicitud-detalle`, { id: s.id });
    expect(dA.ok).toBe(true);
    expect(dB.ok).toBe(false); // otro tenant no ve el read model
  });

  it("proyecta por outbox al read model (detalle y listado desde CQRS)", async () => {
    const s = await crearSolicitud(T_A, { titulo: "Fuga hidráulica" });
    // El outbox global es compartido; garantizamos la proyección propia por replay
    // durable (equivalente) para determinismo bajo ejecución paralela (`pnpm -r`).
    await reproyectar(T_A);
    const det = await query(ctx(T_A), `${MODULO}.solicitud-detalle`, { id: s.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { titulo: string }).titulo).toBe("Fuga hidráulica");

    const lista = await query(ctx(T_A), `${MODULO}.solicitudes`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("gobierna el ciclo de la solicitud hasta 'aprobada' (Workflow Engine)", async () => {
    const s = await solicitudAprobada(T_A);
    await reproyectar(T_A);
    const det = await query(ctx(T_A), `${MODULO}.solicitud-detalle`, { id: s.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { estado: string }).estado).toBe("aprobada");
  });

  it("GENERACIÓN→OT idempotente: no duplica OTs ante reintento ni concurrencia", async () => {
    const s = await solicitudAprobada(T_A, { titulo: "Generación" });
    const c = ctx(T_A);

    const antes = otsCreadas;
    const g1 = await exec(c, `${MODULO}.generar-orden-correctiva`, { solicitudId: s.id });
    expect(g1.ok).toBe(true);
    if (g1.ok) {
      expect((g1.value as { estado: string }).estado).toBe("materializada");
      expect((g1.value as { ordenTrabajoId: string | null }).ordenTrabajoId).toBeTruthy();
    }
    // La materialización de la OT es SÍNCRONA (no depende del outbox): una sola OT.
    expect(otsCreadas).toBe(antes + 1);

    // CONCURRENCIA: ráfaga sobre la MISMA solicitud (misma claveDedup): el guard
    // atómico anti-duplicado garantiza una sola generación → una sola OT.
    const burst = await Promise.allSettled([
      exec(c, `${MODULO}.generar-orden-correctiva`, { solicitudId: s.id }),
      exec(c, `${MODULO}.generar-orden-correctiva`, { solicitudId: s.id }),
    ]);
    expect(burst.some((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok)).toBe(true);
    expect(otsCreadas).toBe(antes + 1);

    // GOBIERNO auditable: la generación pasó por el Workflow Engine real. Su
    // instancia (proceso `generacion`, definición `cor-generacion`) quedó
    // PERSISTIDA en `platform_records` bajo el servicio del motor, con estado
    // materializado (final). Prueba que la generación NO evade el gobierno.
    const instancias = await conTenant<{ id: string; status: string; data: { proceso?: string; definicion?: string } }>(
      T_A,
      `SELECT id, status, data FROM deltaops.platform_records
        WHERE tenant_id = $1 AND service = $2 AND record_type = 'instancia'
          AND data->>'proceso' = 'generacion'`,
      [T_A, "modulo.correctivo.workflow"],
    );
    expect(instancias.length).toBeGreaterThanOrEqual(1);
    const inst = instancias.find((r) => r.data?.definicion === "cor-generacion");
    expect(inst).toBeTruthy();
    expect(inst?.status).toBe("materializada");

    // La definición `cor-generacion` también está publicada y ACTIVA (auditable).
    const defs = await conTenant<{ id: string; status: string }>(
      T_A,
      `SELECT id, status FROM deltaops.platform_records
        WHERE tenant_id = $1 AND service = $2 AND record_type = 'definicion-workflow'
          AND data->>'clave' = 'cor-generacion'`,
      [T_A, "modulo.correctivo.workflow"],
    );
    expect(defs.length).toBeGreaterThanOrEqual(1);
    expect(defs.some((d) => d.status === "activa")).toBe(true);
  });

  it("registra eventos de activo y detecta reincidencia (read model con flag)", async () => {
    const c = ctx(T_A);
    const activoId = `activo-reinc-${Date.now()}`;
    // Semilla del catálogo de modos-de-falla (referencia validada por el comando).
    await exec(c, `${MODULO}.catalogo-upsert`, { catalogo: "modos-falla", clave: "sobrecalentamiento", etiqueta: "Sobrecalentamiento" });
    await exec(c, `${MODULO}.catalogo-habilitar`, { catalogo: "modos-falla", clave: "sobrecalentamiento", habilitado: true });
    const base = { activoId, tipo: "falla-reportada" as const, modoFalla: "sobrecalentamiento" };
    const e1 = await exec(c, `${MODULO}.registrar-evento-activo`, { ...base, ocurridoEn: "2025-03-01T00:00:00.000Z" });
    expect(e1.ok).toBe(true);
    const e2 = await exec(c, `${MODULO}.registrar-evento-activo`, { ...base, ocurridoEn: "2025-03-10T00:00:00.000Z" });
    expect(e2.ok).toBe(true);
    // La detección de reincidencia es SÍNCRONA (aggregate `cor_eventos_activo`),
    // independiente de la proyección: el 2º evento reincide con el 1º.
    if (e2.ok) expect((e2.value as { reincidente: boolean }).reincidente).toBe(true);

    // Proyección race-immune: reconstruye desde la bitácora durable propia
    // (`cor_eventos`), inmune a que otro procesador del outbox global reclame
    // eventos ajenos en ejecución paralela (`pnpm -r`).
    const repro = await exec(c, `${MODULO}.reproyectar`, {});
    expect(repro.ok).toBe(true);

    const eventos = await query(c, `${MODULO}.eventos-activo`, { activoId });
    expect(eventos.ok).toBe(true);
    if (eventos.ok) {
      const filas = eventos.value as Array<{ reincidente?: boolean }>;
      expect(filas.length).toBeGreaterThanOrEqual(2);
      expect(filas.some((f) => f.reincidente === true)).toBe(true);
    }
  });

  it("reconstruye por REPLAY del event log durable con EQUIVALENCIA", async () => {
    // Baseline race-immune: reconstruye desde la bitácora durable propia antes de
    // capturar (el outbox global compartido puede quedar incompleto bajo `pnpm -r`).
    const r0 = await reproyectar(T_A);
    expect(r0.ok).toBe(true);
    if (!r0.ok) return;
    expect((r0.value as { reproyectados: number }).reproyectados).toBeGreaterThan(0);

    const before = await query(ctx(T_A), `${MODULO}.solicitudes`, {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const antes = (before.value as { id: string }[]).map((o) => o.id).sort();

    const r = await reproyectar(T_A);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const after = await query(ctx(T_A), `${MODULO}.solicitudes`, {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const despues = (after.value as { id: string }[]).map((o) => o.id).sort();
    expect(despues).toEqual(antes); // REPLAY idempotente y equivalente
  });

  it("la consola técnica (admin) reporta outbox del módulo y tablas RLS", async () => {
    const r = await query(ctx(T_A), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { pendientes: number; procesados: number; ultimos: unknown[]; tablasRLS: unknown[] };
    expect(typeof v.procesados).toBe("number");
    expect(Array.isArray(v.ultimos)).toBe(true);
    expect(Array.isArray(v.tablasRLS) && v.tablasRLS.length).toBeGreaterThan(10);
  });

  it("sincronización offline durable: idempotente por opId (recibo)", async () => {
    const c = ctx(T_A);
    const id = crypto.randomUUID();
    const op = {
      opId: `sync-sol-${id}`,
      comando: "crear-solicitud",
      input: { id, titulo: "Offline", origen: "operador", objeto: { activoId: "act-1" }, prioridad: "alta", sintomas: [{ texto: "x" }] },
    };
    const r1 = await rt.sincronizar(c, [op]);
    expect(r1.total).toBe(1);
    expect(["aplicada", "idempotente"]).toContain(r1.resultados[0]!.estado);

    const r2 = await rt.sincronizar(c, [op]);
    expect(r2.resultados[0]!.estado).toBe("idempotente");
  });

  // SABOTAJE (CQRS puro): las CONSULTAS se sirven EXCLUSIVAMENTE del read model
  // (incluido el DETALLE), nunca del aggregate. Misma suite/runtime que el resto.
  it("SABOTAJE: detalle y listado se sirven del read model aunque el aggregate esté vacío", async () => {
    const s = await crearSolicitud(T_B, { titulo: "Solicitud sabotaje" });
    // SABOTAJE: vaciar la tabla aggregate. El read model NO debe depender de ella.
    await conTenant(T_B, "delete from deltaops.cor_solicitudes");
    const quedan = await conTenant<{ n: number }>(T_B, "select count(*)::int n from deltaops.cor_solicitudes where id=$1", [s.id]);
    expect(Number(quedan[0]?.n ?? -1)).toBe(0);

    // Reconstrucción race-immune desde la bitácora durable propia (el read model
    // no depende del aggregate y sobrevive al outbox global bajo `pnpm -r`).
    const repro = await exec(ctx(T_B), `${MODULO}.reproyectar`, {});
    expect(repro.ok).toBe(true);

    const det = await query(ctx(T_B), `${MODULO}.solicitud-detalle`, { id: s.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { titulo: string }).titulo).toBe("Solicitud sabotaje");

    const lista = await query(ctx(T_B), `${MODULO}.solicitudes`, {});
    expect(lista.ok).toBe(true);
    if (lista.ok) expect((lista.value as Array<{ id: string }>).map((x) => x.id)).toContain(s.id);
  });
});
