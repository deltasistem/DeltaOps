/**
 * DeltaOps Kernel · Error Pattern.
 * Taxonomía cerrada de errores del Kernel. Cada error porta código estable,
 * categoría y metadatos serializables — apto para logs, API y dead letter.
 */
export type KernelErrorKind =
  | "validation"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "infrastructure"
  | "timeout"
  | "internal";

export interface KernelError {
  readonly kind: KernelErrorKind;
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly cause?: unknown;
}

function make(
  kind: KernelErrorKind,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): KernelError {
  return { kind, code, message, details, cause };
}

export const KernelErrors = {
  validation: (message: string, details?: Record<string, unknown>) =>
    make("validation", "KRN-VAL-001", message, details),
  notFound: (resource: string, id?: string | number) =>
    make("not_found", "KRN-NF-001", `No encontrado: ${resource}`, { resource, id }),
  conflict: (message: string, details?: Record<string, unknown>) =>
    make("conflict", "KRN-CFL-001", message, details),
  unauthorized: (message = "No autenticado") =>
    make("unauthorized", "KRN-AUTH-001", message),
  forbidden: (permission: string) =>
    make("forbidden", "KRN-AUTH-002", `Permiso denegado: ${permission}`, {
      permission,
    }),
  infrastructure: (message: string, cause?: unknown) =>
    make("infrastructure", "KRN-INF-001", message, undefined, cause),
  timeout: (operation: string, ms: number) =>
    make("timeout", "KRN-TMO-001", `Tiempo agotado: ${operation} (${ms}ms)`, {
      operation,
      ms,
    }),
  internal: (message: string, cause?: unknown) =>
    make("internal", "KRN-INT-001", message, undefined, cause),
} as const;

/** Convierte una excepción arbitraria en KernelError (borde del Kernel). */
export function toKernelError(err: unknown): KernelError {
  if (isKernelError(err)) return err;
  const message = err instanceof Error ? err.message : String(err);
  return KernelErrors.internal(message, err);
}

export function isKernelError(value: unknown): value is KernelError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "code" in value &&
    "message" in value
  );
}
