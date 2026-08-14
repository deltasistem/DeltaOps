/**
 * DGP-008.2 · Módulo Activos — Pruebas con adaptadores Fake (offline) de la
 * infraestructura operacional: relaciones inter-activo (catálogo de tipos con
 * inversos, existencia, anticiclo), read models de árbol/relacionados/
 * componentes, historial de ubicaciones/responsables, línea de tiempo propia
 * del módulo, consola técnica (restringida a admin) y cobertura de TODAS las
 * operaciones por la cola de sincronización offline.
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
  crearActivosRuntime,
  MODULO,
  TIPOS_RELACION,
  tipoRelacion,
  type ActivosRuntime,
} from "..";

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...activosModule({
      repository: null as never,
      readModel: null as never,
      relaciones: null as never,
      relacionesRead: null as never,
      historial: null as never,
      syncReceipts: null as never,
      consola: null as never,
      eventLog: null as never,
    }).permissions,
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

async function sembrarCatalogos(rt: ActivosRuntime, ctx: ExecutionContext): Promise<void> {
  const c = [
    ["tipos", "movil", "Equipo móvil"],
    ["categorias", "maquinaria", "Maquinaria"],
    ["familias", "excavadoras", "Excavadoras"],
    ["criticidades", "alta", "Alta"],
    ["ubicaciones", "planta-1", "Planta 1"],
    ["ubicaciones", "planta-2", "Planta 2"],
    ["monedas", "USD", "Dólar"],
    ["unidades", "h", "Horas"],
    ["unidades", "km", "Kilómetros"],
  ] as const;
  for (const [catalogo, clave, etiqueta] of c) {
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo, clave, etiqueta });
  }
}

const BASE = {
  tipo: "movil",
  categoria: "maquinaria",
  familia: "excavadoras",
  criticidad: "alta",
};

/** Genera ids UUID deterministas por nombre lógico dentro de una prueba. */
function idPool() {
  const map = new Map<string, string>();
  return (nombre: string): string => {
    let v = map.get(nombre);
    if (!v) {
      v = crypto.randomUUID();
      map.set(nombre, v);
    }
    return v;
  };
}

/** Crea un activo con id de cliente (UUID) y drena el outbox (proyecciones). */
async function crearActivo(rt: ActivosRuntime, ctx: ExecutionContext, id: string, codigo: string): Promise<void> {
  const r = await exec(rt, ctx, `${MODULO}.crear`, { ...BASE, id, codigoEmpresarial: codigo, nombre: codigo });
  expect(r.ok, r.ok ? "" : JSON.stringify((r as { error: unknown }).error)).toBe(true);
  await drain(rt);
}

/* ---------------------------- Dominio: relaciones ------------------------- */

describe("DGP-008.2 · dominio de relaciones", () => {
  it("todo tipo declara un inverso presente en el catálogo", () => {
    for (const t of TIPOS_RELACION) {
      const inv = tipoRelacion(t.inverso);
      expect(inv).toBeDefined();
      expect(inv?.inverso).toBe(t.tipo); // par declarativo simétrico
    }
  });
  it("tipos jerárquicos identificados (padre-de, compuesto-por y sus inversos)", () => {
    expect(tipoRelacion("padre-de")?.jerarquico).toBe(true);
    expect(tipoRelacion("compuesto-por")?.jerarquico).toBe(true);
    expect(tipoRelacion("relacionado-con")?.jerarquico).toBe(false);
    // relacionado-con es su propio inverso (asociación simétrica).
    expect(tipoRelacion("relacionado-con")?.inverso).toBe("relacionado-con");
  });
});

/* -------------------------- Relaciones (integración) ---------------------- */

