/**
 * DeltaOps Kernel · Kernel Runtime.
 * Punto de composición oficial: ensambla DI, pipelines, eventos, outbox,
 * autorización, configuración y telemetría en un runtime coherente.
 * Los módulos futuros se montan registrando comandos, consultas, manejadores
 * de eventos, permisos, capacidades y políticas — sin tocar el Kernel.
 */
import type { Pool } from "pg";
import {
  AuthorizationRuntime,
  CapabilityResolver,
  PermissionResolver,
  PolicyEngine,
} from "./auth";
import { ConfigurationResolver, EnvConfigSource } from "./config";
import { Container, token } from "./container";
import { EventDispatcher } from "./events/dispatcher";
import { OutboxProcessor, ReplayService } from "./events/outbox";
import {
  InMemoryDeadLetterStore,
  InMemoryOutboxStore,
  InMemoryUnitOfWork,
  SystemClock,
  UuidGenerator,
} from "./adapters/memory";
import { PgDeadLetterStore, PgOutboxStore, PgUnitOfWork } from "./adapters/pg";
import { CommandPipeline, QueryPipeline } from "./pipeline";
import type {
  ClockPort,
  ConfigSourcePort,
  DeadLetterStorePort,
  IdGeneratorPort,
  LoggerPort,
  OutboxStorePort,
  UnitOfWorkPort,
} from "./ports";
import { ConsoleLogger, Telemetry, Tracer } from "./telemetry";

/* --------------------------- Tokens oficiales DI ------------------------- */

export const KernelTokens = {
  clock: token<ClockPort>("kernel.clock"),
  idGenerator: token<IdGeneratorPort>("kernel.idGenerator"),
  logger: token<LoggerPort>("kernel.logger"),
  telemetry: token<Telemetry>("kernel.telemetry"),
  tracer: token<Tracer>("kernel.tracer"),
  config: token<ConfigurationResolver>("kernel.config"),
  permissions: token<PermissionResolver>("kernel.permissions"),
  capabilities: token<CapabilityResolver>("kernel.capabilities"),
  policyEngine: token<PolicyEngine>("kernel.policyEngine"),
  authorization: token<AuthorizationRuntime>("kernel.authorization"),
  unitOfWork: token<UnitOfWorkPort>("kernel.unitOfWork"),
  outbox: token<OutboxStorePort>("kernel.outbox"),
  deadLetter: token<DeadLetterStorePort>("kernel.deadLetter"),
  dispatcher: token<EventDispatcher>("kernel.dispatcher"),
  outboxProcessor: token<OutboxProcessor>("kernel.outboxProcessor"),
  replay: token<ReplayService>("kernel.replay"),
  commandPipeline: token<CommandPipeline>("kernel.commandPipeline"),
  queryPipeline: token<QueryPipeline>("kernel.queryPipeline"),
} as const;

export interface KernelRuntimeOptions {
  /** Pool PostgreSQL. Si se omite, el Kernel corre 100% en memoria (tests). */
  pool?: Pool;
  logger?: LoggerPort;
  configSources?: ConfigSourcePort[];
  rolePermissions?: Record<string, readonly string[]>;
  capabilityMap?: Record<string, readonly string[]>;
  outboxMaxAttempts?: number;
}

export interface KernelRuntime {
  readonly container: Container;
  readonly commands: CommandPipeline;
  readonly queries: QueryPipeline;
  readonly dispatcher: EventDispatcher;
  readonly outboxProcessor: OutboxProcessor;
  readonly replay: ReplayService;
  readonly telemetry: Telemetry;
  readonly tracer: Tracer;
  readonly config: ConfigurationResolver;
  readonly policyEngine: PolicyEngine;
}

