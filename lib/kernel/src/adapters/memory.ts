/**
 * DeltaOps Kernel · Base Adapters (memoria).
 * Implementaciones en memoria de los puertos base: deterministas, sin E/S.
 * Uso: pruebas del Kernel y de módulos, prototipos y ejecución local ligera.
 */
import type { ExecutionContext } from "../context";
import { KernelErrors, type KernelError } from "../errors";
import type { DomainEvent } from "../events/types";
import type {
  ClockPort,
  DeadLetterRecord,
  DeadLetterStorePort,
  IdGeneratorPort,
  OutboxRecord,
  OutboxStorePort,
  RepositoryPort,
  UnitOfWork,
  UnitOfWorkPort,
} from "../ports";
import { fail, ok, type Result } from "../result";

/* ------------------------------- Tiempo/IDs ------------------------------ */

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements ClockPort {
  constructor(private readonly fixed: Date) {}
  now(): Date {
    return this.fixed;
  }
}

export class UuidGenerator implements IdGeneratorPort {
  next(): string {
    return crypto.randomUUID();
  }
}

export class SequentialIdGenerator implements IdGeneratorPort {
  private counter = 0;
  constructor(private readonly prefix = "id") {}
  next(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}

/* ----------------------------- Repository Base --------------------------- */

export interface Identifiable {
  readonly id: string;
}

/**
 * Repositorio base en memoria. Los módulos de dominio pueden extenderlo
 * para pruebas o usarlo como referencia de contrato para adaptadores reales.
 */
export class InMemoryRepository<TEntity extends Identifiable>
  implements RepositoryPort<TEntity>
{
  protected readonly rows = new Map<string, TEntity>();

  async findById(
    _ctx: ExecutionContext,
    id: string,
  ): Promise<Result<TEntity | null>> {
    return ok(this.rows.get(id) ?? null);
  }

  async findAll(_ctx: ExecutionContext): Promise<Result<TEntity[]>> {
    return ok([...this.rows.values()]);
  }

  async save(_ctx: ExecutionContext, entity: TEntity): Promise<Result<TEntity>> {
    this.rows.set(entity.id, entity);
    return ok(entity);
  }

  async delete(_ctx: ExecutionContext, id: string): Promise<Result<void>> {
    if (!this.rows.has(id)) {
      return fail(KernelErrors.notFound("entity", id));
    }
    this.rows.delete(id);
    return ok(undefined);
  }

  get size(): number {
    return this.rows.size;
  }
}

/* ------------------------------ Unit of Work ----------------------------- */

class MemoryUow implements UnitOfWork {
  private readonly events: DomainEvent[] = [];
  readonly session: unknown = null;
  registerEvent(event: DomainEvent): void {
    this.events.push(event);
  }
  get pendingEvents(): readonly DomainEvent[] {
    return this.events;
  }
}

/**
 * Unit of Work en memoria: atómico respecto a eventos (solo se entregan al
 * outbox si el trabajo tuvo éxito). La atomicidad de datos la garantiza el
 * adaptador PostgreSQL; este adaptador es para pruebas del Kernel.
 */
export class InMemoryUnitOfWork implements UnitOfWorkPort {
  constructor(private readonly outbox: OutboxStorePort) {}

  async execute<T>(
    _ctx: ExecutionContext,
    work: (uow: UnitOfWork) => Promise<Result<T, KernelError>>,
  ): Promise<Result<T, KernelError>> {
    const uow = new MemoryUow();
    const result = await work(uow);
    if (!result.ok) return result; // rollback: los eventos se descartan
    if (uow.pendingEvents.length > 0) {
      const appended = await this.outbox.append(uow, uow.pendingEvents);
      if (!appended.ok) return appended;
    }
    return result;
  }
}

/* --------------------------------- Outbox -------------------------------- */

type MemoryOutboxRow = OutboxRecord & {
  processedAt: Date | null;
  attempts: number;
  claimed: boolean;
};

export class InMemoryOutboxStore implements OutboxStorePort {
  readonly records: MemoryOutboxRow[] = [];

  constructor(private readonly deadLetter: DeadLetterStorePort) {}

  async append(
    _uow: UnitOfWork | null,
    events: readonly DomainEvent[],
  ): Promise<Result<void>> {
    for (const e of events) {
      this.records.push({
        id: e.id,
        eventType: e.type,
        payload: e.payload,
        correlationId: e.correlationId,
        occurredAt: e.occurredAt,
        processedAt: null,
        attempts: 0,
        claimed: false,
      });
    }
    return ok(undefined);
  }

  async claimPending(limit: number): Promise<Result<OutboxRecord[]>> {
    const claimable = this.records
      .filter((r) => r.processedAt === null && !r.claimed)
      .slice(0, limit);
    for (const r of claimable) r.claimed = true;
    return ok(claimable);
  }

  async markProcessed(id: string): Promise<Result<void>> {
    const record = this.records.find((r) => r.id === id);
    if (!record) return fail(KernelErrors.notFound("outbox", id));
    if (record.processedAt === null) {
      record.processedAt = new Date();
      record.claimed = false;
    }
    return ok(undefined);
  }

  async releaseForRetry(id: string): Promise<Result<void>> {
    const record = this.records.find((r) => r.id === id);
    if (!record) return fail(KernelErrors.notFound("outbox", id));
    record.attempts += 1;
    record.claimed = false;
    return ok(undefined);
  }

  async markDead(record: OutboxRecord, reason: string): Promise<Result<void>> {
    const buried = await this.deadLetter.bury(record, reason);
    if (!buried.ok) return buried;
    return this.markProcessed(record.id);
  }

  async fetchProcessed(limit: number): Promise<Result<OutboxRecord[]>> {
    return ok(this.records.filter((r) => r.processedAt !== null).slice(0, limit));
  }
}

/* ------------------------------ Dead Letter ------------------------------ */

export class InMemoryDeadLetterStore implements DeadLetterStorePort {
  readonly records: DeadLetterRecord[] = [];

  async bury(record: OutboxRecord, reason: string): Promise<Result<void>> {
    this.records.push({
      id: record.id,
      eventType: record.eventType,
      payload: record.payload,
      correlationId: record.correlationId,
      failureReason: reason,
      attempts: record.attempts,
      deadAt: new Date(),
    });
    return ok(undefined);
  }

  async fetchAll(limit: number): Promise<Result<DeadLetterRecord[]>> {
    return ok(this.records.slice(0, limit));
  }

  async remove(id: string): Promise<Result<void>> {
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx === -1) return fail(KernelErrors.notFound("dead_letter", id));
    this.records.splice(idx, 1);
    return ok(undefined);
  }
}
