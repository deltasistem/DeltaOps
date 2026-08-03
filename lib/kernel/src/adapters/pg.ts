/**
 * DeltaOps Kernel · Base Adapters (PostgreSQL).
 * Transaction Runtime real: Unit of Work sobre BEGIN/COMMIT/ROLLBACK con
 * outbox transaccional (los eventos se insertan en la MISMA transacción que
 * los datos). Tablas: deltaops.kernel_outbox y deltaops.kernel_dead_letter.
 * El Kernel recibe el Pool por inyección — no conoce credenciales ni dominio.
 */
import type { Pool, PoolClient } from "pg";
import type { ExecutionContext } from "../context";
import { KernelErrors, toKernelError, type KernelError } from "../errors";
import type { DomainEvent } from "../events/types";
import type {
  DeadLetterRecord,
  DeadLetterStorePort,
  OutboxRecord,
  OutboxStorePort,
  UnitOfWork,
  UnitOfWorkPort,
} from "../ports";
import { fail, ok, type Result } from "../result";

class PgUow implements UnitOfWork {
  private readonly events: DomainEvent[] = [];
  constructor(public readonly client: PoolClient) {}
  get session(): unknown {
    return this.client;
  }
  registerEvent(event: DomainEvent): void {
    this.events.push(event);
  }
  get pendingEvents(): readonly DomainEvent[] {
    return this.events;
  }
}

/**
 * Devuelve la sesión transaccional PostgreSQL del Unit of Work.
 * TODO repositorio de módulo DEBE ejecutar sus escrituras con este cliente
 * para que datos y outbox confirmen/reviertan en la MISMA transacción.
 */
export function pgSessionOf(uow: UnitOfWork): PoolClient {
  if (uow instanceof PgUow) return uow.client;
  throw new Error(
    "pgSessionOf: el Unit of Work activo no es PostgreSQL (¿runtime en memoria?)",
  );
}

