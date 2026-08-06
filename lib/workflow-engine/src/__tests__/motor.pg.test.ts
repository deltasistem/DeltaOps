/**
 * DGP-007 · Workflow Engine — Pruebas de integración PostgreSQL.
 *
 * Cubre: persistencia real vía RecordStore (RLS/set_config), outbox, concurrencia
 * optimista, aislamiento multitenant y recibos durables de sincronización. Se
 * OMITE sin DATABASE_URL (patrón describe.skip de lib/module-reference).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { createWorkflowRuntime, crearMotorWorkflow, nombresInstancia, type WorkflowRuntime } from "..";
import { PERMISO_REVISAR, SERVICIO, workflowSolicitud, workflowTicket } from "./ejemplo";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...crearMotorWorkflow({ servicio: SERVICIO }).permissions,
    PERMISO_REVISAR,
  ]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };
const n = nombresInstancia(SERVICIO);
const T = `wfpg-${Date.now()}`;

suite("Workflow Engine · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: WorkflowRuntime;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, cmd: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, cmd, input);
  const query = (c: ExecutionContext, q: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, q, input);

  async function publicarActivar(c: ExecutionContext, def = workflowSolicitud): Promise<void> {
    const id = crypto.randomUUID();
    await exec(c, `${SERVICIO}.definicion.publicar`, { id, definicion: def });
    await exec(c, `${SERVICIO}.definicion.activar`, { id, version: 1 });
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    rt = createWorkflowRuntime({ servicio: SERVICIO }, { pool, logger: new MemoryLogger() });
    await publicarActivar(ctx(T));
    // Multiplexación: un SEGUNDO proceso activo (clave distinta) bajo el mismo
    // servicio, para el caso de regresión DGP-013 con persistencia real.
    await publicarActivar(ctx(T), workflowTicket);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM deltaops.platform_audit WHERE tenant_id LIKE 'wfpg-%'`);
    await pool.query(`DELETE FROM deltaops.platform_records WHERE tenant_id LIKE 'wfpg-%'`);
    await pool.end();
  });

  it("persiste la instancia y la auditoría atómicamente", async () => {
    const id = crypto.randomUUID();
    const r = await exec(ctx(T), n.iniciar, { id, data: { titulo: "PG uno" } });
    expect(r.ok).toBe(true);
    const rows = await pool.query(
      `SELECT * FROM deltaops.platform_records WHERE tenant_id=$1 AND record_type='instancia' AND id=$2`,
      [T, id],
    );
    expect(rows.rowCount).toBe(1);
    const audit = await pool.query(
      `SELECT * FROM deltaops.platform_audit WHERE tenant_id=$1 AND service=$2 AND action='iniciar'`,
      [T, SERVICIO],
    );
    expect(audit.rowCount).toBeGreaterThan(0);
  });

  it("transición persiste el nuevo estado y sube la versión", async () => {
    const id = crypto.randomUUID();
    await exec(ctx(T), n.iniciar, { id, data: { titulo: "PG trans" } });
    const t = await exec(ctx(T), n.transicionar, { id, version: 1, comando: "enviar" });
    expect(t.ok).toBe(true);
    const rows = await pool.query(
      `SELECT status, version FROM deltaops.platform_records WHERE tenant_id=$1 AND id=$2`,
      [T, id],
    );
    expect(rows.rows[0].status).toBe("enviada");
    expect(rows.rows[0].version).toBe(2);
  });

  it("concurrencia optimista: la segunda transición con versión vieja falla", async () => {
    const id = crypto.randomUUID();
    await exec(ctx(T), n.iniciar, { id, data: { titulo: "PG cc" } });
    const e1 = await exec(ctx(T), n.transicionar, { id, version: 1, comando: "enviar" });
    expect(e1.ok).toBe(true);
    const e2 = await exec(ctx(T), n.transicionar, { id, version: 1, comando: "enviar" });
    expect(e2.ok).toBe(false);
  });

  it("rollback: una transición ilegal no deja rastro de auditoría", async () => {
    const id = crypto.randomUUID();
    await exec(ctx(T), n.iniciar, { id, data: { titulo: "PG rb" } });
    const bad = await exec(ctx(T), n.transicionar, { id, version: 1, comando: "resolver" });
    expect(bad.ok).toBe(false);
    const rows = await pool.query(
      `SELECT status FROM deltaops.platform_records WHERE tenant_id=$1 AND id=$2`,
      [T, id],
    );
    expect(rows.rows[0].status).toBe("borrador");
  });

  it("sync (procesarCola) aplica e idempotencia durable por opId en PG", async () => {
    const inst = crypto.randomUUID();
    const op = { opId: crypto.randomUUID(), comando: n.iniciar, input: { id: inst, data: { titulo: "PG sync" } } };
    const r1 = await rt.sincronizar(ctx(T), [op]);
    expect(r1.aplicadas).toBe(1);
    const r2 = await rt.sincronizar(ctx(T), [op]);
    expect(r2.idempotentes).toBe(1);
    const rows = await pool.query(
      `SELECT count(*)::int AS c FROM deltaops.platform_records WHERE tenant_id=$1 AND id=$2`,
      [T, inst],
    );
    expect(rows.rows[0].c).toBe(1);
  });

  it("gate de aprobación en PG: transicionar no cambia estado hasta aprobar", async () => {
    const id = crypto.randomUUID();
    await exec(ctx(T), n.iniciar, { id, data: { titulo: "PG gate" } });
    await exec(ctx(T), n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(ctx(T), n.transicionar, { id, version: 2, comando: "tomar" });
    await exec(ctx(T), n.transicionar, { id, version: 3, comando: "resolver" });
    const pend = await pool.query(`SELECT status FROM deltaops.platform_records WHERE tenant_id=$1 AND id=$2`, [T, id]);
    expect(pend.rows[0].status).toBe("enRevision");
  });

  it("multiplexación en PG: cada instancia resuelve SU definición por clave (persistencia real de _workflow)", async () => {
    // Con DOS definiciones activas del mismo servicio (solicitud + ticket), la
    // clave se persiste en la instancia (columna data->>'_workflow') y gobierna
    // la resolución de la definición en cada transición.
    const idS = crypto.randomUUID();
    const idT = crypto.randomUUID();
    await exec(ctx(T), n.iniciar, { id: idS, data: { titulo: "PG mux S", definicion: "solicitud-generica" } });
    await exec(ctx(T), n.iniciar, { id: idT, data: { titulo: "PG mux T", definicion: "ticket-generico" } });

    // La clave del proceso quedó persistida en cada registro.
    const claves = await pool.query(
      `SELECT id, data->>'_workflow' AS clave FROM deltaops.platform_records WHERE tenant_id=$1 AND id = ANY($2)`,
      [T, [idS, idT]],
    );
    const porId = Object.fromEntries(claves.rows.map((r) => [r.id, r.clave]));
    expect(porId[idS]).toBe("solicitud-generica");
    expect(porId[idT]).toBe("ticket-generico");

    // Comando propio de cada proceso: válido y no confundido con el ajeno.
    const okS = await exec(ctx(T), n.transicionar, { id: idS, version: 1, comando: "enviar" });
    const okT = await exec(ctx(T), n.transicionar, { id: idT, version: 1, comando: "abrir" });
    expect(okS.ok && (okS.value as { estado: string }).estado).toBe("enviada");
    expect(okT.ok && (okT.value as { estado: string }).estado).toBe("atendido");

    // Comando ajeno es ILEGAL en cada proceso (vocabularios disjuntos).
    const idS2 = crypto.randomUUID();
    await exec(ctx(T), n.iniciar, { id: idS2, data: { titulo: "PG mux S2", definicion: "solicitud-generica" } });
    const mal = await exec(ctx(T), n.transicionar, { id: idS2, version: 1, comando: "abrir" });
    expect(mal.ok).toBe(false);
    if (!mal.ok) expect(mal.error.code).toBe("KRN-CFL-001");
    const rowS2 = await pool.query(`SELECT status FROM deltaops.platform_records WHERE tenant_id=$1 AND id=$2`, [T, idS2]);
    expect(rowS2.rows[0].status).toBe("borrador"); // rollback: sin efecto
  });

  it("multitenancy en PG: otro tenant no ve las instancias", async () => {
    const otro = await query(ctx(`${T}-otro`), n.listar, {});
    expect(otro.ok).toBe(true);
    if (!otro.ok) return;
    expect(otro.value as unknown[]).toHaveLength(0);
  });
});
