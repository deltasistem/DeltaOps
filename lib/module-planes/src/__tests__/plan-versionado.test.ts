/** DGP-012 · Pruebas de VERSIONADO de planes (inmutabilidad/publicar/rollback/comparar). */
import { describe, expect, it } from "vitest";
import { crearAlcanceActivos, crearFrecuencia, type AlcanceActivos, type Frecuencia } from "../domain/value-objects";
import { crearRutina, type Rutina } from "../domain/rutina";
import {
  aplicarAccionPlan,
  compararVersiones,
  crearPlan,
  editarPlan,
  publicarPlan,
  rollbackPlan,
  versionActiva,
  versionBorrador,
  type PlanMantenimiento,
  type ProgramaMantenimiento,
} from "../domain/plan";
import type { ReferenciaWorkflow } from "../domain/workflow";

function alcance(cat: string): AlcanceActivos {
  const r = crearAlcanceActivos({ categorias: [cat] });
  if (!r.ok) throw new Error("alcance");
  return r.value;
}
function frec(): Frecuencia {
  const r = crearFrecuencia({ reglas: [{ tipo: "meses", cada: 3 }] });
  if (!r.ok) throw new Error("frec");
  return r.value;
}
function rutina(): Rutina {
  const r = crearRutina({ id: "ru1", nombre: "Rutina base", actividades: [{ id: "a1", orden: 0, tipo: "inspeccion", titulo: "Revisar" }] });
  if (!r.ok) throw new Error("rutina");
  return r.value;
}
const programa: ProgramaMantenimiento = { frecuencia: frec(), calendarioId: null, vigenteDesde: "2024-01-01T00:00:00.000Z", vigenteHasta: null };
const wf: ReferenciaWorkflow = { proceso: "plan", definicion: "ciclo-plan-mantenimiento", instanciaId: "wf-1", version: 1 };

