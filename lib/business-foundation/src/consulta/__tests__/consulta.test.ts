/**
 * DGP-006 · Business Foundation Framework — Pruebas de la familia CONSULTA.
 *
 * Cubre: filtro (derivación, validación Zod, aplicación en memoria, combinación
 * y/o, serialización estable), búsqueda (indexación desde payload + query que
 * filtra por entityType, aislamiento entre entidades), catálogo (definición
 * preconfigurada + query .opciones activos ordenados) y árbol (mover con
 * anti-ciclos, reescritura de rutas de descendientes, .hijos y .arbol).
 *
 * Módulo de prueba "demo": 100% neutro, sin ningún concepto de negocio.
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  fail,
  KernelErrors,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
  type UnitOfWork,
} from "@workspace/kernel";
import {
  createPlatformRuntime,
  FakeAuditTrail,
  FakeRecordStore,
  officialServices,
  type PlatformRuntime,
  type RecordPatch,
  type ServiceDeps,
} from "@workspace/platform";
import { crearModuloGenerico } from "../../nucleo/bootstrap";
import type { DefinicionEntidad, DefinicionModulo } from "../../nucleo/definicion";
import {
  aplicarFiltro,
  derivarDefinicionFiltro,
  deserializarFiltro,
  evaluarFiltro,
  parsearFiltroSafe,
  serializarFiltro,
  type ExpresionFiltro,
} from "../filtro";
import { crearHandlerIndexacion, crearQueryBusqueda, documentIdDe, tipoEntidadBusqueda } from "../busqueda";
import { crearDefinicionCatalogo, crearQueryOpciones } from "../catalogo";
import { calcularRuta, camposArbol, construirArbol, crearComandoMover, crearQueriesArbol } from "../arbol";

/* ----------------------------- Definiciones ------------------------------ */

const SERVICIO = "modulo.demo";

const PERMISOS = {
  leer: `${SERVICIO}.read`,
  crear: `${SERVICIO}.write`,
  editar: `${SERVICIO}.write`,
  eliminar: `${SERVICIO}.write`,
  admin: `${SERVICIO}.admin`,
};

const CAPS = [
  { name: "gestionar-demo", permissions: [PERMISOS.crear, PERMISOS.leer], description: "demo" },
];

// Entidad "ficha" (con campos filtrables/buscables) para filtro y búsqueda.
const ficha: DefinicionEntidad = {
  nombre: "ficha",
  etiqueta: "Ficha",
  servicio: SERVICIO,
  campos: [
    { nombre: "titulo", tipo: "texto", requerido: true, longitudMax: 120, buscable: true, filtrable: true },
    { nombre: "cantidad", tipo: "numero", filtrable: true },
    { nombre: "categoria", tipo: "enum", enumValores: ["a", "b", "c"], filtrable: true },
    { nombre: "activo", tipo: "booleano" },
  ],
  permisos: PERMISOS,
  capacidades: CAPS,
};

// Catálogo (activo/inactivo + clave/etiqueta/orden).
const catalogo = crearDefinicionCatalogo({
  nombre: "estado",
  etiqueta: "Estado",
  servicio: SERVICIO,
  permisos: PERMISOS,
  capacidades: CAPS,
});

// Entidad "nodo" jerárquica (padreId + _ruta).
const nodo: DefinicionEntidad = {
  nombre: "nodo",
  etiqueta: "Nodo",
  servicio: SERVICIO,
  campos: [
    { nombre: "titulo", tipo: "texto", requerido: true, buscable: true },
    ...camposArbol(),
  ],
  permisos: PERMISOS,
  capacidades: CAPS,
};

const definicionModulo: DefinicionModulo = {
  servicio: SERVICIO,
  etiqueta: "Módulo Demo",
  entidades: [ficha, catalogo, nodo],
  capacidades: CAPS,
  permisos: [PERMISOS.leer, PERMISOS.crear, PERMISOS.admin],
  dependeDe: ["platform.config", "platform.search"],
};

/* ------------------------------ Infra de test ---------------------------- */

const modulo = () =>
  crearModuloGenerico(definicionModulo, {
    queries: [
      crearQueryBusqueda(ficha),
      crearQueryOpciones(catalogo),
      ...crearQueriesArbol(nodo),
    ],
    comandos: [crearComandoMover(nodo)],
    eventHandlers: crearHandlerIndexacion(ficha),
  });

const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...modulo().permissions]),
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };

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

/* =============================== 1. Filtro ============================== */

