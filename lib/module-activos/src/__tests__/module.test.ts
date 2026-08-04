/**
 * DGP-008.1 · Módulo Activos — Pruebas con adaptadores Fake (offline).
 * Cubre: dominio (VO, invariantes, máquina de estados), CRUD, policies
 * (permitir/denegar por config), catálogos (valor deshabilitado rechazado),
 * horómetro/odómetro monótonos, CQRS/proyección idempotente, eventos
 * autosuficientes, multitenancy, permisos y offline (idempotencia, conflicto,
 * replay, recibo durable).
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
  activosModule,
  crearActivo,
  crearActivosRuntime,
  crearMedicion,
  esRetroceso,
  FakeSyncReceiptStore,
  MODULO,
  operarActivo,
  policiesDelModulo,
  procesarCola,
  registrarActivo,
  retirarActivo,
  type ActivosRuntime,
  type SyncReceipt,
  type SyncReceiptStore,
} from "..";

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...activosModule({ repository: null as never, readModel: null as never }).permissions,
  ]),
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };
const LECTOR: Principal = { id: "u-2", rol: "lector", permisos: ["modulo.activos.read"], capacidades: [] };

function runtime(): ActivosRuntime {
  return crearActivosRuntime({ logger: new MemoryLogger() });
}
function ctxOf(tenantId: string, principal: Principal = ADMIN): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId } });
}
async function drain(rt: ActivosRuntime): Promise<void> {
  await rt.platform.kernel.outboxProcessor.processPending();
}
const exec = (rt: ActivosRuntime, ctx: ExecutionContext, cmd: string, input: unknown) =>
  rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (rt: ActivosRuntime, ctx: ExecutionContext, q: string, input: unknown) =>
  rt.platform.kernel.queries.execute(ctx, q, input);

/** Siembra catálogos mínimos habilitados para un tenant. */
async function sembrarCatalogos(rt: ActivosRuntime, ctx: ExecutionContext): Promise<void> {
  const c = [
    ["tipos", "movil", "Equipo móvil"],
    ["categorias", "maquinaria", "Maquinaria"],
    ["familias", "excavadoras", "Excavadoras"],
    ["subfamilias", "sobre-orugas", "Sobre orugas"],
    ["criticidades", "alta", "Alta"],
    ["prioridades", "p1", "Prioridad 1"],
    ["ubicaciones", "planta-1", "Planta 1"],
    ["monedas", "USD", "Dólar"],
    ["unidades", "h", "Horas"],
    ["unidades", "km", "Kilómetros"],
    ["proveedores", "prov-1", "Proveedor 1"],
  ] as const;
  for (const [catalogo, clave, etiqueta] of c) {
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo, clave, etiqueta });
  }
}

const NUEVO = {
  codigoEmpresarial: "EXC-001",
  nombre: "Excavadora CAT 320",
  tipo: "movil",
  categoria: "maquinaria",
  familia: "excavadoras",
  subfamilia: "sobre-orugas",
  criticidad: "alta",
  prioridad: "p1",
};

/* ------------------------------- Dominio ---------------------------------- */