describe("DGP-008.2 · relaciones inter-activo", () => {
  it("crea relación jerárquica y la proyecta a árbol/relacionados", async () => {
    const rt = runtime();
    const ctx = ctxOf("rel-1");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, id("flota"), "FLOTA");
    await crearActivo(rt, ctx, id("exc"), "EXC");

    const r = await exec(rt, ctx, `${MODULO}.crear-relacion`, {
      tipo: "padre-de", origenId: id("flota"), destinoId: id("exc"),
    });
    expect(r.ok).toBe(true);
    await drain(rt);

    const arbol = await query(rt, ctx, `${MODULO}.arbol`, { id: id("flota") });
    expect(arbol.ok).toBe(true);
    if (arbol.ok) {
      const v = arbol.value as { hijos: unknown[] };
      expect(v.hijos.length).toBe(1);
    }
    const arbolHijo = await query(rt, ctx, `${MODULO}.arbol`, { id: id("exc") });
    if (arbolHijo.ok) {
      const v = arbolHijo.value as { padres: unknown[] };
      expect(v.padres.length).toBe(1);
    }
  });

  it("rechaza relación duplicada (misma arista/tipo)", async () => {
    const rt = runtime();
    const ctx = ctxOf("rel-2");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, id("a"), "A");
    await crearActivo(rt, ctx, id("b"), "B");
    const r1 = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "depende-de", origenId: id("a"), destinoId: id("b") });
    expect(r1.ok).toBe(true);
    await drain(rt);
    const r2 = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "depende-de", origenId: id("a"), destinoId: id("b") });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("KRN-CFL-001");
  });

  it("anticiclo: rechaza cerrar un ciclo jerárquico", async () => {
    const rt = runtime();
    const ctx = ctxOf("rel-3");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, id("x"), "X");
    await crearActivo(rt, ctx, id("y"), "Y");
    const r1 = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: id("x"), destinoId: id("y") });
    expect(r1.ok).toBe(true);
    await drain(rt);
    // y padre-de x cerraría el ciclo x->y->x.
    const r2 = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: id("y"), destinoId: id("x") });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error.code).toBe("KRN-CFL-001");
  });

  it("rechaza extremos inexistentes y auto-relación", async () => {
    const rt = runtime();
    const ctx = ctxOf("rel-4");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, id("solo"), "SOLO");
    const inexistente = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "depende-de", origenId: id("solo"), destinoId: crypto.randomUUID() });
    expect(inexistente.ok).toBe(false);
    if (!inexistente.ok) expect(inexistente.error.code).toBe("KRN-NF-001");
    const auto = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "depende-de", origenId: id("solo"), destinoId: id("solo") });
    expect(auto.ok).toBe(false);
  });

  it("componentes: compuesto-por proyecta a componentes / perteneceA", async () => {
    const rt = runtime();
    const ctx = ctxOf("rel-5");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, id("motor"), "MOTOR");
    await crearActivo(rt, ctx, id("bomba"), "BOMBA");
    await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "compuesto-por", origenId: id("motor"), destinoId: id("bomba") });
    await drain(rt);
    const comp = await query(rt, ctx, `${MODULO}.componentes`, { id: id("motor") });
    expect(comp.ok).toBe(true);
    if (comp.ok) expect((comp.value as { componentes: unknown[] }).componentes.length).toBe(1);
    const parte = await query(rt, ctx, `${MODULO}.componentes`, { id: id("bomba") });
    if (parte.ok) expect((parte.value as { perteneceA: unknown[] }).perteneceA.length).toBe(1);
  });

  it("eliminar relación la retira del read model", async () => {
    const rt = runtime();
    const ctx = ctxOf("rel-6");
    const id = idPool();
    const relId = crypto.randomUUID();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, id("p"), "P");
    await crearActivo(rt, ctx, id("q"), "Q");
    const r = await exec(rt, ctx, `${MODULO}.crear-relacion`, { id: relId, tipo: "relacionado-con", origenId: id("p"), destinoId: id("q") });
    expect(r.ok).toBe(true);
    await drain(rt);
    const del = await exec(rt, ctx, `${MODULO}.eliminar-relacion`, { id: relId });
    expect(del.ok).toBe(true);
    await drain(rt);
    const rel = await query(rt, ctx, `${MODULO}.relacionados`, { id: id("p") });
    if (rel.ok) expect((rel.value as { salientes: unknown[] }).salientes.length).toBe(0);
    // eliminar de nuevo ⇒ notFound.
    const del2 = await exec(rt, ctx, `${MODULO}.eliminar-relacion`, { id: relId });
    expect(del2.ok).toBe(false);
    if (!del2.ok) expect(del2.error.code).toBe("KRN-NF-001");
  });
});

/* --------------------------- Historial + timeline ------------------------- */

