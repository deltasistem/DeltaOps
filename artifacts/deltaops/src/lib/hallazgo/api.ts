/**
 * DELTAOPS LITE-05 · Cliente HTTP del BUCLE Hallazgo→OT→Cierre. Envoltura fina
 * sobre `fetch` con sesión por cookie (mismo patrón que el preoperacional que
 * ORIGINA los hallazgos). El backend es la autoridad absoluta: resuelve la
 * procedencia, sella el estado y decide RBAC; el cliente jamás lo recalcula.
 */
export const HALLAZGO_API_BASE = "/api/deltaops/activos/hallazgo";
export const HALLAZGO_SYNC_URL = `${HALLAZGO_API_BASE}/sync`;
/** Namespace de la ÚNICA cola offline para las operaciones de hallazgo. */
export const HALLAZGO_MODULO_OFFLINE = "hallazgo";

export interface ApiError {
  readonly status: number;
  readonly code?: string;
  readonly error: string;
}

export class HallazgoApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.name = "HallazgoApiError";
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
  /**
   * Cuando es `true`, un 401 NO redirige en duro a /login: se lanza el error para
   * que el llamador degrade con gracia. Imprescindible en lecturas que se disparan
   * al montar la Home tras login (cookie recién emitida aún no propagada): la
   * autoridad de sesión es la única que redirige. Ver LITE-03 · fix carrera.
   */
  toleraNoAutorizado?: boolean;
}

export async function hallazgoFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${HALLAZGO_API_BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body != null ? { "Content-Type": "application/json" } : undefined,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 401) {
    if (opts.toleraNoAutorizado) {
      throw new HallazgoApiError({ status: 401, error: "No autenticado" });
    }
    window.location.assign(`${import.meta.env.BASE_URL}login`);
    throw new HallazgoApiError({ status: 401, error: "No autenticado" });
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) return null as T;
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new HallazgoApiError({ status: res.status, error: e.error ?? `HTTP ${res.status}`, ...(e.code ? { code: e.code } : {}) });
  }
  return data as T;
}
