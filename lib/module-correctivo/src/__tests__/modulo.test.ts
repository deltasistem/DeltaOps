/**
 * DGP-015 · Pruebas de MÓDULO (end-to-end, ETAPA 1 — DOMINIO): comandos
 * gobernados, fallo-seguro del Workflow (sin adaptador → conflicto), catálogos
 * con semántica canónica, diagnóstico anclado a Dynamic Forms, anti-duplicado e
 * idempotencia de la OT correctiva, disponibilidad de inventario → auto-solicitud
 * de compra, consumo parcial / devolución, reincidencias por ventana,
 * intervención mayor multi-cuadrilla, policies, recibos e idempotencia por opId.
 *
 * NO toca persistencia real: todo se ejerce con FAKES en memoria vía el runtime
 * de pruebas (`crearCorrectivoRuntime`).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MODULO,
  crearCorrectivoRuntime,
  ActivosPruebaFaltantes,
  ActivosPruebaComponentes,
  DynamicFormsPruebaNoPublicada,
  MaterializadorPrueba,
  InventarioPrueba,
  AbastecimientoPrueba,
  WorkflowPruebaRechazo,
  WorkflowPruebaRechazoTransicion,
  WorkflowPruebaRechazoMaterializar,
  WorkflowPruebaSinGeneracion,
  type CorrectivoRuntime,
} from "..";

const TENANT = "t-correctivo";
let rt: CorrectivoRuntime;

async function exec(nombre: string, input: Record<string, unknown>) {
  const r = await rt.platform.kernel.commands.execute(rt.ctx(TENANT), nombre, input);
  await rt.platform.kernel.outboxProcessor.processPending();
  return r;
}
async function query(nombre: string, input: Record<string, unknown> = {}) {
  return rt.platform.kernel.queries.execute(rt.ctx(TENANT), nombre, input);
}

/* ----------------------------- Helpers de flujo -------------------------- */
const OBJETO = { activoId: "act-1" };

async function crearSolicitud(extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-solicitud`, {
    titulo: "Bomba con fuga", origen: "operador", prioridad: "alta",
    objeto: OBJETO, sintomas: [{ texto: "goteo constante" }], ...extra,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; estado: string; version: number };
}

/** Lleva la solicitud hasta `aprobada` recorriendo el ciclo neutro gobernado. */
async function aprobarSolicitud(id: string, version: number): Promise<number> {
  const pasos = ["enviarTriage", "iniciarDiagnostico", "enviarValidacion", "aprobar"];
  let v = version;
  for (const accion of pasos) {
    const r = await exec(`${MODULO}.transicionar-solicitud`, { id, accion, expectedVersion: v });
    if (!r.ok) throw new Error(`${accion}: ${r.error.message}`);
    v = (r.value as { version: number }).version;
  }
  return v;
}

async function generarOrden(solicitudId: string, extra: Record<string, unknown> = {}) {
  return exec(`${MODULO}.generar-orden-correctiva`, { solicitudId, ...extra });
}

async function crearIntervencion(solicitudId: string, ordenTrabajoId: string, extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-intervencion`, { solicitudId, ordenTrabajoId, ...extra });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; mayor: boolean; estado: string; version: number };
}

const CUADRILLA_A = { cuadrillaId: "cua-1", responsables: [{ responsableId: "u1", rol: "tecnico" }], recursos: [] };
const CUADRILLA_B = { cuadrillaId: "cua-2", responsables: [{ responsableId: "u2", rol: "especialista" }], recursos: [] };

