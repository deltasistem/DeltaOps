/**
 * DGP-009.2 · Pruebas de infraestructura operacional (Fakes en memoria vía
 * `crearOrdenesRuntime`). Cubre: proyección CQRS (listado/agenda/responsables/
 * documentación/historial), bitácora operacional por eventos, planificación,
 * asignaciones, recursos, SLA, relaciones, Shared Timeline, consola técnica,
 * offline por opId (idempotencia) y REPLAY con verificación de equivalencia.
 *
 * Toda lectura es SÓLO por read models (nunca releyendo el aggregate salvo el
 * `detalle` mínimo de 009.1). Los read models se materializan por los
 * eventHandlers idempotentes al drenar el outbox.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, MemoryLogger, type ExecutionContext, type Principal } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { crearOrdenesRuntime, FakePlantillas, MODULO, MODULO_WORKFLOW, type OrdenesRuntime } from "..";

const ALL = [
  ...new Set(officialServices().flatMap((s) => [...s.permissions])),
  `${MODULO}.read`, `${MODULO}.write`, `${MODULO}.operar`, `${MODULO}.validar`, `${MODULO}.admin`,
  `${MODULO_WORKFLOW}.read`, `${MODULO_WORKFLOW}.operar`, `${MODULO_WORKFLOW}.disenar`,
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL, capacidades: ["*"] };

let rt: OrdenesRuntime;
beforeEach(() => {
  const plantillas = new FakePlantillas()
    .registrarPlantilla({ clave: "form-1", version: 1, clase: "formulario", titulo: "F1" })
    .registrarPlantilla({ clave: "chk-1", version: 1, clase: "checklist", titulo: "C1" });
  rt = crearOrdenesRuntime({ logger: new MemoryLogger(), plantillas });
});

const ctxOf = (t: string, p: Principal = ADMIN) => createExecutionContext({ principal: p, metadata: { tenantId: t } });
const exec = (ctx: ExecutionContext, cmd: string, input: unknown) => rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (ctx: ExecutionContext, q: string, input: unknown) => rt.platform.kernel.queries.execute(ctx, q, input);
const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

async function crear(ctx: ExecutionContext, extra: Record<string, unknown> = {}) {
  const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva", ...extra });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string };
}

describe("CQRS: proyección de listado/detalle", () => {
  it("proyecta al read model tras drenar el outbox y filtra por estado", async () => {
    const ctx = ctxOf("t1");
    const a = await crear(ctx, { titulo: "Alfa" });
    await crear(ctx, { titulo: "Beta" });
    await drenar();

    const lista = await query(ctx, `${MODULO}.listar`, {});
    expect(lista.ok).toBe(true);
    if (lista.ok) {
      const ordenes = (lista.value as { ordenes: Array<{ id: string; titulo: string; estado: string }> }).ordenes;
      expect(ordenes.length).toBe(2);
      expect(ordenes.map((o) => o.id)).toContain(a.id);
    }
  });

  it("aísla read models por tenant", async () => {
    await crear(ctxOf("t-a"));
    await crear(ctxOf("t-b"));
    await drenar();
    const la = await query(ctxOf("t-a"), `${MODULO}.listar`, {});
    expect(la.ok && (la.value as { ordenes: unknown[] }).ordenes.length).toBe(1);
  });
});

describe("CQRS estricto: `detalle` lee SÓLO del read model", () => {
  it("`detalle` NUNCA consulta el repositorio (aggregate) y funciona tras reproyectar", async () => {
    const ctx = ctxOf("t-detalle-cqrs");
    const o = await crear(ctx, { titulo: "Solo Read Model" });
    await drenar();

    // Sabotaje: cualquier lectura del repositorio (fuente de escritura) lanza.
    // Si `detalle` tocara el aggregate, el test fallaría con esta excepción.
    const findByIdOriginal = rt.adapters.repository.findById.bind(rt.adapters.repository);
    let repoConsultado = false;
    (rt.adapters.repository as { findById: unknown }).findById = async () => {
      repoConsultado = true;
      throw new Error("CQRS violado: `detalle` no debe consultar el repositorio");
    };

    try {
      const det = await query(ctx, `${MODULO}.detalle`, { id: o.id });
      expect(det.ok, !det.ok ? det.error.message : "").toBe(true);
      if (det.ok) {
        const orden = (det.value as { orden: { id: string; titulo: string } }).orden;
        expect(orden.id).toBe(o.id);
        expect(orden.titulo).toBe("Solo Read Model");
      }
      expect(repoConsultado).toBe(false);

      // Tras REPROYECTAR (vaciar + reconstruir read models desde la bitácora
      // durable), `detalle` sigue respondiendo desde el read model reconstruido.
      const rep = await exec(ctx, `${MODULO}.reproyectar`, {});
      expect(rep.ok).toBe(true);
      const det2 = await query(ctx, `${MODULO}.detalle`, { id: o.id });
      expect(det2.ok, !det2.ok ? det2.error.message : "").toBe(true);
      if (det2.ok) expect((det2.value as { orden: { id: string } }).orden.id).toBe(o.id);
      expect(repoConsultado).toBe(false);
    } finally {
      (rt.adapters.repository as { findById: unknown }).findById = findByIdOriginal;
    }
  });

  it("`detalle` de una OT no proyectada ⇒ notFound (sin fallback al repositorio)", async () => {
    const ctx = ctxOf("t-detalle-nf");
    const det = await query(ctx, `${MODULO}.detalle`, { id: crypto.randomUUID() });
    expect(det.ok).toBe(false);
  });
});

describe("Bitácora operacional (por eventos)", () => {
  it("registra las 8 acciones y las proyecta a la bitácora y al historial", async () => {
    const ctx = ctxOf("t-bit");
    const o = await crear(ctx);
    const acciones = ["inicio", "pausa", "reanudacion", "espera", "cambio-responsable", "llegada", "salida", "finalizacion"];
    for (const accion of acciones) {
      const r = await exec(ctx, `${MODULO}.bitacora.registrar`, { ordenId: o.id, accion });
      expect(r.ok).toBe(true);
    }
    await drenar();
    const bit = await query(ctx, `${MODULO}.bitacora`, { ordenId: o.id });
    expect(bit.ok && (bit.value as { bitacora: unknown[] }).bitacora.length).toBe(8);
    const hist = await query(ctx, `${MODULO}.historial`, { ordenId: o.id });
    // historial = creación + 8 bitácoras
    expect(hist.ok && (hist.value as { historial: unknown[] }).historial.length).toBeGreaterThanOrEqual(9);
  });
});

describe("Planificación / agenda / conflictos", () => {
  it("planifica y aparece en agenda; detecta conflicto de responsable", async () => {
    const ctx = ctxOf("t-plan");
    const a = await crear(ctx, { responsable: "juan" });
    const b = await crear(ctx, { responsable: "juan" });
    await drenar();
    const p1 = await exec(ctx, `${MODULO}.planificar`, { ordenId: a.id, inicioPlanificado: "2024-06-01T08:00:00.000Z", finPlanificado: "2024-06-01T10:00:00.000Z" });
    expect(p1.ok).toBe(true);
    await drenar(); // la agenda del responsable se materializa por proyección
    const p2 = await exec(ctx, `${MODULO}.planificar`, { ordenId: b.id, inicioPlanificado: "2024-06-01T09:00:00.000Z" });
    expect(p2.ok && (p2.value as { enConflicto: boolean }).enConflicto).toBe(true);
    await drenar();
    const ag = await query(ctx, `${MODULO}.agenda`, {});
    expect(ag.ok && (ag.value as { entradas: unknown[] }).entradas.length).toBe(2);
  });
});

describe("Asignaciones / recursos / SLA / relaciones", () => {
  it("asigna recurso humano, recurso (ref-only), SLA y relación", async () => {
    const ctx = ctxOf("t-op");
    const a = await crear(ctx);
    const b = await crear(ctx);
    await drenar();
    expect((await exec(ctx, `${MODULO}.asignar-recurso-humano`, { ordenId: a.id, tipo: "cuadrilla", asignadoId: "cuad-7" })).ok).toBe(true);
    expect((await exec(ctx, `${MODULO}.registrar-recurso`, { ordenId: a.id, clase: "herramienta", referenciaId: "tool-1" })).ok).toBe(true);
    expect((await exec(ctx, `${MODULO}.sla.definir`, { ordenId: a.id, minutosObjetivo: 120 })).ok).toBe(true);
    expect((await exec(ctx, `${MODULO}.crear-relacion`, { ordenId: a.id, categoria: "orden", tipo: "bloquea", destinoId: b.id })).ok).toBe(true);
    await drenar();

    const asg = await query(ctx, `${MODULO}.asignaciones`, { ordenId: a.id });
    expect(asg.ok && (asg.value as { asignaciones: unknown[] }).asignaciones.length).toBeGreaterThanOrEqual(1);
    const deps = await query(ctx, `${MODULO}.dependencias`, { ordenId: a.id });
    expect(deps.ok && (deps.value as { dependencias: unknown[] }).dependencias.length).toBe(1);
  });

  it("relación duplicada es idempotente; auto-relación se rechaza", async () => {
    const ctx = ctxOf("t-rel");
    const a = await crear(ctx);
    const b = await crear(ctx);
    await drenar();
    await exec(ctx, `${MODULO}.crear-relacion`, { ordenId: a.id, categoria: "orden", tipo: "bloquea", destinoId: b.id });
    const dup = await exec(ctx, `${MODULO}.crear-relacion`, { ordenId: a.id, categoria: "orden", tipo: "bloquea", destinoId: b.id });
    expect(dup.ok && (dup.value as { idempotente: boolean }).idempotente).toBe(true);
    const self = await exec(ctx, `${MODULO}.crear-relacion`, { ordenId: a.id, categoria: "orden", tipo: "bloquea", destinoId: a.id });
    expect(self.ok).toBe(false);
  });
});

describe("Offline: idempotencia por opId", () => {
  it("reejecutar el mismo opId no duplica y devuelve idempotente=true", async () => {
    const ctx = ctxOf("t-off");
    const o = await crear(ctx);
    const op = { ordenId: o.id, accion: "inicio", opId: "op-xyz" };
    const r1 = await exec(ctx, `${MODULO}.bitacora.registrar`, op);
    const r2 = await exec(ctx, `${MODULO}.bitacora.registrar`, op);
    expect(r1.ok && (r1.value as { idempotente: boolean }).idempotente).toBe(false);
    expect(r2.ok && (r2.value as { idempotente: boolean }).idempotente).toBe(true);
    await drenar();
    const bit = await query(ctx, `${MODULO}.bitacora`, { ordenId: o.id });
    expect(bit.ok && (bit.value as { bitacora: unknown[] }).bitacora.length).toBe(1);
  });
});

describe("Consola técnica (admin)", () => {
  it("reporta read models, event log, outbox, sincronización y RLS", async () => {
    const ctx = ctxOf("t-con");
    await crear(ctx);
    await drenar();
    const r = await query(ctx, `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = r.value as { modulo: string; readModels: { ordenes: { total: number } }; rls: { tablas: string[] } };
      expect(c.modulo).toBe(MODULO);
      expect(c.readModels.ordenes.total).toBe(1);
      expect(c.rls.tablas).toContain("ord_ordenes");
    }
  });
});

describe("Replay: reproyección con equivalencia", () => {
  it("reproyecta desde la bitácora durable y produce read models equivalentes", async () => {
    const ctx = ctxOf("t-replay");
    const a = await crear(ctx, { responsable: "ana" });
    await drenar();
    await exec(ctx, `${MODULO}.bitacora.registrar`, { ordenId: a.id, accion: "inicio" });
    await exec(ctx, `${MODULO}.sla.definir`, { ordenId: a.id, minutosObjetivo: 60 });
    await drenar();

    const antesLista = await query(ctx, `${MODULO}.listar`, {});
    const antesBit = await query(ctx, `${MODULO}.bitacora`, { ordenId: a.id });

    const rep = await exec(ctx, `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    expect(rep.ok && (rep.value as { eventos: number }).eventos).toBeGreaterThan(0);

    const despLista = await query(ctx, `${MODULO}.listar`, {});
    const despBit = await query(ctx, `${MODULO}.bitacora`, { ordenId: a.id });
    expect(antesLista.ok && despLista.ok).toBe(true);
    if (antesLista.ok && despLista.ok) {
      const na = (antesLista.value as { ordenes: unknown[] }).ordenes.length;
      const nd = (despLista.value as { ordenes: unknown[] }).ordenes.length;
      expect(nd).toBe(na);
    }
    if (antesBit.ok && despBit.ok) {
      expect((despBit.value as { bitacora: unknown[] }).bitacora.length).toBe((antesBit.value as { bitacora: unknown[] }).bitacora.length);
    }
  });
});

describe("Sincronización offline por orquestación", () => {
  it("procesa una cola y drena el outbox; reintento idempotente", async () => {
    const ctx = ctxOf("t-sync");
    const o = await crear(ctx);
    await drenar();
    const cola = [
      { opId: "s1", comando: "bitacora.registrar", input: { ordenId: o.id, accion: "inicio" } },
      { opId: "s2", comando: "bitacora.registrar", input: { ordenId: o.id, accion: "finalizacion" } },
    ];
    const r1 = await rt.sincronizar(ctx, cola);
    expect(r1.aplicadas).toBe(2);
    const r2 = await rt.sincronizar(ctx, cola);
    expect(r2.idempotentes).toBe(2);
    const bit = await query(ctx, `${MODULO}.bitacora`, { ordenId: o.id });
    expect(bit.ok && (bit.value as { bitacora: unknown[] }).bitacora.length).toBe(2);
  });

  it("dos workers CONCURRENTES con el mismo opId ⇒ UN SOLO efecto (claim durable)", async () => {
    const ctx = ctxOf("t-sync-conc");
    const o = await crear(ctx);
    await drenar();
    const cola = [{ opId: "op-concurrente", comando: "bitacora.registrar", input: { ordenId: o.id, accion: "inicio" } }];

    // Dos consumidores de la MISMA cola en paralelo: uno reclama y ejecuta; el
    // otro observa el claim ajeno y devuelve el resultado sin re-ejecutar.
    const [w1, w2] = await Promise.all([rt.sincronizar(ctx, cola), rt.sincronizar(ctx, cola)]);

    // Exactamente un efecto: una única entrada de bitácora para el opId.
    await drenar();
    const bit = await query(ctx, `${MODULO}.bitacora`, { ordenId: o.id });
    expect(bit.ok && (bit.value as { bitacora: unknown[] }).bitacora.length).toBe(1);

    // Uno aplicó y el otro NO produjo efecto (idempotente): nunca dos aplicadas.
    const aplicadas = w1.aplicadas + w2.aplicadas;
    const idempotentes = w1.idempotentes + w2.idempotentes;
    expect(aplicadas).toBe(1);
    expect(idempotentes).toBe(1);
  });

  it("fallo parcial ⇒ RELEASE del claim y reintento exitoso SIN duplicado", async () => {
    const ctx = ctxOf("t-sync-fail");
    const o = await crear(ctx);
    await drenar();
    const opId = "op-reintento";
    const comando = `${MODULO}.bitacora.registrar`;

    // Primer intento: forzamos un fallo REINTENTABLE de infraestructura (KRN-INF-001)
    // desde el store del comando ⇒ la orquestación hace RELEASE del claim.
    const findByIdOriginal = rt.adapters.repository.findById.bind(rt.adapters.repository);
    let fallar = true;
    (rt.adapters.repository as { findById: unknown }).findById = async (t: string, id: string) => {
      if (fallar) return { ok: false as const, error: { code: "KRN-INF-001", message: "infra caída (simulada)" } };
      return findByIdOriginal(t, id);
    };

    const cola = [{ opId, comando: "bitacora.registrar", input: { ordenId: o.id, accion: "inicio" } }];
    const r1 = await rt.sincronizar(ctx, cola);
    expect(r1.reintentables).toBe(1);
    // El claim se liberó: no queda recibo pendiente para ese opId.
    const recibo1 = await rt.adapters.syncReceipts.find("t-sync-fail", opId);
    expect(recibo1.ok && recibo1.value).toBe(null);

    // Se restablece la infra y se REINTENTA la MISMA operación: ahora aplica.
    fallar = false;
    const r2 = await rt.sincronizar(ctx, cola);
    expect(r2.aplicadas).toBe(1);

    // Un tercer reintento es idempotente (ya sellado por opId).
    const r3 = await rt.sincronizar(ctx, cola);
    expect(r3.idempotentes).toBe(1);

    (rt.adapters.repository as { findById: unknown }).findById = findByIdOriginal;

    // SIN duplicado: exactamente UNA entrada de bitácora para el opId.
    await drenar();
    const bit = await query(ctx, `${MODULO}.bitacora`, { ordenId: o.id });
    expect(bit.ok && (bit.value as { bitacora: unknown[] }).bitacora.length).toBe(1);
    void comando;
  });
});
