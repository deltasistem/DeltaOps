/**
 * DGP-006 · Business Foundation Framework — Pruebas de la familia ANDAMIAJE.
 *
 * Cubre: validación de definiciones (kebab/camel, palabras reservadas de
 * negocio DGP-006, coherencia de máquina de estados, permisos completos),
 * borde HTTP genérico (statusOf, resolverHttp, contextoDesdeAutenticacion) y
 * generador programático de módulos (artefactos textuales + guardia de
 * validación). Módulo de prueba "demo": 100% neutro.
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  KernelErrors,
  MemoryLogger,
  type ExecutionContext,
  type KernelError,
  type Principal,
} from "@workspace/kernel";
import {
  createPlatformRuntime,
  officialServices,
  type PlatformRuntime,
} from "@workspace/platform";
import { crearModuloGenerico } from "../../nucleo/bootstrap";
import type { DefinicionEntidad } from "../../nucleo/definicion";
import {
  asegurarDefinicionValida,
  PALABRAS_RESERVADAS_NEGOCIO,
  validarDefinicionModulo,
} from "../validacion";
import {
  contextoDesdeAutenticacion,
  resolverHttp,
  statusOf,
} from "../bootstrap-http";
import {
  definicionDesdeEntrada,
  generarModulo,
  type EntradaScaffolding,
} from "../plantilla";

/* --------------------------- Definición demo ----------------------------- */

const SERVICIO = "modulo.demo";

function entidadDemo(): DefinicionEntidad {
  const permisos = {
    leer: `${SERVICIO}.read`,
    crear: `${SERVICIO}.write`,
    editar: `${SERVICIO}.write`,
    eliminar: `${SERVICIO}.write`,
    admin: `${SERVICIO}.admin`,
    publicar: `${SERVICIO}.publicar`,
  };
  return {
    nombre: "ficha",
    etiqueta: "Ficha",
    servicio: SERVICIO,
    campos: [
      { nombre: "titulo", tipo: "texto", requerido: true, longitudMax: 120 },
      { nombre: "cantidad", tipo: "numero" },
      { nombre: "categoria", tipo: "enum", enumValores: ["a", "b"] },
    ],
    maquinaEstados: {
      estados: [
        { nombre: "borrador", inicial: true },
        { nombre: "publicado" },
        { nombre: "archivado", final: true },
      ],
      transiciones: [
        { de: "borrador", a: "publicado", comando: "publicar", permiso: permisos.publicar },
        { de: "publicado", a: "archivado", comando: "archivar" },
      ],
    },
    permisos,
    capacidades: [
      {
        name: "gestionar-fichas-demo",
        permissions: [permisos.crear, permisos.leer],
        description: "Ciclo de vida de fichas demo",
      },
    ],
  };
}

const entradaDemo: EntradaScaffolding = {
  slug: SERVICIO,
  etiqueta: "Módulo Demo",
  entidades: [entidadDemo()],
};

/* ============================ 1. Validación ============================== */

