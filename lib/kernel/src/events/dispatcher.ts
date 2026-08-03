/**
 * DeltaOps Kernel · Event Dispatcher.
 * Registro de manejadores por tipo de evento y despacho explícito.
 * Un fallo en un manejador NO detiene a los demás: cada resultado se
 * reporta individualmente (los fallos alimentan reintentos/dead letter).
 */
import type { DomainEvent } from "./types";
import { toKernelError, type KernelError } from "../errors";
import { fail, ok, type Result } from "../result";
import type { LoggerPort } from "../ports";

export type EventHandler = (event: DomainEvent) => Promise<Result<void, KernelError>>;

export interface DispatchOutcome {
  readonly handlerName: string;
  readonly result: Result<void, KernelError>;
}

export class EventDispatcher {
  private readonly handlers = new Map<string, Map<string, EventHandler>>();

  constructor(private readonly logger?: LoggerPort) {}

  subscribe(eventType: string, handlerName: string, handler: EventHandler): this {
    const forType = this.handlers.get(eventType) ?? new Map<string, EventHandler>();
    if (forType.has(handlerName)) {
      throw new Error(
        `EventDispatcher: manejador duplicado "${handlerName}" para ${eventType}`,
      );
    }
    forType.set(handlerName, handler);
    this.handlers.set(eventType, forType);
    return this;
  }

  handlersFor(eventType: string): readonly string[] {
    return [...(this.handlers.get(eventType)?.keys() ?? [])];
  }

  async dispatch(event: DomainEvent): Promise<DispatchOutcome[]> {
    const forType = this.handlers.get(event.type);
    if (!forType || forType.size === 0) {
      this.logger?.log("warn", "Evento sin manejadores", { eventType: event.type });
      return [];
    }
    const outcomes: DispatchOutcome[] = [];
    for (const [handlerName, handler] of forType) {
      try {
        const result = await handler(event);
        outcomes.push({ handlerName, result });
        if (!result.ok) {
          this.logger?.log("warn", "Manejador de evento falló", {
            eventType: event.type,
            handlerName,
            error: result.error.code,
          });
        }
      } catch (err) {
        outcomes.push({ handlerName, result: fail(toKernelError(err)) });
        this.logger?.log("error", "Manejador de evento lanzó excepción", {
          eventType: event.type,
          handlerName,
        });
      }
    }
    return outcomes;
  }
}

export function allSucceeded(outcomes: DispatchOutcome[]): Result<void, KernelError> {
  const firstFailure = outcomes.find((o) => !o.result.ok);
  if (firstFailure && !firstFailure.result.ok) return firstFailure.result;
  return ok(undefined);
}
