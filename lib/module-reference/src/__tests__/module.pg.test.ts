/**
 * DGP-004 · Reference Module — Pruebas de integración PostgreSQL.
 * Cubre: repositorio real, RLS/set_config, rollback transaccional, outbox,
 * concurrencia optimista y read model persistente. Se omite sin DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
// LITE-11 §2/§3/§4 — guard FAIL-CLOSED de BD de test (subpath sin efectos @workspace/db/test-guard).
import { suiteDestructiva, crearPoolDestructivo } from "@workspace/db/test-guard";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { createReferenceRuntime, MODULO, referenceModule, type ReferenceRuntime } from "..";

const suite = suiteDestructiva(describe);

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...referenceModule({ repository: null as never, readModel: null as never }).permissions,
  ]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };

const T = `pgref-${Date.now()}`;

suite("Reference Module · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: ReferenceRuntime;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, cmd: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, cmd, input);

  beforeAll(() => {
    pool = crearPoolDestructivo();
    rt = createReferenceRuntime({ pool, logger: new MemoryLogger() });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM deltaops.ref_elementos WHERE tenant_id LIKE 'pgref-%'`);
    await pool.query(`DELETE FROM deltaops.ref_elementos_read WHERE tenant_id LIKE 'pgref-%'`);
    await pool.query(`DELETE FROM deltaops.platform_audit WHERE tenant_id LIKE 'pgref-%'`);
    await pool.query(`DELETE FROM deltaops.platform_records WHERE tenant_id LIKE 'pgref-%'`);
    await pool.end();
  });

  it("persiste el aggregate y la auditoría atómicamente", async () => {
    const r = await exec(ctx(T), `${MODULO}.crear`, { nombre: "PG Uno", descripcion: "pg" });
    expect(r.ok).toBe(true);
    const rows = await pool.query(`SELECT * FROM deltaops.ref_elementos WHERE tenant_id=$1`, [T]);
    expect(rows.rowCount).toBe(1);
    const auditRows = await pool.query(
      `SELECT * FROM deltaops.platform_audit WHERE tenant_id=$1 AND service=$2`, [T, MODULO],
    );
    expect(auditRows.rowCount).toBeGreaterThan(0);
  });

  it("outbox: los eventos del módulo llegan al outbox y la proyección puebla el read model", async () => {
    await rt.platform.kernel.outboxProcessor.processPending();
    const read = await pool.query(`SELECT * FROM deltaops.ref_elementos_read WHERE tenant_id=$1`, [T]);
    expect(read.rowCount).toBe(1);
    expect(read.rows[0].estado).toBe("BORRADOR");
  });

  it("rollback: un comando fallido no deja rastro (nombre duplicado)", async () => {
    const dup = await exec(ctx(T), `${MODULO}.crear`, { nombre: "pg uno" });
    expect(dup.ok).toBe(false);
    const rows = await pool.query(`SELECT count(*)::int AS n FROM deltaops.ref_elementos WHERE tenant_id=$1`, [T]);
    expect(rows.rows[0].n).toBe(1);
  });

  it("concurrencia optimista: la segunda edición con versión vieja falla", async () => {
    const el = await pool.query(`SELECT id FROM deltaops.ref_elementos WHERE tenant_id=$1`, [T]);
    const id = el.rows[0].id;
    const e1 = await exec(ctx(T), `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "a" });
    expect(e1.ok).toBe(true);
    const e2 = await exec(ctx(T), `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "b" });
    expect(e2.ok).toBe(false);
  });

  it("multitenancy en PG: otro tenant no ve los datos", async () => {
    const otro = await rt.adapters.repository.list(`${T}-otro`, {});
    expect(otro.ok).toBe(true);
    if (!otro.ok) return;
    expect(otro.value).toHaveLength(0);
  });

  it("ciclo completo activar/archivar persiste transiciones y read model", async () => {
    const el = await pool.query(`SELECT id, version FROM deltaops.ref_elementos WHERE tenant_id=$1`, [T]);
    const { id, version } = el.rows[0];
    const act = await exec(ctx(T), `${MODULO}.activar`, { id, expectedVersion: version });
    expect(act.ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();
    const read = await pool.query(
      `SELECT estado FROM deltaops.ref_elementos_read WHERE tenant_id=$1 AND id=$2`, [T, id],
    );
    expect(read.rows[0].estado).toBe("ACTIVO");
  });
});
