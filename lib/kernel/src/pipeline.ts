/**
 * DeltaOps Kernel · Command Pipeline y Query Pipeline.
 * Buses tipados con cadena de comportamiento fija y explícita:
 *   tracing → logging → autorización → validación → [transacción] → handler
 * Los comandos mutan estado dentro de Unit of Work (eventos vía outbox);
 * las consultas son de solo lectura y nunca abren transacción.
 */
import { z } from "zod";
import type { AuthorizationRequirements, AuthorizationRuntime } from "./auth";
import type { ExecutionContext } from "./context";
import { KernelErrors, toKernelError, type KernelError } from "./errors";
import type { LoggerPort, UnitOfWork, UnitOfWorkPort } from "./ports";
import { fail, ok, type Result } from "./result";
import { Telemetry, Tracer } from "./telemetry";

/* ------------------------------- Contratos ------------------------------- */

export interface CommandDefinition<TInput, TOutput> {
  readonly name: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly authorization?: AuthorizationRequirements;
  handle(
    ctx: ExecutionContext,
    input: TInput,
    uow: UnitOfWork,
  ): Promise<Result<TOutput, KernelError>>;
}

export interface QueryDefinition<TInput, TOutput> {
  readonly name: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly authorization?: AuthorizationRequirements;
  handle(
    ctx: ExecutionContext,
    input: TInput,
  ): Promise<Result<TOutput, KernelError>>;
}

interface PipelineDeps {
  authorization: AuthorizationRuntime;
  logger: LoggerPort;
  telemetry: Telemetry;
  tracer: Tracer;
}

/* ----------------------------- Command Pipeline -------------------------- */

export class CommandPipeline {
  private readonly commands = new Map<string, CommandDefinition<unknown, unknown>>();

  constructor(
    private readonly deps: PipelineDeps,
    private readonly uowPort: UnitOfWorkPort,
  ) {}

  register<TInput, TOutput>(command: CommandDefinition<TInput, TOutput>): this {
    if (this.commands.has(command.name)) {
      throw new Error(`CommandPipeline: comando duplicado: ${command.name}`);
    }
    this.commands.set(command.name, command as CommandDefinition<unknown, unknown>);
    return this;
  }

  async execute<TOutput = unknown>(
    ctx: ExecutionContext,
    name: string,
    input: unknown,
  ): Promise<Result<TOutput, KernelError>> {
    const command = this.commands.get(name);
    if (!command) {
      return fail(KernelErrors.notFound("command", name));
    }

    const span = this.deps.tracer.startSpan(ctx, `command:${name}`);
    const log = this.deps.logger.child({
      correlationId: ctx.correlationId,
      command: name,
    });
    this.deps.telemetry.increment(`command.${name}.executed`);

    // Autorización
    const authz = this.deps.authorization.authorize(ctx, command.authorization ?? {});
    if (!authz.ok) {
      this.deps.telemetry.increment(`command.${name}.denied`);
      log.log("warn", "Comando denegado", { error: authz.error.code });
      span.end("error", { reason: "authorization" });
      return authz;
    }

    // Validación
    const parsed = command.inputSchema.safeParse(input);
    if (!parsed.success) {
      this.deps.telemetry.increment(`command.${name}.invalid`);
      span.end("error", { reason: "validation" });
      return fail(
        KernelErrors.validation(`Entrada inválida para ${name}`, {
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        }),
      );
    }

    // Transacción (Unit of Work) + handler
    try {
      const result = await this.uowPort.execute(ctx, (uow) =>
        command.handle(ctx, parsed.data, uow),
      );
      if (result.ok) {
        this.deps.telemetry.increment(`command.${name}.succeeded`);
        log.log("info", "Comando ejecutado");
        const finished = span.end("ok");
        this.deps.telemetry.recordDuration(`command.${name}`, finished.durationMs);
      } else {
        this.deps.telemetry.increment(`command.${name}.failed`);
        log.log("warn", "Comando falló", { error: result.error.code });
        span.end("error", { code: result.error.code });
      }
      return result as Result<TOutput, KernelError>;
    } catch (err) {
      this.deps.telemetry.increment(`command.${name}.failed`);
      span.end("error", { reason: "exception" });
      log.log("error", "Comando lanzó excepción", {});
      return fail(toKernelError(err));
    }
  }
}

/* ------------------------------ Query Pipeline --------------------------- */

export class QueryPipeline {
  private readonly queries = new Map<string, QueryDefinition<unknown, unknown>>();

  constructor(private readonly deps: PipelineDeps) {}

  register<TInput, TOutput>(query: QueryDefinition<TInput, TOutput>): this {
    if (this.queries.has(query.name)) {
      throw new Error(`QueryPipeline: consulta duplicada: ${query.name}`);
    }
    this.queries.set(query.name, query as QueryDefinition<unknown, unknown>);
    return this;
  }

  async execute<TOutput = unknown>(
    ctx: ExecutionContext,
    name: string,
    input: unknown,
  ): Promise<Result<TOutput, KernelError>> {
    const query = this.queries.get(name);
    if (!query) {
      return fail(KernelErrors.notFound("query", name));
    }

    const span = this.deps.tracer.startSpan(ctx, `query:${name}`);
    this.deps.telemetry.increment(`query.${name}.executed`);

    const authz = this.deps.authorization.authorize(ctx, query.authorization ?? {});
    if (!authz.ok) {
      this.deps.telemetry.increment(`query.${name}.denied`);
      span.end("error", { reason: "authorization" });
      return authz;
    }

    const parsed = query.inputSchema.safeParse(input);
    if (!parsed.success) {
      span.end("error", { reason: "validation" });
      return fail(
        KernelErrors.validation(`Entrada inválida para ${name}`, {
          issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        }),
      );
    }

    try {
      const result = await query.handle(ctx, parsed.data);
      const finished = span.end(result.ok ? "ok" : "error");
      this.deps.telemetry.recordDuration(`query.${name}`, finished.durationMs);
      return result as Result<TOutput, KernelError>;
    } catch (err) {
      span.end("error", { reason: "exception" });
      return fail(toKernelError(err));
    }
  }
}
