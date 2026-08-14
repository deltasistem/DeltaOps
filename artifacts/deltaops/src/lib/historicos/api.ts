/**
 * DELTAOPS LITE-09 · Cliente HTTP de la IMPORTACIÓN DE DATOS HISTÓRICOS.
 *
 * Envoltura fina sobre `fetch` (misma convención que el resto de módulos: base
 * `/api/deltaops/...`, sesión por cookie, redirección a login en 401). Las rutas
 * cuelgan de `/deltaops/activos/historicos` (gobernadas por el entitlement
 * `activos`). Superficie EXCLUSIVA de administración de empresa: el backend es la
 * autoridad y responde 403 a roles no autorizados; aquí solo se presenta honesto.
 */

/** Base de la API de importación histórica. */
export const HISTORICOS_API_BASE = "/api/deltaops/activos/historicos";

export interface ApiError {
  readonly status: number;
  readonly code?: string;
  readonly error: string;
}

export class HistoricosApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(e: ApiError) {
    super(e.error);
    this.name = "HistoricosApiError";
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
  /** Cuerpo binario (application/octet-stream) para la subida directa. */
  rawBody?: BodyInit;
  rawContentType?: string;
}

export async function historicosFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const usaRaw = opts.rawBody != null;
  const res = await fetch(`${HISTORICOS_API_BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    headers: usaRaw
      ? (opts.rawContentType ? { "Content-Type": opts.rawContentType } : undefined)
      : opts.body != null
        ? { "Content-Type": "application/json" }
        : undefined,
    body: usaRaw ? opts.rawBody : opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  if (res.status === 401) {
    window.location.assign(`${import.meta.env.BASE_URL}login`);
    throw new HistoricosApiError({ status: 401, error: "No autenticado" });
  }
  const data = await parse(res);
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; code?: string };
    throw new HistoricosApiError({
      status: res.status,
      code: e.code,
      error: e.error ?? res.statusText ?? "Error desconocido",
    });
  }
  return data as T;
}

export function mensajeDeError(err: unknown): string {
  if (err instanceof HistoricosApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error inesperado";
}

/* ------------------------------- Tipos ---------------------------------- */

export type TipoFuente =
  | "checklist-cargador"
  | "checklist-montacargas"
  | "combustible"
  | "horas-hombre"
  | "pmp-cargadores"
  | "pmp-montacargas";

export interface TipoFuenteItem {
  tipo: TipoFuente;
  etiqueta: string;
}

export interface ArchivoDisponible {
  nombre: string;
  tipo: TipoFuente | null;
  etiqueta: string | null;
}

export interface AnalisisArchivo {
  archivo: string;
  tipo: TipoFuente | null;
  etiqueta: string | null;
  reconocido: boolean;
  totalFilas: number;
  columnas: number;
  muestraEncabezados: string[];
}

export interface FilaExcluida {
  fila: number;
  codigo: string;
  motivo: string;
}

export interface Incidencia {
  fila: number;
  nivel: "warn" | "error";
  mensaje: string;
}

export interface ImportadosContadores {
  lecturas: number;
  tanqueos: number;
  preoperacionales: number;
  jornadas: number;
  mantenimientos: number;
}

export interface ReporteImportacion {
  tipo: TipoFuente;
  archivo: string;
  loteId: string;
  totalFilas: number;
  validos: number;
  advertencias: number;
  rechazados: number;
  activosNuevos: string[];
  activosExistentes: string[];
  filasExcluidas: FilaExcluida[];
  camposNoMapeados: string[];
  incidencias: Incidencia[];
  importados: ImportadosContadores;
  dryRun: boolean;
}

/**
 * Referencia a un archivo cargado: de servidor (`archivo`) o SUBIDO server-side
 * (`uploadId`). La subida ya no reenvía base64 en JSON (chocaba con el límite de
 * 100KB de express.json para 4/6 archivos): se referencia por id liviano.
 */
export type ReferenciaArchivo =
  | { archivo: string }
  | { uploadId: string };

export interface RespuestaSubida {
  uploadId: string;
  nombre: string;
  bytes: number;
}

/* ------------------------------ Endpoints -------------------------------- */

export function obtenerTiposFuente(signal?: AbortSignal): Promise<{ tipos: TipoFuenteItem[] }> {
  return historicosFetch("/tipos-fuente", { signal });
}

export function obtenerArchivosDisponibles(signal?: AbortSignal): Promise<{ archivos: ArchivoDisponible[] }> {
  return historicosFetch("/archivos-disponibles", { signal });
}

export function analizarArchivo(ref: ReferenciaArchivo, signal?: AbortSignal): Promise<AnalisisArchivo> {
  return historicosFetch("/analizar", { method: "POST", body: ref, signal });
}

export function validarArchivo(ref: ReferenciaArchivo, signal?: AbortSignal): Promise<ReporteImportacion> {
  return historicosFetch("/validar", { method: "POST", body: ref, signal });
}

export function importarArchivoRemoto(ref: ReferenciaArchivo, signal?: AbortSignal): Promise<ReporteImportacion> {
  return historicosFetch("/importar", { method: "POST", body: ref, signal });
}

/** Sube un Excel local como binario y devuelve su contenido base64 + nombre. */
export function subirArchivo(archivo: File, signal?: AbortSignal): Promise<RespuestaSubida> {
  const nombre = encodeURIComponent(archivo.name);
  return historicosFetch(`/subir?nombre=${nombre}`, {
    method: "POST",
    rawBody: archivo,
    rawContentType: "application/octet-stream",
    signal,
  });
}
