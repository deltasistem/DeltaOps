/** DGP-012 · Pruebas del CALENDARIO OPERACIONAL (resolución determinista). */
import { describe, expect, it } from "vitest";
import { crearCalendarioOperacional, esDiaHabil, proximaFechaHabil, type CalendarioOperacional } from "../domain/calendario";

function cal(extra: Partial<Record<string, unknown>> = {}): CalendarioOperacional {
  const r = crearCalendarioOperacional({
    id: "cal-1", tenantId: "t", tipo: "empresa", ambito: "e1", nombre: "Base",
    diasLaborales: [1, 2, 3, 4, 5], festivos: [], turnos: [], ventanas: [], exclusiones: [], version: 0,
    ...extra,
  });
  if (!r.ok) throw new Error("calendario inválido");
  return r.value;
}

describe("esDiaHabil", () => {
  it("día laboral entre semana es hábil", () => {
    // 2024-01-08 es lunes.
    expect(esDiaHabil(cal(), "2024-01-08T00:00:00.000Z")).toBe(true);
  });
  it("fin de semana no es hábil", () => {
    // 2024-01-06 es sábado.
    expect(esDiaHabil(cal(), "2024-01-06T00:00:00.000Z")).toBe(false);
  });
  it("festivo no es hábil aunque sea día laboral", () => {
    expect(esDiaHabil(cal({ festivos: ["2024-01-08"] }), "2024-01-08T00:00:00.000Z")).toBe(false);
  });
  it("exclusión (parada/bloqueo) inhabilita el rango", () => {
    const c = cal({ exclusiones: [{ tipo: "mantenimiento-mayor", desde: "2024-01-08", hasta: "2024-01-12" }] });
    expect(esDiaHabil(c, "2024-01-10T00:00:00.000Z")).toBe(false);
  });
  it("con ventanas, sólo son hábiles fechas dentro de alguna ventana", () => {
    const c = cal({ ventanas: [{ tipo: "programada", desde: "2024-01-15", hasta: "2024-01-19" }] });
    expect(esDiaHabil(c, "2024-01-08T00:00:00.000Z")).toBe(false); // fuera de ventana
    expect(esDiaHabil(c, "2024-01-16T00:00:00.000Z")).toBe(true); // dentro (martes)
  });
});

describe("proximaFechaHabil", () => {
  it("salta el fin de semana al lunes", () => {
    // 2024-01-06 sábado → 2024-01-08 lunes.
    expect(proximaFechaHabil(cal(), "2024-01-06T00:00:00.000Z")).toBe("2024-01-08");
  });
  it("salta festivos consecutivos", () => {
    const c = cal({ festivos: ["2024-01-08", "2024-01-09"] });
    expect(proximaFechaHabil(c, "2024-01-08T00:00:00.000Z")).toBe("2024-01-10");
  });
  it("devuelve la misma fecha si ya es hábil", () => {
    expect(proximaFechaHabil(cal(), "2024-01-10T00:00:00.000Z")).toBe("2024-01-10");
  });
  it("devuelve null si no hay días hábiles en el horizonte", () => {
    const c = cal({ diasLaborales: [0], festivos: [] });
    expect(proximaFechaHabil(c, "2024-01-08T00:00:00.000Z", 5)).toBe(null);
  });
});
