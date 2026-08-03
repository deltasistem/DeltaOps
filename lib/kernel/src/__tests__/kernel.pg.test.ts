import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { z } from "zod";
import {
  createDomainEvent,
  createExecutionContext,
  createKernelRuntime,
  fail,
  KernelErrors,
  MemoryLogger,
  ok,
  pgSessionOf,
  SYSTEM_PRINCIPAL,
  unwrap,
} from "..";

/**
 * DeltaOps Kernel · DGP-002 — Integración PostgreSQL real.
 * Prueba la atomicidad datos+outbox del Transaction Runtime y el lease
 * concurrente del outbox. Se omite si no hay DATABASE_URL.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

suite("PgUnitOfWork + PgOutbox (base de datos real)", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const TABLE = "deltaops.kernel_test_rows";
  const EVENT = "kernel.test.row-created";

  beforeAll(async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (id uuid PRIMARY KEY, nombre text NOT NULL)`,
    );
    await pool.query(`DELETE FROM ${TABLE}`);
    await pool.query(`DELETE FROM deltaops.kernel_outbox WHERE event_type = $1`, [EVENT]);
    await pool.query(`DELETE FROM deltaops.kernel_dead_letter WHERE event_type = $1`, [EVENT]);
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${TABLE}`);
    await pool.query(`DELETE FROM deltaops.kernel_outbox WHERE event_type = $1`, [EVENT]);
    await pool.query(`DELETE FROM deltaops.kernel_dead_letter WHERE event_type = $1`, [EVENT]);
    await pool.end();
  });

  function buildRuntime() {
    const runtime = createKernelRuntime({
      pool,
      logger: new MemoryLogger(),
      outboxMaxAttempts: 1,
    });
    runtime.commands.register({
      name: "test.createRow",
      inputSchema: z.object({ nombre: z.string(), sabotear: z.boolean() }),
      authorization: {},
      async handle(ctx, input, uow) {
        const client = pgSessionOf(uow); // escritura EN la transacción del UoW
        const id = crypto.randomUUID();
        await client.query(`INSERT INTO ${TABLE} (id, nombre) VALUES ($1, $2)`, [
          id,
          input.nombre,
        ]);
        uow.registerEvent(createDomainEvent(EVENT, { id }, ctx.correlationId));
        if (input.sabotear) {
          return fail(KernelErrors.conflict("sabotaje deliberado"));
        }
        return ok({ id });
      },
    });
    return runtime;
  }

  it("commit atómico: fila Y evento del outbox confirman juntos", async () => {
    const runtime = buildRuntime();
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL });
    const r = await runtime.commands.execute(ctx, "test.createRow", {
      nombre: "ok",
      sabotear: false,
    });
    expect(r.ok).toBe(true);

    const rows = await pool.query(`SELECT count(*)::int AS n FROM ${TABLE}`);
    expect(rows.rows[0].n).toBe(1);
    const outbox = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE event_type = $1 AND processed_at IS NULL`,
      [EVENT],
    );
    expect(outbox.rows[0].n).toBe(1);
  });

  it("rollback atómico: fallo del handler revierte fila Y evento (camino triste)", async () => {
    const runtime = buildRuntime();
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL });
    const r = await runtime.commands.execute(ctx, "test.createRow", {
      nombre: "rollback",
      sabotear: true,
    });
    expect(r.ok).toBe(false);

    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM ${TABLE} WHERE nombre = 'rollback'`,
    );
    expect(rows.rows[0].n).toBe(0);
    const outbox = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE event_type = $1`,
      [EVENT],
    );
    expect(outbox.rows[0].n).toBe(1); // solo el del test anterior
  });

  it("lease concurrente: dos claims simultáneos no comparten registros", async () => {
    const runtime = buildRuntime();
    const outbox = runtime.container.resolve(
      (await import("../runtime")).KernelTokens.outbox,
    );
    const [a, b] = await Promise.all([outbox.claimPending(10), outbox.claimPending(10)]);
    const idsA = unwrap(a).map((r) => r.id);
    const idsB = unwrap(b).map((r) => r.id);
    expect(idsA.filter((id) => idsB.includes(id))).toHaveLength(0);
    expect(idsA.length + idsB.length).toBe(1); // el único pendiente
  });

  it("dead letter atómico: markDead entierra y confirma sin re-entrega", async () => {
    const runtime = buildRuntime(); // maxAttempts = 1
    runtime.dispatcher.subscribe(EVENT, "siempre-falla", async () =>
      fail(KernelErrors.infrastructure("no disponible")),
    );
    // Liberar lease del test anterior esperando expiración no es viable (60s);
    // limpiamos el claim manualmente para este escenario.
    await pool.query(
      `UPDATE deltaops.kernel_outbox SET claimed_until = NULL WHERE event_type = $1`,
      [EVENT],
    );
    const summary = unwrap(await runtime.outboxProcessor.processPending());
    expect(summary.buried).toBe(1);

    const dead = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.kernel_dead_letter WHERE event_type = $1`,
      [EVENT],
    );
    expect(dead.rows[0].n).toBe(1);
    const pending = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE event_type = $1 AND processed_at IS NULL`,
      [EVENT],
    );
    expect(pending.rows[0].n).toBe(0);
  });
});
