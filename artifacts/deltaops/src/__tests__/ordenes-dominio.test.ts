/**
 * DGP-009.3 · Pruebas de lógica pura del módulo de Órdenes:
 * transiciones de presentación, predicados de bandeja y construcción del input
 * de creación desde los valores del formulario.
 */
import { describe, it, expect } from "vitest";
import {
  TRANSICIONES,
  CMD,
  ESTADOS,
  ETIQUETA_ESTADO,
  TONO_ESTADO,
  BANDEJAS,
  ACCIONES_BITACORA,
} from "../lib/ordenes/constantes";
import { construirInput } from "../lib/ordenes/alta";
import { esCritica, proximaAVencer, vencimientoSla } from "../lib/ordenes/componentes";
import type { OrdenRow } from "../lib/ordenes/tipos";

function orden(parcial: Partial<OrdenRow>): OrdenRow {
  return {
    tenantId: "deltaops",
    id: "o1",
    codigo: "OT-1",
    titulo: "T",
    estado: "ABIERTA",
    tipo: "correctiva",
    categoria: null,
    prioridad: null,
    severidad: null,
    responsable: null,
    supervisor: null,
    activoPrincipalId: null,
    ubicacionId: null,
    datos: {},
    version: 1,
    lastEventId: "e1",
    actualizadoAt: "2024-01-01T00:00:00Z",
    ...parcial,
  };
}

describe("transiciones de presentación", () => {
  it("todos los estados no finales ofrecen cancelar", () => {
    for (const e of ["BORRADOR", "ABIERTA", "PLANIFICADA", "ASIGNADA", "EN_EJECUCION", "PAUSADA"]) {
      const cmds = (TRANSICIONES[e] ?? []).map((t) => t.comando);
      expect(cmds).toContain(CMD.cancelar);
    }
  });

  it("EN_EJECUCION permite pausar y enviar a validación", () => {
    const cmds = TRANSICIONES.EN_EJECUCION.map((t) => t.comando);
    expect(cmds).toContain(CMD.pausar);
    expect(cmds).toContain(CMD.enviarValidacion);
  });

  it("EN_VALIDACION exige validación para cerrar/devolver", () => {
    for (const t of TRANSICIONES.EN_VALIDACION) expect(t.requiereValidacion).toBe(true);
  });

  it("los estados finales no tienen transiciones", () => {
    expect(TRANSICIONES.CERRADA).toBeUndefined();
    expect(TRANSICIONES.CANCELADA).toBeUndefined();
  });

  it("cada estado tiene etiqueta y tono", () => {
    for (const e of ESTADOS) {
      expect(ETIQUETA_ESTADO[e]).toBeTruthy();
      expect(TONO_ESTADO[e]).toBeTruthy();
    }
  });
});

describe("bandejas", () => {
  it("define las 10 bandejas requeridas", () => {
    const ids = BANDEJAS.map((b) => b.id);
    expect(ids).toEqual([
      "mis", "pendientes", "nuevas", "ejecucion", "espera",
      "validacion", "vencer", "criticas", "canceladas", "cerradas",
    ]);
  });
  it("bitácora expone las 8 acciones canónicas", () => {
    expect(ACCIONES_BITACORA).toHaveLength(8);
  });
});

describe("predicados", () => {
  it("esCritica detecta prioridad/severidad alta", () => {
    expect(esCritica(orden({ prioridad: "alta" }))).toBe(true);
    expect(esCritica(orden({ severidad: "critica" }))).toBe(true);
    expect(esCritica(orden({ prioridad: "baja" }))).toBe(false);
  });

  it("vencimientoSla lee del read model", () => {
    const o = orden({ datos: { sla: { vencimiento: "2024-06-01T00:00:00Z" } } });
    expect(vencimientoSla(o)).toBe("2024-06-01T00:00:00Z");
    expect(vencimientoSla(orden({}))).toBeNull();
  });

  it("proximaAVencer respeta la ventana", () => {
    const ahora = Date.parse("2024-06-01T00:00:00Z");
    const dentro = orden({ datos: { sla: { vencimiento: "2024-06-02T00:00:00Z" } } });
    const fuera = orden({ datos: { sla: { vencimiento: "2024-06-10T00:00:00Z" } } });
    expect(proximaAVencer(dentro, ahora, 48)).toBe(true);
    expect(proximaAVencer(fuera, ahora, 48)).toBe(false);
  });
});

describe("construirInput (alta)", () => {
  it("incluye sólo campos con valor y arma activo/ubicación", () => {
    const input = construirInput({
      titulo: "Cambiar filtro",
      tipo: "correctiva",
      categoria: "",
      activoId: "A-1",
      activoEtiqueta: "Bomba 1",
      ubicacionId: "U-1",
      inicioPlanificado: "2024-06-01T09:00Z",
    });
    expect(input.titulo).toBe("Cambiar filtro");
    expect(input.tipo).toBe("correctiva");
    expect(input).not.toHaveProperty("categoria");
    expect(input.activoPrincipal).toMatchObject({ activoId: "A-1", etiqueta: "Bomba 1", rol: "principal" });
    expect(input.ubicacion).toMatchObject({ ubicacionId: "U-1" });
    expect((input.datos as Record<string, unknown>).inicioPlanificado).toBe("2024-06-01T09:00Z");
  });

  it("omite datos vacíos", () => {
    const input = construirInput({ titulo: "x", tipo: "y" });
    expect(input).not.toHaveProperty("datos");
    expect(input).not.toHaveProperty("activoPrincipal");
  });
});
