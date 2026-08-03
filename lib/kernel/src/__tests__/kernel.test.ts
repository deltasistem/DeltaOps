import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  all,
  ANONYMOUS_PRINCIPAL,
  CapabilityResolver,
  childContext,
  ConfigurationResolver,
  Container,
  createDomainEvent,
  createExecutionContext,
  createKernelRuntime,
  EventDispatcher,
  fail,
  flatMap,
  InMemoryRepository,
  isKernelError,
  KernelErrors,
  KernelTokens,
  map,
  MapConfigSource,
  MemoryLogger,
  ok,
  PermissionResolver,
  PolicyEngine,
  SequentialIdGenerator,
  SYSTEM_PRINCIPAL,
  toKernelError,
  token,
  Tracer,
  unwrap,
  type CommandDefinition,
  type Identifiable,
  type Principal,
  type QueryDefinition,
} from "..";

/**
 * DeltaOps Kernel · DGP-002 — Testing completo del Kernel.
 * Sin dominio: entidades y eventos sintéticos ("widget") solo para prueba.
 */

const OPERATOR: Principal = {
  id: "u-1",
  rol: "operador",
  permisos: ["widget.create", "widget.read"],
  capacidades: [],
};

interface Widget extends Identifiable {
  id: string;
  nombre: string;
}

function buildTestRuntime(options: Parameters<typeof createKernelRuntime>[0] = {}) {
  return createKernelRuntime({
    logger: new MemoryLogger(),
    outboxMaxAttempts: 2,
    ...options,
  });
}

function widgetCommand(
  repo: InMemoryRepository<Widget>,
): CommandDefinition<{ nombre: string }, Widget> {
  return {
    name: "widget.create",
    inputSchema: z.object({ nombre: z.string().min(1) }),
    authorization: { permissions: ["widget.create"] },
    async handle(ctx, input, uow) {
      const widget: Widget = { id: crypto.randomUUID(), nombre: input.nombre };
      const saved = await repo.save(ctx, widget);
      if (!saved.ok) return saved;
      uow.registerEvent(
        createDomainEvent("widget.created", { widgetId: widget.id }, ctx.correlationId),
      );
      return ok(widget);
    },
  };
}

/* ------------------------------ Result Pattern --------------------------- */

describe("Result Pattern", () => {
  it("ok/fail, map y flatMap componen sin excepciones", () => {
    const r = map(ok(2), (v) => v * 3);
    expect(unwrap(r)).toBe(6);
    const f = flatMap(ok(2), (v) =>
      v > 1 ? fail(KernelErrors.validation("muy grande")) : ok(v),
    );
    expect(f.ok).toBe(false);
  });

  it("all falla con el primer error (camino triste)", () => {
    const r = all([ok(1), fail(KernelErrors.conflict("x")), ok(3)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("conflict");
  });

  it("unwrap sobre falla lanza (solo bordes)", () => {
    expect(() => unwrap(fail(KernelErrors.internal("boom")))).toThrow();
  });
});

/* ------------------------------ Error Pattern ---------------------------- */

describe("Error Pattern", () => {
  it("taxonomía con códigos estables", () => {
    expect(KernelErrors.forbidden("x").code).toBe("KRN-AUTH-002");
    expect(KernelErrors.notFound("widget", 9).details).toEqual({
      resource: "widget",
      id: 9,
    });
  });

  it("toKernelError normaliza excepciones arbitrarias", () => {
    const e = toKernelError(new Error("explota"));
    expect(e.kind).toBe("internal");
    expect(isKernelError(e)).toBe(true);
  });
});

/* ---------------------------- Execution Context -------------------------- */

describe("Execution Context", () => {
  it("genera correlación/traza y es inmutable en metadata", () => {
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL });
    expect(ctx.correlationId).toBeTruthy();
    expect(Object.isFrozen(ctx.metadata)).toBe(true);
  });

  it("childContext conserva traza y correlación con nuevo span", () => {
    const parent = createExecutionContext();
    const child = childContext(parent, () => "span-2");
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).toBe("span-2");
  });
});

/* ---------------------------- Dependency Injection ------------------------ */