describe("DGP-008.2 · historial y línea de tiempo", () => {
  it("registra historial de ubicaciones y responsables desde eventos", async () => {
    const rt = runtime();
    const ctx = ctxOf("hist-1");
    const A = crypto.randomUUID();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, A, "A");
    let det = await query(rt, ctx, `${MODULO}.detalle`, { id: A });
    let ver = (det as { value: { version: number } }).value.version;

    await exec(rt, ctx, `${MODULO}.cambiar-ubicacion`, {
      id: A, expectedVersion: ver,
      ubicacion: { ubicacionId: "planta-1", etiqueta: "Planta 1" },
    });
    await drain(rt);
    det = await query(rt, ctx, `${MODULO}.detalle`, { id: A });
    ver = (det as { value: { version: number } }).value.version;
    await exec(rt, ctx, `${MODULO}.cambiar-ubicacion`, {
      id: A, expectedVersion: ver,
      ubicacion: { ubicacionId: "planta-2", etiqueta: "Planta 2" },
    });
    await drain(rt);

    const ubic = await query(rt, ctx, `${MODULO}.historial-ubicaciones`, { id: A });
    expect(ubic.ok).toBe(true);
    if (ubic.ok) expect((ubic.value as unknown[]).length).toBe(2);

    det = await query(rt, ctx, `${MODULO}.detalle`, { id: A });
    ver = (det as { value: { version: number } }).value.version;
    await exec(rt, ctx, `${MODULO}.asignar-responsable`, { id: A, expectedVersion: ver, responsable: "juan" });
    await drain(rt);
    const resp = await query(rt, ctx, `${MODULO}.historial-responsables`, { id: A });
    expect(resp.ok).toBe(true);
    if (resp.ok) expect((resp.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("cada evento de dominio se proyecta al historial interno del activo", async () => {
    const rt = runtime();
    const ctx = ctxOf("hist-2");
    const A = crypto.randomUUID();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, A, "A");
    const det = await query(rt, ctx, `${MODULO}.detalle`, { id: A });
    const ver = (det as { value: { version: number } }).value.version;
    await exec(rt, ctx, `${MODULO}.registrar`, { id: A, expectedVersion: ver });
    await drain(rt);
    const tl = await query(rt, ctx, `${MODULO}.historial`, { id: A });
    expect(tl.ok).toBe(true);
    if (tl.ok) {
      const items = tl.value as Array<{ tipoEvento: string; resumen: string }>;
      expect(items.length).toBeGreaterThanOrEqual(2); // registrado + registrar(REGISTRADO)
      expect(items.every((i) => typeof i.resumen === "string" && i.resumen.length > 0)).toBe(true);
    }
  });

  it("cada evento se proyecta al Shared Timeline de plataforma con filtros", async () => {
    const rt = runtime();
    const ctx = ctxOf("hist-3");
    const A = crypto.randomUUID();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, A, "A");
    const det = await query(rt, ctx, `${MODULO}.detalle`, { id: A });
    const ver = (det as { value: { version: number } }).value.version;
    await exec(rt, ctx, `${MODULO}.registrar`, { id: A, expectedVersion: ver });
    await drain(rt);

    // Sin filtros: proyección canónica al timeline compartido.
    const tl = await query(rt, ctx, `${MODULO}.timeline`, { id: A });
    expect(tl.ok).toBe(true);
    if (!tl.ok) return;
    // Shape PLANO normalizado (DGP-010 fix): la UI recibe `eventType`/`tipo`,
    // `ocurridoAt`/`occurredAt` y `resumen` legibles, nunca objetos anidados que
    // pintaban «Evento» / «Sin datos».
    const items = tl.value as Array<{ eventType: string; tipo: string; estado: string | null; actorId: string; resumen: string; ocurridoAt: string | null }>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => typeof i.eventType === "string" && i.eventType.length > 0)).toBe(true);
    expect(items.every((i) => i.tipo === i.eventType)).toBe(true);
    expect(items.every((i) => typeof i.resumen === "string" && i.resumen.length > 0)).toBe(true);
    expect(items.every((i) => typeof i.ocurridoAt === "string" && i.ocurridoAt!.length > 0)).toBe(true);

    // Filtro por estado: sólo entradas cuyo estado proyectado coincide.
    const porEstado = await query(rt, ctx, `${MODULO}.timeline`, { id: A, estado: "REGISTRADO" });
    expect(porEstado.ok).toBe(true);
    if (porEstado.ok) {
      const filtrados = porEstado.value as Array<{ estado: string | null }>;
      expect(filtrados.length).toBeGreaterThanOrEqual(1);
      expect(filtrados.every((i) => i.estado === "REGISTRADO")).toBe(true);
    }

    // Filtro por actor inexistente ⇒ vacío.
    const vacio = await query(rt, ctx, `${MODULO}.timeline`, { id: A, actor: "no-existe" });
    expect(vacio.ok && (vacio.value as unknown[]).length).toBe(0);
  });

  it("LITE-09 · la cronología del activo devuelve TODAS sus entradas (no se recorta a 200) y muestra el proveedor del tanqueo", async () => {
    const rt = runtime();
    const ctx = ctxOf("hist-lite09");
    const A = crypto.randomUUID();
    const entityRef = `activo:${A}`;
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, A, "A");
    await drain(rt);

    // 260 eventos "recientes" (simulan jornadas/lecturas) que ANTES empujaban
    // los eventos antiguos (preop/tanqueo) fuera de la primera página de 200.
    for (let i = 0; i < 260; i += 1) {
      await exec(rt, ctx, "platform.timeline.record", {
        entryId: `reciente-${i}`,
        entityRef,
        eventType: "historico.jornada",
        actorId: "u-1",
        occurredAt: new Date(2026, 5, 1, 0, 0, i).toISOString(),
        resumen: "Jornada histórica",
      });
    }
    // Un tanqueo ANTIGUO con snapshot de proveedor (canónico) …
    await exec(rt, ctx, "platform.timeline.record", {
      entryId: "tanqueo-antiguo",
      entityRef,
      eventType: "modulo.utilizacion.tanqueo-registrado",
      actorId: "u-2",
      occurredAt: "2025-09-26T00:00:00.000Z",
      resumen: "Tanqueo 69L diesel",
      payload: { snapshot: { proveedorId: "COMBGAS" } },
    });
    // … y un preoperacional ANTIGUO.
    await exec(rt, ctx, "platform.timeline.record", {
      entryId: "preop-antiguo",
      entityRef,
      eventType: "historico.preoperacional",
      actorId: "u-3",
      occurredAt: "2025-10-14T10:00:00.000Z",
      resumen: "Preoperacional APTO",
    });

    const tl = await query(rt, ctx, `${MODULO}.timeline`, { id: A });
    expect(tl.ok).toBe(true);
    if (!tl.ok) return;
    const items = tl.value as Array<{ eventType: string; resumen: string }>;
    // Se devuelven MÁS de 200 (todas), no se recorta la página.
    expect(items.length).toBeGreaterThan(200);
    // El preoperacional antiguo está presente pese a los 260 eventos recientes.
    expect(items.some((i) => i.eventType === "historico.preoperacional")).toBe(true);
    // El tanqueo muestra el proveedor en el resumen.
    const tanqueo = items.find((i) => i.eventType === "modulo.utilizacion.tanqueo-registrado");
    expect(tanqueo).toBeTruthy();
    expect(tanqueo?.resumen).toContain("COMBGAS");
  });
});

