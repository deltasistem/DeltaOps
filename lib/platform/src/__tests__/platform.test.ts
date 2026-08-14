/**
 * DeltaOps Plataforma · DGP-003 — Testing con adaptadores Fake (offline).
 * Cubre: registro automático, prohibición de registro manual, servicios,
 * multitenancy, permisos, auditoría, configuración por tenant y eventos.
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import {
  CapabilityRegistry,
  createPlatformRuntime,
  FakeAuditTrail,
  FakeRecordStore,
  KnowledgeGraph,
  ObservabilityRegistry,
  officialServices,
  SharedServiceRegistry,
  type PlatformRuntime,
} from "..";

const ALL_PERMISSIONS = [
  ...new Set(officialServices().flatMap((s) => [...s.permissions])),
];

const ADMIN: Principal = {
  id: "admin-1",
  rol: "admin",
  permisos: ALL_PERMISSIONS,
  capacidades: [],
};

const SIN_PERMISOS: Principal = { id: "u-0", rol: "invitado", permisos: [], capacidades: [] };

function runtime(): PlatformRuntime {
  return createPlatformRuntime({ logger: new MemoryLogger() });
}

function ctxOf(tenantId: string, principal: Principal = ADMIN): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId } });
}

async function drainOutbox(rt: PlatformRuntime): Promise<void> {
  await rt.kernel.outboxProcessor.processPending();
}

describe("Registro automático (5 registros oficiales)", () => {
  it("registra los 15 servicios oficiales (config + 14 del DGP-003)", () => {
    const rt = runtime();
    const names = rt.registries.services.list().map((s) => s.name);
    expect(names).toHaveLength(15);
    for (const s of [
      "platform.config", "platform.notification", "platform.attachment", "platform.comment",
      "platform.timeline", "platform.task", "platform.search", "platform.export",
      "platform.import", "platform.report", "platform.qr", "platform.dashboard",
      "platform.kpi", "platform.integration", "platform.ai",
    ]) expect(names).toContain(s);
  });

  it("puebla capacidades, dependencias y knowledge graph derivados del descriptor", () => {
    const rt = runtime();
    expect(rt.registries.capabilities.list().length).toBeGreaterThan(14);
    expect(rt.registries.dependencies.of("platform.timeline")).toContain("platform.comment");
    const g = rt.registries.knowledgeGraph.snapshot();
    expect(g.nodes.some((n) => n.id === "service:platform.task")).toBe(true);
    expect(g.edges.some((e) => e.relation === "depends_on")).toBe(true);
  });

  it("prohíbe el registro manual en todos los registros", () => {
    const forged = Symbol("falso");
    const services = new SharedServiceRegistry();
    const caps = new CapabilityRegistry();
    const graph = new KnowledgeGraph();
    const obs = new ObservabilityRegistry();
    expect(
      services.register(forged, {
        name: "x", version: "1", description: "", recordTypes: [],
        commands: [], queries: [], events: [], registeredAt: new Date(),
      }).ok,
    ).toBe(false);
    expect(caps.register(forged, { name: "x", service: "x", permissions: [], description: "" }).ok).toBe(false);
    expect(() => graph.addNode(forged, { id: "n", kind: "service", label: "n" })).toThrow();
    expect(obs.register(forged, "x", async () => ({ healthy: true, detail: "" })).ok).toBe(false);
  });

  it("observabilidad: checkAll reporta los 15 servicios sanos", async () => {
    const rt = runtime();
    const statuses = await rt.registries.observability.checkAll();
    expect(statuses).toHaveLength(15);
    expect(statuses.every((s) => s.healthy)).toBe(true);
  });
});

describe("Multitenancy y permisos", () => {
  it("rechaza contexto sin tenant", async () => {
    const rt = runtime();
    const ctx = createExecutionContext({ principal: ADMIN });
    const r = await rt.kernel.commands.execute(ctx, "platform.task.create", { titulo: "t" });
    expect(r.ok).toBe(false);
  });

  it("aísla datos entre tenants", async () => {
    const rt = runtime();
    const a = await rt.kernel.commands.execute(ctxOf("tenant-a"), "platform.task.create", { titulo: "A" });
    expect(a.ok).toBe(true);
    const listB = await rt.kernel.queries.execute(ctxOf("tenant-b"), "platform.task.list", {});
    expect(listB.ok && (listB.value as unknown[]).length).toBe(0);
    const listA = await rt.kernel.queries.execute(ctxOf("tenant-a"), "platform.task.list", {});
    expect(listA.ok && (listA.value as unknown[]).length).toBe(1);
  });

  it("deniega comandos sin permiso", async () => {
    const rt = runtime();
    const r = await rt.kernel.commands.execute(
      ctxOf("t1", SIN_PERMISOS),
      "platform.task.create",
      { titulo: "no" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("KRN-AUTH-002");
  });
});

describe("Auditoría y configuración por tenant", () => {
  it("audita toda escritura", async () => {
    const rt = runtime();
    await rt.kernel.commands.execute(ctxOf("t1"), "platform.task.create", { titulo: "x" });
    const trail = await rt.audit.list("t1", { service: "platform.task" });
    expect(trail.ok && trail.value.length).toBe(1);
  });

  it("configuración: default de servicio y override por tenant", async () => {
    const rt = runtime();
    const def = await rt.tenantConfig.get("t1", "platform.task.recordatorio-antelacion-horas");
    expect(def.ok && def.value).toBe("24");
    const set = await rt.kernel.commands.execute(ctxOf("t1"), "platform.config.set", {
      key: "platform.task.recordatorio-antelacion-horas",
      value: "48",
    });
    expect(set.ok).toBe(true);
    const over = await rt.tenantConfig.get("t1", "platform.task.recordatorio-antelacion-horas");
    expect(over.ok && over.value).toBe("48");
    // Otro tenant sigue con el default
    const other = await rt.tenantConfig.get("t2", "platform.task.recordatorio-antelacion-horas");
    expect(other.ok && other.value).toBe("24");
  });
});

describe("Servicios (adaptadores Fake = modo offline)", () => {
  it("notification: preferencias filtran destinatarios y queue→delivered", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await rt.kernel.commands.execute(ctx, "platform.notification.preference.create", {
      data: { destinatarioId: "u-2", canal: "email", habilitado: false },
    });
    const q = await rt.kernel.commands.execute(ctx, "platform.notification.queue", {
      canal: "email", asunto: "hola", cuerpo: "mundo", destinatarios: ["u-1", "u-2"],
    });
    expect(q.ok).toBe(true);
    const pending = await rt.kernel.queries.execute(ctx, "platform.notification.pending", {});
    expect(pending.ok).toBe(true);
    const [notif] = pending.ok ? (pending.value as { id: string; data: Record<string, unknown> }[]) : [];
    expect((notif.data["destinatarios"] as string[])).toEqual(["u-1"]);
    const mark = await rt.kernel.commands.execute(ctx, "platform.notification.markDelivered", { id: notif.id });
    expect(mark.ok).toBe(true);
  });

  it("attachment: versionado y URL firmada", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const hash = "a".repeat(64);
    const v1 = await rt.kernel.commands.execute(ctx, "platform.attachment.register", {
      entityRef: "e-1", nombreArchivo: "a.pdf", mimeType: "application/pdf", tamanoBytes: 10, hashSha256: hash,
    });
    expect(v1.ok).toBe(true);
    const v2 = await rt.kernel.commands.execute(ctx, "platform.attachment.register", {
      entityRef: "e-1", nombreArchivo: "a.pdf", mimeType: "application/pdf", tamanoBytes: 12,
      hashSha256: "b".repeat(64), attachmentId: (v1 as { value: { id: string } }).value.id,
    });
    expect(v2.ok).toBe(true);
    const list = await rt.kernel.queries.execute(ctx, "platform.attachment.byEntity", { entityRef: "e-1" });
    const rows = list.ok ? (list.value as { status: string }[]) : [];
    expect(rows.filter((r) => r.status === "superseded")).toHaveLength(1);
    const url = await rt.kernel.queries.execute(ctx, "platform.attachment.signedUrl", {
      id: (v2 as { value: { id: string } }).value.id,
    });
    expect(url.ok).toBe(true);
  });

  it("comment: hilos, menciones, edición solo del autor", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const c = await rt.kernel.commands.execute(ctx, "platform.comment.create", {
      entityRef: "e-1", texto: "hola @maria revisa",
    });
    expect(c.ok).toBe(true);
    const id = (c as { value: { id: string } }).value.id;
    const otro = ctxOf("t1", { ...ADMIN, id: "otro" });
    const edit = await rt.kernel.commands.execute(otro, "platform.comment.edit", { id, texto: "x" });
    expect(edit.ok).toBe(false);
  });

  it("timeline: se proyecta desde eventos, nunca directo", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await rt.kernel.commands.execute(ctx, "platform.comment.create", { entityRef: "e-9", texto: "evento" });
    await drainOutbox(rt);
    const recent = await rt.kernel.queries.execute(ctx, "platform.timeline.recent", {});
    expect(recent.ok && (recent.value as unknown[]).length).toBeGreaterThan(0);
  });

  it("timeline.record: módulos proyectan sus eventos (idempotente) y query filtra", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-rec");
    const base = {
      entityRef: "activo:A1",
      eventType: "modulo.demo.creado",
      actorId: "u-7",
      occurredAt: "2024-01-10T10:00:00.000Z",
      resumen: "creado",
      estado: "OPERATIVO",
    };
    const r1 = await rt.kernel.commands.execute(ctx, "platform.timeline.record", { entryId: "ev-1", ...base });
    expect(r1.ok && (r1.value as { idempotente: boolean }).idempotente).toBe(false);
    // Reentrega del mismo evento ⇒ idempotente, no duplica.
    const r2 = await rt.kernel.commands.execute(ctx, "platform.timeline.record", { entryId: "ev-1", ...base });
    expect(r2.ok && (r2.value as { idempotente: boolean }).idempotente).toBe(true);
    await rt.kernel.commands.execute(ctx, "platform.timeline.record", {
      entryId: "ev-2", ...base, eventType: "modulo.demo.retirado", estado: "RETIRADO",
      occurredAt: "2024-02-01T10:00:00.000Z", entidadRelacionada: "activo:B2",
    });
    // Filtro por estado.
    const soloRetiro = await rt.kernel.queries.execute(ctx, "platform.timeline.query", { estado: "RETIRADO" });
    expect(soloRetiro.ok && (soloRetiro.value as unknown[]).length).toBe(1);
    // Filtro por actor + rango de fechas.
    const enEnero = await rt.kernel.queries.execute(ctx, "platform.timeline.query", {
      actorId: "u-7", desde: "2024-01-01T00:00:00.000Z", hasta: "2024-01-31T23:59:59.000Z",
    });
    expect(enEnero.ok && (enEnero.value as unknown[]).length).toBe(1);
    // Filtro por entidad relacionada.
    const rel = await rt.kernel.queries.execute(ctx, "platform.timeline.query", { entidadRelacionada: "activo:B2" });
    expect(rel.ok && (rel.value as unknown[]).length).toBe(1);
  });

  it("timeline.query: entityRef se filtra en el almacén (no queda fuera de la ventana de límite)", async () => {
    // Regresión LITE-09: con muchos eventos de OTROS activos, el filtro por
    // entityRef debe aplicarse en el almacén (dataEquals) y NO depender de una
    // ventana global de las primeras N filas por created_at. Antes, el activo
    // buscado quedaba fuera de esa ventana y la ficha mostraba «Sin eventos».
    const rt = runtime();
    const ctx = ctxOf("t-vol");
    // 600 eventos de un activo "ruidoso" (> ventana de 500 del handler)…
    for (let i = 0; i < 600; i += 1) {
      await rt.kernel.commands.execute(ctx, "platform.timeline.record", {
        entryId: `ruido-${i}`,
        entityRef: "activo:RUIDO",
        eventType: "modulo.demo.evento",
        actorId: "u-1",
        occurredAt: new Date(2024, 0, 1, 0, 0, i).toISOString(),
        resumen: "ruido",
      });
    }
    // …y UN evento del activo objetivo, insertado al final (created_at posterior).
    await rt.kernel.commands.execute(ctx, "platform.timeline.record", {
      entryId: "objetivo-1",
      entityRef: "activo:OBJETIVO",
      eventType: "historico.jornada",
      actorId: "u-2",
      occurredAt: "2024-06-01T10:00:00.000Z",
      resumen: "jornada histórica",
    });
    const soloObjetivo = await rt.kernel.queries.execute(ctx, "platform.timeline.query", {
      entityRef: "activo:OBJETIVO",
    });
    expect(soloObjetivo.ok && (soloObjetivo.value as unknown[]).length).toBe(1);
    const porEntidad = await rt.kernel.queries.execute(ctx, "platform.timeline.byEntity", {
      entityRef: "activo:OBJETIVO",
    });
    expect(porEntidad.ok && (porEntidad.value as unknown[]).length).toBe(1);
  });

  it("timeline.query: paginación ESTABLE por cursor recorre TODO el historial de la entidad (SEVERO-3)", async () => {
    // Regresión LITE-09 SEVERO-3: sin topes silenciosos. Una entidad con más
    // entradas que un lote de página debe poder recorrerse por completo por
    // cursor, en orden DESC estable por (occurredAt, id), sin duplicados/huecos.
    const rt = runtime();
    const ctx = ctxOf("t-pag");
    const TOTAL = 250;
    for (let i = 0; i < TOTAL; i += 1) {
      await rt.kernel.commands.execute(ctx, "platform.timeline.record", {
        entryId: `pag-${String(i).padStart(4, "0")}`,
        entityRef: "activo:PAG",
        eventType: "historico.jornada",
        actorId: "u-1",
        // Fechas crecientes: la más reciente (i mayor) queda primero (DESC).
        occurredAt: new Date(2025, 0, 1, 0, 0, i).toISOString(),
        resumen: `evento ${i}`,
      });
    }
    const vistos = new Set<string>();
    let cursor: string | null = null;
    let paginas = 0;
    let previo = Number.POSITIVE_INFINITY;
    for (;;) {
      const page: { ok: boolean; value?: unknown } = await rt.kernel.queries.execute(
        ctx,
        "platform.timeline.query",
        { entityRef: "activo:PAG", paginado: true, limit: 100, ...(cursor ? { cursor } : {}) },
      );
      expect(page.ok).toBe(true);
      const v = page.value as { items: Array<{ id: string; data: Record<string, unknown> }>; nextCursor: string | null };
      for (const it of v.items) {
        expect(vistos.has(it.id)).toBe(false); // sin duplicados
        vistos.add(it.id);
        const ts = new Date(String(it.data["occurredAt"])).getTime();
        expect(ts).toBeLessThanOrEqual(previo); // DESC monótono
        previo = ts;
      }
      paginas += 1;
      if (!v.nextCursor) break;
      cursor = v.nextCursor;
      expect(paginas).toBeLessThan(10); // corta bucles infinitos
    }
    expect(vistos.size).toBe(TOTAL); // se alcanzó TODO el historial
    expect(paginas).toBe(3); // 100 + 100 + 50
  });

  it("task: asignación, transición inválida y recordatorios", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const t = await rt.kernel.commands.execute(ctx, "platform.task.create", {
      titulo: "T", venceEl: new Date(Date.now() + 3600_000).toISOString(),
    });
    const id = (t as { value: { id: string } }).value.id;
    expect((await rt.kernel.commands.execute(ctx, "platform.task.assign", { id, asignadoA: "u-2" })).ok).toBe(true);
    expect((await rt.kernel.commands.execute(ctx, "platform.task.complete", { id })).ok).toBe(true);
    // No se puede asignar una tarea completada
    expect((await rt.kernel.commands.execute(ctx, "platform.task.assign", { id, asignadoA: "u-3" })).ok).toBe(false);
    const sweep = await rt.kernel.commands.execute(ctx, "platform.task.sweepReminders", {});
    expect(sweep.ok).toBe(true);
  });

  it("search: indexa por comando y por eventos; búsqueda global y contextual", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await rt.kernel.commands.execute(ctx, "platform.search.indexDocument", {
      documentId: "d1", entityType: "manual", entityRef: "e-1",
      titulo: "Manual de bombas", contenido: "mantenimiento preventivo de bombas centrífugas",
    });
    const g = await rt.kernel.queries.execute(ctx, "platform.search.global", { q: "bombas" });
    expect(g.ok && (g.value as unknown[]).length).toBe(1);
    const c = await rt.kernel.queries.execute(ctx, "platform.search.contextual", { q: "bombas", entityType: "otro" });
    expect(c.ok && (c.value as unknown[]).length).toBe(0);
  });

  it("export: ciclo pending→running→completed y cancelación", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const j = await rt.kernel.commands.execute(ctx, "platform.export.request", { origen: "tabla", formato: "csv" });
    const id = (j as { value: { id: string } }).value.id;
    expect((await rt.kernel.commands.execute(ctx, "platform.export.updateProgress", { id, progreso: 50 })).ok).toBe(true);
    expect((await rt.kernel.commands.execute(ctx, "platform.export.complete", { id })).ok).toBe(true);
    // completado no es cancelable
    expect((await rt.kernel.commands.execute(ctx, "platform.export.cancel", { id })).ok).toBe(false);
  });

  it("import: valida, previsualiza y ejecuta filas vía comandos del pipeline", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const s = await rt.kernel.commands.execute(ctx, "platform.import.createSession", {
      targetCommand: "platform.task.create",
      camposRequeridos: ["titulo"],
      filas: [{ titulo: "T1" }, { otro: "sin titulo" }],
    });
    expect(s.ok).toBe(true);
    const sessionId = (s as { value: { id: string } }).value.id;
    const preview = await rt.kernel.queries.execute(ctx, "platform.import.preview", { sessionId });
    expect(preview.ok && (preview.value as { invalidas: number }).invalidas).toBe(1);
    const exec = await rt.kernel.commands.execute(ctx, "platform.import.execute", { sessionId });
    expect(exec.ok && (exec.value as { importadas: number }).importadas).toBe(1);
    const tasks = await rt.kernel.queries.execute(ctx, "platform.task.list", {});
    expect(tasks.ok && (tasks.value as unknown[]).length).toBe(1);
  });

  it("report: plantilla → job → completado con histórico", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const tpl = await rt.kernel.commands.execute(ctx, "platform.report.template.create", { data: { nombre: "R1" } });
    const templateId = (tpl as { value: { id: string } }).value.id;
    const run = await rt.kernel.commands.execute(ctx, "platform.report.run", { templateId });
    expect(run.ok).toBe(true);
    const jobId = (run as { value: { id: string } }).value.id;
    expect((await rt.kernel.commands.execute(ctx, "platform.report.completeJob", { id: jobId })).ok).toBe(true);
    const hist = await rt.kernel.queries.execute(ctx, "platform.report.history", { templateId });
    expect(hist.ok && (hist.value as unknown[]).length).toBe(1);
  });

  it("qr: emisión, unicidad de código, resolución y revocación", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const tag = await rt.kernel.commands.execute(ctx, "platform.qr.issue", {
      tipo: "qr", entityRef: "activo-1", codigo: "DOP-XYZ1",
    });
    expect(tag.ok).toBe(true);
    const dup = await rt.kernel.commands.execute(ctx, "platform.qr.issue", {
      tipo: "qr", entityRef: "activo-2", codigo: "DOP-XYZ1",
    });
    expect(dup.ok).toBe(false);
    const res = await rt.kernel.commands.execute(ctx, "platform.qr.resolve", { codigo: "DOP-XYZ1" });
    expect(res.ok && (res.value as { entityRef: string }).entityRef).toBe("activo-1");
    const id = (tag as { value: { id: string } }).value.id;
    await rt.kernel.commands.execute(ctx, "platform.qr.revoke", { id });
    expect((await rt.kernel.commands.execute(ctx, "platform.qr.resolve", { codigo: "DOP-XYZ1" })).ok).toBe(false);
  });

  it("dashboard: widgets + layout + composición + preferencias", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const w = await rt.kernel.commands.execute(ctx, "platform.dashboard.widget.create", {
      data: { nombre: "W1", tipo: "kpi", fuente: "kpi:x" },
    });
    const widgetId = (w as { value: { id: string } }).value.id;
    const d = await rt.kernel.commands.execute(ctx, "platform.dashboard.dashboard.create", {
      data: { nombre: "D1", layout: [{ widgetId, x: 0, y: 0, w: 4, h: 2 }] },
    });
    const dashboardId = (d as { value: { id: string } }).value.id;
    const comp = await rt.kernel.queries.execute(ctx, "platform.dashboard.compose", { dashboardId });
    expect(comp.ok && (comp.value as { widgets: unknown[] }).widgets).toHaveLength(1);
    await rt.kernel.commands.execute(ctx, "platform.dashboard.setPreference", { clave: "defecto", valor: dashboardId });
    const prefs = await rt.kernel.queries.execute(ctx, "platform.dashboard.preferences", {});
    expect(prefs.ok && (prefs.value as unknown[]).length).toBe(1);
  });

  it("kpi: definición versionada + snapshot + resultados", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const def = await rt.kernel.commands.execute(ctx, "platform.kpi.definition.create", {
      data: { codigo: "K1", nombre: "KPI 1" },
    });
    const definitionId = (def as { value: { id: string } }).value.id;
    const nv = await rt.kernel.commands.execute(ctx, "platform.kpi.definition.newVersion", { id: definitionId });
    expect(nv.ok && (nv.value as { definicionVersion: number }).definicionVersion).toBe(2);
    await rt.kernel.commands.execute(ctx, "platform.kpi.snapshot", { definitionId, valor: 42, periodo: "2026-08" });
    const res = await rt.kernel.queries.execute(ctx, "platform.kpi.results", { definitionId });
    expect(res.ok && (res.value as unknown[]).length).toBe(1);
  });

  it("integration: conector, habilitación, webhook y despacho encolado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const c = await rt.kernel.commands.execute(ctx, "platform.integration.connector.create", {
      data: { nombre: "ERP", tipo: "rest" },
    });
    const connectorId = (c as { value: { id: string } }).value.id;
    expect((await rt.kernel.commands.execute(ctx, "platform.integration.connector.enable", { id: connectorId })).ok).toBe(true);
    const w = await rt.kernel.commands.execute(ctx, "platform.integration.webhook.register", {
      connectorId, eventoTipo: "platform.task.created", targetPath: "/hooks/task",
    });
    const webhookId = (w as { value: { id: string } }).value.id;
    const disp = await rt.kernel.commands.execute(ctx, "platform.integration.webhook.dispatch", { webhookId });
    expect(disp.ok).toBe(true);
  });

  it("ai platform: Fake Provider, inferencia, costo y sin proveedores reales", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const providers = await rt.kernel.queries.execute(ctx, "platform.ai.providers", {});
    expect(providers.ok && (providers.value as { name: string }[]).map((p) => p.name)).toEqual(["fake"]);
    const inf = await rt.kernel.commands.execute(ctx, "platform.ai.infer", {
      modelo: "modelo-x", prompt: "hola plataforma",
    });
    expect(inf.ok).toBe(true);
    expect((inf as { value: { costUsd: number } }).value.costUsd).toBe(0);
    const costs = await rt.kernel.queries.execute(ctx, "platform.ai.costs", {});
    expect(costs.ok && (costs.value as unknown[]).length).toBe(1);
  });
});

describe("Record Store Fake: concurrencia optimista", () => {
  it("rechaza actualización con versión obsoleta", async () => {
    const store = new FakeRecordStore();
    const uow = { registerEvent() {} } as never;
    await store.insert(uow, {
      id: "r1", tenantId: "t1", service: "s", recordType: "x",
      status: "a", data: {}, createdBy: "u",
    });
    const first = await store.update(uow, "t1", "r1", 1, { status: "b" });
    expect(first.ok).toBe(true);
    const stale = await store.update(uow, "t1", "r1", 1, { status: "c" });
    expect(stale.ok).toBe(false);
  });
});