describe("validarDefinicionModulo", () => {
  it("acepta una definición neutra y coherente", () => {
    const r = validarDefinicionModulo(definicionDesdeEntrada(entradaDemo));
    expect(r.valido).toBe(true);
    expect(r.errores).toHaveLength(0);
  });

  it("rechaza palabras reservadas de negocio citando DGP-006", () => {
    const e = entidadDemo();
    const def = definicionDesdeEntrada({ ...entradaDemo, entidades: [{ ...e, nombre: "inventario" }] });
    const r = validarDefinicionModulo(def);
    expect(r.valido).toBe(false);
    const err = r.errores.find((x) => x.mensaje.includes("inventario"));
    expect(err).toBeDefined();
    expect(err?.mensaje).toContain("DGP-006");
  });

  it("detecta cada palabra reservada de la lista", () => {
    for (const palabra of PALABRAS_RESERVADAS_NEGOCIO) {
      const campoInvalido: DefinicionEntidad = {
        ...entidadDemo(),
        campos: [{ nombre: palabra, tipo: "texto" }],
      };
      const r = validarDefinicionModulo(
        definicionDesdeEntrada({ ...entradaDemo, entidades: [campoInvalido] }),
      );
      expect(r.valido).toBe(false);
    }
  });

  it("rechaza nombres que no son kebab/camel válidos", () => {
    const e = entidadDemo();
    const r = validarDefinicionModulo(
      definicionDesdeEntrada({ ...entradaDemo, entidades: [{ ...e, nombre: "MiEntidad_Rara" }] }),
    );
    expect(r.valido).toBe(false);
    expect(r.errores.some((x) => x.ruta.endsWith(".nombre"))).toBe(true);
  });

  it("exige exactamente un estado inicial", () => {
    const e = entidadDemo();
    const rota: DefinicionEntidad = {
      ...e,
      maquinaEstados: {
        estados: [{ nombre: "uno", inicial: true }, { nombre: "dos", inicial: true }],
        transiciones: [],
      },
    };
    const r = validarDefinicionModulo(definicionDesdeEntrada({ ...entradaDemo, entidades: [rota] }));
    expect(r.valido).toBe(false);
    expect(r.errores.some((x) => x.mensaje.includes("exactamente 1 estado inicial"))).toBe(true);
  });

  it("rechaza transiciones a estados inexistentes", () => {
    const e = entidadDemo();
    const rota: DefinicionEntidad = {
      ...e,
      maquinaEstados: {
        estados: [{ nombre: "uno", inicial: true }],
        transiciones: [{ de: "uno", a: "fantasma", comando: "avanzar" }],
      },
    };
    const r = validarDefinicionModulo(definicionDesdeEntrada({ ...entradaDemo, entidades: [rota] }));
    expect(r.valido).toBe(false);
    expect(r.errores.some((x) => x.mensaje.includes("destino inexistente"))).toBe(true);
  });

  it("exige permisos CRUD completos", () => {
    const e = entidadDemo();
    const sinPermiso = { ...e, permisos: { ...e.permisos, editar: "" } };
    const r = validarDefinicionModulo(
      definicionDesdeEntrada({ ...entradaDemo, entidades: [sinPermiso as DefinicionEntidad] }),
    );
    expect(r.valido).toBe(false);
    expect(r.errores.some((x) => x.ruta.endsWith(".permisos.editar"))).toBe(true);
  });

  it("asegurarDefinicionValida lanza Error explícito cuando es inválida", () => {
    const def = definicionDesdeEntrada({
      ...entradaDemo,
      entidades: [{ ...entidadDemo(), nombre: "orden" }],
    });
    expect(() => asegurarDefinicionValida(def)).toThrow(/DGP-006/);
  });
});

/* ============================ 2. Borde HTTP ============================== */

describe("bootstrap-http: statusOf / resolverHttp / contexto", () => {
  it("mapea cada categoría de KernelError a su código HTTP", () => {
    expect(statusOf(KernelErrors.forbidden("x"))).toBe(403);
    expect(statusOf(KernelErrors.unauthorized())).toBe(403);
    expect(statusOf(KernelErrors.notFound("ficha", "1"))).toBe(404);
    expect(statusOf(KernelErrors.conflict("choque"))).toBe(409);
    expect(statusOf(KernelErrors.validation("mal"))).toBe(400);
    expect(statusOf(KernelErrors.internal("boom"))).toBe(500);
    expect(statusOf(KernelErrors.infrastructure("db"))).toBe(500);
  });

  it("mapea por kind como red de seguridad ante códigos desconocidos", () => {
    const raro: KernelError = { kind: "conflict", code: "OTRO-XYZ", message: "raro" };
    expect(statusOf(raro)).toBe(409);
  });

  it("resolverHttp devuelve 200 en éxito y el body del error en fallo", () => {
    expect(resolverHttp({ ok: true, value: { a: 1 } })).toEqual({ status: 200, body: { a: 1 } });
    const fallo = resolverHttp({ ok: false, error: KernelErrors.notFound("ficha", "9") });
    expect(fallo.status).toBe(404);
    expect((fallo.body as { code: string }).code).toBe("KRN-NF-001");
  });

  it("contextoDesdeAutenticacion arma principal + tenant en metadata", () => {
    const ctx = contextoDesdeAutenticacion({
      actorId: "u-1",
      rol: "admin",
      tenantId: "t-1",
      principal: { permisos: ["modulo.demo.read"], capacidades: ["gestionar"] },
      correlationId: "corr-1",
    });
    expect(ctx.principal.id).toBe("u-1");
    expect(ctx.principal.permisos).toContain("modulo.demo.read");
    expect(ctx.principal.capacidades).toContain("gestionar");
    expect(ctx.metadata["tenantId"]).toBe("t-1");
    expect(ctx.correlationId).toBe("corr-1");
  });
});

/* ============================ 3. Generador =============================== */