function nuevoPlan(): PlanMantenimiento {
  const r = crearPlan({
    id: "P1", tenantId: "t", codigo: "PLN-00001", nombre: "Plan bombas", descripcion: null,
    tipoPlan: "preventivo", estrategia: "basado-tiempo", prioridad: "alta",
    alcance: alcance("bombas"), rutina: rutina(), programa, workflow: wf,
    estadoInicial: "borrador", actorId: "u1", ahora: "2024-01-01T00:00:00.000Z",
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value.plan;
}

describe("Ciclo de versiones", () => {
  it("crea el plan con versión 1 borrador y sin versión activa", () => {
    const p = nuevoPlan();
    expect(p.estado).toBe("borrador");
    expect(p.versionActiva).toBe(0);
    expect(versionBorrador(p)?.numero).toBe(1);
    expect(versionActiva(p)).toBe(null);
  });

  it("publicar fija la versión activa e inmutabiliza el borrador", () => {
    const pub = publicarPlan(nuevoPlan(), "u1", "2024-01-02T00:00:00.000Z");
    expect(pub.ok).toBe(true);
    if (!pub.ok) return;
    expect(pub.value.plan.estado).toBe("vigente");
    expect(pub.value.plan.versionActiva).toBe(1);
    expect(versionActiva(pub.value.plan)?.publicada).toBe(true);
    expect(versionBorrador(pub.value.plan)).toBe(null);
  });

  it("editar tras publicar abre un borrador N+1 SIN mutar la versión publicada", () => {
    const pub = publicarPlan(nuevoPlan(), "u1", "2024-01-02T00:00:00.000Z");
    if (!pub.ok) throw new Error("pub");
    const ed = editarPlan(pub.value.plan, { alcance: alcance("motores") }, "u1", "2024-01-03T00:00:00.000Z");
    expect(ed.ok).toBe(true);
    if (!ed.ok) return;
    // La versión publicada (1) permanece intacta.
    const v1 = ed.value.plan.versiones.find((v) => v.numero === 1)!;
    expect(v1.publicada).toBe(true);
    expect(JSON.stringify(v1.alcance)).toContain("bombas");
    // Nace el borrador 2 con el cambio.
    expect(versionBorrador(ed.value.plan)?.numero).toBe(2);
    expect(JSON.stringify(versionBorrador(ed.value.plan)?.alcance)).toContain("motores");
    // La versión activa sigue siendo la 1.
    expect(ed.value.plan.versionActiva).toBe(1);
  });

  it("rollback repunta la versión activa a una publicada y descarta el borrador", () => {
    let p = nuevoPlan();
    const pub1 = publicarPlan(p, "u1", "2024-01-02T00:00:00.000Z");
    if (!pub1.ok) throw new Error("p1");
    const ed = editarPlan(pub1.value.plan, { alcance: alcance("motores") }, "u1", "2024-01-03T00:00:00.000Z");
    if (!ed.ok) throw new Error("ed");
    const pub2 = publicarPlan(ed.value.plan, "u1", "2024-01-04T00:00:00.000Z");
    if (!pub2.ok) throw new Error("p2");
    expect(pub2.value.plan.versionActiva).toBe(2);
    const rb = rollbackPlan(pub2.value.plan, 1, "u1", "2024-01-05T00:00:00.000Z");
    expect(rb.ok).toBe(true);
    if (!rb.ok) return;
    expect(rb.value.plan.versionActiva).toBe(1);
    expect(rb.value.plan.versiones.every((v) => v.publicada)).toBe(true);
    void p;
  });

  it("rollback a una versión inexistente/no publicada falla", () => {
    const pub = publicarPlan(nuevoPlan(), "u1", "2024-01-02T00:00:00.000Z");
    if (!pub.ok) throw new Error("pub");
    expect(rollbackPlan(pub.value.plan, 99, "u1", "2024-01-05T00:00:00.000Z").ok).toBe(false);
  });

  it("comparar versiones detecta diferencias de alcance", () => {
    const pub = publicarPlan(nuevoPlan(), "u1", "2024-01-02T00:00:00.000Z");
    if (!pub.ok) throw new Error("pub");
    const ed = editarPlan(pub.value.plan, { alcance: alcance("motores") }, "u1", "2024-01-03T00:00:00.000Z");
    if (!ed.ok) throw new Error("ed");
    const dif = compararVersiones(ed.value.plan, 1, 2);
    expect(dif.ok).toBe(true);
    if (!dif.ok) return;
    expect(dif.value.some((d) => d.campo === "alcance")).toBe(true);
  });
});

describe("Transiciones e inmutabilidad de estado", () => {
  it("un plan archivado es inmutable (no admite edición ni acciones)", () => {
    const pub = publicarPlan(nuevoPlan(), "u1", "2024-01-02T00:00:00.000Z");
    if (!pub.ok) throw new Error("pub");
    const arch = aplicarAccionPlan(pub.value.plan, "archivar", "u1", "2024-01-06T00:00:00.000Z");
    expect(arch.ok).toBe(true);
    if (!arch.ok) return;
    expect(arch.value.plan.estado).toBe("archivado");
    expect(editarPlan(arch.value.plan, { nombre: "x" }, "u1", "2024-01-07T00:00:00.000Z").ok).toBe(false);
    expect(aplicarAccionPlan(arch.value.plan, "suspender", "u1", "2024-01-07T00:00:00.000Z").ok).toBe(false);
  });
  it("suspender/reanudar transiciona vigente↔suspendido", () => {
    const pub = publicarPlan(nuevoPlan(), "u1", "2024-01-02T00:00:00.000Z");
    if (!pub.ok) throw new Error("pub");
    const susp = aplicarAccionPlan(pub.value.plan, "suspender", "u1", "2024-01-03T00:00:00.000Z");
    expect(susp.ok && susp.value.plan.estado === "suspendido").toBe(true);
    if (!susp.ok) return;
    const rea = aplicarAccionPlan(susp.value.plan, "reanudar", "u1", "2024-01-04T00:00:00.000Z");
    expect(rea.ok && rea.value.plan.estado === "vigente").toBe(true);
  });
});
