/**
 * DGP-010 · Punto 10: el timeline unificado incorpora las LECTURAS DE MEDIDOR
 * del activo (horómetro/odómetro), resaltadas y ordenadas cronológicamente.
 */
import { describe, it, expect } from "vitest";
import { fusionarEcosistema, esLecturaMedidor } from "../lib/ecosistema/timeline";
import type { EventoTimeline } from "../lib/activos/tipos";

describe("esLecturaMedidor", () => {
  it("reconoce eventos de horómetro/odómetro por tipo o resumen", () => {
    expect(esLecturaMedidor({ tipo: "modulo.activos.horometro-actualizado" })).toBe(true);
    expect(esLecturaMedidor({ tipo: "modulo.activos.odometro-actualizado" })).toBe(true);
    expect(esLecturaMedidor({ resumen: "Horómetro actualizado (EQ-1)" })).toBe(true);
    expect(esLecturaMedidor({ tipo: "modulo.activos.actualizado" })).toBe(false);
  });
});

describe("fusionarEcosistema incorpora medidores", () => {
  it("incluye y resalta la lectura de medidor en la línea temporal", () => {
    const activo: EventoTimeline[] = [
      { tipo: "modulo.activos.horometro-actualizado", resumen: "Horómetro actualizado (EQ-1)", ocurridoAt: "2024-06-02T10:00:00Z" },
      { tipo: "modulo.activos.actualizado", resumen: "Datos actualizados", ocurridoAt: "2024-06-01T10:00:00Z" },
    ];
    const fusion = fusionarEcosistema(activo, [], []);
    const medidor = fusion.find((e) => e.titulo.includes("Horómetro"));
    expect(medidor).toBeDefined();
    expect(medidor!.titulo.startsWith("📊")).toBe(true);
    expect(medidor!.tono).toBe("exito");
    // Orden descendente por defecto: el medidor (más reciente) va primero.
    expect(fusion[0]!.titulo).toContain("Horómetro");
  });
});