/* ========================================================================= */
describe("crear-solicitud", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime(); });

  it("crea con código consecutivo y estado inicial de registro", async () => {
    const s = await crearSolicitud();
    expect(s.codigo).toMatch(/-/);
    expect(s.estado).toBe("registro");
    expect(s.version).toBe(1);
  });
  it("es idempotente por opId", async () => {
    const r1 = await exec(`${MODULO}.crear-solicitud`, { opId: "op-c1", titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    const r2 = await exec(`${MODULO}.crear-solicitud`, { opId: "op-c1", titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
      expect((r1.value as { id: string }).id).toBe((r2.value as { id: string }).id);
    }
  });
  it("dos solicitudes reciben consecutivos distintos", async () => {
    const a = await crearSolicitud();
    const b = await crearSolicitud();
    expect(a.codigo).not.toBe(b.codigo);
    expect(a.id).not.toBe(b.id);
  });
  it("rechaza origen fuera del catálogo canónico", async () => {
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "inexistente-xyz", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("rechaza prioridad fuera del catálogo canónico", async () => {
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "urgentisima", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("acepta criticidad canónica opcional", async () => {
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", criticidad: "critica", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(true);
  });
  it("rechaza criticidad no canónica", async () => {
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", criticidad: "hipercritica", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("exige al menos un síntoma", async () => {
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [] });
    expect(r.ok).toBe(false);
  });
  it("falla-seguro: sin ActivosPort configurado → conflicto", async () => {
    rt = crearCorrectivoRuntime({ activos: null });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("rechaza activo inexistente (composición fail-safe)", async () => {
    rt = crearCorrectivoRuntime({ activos: new ActivosPruebaFaltantes(["act-1"]) });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("rechaza componente inexistente", async () => {
    rt = crearCorrectivoRuntime({ activos: new ActivosPruebaFaltantes(["comp-x"]) });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", objeto: { activoId: "act-1", componenteId: "comp-x" }, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("falla-seguro: SIN Workflow → conflicto (gobierno)", async () => {
    rt = crearCorrectivoRuntime({ workflow: null });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("gobierno: Workflow que rechaza apertura → sin efecto", async () => {
    rt = crearCorrectivoRuntime({ workflow: new WorkflowPruebaRechazo() });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("acepta clasificación canónica completa", async () => {
    const r = await exec(`${MODULO}.crear-solicitud`, {
      titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }],
      clasificacion: { tipoFalla: "mecanica", modoFalla: "fuga", causa: "falta-mantenimiento", efecto: "parada-parcial", severidad: "grave", impacto: "produccion" },
    });
    expect(r.ok).toBe(true);
  });
  it("rechaza modoFalla no canónico en la clasificación", async () => {
    const r = await exec(`${MODULO}.crear-solicitud`, {
      titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }],
      clasificacion: { modoFalla: "explosion-inventada" },
    });
    expect(r.ok).toBe(false);
  });
});

/* ========================================================================= */
describe("editar / adjuntar / comentar solicitud", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime(); });

  it("edita título con expectedVersion correcto", async () => {
    const s = await crearSolicitud();
    const r = await exec(`${MODULO}.editar-solicitud`, { id: s.id, expectedVersion: s.version, titulo: "Nuevo título" });
    expect(r.ok).toBe(true);
  });
  it("rechaza edición con expectedVersion desfasado (OCC)", async () => {
    const s = await crearSolicitud();
    const r = await exec(`${MODULO}.editar-solicitud`, { id: s.id, expectedVersion: 999, titulo: "X" });
    expect(r.ok).toBe(false);
  });
  it("no edita una solicitud aprobada (policy inmutable)", async () => {
    const s = await crearSolicitud();
    const v = await aprobarSolicitud(s.id, s.version);
    const r = await exec(`${MODULO}.editar-solicitud`, { id: s.id, expectedVersion: v, titulo: "X" });
    expect(r.ok).toBe(false);
  });
  it("adjunta evidencia por referencia (attachmentId)", async () => {
    const s = await crearSolicitud();
    const r = await exec(`${MODULO}.adjuntar-evidencia`, { id: s.id, expectedVersion: s.version, evidencia: { attachmentId: "att-1", tipo: "foto" } });
    expect(r.ok).toBe(true);
  });
  it("registra un comentario en la solicitud", async () => {
    const s = await crearSolicitud();
    const r = await exec(`${MODULO}.comentar-solicitud`, { id: s.id, comentarioId: "cmt-1", texto: "Revisar sello" });
    expect(r.ok).toBe(true);
  });
});

/* ========================================================================= */
describe("transicionar-solicitud (ciclo neutro gobernado)", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime(); });

  it("recorre registro → triage → diagnostico → validacion → aprobada", async () => {
    const s = await crearSolicitud();
    const v = await aprobarSolicitud(s.id, s.version);
    const det = await query(`${MODULO}.solicitud-detalle`, { id: s.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { estado: string }).estado).toBe("aprobada");
    expect(v).toBeGreaterThan(s.version);
  });
  it("permite rechazar desde triage", async () => {
    const s = await crearSolicitud();
    const t = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviarTriage", expectedVersion: s.version });
    expect(t.ok).toBe(true);
    if (t.ok) {
      const r = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "rechazar", expectedVersion: (t.value as { version: number }).version });
      expect(r.ok).toBe(true);
    }
  });
  it("rechaza transición inválida desde registro (aprobar directo)", async () => {
    const s = await crearSolicitud();
    const r = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "aprobar", expectedVersion: s.version });
    expect(r.ok).toBe(false);
  });
  it("no transiciona una solicitud ya aprobada (terminal)", async () => {
    const s = await crearSolicitud();
    const v = await aprobarSolicitud(s.id, s.version);
    const r = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "rechazar", expectedVersion: v });
    expect(r.ok).toBe(false);
  });
  it("gobierno: Workflow que rechaza transición → sin cambio de estado", async () => {
    rt = crearCorrectivoRuntime({ workflow: new WorkflowPruebaRechazoTransicion() });
    const s = await crearSolicitud();
    const r = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviarTriage", expectedVersion: s.version });
    expect(r.ok).toBe(false);
  });
  it("transicionar es idempotente por opId", async () => {
    const s = await crearSolicitud();
    const r1 = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviarTriage", expectedVersion: s.version, opId: "tr-1" });
    const r2 = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviarTriage", expectedVersion: s.version, opId: "tr-1" });
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
});