/* ---------------------- Reproyección por replay -------------------------- */

describe("DGP-008.2 · reproyección por replay del event stream", () => {
  /** Snapshot completo de TODOS los read models del módulo para un tenant. */
  async function snapshot(rt: ActivosRuntime, ctx: ExecutionContext, ids: string[]) {
    const listar = await query(rt, ctx, `${MODULO}.listar`, {});
    const porActivo: Record<string, unknown> = {};
    for (const id of ids) {
      porActivo[id] = {
        historial: (await query(rt, ctx, `${MODULO}.historial`, { id })),
        ubicaciones: (await query(rt, ctx, `${MODULO}.historial-ubicaciones`, { id })),
        responsables: (await query(rt, ctx, `${MODULO}.historial-responsables`, { id })),
        relacionados: (await query(rt, ctx, `${MODULO}.relacionados`, { id })),
        arbol: (await query(rt, ctx, `${MODULO}.arbol`, { id })),
      };
    }
    return JSON.stringify({ listar, porActivo });
  }

  it("re-aplica las MISMAS proyecciones ⇒ read models idénticos (equivalencia total)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-equiv");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);

    const A = id("A"), B = id("B"), C = id("C");
    await crearActivo(rt, ctx, A, "EQ-A");
    await crearActivo(rt, ctx, B, "EQ-B");
    await crearActivo(rt, ctx, C, "EQ-C");

    // Operaciones variadas: transición, ubicación, responsable y relaciones.
    const verDe = async (x: string) =>
      ((await query(rt, ctx, `${MODULO}.detalle`, { id: x })) as { value: { version: number } }).value.version;

    await exec(rt, ctx, `${MODULO}.registrar`, { id: A, expectedVersion: await verDe(A) });
    await drain(rt);
    await exec(rt, ctx, `${MODULO}.cambiar-ubicacion`, {
      id: A, expectedVersion: await verDe(A), ubicacion: { ubicacionId: "planta-1", etiqueta: "Planta 1" },
    });
    await drain(rt);
    await exec(rt, ctx, `${MODULO}.cambiar-ubicacion`, {
      id: A, expectedVersion: await verDe(A), ubicacion: { ubicacionId: "planta-2", etiqueta: "Planta 2" },
    });
    await drain(rt);
    await exec(rt, ctx, `${MODULO}.asignar-responsable`, { id: A, expectedVersion: await verDe(A), responsable: "ana" });
    await drain(rt);
    await exec(rt, ctx, `${MODULO}.asignar-responsable`, { id: A, expectedVersion: await verDe(A), responsable: "beto" });
    await drain(rt);
    await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: A, destinoId: B });
    await drain(rt);
    await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "compuesto-por", origenId: A, destinoId: C });
    await drain(rt);
    // Una relación creada y luego eliminada (el replay debe reflejar la baja).
    const rel = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "relacionado-con", origenId: B, destinoId: C });
    await drain(rt);
    const relId = (rel as { value: { id: string } }).value.id;
    await exec(rt, ctx, `${MODULO}.eliminar-relacion`, { id: relId });
    await drain(rt);

    const antes = await snapshot(rt, ctx, [A, B, C]);

    // Reproyecta desde el stream de eventos procesados (read models vaciados).
    const rep = await exec(rt, ctx, `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    await drain(rt);

    const despues = await snapshot(rt, ctx, [A, B, C]);
    // Igualdad TOTAL de los read models, no sólo de conteos.
    expect(despues).toBe(antes);
  });

  it("reproyecta desde la bitácora incluso con eventos AÚN pendientes en el outbox", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-pend");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);

    const A = id("A");
    await crearActivo(rt, ctx, A, "PEND-A");
    // registrar SIN drenar el outbox: el evento queda pendiente de proyectar en
    // caliente, pero SÍ está en la bitácora durable.
    const ver = ((await query(rt, ctx, `${MODULO}.detalle`, { id: A })) as { value: { version: number } }).value.version;
    await exec(rt, ctx, `${MODULO}.registrar`, { id: A, expectedVersion: ver });
    // NOTA: no llamamos a drain(rt) tras registrar.

    // La bitácora tiene 2 eventos (crear + registrar); el replay no depende del
    // estado de procesamiento del outbox.
    const stream = await rt.adapters.eventLog.stream("t-pend");
    expect(stream.ok && stream.value.length).toBe(2);

    const rep = await exec(rt, ctx, `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    if (rep.ok) expect((rep.value as { eventos: number }).eventos).toBe(2);
    const det = await query(rt, ctx, `${MODULO}.detalle`, { id: A });
    expect(det.ok && (det.value as { estado: string }).estado).toBe("REGISTRADO");
  });
});

