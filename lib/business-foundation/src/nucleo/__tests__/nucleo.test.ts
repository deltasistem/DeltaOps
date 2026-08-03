/**
 * DGP-006 · Business Foundation Framework — Pruebas del núcleo genérico.
 *
 * Cubre: definición→Zod, invariantes del aggregate, máquina de estados
 * (válida/ilegal/guard/permiso), repositorio fake, y CRUD end-to-end sobre un
 * runtime de plataforma FAKE (createPlatformRuntime sin pool → FakeRecordStore
 * + FakeAuditTrail): crear/editar/conflicto de versión/eliminar/transicionar/
 * listar/obtener, autorización denegada, aislamiento multitenant, evento en
 * outbox → drain e idempotencia por opId.
 *
 * Módulo de prueba "demo": 100% neutro, sin ningún concepto de negocio.
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
  type UnitOfWork,
} from "@workspace/kernel";
import {
  createPlatformRuntime,
  FakeRecordStore,
  officialServices,
  type PlatformRuntime,
} from "@workspace/platform";
import { crearModuloGenerico } from "../bootstrap";
import { camposAZod, type DefinicionModulo } from "../definicion";
import { RuntimeEntidad } from "../entidad";
import { MaquinaEstados } from "../maquina-estados";
import { RepositorioGenerico } from "../repositorio";

/* --------------------------- Definición demo ----------------------------- */

const SERVICIO = "modulo.demo";
const ENTIDAD = "ficha";

const PERMISOS = {
  leer: `${SERVICIO}.read`,
  crear: `${SERVICIO}.write`,
  editar: `${SERVICIO}.write`,
  eliminar: `${SERVICIO}.write`,
  admin: `${SERVICIO}.admin`,
  publicar: `${SERVICIO}.publicar`,
};

const definicionFicha = {
  nombre: ENTIDAD,
  etiqueta: "Ficha",
  servicio: SERVICIO,
  campos: [
    { nombre: "titulo", tipo: "texto", requerido: true, longitudMax: 120, buscable: true },
    { nombre: "cantidad", tipo: "numero", filtrable: true },
    { nombre: "categoria", tipo: "enum", enumValores: ["a", "b", "c"] },
  ],
  maquinaEstados: {
    estados: [
      { nombre: "borrador", inicial: true },
      { nombre: "publicado" },
      { nombre: "archivado", final: true },
    ],
    transiciones: [
      { de: "borrador", a: "publicado", comando: "publicar", permiso: PERMISOS.publicar },
      { de: "publicado", a: "archivado", comando: "archivar" },
      {
        de: "borrador",
        a: "archivado",
        comando: "archivar",
        guard: (d: Record<string, unknown>) =>
          (d["titulo"] as string)?.length > 0 ? true : "Se requiere título para archivar",
      },
    ],
  },
  permisos: PERMISOS,
  capacidades: [
    {
      name: "gestionar-fichas-demo",
      permissions: [PERMISOS.crear, PERMISOS.leer, PERMISOS.publicar],
      description: "Ciclo de vida de fichas demo",
    },
  ],
  configuracionDefaults: { "max-fichas": "1000" },
} as const;

const definicionModulo: DefinicionModulo = {
  servicio: SERVICIO,
  etiqueta: "Módulo Demo",
  entidades: [definicionFicha],
  capacidades: definicionFicha.capacidades,
  permisos: [PERMISOS.leer, PERMISOS.crear, PERMISOS.admin, PERMISOS.publicar],
  dependeDe: ["platform.config"],
};

/* ----------------------------- Infra de test ----------------------------- */

const modulo = () => crearModuloGenerico(definicionModulo);

const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...modulo().permissions]),
];

const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };
const LECTOR: Principal = { id: "u-2", rol: "lector", permisos: [PERMISOS.leer], capacidades: [] };
const EDITOR: Principal = {
  id: "u-3",
  rol: "editor",
  permisos: [PERMISOS.leer, PERMISOS.crear, PERMISOS.editar],
  capacidades: [],
};

