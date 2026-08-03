/**
 * DeltaOps Kernel · Execution Context.
 * Contexto inmutable que viaja por los pipelines: identidad del actor,
 * correlación, trazado y momento de ejecución. El Kernel no conoce usuarios
 * de dominio — solo un principal abstracto con permisos y capacidades.
 */
export interface Principal {
  readonly id: string;
  readonly rol: string;
  readonly permisos: readonly string[];
  readonly capacidades: readonly string[];
}

export const SYSTEM_PRINCIPAL: Principal = {
  id: "system",
  rol: "system",
  permisos: ["*"],
  capacidades: ["*"],
};

export const ANONYMOUS_PRINCIPAL: Principal = {
  id: "anonymous",
  rol: "anonymous",
  permisos: [],
  capacidades: [],
};

export interface ExecutionContext {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly principal: Principal;
  readonly startedAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CreateContextOptions {
  correlationId?: string;
  traceId?: string;
  principal?: Principal;
  metadata?: Record<string, unknown>;
  now?: Date;
  idGenerator?: () => string;
}

function defaultId(): string {
  return crypto.randomUUID();
}

export function createExecutionContext(
  options: CreateContextOptions = {},
): ExecutionContext {
  const gen = options.idGenerator ?? defaultId;
  return {
    correlationId: options.correlationId ?? gen(),
    traceId: options.traceId ?? gen(),
    spanId: gen(),
    principal: options.principal ?? ANONYMOUS_PRINCIPAL,
    startedAt: options.now ?? new Date(),
    metadata: Object.freeze({ ...(options.metadata ?? {}) }),
  };
}

/** Deriva un contexto hijo (nuevo span, misma correlación/traza). */
export function childContext(
  parent: ExecutionContext,
  idGenerator: () => string = defaultId,
): ExecutionContext {
  return { ...parent, spanId: idGenerator() };
}
