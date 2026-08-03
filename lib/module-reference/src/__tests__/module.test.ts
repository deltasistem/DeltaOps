/**
 * DGP-004 · Reference Module — Pruebas con adaptadores Fake (offline).
 * Cubre: dominio, application, policies, comandos, consultas, read model,
 * proyección, auditoría, multitenancy, permisos, offline (idempotencia,
 * conflicto, replay), concurrencia y shared services (search, ai, kpi).
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  activarElemento,
  archivarElemento,
  crearElemento,
  createReferenceRuntime,
  editarElemento,
  MODULO,
  policiesDelModulo,
  referenceModule,
  type ReferenceRuntime,
} from "..";

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...referenceModule({ repository: null as never, readModel: null as never }).permissions,
  ]),
];

const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };
const LECTOR: Principal = { id: "u-2", rol: "lector", permisos: ["modulo.referencia.read"], capacidades: [] };

function runtime(): ReferenceRuntime {
  return createReferenceRuntime({ logger: new MemoryLogger() });
}

function ctxOf(tenantId: string, principal: Principal = ADMIN): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId } });
}

async function drain(rt: ReferenceRuntime): Promise<void> {
  await rt.platform.kernel.outboxProcessor.processPending();
}

const exec = (rt: ReferenceRuntime, ctx: ExecutionContext, cmd: string, input: unknown) =>
  rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (rt: ReferenceRuntime, ctx: ExecutionContext, q: string, input: unknown) =>
  rt.platform.kernel.queries.execute(ctx, q, input);

/* ------------------------------- Dominio ---------------------------------- */

describe("Dominio: aggregate Elemento de Referencia", () => {
  const base = crearElemento({
    id: "e1", tenantId: "t1", nombre: "Elemento A", descripcion: "d",
    actorId: "u", maxLongitudNombre: 120, ahora: new Date(),
  });

  it("crea en BORRADOR con versión 1 y evento creado", () => {
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(base.value.elemento.estado).toBe("BORRADOR");
    expect(base.value.elemento.version).toBe(1);
    expect(base.value.evento.tipo).toBe("modulo.referencia.creado");
  });

  it("rechaza nombre vacío o demasiado largo", () => {
    expect(crearElemento({ id: "x", tenantId: "t", nombre: "  ", descripcion: "", actorId: "u", maxLongitudNombre: 120, ahora: new Date() }).ok).toBe(false);
    expect(crearElemento({ id: "x", tenantId: "t", nombre: "a".repeat(121), descripcion: "", actorId: "u", maxLongitudNombre: 120, ahora: new Date() }).ok).toBe(false);
  });

  it("máquina de estados: BORRADOR→ACTIVO→ARCHIVADO; ARCHIVADO inmutable", () => {
    if (!base.ok) return;
    const activado = activarElemento(base.value.elemento, "u", new Date());
    expect(activado.ok).toBe(true);
    if (!activado.ok) return;
    expect(activado.value.elemento.estado).toBe("ACTIVO");
    // ACTIVO no puede re-activarse
    expect(activarElemento(activado.value.elemento, "u", new Date()).ok).toBe(false);
    const archivado = archivarElemento(activado.value.elemento, "u", new Date());
    expect(archivado.ok).toBe(true);
    if (!archivado.ok) return;
    // ARCHIVADO: sin transiciones ni edición
    expect(activarElemento(archivado.value.elemento, "u", new Date()).ok).toBe(false);
    expect(editarElemento(archivado.value.elemento, { nombre: "N" }, "u", 120, new Date()).ok).toBe(false);
  });

  it("policies puras: puede-editar y puede-archivar", () => {
    const [editar, archivar] = policiesDelModulo();
    expect(editar!.evaluate(null, { estado: "BORRADOR" }).allow).toBe(true);
    expect(editar!.evaluate(null, { estado: "ARCHIVADO" }).allow).toBe(false);
    expect(archivar!.evaluate(null, { estado: "ACTIVO" }).allow).toBe(true);
    expect(archivar!.evaluate(null, { estado: "BORRADOR" }).allow).toBe(false);
    expect(archivar!.evaluate(null, { estado: "BORRADOR", archivadoDirecto: true }).allow).toBe(true);
  });
});

/* --------------------------- Registro automático -------------------------- */