function runtime(): PlatformRuntime {
  return createPlatformRuntime({ logger: new MemoryLogger(), extraServices: [modulo()] });
}

function ctxOf(tenantId: string, principal: Principal = ADMIN): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId } });
}

const exec = (rt: PlatformRuntime, ctx: ExecutionContext, cmd: string, input: unknown) =>
  rt.kernel.commands.execute(ctx, cmd, input);
const query = (rt: PlatformRuntime, ctx: ExecutionContext, q: string, input: unknown) =>
  rt.kernel.queries.execute(ctx, q, input);
const drain = (rt: PlatformRuntime) => rt.kernel.outboxProcessor.processPending();

const CREAR = `${SERVICIO}.${ENTIDAD}.crear`;
const EDITAR = `${SERVICIO}.${ENTIDAD}.editar`;
const ELIMINAR = `${SERVICIO}.${ENTIDAD}.eliminar`;
const TRANSICIONAR = `${SERVICIO}.${ENTIDAD}.transicionar`;
const OBTENER = `${SERVICIO}.${ENTIDAD}.obtener`;
const LISTAR = `${SERVICIO}.${ENTIDAD}.listar`;

/* ============================ 1. Definición → Zod ========================= */

describe("Definición → esquema Zod", () => {
  it("deriva un esquema que valida datos correctos y rechaza inválidos", () => {
    const schema = camposAZod(definicionFicha.campos as never);
    expect(schema.safeParse({ titulo: "Hola", cantidad: 3, categoria: "a" }).success).toBe(true);
    // título requerido faltante
    expect(schema.safeParse({ cantidad: 3 }).success).toBe(false);
    // enum fuera de rango
    expect(schema.safeParse({ titulo: "x", categoria: "z" }).success).toBe(false);
    // longitud máxima
    expect(schema.safeParse({ titulo: "a".repeat(121) }).success).toBe(false);
  });
});

/* ============================ 2. Invariantes ============================== */

describe("RuntimeEntidad: invariantes y versión optimista", () => {
  const rt = new RuntimeEntidad(definicionFicha as never);

  it("crea en estado inicial con versión 1 y evento .creada", () => {
    const r = rt.crear({ id: "e1", tenantId: "t1", data: { titulo: "T" }, actorId: "u", ahora: new Date() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.registro.estado).toBe("borrador");
    expect(r.value.registro.version).toBe(1);
    expect(r.value.evento.tipo).toBe(`${SERVICIO}.${ENTIDAD}.creada`);
    expect(r.value.evento.payload["id"]).toBe("e1");
  });

  it("rechaza datos que violan invariantes al crear", () => {
    const r = rt.crear({ id: "e2", tenantId: "t1", data: { cantidad: 1 }, actorId: "u", ahora: new Date() });
    expect(r.ok).toBe(false);
  });

  it("actualizar sube la versión y emite .actualizada", () => {
    const c = rt.crear({ id: "e3", tenantId: "t1", data: { titulo: "T" }, actorId: "u", ahora: new Date() });
    if (!c.ok) throw new Error("setup");
    const u = rt.actualizar(c.value.registro, { titulo: "T2" }, "u", new Date());
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.value.registro.version).toBe(2);
    expect(u.value.evento.tipo).toBe(`${SERVICIO}.${ENTIDAD}.actualizada`);
  });
});

/* ========================== 3. Máquina de estados ========================= */

