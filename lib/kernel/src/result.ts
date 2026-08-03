/**
 * DeltaOps Kernel · Result Pattern.
 * Todo caso de uso del Kernel retorna Result<T, E>: éxito o falla explícita,
 * sin excepciones para flujo de control ni fallbacks silenciosos.
 */
import type { KernelError } from "./errors";

export type Result<T, E = KernelError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(
  r: Result<T, E>,
): r is { readonly ok: true; readonly value: T } {
  return r.ok;
}

export function isFail<T, E>(
  r: Result<T, E>,
): r is { readonly ok: false; readonly error: E } {
  return !r.ok;
}

export function map<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  return r.ok ? ok(fn(r.value)) : r;
}

export function flatMap<T, U, E>(
  r: Result<T, E>,
  fn: (v: T) => Result<U, E>,
): Result<U, E> {
  return r.ok ? fn(r.value) : r;
}

export function mapError<T, E, F>(
  r: Result<T, E>,
  fn: (e: E) => F,
): Result<T, F> {
  return r.ok ? r : fail(fn(r.error));
}

/** Extrae el valor o lanza — SOLO para tests y bordes de proceso. */
export function unwrap<T, E>(r: Result<T, E>): T {
  if (!r.ok) {
    throw new Error(`unwrap() sobre un Result fallido: ${JSON.stringify(r.error)}`);
  }
  return r.value;
}

/** Combina una lista de Results; falla con el primer error encontrado. */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const r of results) {
    if (!r.ok) return r;
    values.push(r.value);
  }
  return ok(values);
}
