/**
 * DGP-015 · Pruebas de la detección de fallas REINCIDENTES en el historial de
 * eventos del activo (pestaña «Correctivo» de la ficha del activo, alcanzable
 * por el QR del activo; el correctivo NO crea QR propio). La marca de
 * reincidencia respeta el flag del read model si viene del backend y, si no, lo
 * deriva localmente detectando el mismo `modoFalla` repetido en fallas del
 * activo. Función PURA y determinista.
 */
import { describe, it, expect } from "vitest";
import { marcarReincidencias } from "../pages/ficha/tab-correctivo";
import type { EventoActivo } from "../lib/correctivo/tipos";

describe("eventos de activo · reincidencia", () => {
  it("respeta el flag `reincidente` provisto por el read model del backend", () => {
    const eventos: EventoActivo[] = [
      { tipo: "falla-reportada", modoFalla: "fuga", reincidente: true },
    ];
    expect(marcarReincidencias(eventos)[0]!.esReincidente).toBe(true);
  });

  it("deriva reincidencia local ante el MISMO modo de falla repetido", () => {
    const eventos: EventoActivo[] = [
      { tipo: "falla-reportada", modoFalla: "desgaste" },
      { tipo: "falla-confirmada", modoFalla: "desgaste" },
    ];
    const marcados = marcarReincidencias(eventos);
    // La primera ocurrencia no es reincidente; la segunda sí.
    expect(marcados[0]!.esReincidente).toBe(false);
    expect(marcados[1]!.esReincidente).toBe(true);
  });

  it("no marca reincidencia entre modos de falla distintos", () => {
    const eventos: EventoActivo[] = [
      { tipo: "falla-reportada", modoFalla: "fuga" },
      { tipo: "falla-reportada", modoFalla: "ruido" },
    ];
    expect(marcarReincidencias(eventos).every((e) => !e.esReincidente)).toBe(true);
  });

  it("ignora eventos que no son fallas (reparaciones/puestas en servicio) para la derivación", () => {
    const eventos: EventoActivo[] = [
      { tipo: "reparacion-finalizada", modoFalla: "desgaste" },
      { tipo: "falla-reportada", modoFalla: "desgaste" },
    ];
    const marcados = marcarReincidencias(eventos);
    expect(marcados[0]!.esReincidente).toBe(false);
    // La falla no hereda reincidencia de una reparación previa.
    expect(marcados[1]!.esReincidente).toBe(false);
  });

  it("un modo de falla vacío no dispara falsos positivos", () => {
    const eventos: EventoActivo[] = [
      { tipo: "falla-reportada" },
      { tipo: "falla-reportada" },
    ];
    expect(marcarReincidencias(eventos).every((e) => !e.esReincidente)).toBe(true);
  });
});