describe("Dominio: aggregate Activo y VO", () => {
  const base = crearActivo({
    id: "a1", tenantId: "t1", codigoEmpresarial: "C1", nombre: "Activo A",
    tipo: "movil", categoria: "maquinaria", familia: "excavadoras",
    actorId: "u", maxLongitudNombre: 160, maxLongitudCodigo: 60, ahora: new Date(),
  });

  it("crea en BORRADOR con versión 1 y evento registrado autosuficiente", () => {
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    expect(base.value.activo.estado).toBe("BORRADOR");
    expect(base.value.activo.version).toBe(1);
    expect(base.value.evento.tipo).toBe("modulo.activos.registrado");
    // Payload autosuficiente: contiene todos los campos del aggregate.
    expect(base.value.evento.payload["codigoEmpresarial"]).toBe("C1");
    expect(base.value.evento.payload["familia"]).toBe("excavadoras");
  });

  it("rechaza código o nombre inválidos", () => {
    const sinCodigo = crearActivo({ ...NUEVO, id: "x", tenantId: "t", codigoEmpresarial: "  ", actorId: "u", maxLongitudNombre: 160, maxLongitudCodigo: 60, ahora: new Date() });
    expect(sinCodigo.ok).toBe(false);
  });

  it("máquina de estados: BORRADOR→REGISTRADO→OPERATIVO y RETIRADO terminal", () => {
    if (!base.ok) return;
    const reg = registrarActivo(base.value.activo, "u", new Date());
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.value.activo.estado).toBe("REGISTRADO");
    const op = operarActivo(reg.value.activo, "u", new Date());
    expect(op.ok && op.value.activo.estado).toBe("OPERATIVO");
    if (!op.ok) return;
    const ret = retirarActivo(op.value.activo, "u", new Date());
    expect(ret.ok && ret.value.activo.estado).toBe("RETIRADO");
    if (!ret.ok) return;
    // RETIRADO es final: no admite más transiciones.
    expect(operarActivo(ret.value.activo, "u", new Date()).ok).toBe(false);
    expect(retirarActivo(ret.value.activo, "u", new Date()).ok).toBe(false);
  });

  it("VO Medición: regla de monotonicidad (esRetroceso)", () => {
    const m1 = crearMedicion({ valor: 100, unidad: "h", fecha: "2024-01-01" });
    const m2 = crearMedicion({ valor: 90, unidad: "h", fecha: "2024-02-01" });
    expect(m1.ok && m2.ok).toBe(true);
    if (!m1.ok || !m2.ok) return;
    expect(esRetroceso(m1.value, m2.value)).toBe(true);
    expect(esRetroceso(m2.value, m1.value)).toBe(false);
    expect(esRetroceso(null, m1.value)).toBe(false);
  });

  it("policies puras: registrar, modificar y retirar", () => {
    const p = policiesDelModulo();
    const registrar = p.find((x) => x.name.endsWith("puede-registrar"))!;
    const modificar = p.find((x) => x.name.endsWith("puede-modificar"))!;
    const retirar = p.find((x) => x.name.endsWith("puede-retirar"))!;
    expect(registrar.evaluate(null, { estado: "BORRADOR" }).allow).toBe(true);
    expect(modificar.evaluate(null, { estado: "RETIRADO" }).allow).toBe(false);
    expect(retirar.evaluate(null, { estado: "OPERATIVO" }).allow).toBe(true);
    expect(retirar.evaluate(null, { estado: "OPERATIVO", requiereAprobacion: true, aprobado: false }).allow).toBe(false);
    expect(retirar.evaluate(null, { estado: "OPERATIVO", requiereAprobacion: true, aprobado: true }).allow).toBe(true);
  });
});

/* --------------------------- Registro automático -------------------------- */

describe("Registro automático del módulo", () => {
  it("inscribe el módulo con sus capacidades y eventos", () => {
    const rt = runtime();
    const names = rt.platform.registries.services.list().map((s) => s.name);
    expect(names).toContain(MODULO);
    const caps = rt.platform.registries.capabilities.list().map((c) => c.name);
    expect(caps).toEqual(expect.arrayContaining(["gestionar-activos", "consultar-activos", "administrar-activos"]));
    const g = rt.platform.registries.knowledgeGraph.snapshot();
    expect(g.edges.some((e) => e.from === `service:${MODULO}` && e.relation === "emits")).toBe(true);
  });

  it("health check del módulo responde", async () => {
    const rt = runtime();
    const statuses = await rt.platform.registries.observability.checkAll();
    expect(statuses.find((s) => s.service === MODULO)?.healthy).toBe(true);
  });
});

/* ------------------------------ CRUD + CQRS ------------------------------- */