/* ========================================================================= */
describe("registrar-diagnostico (anclado a Dynamic Forms)", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime(); });

  async function enDiagnostico() {
    const s = await crearSolicitud();
    const t = await exec(`${MODULO}.transicionar-solicitud`, { id: s.id, accion: "enviarTriage", expectedVersion: s.version });
    if (!t.ok) throw new Error(t.error.message);
    return { id: s.id, version: (t.value as { version: number }).version };
  }

  it("registra diagnóstico con plantilla publicada y ancla en la solicitud", async () => {
    const s = await enDiagnostico();
    const r = await exec(`${MODULO}.registrar-diagnostico`, {
      solicitudId: s.id, expectedVersion: s.version,
      plantilla: { plantillaId: "df-diag", version: 1 }, respuestas: { p1: "ok" },
      causaEncontrada: "falta-mantenimiento", clasificacion: { modoFalla: "fuga" },
    });
    expect(r.ok).toBe(true);
  });
  it("falla-seguro: sin DynamicFormsPort → conflicto", async () => {
    rt = crearCorrectivoRuntime({ dynamicForms: null });
    const s = await enDiagnostico();
    const r = await exec(`${MODULO}.registrar-diagnostico`, { solicitudId: s.id, expectedVersion: s.version, plantilla: { plantillaId: "df-diag", version: 1 } });
    expect(r.ok).toBe(false);
  });
  it("rechaza plantilla NO publicada", async () => {
    rt = crearCorrectivoRuntime({ dynamicForms: new DynamicFormsPruebaNoPublicada() });
    const s = await enDiagnostico();
    const r = await exec(`${MODULO}.registrar-diagnostico`, { solicitudId: s.id, expectedVersion: s.version, plantilla: { plantillaId: "df-diag", version: 1 } });
    expect(r.ok).toBe(false);
  });
  it("policy: no diagnostica en estado registro", async () => {
    const s = await crearSolicitud();
    const r = await exec(`${MODULO}.registrar-diagnostico`, { solicitudId: s.id, expectedVersion: s.version, plantilla: { plantillaId: "df-diag", version: 1 } });
    expect(r.ok).toBe(false);
  });
  it("rechaza diagnóstico sobre solicitud inexistente", async () => {
    const r = await exec(`${MODULO}.registrar-diagnostico`, { solicitudId: "no-existe", expectedVersion: 1, plantilla: { plantillaId: "df-diag", version: 1 } });
    expect(r.ok).toBe(false);
  });
  it("es idempotente por opId", async () => {
    const s = await enDiagnostico();
    const base = { solicitudId: s.id, expectedVersion: s.version, plantilla: { plantillaId: "df-diag", version: 1 }, opId: "diag-1" };
    const r1 = await exec(`${MODULO}.registrar-diagnostico`, base);
    const r2 = await exec(`${MODULO}.registrar-diagnostico`, base);
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
});

