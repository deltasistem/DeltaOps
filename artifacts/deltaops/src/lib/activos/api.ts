/**
 * DGP-008.3 · Cliente HTTP del módulo de Activos.
 *
 * Envoltura fina sobre `fetch` con base path del router (BASE_URL) y sesión por
 * cookie. Centraliza el mapeo de errores kernel→HTTP y la DEGRADACIÓN ELEGANTE
 * de endpoints que aún no existen (404 en búsqueda/QR/URL firmada de adjuntos).
 */

/** Base de la API. Las rutas del módulo cuelgan de /api/deltaops/activos. */
export const API_BASE = "/api/deltaops/activos";

export interface ApiError {
  readonly status: number;
  readonly code?: string;
  readonly error: string;
}

export class ActivosApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.name = "ActivosApiError";
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
   * No redirige a /login en 401: lanza `ActivosApiError(401)` como un error más.
   * Reservado para peticiones de PRESENTACIÓN que se disparan de forma temprana
   * (p. ej. el catálogo de centros de costos del AppShell): un 401 transitorio
   * tras login/logout→login NO debe arrastrar el navegador entero a /login (esa
   * es competencia EXCLUSIVA de la sesión, `useSesion`). El llamador degrada el
   * error a estado vacío. Ver LITE-03 · fix de carrera post-login.
   */
  toleraNoAutorizado?: boolean;
}

/**
 * Ejecuta una petición al módulo. Lanza `ActivosApiError` en fallo salvo que
 * `toleraNoEncontrado` esté activo y el estado sea 404 (devuelve `null`).
 * Redirige a /login en 401, SALVO que `toleraNoAutorizado` esté activo (en cuyo
 * caso lanza el error para que el llamador degrade sin navegar).
 */
export async function activosFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
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
    throw new ActivosApiError({ status: 401, error: "No autenticado" });
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) {
    return null as T;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new ActivosApiError({
      status: res.status,
      code: e.code,
      error: e.error ?? res.statusText ?? "Error desconocido",
    });
  }
  return data as T;
}

/** Indica si un endpoint opcional respondió 404 (feature aún no desplegada). */
export function esFuncionNoDisponible(err: unknown): boolean {
  return err instanceof ActivosApiError && err.status === 404;
}