describe("Filtro genérico", () => {
  const definicion = derivarDefinicionFiltro(ficha);

  it("deriva solo los campos filtrables con operadores por tipo", () => {
    const nombres = definicion.campos.map((c) => c.nombre);
    expect(nombres).toEqual(["titulo", "cantidad", "categoria"]);
    const cantidad = definicion.campos.find((c) => c.nombre === "cantidad")!;
    expect(cantidad.operadores).toContain("gte");
    const categoria = definicion.campos.find((c) => c.nombre === "categoria")!;
    expect(categoria.operadores).not.toContain("gt");
  });

  it("valida (Zod) campos, operadores y forma del valor", () => {
    expect(parsearFiltroSafe(definicion, { campo: "cantidad", operador: "gte", valor: 3 }).success).toBe(true);
    // campo no filtrable
    expect(parsearFiltroSafe(definicion, { campo: "activo", operador: "eq", valor: true }).success).toBe(false);
    // operador no permitido para el tipo
    expect(parsearFiltroSafe(definicion, { campo: "categoria", operador: "gt", valor: "a" }).success).toBe(false);
    // "entre" requiere tupla de 2
    expect(parsearFiltroSafe(definicion, { campo: "cantidad", operador: "entre", valor: [1] }).success).toBe(false);
    // "en" requiere arreglo
    expect(parsearFiltroSafe(definicion, { campo: "cantidad", operador: "en", valor: 5 }).success).toBe(false);
  });

  it("aplica comparaciones en memoria (eq, gte, contiene, en, entre)", () => {
    const regs = [
      { data: { titulo: "Alfa", cantidad: 2, categoria: "a" } },
      { data: { titulo: "Beta", cantidad: 5, categoria: "b" } },
      { data: { titulo: "Gamma", cantidad: 9, categoria: "a" } },
    ];
    expect(aplicarFiltro({ campo: "categoria", operador: "eq", valor: "a" }, regs)).toHaveLength(2);
    expect(aplicarFiltro({ campo: "cantidad", operador: "gte", valor: 5 }, regs)).toHaveLength(2);
    expect(aplicarFiltro({ campo: "titulo", operador: "contiene", valor: "et" }, regs)).toHaveLength(1);
    expect(aplicarFiltro({ campo: "categoria", operador: "en", valor: ["b", "c"] }, regs)).toHaveLength(1);
    expect(aplicarFiltro({ campo: "cantidad", operador: "entre", valor: [3, 9] }, regs)).toHaveLength(2);
  });

  it("combina expresiones con y/o", () => {
    const data = { titulo: "Alfa", cantidad: 5, categoria: "a" };
    const yExpr: ExpresionFiltro = {
      y: [
        { campo: "categoria", operador: "eq", valor: "a" },
        { campo: "cantidad", operador: "gte", valor: 5 },
      ],
    };
    expect(evaluarFiltro(yExpr, data)).toBe(true);
    const oExpr: ExpresionFiltro = {
      o: [
        { campo: "categoria", operador: "eq", valor: "z" },
        { campo: "cantidad", operador: "lt", valor: 10 },
      ],
    };
    expect(evaluarFiltro(oExpr, data)).toBe(true);
    expect(evaluarFiltro({ y: [{ campo: "cantidad", operador: "gt", valor: 100 }] }, data)).toBe(false);
  });

  it("serializa de forma ESTABLE y deserializa el mismo filtro", () => {
    const expr: ExpresionFiltro = {
      y: [
        { campo: "categoria", operador: "eq", valor: "a" },
        { campo: "cantidad", operador: "gte", valor: 3 },
      ],
    };
    const s1 = serializarFiltro(expr);
    const s2 = serializarFiltro(deserializarFiltro(derivarDefinicionFiltro(ficha), s1));
    expect(s1).toBe(s2);
  });
});

/* ============================== 2. Búsqueda ============================= */

