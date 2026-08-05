/**
 * DGP-009.3 (ronda 2) · Fusión cronológica de la Cronología Operacional.
 *
 * Combina el historial de eventos y la bitácora operacional en una única línea
 * temporal ORDENADA por `ocurridoAt`. Sin ordenar, `[...historial, ...bitacora]`
 * intercalaba las fuentes de forma arbitraria (primero todo el historial, luego
 * toda la bitácora), rompiendo la lectura cronológica. Función PURA (testeable).
 */
import type { EntradaBitacora, EventoHistorial } from "./tipos";

export type TonoTimeline = "info" | "neutro" | "exito" | "advertencia" | "error";

export interface EventoCronologia {
  /** Marca temporal ISO original (para orden estable); puede faltar. */
  readonly ts: string | undefined;
  /** Timestamp numérico normalizado usado para ordenar. */
  readonly orden: number;
  readonly origen: "historial" | "bitacora";
  readonly titulo: string;
  readonly hora: string | undefined;
  readonly descripcion: string | undefined;
  readonly tono: TonoTimeline;
}

function tsNumero(iso: string | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n;
}

function horaLegible(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? iso : new Date(n).toLocaleString("es");
}

/**
 * Fusiona historial + bitácora y ordena por `ocurridoAt`.
 * @param direccion "desc" (más reciente primero, por defecto) o "asc".
 */
export function fusionarCronologia(
  historial: readonly EventoHistorial[] | null | undefined,
  bitacora: readonly EntradaBitacora[] | null | undefined,
  direccion: "asc" | "desc" = "desc",
): EventoCronologia[] {
  const h: EventoCronologia[] = (historial ?? []).map((e) => ({
    ts: e.ocurridoAt,
    orden: tsNumero(e.ocurridoAt),
    origen: "historial",
    titulo: e.resumen || e.tipo,
    hora: horaLegible(e.ocurridoAt),
    descripcion: e.actor ? `por ${e.actor}` : undefined,
    tono: "info",
  }));
  const b: EventoCronologia[] = (bitacora ?? []).map((x) => ({
    ts: x.ocurridoAt,
    orden: tsNumero(x.ocurridoAt),
    origen: "bitacora",
    titulo: `Bitácora: ${x.accion}`,
    hora: horaLegible(x.ocurridoAt),
    descripcion: typeof x.detalle?.nota === "string" ? (x.detalle.nota as string) : undefined,
    tono: "neutro",
  }));

  const factor = direccion === "asc" ? 1 : -1;
  return [...h, ...b].sort((a, c) => factor * (a.orden - c.orden));
}