describe("CRUD, catálogos y CQRS", () => {
  it("crear → proyección → listar (read model)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await sembrarCatalogos(rt, ctx);
    const r = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    expect(r.ok).toBe(true);
    await drain(rt);
    const listado = await query(rt, ctx, `${MODULO}.listar`, {});
    expect(listado.ok).toBe(true);
    if (!listado.ok) return;
    expect((listado.value as { nombre: string }[]).map((x) => x.nombre)).toContain("Excavadora CAT 320");
  });

  it("rechaza referencia a catálogo inexistente / deshabilitado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-cat");
    await sembrarCatalogos(rt, ctx);
    // familia inexistente
    const r1 = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "X1", familia: "no-existe" });
    expect(r1.ok).toBe(false);
    // deshabilitar una familia habilitada y reintentar
    await exec(rt, ctx, `${MODULO}.catalogo.habilitar`, { catalogo: "familias", clave: "excavadoras", habilitado: false });
    const r2 = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "X2" });
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error.code).toBe("KRN-VAL-001");
  });

  it("código único por tenant", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-uniq");
    await sembrarCatalogos(rt, ctx);
    await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    const dup = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, nombre: "Otro" });
    expect(dup.ok).toBe(false);
  });

  it("ciclo de vida completo por comandos + read model refleja estado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-ciclo");
    await sembrarCatalogos(rt, ctx);
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    expect((await exec(rt, ctx, `${MODULO}.registrar`, { id, expectedVersion: 1 })).ok).toBe(true);
    expect((await exec(rt, ctx, `${MODULO}.operar`, { id, expectedVersion: 2 })).ok).toBe(true);
    expect((await exec(rt, ctx, `${MODULO}.mantener`, { id, expectedVersion: 3 })).ok).toBe(true);
    expect((await exec(rt, ctx, `${MODULO}.operar`, { id, expectedVersion: 4 })).ok).toBe(true);
    const ret = await exec(rt, ctx, `${MODULO}.retirar`, { id, expectedVersion: 5 });
    expect(ret.ok).toBe(true);
    await drain(rt);
    const detalle = await query(rt, ctx, `${MODULO}.detalle`, { id });
    expect(detalle.ok && (detalle.value as { estado: string }).estado).toBe("RETIRADO");
  });

  it("config requiere-aprobacion-retiro bloquea el retiro sin aprobación", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-apr");
    await sembrarCatalogos(rt, ctx);
    await exec(rt, ctx, "platform.config.set", { key: `${MODULO}.requiere-aprobacion-retiro`, value: "true" });
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    await exec(rt, ctx, `${MODULO}.registrar`, { id, expectedVersion: 1 });
    const sinAprob = await exec(rt, ctx, `${MODULO}.retirar`, { id, expectedVersion: 2 });
    expect(sinAprob.ok).toBe(false);
    const conAprob = await exec(rt, ctx, `${MODULO}.retirar`, { id, expectedVersion: 2, aprobado: true });
    expect(conAprob.ok).toBe(true);
  });

  it("horómetro monótono: rechaza retroceso salvo config", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-hor");
    await sembrarCatalogos(rt, ctx);
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const m1 = await exec(rt, ctx, `${MODULO}.actualizar-horometro`, { id, expectedVersion: 1, medicion: { valor: 100, unidad: "h", fecha: "2024-01-01" } });
    expect(m1.ok).toBe(true);
    const retro = await exec(rt, ctx, `${MODULO}.actualizar-horometro`, { id, expectedVersion: 2, medicion: { valor: 50, unidad: "h", fecha: "2024-02-01" } });
    expect(retro.ok).toBe(false);
    if (retro.ok) return;
    expect(retro.error.code).toBe("KRN-CFL-001");
    // Habilitando el retroceso por configuración, se acepta.
    await exec(rt, ctx, "platform.config.set", { key: `${MODULO}.permite-retroceso-horometro`, value: "true" });
    const ok2 = await exec(rt, ctx, `${MODULO}.actualizar-horometro`, { id, expectedVersion: 2, medicion: { valor: 50, unidad: "h", fecha: "2024-03-01" } });
    expect(ok2.ok).toBe(true);
  });

  it("cambiar ubicación y asignar responsable", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-ubi");
    await sembrarCatalogos(rt, ctx);
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const ub = await exec(rt, ctx, `${MODULO}.cambiar-ubicacion`, {
      id, expectedVersion: 1, ubicacion: { ubicacionId: "planta-1", etiqueta: "Planta 1" },
    });
    expect(ub.ok).toBe(true);
    const resp = await exec(rt, ctx, `${MODULO}.asignar-responsable`, { id, expectedVersion: 2, responsable: "user-99" });
    expect(resp.ok).toBe(true);
    await drain(rt);
    const porUbic = await query(rt, ctx, `${MODULO}.listar`, { ubicacionId: "planta-1" });
    expect(porUbic.ok && (porUbic.value as unknown[]).length).toBe(1);
  });

  it("permisos: un lector no puede crear", async () => {
    const rt = runtime();
    const r = await exec(rt, ctxOf("t1", LECTOR), `${MODULO}.crear`, NUEVO);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });

  it("multitenancy: los datos no cruzan tenants", async () => {
    const rt = runtime();
    const ctxA = ctxOf("t-a");
    await sembrarCatalogos(rt, ctxA);
    await exec(rt, ctxA, `${MODULO}.crear`, NUEVO);
    await drain(rt);
    const b = await query(rt, ctxOf("t-b"), `${MODULO}.listar`, {});
    expect(b.ok && (b.value as unknown[]).length).toBe(0);
  });
});