describe("Dependency Injection", () => {
  it("singleton vs transient y ámbitos", () => {
    const t = token<{ n: number }>("caja");
    const c = new Container();
    let builds = 0;
    c.register(t, () => ({ n: ++builds }), "transient");
    expect(c.resolve(t).n).not.toBe(c.resolve(t).n);

    const s = token<object>("single");
    c.register(s, () => ({}));
    expect(c.resolve(s)).toBe(c.resolve(s));
    expect(c.createScope().resolve(s)).toBeDefined();
  });

  it("token no registrado y ciclo fallan explícitamente (camino triste)", () => {
    const a = token<unknown>("a");
    const b = token<unknown>("b");
    const c = new Container();
    expect(() => c.resolve(a)).toThrow(/no registrado/);
    c.register(a, (di) => di.resolve(b));
    c.register(b, (di) => di.resolve(a));
    expect(() => c.resolve(a)).toThrow(/circular/);
  });
});

/* -------------------------- Command/Query Pipeline ------------------------ */

describe("Command Pipeline", () => {
  it("ejecuta: autorización + validación + UoW + outbox (operativo)", async () => {
    const runtime = buildTestRuntime();
    const repo = new InMemoryRepository<Widget>();
    runtime.commands.register(widgetCommand(repo));

    const ctx = createExecutionContext({ principal: OPERATOR });
    const result = await runtime.commands.execute<Widget>(ctx, "widget.create", {
      nombre: "Bomba A",
    });
    expect(result.ok).toBe(true);
    expect(repo.size).toBe(1);

    const outbox = runtime.container.resolve(KernelTokens.outbox);
    const pending = await outbox.claimPending(10);
    expect(unwrap(pending)).toHaveLength(1);
    expect(runtime.telemetry.counter("command.widget.create.succeeded")).toBe(1);
  });

  it("entrada inválida → validation, sin efectos (camino triste)", async () => {
    const runtime = buildTestRuntime();
    const repo = new InMemoryRepository<Widget>();
    runtime.commands.register(widgetCommand(repo));
    const ctx = createExecutionContext({ principal: OPERATOR });
    const r = await runtime.commands.execute(ctx, "widget.create", { nombre: "" });
    expect(!r.ok && r.error.kind).toBe("validation");
    expect(repo.size).toBe(0);
  });

  it("handler fallido revierte eventos (Unit of Work funcionando)", async () => {
    const runtime = buildTestRuntime();
    runtime.commands.register({
      name: "widget.explode",
      inputSchema: z.object({}),
      authorization: {},
      async handle(ctx, _input, uow) {
        uow.registerEvent(createDomainEvent("widget.exploded", {}, ctx.correlationId));
        return fail(KernelErrors.conflict("no se pudo"));
      },
    });
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL });
    const r = await runtime.commands.execute(ctx, "widget.explode", {});
    expect(r.ok).toBe(false);
    const outbox = runtime.container.resolve(KernelTokens.outbox);
    expect(unwrap(await outbox.claimPending(10))).toHaveLength(0);
  });

  it("anónimo denegado y permiso faltante denegado (camino triste)", async () => {
    const runtime = buildTestRuntime();
    const repo = new InMemoryRepository<Widget>();
    runtime.commands.register(widgetCommand(repo));

    const anon = createExecutionContext({ principal: ANONYMOUS_PRINCIPAL });
    const r1 = await runtime.commands.execute(anon, "widget.create", { nombre: "x" });
    expect(!r1.ok && r1.error.kind).toBe("unauthorized");

    const sinPermiso = createExecutionContext({
      principal: { id: "u2", rol: "lector", permisos: ["widget.read"], capacidades: [] },
    });
    const r2 = await runtime.commands.execute(sinPermiso, "widget.create", {
      nombre: "x",
    });
    expect(!r2.ok && r2.error.kind).toBe("forbidden");
  });

  it("comando inexistente → not_found (camino triste)", async () => {
    const runtime = buildTestRuntime();
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL });
    const r = await runtime.commands.execute(ctx, "no.existe", {});
    expect(!r.ok && r.error.kind).toBe("not_found");
  });
});

