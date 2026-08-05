/**
 * DGP-010 · Pruebas del estado operativo del SLA (función pura, sin analítica).
 * Fecha inyectada para determinismo. Verifica riesgo, escalamiento y tolerancia.
 */
import { describe, it, expect } from "vitest";
import { estadoSla, tonoRiesgo } from "../lib/ecosistema/sla";
import type { OrdenRow } from "../lib/ordenes/tipos";

const AHORA = Date.parse("2024-06-10T12:00:00Z");

function orden(p: { estado?: string; vencimiento?: string | null }): OrdenRow {
  return {
    tenantId: "deltaops", id: "O1", codigo: "OT-1", titulo: "Tarea",
    estado: (p.estado ?? "EN_EJECUCION") as OrdenRow["estado"], tipo: "correctiva",
    categoria: null, prioridad: null, severidad: null, responsable: null, supervisor: null,
    activoPrincipalId: null, ubicacionId: null,
    datos: p.vencimiento === undefined ? {} : { sla: p.vencimiento === null ? null : { vencimiento: p.vencimiento } },
    version: 1, lastEventId: "e", actualizadoAt: "2024-06-10T00:00:00Z",
  };
}

describe("estadoSla", () => {
  it("sin SLA cuando no hay vencimiento", () => {
    expect(estadoSla(orden({}), AHORA).riesgo).toBe("sin-sla");
    expect(estadoSla(orden({ vencimiento: null }), AHORA).riesgo).toBe("sin-sla");
  });

  it("vencido cuando el límite ya pasó y sugiere escalamiento si está abierta", () => {
    const r = estadoSla(orden({ vencimiento: "2024-06-10T06:00:00Z" }), AHORA);
    expect(r.riesgo).toBe("vencido");
    expect(r.escalar).toBe(true);
    expect(r.etiqueta).toMatch(/Vencido/);
  });

  it("no escala una orden cerrada aunque esté vencida", () => {
    const r = estadoSla(orden({ estado: "CERRADA", vencimiento: "2024-06-10T06:00:00Z" }), AHORA);
    expect(r.riesgo).toBe("vencido");
    expect(r.escalar).toBe(false);
  });

  it("crítico dentro del umbral y en riesgo por debajo del segundo umbral", () => {
    expect(estadoSla(orden({ vencimiento: "2024-06-10T18:00:00Z" }), AHORA).riesgo).toBe("critico"); // +6h
    expect(estadoSla(orden({ vencimiento: "2024-06-11T12:00:00Z" }), AHORA).riesgo).toBe("riesgo"); // +24h
    expect(estadoSla(orden({ vencimiento: "2024-06-20T12:00:00Z" }), AHORA).riesgo).toBe("en-plazo"); // +10d
  });

  it("mapea cada riesgo a un tono del Design System", () => {
    expect(tonoRiesgo("vencido")).toBe("error");
    expect(tonoRiesgo("critico")).toBe("error");
    expect(tonoRiesgo("riesgo")).toBe("advertencia");
    expect(tonoRiesgo("en-plazo")).toBe("exito");
    expect(tonoRiesgo("sin-sla")).toBe("neutro");
  });
});
