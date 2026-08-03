/**
 * DeltaOps Kernel · Base Ports.
 * Contratos que el Kernel expone hacia la infraestructura. Los módulos de
 * dominio dependen SOLO de estos puertos; los adaptadores los implementan.
 */
import type { Result } from "./result";
import type { KernelError } from "./errors";
import type { ExecutionContext } from "./context";
import type { DomainEvent } from "./events/types";

/* ------------------------------- Tiempo/IDs ------------------------------ */

export interface ClockPort {
  now(): Date;
}

export interface IdGeneratorPort {
  next(): string;
}

/* -------------------------------- Logging -------------------------------- */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerPort {
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): LoggerPort;
}

/* ------------------------------ Repositorio ------------------------------ */

export interface RepositoryPort<TEntity, TId = string> {
  findById(ctx: ExecutionContext, id: TId): Promise<Result<TEntity | null>>;
  findAll(ctx: ExecutionContext): Promise<Result<TEntity[]>>;
  save(ctx: ExecutionContext, entity: TEntity): Promise<Result<TEntity>>;
  delete(ctx: ExecutionContext, id: TId): Promise<Result<void>>;
}

/* ------------------------------ Unit of Work ----------------------------- */

export interface UnitOfWork {
  /** Registra un evento de dominio para publicarse al confirmar (vía outbox). */
  registerEvent(event: DomainEvent): void;
  readonly pendingEvents: readonly DomainEvent[];
  /**
   * Sesión transaccional del adaptador (p. ej. PoolClient en PostgreSQL).
   * Los repositorios DEBEN ejecutar sus escrituras a través de esta sesión
   * (vía el helper del adaptador, p. ej. `pgSessionOf(uow)`) para que datos
   * y outbox confirmen o reviertan juntos. `null` en adaptadores sin sesión.
   */
  readonly session: unknown;
}

export interface UnitOfWorkPort {
  /**
   * Ejecuta `work` de forma atómica. Si retorna Result fallido o lanza,
   * se revierte todo, incluidos los eventos registrados.
   */
  execute<T>(
    ctx: ExecutionContext,
    work: (uow: UnitOfWork) => Promise<Result<T, KernelError>>,
  ): Promise<Result<T, KernelError>>;
}

/* ------------------------------ Configuración ---------------------------- */

export interface ConfigSourcePort {
  readonly name: string;
  get(key: string): string | undefined;
}

/* -------------------------------- Outbox --------------------------------- */

export interface OutboxRecord {
  readonly id: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly processedAt: Date | null;
  readonly attempts: number;
}

export interface OutboxStorePort {
  append(uow: UnitOfWork | null, events: readonly DomainEvent[]): Promise<Result<void>>;
  /**
   * Reclama atómicamente hasta `limit` registros pendientes para este
   * procesador (lease). Dos procesadores concurrentes nunca reciben el
   * mismo registro mientras el lease esté vigente.
   */
  claimPending(limit: number): Promise<Result<OutboxRecord[]>>;
  /** Confirma un registro reclamado (condicional: solo si sigue pendiente). */
  markProcessed(id: string): Promise<Result<void>>;
  /** Registra el intento fallido y libera el lease para reintento. */
  releaseForRetry(id: string): Promise<Result<void>>;
  /**
   * Transición atómica a dead letter: entierra el registro Y lo confirma en
   * el outbox en una sola transacción (sin ventana de re-entrega).
   */
  markDead(record: OutboxRecord, reason: string): Promise<Result<void>>;
  fetchProcessed(limit: number): Promise<Result<OutboxRecord[]>>;
}

/* ------------------------------ Dead Letter ------------------------------ */

export interface DeadLetterRecord {
  readonly id: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string;
  readonly failureReason: string;
  readonly attempts: number;
  readonly deadAt: Date;
}

export interface DeadLetterStorePort {
  bury(record: OutboxRecord, reason: string): Promise<Result<void>>;
  fetchAll(limit: number): Promise<Result<DeadLetterRecord[]>>;
  remove(id: string): Promise<Result<void>>;
}
