/**
 * DGP-010 · Pruebas del calendario operacional integrado (punto 6).
 * Une agenda + órdenes (activo/SLA/prioridad/cuadrilla) y filtra por capas.
 * Lógica pura, fecha inyectada.
 */
import { describe, it, expect } from "vitest";
import { integrarAgenda, filtrarAgenda, opcionesAgenda } from "../lib/ecosistema/agenda-integrada";
import type { EntradaAgenda, OrdenRow } from "../lib/ordenes/tipos";

const AHORA = Date.parse("2024-06-10T00:00:00Z");

function ent(p: Partial<EntradaAgenda> & { id: string; codigo: string }): EntradaAgenda {
  return {
    titulo: "Tarea", estado: "PLANIFICADA", responsable: null,
    inicioPlanificado: null, finPlanificado: null, ventanaInicio: null, ventanaFin: null,
    programacionEstado: null, enConflicto: false, version: 1, ...p,
  };
}

function ord(p: Partial<OrdenRow> & { id: string }): OrdenRow {
  return {
    tenantId: "t", codigo: `OT-${p.id}`, titulo: "x", tipo: "correctiva", estado: "ABIERTA",
    categoria: null, prioridad: null, severidad: null, responsable: null, supervisor: null,
    activoPrincipalId: null, ubicacionId: null, datos: {}, version: 1, lastEventId: "e",
    actualizadoAt: "2024-06-01T00:00:00Z", ...p,
  } as OrdenRow;
}

describe("integrarAgenda", () => {
  it("enriquece la entrada con activo, prioridad, cuadrilla y SLA de la orden", () => {
    const entradas = [ent({ id: "A", codigo: "OT-A", responsable: "Ana" })];
    const ordenes = [ord({ id: "A", prioridad: "alta", activoPrincipalId: "ACT-1", datos: { cuadrilla: "C1", sla: { vencimiento: "2024-06-11T00:00:00Z" } } })];
    const [r] = integrarAgenda(entradas, ordenes, AHORA);
    expect(r.activoId).toBe("ACT-1");
    expect(r.prioridad).toBe("alta");
    expect(r.cuadrilla).toBe("C1");
    expect(r.sla.riesgo).toBe("riesgo");
  });

  it("degrada sin SLA cuando la orden no está en el listado", () => {
    const [r] = integrarAgenda([ent({ id: "Z", codigo: "OT-Z" })], [], AHORA);
    expect(r.sla.riesgo).toBe("sin-sla");
    expect(r.activoId).toBeNull();
  });
});

describe("filtrarAgenda / opcionesAgenda", () => {
  const entradas = integrarAgenda(
    [
      ent({ id: "A", codigo: "OT-A", responsable: "Ana" }),
      ent({ id: "B", codigo: "OT-B", responsable: "Beto" }),
    ],
    [
      ord({ id: "A", activoPrincipalId: "ACT-1", datos: { cuadrilla: "C1" } }),
      ord({ id: "B", activoPrincipalId: "ACT-2", datos: { cuadrilla: "C2", sla: { vencimiento: "2000-01-01T00:00:00Z" } } }),
    ],
    AHORA,
  );

  it("filtra por técnico", () => {
    expect(filtrarAgenda(entradas, { tecnico: "Ana" }).map((e) => e.id)).toEqual(["A"]);
  });
  it("filtra por activo y cuadrilla", () => {
    expect(filtrarAgenda(entradas, { activoId: "ACT-2" }).map((e) => e.id)).toEqual(["B"]);
    expect(filtrarAgenda(entradas, { cuadrilla: "C1" }).map((e) => e.id)).toEqual(["A"]);
  });
  it("filtra por SLA en riesgo", () => {
    expect(filtrarAgenda(entradas, { soloRiesgoSla: true }).map((e) => e.id)).toEqual(["B"]);
  });
  it("expone opciones únicas ordenadas", () => {
    const o = opcionesAgenda(entradas);
    expect(o.tecnicos).toEqual(["Ana", "Beto"]);
    expect(o.cuadrillas).toEqual(["C1", "C2"]);
    expect(o.activos).toEqual(["ACT-1", "ACT-2"]);
  });
});
