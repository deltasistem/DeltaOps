/**
 * DeltaOps Kernel · Telemetry, Logging y Tracing.
 * Observabilidad mínima y desacoplada: contadores, histogramas simples y
 * spans jerárquicos ligados al ExecutionContext. Sin dependencia de vendor.
 */
import type { ExecutionContext } from "./context";
import type { LoggerPort, LogLevel } from "./ports";

/* -------------------------------- Logging -------------------------------- */

export interface LogEntry {
  level: LogLevel;
  message: string;
  fields: Record<string, unknown>;
}

/** Logger de consola estructurado (JSON por línea). Adaptador base. */
export class ConsoleLogger implements LoggerPort {
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
    const line = JSON.stringify({
      level,
      msg: message,
      ...this.bindings,
      ...fields,
      time: new Date().toISOString(),
    });
    if (level === "error") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
  }

  child(bindings: Record<string, unknown>): LoggerPort {
    return new ConsoleLogger({ ...this.bindings, ...bindings });
  }
}

/** Logger en memoria para tests. */
export class MemoryLogger implements LoggerPort {
  readonly entries: LogEntry[] = [];
  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
    this.entries.push({ level, message, fields: { ...this.bindings, ...fields } });
  }

  child(bindings: Record<string, unknown>): LoggerPort {
    const child = new MemoryLogger({ ...this.bindings, ...bindings });
    // Comparte el buffer para poder asertar desde la raíz.
    (child as { entries: LogEntry[] }).entries = this.entries;
    return child;
  }
}

/* -------------------------------- Tracing -------------------------------- */

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly startedAt: number;
  end(status?: "ok" | "error", attributes?: Record<string, unknown>): FinishedSpan;
}

export interface FinishedSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId: string | null;
  readonly name: string;
  readonly durationMs: number;
  readonly status: "ok" | "error";
  readonly attributes: Record<string, unknown>;
}

export class Tracer {
  readonly finished: FinishedSpan[] = [];

  constructor(private readonly idGenerator: () => string = () => crypto.randomUUID()) {}

  startSpan(ctx: ExecutionContext, name: string, parent?: Span): Span {
    const traceId = ctx.traceId;
    const spanId = this.idGenerator();
    const parentSpanId = parent?.spanId ?? ctx.spanId ?? null;
    const startedAt = performance.now();
    const finishedList = this.finished;
    return {
      traceId,
      spanId,
      parentSpanId,
      name,
      startedAt,
      end(status: "ok" | "error" = "ok", attributes: Record<string, unknown> = {}) {
        const span: FinishedSpan = {
          traceId,
          spanId,
          parentSpanId,
          name,
          durationMs: performance.now() - startedAt,
          status,
          attributes,
        };
        finishedList.push(span);
        return span;
      },
    };
  }
}

/* ------------------------------- Telemetría ------------------------------ */

export class Telemetry {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, number[]>();

  increment(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  recordDuration(name: string, ms: number): void {
    const list = this.durations.get(name) ?? [];
    list.push(ms);
    this.durations.set(name, list);
  }

  counter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  snapshot(): {
    counters: Record<string, number>;
    durations: Record<string, { count: number; avgMs: number }>;
  } {
    const counters = Object.fromEntries(this.counters);
    const durations: Record<string, { count: number; avgMs: number }> = {};
    for (const [name, list] of this.durations) {
      durations[name] = {
        count: list.length,
        avgMs: list.reduce((a, b) => a + b, 0) / list.length,
      };
    }
    return { counters, durations };
  }
}