/* ------------------------------ Colaboración ----------------------------- */

describe("DGP-008.2 · colaboración (comentarios y documentación)", () => {
  it("comentar/responder/editar/borrar y adjuntar documentación técnica", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-colab");
    const A = crypto.randomUUID();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, A, "COLAB-A");

    // Comentar sobre un activo inexistente ⇒ NF (valida existencia del activo).
    const nf = await exec(rt, ctx, `${MODULO}.comentar`, { id: crypto.randomUUID(), texto: "hola" });
    expect(nf.ok).toBe(false);
    if (!nf.ok) expect(nf.error.code.startsWith("KRN-NF")).toBe(true);

    // Comentar + responder (hilos).
    const c1 = await exec(rt, ctx, `${MODULO}.comentar`, { id: A, texto: "revisar bomba" });
    expect(c1.ok).toBe(true);
    const c1Id = (c1 as { value: { id: string } }).value.id;
    await drain(rt);
    const c2 = await exec(rt, ctx, `${MODULO}.comentar`, { id: A, texto: "de acuerdo", parentId: c1Id });
    expect(c2.ok).toBe(true);
    await drain(rt);

    // Editar (concurrencia optimista) y borrado lógico.
    const ed = await exec(rt, ctx, `${MODULO}.editar-comentario`, { comentarioId: c1Id, expectedVersion: 1, texto: "revisar bomba hidráulica" });
    expect(ed.ok).toBe(true);
    await drain(rt);
    const del = await exec(rt, ctx, `${MODULO}.borrar-comentario`, { comentarioId: c1Id });
    expect(del.ok).toBe(true);
    await drain(rt);

    const coments = await query(rt, ctx, `${MODULO}.comentarios`, { id: A });
    expect(coments.ok && (coments.value as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Adjuntar documentación técnica por referencia (categoría como metadato).
    const doc = await exec(rt, ctx, `${MODULO}.adjuntar`, {
      id: A, categoria: "manual", nombreArchivo: "manual.pdf",
      mimeType: "application/pdf", tamanoBytes: 1024, hashSha256: "a".repeat(64),
    });
    expect(doc.ok).toBe(true);
    await drain(rt);
    const docs = await query(rt, ctx, `${MODULO}.documentacion`, { id: A });
    expect(docs.ok).toBe(true);
    if (docs.ok) {
      const items = docs.value as Array<{ data: { nombreArchivo: string } }>;
      expect(items.length).toBe(1);
      expect(items[0]!.data.nombreArchivo.startsWith("[manual]")).toBe(true);
    }
  });

  it("colaboración vía cola offline con replay idempotente", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-colab-sync");
    const A = crypto.randomUUID();
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, A, "COLAB-SYNC");

    const ops = [
      { opId: "op-com-1", comando: "comentar", input: { id: A, texto: "desde campo (offline)" } },
      { opId: "op-doc-1", comando: "adjuntar", input: {
        id: A, categoria: "certificado", nombreArchivo: "cert.pdf",
        mimeType: "application/pdf", tamanoBytes: 2048, hashSha256: "b".repeat(64),
      } },
    ];
    const r1 = await rt.sincronizar(ctx, ops);
    expect(r1.aplicadas).toBe(2);
    expect(r1.resultados.every((x) => x.replay === undefined)).toBe(true);
    await drain(rt);

    // Replay de la MISMA cola: los recibos durables por opId cortan el paso y
    // devuelven el resultado original sin RE-EJECUTAR (replay:true), por lo que
    // no se duplican comentarios ni adjuntos.
    const r2 = await rt.sincronizar(ctx, ops);
    expect(r2.aplicadas).toBe(2);
    expect(r2.resultados.every((x) => x.replay === true)).toBe(true);
    await drain(rt);

    const coments = await query(rt, ctx, `${MODULO}.comentarios`, { id: A });
    expect(coments.ok && (coments.value as unknown[]).length).toBe(1);
    const docs = await query(rt, ctx, `${MODULO}.documentacion`, { id: A });
    expect(docs.ok && (docs.value as unknown[]).length).toBe(1);
  });
});