describe("plantilla: generarModulo (artefactos textuales)", () => {
  it("genera los cuatro artefactos con rutas esperadas", () => {
    const artefactos = generarModulo(entradaDemo);
    const rutas = artefactos.map((a) => a.ruta);
    expect(rutas).toEqual([
      "src/module.ts",
      "src/runtime.ts",
      "src/routes.ts",
      "src/__tests__/modulo.test.ts",
    ]);
  });

  it("module.ts invoca crearModuloGenerico y expone el slug", () => {
    const artefactos = generarModulo(entradaDemo);
    const moduleTs = artefactos.find((a) => a.ruta.endsWith("module.ts"))!.contenido;
    expect(moduleTs).toContain("crearModuloGenerico");
    expect(moduleTs).toContain(JSON.stringify(SERVICIO));
    expect(moduleTs).toContain("export function definirModulo");
  });

  it("runtime.ts sigue el patrón crearXRuntime con fake/pg", () => {
    const artefactos = generarModulo(entradaDemo);
    const runtimeTs = artefactos.find((a) => a.ruta.endsWith("runtime.ts"))!.contenido;
    expect(runtimeTs).toContain("crearModuloDemoRuntime");
    expect(runtimeTs).toContain("createPlatformRuntime");
    expect(runtimeTs).toContain("pool?: Pool");
  });

  it("routes.ts monta router, statusOf (via resolverHttp), drain y /sync", () => {
    const artefactos = generarModulo(entradaDemo);
    const routesTs = artefactos.find((a) => a.ruta.endsWith("routes.ts"))!.contenido;
    expect(routesTs).toContain("Router()");
    expect(routesTs).toContain("resolverHttp");
    expect(routesTs).toContain("processPending");
    expect(routesTs).toContain("/sync");
    // La entidad demo tiene máquina de estados → endpoint de transición.
    expect(routesTs).toContain("/transicionar");
  });

  it("/sync no usa recibos globales en memoria y propaga opId al input (tenant-scoped)", () => {
    const artefactos = generarModulo(entradaDemo);
    const routesTs = artefactos.find((a) => a.ruta.endsWith("routes.ts"))!.contenido;
    // Sin caché global de recibos.
    expect(routesTs).not.toContain("new Map");
    expect(routesTs).not.toMatch(/const\s+recibos\b/);
    // El opId se propaga dentro del input del comando → idempotencia del núcleo.
    expect(routesTs).toContain("opId: op.opId");
    // El recibo se deriva del resultado del comando, no de estado local.
    expect(routesTs).toContain("idempotente");
  });

  it("/sync generado EXIGE input.id en 'crear' (refine Offline First)", () => {
    const artefactos = generarModulo(entradaDemo);
    const routesTs = artefactos.find((a) => a.ruta.endsWith("routes.ts"))!.contenido;
    // Hay un refine que condiciona la obligatoriedad del id al comando 'crear'.
    expect(routesTs).toContain(".refine(");
    expect(routesTs).toContain(`op.comando !== "crear" || typeof op.input["id"] === "string"`);
    // El mensaje del rechazo cita Offline First y el id de cliente.
    expect(routesTs).toContain("Offline First");
    expect(routesTs).toMatch(/input\.id.*UUID/);
  });

  it("el test base referencia el runtime generado y el flujo crear→listar", () => {
    const artefactos = generarModulo(entradaDemo);
    const testTs = artefactos.find((a) => a.ruta.endsWith("modulo.test.ts"))!.contenido;
    expect(testTs).toContain("crearModuloDemoRuntime");
    expect(testTs).toContain(".crear");
    expect(testTs).toContain(".listar");
  });

  it("generarModulo aborta ante una definición con palabra reservada", () => {
    const invalida: EntradaScaffolding = {
      ...entradaDemo,
      entidades: [{ ...entidadDemo(), nombre: "combustible" }],
    };
    expect(() => generarModulo(invalida)).toThrow(/DGP-006/);
  });
});

/* ============ 4. Semántica de /sync: idempotencia tenant-scoped ========== */
/**
 * Verifica el CONTRATO en el que se apoya el /sync generado, ejecutando el
 * módulo demo sobre un runtime FAKE del núcleo. El endpoint generado propaga
 * `op.opId` dentro del input del comando y deriva el recibo del resultado
 * (`idempotente`), sin cachés globales. La deduplicación es SIEMPRE por tenant
 * (el tenant sale del ExecutionContext): `crear` deduplica por el id de cliente
 * (obligatorio) y el resto de comandos por `_opIds` en el registro.
 */
