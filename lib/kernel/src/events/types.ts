/**
 * DeltaOps Kernel · Eventos de dominio (contrato).
 * El Kernel no conoce eventos concretos: solo su forma serializable.
 */
export interface DomainEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export interface CreateEventOptions {
  idGenerator?: () => string;
  now?: Date;
}

export function createDomainEvent<
  TPayload extends Record<string, unknown>,
>(
  type: string,
  payload: TPayload,
  correlationId: string,
  options: CreateEventOptions = {},
): DomainEvent<TPayload> {
  return {
    id: options.idGenerator?.() ?? crypto.randomUUID(),
    type,
    payload,
    correlationId,
    occurredAt: options.now ?? new Date(),
  };
}
