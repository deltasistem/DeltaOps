/**
 * DGP-010 · Pruebas del timeline UNIFICADO del ecosistema.
 * Verifican que la actividad del activo y la cronología de la orden se fusionan
 * en una sola línea ordenada por `ocurridoAt`, marcando la fuente de cada evento.
 */
import { describe, it, expect } from "vitest";
import { fusionarEcosistema } from "../lib/ecosistema/timeline";
import type { EventoTimeline } from "../lib/activos/tipos";
import type { EventoHistorial, EntradaBitacora } from "../lib/ordenes/tipos";

const activo: EventoTimeline[] = [
  { id: "a1", tipo: "medidor", resumen: "Horómetro 1200h", ocurridoAt: "2024-06-01T08:00:00Z", actor: "sensor" },
  { id: "a2", tipo: "cambio", resumen: "Cambio de ubicación", fecha: "2024-06-03T10:00:00Z" },
];
const historial: EventoHistorial[] = [
  { eventId: "h1", ordenId: "O1", tipo: "creada", resumen: "OT creada", ocurridoAt: "2024-06-02T09:00:00Z", actor: "ana" },
];
const bitacora: EntradaBitacora[] = [
  { ordenId: "O1", accion: "nota", detalle: { nota: "Revisado" }, ocurridoAt: "2024-06-04T11:00:00Z", actor: "beto" },
];

describe("fusionarEcosistema", () => {
  it("fusiona activo + orden y ordena descendente por defecto", () => {
    const r = fusionarEcosistema(activo, historial, bitacora);
    expect(r).toHaveLength(4);
    const tsOrden = r.map((e) => e.ts);
    expect(tsOrden).toEqual([
      "2024-06-04T11:00:00Z",
      "2024-06-03T10:00:00Z",
      "2024-06-02T09:00:00Z",
      "2024-06-01T08:00:00Z",
    ]);
  });

  it("marca la fuente de cada evento (Activo / Orden)", () => {
    const r = fusionarEcosistema(activo, historial, bitacora, "asc");
    expect(r[0].fuente).toBe("Activo");
    const fuentes = new Set(r.map((e) => e.fuente));
    expect(fuentes.has("Activo")).toBe(true);
    expect(fuentes.has("Orden")).toBe(true);
  });

  it("orden ascendente coloca lo más antiguo primero", () => {
    const r = fusionarEcosistema(activo, historial, bitacora, "asc");
    expect(r[0].ts).toBe("2024-06-01T08:00:00Z");
  });

  it("tolera fuentes vacías o nulas sin romper", () => {
    expect(fusionarEcosistema(null, null, null)).toEqual([]);
    expect(fusionarEcosistema(activo, null, undefined)).toHaveLength(2);
  });
});
