/**
 * DGP-020.3 · Cliente HTTP del módulo Mano de Obra.
 *
 * Envoltura fina sobre `fetch` con sesión por cookie; mismo patrón que el
 * cliente de Órdenes (DGP-009.3). Centraliza el mapeo de errores kernel→HTTP y
 * la degradación elegante de endpoints opcionales (404 → null).
 */
import { API_BASE } from "./constantes";

export class ManoDeObraApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, error: string, code?: string) {
    super(error);
    this.name = "ManoDeObraApiError";
    this.status = status;
    this.code = code;
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
 * Ejecuta una petición al módulo. Lanza `ManoDeObraApiError` en fallo salvo que
 * `toleraNoEncontrado` esté activo y el estado sea 404 (devuelve `null`).
 * Redirige a /login en 401.
 */
export async function mdoFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body != null ? { "Content-Type": "application/json" } : undefined,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 401) {
    window.location.assign(`${import.meta.env.BASE_URL}login`);
    throw new ManoDeObraApiError(401, "No autenticado");
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) {
    return null as T;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new ManoDeObraApiError(res.status, e.error ?? res.statusText ?? "Error desconocido", e.code);
  }
  return data as T;
}

/** Mensaje legible a partir de un error del cliente. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof ManoDeObraApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Ocurrió un error inesperado.";
}