/* ------------------ Tipos de relación configurables ---------------------- */

describe("DGP-008.2 · tiposRelacion configurable por tenant", () => {
  it("catálogo vacío ⇒ los 8 tipos canónicos habilitados", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-tr-default");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    const A = id("A"), B = id("B");
    await crearActivo(rt, ctx, A, "TR-A");
    await crearActivo(rt, ctx, B, "TR-B");
    // Cualquier tipo canónico es aceptado.
    const r = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: A, destinoId: B });
    expect(r.ok).toBe(true);
  });

  it("catálogo no vacío ⇒ sólo tipos habilitados (con inverso declarado)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-tr-custom");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    // Habilita SOLO el par simétrico relacionado-con (su propio inverso).
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "tiposRelacion", clave: "relacionado-con", etiqueta: "Relacionado con" });
    const A = id("A"), B = id("B");
    await crearActivo(rt, ctx, A, "TRC-A");
    await crearActivo(rt, ctx, B, "TRC-B");

    const ok1 = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "relacionado-con", origenId: A, destinoId: B });
    expect(ok1.ok).toBe(true);
    // padre-de NO habilitado ⇒ rechazado por validación.
    const rechazado = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: A, destinoId: B });
    expect(rechazado.ok).toBe(false);
    if (!rechazado.ok) expect(rechazado.error.code.startsWith("KRN-VAL")).toBe(true);
  });

  it("habilitar un tipo sin su inverso ⇒ error de configuración", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-tr-bad");
    const id = idPool();
    await sembrarCatalogos(rt, ctx);
    // padre-de exige compuesto... no: exige su inverso hijo-de (no declarado).
    await exec(rt, ctx, `${MODULO}.catalogo.upsert`, { catalogo: "tiposRelacion", clave: "padre-de", etiqueta: "Padre de" });
    const A = id("A"), B = id("B");
    await crearActivo(rt, ctx, A, "TRB-A");
    await crearActivo(rt, ctx, B, "TRB-B");
    const r = await exec(rt, ctx, `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: A, destinoId: B });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code.startsWith("KRN-VAL")).toBe(true);
  });
});

/* ------------------------------- Consola --------------------------------- */

describe("DGP-008.2 · consola técnica", () => {
  it("expone estado operativo (read models, RLS, tipos de relación) para admin", async () => {
    const rt = runtime();
    const ctx = ctxOf("cons-1");
    await sembrarCatalogos(rt, ctx);
    await crearActivo(rt, ctx, crypto.randomUUID(), "A");
    const r = await query(rt, ctx, `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as {
        readModels: { activos: { total: number } };
        rls: { tablas: string[] };
        tiposRelacion: unknown[];
        eventos: string[];
      };
      expect(v.readModels.activos.total).toBe(1);
      expect(v.rls.tablas).toContain("act_relaciones");
      expect(v.rls.tablas).toContain("act_historial");
      expect(v.tiposRelacion.length).toBe(TIPOS_RELACION.length);
      expect(v.eventos).toContain("modulo.activos.relacion-creada");
    }
  });

  it("expone outbox, sincronización, proyecciones (lastEventId) y colaboración", async () => {
    const rt = runtime();
    const ctx = ctxOf("cons-3");
    await sembrarCatalogos(rt, ctx);
    const a = crypto.randomUUID();
    // Sincroniza vía cola offline ⇒ genera un recibo durable (aplicada).
    const resumen = await rt.sincronizar(ctx, [
      { opId: "cons-op-1", comando: "crear", input: { ...BASE, id: a, codigoEmpresarial: "CN", nombre: "CN" } },
    ]);
    expect(resumen.aplicadas).toBe(1);
    await drain(rt);
    // Un comentario de plataforma sobre el activo (para actividad de colaboración).
    await exec(rt, ctx, "platform.comment.create", { entityRef: `activo:${a}`, texto: "hola" });
    await drain(rt);

    const r = await query(rt, ctx, `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as {
      readModels: { activos: { lastEventId: string | null }; relaciones: { total: number; lastEventId: string | null }; historial: { total: number; lastEventId: string | null } };
      outbox: { pendientes: number; procesados: number; ultimos: Array<{ id: string; tipo: string; processedAt: string | null }> };
      sincronizacion: { total: number; porEstado: Record<string, number>; ultimos: Array<{ opId: string }>; conflictos: unknown[] };
      colaboracion: { timelineModulo: number; comentarios: number; adjuntos: number; activosInspeccionados: number; truncado: boolean; nota: string };
    };
    // (d) proyecciones: lastEventId presente en los read models poblados.
    expect(v.readModels.activos.lastEventId).toBeTruthy();
    expect(v.readModels.historial.total).toBeGreaterThanOrEqual(1);
    expect(v.readModels.historial.lastEventId).toBeTruthy();
    // (a) outbox: todos los eventos drenados ⇒ 0 pendientes, con últimos listados.
    expect(v.outbox.pendientes).toBe(0);
    expect(v.outbox.procesados).toBeGreaterThanOrEqual(1);
    expect(v.outbox.ultimos.length).toBeGreaterThanOrEqual(1);
    expect(v.outbox.ultimos[0]?.tipo.startsWith("modulo.activos.")).toBe(true);
    // (b) sincronización: recibo por estado + últimos.
    expect(v.sincronizacion.total).toBe(1);
    expect(v.sincronizacion.porEstado["aplicada"]).toBe(1);
    expect(v.sincronizacion.ultimos[0]?.opId).toBe("cons-op-1");
    // (c) conflictos: ninguno.
    expect(v.sincronizacion.conflictos.length).toBe(0);
    // (e) colaboración: timeline del módulo + 1 comentario de plataforma.
    expect(v.colaboracion.timelineModulo).toBeGreaterThanOrEqual(1);
    expect(v.colaboracion.comentarios).toBe(1);
    expect(v.colaboracion.adjuntos).toBe(0);
    expect(v.colaboracion.activosInspeccionados).toBe(1);
    expect(typeof v.colaboracion.nota).toBe("string");
  });

  it("expone recibos en estado 'conflicto' con detalle", async () => {
    const rt = runtime();
    const ctx = ctxOf("cons-4");
    await sembrarCatalogos(rt, ctx);
    const a = crypto.randomUUID();
    await crearActivo(rt, ctx, a, "CF");
    // Mutación con versión desactualizada vía cola ⇒ recibo 'conflicto'.
    const resumen = await rt.sincronizar(ctx, [
      { opId: "cons-cf-1", comando: "editar", input: { id: a, expectedVersion: 999, descripcion: "x" } },
    ]);
    expect(resumen.conflictos).toBe(1);
    const r = await query(rt, ctx, `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { sincronizacion: { porEstado: Record<string, number>; conflictos: Array<{ opId: string; estado: string; resultado: unknown }> } };
    expect(v.sincronizacion.porEstado["conflicto"]).toBe(1);
    expect(v.sincronizacion.conflictos.length).toBe(1);
    expect(v.sincronizacion.conflictos[0]?.opId).toBe("cons-cf-1");
    expect(v.sincronizacion.conflictos[0]?.estado).toBe("conflicto");
    expect(v.sincronizacion.conflictos[0]?.resultado).toBeTruthy();
  });

  it("la consola es 403 para usuarios sin permiso de admin", async () => {
    const rt = runtime();
    const ctx = ctxOf("cons-2", LECTOR);
    const r = await query(rt, ctx, `${MODULO}.consola`, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code.startsWith("KRN-AUTH")).toBe(true);
  });
});

