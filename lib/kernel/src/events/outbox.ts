/**
 * DeltaOps Kernel · Outbox Processor, Replay y Dead Letter.
 * Los eventos se persisten transaccionalmente (outbox) y se despachan fuera
 * de la transacción. Fallos repetidos (>= maxAttempts) van a dead letter.
 * Replay permite re-despachar eventos ya procesados o enterrados.
 */
import type {
  DeadLetterStorePort,
  LoggerPort,
  OutboxRecord,
  OutboxStorePort,
} from "../ports";
import { allSucceeded, type EventDispatcher } from "./dispatcher";
import type { DomainEvent } from "./types";
import { KernelErrors, type KernelError } from "../errors";
import { fail, ok, type Result } from "../result";

export interface OutboxProcessorOptions {
  readonly batchSize?: number;
  readonly maxAttempts?: number;
}

export interface ProcessSummary {
  processed: number;
  failed: number;
  buried: number;
}

function toDomainEvent(record: OutboxRecord): DomainEvent {
  return {
    id: record.id,
    type: record.eventType,
    payload: record.payload,
    correlationId: record.correlationId,
    occurredAt: record.occurredAt,
  };
}

export class OutboxProcessor {
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly outbox: OutboxStorePort,
    private readonly deadLetter: DeadLetterStorePort,
    private readonly dispatcher: EventDispatcher,
    options: OutboxProcessorOptions = {},
    private readonly logger?: LoggerPort,
  ) {
    this.batchSize = options.batchSize ?? 50;
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  /**
   * Drena el outbox: reclama pendientes (lease atómico — seguro con varios
   * procesadores), despacha, reintenta y entierra agotados. Entrega
   * al-menos-una-vez: los manejadores DEBEN ser idempotentes.
   */
  async processPending(): Promise<Result<ProcessSummary, KernelError>> {
    const claimed = await this.outbox.claimPending(this.batchSize);
    if (!claimed.ok) return claimed;

    const summary: ProcessSummary = { processed: 0, failed: 0, buried: 0 };
    for (const record of claimed.value) {
      const outcomes = await this.dispatcher.dispatch(toDomainEvent(record));
      const overall = allSucceeded(outcomes);
      if (overall.ok) {
        const marked = await this.outbox.markProcessed(record.id);
        if (!marked.ok) return marked;
        summary.processed += 1;
        continue;
      }

      const attempts = record.attempts + 1;
      if (attempts >= this.maxAttempts) {
        // Transición atómica: dead letter + confirmación en una sola tx.
        const buried = await this.outbox.markDead(
          { ...record, attempts },
          overall.error.message,
        );
        if (!buried.ok) return buried;
        summary.buried += 1;
        this.logger?.log("error", "Evento enterrado en dead letter", {
          eventId: record.id,
          eventType: record.eventType,
          attempts,
        });
      } else {
        const released = await this.outbox.releaseForRetry(record.id);
        if (!released.ok) return released;
        summary.failed += 1;
      }
    }
    return ok(summary);
  }
}

/* --------------------------------- Replay -------------------------------- */

export class ReplayService {
  constructor(
    private readonly outbox: OutboxStorePort,
    private readonly deadLetter: DeadLetterStorePort,
    private readonly dispatcher: EventDispatcher,
    private readonly logger?: LoggerPort,
  ) {}

  /** Re-despacha eventos ya procesados (reconstrucción de proyecciones). */
  async replayProcessed(limit = 100): Promise<Result<number, KernelError>> {
    const processed = await this.outbox.fetchProcessed(limit);
    if (!processed.ok) return processed;
    let replayed = 0;
    for (const record of processed.value) {
      const outcomes = await this.dispatcher.dispatch(toDomainEvent(record));
      const overall = allSucceeded(outcomes);
      if (!overall.ok) {
        return fail(
          KernelErrors.infrastructure(
            `Replay falló en evento ${record.id}: ${overall.error.message}`,
          ),
        );
      }
      replayed += 1;
    }
    this.logger?.log("info", "Replay completado", { replayed });
    return ok(replayed);
  }

  /** Reintenta un evento de dead letter; si tiene éxito, lo remueve. */
  async replayDeadLetter(id: string): Promise<Result<void, KernelError>> {
    const all = await this.deadLetter.fetchAll(1000);
    if (!all.ok) return all;
    const record = all.value.find((r) => r.id === id);
    if (!record) return fail(KernelErrors.notFound("dead_letter", id));

    const outcomes = await this.dispatcher.dispatch({
      id: record.id,
      type: record.eventType,
      payload: record.payload,
      correlationId: record.correlationId,
      occurredAt: record.deadAt,
    });
    const overall = allSucceeded(outcomes);
    if (!overall.ok) return overall;
    return this.deadLetter.remove(id);
  }
}