/* ========================================================================= */
describe("generar-orden-correctiva (orquestación + anti-duplicado)", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime({ materializador: new MaterializadorPrueba() }); });

  async function solicitudAprobada() {
    const s = await crearSolicitud();
    await aprobarSolicitud(s.id, s.version);
    return s.id;
  }

  it("genera la OT canónica correctiva desde una solicitud aprobada", async () => {
    const id = await solicitudAprobada();
    const r = await generarOrden(id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { ordenTrabajoId: string }).ordenTrabajoId).toMatch(/^ot-/);
      expect((r.value as { idempotente: boolean }).idempotente).toBe(false);
    }
  });
  it("anti-duplicado: la segunda generación devuelve la misma OT (idempotente)", async () => {
    const id = await solicitudAprobada();
    const r1 = await generarOrden(id);
    const r2 = await generarOrden(id);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
      expect((r1.value as { ordenTrabajoId: string }).ordenTrabajoId).toBe((r2.value as { ordenTrabajoId: string }).ordenTrabajoId);
    }
  });
  it("policy: no genera OT desde una solicitud no aprobada", async () => {
    const s = await crearSolicitud();
    const r = await generarOrden(s.id);
    expect(r.ok).toBe(false);
  });
  it("falla-seguro: sin MaterializadorOrdenes → conflicto (jamás OT por vías no oficiales)", async () => {
    rt = crearCorrectivoRuntime({ materializador: null });
    const id = await solicitudAprobada();
    const r = await generarOrden(id);
    expect(r.ok).toBe(false);
  });
  it("rechaza generación sobre solicitud inexistente", async () => {
    const r = await generarOrden("no-existe");
    expect(r.ok).toBe(false);
  });
  it("es idempotente por opId explícito", async () => {
    const id = await solicitudAprobada();
    const r1 = await generarOrden(id, { opId: "gen-1" });
    const r2 = await generarOrden(id, { opId: "gen-1" });
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
  it("gobierno: flujo feliz deja la generación en estado 'materializada'", async () => {
    const id = await solicitudAprobada();
    const r = await generarOrden(id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { estado: string }).estado).toBe("materializada");
  });
  it("gobierno: SIN workflow de generación configurado ⇒ rechazo sin OT", async () => {
    // El motor no gobierna la apertura de la generación ⇒ fallo seguro, sin OT.
    const mat = new MaterializadorPrueba();
    rt = crearCorrectivoRuntime({ materializador: mat, workflow: new WorkflowPruebaSinGeneracion() });
    const s = await crearSolicitud();
    await aprobarSolicitud(s.id, s.version);
    const r = await generarOrden(s.id);
    expect(r.ok).toBe(false);
    expect(mat.creadas).toBe(0);
  });
  it("gobierno: transición 'materializar' DENEGADA ⇒ ni OT ni vínculo", async () => {
    const mat = new MaterializadorPrueba();
    rt = crearCorrectivoRuntime({ materializador: mat, workflow: new WorkflowPruebaRechazoMaterializar() });
    const s = await crearSolicitud();
    const v = await aprobarSolicitud(s.id, s.version);
    expect(v).toBeGreaterThan(s.version);
    const r = await generarOrden(s.id);
    // El motor deniega la transición ANTES de crear la OT: sin efecto observable
    // (ni OT materializada ni vínculo generación→OT).
    expect(r.ok).toBe(false);
    expect(mat.creadas).toBe(0);
  });
  it("gobierno: idempotencia intacta tras materializar gobernado", async () => {
    const id = await solicitudAprobada();
    const r1 = await generarOrden(id, { opId: "gen-gob" });
    const r2 = await generarOrden(id, { opId: "gen-gob" });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
      expect((r1.value as { ordenTrabajoId: string }).ordenTrabajoId).toBe((r2.value as { ordenTrabajoId: string }).ordenTrabajoId);
      expect((r2.value as { estado: string }).estado).toBe("materializada");
    }
  });
});