/* ------------------------------- Offline ---------------------------------- */

describe("Offline: idempotencia, conflicto, replay y recibos", () => {
  it("crear con id de cliente es idempotente", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-off");
    await sembrarCatalogos(rt, ctx);
    const clientId = crypto.randomUUID();
    const r1 = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, id: clientId });
    const r2 = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, id: clientId });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r2.ok) return;
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
    const list = await rt.adapters.repository.list("t-off", {});
    expect(list.ok && list.value).toHaveLength(1);
  });

  it("edición detecta conflicto por versión (KRN-CFL-001)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-cfl");
    await sembrarCatalogos(rt, ctx);
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const e1 = await exec(rt, ctx, `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "linea" });
    expect(e1.ok).toBe(true);
    const e2 = await exec(rt, ctx, `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "vieja" });
    expect(e2.ok).toBe(false);
    if (e2.ok) return;
    expect(e2.error.code).toBe("KRN-CFL-001");
  });

  it("proyección idempotente ante reentrega del outbox", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-idem");
    await sembrarCatalogos(rt, ctx);
    await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    await drain(rt);
    await drain(rt);
    const listado = await query(rt, ctx, `${MODULO}.listar`, {});
    expect(listado.ok && (listado.value as unknown[]).length).toBe(1);
  });

  it("reproyectar reconstruye el read model", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-rp");
    await sembrarCatalogos(rt, ctx);
    await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "EXC-002", nombre: "Otra" });
    await drain(rt);
    const re = await exec(rt, ctx, `${MODULO}.reproyectar`, {});
    expect(re.ok && (re.value as { proyectados: number }).proyectados).toBe(2);
  });

  it("sincronizar: replay de CREACIÓN devuelve el recibo original sin re-ejecutar", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync");
    await sembrarCatalogos(rt, ctx);
    const clientId = crypto.randomUUID();
    const cola = [{ opId: "op-1", comando: "crear", input: { ...NUEVO, id: clientId } }];

    const r1 = await rt.sincronizar(ctx, cola);
    expect(r1.total).toBe(1);
    expect(r1.aplicadas).toBe(1);
    expect(r1.resultados[0]?.estado).toBe("aplicada");
    expect(r1.resultados[0]?.replay).toBeUndefined();
    const original = r1.resultados[0]?.resultado;

    // Reenvío: el recibo durable por opId corta el paso; NO re-ejecuta.
    const r2 = await rt.sincronizar(ctx, cola);
    expect(r2.aplicadas).toBe(1);
    expect(r2.resultados[0]?.estado).toBe("aplicada");
    expect(r2.resultados[0]?.replay).toBe(true);
    expect(r2.resultados[0]?.resultado).toEqual(original);

    // Un único activo persistido pese a los dos envíos.
    const list = await rt.adapters.repository.list("t-sync", {});
    expect(list.ok && list.value).toHaveLength(1);
  });

  it("sincronizar: replay de MUTACIÓN devuelve el recibo original sin re-ejecutar", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync-mut");
    await sembrarCatalogos(rt, ctx);
    const id = crypto.randomUUID();
    await rt.sincronizar(ctx, [{ opId: "m-crear", comando: "crear", input: { ...NUEVO, id } }]);

    const cola = [{ opId: "m-edit", comando: "editar", input: { id, expectedVersion: 1, nombre: "Editado" } }];
    const r1 = await rt.sincronizar(ctx, cola);
    expect(r1.aplicadas).toBe(1);
    const original = r1.resultados[0]?.resultado as { version: number };
    expect(original.version).toBe(2);

    // Reenvío del MISMO opId: recibo original, sin conflicto ni re-ejecución.
    const r2 = await rt.sincronizar(ctx, cola);
    expect(r2.conflictos).toBe(0);
    expect(r2.aplicadas).toBe(1);
    expect(r2.resultados[0]?.replay).toBe(true);
    expect(r2.resultados[0]?.resultado).toEqual(original);

    // La versión NO avanzó (no se re-ejecutó la edición).
    const cur = await rt.adapters.repository.findById("t-sync-mut", id);
    expect(cur.ok && cur.value?.version).toBe(2);
  });

  it("sincronizar: create sin id de cliente se rechaza (Offline First)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync2");
    await sembrarCatalogos(rt, ctx);
    const r = await rt.sincronizar(ctx, [{ opId: "op-x", comando: "crear", input: { ...NUEVO } }]);
    expect(r.rechazadas).toBe(1);
    expect(r.resultados[0]?.estado).toBe("rechazada");
  });

  it("sincronizar: dos ediciones distintas contra la misma versión => 1 aplicada + 1 conflicto", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync3");
    await sembrarCatalogos(rt, ctx);
    const id = crypto.randomUUID();
    await rt.sincronizar(ctx, [{ opId: "c-1", comando: "crear", input: { ...NUEVO, id } }]);
    // Dos opId distintos editando la misma versión v1: la 2ª no debe re-aplicar.
    const cola = [
      { opId: "e-1", comando: "editar", input: { id, expectedVersion: 1, nombre: "Primera" } },
      { opId: "e-2", comando: "editar", input: { id, expectedVersion: 1, nombre: "Segunda" } },
    ];
    const r = await rt.sincronizar(ctx, cola);
    expect(r.aplicadas).toBe(1);
    expect(r.conflictos).toBe(1);
    const conflicto = r.resultados.find((x) => x.estado === "conflicto");
    expect(conflicto?.actual).toBeTruthy();
  });

  it("sincronizar: recibos AISLADOS por tenant (mismo opId no cruza)", async () => {
    const rt = runtime();
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    const ctxA = ctxOf("t-sync-A");
    const ctxB = ctxOf("t-sync-B");
    await sembrarCatalogos(rt, ctxA);
    await sembrarCatalogos(rt, ctxB);
    // Mismo opId en dos tenants distintos: cada uno ejecuta el suyo (sin replay).
    const rA = await rt.sincronizar(ctxA, [{ opId: "shared-op", comando: "crear", input: { ...NUEVO, id: idA } }]);
    const rB = await rt.sincronizar(ctxB, [{ opId: "shared-op", comando: "crear", input: { ...NUEVO, id: idB } }]);
    expect(rA.resultados[0]?.replay).toBeUndefined();
    expect(rB.resultados[0]?.replay).toBeUndefined();
    expect(rA.aplicadas).toBe(1);
    expect(rB.aplicadas).toBe(1);
    const listA = await rt.adapters.repository.list("t-sync-A", {});
    const listB = await rt.adapters.repository.list("t-sync-B", {});
    expect(listA.ok && listA.value).toHaveLength(1);
    expect(listB.ok && listB.value).toHaveLength(1);
  });

  it("sincronizar: si la FINALIZACIÓN del recibo falla ⇒ 'reintentable' (no éxito durable)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-fin-fail");
    await sembrarCatalogos(rt, ctx);
    const base = new FakeSyncReceiptStore();
    // Store que reclama bien pero SIEMPRE falla al finalizar.
    const store: SyncReceiptStore = {
      claim: (t, o, c, cmd) => base.claim(t, o, c, cmd),
      find: (t, o) => base.find(t, o),
      release: (t, o) => base.release(t, o),
      finalize: async () => ({ ok: false, error: { code: "KRN-INF-001", message: "finalize boom" } }) as never,
    };
    const id = crypto.randomUUID();
    const r = await procesarCola(rt.platform, store, rt.adapters.repository, ctx, [
      { opId: "ff-1", comando: "crear", input: { ...NUEVO, id } },
    ]);
    // El comando aplicó su efecto, pero el recibo NO finalizó ⇒ reintentable.
    expect(r.reintentables).toBe(1);
    expect(r.resultados[0]?.estado).toBe("reintentable");
    expect(r.resultados[0]?.advertencia).toBeTruthy();
    // El recibo quedó 'pendiente' (no terminal) para su recuperación posterior.
    const rec = await base.find("t-fin-fail", "ff-1");
    expect(rec.ok && rec.value?.estado).toBe("pendiente");
    // El efecto SÍ ocurrió (agregado creado).
    const cur = await rt.adapters.repository.findById("t-fin-fail", id);
    expect(cur.ok && cur.value?.id).toBe(id);
  });

  it("sincronizar: recupera un 'pendiente' VIEJO reconciliando una CREACIÓN aplicada", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-rec-crear");
    await sembrarCatalogos(rt, ctx);
    const id = crypto.randomUUID();
    // El agregado YA existe (creación previa aplicada).
    const creado = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, id });
    expect(creado.ok).toBe(true);
    // Sembramos un recibo 'pendiente' viejo para el mismo opId.
    const store = new FakeSyncReceiptStore();
    const c = await store.claim("t-rec-crear", "rec-1", id, `${MODULO}.crear`);
    expect(c.ok && c.value.duenio).toBe(true);
    // Segunda solicitud (no dueña) con umbral 0 ⇒ adopta y reconcilia.
    const r = await procesarCola(rt.platform, store, rt.adapters.repository, ctx, [
      { opId: "rec-1", comando: "crear", input: { ...NUEVO, id } },
    ], { umbralRecuperacionMs: 0 });
    expect(r.aplicadas).toBe(1);
    expect(r.resultados[0]?.replay).toBe(true);
    const rec = await store.find("t-rec-crear", "rec-1");
    expect(rec.ok && rec.value?.estado).toBe("aplicada");
  });

  it("sincronizar: recupera un 'pendiente' VIEJO reconciliando una MUTACIÓN aplicada", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-rec-mut");
    await sembrarCatalogos(rt, ctx);
    const id = crypto.randomUUID();
    await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, id });
    // La mutación YA se aplicó (versión avanzó a 2).
    const ed = await exec(rt, ctx, `${MODULO}.editar`, { id, expectedVersion: 1, nombre: "Editado" });
    expect(ed.ok).toBe(true);
    // Recibo 'pendiente' viejo para el opId de esa edición.
    const store = new FakeSyncReceiptStore();
    await store.claim("t-rec-mut", "recm-1", id, `${MODULO}.editar`);
    const r = await procesarCola(rt.platform, store, rt.adapters.repository, ctx, [
      { opId: "recm-1", comando: "editar", input: { id, expectedVersion: 1, nombre: "Editado" } },
    ], { umbralRecuperacionMs: 0 });
    // La versión ya avanzó ⇒ reconcilia como aplicada SIN re-ejecutar (queda v2).
    expect(r.aplicadas).toBe(1);
    expect(r.resultados[0]?.replay).toBe(true);
    const cur = await rt.adapters.repository.findById("t-rec-mut", id);
    expect(cur.ok && cur.value?.version).toBe(2);
  });

  it("sincronizar: 'pendiente' VIVO de otro dueño (no viejo) ⇒ reintentable sin ejecutar", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-vivo");
    await sembrarCatalogos(rt, ctx);
    const id = crypto.randomUUID();
    const store = new FakeSyncReceiptStore();
    // Otro dueño reclamó el opId y sigue en curso (createdAt reciente).
    await store.claim("t-vivo", "vivo-1", id, `${MODULO}.crear`);
    const r = await procesarCola(rt.platform, store, rt.adapters.repository, ctx, [
      { opId: "vivo-1", comando: "crear", input: { ...NUEVO, id } },
    ], { umbralRecuperacionMs: 60_000, pollingIntentos: 1, pollingEsperaMs: 1 });
    expect(r.reintentables).toBe(1);
    // No se creó nada (no somos dueños y el recibo sigue pendiente vivo).
    const lst = await rt.adapters.repository.list("t-vivo", {});
    expect(lst.ok && lst.value).toHaveLength(0);
  });
});

