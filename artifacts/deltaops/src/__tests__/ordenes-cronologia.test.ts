/**
 * DGP-009.3 (ronda 2) · Cronología Operacional: fusión ORDENADA de historial y
 * bitácora. Verifica el intercalado real por `ocurridoAt` (no la concatenación
 * cruda `[...historial, ...bitacora]`).
 */
import { describe, it, expect } from "vitest";
import { fusionarCronologia } from "../lib/ordenes/cronologia";
import type { EntradaBitacora, EventoHistorial } from "../lib/ordenes/tipos";

const historial: EventoHistorial[] = [
  { eventId: "h1", ordenId: "o1", tipo: "CREADA", resumen: "Orden creada", ocurridoAt: "2026-01-01T08:00:00.000Z", actor: "ana" },
  { eventId: "h2", ordenId: "o1", tipo: "ABIERTA", resumen: "Orden abierta", ocurridoAt: "2026-01-01T12:00:00.000Z", actor: "ana" },
];
const bitacora: EntradaBitacora[] = [
  { id: "b1", ordenId: "o1", accion: "inicio", ocurridoAt: "2026-01-01T10:00:00.000Z", detalle: { nota: "empezando" } },
  { id: "b2", ordenId: "o1", accion: "pausa", ocurridoAt: "2026-01-01T14:00:00.000Z" },
];

describe("cronología · fusión ordenada", () => {
  it("intercala historial y bitácora por ocurridoAt (desc por defecto)", () => {
    const r = fusionarCronologia(historial, bitacora);
    expect(r.map((e) => e.titulo)).toEqual([
      "Bitácora: pausa", // 14:00
      "Orden abierta", // 12:00
      "Bitácora: inicio", // 10:00
      "Orden creada", // 08:00
    ]);
    // Estrictamente decreciente.
    for (let i = 1; i < r.length; i += 1) expect(r[i - 1]!.orden).toBeGreaterThanOrEqual(r[i]!.orden);
    // Realmente INTERCALA fuentes (no primero todo historial y luego bitácora).
    expect(r.map((e) => e.origen)).toEqual(["bitacora", "historial", "bitacora", "historial"]);
  });

  it("ordena ascendente cuando se pide", () => {
    const r = fusionarCronologia(historial, bitacora, "asc");
    expect(r.map((e) => e.titulo)).toEqual([
      "Orden creada", // 08:00
      "Bitácora: inicio", // 10:00
      "Orden abierta", // 12:00
      "Bitácora: pausa", // 14:00
    ]);
    for (let i = 1; i < r.length; i += 1) expect(r[i - 1]!.orden).toBeLessThanOrEqual(r[i]!.orden);
  });

  it("tolera fuentes vacías/nulas y entradas sin fecha", () => {
    expect(fusionarCronologia(null, null)).toEqual([]);
    const soloUno = fusionarCronologia([{ eventId: "h", ordenId: "o", tipo: "X", resumen: "X" }], []);
    expect(soloUno).toHaveLength(1);
    expect(soloUno[0]!.hora).toBeUndefined();
  });

  it("mapea la nota de la bitácora a descripción y el actor del historial", () => {
    const r = fusionarCronologia(historial, bitacora, "asc");
    expect(r.find((e) => e.titulo === "Bitácora: inicio")!.descripcion).toBe("empezando");
    expect(r.find((e) => e.titulo === "Orden creada")!.descripcion).toBe("por ana");
  });
});
