/**
 * DGP-017 · Cliente HTTP de Identidad, Tenancy y SaaS.
 *
 * Envoltura fina sobre `fetch` con sesión por cookie contra el contrato
 * CONGELADO en `/api/deltaops` (rutas `identity.*`). Centraliza el mapeo de
 * errores `{error, code?}` a una excepción tipada. NO redirige por sí mismo:
 * el AppShell decide la navegación según el estado de la sesión, de modo que
 * 401 aquí es un dato (no un side effect), imprescindible para el login.
 */

export const BASE = "/api/deltaops";

export class IdentidadError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Datos adicionales del cuerpo (p. ej. membresías en 409 SELECT_TENANT). */
  readonly datos: Record<string, unknown>;
  constructor(status: number, mensaje: string, code?: string, datos: Record<string, unknown> = {}) {
    super(mensaje);
    this.name = "IdentidadError";
    this.status = status;
    this.code = code;
    this.datos = datos;
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

export interface Opciones {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Devuelve `null` en 404 en vez de lanzar (endpoints opcionales). */
  toleraNoEncontrado?: boolean;
}

/**
 * Ejecuta una petición al contrato de identidad. Lanza `IdentidadError` con el
 * `status` y el `code` del cuerpo cuando la respuesta no es correcta. El 409
 * SELECT_TENANT se propaga con las membresías en `datos` para el selector.
 */
export async function identidadFetch<T = unknown>(path: string, opts: Opciones = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: opts.body != null ? { "Content-Type": "application/json" } : undefined,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const data = await parse(res);
  if (res.status === 404 && opts.toleraNoEncontrado) return null as T;
  if (!res.ok) {
    const cuerpo = (data ?? {}) as { error?: string; code?: string } & Record<string, unknown>;
    throw new IdentidadError(
      res.status,
      cuerpo.error ?? res.statusText ?? "Error de identidad",
      cuerpo.code,
      cuerpo,
    );
  }
  return data as T;
}

/** Indica si un error es un fallo de red (sin conexión). */
export function esFalloDeRed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TypeError" || /fetch|network|failed|load/i.test(err.message);
}

/** Traduce un `IdentidadError`/red a un mensaje accesible para el usuario. */
export function mensajeDeError(err: unknown): string {
  if (esFalloDeRed(err)) return "No hay conexión con el servidor. Verifica tu red e intenta de nuevo.";
  if (err instanceof IdentidadError) return err.message;
  if (err instanceof Error) return err.message;
  return "Ocurrió un error inesperado.";
}