describe("/sync generado: idempotencia por tenant + opId (semántica sobre runtime fake)", () => {
  const definicionModulo = definicionDesdeEntrada(entradaDemo);
  const modulo = () => crearModuloGenerico(definicionModulo);

  const PERMISOS = [
    ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...modulo().permissions]),
  ];
  const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: PERMISOS, capacidades: [] };

  function runtime(): PlatformRuntime {
    return createPlatformRuntime({ logger: new MemoryLogger(), extraServices: [modulo()] });
  }
  function ctxOf(tenantId: string): ExecutionContext {
    return createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  }
  const CREAR = `${SERVICIO}.ficha.crear`;
  const LISTAR = `${SERVICIO}.ficha.listar`;

  /**
   * Simula el bucle de /sync generado: id de cliente (dedupe de `crear` en el
   * núcleo) + opId propagado al input. El offline client porta un id estable.
   */
  const syncCrear = (rt: PlatformRuntime, ctx: ExecutionContext, id: string, opId: string, titulo: string) =>
    rt.kernel.commands.execute(ctx, CREAR, { id, data: { titulo }, opId });

  it("reejecución del mismo opId en el mismo tenant es idempotente (no duplica)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-1");
    const id = "cli-1";
    const opId = "op-abc";
    const r1 = await syncCrear(rt, ctx, id, opId, "Offline");
    const r2 = await syncCrear(rt, ctx, id, opId, "Offline");
    expect(r1.ok && r2.ok).toBe(true);
    if (!r2.ok) return;
    // El reintento devuelve recibo idempotente sin re-crear.
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
    await rt.kernel.outboxProcessor.processPending();
    const lista = await rt.kernel.queries.execute(ctx, LISTAR, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
  });

  it("el MISMO id+opId reutilizado en OTRO tenant NO devuelve el resultado ajeno", async () => {
    const rt = runtime();
    // Misma clave de cliente en ambos tenants: la dedupe NUNCA debe cruzar tenants.
    const id = "cli-compartido";
    const opId = "op-compartido";
    const ctxA = ctxOf("t-a");
    const ctxB = ctxOf("t-b");

    const rA = await syncCrear(rt, ctxA, id, opId, "Solo A");
    const rB = await syncCrear(rt, ctxB, id, opId, "Solo B");
    expect(rA.ok && rB.ok).toBe(true);
    if (!rA.ok || !rB.ok) return;

    // Ninguno se resuelve como recibo del otro: ambos crean de verdad en su tenant.
    expect((rA.value as { idempotente: boolean }).idempotente).toBe(false);
    expect((rB.value as { idempotente: boolean }).idempotente).toBe(false);

    await rt.kernel.outboxProcessor.processPending();

    // Cada tenant ve SOLO su propio registro (dedupe nunca cruza tenants).
    const listaA = await rt.kernel.queries.execute(ctxA, LISTAR, {});
    const listaB = await rt.kernel.queries.execute(ctxB, LISTAR, {});
    expect(listaA.ok && (listaA.value as { data: Record<string, unknown> }[]).map((x) => x.data["titulo"]))
      .toEqual(["Solo A"]);
    expect(listaB.ok && (listaB.value as { data: Record<string, unknown> }[]).map((x) => x.data["titulo"]))
      .toEqual(["Solo B"]);
  });

  it("reintento de 'crear' con mismo id+opId no duplica registro NI evento", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-ev");
    let eventos = 0;
    rt.kernel.dispatcher.subscribe(`${SERVICIO}.ficha.creada`, "test:contador-creada", () => {
      eventos += 1;
      return Promise.resolve({ ok: true, value: undefined });
    });

    const id = "cli-durable";
    const opId = "op-durable";
    // Primera aplicación: crea de verdad.
    const r1 = await syncCrear(rt, ctx, id, opId, "Durable");
    // Reintento (respuesta perdida por el cliente): mismo id + opId.
    const r2 = await syncCrear(rt, ctx, id, opId, "Durable");
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect((r1.value as { idempotente: boolean }).idempotente).toBe(false);
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);

    await rt.kernel.outboxProcessor.processPending();

    // Un único registro y un único evento .creada emitido.
    const lista = await rt.kernel.queries.execute(ctx, LISTAR, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBe(1);
    expect(eventos).toBe(1);
  });
});