/* ------------------------------- Policies --------------------------------- */

describe("Policies enlazadas a comandos", () => {
  async function crearOperativo(rt: ActivosRuntime, ctx: ExecutionContext): Promise<string> {
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup crear");
    const id = (creado.value as { id: string }).id;
    const reg = await exec(rt, ctx, `${MODULO}.registrar`, { id, expectedVersion: 1 });
    if (!reg.ok) throw new Error("setup registrar");
    const op = await exec(rt, ctx, `${MODULO}.operar`, { id, expectedVersion: 2 });
    if (!op.ok) throw new Error("setup operar");
    return id;
  }

  it("retirar (PuedeRetirar + PuedeCerrar): permite con activo operativo", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-pol1");
    await sembrarCatalogos(rt, ctx);
    const id = await crearOperativo(rt, ctx);
    const r = await exec(rt, ctx, `${MODULO}.retirar`, { id, expectedVersion: 3 });
    expect(r.ok).toBe(true);
  });

  it("PuedeCerrar deniega el retiro sin aprobación cuando el tenant la exige", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-pol2");
    await sembrarCatalogos(rt, ctx);
    const id = await crearOperativo(rt, ctx);
    await exec(rt, ctx, "platform.config.set", { key: `${MODULO}.requiere-aprobacion-retiro`, value: "true" });
    const sin = await exec(rt, ctx, `${MODULO}.retirar`, { id, expectedVersion: 3 });
    expect(sin.ok).toBe(false);
    if (sin.ok) return;
    expect(sin.error.code).toMatch(/KRN-AUTH/);
    const con = await exec(rt, ctx, `${MODULO}.retirar`, { id, expectedVersion: 3, aprobado: true });
    expect(con.ok).toBe(true);
  });

  it("PuedeModificar deniega operar sobre un activo ya retirado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-pol3");
    await sembrarCatalogos(rt, ctx);
    const id = await crearOperativo(rt, ctx);
    const ret = await exec(rt, ctx, `${MODULO}.retirar`, { id, expectedVersion: 3 });
    expect(ret.ok).toBe(true);
    const op = await exec(rt, ctx, `${MODULO}.operar`, { id, expectedVersion: 4 });
    expect(op.ok).toBe(false);
  });
});