/* ========================================================================= */
describe("validación de componentes (contrato real de Activos)", () => {
  const OBJETO_COMP = (componenteId: string) => ({ activoId: "act-1", componenteId });
  async function crearConComponente(componenteId: string) {
    return exec(`${MODULO}.crear-solicitud`, {
      titulo: "Falla en componente", origen: "operador", prioridad: "alta",
      objeto: OBJETO_COMP(componenteId), sintomas: [{ texto: "ruido" }],
    });
  }

  it("acepta un componente que PERTENECE al activo", async () => {
    rt = crearCorrectivoRuntime({ activos: new ActivosPruebaComponentes({ "act-1": ["comp-a", "comp-b"] }) });
    const r = await crearConComponente("comp-a");
    expect(r.ok).toBe(true);
  });
  it("rechaza un componente INEXISTENTE", async () => {
    rt = crearCorrectivoRuntime({ activos: new ActivosPruebaComponentes({ "act-1": ["comp-a"] }) });
    const r = await crearConComponente("comp-fantasma");
    expect(r.ok).toBe(false);
  });
  it("rechaza un componente que pertenece a OTRO activo", async () => {
    // comp-x existe pero bajo act-2, no bajo el contenedor act-1 ⇒ rechazo.
    rt = crearCorrectivoRuntime({ activos: new ActivosPruebaComponentes({ "act-1": ["comp-a"], "act-2": ["comp-x"] }) });
    const r = await crearConComponente("comp-x");
    expect(r.ok).toBe(false);
  });
});

/* ========================================================================= */
describe("intervención (mayor multi-cuadrilla + asignación + ciclo)", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime({ materializador: new MaterializadorPrueba() }); });

  async function conOrden() {
    const s = await crearSolicitud();
    await aprobarSolicitud(s.id, s.version);
    const g = await generarOrden(s.id);
    if (!g.ok) throw new Error(g.error.message);
    return { solicitudId: s.id, ordenTrabajoId: (g.value as { ordenTrabajoId: string }).ordenTrabajoId };
  }

  it("crea intervención simple (una cuadrilla) → NO mayor", async () => {
    const { solicitudId, ordenTrabajoId } = await conOrden();
    const iv = await crearIntervencion(solicitudId, ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    expect(iv.mayor).toBe(false);
    expect(iv.estado).toBe("preparacion");
  });
  it("crea intervención MAYOR (multi-cuadrilla) → mayor=true", async () => {
    const { solicitudId, ordenTrabajoId } = await conOrden();
    const iv = await crearIntervencion(solicitudId, ordenTrabajoId, { cuadrillas: [CUADRILLA_A, CUADRILLA_B] });
    expect(iv.mayor).toBe(true);
  });
  it("rechaza rol de cuadrilla fuera del catálogo", async () => {
    const { solicitudId, ordenTrabajoId } = await conOrden();
    const r = await exec(`${MODULO}.crear-intervencion`, { solicitudId, ordenTrabajoId, cuadrillas: [{ cuadrillaId: "c", responsables: [{ responsableId: "u", rol: "brujo" }], recursos: [] }] });
    expect(r.ok).toBe(false);
  });
  it("asigna cuadrillas adicionales y marca mayor", async () => {
    const { solicitudId, ordenTrabajoId } = await conOrden();
    const iv = await crearIntervencion(solicitudId, ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    const r = await exec(`${MODULO}.asignar-cuadrillas`, { id: iv.id, expectedVersion: iv.version, cuadrillas: [CUADRILLA_A, CUADRILLA_B] });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { mayor: boolean }).mayor).toBe(true);
  });
  it("recorre preparacion → asignacion → ejecucion → verificacion → cerrada", async () => {
    const { solicitudId, ordenTrabajoId } = await conOrden();
    const iv = await crearIntervencion(solicitudId, ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    let v = iv.version;
    for (const accion of ["asignar", "iniciarEjecucion", "enviarVerificacion", "cerrar"]) {
      const r = await exec(`${MODULO}.transicionar-intervencion`, { id: iv.id, accion, expectedVersion: v });
      expect(r.ok).toBe(true);
      if (r.ok) v = (r.value as { version: number }).version;
    }
    const det = await query(`${MODULO}.intervencion-detalle`, { id: iv.id });
    if (det.ok) expect((det.value as { estado: string }).estado).toBe("cerrada");
  });
  it("no asigna sobre una intervención cerrada (policy)", async () => {
    const { solicitudId, ordenTrabajoId } = await conOrden();
    const iv = await crearIntervencion(solicitudId, ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    let v = iv.version;
    for (const accion of ["asignar", "iniciarEjecucion", "enviarVerificacion", "cerrar"]) {
      const r = await exec(`${MODULO}.transicionar-intervencion`, { id: iv.id, accion, expectedVersion: v });
      if (r.ok) v = (r.value as { version: number }).version;
    }
    const r = await exec(`${MODULO}.asignar-cuadrillas`, { id: iv.id, expectedVersion: v, cuadrillas: [CUADRILLA_B] });
    expect(r.ok).toBe(false);
  });
  it("rechaza intervención sobre solicitud inexistente", async () => {
    const r = await exec(`${MODULO}.crear-intervencion`, { solicitudId: "no-existe", ordenTrabajoId: "ot-x", cuadrillas: [CUADRILLA_A] });
    expect(r.ok).toBe(false);
  });
});