describe("Query Pipeline", () => {
  const widgetQuery = (
    repo: InMemoryRepository<Widget>,
  ): QueryDefinition<{ id: string }, Widget | null> => ({
    name: "widget.byId",
    inputSchema: z.object({ id: z.string() }),
    authorization: { permissions: ["widget.read"] },
    async handle(ctx, input) {
      return repo.findById(ctx, input.id);
    },
  });

  it("consulta operativa con autorización y validación", async () => {
    const runtime = buildTestRuntime();
    const repo = new InMemoryRepository<Widget>();
    const ctx = createExecutionContext({ principal: OPERATOR });
    await repo.save(ctx, { id: "w1", nombre: "Motor" });
    runtime.queries.register(widgetQuery(repo));

    const r = await runtime.queries.execute<Widget | null>(ctx, "widget.byId", {
      id: "w1",
    });
    expect(unwrap(r)?.nombre).toBe("Motor");
    expect(runtime.telemetry.counter("query.widget.byId.executed")).toBe(1);
  });

  it("consulta denegada sin permiso (camino triste)", async () => {
    const runtime = buildTestRuntime();
    const repo = new InMemoryRepository<Widget>();
    runtime.queries.register(widgetQuery(repo));
    const ctx = createExecutionContext({ principal: ANONYMOUS_PRINCIPAL });
    const r = await runtime.queries.execute(ctx, "widget.byId", { id: "w1" });
    expect(r.ok).toBe(false);
  });
});

/* --------------------- Eventos: dispatcher/outbox/replay ------------------ */

describe("Event Dispatcher + Outbox + Dead Letter + Replay", () => {
  it("outbox despacha y marca procesado (operativo)", async () => {
    const runtime = buildTestRuntime();
    const seen: string[] = [];
    runtime.dispatcher.subscribe("widget.created", "auditoria", async (e) => {
      seen.push(e.type);
      return ok(undefined);
    });
    const repo = new InMemoryRepository<Widget>();
    runtime.commands.register(widgetCommand(repo));
    const ctx = createExecutionContext({ principal: OPERATOR });
    await runtime.commands.execute(ctx, "widget.create", { nombre: "Bomba" });

    const summary = unwrap(await runtime.outboxProcessor.processPending());
    expect(summary.processed).toBe(1);
    expect(seen).toEqual(["widget.created"]);
  });

  it("manejador que falla reintenta y luego entierra en dead letter", async () => {
    const runtime = buildTestRuntime(); // maxAttempts = 2
    runtime.dispatcher.subscribe("widget.created", "fragil", async () =>
      fail(KernelErrors.infrastructure("siempre falla")),
    );
    const repo = new InMemoryRepository<Widget>();
    runtime.commands.register(widgetCommand(repo));
    const ctx = createExecutionContext({ principal: OPERATOR });
    await runtime.commands.execute(ctx, "widget.create", { nombre: "Bomba" });

    const s1 = unwrap(await runtime.outboxProcessor.processPending());
    expect(s1.failed).toBe(1);
    const s2 = unwrap(await runtime.outboxProcessor.processPending());
    expect(s2.buried).toBe(1);

    const deadLetter = runtime.container.resolve(KernelTokens.deadLetter);
    const dead = unwrap(await deadLetter.fetchAll(10));
    expect(dead).toHaveLength(1);
    expect(dead[0]!.failureReason).toContain("siempre falla");
  });

  it("replay de procesados y de dead letter (operativos)", async () => {
    const runtime = buildTestRuntime();
    let entregas = 0;
    let fallar = true;
    runtime.dispatcher.subscribe("widget.created", "proyeccion", async () => {
      if (fallar) return fail(KernelErrors.infrastructure("caido"));
      entregas += 1;
      return ok(undefined);
    });
    const repo = new InMemoryRepository<Widget>();
    runtime.commands.register(widgetCommand(repo));
    const ctx = createExecutionContext({ principal: OPERATOR });
    await runtime.commands.execute(ctx, "widget.create", { nombre: "A" });

    // Falla dos veces → dead letter
    await runtime.outboxProcessor.processPending();
    await runtime.outboxProcessor.processPending();
    const deadLetter = runtime.container.resolve(KernelTokens.deadLetter);
    const dead = unwrap(await deadLetter.fetchAll(10));
    expect(dead).toHaveLength(1);

    // Se recupera el manejador → replay del dead letter lo remueve
    fallar = false;
    const rep = await runtime.replay.replayDeadLetter(dead[0]!.id);
    expect(rep.ok).toBe(true);
    expect(entregas).toBe(1);
    expect(unwrap(await deadLetter.fetchAll(10))).toHaveLength(0);

    // Replay de procesados re-entrega
    const replayed = unwrap(await runtime.replay.replayProcessed(10));
    expect(replayed).toBe(1);
    expect(entregas).toBe(2);
  });

  it("suscripción duplicada falla explícitamente (camino triste)", () => {
    const d = new EventDispatcher();
    d.subscribe("e", "h", async () => ok(undefined));
    expect(() => d.subscribe("e", "h", async () => ok(undefined))).toThrow();
  });
});