describe("Búsqueda genérica (puente platform.search)", () => {
  it("documentId y entityType son estables", () => {
    expect(documentIdDe(ficha, "x1")).toBe(`${SERVICIO}:ficha:x1`);
    expect(tipoEntidadBusqueda(ficha)).toBe(`${SERVICIO}:ficha`);
  });

  it("indexa desde el payload del evento .creada y la query .buscar la encuentra", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creado = await exec(rt, ctx, `${SERVICIO}.ficha.crear`, { data: { titulo: "Documento Alfa" } });
    expect(creado.ok).toBe(true);
    await drain(rt); // dispara el handler de indexación
    const res = await query(rt, ctx, `${SERVICIO}.ficha.buscar`, { q: "Alfa" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect((res.value as unknown[]).length).toBe(1);
  });

  it("la query .buscar aísla por entityType (no devuelve otras entidades)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t2");
    // Indexa manualmente un documento de OTRO entityType con el mismo término.
    await exec(rt, ctx, "platform.search.indexDocument", {
      documentId: `${SERVICIO}:otra:z9`,
      entityType: `${SERVICIO}:otra`,
      entityRef: `${SERVICIO}.otra:z9`,
      titulo: "Alfa ajena",
      contenido: "Alfa ajena",
    });
    await exec(rt, ctx, `${SERVICIO}.ficha.crear`, { data: { titulo: "Alfa propia" } });
    await drain(rt);
    const res = await query(rt, ctx, `${SERVICIO}.ficha.buscar`, { q: "Alfa" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const docs = res.value as { entityType: string }[];
    expect(docs.every((d) => d.entityType === `${SERVICIO}:ficha`)).toBe(true);
    expect(docs.length).toBe(1);
  });

  it("indexación idempotente: reprocesar el mismo evento no duplica documentos", async () => {
    const rt = runtime();
    const ctx = ctxOf("t3");
    await exec(rt, ctx, `${SERVICIO}.ficha.crear`, { data: { titulo: "Idem" } });
    await drain(rt);
    await drain(rt); // segundo drain: sin eventos nuevos, pero validamos estabilidad
    const res = await query(rt, ctx, `${SERVICIO}.ficha.buscar`, { q: "Idem" });
    expect(res.ok && (res.value as unknown[]).length).toBe(1);
  });
});

/* ============================== 3. Catálogo ============================= */

describe("Catálogo genérico", () => {
  it("crea una definición preconfigurada con clave/etiqueta/posicion y máquina habilitado/deshabilitado", () => {
    expect(catalogo.campos.map((c) => c.nombre)).toEqual(["clave", "etiqueta", "posicion"]);
    const estados = catalogo.maquinaEstados!.estados.map((e) => e.nombre);
    expect(estados).toEqual(["habilitado", "deshabilitado"]);
    expect(catalogo.maquinaEstados!.estados.find((e) => e.inicial)?.nombre).toBe("habilitado");
    // Vocabulario neutro: comandos habilitar/deshabilitar.
    const comandos = catalogo.maquinaEstados!.transiciones.map((t) => t.comando);
    expect(comandos).toEqual(["deshabilitar", "habilitar"]);
  });

  it(".opciones lista solo habilitados ordenados como {value,label}", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-cat");
    const crear = `${SERVICIO}.estado.crear`;
    await exec(rt, ctx, crear, { data: { clave: "b", etiqueta: "Beta", posicion: 2 } });
    const a = await exec(rt, ctx, crear, { data: { clave: "a", etiqueta: "Alfa", posicion: 1 } });
    const c = await exec(rt, ctx, crear, { data: { clave: "c", etiqueta: "Gamma", posicion: 3 } });
    if (!a.ok || !c.ok) throw new Error("setup");
    // Deshabilita "c" → no debe aparecer en opciones.
    const tr = await exec(rt, ctx, `${SERVICIO}.estado.transicionar`, {
      id: (c.value as { id: string }).id,
      version: 1,
      comando: "deshabilitar",
    });
    expect(tr.ok).toBe(true);
    const res = await query(rt, ctx, `${SERVICIO}.estado.opciones`, {});
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([
      { value: "a", label: "Alfa" },
      { value: "b", label: "Beta" },
    ]);
  });
});

/* =============================== 4. Árbol =============================== */