/* ========================================================================= */
describe("repuestos: disponibilidad → auto compra / consumo parcial / devolución", () => {
  async function intervencionEnEjecucion(stock: Record<string, number>) {
    rt = crearCorrectivoRuntime({
      materializador: new MaterializadorPrueba(),
      inventario: new InventarioPrueba(stock),
      abastecimiento: new AbastecimientoPrueba(),
    });
    const s = await crearSolicitud();
    await aprobarSolicitud(s.id, s.version);
    const g = await generarOrden(s.id);
    if (!g.ok) throw new Error(g.error.message);
    const iv = await crearIntervencion(s.id, (g.value as { ordenTrabajoId: string }).ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    // preparacion → asignacion (habilita consumo).
    const t = await exec(`${MODULO}.transicionar-intervencion`, { id: iv.id, accion: "asignar", expectedVersion: iv.version });
    if (!t.ok) throw new Error(t.error.message);
    return iv.id;
  }

  it("reserva las líneas disponibles cuando hay stock suficiente", async () => {
    const id = await intervencionEnEjecucion({ "inv-1": 10 });
    const r = await exec(`${MODULO}.reservar-repuestos`, { intervencionId: id, lineas: [{ inventarioId: "inv-1", articuloId: "art-1", cantidad: 3, unidad: "pieza" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { reservadas: number }).reservadas).toBe(1);
      expect((r.value as { faltantes: number }).faltantes).toBe(0);
      expect((r.value as { solicitudCompraId: string | null }).solicitudCompraId).toBeNull();
    }
  });
  it("ante faltante genera auto-solicitud de compra (Abastecimiento)", async () => {
    const id = await intervencionEnEjecucion({ "inv-1": 1 });
    const r = await exec(`${MODULO}.reservar-repuestos`, { intervencionId: id, lineas: [{ inventarioId: "inv-1", articuloId: "art-1", cantidad: 5, unidad: "pieza" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { faltantes: number }).faltantes).toBe(1);
      expect((r.value as { solicitudCompraId: string | null }).solicitudCompraId).toMatch(/^sc-/);
    }
  });
  it("falla-seguro: reservar sin InventarioPort → conflicto", async () => {
    rt = crearCorrectivoRuntime({ materializador: new MaterializadorPrueba() });
    const s = await crearSolicitud();
    await aprobarSolicitud(s.id, s.version);
    const g = await generarOrden(s.id);
    if (!g.ok) throw new Error(g.error.message);
    const iv = await crearIntervencion(s.id, (g.value as { ordenTrabajoId: string }).ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    await exec(`${MODULO}.transicionar-intervencion`, { id: iv.id, accion: "asignar", expectedVersion: iv.version });
    const r = await exec(`${MODULO}.reservar-repuestos`, { intervencionId: iv.id, lineas: [{ inventarioId: "inv-1", articuloId: "art-1", cantidad: 1, unidad: "pieza" }] });
    expect(r.ok).toBe(false);
  });
  it("falta-seguro: faltante sin AbastecimientoPort → conflicto", async () => {
    rt = crearCorrectivoRuntime({ materializador: new MaterializadorPrueba(), inventario: new InventarioPrueba({ "inv-1": 0 }) });
    const s = await crearSolicitud();
    await aprobarSolicitud(s.id, s.version);
    const g = await generarOrden(s.id);
    if (!g.ok) throw new Error(g.error.message);
    const iv = await crearIntervencion(s.id, (g.value as { ordenTrabajoId: string }).ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    await exec(`${MODULO}.transicionar-intervencion`, { id: iv.id, accion: "asignar", expectedVersion: iv.version });
    const r = await exec(`${MODULO}.reservar-repuestos`, { intervencionId: iv.id, lineas: [{ inventarioId: "inv-1", articuloId: "art-1", cantidad: 2, unidad: "pieza" }] });
    expect(r.ok).toBe(false);
  });
  it("consumo PARCIAL cuando el stock es menor a lo solicitado", async () => {
    const id = await intervencionEnEjecucion({ "inv-1": 2 });
    const r = await exec(`${MODULO}.consumir-repuesto`, { intervencionId: id, linea: { inventarioId: "inv-1", articuloId: "art-1", cantidad: 5, unidad: "pieza" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { cantidadConsumida: number }).cantidadConsumida).toBe(2);
      expect((r.value as { consumidoTotal: boolean }).consumidoTotal).toBe(false);
    }
  });
  it("consumo TOTAL cuando hay stock suficiente", async () => {
    const id = await intervencionEnEjecucion({ "inv-1": 10 });
    const r = await exec(`${MODULO}.consumir-repuesto`, { intervencionId: id, linea: { inventarioId: "inv-1", articuloId: "art-1", cantidad: 4, unidad: "pieza" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { consumidoTotal: boolean }).consumidoTotal).toBe(true);
  });
  it("devuelve un repuesto (reintegra stock)", async () => {
    const id = await intervencionEnEjecucion({ "inv-1": 5 });
    const r = await exec(`${MODULO}.devolver-repuesto`, { intervencionId: id, linea: { inventarioId: "inv-1", articuloId: "art-1", cantidad: 2, unidad: "pieza" } });
    expect(r.ok).toBe(true);
  });
  it("policy: no consume en preparación (requiere asignación/ejecución)", async () => {
    rt = crearCorrectivoRuntime({ materializador: new MaterializadorPrueba(), inventario: new InventarioPrueba({ "inv-1": 5 }) });
    const s = await crearSolicitud();
    await aprobarSolicitud(s.id, s.version);
    const g = await generarOrden(s.id);
    if (!g.ok) throw new Error(g.error.message);
    const iv = await crearIntervencion(s.id, (g.value as { ordenTrabajoId: string }).ordenTrabajoId, { cuadrillas: [CUADRILLA_A] });
    const r = await exec(`${MODULO}.consumir-repuesto`, { intervencionId: iv.id, linea: { inventarioId: "inv-1", articuloId: "art-1", cantidad: 1, unidad: "pieza" } });
    expect(r.ok).toBe(false);
  });
  it("reservar es idempotente por opId", async () => {
    const id = await intervencionEnEjecucion({ "inv-1": 10 });
    const base = { intervencionId: id, opId: "res-1", lineas: [{ inventarioId: "inv-1", articuloId: "art-1", cantidad: 2, unidad: "pieza" }] };
    const r1 = await exec(`${MODULO}.reservar-repuestos`, base);
    const r2 = await exec(`${MODULO}.reservar-repuestos`, base);
    expect(r1.ok && r2.ok).toBe(true);
    if (r2.ok) expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
});

/* ========================================================================= */
describe("eventos de activo y reincidencia", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime(); });

  it("registra un evento de activo (insumos KPI crudos, sin cálculo)", async () => {
    const r = await exec(`${MODULO}.registrar-evento-activo`, {
      activoId: "act-1", tipo: "falla-reportada", modoFalla: "fuga", ocurridoEn: "2025-01-01T00:00:00.000Z",
      insumosKpi: { tiempoReparacionMin: 120 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { reincidente: boolean }).reincidente).toBe(false);
  });
  it("detecta reincidencia por mismo activo+modo dentro de la ventana", async () => {
    await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-9", tipo: "falla-reportada", modoFalla: "fuga", ocurridoEn: "2025-01-01T00:00:00.000Z" });
    const r = await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-9", tipo: "falla-reportada", modoFalla: "fuga", ocurridoEn: "2025-01-15T00:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { reincidente: boolean }).reincidente).toBe(true);
      expect((r.value as { ocurrenciasEnVentana: number }).ocurrenciasEnVentana).toBeGreaterThanOrEqual(2);
    }
  });
  it("NO reincidencia si el evento previo cae fuera de la ventana", async () => {
    await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-8", tipo: "falla-reportada", modoFalla: "fuga", ocurridoEn: "2024-01-01T00:00:00.000Z" });
    const r = await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-8", tipo: "falla-reportada", modoFalla: "fuga", ocurridoEn: "2025-06-01T00:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { reincidente: boolean }).reincidente).toBe(false);
  });
  it("NO reincidencia entre modos de falla distintos", async () => {
    await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-7", tipo: "falla-reportada", modoFalla: "fuga", ocurridoEn: "2025-01-01T00:00:00.000Z" });
    const r = await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-7", tipo: "falla-reportada", modoFalla: "corrosion", ocurridoEn: "2025-01-05T00:00:00.000Z" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { reincidente: boolean }).reincidente).toBe(false);
  });
  it("rechaza modoFalla no canónico", async () => {
    const r = await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-1", tipo: "falla-reportada", modoFalla: "modo-inventado" });
    expect(r.ok).toBe(false);
  });
  it("rechaza tipo de evento no soportado", async () => {
    const r = await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-1", tipo: "tipo-inventado" });
    expect(r.ok).toBe(false);
  });
  it("lista los eventos de un activo", async () => {
    await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-list", tipo: "falla-reportada" });
    await exec(`${MODULO}.registrar-evento-activo`, { activoId: "act-list", tipo: "reparacion-iniciada" });
    const q = await query(`${MODULO}.eventos-activo`, { activoId: "act-list" });
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as unknown[]).length).toBe(2);
  });
});