async function insertOutbox(
  client: PoolClient,
  events: readonly DomainEvent[],
): Promise<void> {
  for (const e of events) {
    await client.query(
      `INSERT INTO deltaops.kernel_outbox
         (id, event_type, payload, correlation_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [e.id, e.type, JSON.stringify(e.payload), e.correlationId, e.occurredAt],
    );
  }
}

/** Transaction Runtime: Unit of Work PostgreSQL con outbox atómico. */
export class PgUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly pool: Pool) {}

  async execute<T>(
    _ctx: ExecutionContext,
    work: (uow: UnitOfWork) => Promise<Result<T, KernelError>>,
  ): Promise<Result<T, KernelError>> {
    const client = await this.pool.connect();
    const uow = new PgUow(client);
    try {
      await client.query("BEGIN");
      const result = await work(uow);
      if (!result.ok) {
        await client.query("ROLLBACK");
        return result;
      }
      if (uow.pendingEvents.length > 0) {
        await insertOutbox(client, uow.pendingEvents);
      }
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      return fail(toKernelError(err));
    } finally {
      client.release();
    }
  }
}

/* --------------------------------- Outbox -------------------------------- */

interface OutboxRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  occurred_at: Date;
  processed_at: Date | null;
  attempts: number;
}

function toRecord(row: OutboxRow): OutboxRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    payload: row.payload,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at,
    processedAt: row.processed_at,
    attempts: row.attempts,
  };
}

export class PgOutboxStore implements OutboxStorePort {
  constructor(private readonly pool: Pool) {}

  async append(
    uow: UnitOfWork | null,
    events: readonly DomainEvent[],
  ): Promise<Result<void>> {
    try {
      if (uow instanceof PgUow) {
        await insertOutbox(uow.client, events);
      } else {
        const client = await this.pool.connect();
        try {
          await insertOutbox(client, events);
        } finally {
          client.release();
        }
      }
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Outbox append falló", err));
    }
  }

  /**
   * Lease atómico: FOR UPDATE SKIP LOCKED + claimed_until en un solo UPDATE.
   * Dos procesadores concurrentes nunca reclaman el mismo registro mientras
   * el lease (60 s) esté vigente; un procesador caído libera por expiración.
   */
  async claimPending(limit: number): Promise<Result<OutboxRecord[]>> {
    try {
      const res = await this.pool.query<OutboxRow>(
        `UPDATE deltaops.kernel_outbox o
         SET claimed_until = now() + interval '60 seconds'
         WHERE o.id IN (
           SELECT id FROM deltaops.kernel_outbox
           WHERE processed_at IS NULL
             AND (claimed_until IS NULL OR claimed_until < now())
           ORDER BY occurred_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING o.*`,
        [limit],
      );
      return ok(res.rows.map(toRecord));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Outbox claimPending falló", err));
    }
  }

  async markProcessed(id: string): Promise<Result<void>> {
    try {
      await this.pool.query(
        `UPDATE deltaops.kernel_outbox
         SET processed_at = now(), claimed_until = NULL
         WHERE id = $1 AND processed_at IS NULL`,
        [id],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Outbox markProcessed falló", err));
    }
  }

  async releaseForRetry(id: string): Promise<Result<void>> {
    try {
      await this.pool.query(
        `UPDATE deltaops.kernel_outbox
         SET attempts = attempts + 1, claimed_until = NULL
         WHERE id = $1 AND processed_at IS NULL`,
        [id],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Outbox releaseForRetry falló", err));
    }
  }

  /** Dead letter + confirmación del outbox en UNA transacción (sin ventana). */
  async markDead(record: OutboxRecord, reason: string): Promise<Result<void>> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO deltaops.kernel_dead_letter
           (id, event_type, payload, correlation_id, failure_reason, attempts)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.eventType,
          JSON.stringify(record.payload),
          record.correlationId,
          reason,
          record.attempts,
        ],
      );
      await client.query(
        `UPDATE deltaops.kernel_outbox
         SET processed_at = now(), claimed_until = NULL
         WHERE id = $1 AND processed_at IS NULL`,
        [record.id],
      );
      await client.query("COMMIT");
      return ok(undefined);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      return fail(KernelErrors.infrastructure("Outbox markDead falló", err));
    } finally {
      client.release();
    }
  }

  async fetchProcessed(limit: number): Promise<Result<OutboxRecord[]>> {
    try {
      const res = await this.pool.query<OutboxRow>(
        `SELECT * FROM deltaops.kernel_outbox
         WHERE processed_at IS NOT NULL
         ORDER BY occurred_at ASC
         LIMIT $1`,
        [limit],
      );
      return ok(res.rows.map(toRecord));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Outbox fetchProcessed falló", err));
    }
  }
}

/* ------------------------------ Dead Letter ------------------------------ */

interface DeadLetterRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  failure_reason: string;
  attempts: number;
  dead_at: Date;
}

export class PgDeadLetterStore implements DeadLetterStorePort {
  constructor(private readonly pool: Pool) {}

  async bury(record: OutboxRecord, reason: string): Promise<Result<void>> {
    try {
      await this.pool.query(
        `INSERT INTO deltaops.kernel_dead_letter
           (id, event_type, payload, correlation_id, failure_reason, attempts)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.eventType,
          JSON.stringify(record.payload),
          record.correlationId,
          reason,
          record.attempts,
        ],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("DeadLetter bury falló", err));
    }
  }

  async fetchAll(limit: number): Promise<Result<DeadLetterRecord[]>> {
    try {
      const res = await this.pool.query<DeadLetterRow>(
        `SELECT * FROM deltaops.kernel_dead_letter ORDER BY dead_at ASC LIMIT $1`,
        [limit],
      );
      return ok(
        res.rows.map((row) => ({
          id: row.id,
          eventType: row.event_type,
          payload: row.payload,
          correlationId: row.correlation_id,
          failureReason: row.failure_reason,
          attempts: row.attempts,
          deadAt: row.dead_at,
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("DeadLetter fetchAll falló", err));
    }
  }

  async remove(id: string): Promise<Result<void>> {
    try {
      await this.pool.query(`DELETE FROM deltaops.kernel_dead_letter WHERE id = $1`, [id]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("DeadLetter remove falló", err));
    }
  }
}
