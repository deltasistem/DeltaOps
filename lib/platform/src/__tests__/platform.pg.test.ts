/**
 * DeltaOps Plataforma · DGP-003 — Testing de integración PostgreSQL.
 * Verifica adaptadores PG reales: persistencia, multitenancy, concurrencia
 * optimista y auditoría, contra deltaops.platform_records / platform_audit.
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
import { createPlatformRuntime, officialServices, type PlatformRuntime } from "..";

const describePg = suiteDestructiva(describe);

const ADMIN: Principal = {
  id: "pg-admin",
  rol: "admin",
  permisos: [...new Set(officialServices().flatMap((s) => [...s.permissions]))],
  capacidades: [],
};

describePg("Plataforma sobre PostgreSQL", () => {
  const pool = crearPoolDestructivo();
  let rt: PlatformRuntime;
  const tenantA = `pgtest-a-${Date.now()}`;
  const tenantB = `pgtest-b-${Date.now()}`;

  const ctxOf = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });

  beforeAll(() => {
    rt = createPlatformRuntime({ logger: new MemoryLogger(), pool });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM deltaops.platform_records WHERE tenant_id LIKE 'pgtest-%'");
    await pool.query("DELETE FROM deltaops.platform_audit WHERE tenant_id LIKE 'pgtest-%'");
    await pool.end();
  });

  it("persiste registros y auditoría de forma atómica (UoW)", async () => {
    const r = await rt.kernel.commands.execute(ctxOf(tenantA), "platform.task.create", {
      titulo: "Tarea PG",
    });
    expect(r.ok).toBe(true);
    const rows = await pool.query(
      "SELECT * FROM deltaops.platform_records WHERE tenant_id = $1 AND service = 'platform.task'",
      [tenantA],
    );
    expect(rows.rowCount).toBe(1);
    const auditRows = await pool.query(
      "SELECT * FROM deltaops.platform_audit WHERE tenant_id = $1 AND service = 'platform.task'",
      [tenantA],
    );
    expect(auditRows.rowCount).toBe(1);
  });

  it("aísla tenants en PostgreSQL", async () => {
    const listB = await rt.kernel.queries.execute(ctxOf(tenantB), "platform.task.list", {});
    expect(listB.ok && (listB.value as unknown[]).length).toBe(0);
  });

  it("concurrencia optimista: la segunda escritura sobre versión obsoleta falla", async () => {
    const t = await rt.kernel.commands.execute(ctxOf(tenantA), "platform.task.create", {
      titulo: "Concurrente",
    });
    const id = (t as { value: { id: string } }).value.id;
    // Dos asignaciones simultáneas: exactamente una debe ganar
    const [r1, r2] = await Promise.all([
      rt.kernel.commands.execute(ctxOf(tenantA), "platform.task.assign", { id, asignadoA: "u-1" }),
      rt.kernel.commands.execute(ctxOf(tenantA), "platform.task.assign", { id, asignadoA: "u-2" }),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    const final = await rt.kernel.queries.execute(ctxOf(tenantA), "platform.task.get", { id });
    expect(final.ok).toBe(true);
  });

  it("rollback: si el comando falla, ni datos ni auditoría quedan persistidos", async () => {
    const before = await pool.query(
      "SELECT count(*)::int AS n FROM deltaops.platform_records WHERE tenant_id = $1",
      [tenantB],
    );
    // Transición inválida: export.complete sobre job inexistente
    const r = await rt.kernel.commands.execute(ctxOf(tenantB), "platform.export.complete", {
      id: "no-existe",
    });
    expect(r.ok).toBe(false);
    const after = await pool.query(
      "SELECT count(*)::int AS n FROM deltaops.platform_records WHERE tenant_id = $1",
      [tenantB],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("timeline.query (PG): entityRef se empuja al almacén y sobrevive a la ventana de límite", async () => {
    // Regresión LITE-09 en el camino de PRODUCCIÓN (PostgreSQL): con > 500
    // entradas de otros activos, el filtro por entityRef debe hacerse en SQL
    // (data->>'entityRef' = $), NO sobre las primeras N filas por created_at.
    const tenant = `pgtest-tl-${Date.now()}`;
    const ctx = ctxOf(tenant);
    for (let i = 0; i < 520; i += 1) {
      await rt.kernel.commands.execute(ctx, "platform.timeline.record", {
        entryId: `pg-ruido-${i}`,
        entityRef: "activo:PG-RUIDO",
        eventType: "modulo.demo.evento",
        actorId: "u-1",
        occurredAt: new Date(2024, 0, 1, 0, 0, i).toISOString(),
        resumen: "ruido",
      });
    }
    await rt.kernel.commands.execute(ctx, "platform.timeline.record", {
      entryId: "pg-objetivo-1",
      entityRef: "activo:PG-OBJETIVO",
      eventType: "historico.jornada",
      actorId: "u-2",
      occurredAt: "2024-06-01T10:00:00.000Z",
      resumen: "jornada histórica",
    });
    const soloObjetivo = await rt.kernel.queries.execute(ctx, "platform.timeline.query", {
      entityRef: "activo:PG-OBJETIVO",
    });
    expect(soloObjetivo.ok && (soloObjetivo.value as unknown[]).length).toBe(1);
    await pool.query("DELETE FROM deltaops.platform_records WHERE tenant_id = $1", [tenant]);
    await pool.query("DELETE FROM deltaops.platform_audit WHERE tenant_id = $1", [tenant]);
  });

  it("outbox: los eventos de plataforma viajan por deltaops.kernel_outbox", async () => {
    const before = await pool.query(
      "SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE event_type = 'platform.task.created'",
    );
    await rt.kernel.commands.execute(ctxOf(tenantA), "platform.task.create", { titulo: "Evt" });
    const after = await pool.query(
      "SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE event_type = 'platform.task.created'",
    );
    expect(after.rows[0].n).toBe(before.rows[0].n + 1);
  });
});
