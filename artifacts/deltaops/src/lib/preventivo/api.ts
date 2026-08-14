/**
 * DGP-014 · Cliente HTTP del módulo Enterprise Preventive Maintenance.
 *
 * Envoltura fina sobre `fetch` con sesión por cookie; centraliza el mapeo de
 * errores Kernel→HTTP y la DEGRADACIÓN ELEGANTE de endpoints opcionales (404).
 * Idéntico patrón al cliente de Planes/Abastecimiento, apuntando a /preventivo.
 */
import { API_BASE } from "./constantes";

export interface ApiError {
  readonly status: number;
  readonly code?: string;
  readonly error: string;
}

export class PreventivoApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.name = "PreventivoApiError";
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
  /**
   * No redirige a /login en 401: lanza el error como uno más. Para consultas de
   * PRESENTACIÓN que se disparan al montar (Home/AppShell) justo tras
   * login/logout→login: un 401 transitorio (cookie recién emitida aún no
   * propagada a la petición inmediata) NO debe arrastrar el navegador a /login.
   * La AUTORIDAD de redirección es EXCLUSIVAMENTE la sesión (useSesion). El
   * llamador degrada el error a estado vacío. Ver LITE-03 · fix carrera post-login.
   */
  toleraNoAutorizado?: boolean;
}

/**
 * Ejecuta una petición al módulo. Lanza `PreventivoApiError` en fallo salvo que
 * `toleraNoEncontrado` esté activo y el estado sea 404 (devuelve `null`).
 * Redirige a /login en 401.
 */
export async function preventivoFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
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
    throw new PreventivoApiError({ status: 401, error: "No autenticado" });
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) {
    return null as T;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new PreventivoApiError({
      status: res.status,
      code: e.code,
      error: e.error ?? res.statusText ?? "Error desconocido",
    });
  }
  return data as T;
}

/** Indica si un endpoint opcional respondió 404 (feature aún no desplegada). */
export function esFuncionNoDisponible(err: unknown): boolean {
  return err instanceof PreventivoApiError && err.status === 404;
}
