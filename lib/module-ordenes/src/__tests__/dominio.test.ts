/**
 * DGP-009.1 · Pruebas de dominio puro: aggregate, eventos autosuficientes,
 * máquina de estados declarativa (+ estados tenant) y policies.
 */
import { describe, expect, it } from "vitest";
import { validarWorkflow } from "@workspace/workflow-engine";
import {
  agregarEvidencia,
  aplicarEstado,
  crearOrden,
  DEFINICION_WORKFLOW_ORDEN,
  editarOrden,
  ESTADO_INICIAL,
  ESTADOS,
  estadoDeNegocio,
  firmaExtension,
  type ExtensionMaquina,
  ORDEN_CREADA,
  policiesDelModulo,
  POLICY_PUEDE_EDITAR,
  POLICY_PUEDE_EJECUTAR,
  WF_EN_EJECUCION,
} from "..";

const AHORA = new Date("2026-01-01T00:00:00Z");
const codigo = { valor: "OT-000001", prefijo: "OT", secuencia: 1 } as const;
const workflow = { definicion: "ciclo-item", instanciaId: null, version: 1 } as const;

function nueva() {
  const r = crearOrden({
    id: "o1", tenantId: "t1", codigo, titulo: "OT demo", tipo: "correctiva",
    workflow, actorId: "u1", maxLongitudTitulo: 160, ahora: AHORA,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value.orden;
}

describe("aggregate OrdenTrabajo", () => {
  it("crea en estado inicial BORRADOR con evento autosuficiente", () => {
    const r = crearOrden({
      id: "o1", tenantId: "t1", codigo, titulo: "OT demo", tipo: "correctiva",
      workflow, actorId: "u1", maxLongitudTitulo: 160, ahora: AHORA,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.orden.estado).toBe(ESTADO_INICIAL);
    expect(r.value.evento.tipo).toBe(ORDEN_CREADA);
    // Payload autosuficiente: snapshot completo + metadatos.
    const p = r.value.evento.payload;
    expect(p["tenantId"]).toBe("t1");
    expect(p["id"]).toBe("o1");
    expect(p["estado"]).toBe("BORRADOR");
    expect(p["version"]).toBe(1);
    expect(p["codigo"]).toEqual(codigo);
    expect(p["actualizadoAt"]).toBeTypeOf("string");
  });

  it("rechaza título vacío o excesivo", () => {
    const vacio = crearOrden({ id: "o1", tenantId: "t1", codigo, titulo: "  ", tipo: "x", workflow, actorId: "u1", maxLongitudTitulo: 160, ahora: AHORA });
    expect(vacio.ok).toBe(false);
    const largo = crearOrden({ id: "o1", tenantId: "t1", codigo, titulo: "x".repeat(5), tipo: "x", workflow, actorId: "u1", maxLongitudTitulo: 3, ahora: AHORA });
    expect(largo.ok).toBe(false);
  });

  it("editar incrementa versión y conserva inmutabilidad del original", () => {
    const o = nueva();
    const r = editarOrden(o, { titulo: "OT editada" }, "u1", 160, AHORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.orden.version).toBe(2);
    expect(o.titulo).toBe("OT demo"); // original intacto
    expect(r.value.orden.titulo).toBe("OT editada");
  });

  it("aplicarEstado refleja el estado del motor y sella fechas de ciclo", () => {
    const o = nueva();
    const c = aplicarEstado(o, "EN_EJECUCION", "inst-1", "u1", AHORA);
    expect(c.orden.estado).toBe("EN_EJECUCION");
    expect(c.orden.workflow.instanciaId).toBe("inst-1");
    expect(c.orden.fechas.inicio).toBeTypeOf("string");
  });

  it("agregarEvidencia es idempotente por attachmentId", () => {
    const o = nueva();
    const ev = { attachmentId: "att1", nombreArchivo: "f.jpg", mimeType: "image/jpeg", tamanoBytes: 1, hashSha256: "a".repeat(64), rol: undefined } as never;
    const c1 = agregarEvidencia(o, ev, "u1", AHORA);
    expect(c1.ok).toBe(true);
    if (!c1.ok) return;
    expect(c1.value.orden.evidencias.length).toBe(1);
    const c2 = agregarEvidencia(c1.value.orden, ev, "u1", AHORA);
    expect(c2.ok).toBe(true);
    if (!c2.ok) return;
    expect(c2.value.orden.evidencias.length).toBe(1); // no duplica
  });
});

describe("máquina de estados declarativa", () => {
  it("declara los 9 estados de negocio canónicos", () => {
    expect(ESTADOS.length).toBe(9);
    expect(ESTADOS).toContain("EN_VALIDACION");
    expect(ESTADOS).toContain("CANCELADA");
  });

  it("la definición de workflow es NEUTRA y válida para el motor DGP-007", () => {
    const val = validarWorkflow(DEFINICION_WORKFLOW_ORDEN);
    expect(val.valido, JSON.stringify(val.errores)).toBe(true);
  });

  it("traduce estados neutros canónicos del motor a estados de negocio", () => {
    const eje = estadoDeNegocio(WF_EN_EJECUCION);
    expect(eje.ok && eje.value).toBe("EN_EJECUCION");
    const can = estadoDeNegocio("cancelado");
    expect(can.ok && can.value).toBe("CANCELADA");
  });

  it("un estado NO declarado produce ERROR explícito (sin fallback a BORRADOR)", () => {
    const r = estadoDeNegocio("desconocido");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("no declarado");
  });

  it("refleja un estado EXTRA del tenant (enEspera) correctamente, no como BORRADOR", () => {
    const r = estadoDeNegocio("enEspera", ["enEspera"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("EN_ESPERA");
  });

  it("admite estados extra definidos por el tenant (definición extendida válida)", () => {
    const extendida = {
      ...DEFINICION_WORKFLOW_ORDEN,
      estados: [
        ...DEFINICION_WORKFLOW_ORDEN.estados,
        { nombre: "enEspera", etiqueta: "En espera de repuesto" },
      ],
      transiciones: [
        ...DEFINICION_WORKFLOW_ORDEN.transiciones,
        { de: "enEjecucion", a: "enEspera", comando: "esperarRepuesto", permiso: "modulo.ordenes.operar" },
        { de: "enEspera", a: "enEjecucion", comando: "recibirRepuesto", permiso: "modulo.ordenes.operar" },
      ],
    };
    const val = validarWorkflow(extendida);
    expect(val.valido, JSON.stringify(val.errores)).toBe(true);
  });
});

describe("firmaExtension · serialización canónica COMPLETA", () => {
  const base: ExtensionMaquina = {
    estados: [{ nombre: "enEspera", etiqueta: "En espera", final: false }],
    transiciones: [{ de: "enEjecucion", comando: "ponerEnEspera", hacia: "enEspera", permiso: "modulo.ordenes.operar" }],
  };

  it("la extensión vacía tiene firma estable (idempotencia de tenants sin extensión)", () => {
    expect(firmaExtension()).toBe(firmaExtension({ estados: [], transiciones: [] }));
  });

  it("es determinista e INDEPENDIENTE del orden de estados/transiciones", () => {
    const a: ExtensionMaquina = {
      estados: [
        { nombre: "enEspera", etiqueta: "En espera" },
        { nombre: "enRevision", etiqueta: "En revisión" },
      ],
      transiciones: [
        { de: "enEjecucion", comando: "ponerEnEspera", hacia: "enEspera" },
        { de: "enEjecucion", comando: "revisar", hacia: "enRevision" },
      ],
    };
    const b: ExtensionMaquina = {
      estados: [
        { nombre: "enRevision", etiqueta: "En revisión" },
        { nombre: "enEspera", etiqueta: "En espera" },
      ],
      transiciones: [
        { de: "enEjecucion", comando: "revisar", hacia: "enRevision" },
        { de: "enEjecucion", comando: "ponerEnEspera", hacia: "enEspera" },
      ],
    };
    expect(firmaExtension(a)).toBe(firmaExtension(b));
  });

  it("CAMBIA cuando cambia el PERMISO de una transición (campo semántico crítico)", () => {
    const conNuevoPermiso: ExtensionMaquina = {
      ...base,
      transiciones: [{ ...base.transiciones[0]!, permiso: "modulo.ordenes.espera" }],
    };
    expect(firmaExtension(conNuevoPermiso)).not.toBe(firmaExtension(base));
  });

  it("CAMBIA cuando cambia la ETIQUETA de un estado", () => {
    const conNuevaEtiqueta: ExtensionMaquina = {
      ...base,
      estados: [{ ...base.estados[0]!, etiqueta: "Otra etiqueta" }],
    };
    expect(firmaExtension(conNuevaEtiqueta)).not.toBe(firmaExtension(base));
  });

  it("CAMBIA cuando cambia `final` de un estado", () => {
    const conFinal: ExtensionMaquina = {
      ...base,
      estados: [{ ...base.estados[0]!, final: true }],
    };
    expect(firmaExtension(conFinal)).not.toBe(firmaExtension(base));
  });
});

describe("policies de dominio", () => {
  const policies = new Map(policiesDelModulo().map((p) => [p.name, p]));

  it("no permite editar una OT en estado final", () => {
    const p = policies.get(POLICY_PUEDE_EDITAR)!;
    expect(p.evaluate(null, { estado: "CERRADA" }).allow).toBe(false);
    expect(p.evaluate(null, { estado: "ABIERTA" }).allow).toBe(true);
  });

  it("edición solo-borrador por configuración", () => {
    const p = policies.get(POLICY_PUEDE_EDITAR)!;
    expect(p.evaluate(null, { estado: "ABIERTA", soloBorrador: true }).allow).toBe(false);
    expect(p.evaluate(null, { estado: "BORRADOR", soloBorrador: true }).allow).toBe(true);
  });

  it("ejecución solo en estados operativos", () => {
    const p = policies.get(POLICY_PUEDE_EJECUTAR)!;
    expect(p.evaluate(null, { estado: "EN_EJECUCION" }).allow).toBe(true);
    expect(p.evaluate(null, { estado: "BORRADOR" }).allow).toBe(false);
  });
});
