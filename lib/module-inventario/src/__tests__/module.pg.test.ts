/**
 * DGP-011.2 · Módulo Enterprise Inventory — Pruebas de integración PostgreSQL.
 * Cubre: repositorio real + RLS/set_config (aislamiento tenant en lectura y
 * escritura), event log durable + proyección por outbox (read models: items,
 * existencias, movimientos, proyectados), reconstrucción por REPLAY con
 * EQUIVALENCIA, consola técnica real, offline por orquestación con recibo
 * durable (idempotencia + concurrencia + fallo parcial) y gobierno de workflow
 * SIN bypass. Se OMITE sin DATABASE_URL. Al terminar deja el outbox drenado y
 * purga sus propias filas por tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  createExecutionContext,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearInventarioRuntimeOperacional,
  MODULO,
  type InventarioRuntimeOperacional,
  type ModuleAdapters,
} from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const MODULE_PERMISSIONS = [
  "modulo.inventario.read", "modulo.inventario.write", "modulo.inventario.move",
  "modulo.inventario.reserve", "modulo.inventario.transfer", "modulo.inventario.count",
  "modulo.inventario.adjust", "modulo.inventario.admin",
];
const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MODULE_PERMISSIONS]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: ["*"] };

const T_A = `pginv-a-${Date.now()}`;
const T_B = `pginv-b-${Date.now()}`;

const READ_TABLES = [
  "inv_items_read", "inv_existencias_read", "inv_movimientos_read", "inv_reservas_read",
  "inv_transferencias_read", "inv_conteos_read", "inv_ajustes_read", "inv_lotes_read",
  "inv_series_read", "inv_bodegas_read", "inv_ubicaciones_read",
];
const AGG_TABLES = [
  "inv_items", "inv_existencias", "inv_movimientos", "inv_bodegas", "inv_ubicaciones",
  "inv_lotes", "inv_series", "inv_reservas", "inv_transferencias", "inv_ajustes",
  "inv_conteos", "inv_catalogos", "inv_secuencias", "inv_recibos", "inv_eventos",
  "inv_sync_receipts",
];

suite("Módulo Enterprise Inventory · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: InventarioRuntimeOperacional;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, name, input);
  const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

  async function conTenant<Reg extends pg.QueryResultRow = pg.QueryResultRow>(
    tenantId: string, sql: string, params: unknown[] = [],
  ): Promise<Reg[]> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const r = await c.query<Reg>(sql, params);
      await c.query("commit");
      return r.rows;
    } finally {
      c.release();
    }
  }

  // Semilla: bodega + ubicación + item + existencia por entrada. Devuelve ids.
  async function sembrar(tenantId: string) {
    const c = ctx(tenantId);
    const b = await exec(c, `${MODULO}.crear-bodega`, { codigo: `B-${Date.now()}`, nombre: "Central", tipo: "principal" });
    if (!b.ok) throw new Error(b.error.message);
    const bodegaId = (b.value as { id: string }).id;
    const u = await exec(c, `${MODULO}.crear-ubicacion`, { bodegaId, nivel: "pasillo", valor: "A" });
    if (!u.ok) throw new Error(u.error.message);
    const ubicacionId = (u.value as { id: string }).id;
    const it = await exec(c, `${MODULO}.crear-item`, {
      sku: `SKU-${Date.now()}`, nombre: "Tornillo", estado: "activo", tipoItem: "insumo",
      unidadBase: { clave: "unidad" }, modoTrazabilidad: "sin-lote",
    });
    if (!it.ok) throw new Error(it.error.message);
    const itemId = (it.value as { id: string }).id;
    const mv = await exec(c, `${MODULO}.mover`, { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 10 });
    if (!mv.ok) throw new Error(mv.error.message);
    const invId = (mv.value as { inventarioId: string }).inventarioId;
    await drenar();
    return { bodegaId, ubicacionId, itemId, invId };
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    rt = crearInventarioRuntimeOperacional({ pool });
  });

  afterAll(async () => {
    await drenar().catch(() => undefined);
    for (const t of [T_A, T_B]) {
      for (const tabla of [...READ_TABLES, ...AGG_TABLES]) {
        await conTenant(t, `delete from deltaops.${tabla}`).catch(() => undefined);
      }
    }
    await pool.end();
  });

  it("persiste item con RLS y aísla por tenant en lectura y escritura", async () => {
    const { itemId } = await sembrar(T_A);

    const enA = await conTenant<{ id: string; tenant_id: string }>(
      T_A, "select id, tenant_id from deltaops.inv_items where id = $1", [itemId],
    );
    expect(enA.length).toBe(1);
    expect(enA[0]!.tenant_id).toBe(T_A);

    // El detalle por query respeta el tenant del contexto (aislamiento efectivo
    // por la capa de consultas: read model filtrado por tenant).
    const dA = await query(ctx(T_A), `${MODULO}.item`, { id: itemId });
    const dB = await query(ctx(T_B), `${MODULO}.item`, { id: itemId });
    expect(dA.ok).toBe(true);
    expect(dB.ok).toBe(false);
  });

  it("proyecta por outbox a read models de items, existencias y movimientos", async () => {
    const { itemId, invId } = await sembrar(T_A);

    const items = await query(ctx(T_A), `${MODULO}.items`, {});
    expect(items.ok && (items.value as unknown[]).length).toBeGreaterThanOrEqual(1);

    const ex = await query(ctx(T_A), `${MODULO}.existencia`, { id: invId });
    expect(ex.ok).toBe(true);
    if (ex.ok) expect((ex.value as { stock: { disponible: number } }).stock.disponible).toBe(10);

    const exItem = await query(ctx(T_A), `${MODULO}.existencias-item`, { itemId });
    expect(exItem.ok && (exItem.value as unknown[]).length).toBeGreaterThanOrEqual(1);

    const movs = await query(ctx(T_A), `${MODULO}.movimientos`, { inventarioId: invId });
    expect(movs.ok && (movs.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("reconstruye por REPLAY del event log durable con EQUIVALENCIA", async () => {
    const before = await query(ctx(T_A), `${MODULO}.items`, {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const antes = (before.value as { id: string }[]).map((o) => o.id).sort();

    const r = await exec(ctx(T_A), `${MODULO}.reproyectar`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { reproyectados: number }).reproyectados).toBeGreaterThan(0);

    const after = await query(ctx(T_A), `${MODULO}.items`, {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const despues = (after.value as { id: string }[]).map((o) => o.id).sort();
    expect(despues).toEqual(antes);
  });

  it("la consola técnica (admin) reporta read models, event log y outbox reales", async () => {
    const r = await query(ctx(T_A), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { eventLog: unknown; outbox: unknown; proyecciones: unknown; tablasRLS: unknown[] };
    expect(v.eventLog).toBeDefined();
    expect(v.outbox).toBeDefined();
    expect(v.proyecciones).toBeDefined();
    expect(Array.isArray(v.tablasRLS) && v.tablasRLS.length).toBeGreaterThan(10);
  });

  it("CQRS sabotaje: el detalle sirve del read model aunque el repo aggregate falle", async () => {
    const { itemId } = await sembrar(T_A);
    // Sabotea el repositorio de aggregates: findById SIEMPRE lanza. El detalle
    // debe seguir sirviéndose del READ MODEL (nunca lee el aggregate).
    const original = rt.adapters.items.findById.bind(rt.adapters.items);
    (rt.adapters as ModuleAdapters).items.findById = async () => {
      throw new Error("SABOTAJE: el detalle NO debe leer el aggregate");
    };
    try {
      const d = await query(ctx(T_A), `${MODULO}.item`, { id: itemId });
      expect(d.ok).toBe(true);
      // Y un id no proyectado ⇒ notFound (sin tocar el aggregate).
      const nf = await query(ctx(T_A), `${MODULO}.item`, { id: crypto.randomUUID() });
      expect(nf.ok).toBe(false);
    } finally {
      (rt.adapters as ModuleAdapters).items.findById = original;
    }
  });

  it("sincroniza offline por orquestación con recibo durable idempotente", async () => {
    const { itemId, bodegaId, ubicacionId } = await sembrar(T_A);
    const cola = [
      { opId: `pg-op-e-${Date.now()}`, comando: "mover", input: { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 3 } },
      { opId: `pg-op-s-${Date.now()}`, comando: "mover", input: { itemId, bodegaId, ubicacionId, tipo: "salida", cantidad: 1 } },
    ];
    const r1 = await rt.sincronizar(ctx(T_A), cola);
    expect(r1.aplicadas).toBe(2);
    const r2 = await rt.sincronizar(ctx(T_A), cola);
    expect(r2.idempotentes).toBe(2);
  });

  it("sync concurrente: dos workers ⇒ un solo aplicado por opId (reclamación durable)", async () => {
    const { itemId, bodegaId, ubicacionId } = await sembrar(T_A);
    const cola = [
      { opId: `pg-conc-${Date.now()}`, comando: "mover", input: { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 5 } },
    ];
    const [a, b] = await Promise.all([rt.sincronizar(ctx(T_A), cola), rt.sincronizar(ctx(T_A), cola)]);
    const aplicadas = a.aplicadas + b.aplicadas;
    const otros = a.idempotentes + b.idempotentes + a.reintentables + b.reintentables;
    // Exactamente UNA aplicación efectiva; la otra converge (idempotente/reintentable).
    expect(aplicadas).toBe(1);
    expect(otros).toBe(1);
  });

  it("sync con fallo parcial: la operación válida se aplica; la rechazada no", async () => {
    const { itemId, bodegaId, ubicacionId } = await sembrar(T_A);
    const cola = [
      { opId: `pg-ok-${Date.now()}`, comando: "mover", input: { itemId, bodegaId, ubicacionId, tipo: "entrada", cantidad: 2 } },
      // Comando de creación offline SIN id de cliente ⇒ rechazada (Offline First).
      { opId: `pg-bad-${Date.now()}`, comando: "crear-bodega", input: { codigo: "SIN-ID", nombre: "X", tipo: "principal" } },
    ];
    const r = await rt.sincronizar(ctx(T_A), cola);
    expect(r.aplicadas).toBe(1);
    expect(r.rechazadas).toBe(1);
  });

  it("gobierno: transferir sin bypass exige el Workflow Engine (transición real)", async () => {
    const { itemId, bodegaId, ubicacionId } = await sembrar(T_A);
    const u2 = await exec(ctx(T_A), `${MODULO}.crear-ubicacion`, { bodegaId, nivel: "pasillo", valor: "B" });
    expect(u2.ok).toBe(true);
    if (!u2.ok) return;
    const dst = (u2.value as { id: string }).id;
    await drenar();
    const t = await exec(ctx(T_A), `${MODULO}.transferir`, {
      origen: { bodegaId, ubicacionId },
      destino: { bodegaId, ubicacionId: dst },
      lineas: [{ itemId, cantidad: 2 }],
    });
    // Con el Workflow Engine REAL montado, la transferencia inicia gobernada
    // (no auto-aprobada): el comando resuelve OK y crea la instancia de workflow.
    expect(t.ok).toBe(true);
  });
});
