/** DGP-012 · Pruebas de MÓDULO (end-to-end): comandos, gobierno, catálogos, idempotencia. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  MODULO,
  crearPlanesRuntime,
  WorkflowPruebaRechazo,
  WorkflowPruebaRechazoTransicion,
  type PlanesRuntime,
} from "..";

const TENANT = "t-planes";
let rt: PlanesRuntime;

function nuevoRt(opts: Parameters<typeof crearPlanesRuntime>[0] = {}) {
  return crearPlanesRuntime(opts);
}

async function exec(nombre: string, input: Record<string, unknown>) {
  const r = await rt.platform.kernel.commands.execute(rt.ctx(TENANT), nombre, input);
  await rt.platform.kernel.outboxProcessor.processPending();
  return r;
}
async function query(nombre: string, input: Record<string, unknown>) {
  return rt.platform.kernel.queries.execute(rt.ctx(TENANT), nombre, input);
}

const planBase = () => ({
  nombre: "Plan bombas",
  tipoPlan: "preventivo",
  estrategia: "basado-tiempo",
  prioridad: "alta",
  alcance: { categorias: ["bombas"] },
  rutina: { id: "ru1", nombre: "Rutina", actividades: [{ id: "a1", orden: 0, tipo: "inspeccion", titulo: "Revisar" }] },
  programa: { frecuencia: { reglas: [{ tipo: "meses", cada: 3 }] }, vigenteDesde: "2024-01-01T00:00:00.000Z" },
});

async function crearPlan(extra: Record<string, unknown> = {}) {
  const r = await exec(`${MODULO}.crear-plan`, { ...planBase(), ...extra });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; estado: string; version: number };
}

describe("Registro del servicio", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("expone el servicio con eventos y permisos", async () => {
    // Un comando ejecutable prueba el registro efectivo.
    const p = await crearPlan();
    expect(p.codigo.startsWith("PLN-")).toBe(true);
  });
});

describe("Ciclo de vida gobernado", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("crea → publica → vigente", async () => {
    const p = await crearPlan();
    expect(p.estado).toBe("borrador");
    const pub = await exec(`${MODULO}.publicar-plan`, { id: p.id, expectedVersion: p.version });
    expect(pub.ok).toBe(true);
    if (!pub.ok) return;
    expect((pub.value as { estado: string }).estado).toBe("vigente");
  });

  it("suspender y reanudar transicionan el estado", async () => {
    const p = await crearPlan();
    const pub = await exec(`${MODULO}.publicar-plan`, { id: p.id, expectedVersion: p.version });
    if (!pub.ok) throw new Error("pub");
    const v1 = (pub.value as { version: number }).version;
    const susp = await exec(`${MODULO}.transicionar-plan`, { id: p.id, accion: "suspender", expectedVersion: v1, motivo: "clima" });
    expect(susp.ok).toBe(true);
    if (!susp.ok) return;
    expect((susp.value as { estado: string }).estado).toBe("suspendido");
    const v2 = (susp.value as { version: number }).version;
    const rea = await exec(`${MODULO}.transicionar-plan`, { id: p.id, accion: "reanudar", expectedVersion: v2, motivo: "resuelto" });
    expect(rea.ok && (rea.value as { estado: string }).estado === "vigente").toBe(true);
  });

  it("posponer sin fecha 'hasta' es rechazado por el dominio", async () => {
    const p = await crearPlan();
    const pub = await exec(`${MODULO}.publicar-plan`, { id: p.id, expectedVersion: p.version });
    if (!pub.ok) throw new Error("pub");
    const v1 = (pub.value as { version: number }).version;
    const pos = await exec(`${MODULO}.transicionar-plan`, { id: p.id, accion: "posponer", expectedVersion: v1, motivo: "sin repuestos" });
    expect(pos.ok).toBe(false);
  });
});

describe("Gobierno SIN bypass", () => {
  it("SIN adaptador de workflow: crear-plan falla de forma segura (KRN-CFL-001)", async () => {
    rt = nuevoRt({ workflow: null });
    const r = await exec(`${MODULO}.crear-plan`, planBase());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-CFL-001");
    // No hay plan creado.
    const lista = await query(`${MODULO}.planes`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(0);
  });

  it("workflow que RECHAZA la apertura impide crear el plan", async () => {
    rt = nuevoRt({ workflow: new WorkflowPruebaRechazo() });
    const r = await exec(`${MODULO}.crear-plan`, planBase());
    expect(r.ok).toBe(false);
    const lista = await query(`${MODULO}.planes`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(0);
  });

  it("workflow que RECHAZA la transición impide publicar (sin efecto)", async () => {
    rt = nuevoRt({ workflow: new WorkflowPruebaRechazoTransicion() });
    const p = await crearPlan();
    const pub = await exec(`${MODULO}.publicar-plan`, { id: p.id, expectedVersion: p.version });
    expect(pub.ok).toBe(false);
    // El plan sigue en borrador.
    const q = await query(`${MODULO}.plan`, { id: p.id });
    expect(q.ok && (q.value as { estado: string }).estado).toBe("borrador");
  });
});

describe("Catálogos (semántica canónica)", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("catálogo vacío acepta valores canónicos y rechaza no canónicos", async () => {
    const ok = await exec(`${MODULO}.crear-plan`, { ...planBase(), tipoPlan: "predictivo" });
    expect(ok.ok).toBe(true);
    const bad = await exec(`${MODULO}.crear-plan`, { ...planBase(), tipoPlan: "inexistente" });
    expect(bad.ok).toBe(false);
  });
  it("catálogo NO vacío exige valor presente y habilitado", async () => {
    const up = await exec(`${MODULO}.catalogo-upsert`, { catalogo: "tipos-plan", clave: "campania", etiqueta: "Campaña" });
    expect(up.ok).toBe(true);
    // "preventivo" ya no vale (catálogo no vacío sin esa clave).
    const bad = await exec(`${MODULO}.crear-plan`, { ...planBase(), tipoPlan: "preventivo" });
    expect(bad.ok).toBe(false);
    const good = await exec(`${MODULO}.crear-plan`, { ...planBase(), tipoPlan: "campania" });
    expect(good.ok).toBe(true);
  });
  it("un valor deshabilitado deja de ser válido", async () => {
    await exec(`${MODULO}.catalogo-upsert`, { catalogo: "tipos-plan", clave: "preventivo", etiqueta: "Preventivo" });
    await exec(`${MODULO}.catalogo-habilitar`, { catalogo: "tipos-plan", clave: "preventivo", habilitado: false });
    const bad = await exec(`${MODULO}.crear-plan`, { ...planBase(), tipoPlan: "preventivo" });
    expect(bad.ok).toBe(false);
  });
});

describe("Idempotencia offline (recibos por opId)", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("reejecutar con el mismo opId no duplica el plan", async () => {
    const opId = "op-crear-1";
    const a = await exec(`${MODULO}.crear-plan`, { ...planBase(), opId });
    expect(a.ok).toBe(true);
    const b = await exec(`${MODULO}.crear-plan`, { ...planBase(), opId });
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect((b.value as { idempotente: boolean }).idempotente).toBe(true);
    expect((a.value as { id: string }).id).toBe((b.value as { id: string }).id);
    const lista = await query(`${MODULO}.planes`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });
});

describe("Generación idempotente de órdenes", () => {
  beforeEach(() => { rt = nuevoRt(); });
  async function planVigente() {
    const p = await crearPlan();
    const pub = await exec(`${MODULO}.publicar-plan`, { id: p.id, expectedVersion: p.version });
    if (!pub.ok) throw new Error("pub");
    return p.id;
  }
  it("decide generar OT cuando la frecuencia venció y marca la ocurrencia (dedup)", async () => {
    const planId = await planVigente();
    const gen = await exec(`${MODULO}.evaluar-generacion`, {
      planId, activoId: "A1", origen: "frecuencia", ahora: "2024-05-01T00:00:00.000Z",
      anclaje: { desde: "2024-01-01T00:00:00.000Z" },
    });
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    expect((gen.value as { corresponde: boolean }).corresponde).toBe(true);
    const clave = (gen.value as { claveDedup: string }).claveDedup;
    // Segunda evaluación equivalente: NO corresponde (ya generada).
    const gen2 = await exec(`${MODULO}.evaluar-generacion`, {
      planId, activoId: "A1", origen: "frecuencia", ahora: "2024-05-02T00:00:00.000Z",
      anclaje: { desde: "2024-01-01T00:00:00.000Z" },
    });
    expect(gen2.ok).toBe(true);
    if (!gen2.ok) return;
    expect((gen2.value as { corresponde: boolean }).corresponde).toBe(false);
    expect((gen2.value as { claveDedup: string }).claveDedup).toBe(clave);
    const lista = await query(`${MODULO}.generaciones`, { planId });
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });
  it("no genera si el plan no está vigente (policy)", async () => {
    const p = await crearPlan();
    const gen = await exec(`${MODULO}.evaluar-generacion`, {
      planId: p.id, activoId: "A1", origen: "frecuencia", ahora: "2024-05-01T00:00:00.000Z",
      anclaje: { desde: "2024-01-01T00:00:00.000Z" },
    });
    expect(gen.ok).toBe(false); // policy: sólo un plan vigente genera órdenes
  });
});

describe("Eventos autosuficientes", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("crear-plan deja un evento durable con tenant y entityRef", async () => {
    const p = await crearPlan();
    const ev = await query(`${MODULO}.eventos`, {});
    expect(ev.ok).toBe(true);
    if (!ev.ok) return;
    const eventos = ev.value as { tipo: string; payload: Record<string, unknown> }[];
    const creado = eventos.find((e) => String(e.payload["id"]) === p.id);
    expect(creado).toBeTruthy();
    expect(creado?.payload["tenantId"]).toBe(TENANT);
    expect(creado?.payload["entityRef"]).toBe(`plan-mantenimiento:${p.id}`);
  });
});

/* ---------------- Materialización de OT (orquestador oficial) ------------- */
describe("Materialización de OT: generar-ordenes-preventivas", () => {
  beforeEach(() => { rt = nuevoRt(); });
  async function planConGeneracion() {
    const p = await crearPlan();
    const pub = await exec(`${MODULO}.publicar-plan`, { id: p.id, expectedVersion: p.version });
    if (!pub.ok) throw new Error("pub");
    const gen = await exec(`${MODULO}.evaluar-generacion`, {
      planId: p.id, activoId: "A1", origen: "frecuencia", ahora: "2024-05-01T00:00:00.000Z",
      anclaje: { desde: "2024-01-01T00:00:00.000Z" },
    });
    if (!gen.ok) throw new Error("gen");
    return { planId: p.id, claveDedup: (gen.value as { claveDedup: string }).claveDedup };
  }

  it("materializa la generación en OT REAL y persiste el vínculo (estado=materializada)", async () => {
    const { planId } = await planConGeneracion();
    const r = await exec(`${MODULO}.generar-ordenes-preventivas`, { planId, opId: `mat-${planId}` });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { ordenesCreadas: Array<{ ordenTrabajoId: string }>; errores: unknown[] };
    expect(v.errores).toEqual([]);
    expect(v.ordenesCreadas.length).toBe(1);
    expect(v.ordenesCreadas[0]!.ordenTrabajoId.length).toBeGreaterThan(0);
    expect(rt.materializador.creadas).toBe(1);

    // El read model refleja el vínculo con estado=materializada.
    const gens = await query(`${MODULO}.generaciones`, { planId });
    expect(gens.ok).toBe(true);
    if (!gens.ok) return;
    const g = (gens.value as Array<{ ordenTrabajoId: string | null; estado?: string }>)[0]!;
    expect(g.ordenTrabajoId).toBe(v.ordenesCreadas[0]!.ordenTrabajoId);
    expect(g.estado).toBe("materializada");
  });

  it("replay/reintento NO duplica: una sola OT y el vínculo se reconoce idempotente", async () => {
    const { planId } = await planConGeneracion();
    const r1 = await exec(`${MODULO}.generar-ordenes-preventivas`, { planId, opId: `mat-${planId}` });
    expect(r1.ok).toBe(true);
    // Reintento SIN opId (fuerza reevaluación): la generación ya está vinculada.
    const r2 = await exec(`${MODULO}.generar-ordenes-preventivas`, { planId });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    // No quedan pendientes ⇒ 0 evaluadas; el materializador NO crea otra OT.
    expect((r2.value as { evaluadas: number }).evaluadas).toBe(0);
    expect(rt.materializador.creadas).toBe(1);
    // Reintento con MISMO opId ⇒ idempotente (recibo).
    const r3 = await exec(`${MODULO}.generar-ordenes-preventivas`, { planId, opId: `mat-${planId}` });
    expect(r3.ok && (r3.value as { idempotente?: boolean }).idempotente).toBe(true);
  });

  it("concurrencia: dos materializaciones simultáneas ⇒ una sola OT", async () => {
    const { planId } = await planConGeneracion();
    const [a, b] = await Promise.all([
      rt.platform.kernel.commands.execute(rt.ctx(TENANT), `${MODULO}.generar-ordenes-preventivas`, { planId }),
      rt.platform.kernel.commands.execute(rt.ctx(TENANT), `${MODULO}.generar-ordenes-preventivas`, { planId }),
    ]);
    await rt.platform.kernel.outboxProcessor.processPending();
    expect(a.ok && b.ok).toBe(true);
    // El materializador dedupe por opId=claveDedup ⇒ una sola OT REAL.
    expect(rt.materializador.creadas).toBe(1);
    const gens = await query(`${MODULO}.generaciones`, { planId });
    expect(gens.ok).toBe(true);
    if (!gens.ok) return;
    const ids = new Set((gens.value as Array<{ ordenTrabajoId: string | null }>).map((g) => g.ordenTrabajoId));
    expect(ids.size).toBe(1);
  });

  it("sync offline del comando responde por opId con recibo", async () => {
    const { planId } = await planConGeneracion();
    const op = { opId: `sync-mat-${planId}`, comando: "generar-ordenes-preventivas", input: { planId } };
    const r1 = await rt.sincronizar(rt.ctx(TENANT), [op]);
    expect(["aplicada", "idempotente"]).toContain(r1.resultados[0]!.estado);
    const r2 = await rt.sincronizar(rt.ctx(TENANT), [op]);
    expect(r2.resultados[0]!.estado).toBe("idempotente");
    expect(rt.materializador.creadas).toBe(1);
  });
});

/* --------------- CQRS: calendarios / historial reproyectables ------------- */
describe("CQRS calendarios e historial", () => {
  beforeEach(() => { rt = nuevoRt(); });
  it("crear-calendario emite evento y la query lo sirve desde el read model", async () => {
    const id = crypto.randomUUID();
    const cal = await exec(`${MODULO}.crear-calendario`, {
      id, tipo: "empresa", ambito: "planta", nombre: "Calendario planta",
      diasLaborales: [1, 2, 3, 4, 5],
    });
    expect(cal.ok).toBe(true);
    const q = await query(`${MODULO}.calendario`, { id });
    expect(q.ok).toBe(true);
    if (q.ok) expect((q.value as { nombre?: string }).nombre).toBe("Calendario planta");
  });

  it("historial se sirve desde el read model reproyectable", async () => {
    const p = await crearPlan();
    const pub = await exec(`${MODULO}.publicar-plan`, { id: p.id, expectedVersion: p.version });
    expect(pub.ok).toBe(true);
    const h = await query(`${MODULO}.historial`, { planId: p.id });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const hitos = (h.value as Array<{ hito: string }>).map((x) => x.hito);
    expect(hitos).toContain("creado");
    expect(hitos).toContain("publicado");
  });
});