/* --------------------- Cobertura de sincronización -------------------------*/

describe("DGP-008.2 · sync cubre TODAS las operaciones", () => {
  it("sincroniza crear/editar/estado/ubicación/responsable/horómetro/odómetro/relación", async () => {
    const rt = runtime();
    const ctx = ctxOf("sync-all");
    await sembrarCatalogos(rt, ctx);
    const m1 = crypto.randomUUID();
    const m2 = crypto.randomUUID();
    const relM = crypto.randomUUID();

    // La cola offline en orden: crear dos activos, transición, mutaciones y relación.
    const cola = [
      { opId: "op-crear-1", comando: "crear", input: { id: m1, ...BASE, codigoEmpresarial: "M1", nombre: "M1" } },
      { opId: "op-crear-2", comando: "crear", input: { id: m2, ...BASE, codigoEmpresarial: "M2", nombre: "M2" } },
      { opId: "op-registrar", comando: "registrar", input: { id: m1, expectedVersion: 1 } },
      { opId: "op-ubic", comando: "cambiar-ubicacion", input: { id: m1, expectedVersion: 2, ubicacion: { ubicacionId: "planta-1", etiqueta: "Planta 1" } } },
      { opId: "op-resp", comando: "asignar-responsable", input: { id: m1, expectedVersion: 3, responsable: "ana" } },
      { opId: "op-horo", comando: "actualizar-horometro", input: { id: m1, expectedVersion: 4, medicion: { valor: 10, unidad: "h", fecha: "2024-01-01" } } },
      { opId: "op-odo", comando: "actualizar-odometro", input: { id: m1, expectedVersion: 5, medicion: { valor: 100, unidad: "km", fecha: "2024-01-01" } } },
      { opId: "op-rel", comando: "crear-relacion", input: { id: relM, tipo: "relacionado-con", origenId: m1, destinoId: m2 } },
    ];
    const resumen = await rt.sincronizar(ctx, cola);
    expect(resumen.total).toBe(8);
    expect(resumen.rechazadas + resumen.conflictos, JSON.stringify(resumen.resultados)).toBe(0);
    expect(resumen.aplicadas).toBe(8);

    // Idempotencia: reenvío completo ⇒ replay durable (idempotentes).
    const resumen2 = await rt.sincronizar(ctx, cola);
    expect(resumen2.total).toBe(8);
    expect(resumen2.resultados.every((r) => r.replay === true)).toBe(true);

    // Efectos proyectados.
    const det = await query(rt, ctx, `${MODULO}.detalle`, { id: m1 });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { estado: string }).estado).toBe("REGISTRADO");
    const rel = await query(rt, ctx, `${MODULO}.relacionados`, { id: m1 });
    if (rel.ok) expect((rel.value as { salientes: unknown[] }).salientes.length).toBe(1);
  });
});
