/**
 * DGP-LITE-04 · Cliente HTTP del PREOPERACIONAL. Envoltura fina sobre `fetch`
 * con sesión por cookie; mismo patrón que el cliente de Correctivo. El backend
 * es la autoridad; el cliente jamás calcula veredicto ni criticidad.
 */
import { API_BASE } from "./constantes";

export interface ApiError {
  readonly status: number;
  readonly code?: string;
  readonly error: string;
}

export class PreoperacionalApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.name = "PreoperacionalApiError";
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
  toleraNoEncontrado?: boolean;
  toleraNoAutorizado?: boolean;
}

export async function preoperacionalFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body != null ? { "Content-Type": "application/json" } : undefined,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 401) {
    if (!opts.toleraNoAutorizado) {
      window.location.assign(`${import.meta.env.BASE_URL}login`);
    }
    throw new PreoperacionalApiError({ status: 401, error: "No autenticado" });
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) {
    return null as T;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new PreoperacionalApiError({
      status: res.status,
      code: e.code,
      error: e.error ?? res.statusText ?? "Error desconocido",
    });
  }
  return data as T;
}

export function esFuncionNoDisponible(err: unknown): boolean {
  return err instanceof PreoperacionalApiError && err.status === 404;
}
