/**
 * FINAL-02 · Cliente de Informes Operacionales (solo lectura).
 *
 * La consulta visual y la exportación usan el MISMO endpoint de dataset
 * (`/api/deltaops/informes/:clave` y `/:clave/exportar`): «la consulta visual
 * es el dataset exportado». El frontend solo presenta; RBAC/tenant/RLS los
 * aplica el backend (401/403 reales).
 */

export const API_INFORMES = "/api/deltaops/informes";

export interface ColumnaInforme {
  clave: string;
  titulo: string;
}

export interface CatalogoInforme {
  clave: string;
  titulo: string;
  descripcion: string;
  filtros: string[];
}

export interface DatasetInforme {
  informe: string;
  titulo: string;
  columnas: ColumnaInforme[];
  filas: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
  meta?: Record<string, unknown>;
}

export interface FiltrosInforme {
  desde?: string;
  hasta?: string;
  activoId?: string;
  estado?: string;
  veredicto?: string;
  tipo?: string;
  centroCosto?: string;
  offset?: number;
  limit?: number;
}

export class ErrorInformes extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ErrorInformes";
  }
}

function qs(filtros: FiltrosInforme): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v !== undefined && v !== null && String(v) !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function pedirJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: "include", signal });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const cuerpo = (await res.json()) as { error?: string };
      if (cuerpo?.error) msg = cuerpo.error;
    } catch {
      /* cuerpo no-JSON: mantener mensaje por status */
    }
    throw new ErrorInformes(msg, res.status);
  }
  return (await res.json()) as T;
}

export function listarInformes(signal?: AbortSignal): Promise<{ informes: CatalogoInforme[] }> {
  return pedirJson(`${API_INFORMES}`, signal);
}

export function consultarInforme(
  clave: string,
  filtros: FiltrosInforme,
  signal?: AbortSignal,
): Promise<DatasetInforme> {
  return pedirJson(`${API_INFORMES}/${encodeURIComponent(clave)}${qs(filtros)}`, signal);
}

/**
 * Exporta el informe con los MISMOS filtros de la consulta visual. Descarga por
 * blob (la sesión viaja por cookie; un <a href> perdería el manejo de errores).
 */
export async function exportarInforme(
  clave: string,
  formato: "csv" | "xlsx",
  filtros: FiltrosInforme,
): Promise<void> {
  const { offset: _o, limit: _l, ...resto } = filtros;
  const url = `${API_INFORMES}/${encodeURIComponent(clave)}/exportar${qs({ ...resto })}${
    qs(resto) ? "&" : "?"
  }formato=${formato}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const cuerpo = (await res.json()) as { error?: string };
      if (cuerpo?.error) msg = cuerpo.error;
    } catch {
      /* mantener mensaje por status */
    }
    throw new ErrorInformes(msg, res.status);
  }
  const blob = await res.blob();
  const disp = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(disp);
  const nombre = m?.[1] ?? `deltaops-informe-${clave}.${formato}`;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
