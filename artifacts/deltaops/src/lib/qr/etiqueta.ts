/**
 * DGP-008.3 · Lógica pura de etiquetas QR de plataforma (emisión/resolución).
 *
 * La plataforma (platform.qr) EMITE el código de la etiqueta. La ficha codifica
 * ESE código en el SVG y la etiqueta impresa (no una URL). El escáner resuelve
 * el contenido con el resolvedor del servidor y, sólo como degradación
 * secundaria, interpreta el contenido localmente (UUID o URL `…/activos/:id`).
 */
import type { EtiquetaQr } from "../activos/tipos";

/** Valor a codificar en el QR: SIEMPRE el código de plataforma (o "" si no hay). */
export function valorEtiqueta(etiqueta: EtiquetaQr | null | undefined): string {
  return etiqueta?.codigo ?? "";
}

/**
 * Extrae un id de activo de una cadena (URL de ficha o UUID). Degradación
 * secundaria cuando el resolvedor del servidor no está disponible.
 */
export function extraerId(codigo: string): string | null {
  const uuid = codigo.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  const m = codigo.match(/activos\/([^/?#]+)/);
  if (m && m[1]) return m[1];
  return null;
}

export interface RespuestaResolver {
  readonly id?: string;
  readonly activoId?: string;
}

export type ResultadoResolucion =
  | { origen: "servidor"; activoId: string }
  | { origen: "local"; activoId: string }
  | { origen: "no-resuelto"; codigo: string };

/**
 * Resuelve el contenido de un QR a un id de activo. Prioriza el resolvedor del
 * servidor; si devuelve `null` (endpoint no desplegado) o no trae id, cae a la
 * interpretación local. Es agnóstico del transporte (recibe la función que
 * consulta el servidor), por lo que es puro y testeable.
 */
export async function resolverCodigoActivo(
  codigo: string,
  consultarServidor: (codigo: string) => Promise<RespuestaResolver | null>,
): Promise<ResultadoResolucion> {
  const r = await consultarServidor(codigo);
  const idServidor = r?.activoId ?? r?.id;
  if (idServidor) return { origen: "servidor", activoId: idServidor };
  const local = extraerId(codigo);
  if (local) return { origen: "local", activoId: local };
  return { origen: "no-resuelto", codigo };
}