/* --------------------------- Authorization Runtime ------------------------ */

describe("Authorization Runtime · resolvers y policy engine", () => {
  it("PermissionResolver combina rol y permisos directos", () => {
    const pr = new PermissionResolver({ supervisor: ["ot.approve"] });
    const p: Principal = {
      id: "u",
      rol: "supervisor",
      permisos: ["ot.read"],
      capacidades: [],
    };
    expect(pr.hasPermission(p, "ot.approve")).toBe(true);
    expect(pr.hasPermission(p, "ot.read")).toBe(true);
    expect(pr.hasPermission(p, "ot.delete")).toBe(false);
  });

  it("CapabilityResolver expande capacidades a permisos", () => {
    const pr = new PermissionResolver({});
    const cr = new CapabilityResolver({ "gestionar-widgets": ["w.create", "w.delete"] });
    const p: Principal = {
      id: "u",
      rol: "x",
      permisos: ["w.create", "w.delete"],
      capacidades: [],
    };
    expect(cr.hasCapability(p, "gestionar-widgets", pr)).toBe(true);
    expect(
      cr.hasCapability({ ...p, permisos: ["w.create"] }, "gestionar-widgets", pr),
    ).toBe(false);
  });

  it("PolicyEngine permite/deniega con razón (y política ausente falla)", () => {
    const engine = new PolicyEngine().register({
      name: "horario-laboral",
      evaluate: (_ctx, subject) =>
        subject.hora === 3
          ? { allow: false, reason: "fuera de horario" }
          : { allow: true },
    });
    const ctx = createExecutionContext({ principal: SYSTEM_PRINCIPAL });
    expect(engine.evaluate("horario-laboral", ctx, { hora: 10 }).ok).toBe(true);
    const denied = engine.evaluate("horario-laboral", ctx, { hora: 3 });
    expect(!denied.ok && denied.error.kind).toBe("forbidden");
    expect(engine.evaluate("no-existe", ctx).ok).toBe(false);
  });
});

/* ------------------------ Configuración y telemetría ---------------------- */

describe("Configuration Resolver", () => {
  it("precedencia por capas y tipado", () => {
    const resolver = new ConfigurationResolver([
      new MapConfigSource("override", { LIMITE: "5" }),
      new MapConfigSource("base", { LIMITE: "99", ACTIVO: "true" }),
    ]);
    expect(unwrap(resolver.getNumber("LIMITE"))).toBe(5);
    expect(unwrap(resolver.getBoolean("ACTIVO"))).toBe(true);
    expect(resolver.getOrDefault("NO_EXISTE", "def")).toBe("def");
  });

  it("clave obligatoria ausente y tipos inválidos fallan (camino triste)", () => {
    const resolver = new ConfigurationResolver([
      new MapConfigSource("base", { N: "abc" }),
    ]);
    expect(resolver.get("FALTA").ok).toBe(false);
    expect(resolver.getNumber("N").ok).toBe(false);
    expect(resolver.getBoolean("N").ok).toBe(false);
  });
});

describe("Telemetry, Logging y Tracing", () => {
  it("spans anidados comparten traza; telemetría agrega duraciones", () => {
    const tracer = new Tracer(new SequentialIdGenerator("span").next.bind(
      new SequentialIdGenerator("span"),
    ));
    const ctx = createExecutionContext();
    const parent = tracer.startSpan(ctx, "padre");
    const child = tracer.startSpan(ctx, "hijo", parent);
    child.end("ok");
    parent.end("ok");
    expect(tracer.finished).toHaveLength(2);
    expect(tracer.finished[0]!.traceId).toBe(ctx.traceId);
    expect(tracer.finished[0]!.parentSpanId).toBe(parent.spanId);
  });

  it("MemoryLogger conserva bindings de child", () => {
    const logger = new MemoryLogger();
    logger.child({ mod: "kernel" }).log("info", "hola", { a: 1 });
    expect(logger.entries[0]).toMatchObject({
      level: "info",
      fields: { mod: "kernel", a: 1 },
    });
  });
});