/** Construye el Kernel Runtime completo. */
export function createKernelRuntime(
  options: KernelRuntimeOptions = {},
): KernelRuntime {
  const c = new Container();
  const logger = options.logger ?? new ConsoleLogger({ component: "kernel" });

  c.registerValue(KernelTokens.logger, logger);
  c.registerValue(KernelTokens.clock, new SystemClock());
  c.registerValue(KernelTokens.idGenerator, new UuidGenerator());
  c.registerValue(KernelTokens.telemetry, new Telemetry());
  c.register(KernelTokens.tracer, () => new Tracer());
  c.register(
    KernelTokens.config,
    () =>
      new ConfigurationResolver(options.configSources ?? [new EnvConfigSource()]),
  );

  c.register(
    KernelTokens.permissions,
    () => new PermissionResolver(options.rolePermissions ?? {}),
  );
  c.register(
    KernelTokens.capabilities,
    () => new CapabilityResolver(options.capabilityMap ?? {}),
  );
  c.register(KernelTokens.policyEngine, () => new PolicyEngine());
  c.register(
    KernelTokens.authorization,
    (di) =>
      new AuthorizationRuntime(
        di.resolve(KernelTokens.permissions),
        di.resolve(KernelTokens.capabilities),
        di.resolve(KernelTokens.policyEngine),
      ),
  );

  if (options.pool) {
    const pool = options.pool;
    c.register(KernelTokens.outbox, () => new PgOutboxStore(pool));
    c.register(KernelTokens.deadLetter, () => new PgDeadLetterStore(pool));
    c.register(KernelTokens.unitOfWork, () => new PgUnitOfWork(pool));
  } else {
    c.register(KernelTokens.deadLetter, () => new InMemoryDeadLetterStore());
    c.register(
      KernelTokens.outbox,
      (di) => new InMemoryOutboxStore(di.resolve(KernelTokens.deadLetter)),
    );
    c.register(
      KernelTokens.unitOfWork,
      (di) => new InMemoryUnitOfWork(di.resolve(KernelTokens.outbox)),
    );
  }

  c.register(KernelTokens.dispatcher, (di) =>
    new EventDispatcher(di.resolve(KernelTokens.logger)),
  );
  c.register(
    KernelTokens.outboxProcessor,
    (di) =>
      new OutboxProcessor(
        di.resolve(KernelTokens.outbox),
        di.resolve(KernelTokens.deadLetter),
        di.resolve(KernelTokens.dispatcher),
        { maxAttempts: options.outboxMaxAttempts ?? 3 },
        di.resolve(KernelTokens.logger),
      ),
  );
  c.register(
    KernelTokens.replay,
    (di) =>
      new ReplayService(
        di.resolve(KernelTokens.outbox),
        di.resolve(KernelTokens.deadLetter),
        di.resolve(KernelTokens.dispatcher),
        di.resolve(KernelTokens.logger),
      ),
  );

  const pipelineDeps = (di: Container) => ({
    authorization: di.resolve(KernelTokens.authorization),
    logger: di.resolve(KernelTokens.logger),
    telemetry: di.resolve(KernelTokens.telemetry),
    tracer: di.resolve(KernelTokens.tracer),
  });
  c.register(
    KernelTokens.commandPipeline,
    (di) => new CommandPipeline(pipelineDeps(di), di.resolve(KernelTokens.unitOfWork)),
  );
  c.register(
    KernelTokens.queryPipeline,
    (di) => new QueryPipeline(pipelineDeps(di)),
  );

  return {
    container: c,
    commands: c.resolve(KernelTokens.commandPipeline),
    queries: c.resolve(KernelTokens.queryPipeline),
    dispatcher: c.resolve(KernelTokens.dispatcher),
    outboxProcessor: c.resolve(KernelTokens.outboxProcessor),
    replay: c.resolve(KernelTokens.replay),
    telemetry: c.resolve(KernelTokens.telemetry),
    tracer: c.resolve(KernelTokens.tracer),
    config: c.resolve(KernelTokens.config),
    policyEngine: c.resolve(KernelTokens.policyEngine),
  };
}
