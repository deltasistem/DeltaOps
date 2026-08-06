/** DGP-013 · Pruebas del ciclo de vida gobernado de SOLICITUD DE COMPRA (puro). */
import { describe, expect, it } from "vitest";
import { aplicarAccionSolicitud, crearSolicitud, type SolicitudCompra } from "../domain/solicitud";
import { crearLineaSolicitud, crearReferenciaOrigen, type LineaSolicitud, type ReferenciaOrigen } from "../domain/value-objects";
import type { ReferenciaWorkflow } from "../domain/workflow";

const WF: ReferenciaWorkflow = { proceso: "solicitud", definicion: "d", instanciaId: "i", version: 1 };
const AHORA = "2024-01-01T00:00:00.000Z";

function origen(): ReferenciaOrigen {
  const r = crearReferenciaOrigen({ tipo: "usuario", referenciaId: "u1", referenciaTipo: "manual", etiqueta: null });
  if (!r.ok) throw new Error("origen");
  return r.value;
}

function linea(numero: number): LineaSolicitud {
  const r = crearLineaSolicitud({ numero, articuloId: `art-${numero}`, cantidad: { valor: 1, unidad: "unidad" } });
  if (!r.ok) throw new Error("linea");
  return r.value;
}

function sol(estado: SolicitudCompra["estado"]): SolicitudCompra {
  const r = crearSolicitud({
    id: "s1", tenantId: "t", codigo: "SOL-1", titulo: "Repuestos", origen: origen(),
    prioridad: "alta", lineas: [linea(1)], workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA,
  });
  if (!r.ok) throw new Error("sol");
  return { ...r.value.solicitud, estado };
}

describe("crearSolicitud", () => {
  it("crea en borrador con versión 1", () => {
    const r = crearSolicitud({ id: "s", tenantId: "t", codigo: "SOL", titulo: "T", origen: origen(), prioridad: "alta", lineas: [linea(1)], workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.solicitud.estado).toBe("borrador");
    expect(r.value.solicitud.version).toBe(1);
  });
  it("rechaza título vacío, sin líneas y números duplicados", () => {
    expect(crearSolicitud({ id: "s", tenantId: "t", codigo: "S", titulo: "  ", origen: origen(), prioridad: "alta", lineas: [linea(1)], workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA }).ok).toBe(false);
    expect(crearSolicitud({ id: "s", tenantId: "t", codigo: "S", titulo: "T", origen: origen(), prioridad: "alta", lineas: [], workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA }).ok).toBe(false);
    expect(crearSolicitud({ id: "s", tenantId: "t", codigo: "S", titulo: "T", origen: origen(), prioridad: "alta", lineas: [linea(1), linea(1)], workflow: WF, estadoInicial: "borrador", actorId: "u", ahora: AHORA }).ok).toBe(false);
  });
});

describe("transiciones neutras", () => {
  it("borrador → enviada → aprobada → cerrada", () => {
    const enviar = aplicarAccionSolicitud(sol("borrador"), "enviar", "u", AHORA);
    expect(enviar.ok && enviar.value.solicitud.estado === "enviada").toBe(true);
    const aprobar = aplicarAccionSolicitud(sol("enviada"), "aprobar", "u", AHORA);
    expect(aprobar.ok && aprobar.value.solicitud.estado === "aprobada").toBe(true);
    const cerrar = aplicarAccionSolicitud(sol("aprobada"), "cerrar", "u", AHORA);
    expect(cerrar.ok && cerrar.value.solicitud.estado === "cerrada").toBe(true);
  });

  it("incrementa la versión en cada transición", () => {
    const r = aplicarAccionSolicitud(sol("borrador"), "enviar", "u", AHORA);
    if (!r.ok) throw new Error("r");
    expect(r.value.solicitud.version).toBe(2);
  });

  it("rechaza acción no admisible desde el estado actual", () => {
    expect(aplicarAccionSolicitud(sol("borrador"), "aprobar", "u", AHORA).ok).toBe(false);
    expect(aplicarAccionSolicitud(sol("aprobada"), "enviar", "u", AHORA).ok).toBe(false);
  });

  it("estados terminales son inmutables", () => {
    expect(aplicarAccionSolicitud(sol("rechazada"), "cerrar", "u", AHORA).ok).toBe(false);
    expect(aplicarAccionSolicitud(sol("cerrada"), "enviar", "u", AHORA).ok).toBe(false);
  });

  it("rechazar exige motivo y lo persiste", () => {
    expect(aplicarAccionSolicitud(sol("enviada"), "rechazar", "u", AHORA).ok).toBe(false);
    const r = aplicarAccionSolicitud(sol("enviada"), "rechazar", "u", AHORA, { motivoRechazo: "presupuesto" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.solicitud.estado).toBe("rechazada");
    expect(r.value.solicitud.motivoRechazo).toBe("presupuesto");
  });
});