describe("Registro automático del módulo", () => {
  it("inscribe el módulo en los 5 registros oficiales sin registro manual", () => {
    const rt = runtime();
    const names = rt.platform.registries.services.list().map((s) => s.name);
    expect(names).toContain(MODULO);
    expect(names).toHaveLength(16); // 15 plataforma + módulo
    const caps = rt.platform.registries.capabilities.list().map((c) => c.name);
    expect(caps).toContain("gestionar-elementos-referencia");
    expect(rt.platform.registries.dependencies.of(MODULO)).toContain("platform.search");
    const g = rt.platform.registries.knowledgeGraph.snapshot();
    expect(g.nodes.some((n) => n.id === `service:${MODULO}`)).toBe(true);
    expect(g.edges.some((e) => e.from === `service:${MODULO}` && e.relation === "emits")).toBe(true);
  });

  it("observabilidad incluye el health check del módulo", async () => {
    const rt = runtime();
    const statuses = await rt.platform.registries.observability.checkAll();
    const mod = statuses.find((s) => s.service === MODULO);
    expect(mod?.healthy).toBe(true);
  });
});

/* ---------------------- Pipeline completo (comandos) ---------------------- */

describe("Comandos y pipeline completo", () => {
  it("crear → proyección → read model → listar (CQRS)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const r = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Elemento Uno", descripcion: "primera" });
    expect(r.ok).toBe(true);
    await drain(rt);
    const listado = await query(rt, ctx, `${MODULO}.listar`, {});
    expect(listado.ok).toBe(true);
    if (!listado.ok) return;
    expect((listado.value as { nombre: string }[]).map((x) => x.nombre)).toContain("Elemento Uno");
  });

  it("nombre único por tenant (domain service)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Repetido" });
    const dup = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "repetido" });
    expect(dup.ok).toBe(false);
  });

  it("activar y archivar respetan policies y transiciones", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creado = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Ciclo" });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;

    // Archivar en BORRADOR: la policy lo prohíbe por defecto
    const arch1 = await exec(rt, ctx, `${MODULO}.archivar`, { id, expectedVersion: 1 });
    expect(arch1.ok).toBe(false);

    const act = await exec(rt, ctx, `${MODULO}.activar`, { id, expectedVersion: 1 });
    expect(act.ok).toBe(true);
    const arch2 = await exec(rt, ctx, `${MODULO}.archivar`, { id, expectedVersion: 2 });
    expect(arch2.ok).toBe(true);

    // ARCHIVADO inmutable (policy puede-editar)
    const edit = await exec(rt, ctx, `${MODULO}.editar`, { id, expectedVersion: 3, nombre: "Nuevo" });
    expect(edit.ok).toBe(false);
  });

  it("configuración por tenant: archivado-directo habilita archivar desde BORRADOR", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-cfg");
    await exec(rt, ctx, "platform.config.set", {
      key: `${MODULO}.archivado-directo`, value: "true",
    });
    const creado = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Directo" });
    if (!creado.ok) throw new Error("setup");
    const arch = await exec(rt, ctx, `${MODULO}.archivar`, {
      id: (creado.value as { id: string }).id, expectedVersion: 1,
    });
    expect(arch.ok).toBe(true);
  });

  it("permisos: un lector no puede crear (KRN-AUTH-002)", async () => {
    const rt = runtime();
    const r = await exec(rt, ctxOf("t1", LECTOR), `${MODULO}.crear`, { nombre: "X" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });

  it("multitenancy: los datos no cruzan tenants", async () => {
    const rt = runtime();
    await exec(rt, ctxOf("t-a"), `${MODULO}.crear`, { nombre: "Solo A" });
    await drain(rt);
    const b = await query(rt, ctxOf("t-b"), `${MODULO}.listar`, {});
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value).toHaveLength(0);
  });

  it("auditoría: cada escritura queda registrada", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-aud");
    const creado = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Auditado" });
    if (!creado.ok) throw new Error("setup");
    const trail = await rt.platform.audit.list("t-aud", { service: MODULO });
    expect(trail.ok).toBe(true);
    if (!trail.ok) return;
    expect(trail.value.some((a) => a.action === "crear")).toBe(true);
  });
});

/* ------------------------------- Offline ---------------------------------- */