/* ========================================================================= */
describe("catálogos: semántica canónica / poblada / deshabilitada", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime(); });

  it("acepta clave canónica cuando el catálogo está vacío", async () => {
    const s = await crearSolicitud({ prioridad: "critica" });
    expect(s.estado).toBe("registro");
  });
  it("upsert agrega una entrada al catálogo", async () => {
    const r = await exec(`${MODULO}.catalogo-upsert`, { catalogo: "prioridades", clave: "prioridad-x", etiqueta: "Prioridad X" });
    expect(r.ok).toBe(true);
  });
  it("tras poblar, la clave nueva es aceptada", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "origenes-solicitud", clave: "portal-web", etiqueta: "Portal Web" });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "portal-web", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(true);
  });
  it("catálogo poblado: rechaza clave inexistente (no canónica)", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "origenes-solicitud", clave: "portal-web", etiqueta: "Portal Web" });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "operador", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    // "operador" es canónico pero, al poblarse el catálogo, sólo valen las claves cargadas.
    expect(r.ok).toBe(false);
  });
  it("deshabilitar una clave la vuelve inválida", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "origenes-solicitud", clave: "portal-web", etiqueta: "Portal Web" });
    await exec(`${MODULO}.catalogo-habilitar`, { catalogo: "origenes-solicitud", clave: "portal-web", habilitado: false });
    const r = await exec(`${MODULO}.crear-solicitud`, { titulo: "A", origen: "portal-web", prioridad: "alta", objeto: OBJETO, sintomas: [{ texto: "x" }] });
    expect(r.ok).toBe(false);
  });
  it("catalogo-opciones lista las entradas cargadas", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "prioridades", clave: "p1", etiqueta: "P1" });
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "prioridades", clave: "p2", etiqueta: "P2" });
    const q = await query(`${MODULO}.catalogo-opciones`, { catalogo: "prioridades" });
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as unknown[]).length).toBe(2);
  });
  it("rechaza catálogo fuera del enum declarado", async () => {
    const r = await exec(`${MODULO}.catalogo-upsert`, { catalogo: "catalogo-fantasma", clave: "x", etiqueta: "X" });
    expect(r.ok).toBe(false);
  });
});

/* ========================================================================= */
describe("consultas y descriptor del servicio", () => {
  beforeEach(() => { rt = crearCorrectivoRuntime(); });

  it("solicitud-detalle devuelve el aggregate", async () => {
    const s = await crearSolicitud();
    const q = await query(`${MODULO}.solicitud-detalle`, { id: s.id });
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as { id: string }).id).toBe(s.id);
  });
  it("solicitud-detalle falla en id inexistente", async () => {
    const q = await query(`${MODULO}.solicitud-detalle`, { id: "no-existe" });
    expect(q.ok).toBe(false);
  });
  it("solicitudes lista y filtra por estado", async () => {
    await crearSolicitud();
    await crearSolicitud();
    const q = await query(`${MODULO}.solicitudes`, { estado: "registro" });
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as unknown[]).length).toBeGreaterThanOrEqual(2);
  });
  it("eventos (admin) devuelve la bitácora del tenant", async () => {
    await crearSolicitud();
    const q = await query(`${MODULO}.eventos`, {});
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as unknown[]).length).toBeGreaterThan(0);
  });
});
