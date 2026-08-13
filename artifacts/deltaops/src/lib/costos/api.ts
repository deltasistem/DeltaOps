/**
 * DGP-021.3 · Cliente HTTP del orquestador de composición de costos.
 *
 * Envoltura fina sobre `fetch` con sesión por cookie (mismo patrón que Mano de
 * Obra). El tenant lo determina la sesión del backend (§17); el cliente NUNCA
 * envía tenant. Sólo LECTURA (GET). Redirige a /login en 401.
 */
import { API_BASE } from "./constantes";

export class CostosApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, error: string, code?: string) {
    super(error);
    this.name = "CostosApiError";
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
  signal?: AbortSignal;
  /** No lanza en 404; devuelve `null`. */
  toleraNoEncontrado?: boolean;
}

/** GET al orquestador de composición. Lanza `CostosApiError` en fallo (salvo 404 tolerado). */
export async function costosFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    credentials: "include",
    signal: opts.signal,
  });
  if (res.status === 401) {
    window.location.assign(`${import.meta.env.BASE_URL}login`);
    throw new CostosApiError(401, "No autenticado");
  }
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) return null as T;
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new CostosApiError(res.status, e.error ?? res.statusText ?? "Error desconocido", e.code);
  }
  return data as T;
}

/** Mensaje legible de un error del cliente. */
export function mensajeDeError(err: unknown): string {
  if (err instanceof CostosApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Ocurrió un error inesperado.";
}
