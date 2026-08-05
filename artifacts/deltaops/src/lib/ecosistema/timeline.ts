/**
 * DGP-010 · Timeline unificado del ecosistema (función PURA).
 *
 * Converge en una única línea temporal, ordenada cronológicamente por
 * `ocurridoAt`, la actividad del ACTIVO (Shared Timeline de DGP-008: eventos,
 * cambios, medidores, comentarios, adjuntos) y la de la ORDEN (historial +
 * bitácora del Workflow/CQRS de DGP-009). No introduce fuentes nuevas: reutiliza
 * `fusionarCronologia` para las órdenes y normaliza los eventos de activo al
 * mismo modelo `EventoCronologia`, marcando su `origen` para el filtrado en la
 * vista. Al ser pura, es directamente testeable.
 */
import type { EntradaBitacora, EventoHistorial } from "../ordenes/tipos";
import type { EventoTimeline } from "../activos/tipos";
import { fusionarCronologia, type EventoCronologia, type TonoTimeline } from "../ordenes/cronologia";

export type OrigenEcosistema = "activo" | "historial" | "bitacora";

export interface EventoEcosistema extends Omit<EventoCronologia, "origen"> {
  readonly origen: OrigenEcosistema;
  /** Etiqueta legible de la fuente (Activo / Orden). */
  readonly fuente: "Activo" | "Orden";
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

/** Marca temporal preferida de un evento de activo (varias fuentes posibles). */
function tsActivo(e: EventoTimeline): string | undefined {
  return e.ocurridoAt ?? e.occurredAt ?? e.fecha;
}

/**
 * ¿El evento de activo es una LECTURA DE MEDIDOR (horómetro/odómetro)? El
 * historial del activo proyecta estos eventos con tipo
 * `modulo.activos.horometro-actualizado` / `odometro-actualizado` y resumen
 * legible; los reconocemos para resaltarlos en la línea temporal unificada.
 */
export function esLecturaMedidor(e: EventoTimeline): boolean {
  const t = `${e.tipo ?? ""}`.toLowerCase();
  const r = `${e.resumen ?? ""}`.toLowerCase();
  return /horometro|odometro|horómetro|odómetro/.test(t) || /horómetro|odómetro|horometro|odometro/.test(r);
}

/**
 * Fusiona la actividad de un activo con la cronología de una orden.
 * @param direccion "desc" (reciente primero, por defecto) o "asc".
 */
export function fusionarEcosistema(
  activo: readonly EventoTimeline[] | null | undefined,
  historial: readonly EventoHistorial[] | null | undefined,
  bitacora: readonly EntradaBitacora[] | null | undefined,
  direccion: "asc" | "desc" = "desc",
): EventoEcosistema[] {
  const a: EventoEcosistema[] = (activo ?? []).map((e) => {
    const ts = tsActivo(e);
    const medidor = esLecturaMedidor(e);
    const tono: TonoTimeline = medidor ? "exito" : e.estado ? "info" : "neutro";
    const base = e.resumen || e.descripcion || e.tipo || "Actividad del activo";
    return {
      ts,
      orden: tsNumero(ts),
      origen: "activo",
      fuente: "Activo",
      titulo: medidor ? `📊 ${base}` : base,
      hora: horaLegible(ts),
      descripcion: e.actor ? `por ${e.actor}` : e.descripcion,
      tono,
    };
  });

  // Reutiliza la fusión de órdenes (ya ordena y normaliza historial+bitácora).
  const orden: EventoEcosistema[] = fusionarCronologia(historial, bitacora, direccion).map((e) => ({
    ...e,
    origen: e.origen,
    fuente: "Orden",
  }));

  const factor = direccion === "asc" ? 1 : -1;
  return [...a, ...orden].sort((x, y) => factor * (x.orden - y.orden));
}
