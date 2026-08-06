/**
 * DGP-013 · Cliente HTTP del módulo Enterprise Procurement & Supply Chain.
 *
 * Envoltura fina sobre `fetch` con sesión por cookie; centraliza el mapeo de
 * errores Kernel→HTTP y la DEGRADACIÓN ELEGANTE de endpoints opcionales (404).
 * Idéntico patrón al cliente de Planes (DGP-012), apuntando a /abastecimiento.
 */
import { API_BASE } from "./constantes";

export interface ApiError {
  readonly status: number;
  readonly code?: string;
  readonly error: string;
}

export class AbastecimientoApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.name = "AbastecimientoApiError";
    this.status = e.status;
    this.code = e.code;
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface FetchOpts {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** No lanza en 404; devuelve `null`. Útil para endpoints opcionales. */
  toleraNoEncontrado?: boolean;
}

/**
 * Ejecuta una petición al módulo. Lanza `AbastecimientoApiError` en fallo salvo
 * que `toleraNoEncontrado` esté activo y el estado sea 404 (devuelve `null`).
 * Redirige a /login en 401.
 */
export async function abastecimientoFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body != null ? { "Content-Type": "application/json" } : undefined,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 401) {
    window.location.assign(`${import.meta.env.BASE_URL}login`);
    throw new AbastecimientoApiError({ status: 401, error: "No autenticado" });
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) {
    return null as T;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new AbastecimientoApiError({
      status: res.status,
      code: e.code,
      error: e.error ?? res.statusText ?? "Error desconocido",
    });
  }
  return data as T;
}

/** Indica si un endpoint opcional respondió 404 (feature aún no desplegada). */
export function esFuncionNoDisponible(err: unknown): boolean {
  return err instanceof AbastecimientoApiError && err.status === 404;
}
