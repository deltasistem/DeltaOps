import pg from "pg";
import { z } from "zod";
import {
  createDomainEvent,
  createExecutionContext,
  createKernelRuntime,
  fail,
  KernelErrors,
  KernelTokens,
  MemoryLogger,
  ok,
  unwrap,
  type Principal,
} from "@workspace/kernel";

/**
 * DeltaOps · DGP-002 — Demostración por ejecución real del Kernel.
 * Corre contra PostgreSQL real (outbox y dead letter en esquema deltaops):
 * comando → UoW transaccional → outbox → dispatcher → dead letter → replay,
 * más query pipeline, autorización y result pattern.
 *
 * Ejecutar: pnpm --filter @workspace/scripts run kernel:demo
 */
const OPERATOR: Principal = {
  id: "demo-operador",
  rol: "operador",
  permisos: ["demo.create", "demo.read"],
  capacidades: [],
};

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const runtime = createKernelRuntime({
    pool,
    logger: new MemoryLogger(),
    outboxMaxAttempts: 2,
  });

  const paso = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);

  // Comando sintético (sin dominio): registra un evento en el outbox real.
  const registros: string[] = [];
  runtime.commands.register({
    name: "demo.create",
    inputSchema: z.object({ nombre: z.string().min(1) }),
    authorization: { permissions: ["demo.create"] },
    async handle(ctx, input, uow) {
      registros.push(input.nombre);
      uow.registerEvent(
        createDomainEvent("demo.created", { nombre: input.nombre }, ctx.correlationId),
      );
      return ok({ nombre: input.nombre });
    },
  });
  runtime.queries.register({
    name: "demo.list",
    inputSchema: z.object({}),
    authorization: { permissions: ["demo.read"] },
    async handle() {
      return ok(registros);
    },
  });

  let entregado = 0;
  let sabotear = true;
  runtime.dispatcher.subscribe("demo.created", "proyeccion-demo", async () => {
    if (sabotear) return fail(KernelErrors.infrastructure("manejador saboteado"));
    entregado += 1;
    return ok(undefined);
  });

  const ctx = createExecutionContext({ principal: OPERATOR });

  paso(1, "Command Pipeline + Unit of Work (transacción PostgreSQL real)");
  const r1 = await runtime.commands.execute(ctx, "demo.create", { nombre: "evento-real" });
  console.log("   Resultado:", JSON.stringify(r1));

  paso(2, "Result/Error Pattern — comando denegado (sin permiso)");
  const anon = createExecutionContext();
  const r2 = await runtime.commands.execute(anon, "demo.create", { nombre: "x" });
  console.log("   Resultado:", JSON.stringify(r2));

  paso(3, "Query Pipeline");
  const r3 = await runtime.queries.execute(ctx, "demo.list", {});
  console.log("   Resultado:", JSON.stringify(r3));

  paso(4, "Outbox real: pendientes en deltaops.kernel_outbox");
  const res = await pool.query(
    `SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE processed_at IS NULL AND event_type = 'demo.created'`,
  );
  console.log("   Pendientes:", res.rows[0].n);

  paso(5, "Dispatcher falla dos veces → Dead Letter real");
  console.log("   Drenaje 1:", JSON.stringify(unwrap(await runtime.outboxProcessor.processPending())));
  console.log("   Drenaje 2:", JSON.stringify(unwrap(await runtime.outboxProcessor.processPending())));
  const deadLetter = runtime.container.resolve(KernelTokens.deadLetter);
  const dead = unwrap(await deadLetter.fetchAll(10));
  console.log("   Dead letter:", dead.map((d) => ({ id: d.id, reason: d.failureReason })));

  paso(6, "Replay del Dead Letter (manejador recuperado)");
  sabotear = false;
  for (const d of dead) {
    console.log(`   Replay ${d.id}:`, JSON.stringify(await runtime.replay.replayDeadLetter(d.id)));
  }
  console.log("   Entregas efectivas:", entregado);
  console.log("   Dead letter restante:", unwrap(await deadLetter.fetchAll(10)).length);

  paso(7, "Telemetría del Kernel");
  console.log("  ", JSON.stringify(runtime.telemetry.snapshot().counters));

  // Limpieza de los eventos sintéticos de la demo
  await pool.query(`DELETE FROM deltaops.kernel_outbox WHERE event_type = 'demo.created'`);
  await pool.query(`DELETE FROM deltaops.kernel_dead_letter WHERE event_type = 'demo.created'`);
  await pool.end();
  console.log("\nDemostración del Kernel completada con ejecución real.");
}

main().catch((err) => {
  console.error("Demo del Kernel falló:", err);
  process.exit(1);
});