describe("MaquinaEstados: transiciones", () => {
  const maquina = new MaquinaEstados(definicionFicha.maquinaEstados as never);

  it("permite una transición válida", () => {
    const r = maquina.evaluar("borrador", "publicar", { titulo: "T" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.estadoNuevo).toBe("publicado");
  });

  it("rechaza una transición ilegal (conflict)", () => {
    const r = maquina.evaluar("archivado", "publicar", {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-CFL-001");
  });

  it("respeta el guard que rechaza con motivo", () => {
    const r = maquina.evaluar("borrador", "archivar", { titulo: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain("título");
  });

  it("aplica el permiso declarado en la transición (a nivel de definición)", () => {
    const t = maquina.buscarTransicion("borrador", "publicar");
    expect(t?.permiso).toBe(PERMISOS.publicar);
  });
});

/* ============================ 4. Repositorio ============================== */

describe("RepositorioGenerico sobre FakeRecordStore", () => {
  const fakeUow = {} as unknown as UnitOfWork;

  it("inserta, lee, actualiza (versión) y lista", async () => {
    const store = new FakeRecordStore();
    const repo = new RepositorioGenerico(store, definicionFicha as never);
    const ins = await repo.insertar(fakeUow, {
      id: "r1", tenantId: "t1", estado: "borrador", version: 1,
      data: { titulo: "R" }, createdBy: "u", updatedAt: new Date(),
    });
    expect(ins.ok).toBe(true);
    const got = await repo.porId("t1", "r1");
    expect(got.ok && got.value?.id).toBe("r1");
    const upd = await repo.actualizar(fakeUow, {
      id: "r1", tenantId: "t1", estado: "borrador", version: 2,
      data: { titulo: "R2" }, createdBy: "u", updatedAt: new Date(),
    }, 1);
    expect(upd.ok).toBe(true);
    const lista = await repo.listar("t1");
    expect(lista.ok && lista.value).toHaveLength(1);
  });

  it("detecta conflicto de versión en actualizar", async () => {
    const store = new FakeRecordStore();
    const repo = new RepositorioGenerico(store, definicionFicha as never);
    await repo.insertar(fakeUow, {
      id: "r2", tenantId: "t1", estado: "borrador", version: 1,
      data: { titulo: "R" }, createdBy: "u", updatedAt: new Date(),
    });
    const conflicto = await repo.actualizar(fakeUow, {
      id: "r2", tenantId: "t1", estado: "borrador", version: 99,
      data: { titulo: "X" }, createdBy: "u", updatedAt: new Date(),
    }, 99);
    expect(conflicto.ok).toBe(false);
  });
});

/* ======================= 5. CRUD end-to-end (pipeline) ==================== */

describe("Bootstrap: registro automático del módulo genérico", () => {
  it("inscribe el módulo, capacidades y recordTypes en los registros", () => {
    const rt = runtime();
    const names = rt.registries.services.list().map((s) => s.name);
    expect(names).toContain(SERVICIO);
    const caps = rt.registries.capabilities.list().map((c) => c.name);
    expect(caps).toContain("gestionar-fichas-demo");
    const g = rt.registries.knowledgeGraph.snapshot();
    expect(g.edges.some((e) => e.from === `service:${SERVICIO}` && e.relation === "emits")).toBe(true);
  });

  it("aplica defaults de configuración del módulo por tenant (clave prefijada)", async () => {
    const rt = runtime();
    // Convenio único: se declara sin prefijo, se consulta CON prefijo de servicio.
    const cfg = await rt.tenantConfig.get("t1", `${SERVICIO}.max-fichas`);
    expect(cfg.ok && cfg.value).toBe("1000");
  });
});

/* ================= 5b. Composición del contrato (ExtrasModulo) ============ */

describe("ExtrasModulo compone el contrato completo (dedupe por nombre)", () => {
  const rt = createPlatformRuntime({
    logger: new MemoryLogger(),
    extraServices: [
      crearModuloGenerico(definicionModulo, {
        eventos: [`${SERVICIO}.custom`, `${SERVICIO}.${ENTIDAD}.creada`], // el 2º ya existe → dedupe
        capacidades: [
          { name: "reportar-fichas-demo", permissions: [PERMISOS.leer], description: "Reportes" },
          // duplicado por name → se ignora
          { name: "gestionar-fichas-demo", permissions: [], description: "dup" },
        ],
        permisos: [`${SERVICIO}.exportar`, PERMISOS.admin], // admin ya existe → dedupe
        dependeDe: ["platform.search", "platform.config"], // config ya existe → dedupe
        configuracionDefaults: { "retencion-dias": "30" },
      }),
    ],
  });
  const def = crearModuloGenerico(definicionModulo, {
    eventos: [`${SERVICIO}.custom`, `${SERVICIO}.${ENTIDAD}.creada`],
    capacidades: [
      { name: "reportar-fichas-demo", permissions: [PERMISOS.leer], description: "Reportes" },
      { name: "gestionar-fichas-demo", permissions: [], description: "dup" },
    ],
    permisos: [`${SERVICIO}.exportar`, PERMISOS.admin],
    dependeDe: ["platform.search", "platform.config"],
    configuracionDefaults: { "retencion-dias": "30" },
  });

  it("añade eventos extra sin duplicar los declarados", () => {
    expect(def.events).toContain(`${SERVICIO}.custom`);
    const creadaCount = def.events.filter((e) => e === `${SERVICIO}.${ENTIDAD}.creada`).length;
    expect(creadaCount).toBe(1);
  });

  it("fusiona capacidades deduplicando por name", () => {
    const nombres = def.capabilities.map((c) => c.name);
    expect(nombres).toContain("reportar-fichas-demo");
    expect(nombres.filter((n) => n === "gestionar-fichas-demo")).toHaveLength(1);
  });

  it("fusiona permisos y dependencias deduplicando por valor", () => {
    expect(def.permissions).toContain(`${SERVICIO}.exportar`);
    expect(def.permissions.filter((p) => p === PERMISOS.admin)).toHaveLength(1);
    expect(def.dependsOn).toContain("platform.search");
    expect(def.dependsOn.filter((d) => d === "platform.config")).toHaveLength(1);
  });

  it("fusiona configuracionDefaults extra (consultable con clave prefijada)", async () => {
    const cfg = await rt.tenantConfig.get("t1", `${SERVICIO}.retencion-dias`);
    expect(cfg.ok && cfg.value).toBe("30");
  });
});

/* ==================== 5c. Estado inicial neutro por defecto =============== */

describe("Estado inicial neutro cuando no hay máquina de estados", () => {
  it("usa 'vigente' (vocabulario neutro) al crear sin máquina declarada", () => {
    const sinMaquina = { ...definicionFicha, maquinaEstados: undefined } as never;
    const runtimeEntidad = new RuntimeEntidad(sinMaquina);
    const r = runtimeEntidad.crear({
      id: "n1", tenantId: "t1", data: { titulo: "Sin máquina" }, actorId: "u", ahora: new Date(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.registro.estado).toBe("vigente");
  });
});

describe("CRUD end-to-end sobre runtime fake", () => {
  it("crear → drain → listar (proyección de outbox sin fallar)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const r = await exec(rt, ctx, CREAR, { data: { titulo: "Uno" } });
    expect(r.ok).toBe(true);
    await drain(rt);
    const lista = await query(rt, ctx, LISTAR, {});
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect((lista.value as { data: Record<string, unknown> }[]).map((x) => x.data["titulo"])).toContain("Uno");
  });

  it("obtener devuelve el registro creado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creado = await exec(rt, ctx, CREAR, { data: { titulo: "Detalle" } });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const got = await query(rt, ctx, OBTENER, { id });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect((got.value as { id: string }).id).toBe(id);
  });

  it("editar sube versión; conflicto de versión falla (concurrencia optimista)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creado = await exec(rt, ctx, CREAR, { data: { titulo: "Editable" } });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const e1 = await exec(rt, ctx, EDITAR, { id, version: 1, data: { titulo: "Editado" } });
    expect(e1.ok).toBe(true);
    // Cliente con versión vieja → conflicto
    const e2 = await exec(rt, ctx, EDITAR, { id, version: 1, data: { titulo: "Otra" } });
    expect(e2.ok).toBe(false);
    if (e2.ok) return;
    expect(e2.error.code).toBe("KRN-CFL-001");
  });

  it("eliminar hace borrado suave (no aparece en listado)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creado = await exec(rt, ctx, CREAR, { data: { titulo: "Borrable" } });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const del = await exec(rt, ctx, ELIMINAR, { id });
    expect(del.ok).toBe(true);
    const lista = await query(rt, ctx, LISTAR, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(0);
  });

  it("transicionar aplica la máquina de estados (borrador → publicado)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creado = await exec(rt, ctx, CREAR, { data: { titulo: "Publicable" } });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const tr = await exec(rt, ctx, TRANSICIONAR, { id, version: 1, comando: "publicar" });
    expect(tr.ok).toBe(true);
    if (!tr.ok) return;
    expect((tr.value as { estado: string }).estado).toBe("publicado");
    // Transición ilegal desde publicado con comando inexistente
    const ilegal = await exec(rt, ctx, TRANSICIONAR, { id, version: 2, comando: "publicar" });
    expect(ilegal.ok).toBe(false);
  });

  it("transición con permiso específico: un editor sin permiso 'publicar' es denegado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1", EDITOR);
    const creado = await exec(rt, ctx, CREAR, { data: { titulo: "P" } });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const tr = await exec(rt, ctx, TRANSICIONAR, { id, version: 1, comando: "publicar" });
    expect(tr.ok).toBe(false);
    if (tr.ok) return;
    expect(tr.error.code).toBe("KRN-AUTH-002");
  });

  it("autorización: un lector no puede crear (KRN-AUTH-002)", async () => {
    const rt = runtime();
    const r = await exec(rt, ctxOf("t1", LECTOR), CREAR, { data: { titulo: "X" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });

  it("multitenancy: los datos no cruzan tenants", async () => {
    const rt = runtime();
    await exec(rt, ctxOf("t-a"), CREAR, { data: { titulo: "Solo A" } });
    const b = await query(rt, ctxOf("t-b"), LISTAR, {});
    expect(b.ok && (b.value as unknown[]).length).toBe(0);
  });

  it("evento de dominio queda en el outbox y se procesa en el drain", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-ev");
    let recibido = 0;
    rt.kernel.dispatcher.subscribe(`${SERVICIO}.${ENTIDAD}.creada`, "test:contador", () => {
      recibido += 1;
      return Promise.resolve({ ok: true, value: undefined });
    });
    await exec(rt, ctx, CREAR, { data: { titulo: "Con evento" } });
    await drain(rt);
    expect(recibido).toBe(1);
  });

  it("idempotencia offline: reintento de crear con mismo id no duplica", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-off");
    const cid = crypto.randomUUID();
    const r1 = await exec(rt, ctx, CREAR, { id: cid, data: { titulo: "Offline" } });
    const r2 = await exec(rt, ctx, CREAR, { id: cid, data: { titulo: "Offline" } });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r2.ok) return;
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
    const lista = await query(rt, ctx, LISTAR, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });

  it("idempotencia offline: reintento de editar con mismo opId es idempotente", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-op");
    const creado = await exec(rt, ctx, CREAR, { data: { titulo: "Base" } });
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const opId = crypto.randomUUID();
    const e1 = await exec(rt, ctx, EDITAR, { id, version: 1, opId, data: { titulo: "V2" } });
    expect(e1.ok).toBe(true);
    // Reintento con la MISMA versión vieja pero mismo opId → éxito idempotente
    const e2 = await exec(rt, ctx, EDITAR, { id, version: 1, opId, data: { titulo: "V2" } });
    expect(e2.ok).toBe(true);
    if (!e2.ok) return;
    expect((e2.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("auditoría implícita: cada escritura queda registrada", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-aud");
    await exec(rt, ctx, CREAR, { data: { titulo: "Auditado" } });
    const trail = await rt.audit.list("t-aud", { service: SERVICIO });
    expect(trail.ok).toBe(true);
    if (!trail.ok) return;
    expect(trail.value.some((a) => a.action === "crear")).toBe(true);
  });
});
