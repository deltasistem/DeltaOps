/**
 * DGP-016 · Cliente HTTP del módulo Enterprise Analytics & KPI Platform.
 *
 * Envoltura fina sobre `fetch` con sesión por cookie; centraliza el mapeo de
 * errores Kernel→HTTP y la DEGRADACIÓN ELEGANTE de endpoints opcionales (404).
 * Mismo patrón que los clientes de Correctivo/Preventivo, apuntando a
 * `/api/deltaops/analytics`.
 */
import { API_BASE } from "./constantes";

export interface ApiError {
  readonly status: number;
  readonly code?: string;
  readonly error: string;
}

export class AnalyticsApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.name = "AnalyticsApiError";
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
 * Ejecuta una petición al módulo. Lanza `AnalyticsApiError` en fallo salvo que
 * `toleraNoEncontrado` esté activo y el estado sea 404 (devuelve `null`).
 * Redirige a /login en 401.
 */
export async function analyticsFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
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
    throw new AnalyticsApiError({ status: 401, error: "No autenticado" });
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) {
    return null as T;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new AnalyticsApiError({
      status: res.status,
      code: e.code,
      error: e.error ?? res.statusText ?? "Error desconocido",
    });
  }
  return data as T;
}

/** Indica si un endpoint opcional respondió 404 (feature aún no desplegada). */
export function esFuncionNoDisponible(err: unknown): boolean {
  return err instanceof AnalyticsApiError && err.status === 404;
}

/** Indica si un error es un fallo de red (sin conexión). */
export function esFalloDeRed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TypeError" || /fetch|network|failed|load/i.test(err.message);
}