/* -------------------------- Catálogos / config ---------------------------- */

describe("Catálogos y configuración efectiva", () => {
  it("aplica moneda-defecto ANTES de validar el catálogo de monedas", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-mon");
    await sembrarCatalogos(rt, ctx);
    // moneda-defecto = "EUR" pero NO habilitada => la creación se rechaza.
    await exec(rt, ctx, "platform.config.set", { key: `${MODULO}.moneda-defecto`, value: "EUR" });
    const r = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "EXC-EUR" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toMatch(/KRN-(VAL|CFL)/);
    // Habilitando EUR, la moneda efectiva por defecto valida correctamente.
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "monedas", clave: "EUR", etiqueta: "Euro" });
    const ok2 = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "EXC-EUR2" });
    expect(ok2.ok).toBe(true);
  });

  it("valida el catálogo unidades en la medición de horómetro", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-uni");
    await sembrarCatalogos(rt, ctx);
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    const r = await exec(rt, ctx, `${MODULO}.actualizar-horometro`, {
      id, expectedVersion: 1, medicion: { valor: 10, unidad: "inexistente", fecha: "2024-01-01" },
    });
    expect(r.ok).toBe(false);
  });

  it("valida el catálogo proveedores al crear", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-prov");
    await sembrarCatalogos(rt, ctx);
    const malo = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "P-BAD", proveedor: "fantasma" });
    expect(malo.ok).toBe(false);
    const bueno = await exec(rt, ctx, `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "P-OK", proveedor: "prov-1" });
    expect(bueno.ok).toBe(true);
  });

  it("catálogo estados VACÍO ⇒ máquina canónica: todas las transiciones admisibles", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-est-vacio");
    await sembrarCatalogos(rt, ctx); // no siembra 'estados'
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    expect((await exec(rt, ctx, `${MODULO}.registrar`, { id, expectedVersion: 1 })).ok).toBe(true);
    expect((await exec(rt, ctx, `${MODULO}.operar`, { id, expectedVersion: 2 })).ok).toBe(true);
    expect((await exec(rt, ctx, `${MODULO}.mantener`, { id, expectedVersion: 3 })).ok).toBe(true);
  });

  it("catálogo estados con subconjunto ⇒ transición a estado AUSENTE se rechaza (VAL)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-est-sub");
    await sembrarCatalogos(rt, ctx);
    // El tenant declara un subconjunto: REGISTRADO y OPERATIVO (NO MANTENIMIENTO).
    for (const clave of ["REGISTRADO", "OPERATIVO"]) {
      await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "estados", clave, etiqueta: clave });
    }
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    expect((await exec(rt, ctx, `${MODULO}.registrar`, { id, expectedVersion: 1 })).ok).toBe(true);
    expect((await exec(rt, ctx, `${MODULO}.operar`, { id, expectedVersion: 2 })).ok).toBe(true);
    // MANTENIMIENTO no está en el catálogo declarado ⇒ rechazo de validación.
    const r = await exec(rt, ctx, `${MODULO}.mantener`, { id, expectedVersion: 3 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toMatch(/KRN-VAL/);
  });

  it("catálogo estados: transición a estado DESHABILITADO se rechaza (VAL)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-est-dis");
    await sembrarCatalogos(rt, ctx);
    for (const clave of ["REGISTRADO", "OPERATIVO", "MANTENIMIENTO"]) {
      await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "estados", clave, etiqueta: clave });
    }
    await exec(rt, ctx, `${MODULO}.catalogo.habilitar`, { catalogo: "estados", clave: "MANTENIMIENTO", habilitado: false });
    const creado = await exec(rt, ctx, `${MODULO}.crear`, NUEVO);
    if (!creado.ok) throw new Error("setup");
    const id = (creado.value as { id: string }).id;
    await exec(rt, ctx, `${MODULO}.registrar`, { id, expectedVersion: 1 });
    await exec(rt, ctx, `${MODULO}.operar`, { id, expectedVersion: 2 });
    const r = await exec(rt, ctx, `${MODULO}.mantener`, { id, expectedVersion: 3 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toMatch(/KRN-VAL/);
  });
});

/* --------------------------- Consola / catálogos -------------------------- */

describe("Consola y catálogos", () => {
  it("consola expone contrato y configuración efectiva", async () => {
    const rt = runtime();
    const r = await query(rt, ctxOf("t-c"), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { estados: string[]; catalogos: string[]; configuracion: Record<string, string> };
    expect(v.estados).toContain("OPERATIVO");
    expect(v.catalogos).toContain("familias");
    expect(v.configuracion["moneda-defecto"]).toBe("USD");
  });

  it("catalogo.opciones lista solo habilitados y ordenados", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-op");
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "tipos", clave: "b", etiqueta: "B", posicion: 2 });
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "tipos", clave: "a", etiqueta: "A", posicion: 1 });
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "tipos", clave: "c", etiqueta: "C", posicion: 3 });
    await exec(rt, ctx, `${MODULO}.catalogo.habilitar`, { catalogo: "tipos", clave: "c", habilitado: false });
    const r = await query(rt, ctx, `${MODULO}.catalogo.opciones`, { catalogo: "tipos" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const values = (r.value as { value: string }[]).map((o) => o.value);
    expect(values).toEqual(["a", "b"]);
  });
});