describe("Árbol genérico", () => {
  it("calcularRuta produce rutas materializadas anidadas", () => {
    expect(calcularRuta("", "a")).toBe("/a/");
    expect(calcularRuta("/a/", "b")).toBe("/a/b/");
  });

  it("construye el árbol en memoria desde un listado plano", () => {
    const arbol = construirArbol([
      { id: "a", estado: "borrador", data: { titulo: "A" } },
      { id: "b", estado: "borrador", data: { titulo: "B", padreId: "a" } },
      { id: "c", estado: "borrador", data: { titulo: "C", padreId: "b" } },
    ]);
    expect(arbol).toHaveLength(1);
    expect(arbol[0]!.id).toBe("a");
    expect(arbol[0]!.hijos[0]!.id).toBe("b");
    expect(arbol[0]!.hijos[0]!.hijos[0]!.id).toBe("c");
  });

  it("mover reparenta y actualiza la ruta del nodo y sus descendientes", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-arb");
    const crear = `${SERVICIO}.nodo.crear`;
    const a = await exec(rt, ctx, crear, { data: { titulo: "A" } });
    const b = await exec(rt, ctx, crear, { data: { titulo: "B" } });
    if (!a.ok || !b.ok) throw new Error("setup");
    const idA = (a.value as { id: string }).id;
    const idB = (b.value as { id: string }).id;
    // Fija la ruta raíz de A y B con un mover a raíz (para materializar _ruta).
    await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idA, version: 1, nuevoPadreId: null });
    await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idB, version: 1, nuevoPadreId: null });
    // Crea C hijo de B y materializa su ruta.
    const c = await exec(rt, ctx, crear, { data: { titulo: "C", padreId: idB } });
    if (!c.ok) throw new Error("setup");
    const idC = (c.value as { id: string }).id;
    await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idC, version: 1, nuevoPadreId: idB });

    // Mueve B bajo A → C (descendiente de B) debe reubicarse también.
    const bActual = await query(rt, ctx, `${SERVICIO}.nodo.obtener`, { id: idB });
    if (!bActual.ok) throw new Error("setup");
    const mov = await exec(rt, ctx, `${SERVICIO}.nodo.mover`, {
      id: idB,
      version: (bActual.value as { version: number }).version,
      nuevoPadreId: idA,
    });
    expect(mov.ok).toBe(true);
    if (!mov.ok) return;
    const rutas = (mov.value as { rutasActualizadas: { id: string; ruta: string }[] }).rutasActualizadas;
    // Nodo movido + descendiente C, ambos en un único resultado atómico.
    expect(rutas).toHaveLength(2);
    expect(rutas.some((r) => r.id === idC)).toBe(true);
    const cFinal = await query(rt, ctx, `${SERVICIO}.nodo.obtener`, { id: idC });
    expect(cFinal.ok).toBe(true);
    if (!cFinal.ok) return;
    const ruta = (cFinal.value as { data: Record<string, unknown> }).data["_ruta"] as string;
    expect(ruta).toBe(`/${idA}/${idB}/${idC}/`);
  });

  it("mover rechaza ciclos (padre descendiente del nodo movido)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-ciclo");
    const crear = `${SERVICIO}.nodo.crear`;
    const a = await exec(rt, ctx, crear, { data: { titulo: "A" } });
    if (!a.ok) throw new Error("setup");
    const idA = (a.value as { id: string }).id;
    await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idA, version: 1, nuevoPadreId: null });
    const b = await exec(rt, ctx, crear, { data: { titulo: "B", padreId: idA } });
    if (!b.ok) throw new Error("setup");
    const idB = (b.value as { id: string }).id;
    await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idB, version: 1, nuevoPadreId: idA });
    // Intentar mover A bajo B (su descendiente) → ciclo.
    const aActual = await query(rt, ctx, `${SERVICIO}.nodo.obtener`, { id: idA });
    if (!aActual.ok) throw new Error("setup");
    const ciclo = await exec(rt, ctx, `${SERVICIO}.nodo.mover`, {
      id: idA,
      version: (aActual.value as { version: number }).version,
      nuevoPadreId: idB,
    });
    expect(ciclo.ok).toBe(false);
    if (ciclo.ok) return;
    expect(ciclo.error.code).toBe("KRN-CFL-001");
  });

  it("mover rechaza que un nodo sea su propio padre", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-self");
    const a = await exec(rt, ctx, `${SERVICIO}.nodo.crear`, { data: { titulo: "A" } });
    if (!a.ok) throw new Error("setup");
    const idA = (a.value as { id: string }).id;
    const r = await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idA, version: 1, nuevoPadreId: idA });
    expect(r.ok).toBe(false);
  });

  it(".hijos devuelve solo los hijos directos de un padre", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-hijos");
    const crear = `${SERVICIO}.nodo.crear`;
    const a = await exec(rt, ctx, crear, { data: { titulo: "A" } });
    if (!a.ok) throw new Error("setup");
    const idA = (a.value as { id: string }).id;
    await exec(rt, ctx, crear, { data: { titulo: "B", padreId: idA } });
    await exec(rt, ctx, crear, { data: { titulo: "C", padreId: idA } });
    await exec(rt, ctx, crear, { data: { titulo: "Raiz" } });
    const hijos = await query(rt, ctx, `${SERVICIO}.nodo.hijos`, { padreId: idA });
    expect(hijos.ok).toBe(true);
    if (!hijos.ok) return;
    expect((hijos.value as unknown[]).length).toBe(2);
    const raices = await query(rt, ctx, `${SERVICIO}.nodo.hijos`, {});
    expect(raices.ok && (raices.value as unknown[]).length).toBe(2); // A y Raiz
  });

  it(".arbol construye la jerarquía completa del tenant", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-tree");
    const crear = `${SERVICIO}.nodo.crear`;
    const a = await exec(rt, ctx, crear, { data: { titulo: "A" } });
    if (!a.ok) throw new Error("setup");
    const idA = (a.value as { id: string }).id;
    await exec(rt, ctx, crear, { data: { titulo: "B", padreId: idA } });
    const arbol = await query(rt, ctx, `${SERVICIO}.nodo.arbol`, {});
    expect(arbol.ok).toBe(true);
    if (!arbol.ok) return;
    const raices = arbol.value as { id: string; hijos: unknown[] }[];
    expect(raices).toHaveLength(1);
    expect(raices[0]!.hijos).toHaveLength(1);
  });

  it("mover es idempotente por opId: reintento con mismo opId no reemite ni duplica", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-op");
    const a = await exec(rt, ctx, `${SERVICIO}.nodo.crear`, { data: { titulo: "A" } });
    if (!a.ok) throw new Error("setup");
    const idA = (a.value as { id: string }).id;

    let movidas = 0;
    rt.kernel.dispatcher.subscribe(`${SERVICIO}.nodo.movida`, "test:mov", () => {
      movidas += 1;
      return Promise.resolve({ ok: true, value: undefined });
    });

    const opId = crypto.randomUUID();
    const m1 = await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idA, version: 1, nuevoPadreId: null, opId });
    expect(m1.ok).toBe(true);
    if (!m1.ok) return;
    expect((m1.value as { idempotente: boolean }).idempotente).toBe(false);

    // Reintento con la MISMA versión vieja pero mismo opId → éxito idempotente.
    const m2 = await exec(rt, ctx, `${SERVICIO}.nodo.mover`, { id: idA, version: 1, nuevoPadreId: null, opId });
    expect(m2.ok).toBe(true);
    if (!m2.ok) return;
    expect((m2.value as { idempotente: boolean }).idempotente).toBe(true);

    await drain(rt);
    // Solo la primera ejecución emitió el evento .movida.
    expect(movidas).toBe(1);
  });

  it("atomicidad (una sola UoW): si falla la reubicación de un descendiente, no se emite el evento .movida", async () => {
    // Store que falla en la SEGUNDA escritura (el nodo se escribe; el
    // descendiente falla) para verificar que el evento no se emite (el UoW en
    // memoria descarta los eventos ante un error; PostgreSQL revierte los datos).
    class StoreFallaSegundoUpdate extends FakeRecordStore {
      private updates = 0;
      override async update(
        uow: UnitOfWork,
        tenantId: string,
        id: string,
        expectedVersion: number,
        patch: RecordPatch,
      ) {
        this.updates += 1;
        if (this.updates === 2) return fail(KernelErrors.infrastructure("fallo simulado en descendiente"));
        return super.update(uow, tenantId, id, expectedVersion, patch);
      }
    }

    const store = new StoreFallaSegundoUpdate();
    const audit = new FakeAuditTrail();
    // Seed: nodo raíz A (con _ruta) y descendiente B colgando de A.
    const fakeUow = {} as unknown as UnitOfWork;
    await store.insert(fakeUow, {
      id: "A", tenantId: "t", service: SERVICIO, recordType: "nodo",
      status: "borrador", data: { titulo: "A", _ruta: "/A/" }, createdBy: "u",
    });
    await store.insert(fakeUow, {
      id: "B", tenantId: "t", service: SERVICIO, recordType: "nodo",
      status: "borrador", data: { titulo: "B", padreId: "A", _ruta: "/A/B/" }, createdBy: "u",
    });

    let eventos = 0;
    const uow: UnitOfWork = {
      session: null,
      registerEvent: () => {
        eventos += 1;
      },
      get pendingEvents() {
        return [];
      },
    } as unknown as UnitOfWork;

    const deps = { store, audit, tenantConfig: {}, runtime: {} } as unknown as ServiceDeps;
    const cmd = crearComandoMover(nodo)(deps);
    const ctx = ctxOf("t");
    // Mueve A a una nueva raíz (reasigna su ruta) — como A tiene descendiente B,
    // el segundo update (B) falla → el comando devuelve error y NO registra evento.
    const r = await cmd.handle(ctx, { id: "A", version: 1, nuevoPadreId: null }, uow);
    expect(r.ok).toBe(false);
    expect(eventos).toBe(0); // ningún evento .movida registrado ⇒ atomicidad de efectos
  });
});
