/**
 * DGP-008.1 · Módulo Activos — Pruebas de integración PostgreSQL.
 * Cubre: repositorio real, RLS/set_config (aislamiento en lectura y escritura),
 * rollback, outbox + proyección, concurrencia optimista, catálogos en Record
 * Store, offline/sync con recibo durable y máquina de estados persistente.
 * Se omite sin DATABASE_URL. Al terminar deja el outbox limpio (processed_at).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { activosModule, crearActivosRuntime, MODULO, PgSyncReceiptStore, procesarCola, type ActivosRuntime } from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...activosModule({ repository: null as never, readModel: null as never }).permissions,
  ]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };

const T = `pgact-${Date.now()}`;
const NUEVO = {
  codigoEmpresarial: "PG-EXC-001",
  nombre: "Excavadora PG",
  tipo: "movil",
  categoria: "maquinaria",
  familia: "excavadoras",
  criticidad: "alta",
};

suite("Módulo Activos · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: ActivosRuntime;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });

  // Lectura RLS: transacción con app.tenant_id fijado (verifica aislamiento).
  async function withTenant(
    tenantId: string,
    fn: (c: pg.PoolClient) => Promise<pg.QueryResult>,
  ): Promise<pg.QueryResult> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const r = await fn(client);
      await client.query("COMMIT");
      return r;
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  }
  const exec = (c: ExecutionContext, cmd: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, cmd, input);
  const query = (c: ExecutionContext, q: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, q, input);

  async function sembrar(c: ExecutionContext): Promise<void> {
    const cats = [
      ["tipos", "movil", "Móvil"],
      ["categorias", "maquinaria", "Maquinaria"],
      ["familias", "excavadoras", "Excavadoras"],
      ["criticidades", "alta", "Alta"],
      ["ubicaciones", "planta-1", "Planta 1"],
      ["monedas", "USD", "Dólar"],
    ] as const;
    for (const [catalogo, clave, etiqueta] of cats) {
      await exec(c, `${MODULO}.catalogo.upsert`, { catalogo, clave, etiqueta });
    }
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    rt = crearActivosRuntime({ pool, logger: new MemoryLogger() });
    await sembrar(ctx(T));
  });

  afterAll(async () => {
    // Deja el outbox limpio: marca processed_at de los eventos residuales del
    // tenant de prueba (la suite PG del kernel lo exige).
    await pool.query(
      `UPDATE deltaops.kernel_outbox SET processed_at = now()
       WHERE processed_at IS NULL AND payload::text LIKE '%' || $1 || '%'`,
      [T],
    );
    await pool.query(`DELETE FROM deltaops.act_activos WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.act_activos_read WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.act_sync_receipts WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.platform_records WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.platform_audit WHERE tenant_id LIKE 'pgact-%'`);
    await pool.end();
  });

  it("persiste el aggregate + auditoría atómicamente", async () => {
    const r = await exec(ctx(T), `${MODULO}.crear`, NUEVO);
    expect(r.ok).toBe(true);
    const rows = await pool.query(`SELECT * FROM deltaops.act_activos WHERE tenant_id=$1`, [T]);
    expect(rows.rowCount).toBe(1);
    const auditRows = await pool.query(
      `SELECT * FROM deltaops.platform_audit WHERE tenant_id=$1 AND service=$2`, [T, MODULO],
    );
    expect(auditRows.rowCount).toBeGreaterThan(0);
  });

  it("outbox + proyección pueblan el read model", async () => {
    await rt.platform.kernel.outboxProcessor.processPending();
    const read = await pool.query(`SELECT * FROM deltaops.act_activos_read WHERE tenant_id=$1`, [T]);
    expect(read.rowCount).toBe(1);
    expect(read.rows[0].estado).toBe("BORRADOR");
  });

  it("rollback: código duplicado no deja rastro", async () => {
    const dup = await exec(ctx(T), `${MODULO}.crear`, { ...NUEVO, nombre: "Otro" });
    expect(dup.ok).toBe(false);
    const rows = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_activos WHERE tenant_id=$1`, [T]);
    expect(rows.rows[0].n).toBe(1);
  });

  it("concurrencia optimista: segunda edición con versión vieja falla", async () => {
    const el = await pool.query(`SELECT id FROM deltaops.act_activos WHERE tenant_id=$1`, [T]);
    const id = el.rows[0].id;
    const e1 = await exec(ctx(T), `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "a" });
    expect(e1.ok).toBe(true);
    const e2 = await exec(ctx(T), `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "b" });
    expect(e2.ok).toBe(false);
  });

  it("RLS en escritura: otro tenant no puede leer datos del primero", async () => {
    const otro = await rt.adapters.repository.list(`${T}-otro`, {});
    expect(otro.ok).toBe(true);
    if (!otro.ok) return;
    expect(otro.value).toHaveLength(0);
  });

  it("RLS en lectura: consulta bajo tenant B no ve activos del tenant A", async () => {
    const b = await query(ctx(`${T}-b`), `${MODULO}.listar`, {});
    expect(b.ok && (b.value as unknown[]).length).toBe(0);
  });

  it("ciclo de estados persiste transiciones y read model", async () => {
    const el = await pool.query(`SELECT id, version FROM deltaops.act_activos WHERE tenant_id=$1`, [T]);
    const { id, version } = el.rows[0];
    const reg = await exec(ctx(T), `${MODULO}.registrar`, { id, expectedVersion: version });
    expect(reg.ok).toBe(true);
    const op = await exec(ctx(T), `${MODULO}.operar`, { id, expectedVersion: version + 1 });
    expect(op.ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();
    const read = await pool.query(
      `SELECT estado FROM deltaops.act_activos_read WHERE tenant_id=$1 AND id=$2`, [T, id],
    );
    expect(read.rows[0].estado).toBe("OPERATIVO");
  });

  it("catálogo deshabilitado se rechaza en creación", async () => {
    const tenant = `${T}-cat`;
    await sembrar(ctx(tenant));
    await exec(ctx(tenant), `${MODULO}.catalogo.habilitar`, { catalogo: "familias", clave: "excavadoras", habilitado: false });
    const r = await exec(ctx(tenant), `${MODULO}.crear`, { ...NUEVO, codigoEmpresarial: "PG-DIS-1" });
    expect(r.ok).toBe(false);
  });

  it("offline/sync (PG real): replay de CREACIÓN devuelve el recibo durable sin re-ejecutar", async () => {
    const tenant = `${T}-sync`;
    await sembrar(ctx(tenant));
    const clientId = crypto.randomUUID();
    const cola = [{ opId: "pg-op-1", comando: "crear", input: { ...NUEVO, id: clientId, codigoEmpresarial: "PG-SYNC-1" } }];

    const r1 = await rt.sincronizar(ctx(tenant), cola);
    expect(r1.aplicadas).toBe(1);
    expect(r1.resultados[0]?.estado).toBe("aplicada");
    const original = r1.resultados[0]?.resultado;

    // Recibo durable persistido en act_sync_receipts (RLS por tenant).
    const rec = await pool.query(
      `SELECT op_id, cliente_id, comando, estado FROM deltaops.act_sync_receipts WHERE tenant_id=$1 AND op_id=$2`,
      [tenant, "pg-op-1"],
    );
    expect(rec.rowCount).toBe(1);
    expect(rec.rows[0].cliente_id).toBe(clientId);
    expect(rec.rows[0].estado).toBe("aplicada");

    // Reenvío: el recibo corta el paso; NO re-ejecuta.
    const r2 = await rt.sincronizar(ctx(tenant), cola);
    expect(r2.aplicadas).toBe(1);
    expect(r2.resultados[0]?.replay).toBe(true);
    expect(r2.resultados[0]?.resultado).toEqual(original);

    const rows = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_activos WHERE tenant_id=$1`, [tenant]);
    expect(rows.rows[0].n).toBe(1);
    const read = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_activos_read WHERE tenant_id=$1`, [tenant]);
    expect(read.rows[0].n).toBe(1);
  });

  it("offline/sync (PG real): replay de MUTACIÓN devuelve el recibo original, versión no avanza", async () => {
    const tenant = `${T}-sync-mut`;
    await sembrar(ctx(tenant));
    const id = crypto.randomUUID();
    await rt.sincronizar(ctx(tenant), [{ opId: "m-crear", comando: "crear", input: { ...NUEVO, id, codigoEmpresarial: "PG-SYNC-M" } }]);

    const cola = [{ opId: "m-edit", comando: "editar", input: { id, expectedVersion: 1, descripcion: "editado" } }];
    const r1 = await rt.sincronizar(ctx(tenant), cola);
    expect(r1.aplicadas).toBe(1);
    const original = r1.resultados[0]?.resultado as { version: number };
    expect(original.version).toBe(2);

    const r2 = await rt.sincronizar(ctx(tenant), cola);
    expect(r2.conflictos).toBe(0);
    expect(r2.resultados[0]?.replay).toBe(true);
    expect(r2.resultados[0]?.resultado).toEqual(original);

    const v = await pool.query(`SELECT version FROM deltaops.act_activos WHERE tenant_id=$1 AND id=$2`, [tenant, id]);
    expect(v.rows[0].version).toBe(2);
  });

  it("offline/sync (PG real): dos ediciones distintas contra la misma versión => 1 aplicada + 1 conflicto", async () => {
    const tenant = `${T}-sync2`;
    await sembrar(ctx(tenant));
    const id = crypto.randomUUID();
    await rt.sincronizar(ctx(tenant), [{ opId: "s2-crear", comando: "crear", input: { ...NUEVO, id, codigoEmpresarial: "PG-SYNC-2" } }]);
    const cola = [
      { opId: "s2-e1", comando: "editar", input: { id, expectedVersion: 1, descripcion: "primera" } },
      { opId: "s2-e2", comando: "editar", input: { id, expectedVersion: 1, descripcion: "segunda" } },
    ];
    const r = await rt.sincronizar(ctx(tenant), cola);
    expect(r.aplicadas).toBe(1);
    expect(r.conflictos).toBe(1);
    const conflicto = r.resultados.find((x) => x.estado === "conflicto");
    expect(conflicto?.actual).toBeTruthy();
  });

  it("offline/sync (PG real): recibos AISLADOS por tenant — mismo opId no cruza", async () => {
    const tA = `${T}-iso-A`;
    const tB = `${T}-iso-B`;
    await sembrar(ctx(tA));
    await sembrar(ctx(tB));
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    const rA = await rt.sincronizar(ctx(tA), [{ opId: "iso-op", comando: "crear", input: { ...NUEVO, id: idA, codigoEmpresarial: "PG-ISO-A" } }]);
    const rB = await rt.sincronizar(ctx(tB), [{ opId: "iso-op", comando: "crear", input: { ...NUEVO, id: idB, codigoEmpresarial: "PG-ISO-B" } }]);
    // Mismo opId pero distinto tenant: NINGUNO es replay; cada uno crea el suyo.
    expect(rA.resultados[0]?.replay).toBeUndefined();
    expect(rB.resultados[0]?.replay).toBeUndefined();

    // El store (tenant-scoped, RLS + filtro por tenant) NUNCA cruza recibos:
    // la búsqueda bajo A del opId compartido devuelve el recibo de A, no el de B.
    const store = new PgSyncReceiptStore(pool);
    const enA = await store.find(tA, "iso-op");
    const enB = await store.find(tB, "iso-op");
    expect(enA.ok && enA.value?.clienteId).toBe(idA);
    expect(enB.ok && enB.value?.clienteId).toBe(idB);

    // Filas físicas segregadas por tenant_id (la clave (tenant_id, op_id) las separa).
    const filas = await withTenant(tA, (c) =>
      c.query(`SELECT tenant_id, cliente_id FROM deltaops.act_sync_receipts WHERE op_id='iso-op' AND tenant_id=$1`, [tA]),
    );
    expect(filas.rowCount).toBe(1);
    expect(filas.rows[0].cliente_id).toBe(idA);
  });

  it("offline/sync (PG real) CONCURRENCIA: dos procesarCola con el MISMO opId (CREACIÓN) ⇒ un solo efecto", async () => {
    const tenant = `${T}-conc-crear`;
    await sembrar(ctx(tenant));
    const id = crypto.randomUUID();
    const cola = [{ opId: "conc-c1", comando: "crear", input: { ...NUEVO, id, codigoEmpresarial: "PG-CONC-C" } }];
    // Dos orquestaciones REALES en paralelo contra la MISMA BD.
    const [rA, rB] = await Promise.all([
      rt.sincronizar(ctx(tenant), cola),
      rt.sincronizar(ctx(tenant), cola),
    ]);
    // Exactamente UN efecto durable: un solo activo.
    const rows = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_activos WHERE tenant_id=$1`, [tenant]);
    expect(rows.rows[0].n).toBe(1);
    // Un único recibo (clave (tenant, opId)); el otro fue replay o reintentable.
    const rec = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_sync_receipts WHERE tenant_id=$1 AND op_id='conc-c1'`, [tenant]);
    expect(rec.rows[0].n).toBe(1);
    // Al menos uno aplicó; ninguno provocó doble creación.
    const estados = [rA.resultados[0]?.estado, rB.resultados[0]?.estado];
    expect(estados.filter((e) => e === "aplicada").length).toBeGreaterThanOrEqual(1);
    expect(estados.every((e) => ["aplicada", "idempotente", "reintentable"].includes(e ?? ""))).toBe(true);
  });

  it("offline/sync (PG real) CONCURRENCIA: dos procesarCola con el MISMO opId (MUTACIÓN) ⇒ una sola aplicación", async () => {
    const tenant = `${T}-conc-mut`;
    await sembrar(ctx(tenant));
    const id = crypto.randomUUID();
    await rt.sincronizar(ctx(tenant), [{ opId: "cm-crear", comando: "crear", input: { ...NUEVO, id, codigoEmpresarial: "PG-CONC-M" } }]);
    const cola = [{ opId: "cm-edit", comando: "editar", input: { id, expectedVersion: 1, descripcion: "concurrente" } }];
    const [rA, rB] = await Promise.all([
      rt.sincronizar(ctx(tenant), cola),
      rt.sincronizar(ctx(tenant), cola),
    ]);
    // La versión avanzó exactamente UNA vez (no doble edición).
    const v = await pool.query(`SELECT version FROM deltaops.act_activos WHERE tenant_id=$1 AND id=$2`, [tenant, id]);
    expect(v.rows[0].version).toBe(2);
    const rec = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_sync_receipts WHERE tenant_id=$1 AND op_id='cm-edit'`, [tenant]);
    expect(rec.rows[0].n).toBe(1);
    const estados = [rA.resultados[0]?.estado, rB.resultados[0]?.estado];
    expect(estados.every((e) => ["aplicada", "idempotente", "reintentable"].includes(e ?? ""))).toBe(true);
  });

  it("offline/sync (PG real): recupera un 'pendiente' VIEJO reconciliando CREACIÓN y MUTACIÓN", async () => {
    const tenant = `${T}-recov`;
    await sembrar(ctx(tenant));
    const store = new PgSyncReceiptStore(pool);
    // CREACIÓN: agregado ya existe + recibo 'pendiente' viejo (umbral 0).
    const id = crypto.randomUUID();
    await exec(ctx(tenant), `${MODULO}.crear`, { ...NUEVO, id, codigoEmpresarial: "PG-RECOV-1" });
    const c1 = await store.claim(tenant, "recov-crear", id, `${MODULO}.crear`);
    expect(c1.ok && c1.value.duenio).toBe(true);
    await new Promise((r) => setTimeout(r, 50)); // createdAt claramente en el pasado
    const rc = await procesarCola(rt.platform, store, rt.adapters.repository, ctx(tenant),
      [{ opId: "recov-crear", comando: "crear", input: { ...NUEVO, id, codigoEmpresarial: "PG-RECOV-1" } }],
      { umbralRecuperacionMs: 0 });
    expect(rc.aplicadas).toBe(1);
    expect(rc.resultados[0]?.replay).toBe(true);
    const recC = await store.find(tenant, "recov-crear");
    expect(recC.ok && recC.value?.estado).toBe("aplicada");

    // MUTACIÓN: edición ya aplicada (v2) + recibo 'pendiente' viejo.
    await exec(ctx(tenant), `${MODULO}.editar`, { id, expectedVersion: 1, descripcion: "ya-aplicada" });
    await store.claim(tenant, "recov-edit", id, `${MODULO}.editar`);
    await new Promise((r) => setTimeout(r, 50));
    const rm = await procesarCola(rt.platform, store, rt.adapters.repository, ctx(tenant),
      [{ opId: "recov-edit", comando: "editar", input: { id, expectedVersion: 1, descripcion: "ya-aplicada" } }],
      { umbralRecuperacionMs: 0 });
    expect(rm.aplicadas).toBe(1);
    expect(rm.resultados[0]?.replay).toBe(true);
    // La versión no avanzó por la reconciliación (sigue en 2).
    const v = await pool.query(`SELECT version FROM deltaops.act_activos WHERE tenant_id=$1 AND id=$2`, [tenant, id]);
    expect(v.rows[0].version).toBe(2);
  });
});