describe("Offline: idempotencia, conflictos y replay", () => {
  it("crear offline con id de cliente es idempotente en re-sincronización", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-off");
    const clientId = crypto.randomUUID();
    const r1 = await exec(rt, ctx, `${MODULO}.crear`, { id: clientId, nombre: "Offline" });
    const r2 = await exec(rt, ctx, `${MODULO}.crear`, { id: clientId, nombre: "Offline" });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
    const list = await rt.adapters.repository.list("t-off", {});
    expect(list.ok && list.value).toHaveLength(1);
  });

  it("edición offline detecta conflicto por versión (concurrencia optimista)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-off");
    const creado = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Conflicto" });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const e1 = await exec(rt, ctx, `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "en línea" });
    expect(e1.ok).toBe(true);
    // Cliente offline sincroniza tarde con la versión vieja → conflicto
    const e2 = await exec(rt, ctx, `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "offline" });
    expect(e2.ok).toBe(false);
    if (e2.ok) return;
    expect(e2.error.code).toBe("KRN-CFL-001");
  });

  it("replay: reproyectar reconstruye el read model desde los aggregates", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-rp");
    await exec(rt, ctx, `${MODULO}.crear`, { nombre: "R1" });
    await exec(rt, ctx, `${MODULO}.crear`, { nombre: "R2" });
    await drain(rt);
    const re = await exec(rt, ctx, `${MODULO}.reproyectar`, {});
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    expect((re.value as { proyectados: number }).proyectados).toBe(2);
    const listado = await query(rt, ctx, `${MODULO}.listar`, {});
    expect(listado.ok && (listado.value as unknown[]).length).toBe(2);
  });

  it("la proyección de eventos es idempotente (reentrega del outbox)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-idem");
    await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Reentrega" });
    await drain(rt);
    await drain(rt); // segunda pasada: no debe duplicar ni fallar
    const listado = await query(rt, ctx, `${MODULO}.listar`, {});
    expect(listado.ok && (listado.value as unknown[]).length).toBe(1);
  });
});

/* --------------------------- Shared Services ------------------------------ */

describe("Shared services del módulo", () => {
  it("search: los elementos quedan indexados automáticamente", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-s");
    await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Buscable único", descripcion: "contenido" });
    await drain(rt);
    const res = await query(rt, ctx, "platform.search.global", { q: "Buscable" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.value as unknown[]).length).toBeGreaterThan(0);
  });

  it("activación dispara notificación y KPI snapshot", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-fx");
    const creado = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Con efectos" });
    if (!creado.ok) throw new Error("setup");
    await exec(rt, ctx, `${MODULO}.activar`, { id: (creado.value as { id: string }).id, expectedVersion: 1 });
    await drain(rt);
    const defs = await query(rt, ctx, "platform.kpi.definition.list", {});
    expect(defs.ok).toBe(true);
    if (!defs.ok) return;
    const def = (defs.value as { id: string; data: Record<string, unknown> }[]).find(
      (d) => d.data["codigo"] === "kpi-ref-activos",
    );
    expect(def).toBeDefined();
    const kpis = await query(rt, ctx, "platform.kpi.results", { definitionId: def!.id });
    expect(kpis.ok).toBe(true);
    if (!kpis.ok) return;
    expect((kpis.value as unknown[]).length).toBeGreaterThan(0);
    // Notificación en cola para el creador
    const pend = await query(rt, ctx, "platform.notification.pending", {});
    expect(pend.ok).toBe(true);
  });

  it("ai hook: sugerirDescripcion responde con el Fake Provider", async () => {
    const rt = runtime();
    const r = await exec(rt, ctxOf("t-ai"), `${MODULO}.sugerirDescripcion`, { nombre: "Neutro" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(String((r.value as { sugerencia: string }).sugerencia).length).toBeGreaterThan(0);
  });

  it("comentarios y timeline funcionan sobre entityRef del elemento", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-tl");
    const creado = await exec(rt, ctx, `${MODULO}.crear`, { nombre: "Comentable" });
    if (!creado.ok) throw new Error("setup");
    const ref = `ref:${(creado.value as { id: string }).id}`;
    await exec(rt, ctx, "platform.comment.create", { entityRef: ref, texto: "hola @admin-1" });
    await drain(rt);
    const tl = await query(rt, ctx, "platform.timeline.byEntity", { entityRef: ref });
    expect(tl.ok).toBe(true);
    if (!tl.ok) return;
    expect((tl.value as unknown[]).length).toBeGreaterThan(0);
  });

  it("consola técnica del módulo expone contrato y configuración efectiva", async () => {
    const rt = runtime();
    const r = await query(rt, ctxOf("t-c"), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { estados: string[]; configuracion: Record<string, string> };
    expect(v.estados).toEqual(["BORRADOR", "ACTIVO", "ARCHIVADO"]);
    expect(v.configuracion["max-longitud-nombre"]).toBe("120");
  });
});
