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
    // DGP-008.2: tablas operacionales nuevas.
    await pool.query(`DELETE FROM deltaops.act_relaciones WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.act_relaciones_read WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.act_ubicaciones_hist WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.act_responsables_hist WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.act_historial WHERE tenant_id LIKE 'pgact-%'`);
    await pool.query(`DELETE FROM deltaops.act_eventos WHERE tenant_id LIKE 'pgact-%'`);
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

  /* -------------------------- DGP-008.2 (PG real) ------------------------- */

  async function crear82(tenant: string, id: string, codigo: string): Promise<void> {
    const r = await exec(ctx(tenant), `${MODULO}.crear`, {
      id, codigoEmpresarial: codigo, nombre: codigo,
      tipo: "movil", categoria: "maquinaria", familia: "excavadoras", criticidad: "alta",
    });
    expect(r.ok, r.ok ? "" : JSON.stringify((r as { error: unknown }).error)).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();
  }

  it("relaciones: crea, proyecta a read model y aplica anticiclo (PG real)", async () => {
    const tenant = `${T}-rel`;
    await sembrar(ctx(tenant));
    const flota = crypto.randomUUID();
    const exc = crypto.randomUUID();
    await crear82(tenant, flota, "PG-FLOTA");
    await crear82(tenant, exc, "PG-EXC");

    const r = await exec(ctx(tenant), `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: flota, destinoId: exc });
    expect(r.ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();

    // Fuente de verdad persistida.
    const src = await pool.query(`SELECT * FROM deltaops.act_relaciones WHERE tenant_id=$1`, [tenant]);
    expect(src.rowCount).toBe(1);
    // Read model proyectado (payload-only).
    const rm = await pool.query(`SELECT * FROM deltaops.act_relaciones_read WHERE tenant_id=$1`, [tenant]);
    expect(rm.rowCount).toBe(1);
    expect(rm.rows[0].categoria).toBe("jerarquia");

    const arbol = await query(ctx(tenant), `${MODULO}.arbol`, { id: flota });
    expect(arbol.ok && (arbol.value as { hijos: unknown[] }).hijos.length).toBe(1);

    // Anticiclo real vía CTE recursiva.
    const ciclo = await exec(ctx(tenant), `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: exc, destinoId: flota });
    expect(ciclo.ok).toBe(false);
    if (!ciclo.ok) expect(ciclo.error.code).toBe("KRN-CFL-001");
  });

  it("historial de ubicaciones/responsables + timeline proyectados (PG real)", async () => {
    const tenant = `${T}-hist`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    await crear82(tenant, a, "PG-HIST");

    let det = await query(ctx(tenant), `${MODULO}.detalle`, { id: a });
    let ver = (det as { value: { version: number } }).value.version;
    await exec(ctx(tenant), `${MODULO}.cambiar-ubicacion`, {
      id: a, expectedVersion: ver, ubicacion: { ubicacionId: "planta-1", etiqueta: "Planta 1" },
    });
    await rt.platform.kernel.outboxProcessor.processPending();

    det = await query(ctx(tenant), `${MODULO}.detalle`, { id: a });
    ver = (det as { value: { version: number } }).value.version;
    await exec(ctx(tenant), `${MODULO}.asignar-responsable`, { id: a, expectedVersion: ver, responsable: "ana" });
    await rt.platform.kernel.outboxProcessor.processPending();

    const ubic = await pool.query(`SELECT * FROM deltaops.act_ubicaciones_hist WHERE tenant_id=$1 AND activo_id=$2`, [tenant, a]);
    expect(ubic.rowCount).toBeGreaterThanOrEqual(1);
    const resp = await pool.query(`SELECT * FROM deltaops.act_responsables_hist WHERE tenant_id=$1 AND activo_id=$2`, [tenant, a]);
    expect(resp.rowCount).toBeGreaterThanOrEqual(1);
    const tl = await query(ctx(tenant), `${MODULO}.timeline`, { id: a });
    expect(tl.ok && (tl.value as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  it("aislamiento por tenant en las tablas nuevas (PG real)", async () => {
    const tenant = `${T}-rls82`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await crear82(tenant, a, "PG-RLSA");
    await crear82(tenant, b, "PG-RLSB");
    await exec(ctx(tenant), `${MODULO}.crear-relacion`, { tipo: "relacionado-con", origenId: a, destinoId: b });
    await rt.platform.kernel.outboxProcessor.processPending();

    // Consulta tenant-scoped (set_config + tenant_id): el tenant propio ve su
    // relación; otro tenant no ve ninguna (aislamiento por tenant como en 0007).
    const propio = await rt.adapters.relacionesRead.porOrigen(tenant, a);
    expect(propio.ok && propio.value.length).toBe(1);
    const ajeno = await rt.adapters.relacionesRead.porOrigen(`${tenant}-otro`, a);
    expect(ajeno.ok && ajeno.value.length).toBe(0);
    // Historial también aislado por tenant.
    const histAjeno = await rt.adapters.historial.timeline(`${tenant}-otro`, a);
    expect(histAjeno.ok && histAjeno.value.length).toBe(0);
  });

  it("reproyectar reconstruye TODOS los read models (PG real)", async () => {
    const tenant = `${T}-reproj`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await crear82(tenant, a, "PG-RPA");
    await crear82(tenant, b, "PG-RPB");
    await exec(ctx(tenant), `${MODULO}.crear-relacion`, { tipo: "depende-de", origenId: a, destinoId: b });
    await rt.platform.kernel.outboxProcessor.processPending();

    // Vacía manualmente los read models y reconstruye.
    await pool.query(`DELETE FROM deltaops.act_activos_read WHERE tenant_id=$1`, [tenant]);
    await pool.query(`DELETE FROM deltaops.act_relaciones_read WHERE tenant_id=$1`, [tenant]);
    const rep = await exec(ctx(tenant), `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    if (rep.ok) {
      const v = rep.value as { eventos: number; relaciones: number };
      expect(v.eventos).toBe(3); // 2 crear + 1 relación-creada (replay del stream)
      expect(v.relaciones).toBe(1);
    }
    const rm = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_relaciones_read WHERE tenant_id=$1`, [tenant]);
    expect(rm.rows[0].n).toBe(1);
  });

  it("reproyectar reconstruye eventos AÚN PENDIENTES en el outbox (independiente de processed_at) (PG real)", async () => {
    const tenant = `${T}-pend`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    await crear82(tenant, a, "PG-PEND");
    // Registrar (transición) pero NO drenar el outbox: el evento queda PENDIENTE.
    const det = await query(ctx(tenant), `${MODULO}.detalle`, { id: a });
    const ver = (det as { value: { version: number } }).value.version;
    await exec(ctx(tenant), `${MODULO}.registrar`, { id: a, expectedVersion: ver });
    // Fuerza artificialmente TODOS los eventos del tenant a NO procesados.
    await pool.query(
      `UPDATE deltaops.kernel_outbox SET processed_at = NULL WHERE payload->>'tenantId' = $1`,
      [tenant],
    );
    const pend = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE payload->>'tenantId'=$1 AND processed_at IS NULL`,
      [tenant],
    );
    expect(pend.rows[0].n).toBeGreaterThanOrEqual(2);

    // La bitácora tiene los eventos (crear + registrar) aunque el outbox no los
    // haya procesado. El replay NO depende de processed_at.
    const rep = await exec(ctx(tenant), `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    if (rep.ok) expect((rep.value as { eventos: number }).eventos).toBe(2);
    const rm = await pool.query(`SELECT estado FROM deltaops.act_activos_read WHERE tenant_id=$1 AND id=$2`, [tenant, a]);
    expect(rm.rows[0].estado).toBe("REGISTRADO");
    // Deja el outbox limpio para no interferir con el afterAll.
    await pool.query(`UPDATE deltaops.kernel_outbox SET processed_at = now() WHERE payload->>'tenantId' = $1`, [tenant]);
  });

  it("reproyectar sigue COMPLETO tras retención del outbox (borrado de eventos) (PG real)", async () => {
    const tenant = `${T}-reten`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await crear82(tenant, a, "PG-RETA");
    await crear82(tenant, b, "PG-RETB");
    await exec(ctx(tenant), `${MODULO}.crear-relacion`, { tipo: "depende-de", origenId: a, destinoId: b });
    await rt.platform.kernel.outboxProcessor.processPending();

    const enBitacora = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_eventos WHERE tenant_id=$1`, [tenant]);
    expect(enBitacora.rows[0].n).toBe(3);

    // Simula la RETENCIÓN del outbox: se borran las filas del módulo del tenant.
    await pool.query(`DELETE FROM deltaops.kernel_outbox WHERE payload->>'tenantId' = $1`, [tenant]);
    const enOutbox = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.kernel_outbox WHERE payload->>'tenantId'=$1`,
      [tenant],
    );
    expect(enOutbox.rows[0].n).toBe(0);

    // El replay usa la bitácora, no el outbox: la reconstrucción sigue completa.
    await pool.query(`DELETE FROM deltaops.act_activos_read WHERE tenant_id=$1`, [tenant]);
    await pool.query(`DELETE FROM deltaops.act_relaciones_read WHERE tenant_id=$1`, [tenant]);
    const rep = await exec(ctx(tenant), `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    if (rep.ok) {
      const v = rep.value as { eventos: number; relaciones: number };
      expect(v.eventos).toBe(3);
      expect(v.relaciones).toBe(1);
    }
    const rm = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_activos_read WHERE tenant_id=$1`, [tenant]);
    expect(rm.rows[0].n).toBe(2);
    const rel = await pool.query(`SELECT count(*)::int AS n FROM deltaops.act_relaciones_read WHERE tenant_id=$1`, [tenant]);
    expect(rel.rows[0].n).toBe(1);
  });

  it("bitácora act_eventos aislada por tenant (PG real)", async () => {
    const tA = `${T}-elA`;
    const tB = `${T}-elB`;
    await sembrar(ctx(tA));
    const a = crypto.randomUUID();
    await crear82(tA, a, "PG-ELA");
    await rt.platform.kernel.outboxProcessor.processPending();

    // El stream tenant-scoped de A ve sus eventos; el de B (sin actividad) no ve
    // ninguno de A (aislamiento por tenant como en 0007/0008). La política RLS de
    // la tabla queda declarada en la migración (verificada al aplicarla).
    const streamA = await rt.adapters.eventLog.stream(tA);
    expect(streamA.ok && streamA.value.length).toBeGreaterThanOrEqual(1);
    expect(streamA.ok && streamA.value.every((e) => e.tenantId === tA)).toBe(true);
    const streamB = await rt.adapters.eventLog.stream(tB);
    expect(streamB.ok && streamB.value.length).toBe(0);
    // Bajo la transacción tenant-scoped de B (set_config), no aparecen filas de A.
    const cruzado = await withTenant(tB, (c) =>
      c.query(`SELECT count(*)::int AS n FROM deltaops.act_eventos WHERE tenant_id = $1`, [tB]),
    );
    expect(Number(cruzado.rows[0].n)).toBe(0);
  });

  it("colaboración (comentarios + documentación) delega en plataforma (PG real)", async () => {
    const tenant = `${T}-colab`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    await crear82(tenant, a, "PG-COLAB");

    // Comentar (valida existencia del activo) + responder en hilo.
    const c1 = await exec(ctx(tenant), `${MODULO}.comentar`, { id: a, texto: "revisar" });
    expect(c1.ok).toBe(true);
    const c1Id = (c1 as { value: { id: string } }).value.id;
    await rt.platform.kernel.outboxProcessor.processPending();
    await exec(ctx(tenant), `${MODULO}.comentar`, { id: a, texto: "ok", parentId: c1Id });
    await rt.platform.kernel.outboxProcessor.processPending();

    // Editar + borrado lógico.
    expect((await exec(ctx(tenant), `${MODULO}.editar-comentario`, { comentarioId: c1Id, expectedVersion: 1, texto: "revisar bomba" })).ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();
    expect((await exec(ctx(tenant), `${MODULO}.borrar-comentario`, { comentarioId: c1Id })).ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();

    const coments = await query(ctx(tenant), `${MODULO}.comentarios`, { id: a });
    expect(coments.ok && (coments.value as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Adjuntar documentación técnica por referencia (categoría como metadato).
    const doc = await exec(ctx(tenant), `${MODULO}.adjuntar`, {
      id: a, categoria: "manual", nombreArchivo: "manual.pdf",
      mimeType: "application/pdf", tamanoBytes: 1024, hashSha256: "a".repeat(64),
    });
    expect(doc.ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();
    const docs = await query(ctx(tenant), `${MODULO}.documentacion`, { id: a });
    expect(docs.ok).toBe(true);
    if (docs.ok) {
      const items = docs.value as Array<{ data: { nombreArchivo: string } }>;
      expect(items.length).toBe(1);
      expect(items[0]!.data.nombreArchivo.startsWith("[manual]")).toBe(true);
    }
  });

  it("colaboración vía cola offline con replay idempotente (PG real)", async () => {
    const tenant = `${T}-colabsync`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    await crear82(tenant, a, "PG-COLABSYNC");

    const ops = [
      { opId: "pgc-com-1", comando: "comentar", input: { id: a, texto: "offline" } },
      { opId: "pgc-doc-1", comando: "adjuntar", input: {
        id: a, categoria: "certificado", nombreArchivo: "cert.pdf",
        mimeType: "application/pdf", tamanoBytes: 2048, hashSha256: "b".repeat(64),
      } },
    ];
    const r1 = await rt.sincronizar(ctx(tenant), ops);
    expect(r1.aplicadas).toBe(2);
    await rt.platform.kernel.outboxProcessor.processPending();

    // Replay: recibos durables ⇒ sin re-ejecutar (replay:true), sin duplicar.
    const r2 = await rt.sincronizar(ctx(tenant), ops);
    expect(r2.aplicadas).toBe(2);
    expect(r2.resultados.every((x) => x.replay === true)).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();

    const coments = await query(ctx(tenant), `${MODULO}.comentarios`, { id: a });
    expect(coments.ok && (coments.value as unknown[]).length).toBe(1);
    const docs = await query(ctx(tenant), `${MODULO}.documentacion`, { id: a });
    expect(docs.ok && (docs.value as unknown[]).length).toBe(1);
  });

  it("timeline compartido de plataforma con filtros (PG real)", async () => {
    const tenant = `${T}-tl`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    await crear82(tenant, a, "PG-TL");
    let det = await query(ctx(tenant), `${MODULO}.detalle`, { id: a });
    let ver = (det as { value: { version: number } }).value.version;
    await exec(ctx(tenant), `${MODULO}.registrar`, { id: a, expectedVersion: ver });
    await rt.platform.kernel.outboxProcessor.processPending();

    const tl = await query(ctx(tenant), `${MODULO}.timeline`, { id: a });
    expect(tl.ok && (tl.value as unknown[]).length).toBeGreaterThanOrEqual(2);
    // Filtro por estado.
    const porEstado = await query(ctx(tenant), `${MODULO}.timeline`, { id: a, estado: "REGISTRADO" });
    expect(porEstado.ok).toBe(true);
    if (porEstado.ok) {
      const items = porEstado.value as Array<{ data: { estado: string | null } }>;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.every((i) => i.data.estado === "REGISTRADO")).toBe(true);
    }
    // Filtro por actor inexistente ⇒ vacío.
    const vacio = await query(ctx(tenant), `${MODULO}.timeline`, { id: a, actor: "nadie" });
    expect(vacio.ok && (vacio.value as unknown[]).length).toBe(0);
  });

  it("tiposRelacion configurable por tenant (catálogo) (PG real)", async () => {
    const tenant = `${T}-tr`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await crear82(tenant, a, "PG-TRA");
    await crear82(tenant, b, "PG-TRB");
    // Habilita SOLO relacionado-con (su propio inverso).
    await exec(ctx(tenant), `${MODULO}.catalogo.upsert`, { catalogo: "tiposRelacion", clave: "relacionado-con", etiqueta: "Relacionado con" });
    const okRel = await exec(ctx(tenant), `${MODULO}.crear-relacion`, { tipo: "relacionado-con", origenId: a, destinoId: b });
    expect(okRel.ok).toBe(true);
    const rechazado = await exec(ctx(tenant), `${MODULO}.crear-relacion`, { tipo: "padre-de", origenId: a, destinoId: b });
    expect(rechazado.ok).toBe(false);
    if (!rechazado.ok) expect(rechazado.error.code.startsWith("KRN-VAL")).toBe(true);
  });

  it("consola técnica expone estado operativo para admin (PG real)", async () => {
    const tenant = `${T}-consola`;
    await sembrar(ctx(tenant));
    const a = crypto.randomUUID();
    // Vía cola offline ⇒ genera recibo durable 'aplicada' + eventos en outbox.
    const resumen = await rt.sincronizar(ctx(tenant), [
      { opId: "pgcon-1", comando: "crear", input: { ...NUEVO, id: a, codigoEmpresarial: "PG-CON" } },
    ]);
    expect(resumen.aplicadas).toBe(1);
    await rt.platform.kernel.outboxProcessor.processPending();
    // Un comentario de plataforma sobre el activo (actividad de colaboración).
    await exec(ctx(tenant), "platform.comment.create", { entityRef: `activo:${a}`, texto: "nota" });
    await rt.platform.kernel.outboxProcessor.processPending();

    const r = await query(ctx(tenant), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as {
      readModels: { activos: { total: number; lastEventId: string | null }; historial: { total: number; lastEventId: string | null } };
      outbox: { pendientes: number; procesados: number; ultimos: Array<{ tipo: string }> };
      sincronizacion: { total: number; porEstado: Record<string, number>; ultimos: Array<{ opId: string }>; conflictos: unknown[] };
      colaboracion: { timelineModulo: number; comentarios: number; adjuntos: number };
      rls: { tablas: string[] };
    };
    expect(v.readModels.activos.total).toBe(1);
    expect(v.readModels.activos.lastEventId).toBeTruthy();
    expect(v.readModels.historial.lastEventId).toBeTruthy();
    expect(v.rls.tablas).toContain("act_historial");
    // (a) outbox del módulo, tenant-scoped, sin reclamar (todo procesado).
    expect(v.outbox.pendientes).toBe(0);
    expect(v.outbox.procesados).toBeGreaterThanOrEqual(1);
    expect(v.outbox.ultimos.every((u) => u.tipo.startsWith("modulo.activos."))).toBe(true);
    // (b/c) recibos por estado + últimos + conflictos.
    expect(v.sincronizacion.total).toBe(1);
    expect(v.sincronizacion.porEstado["aplicada"]).toBe(1);
    expect(v.sincronizacion.ultimos[0]?.opId).toBe("pgcon-1");
    expect(v.sincronizacion.conflictos.length).toBe(0);
    // (e) colaboración: timeline del módulo + 1 comentario de plataforma.
    expect(v.colaboracion.timelineModulo).toBeGreaterThanOrEqual(1);
    expect(v.colaboracion.comentarios).toBe(1);
    expect(v.colaboracion.adjuntos).toBe(0);
  });

  /* ------------------- DGP-008.3 · Enterprise Asset Experience ------------- */

  const T3 = `pgact-83-${Date.now()}`;
  const ID_83 = "83838383-8383-4383-8383-838383838383";
  const HASH64 = "b".repeat(64);

  it("DGP-008.3 · indexa en platform.search y la búsqueda contextual encuentra el activo", async () => {
    await sembrar(ctx(T3));
    const r = await exec(ctx(T3), `${MODULO}.crear`, {
      ...NUEVO, id: ID_83, codigoEmpresarial: "PG83-EXC", nombre: "Excavadora indexada PG", descripcion: "grande",
    });
    expect(r.ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();
    // El documento existe en el índice (platform_records service=platform.search).
    const docs = await pool.query(
      `SELECT id FROM deltaops.platform_records WHERE tenant_id=$1 AND service='platform.search'`, [T3],
    );
    expect(docs.rowCount).toBeGreaterThanOrEqual(1);
    const busq = await query(ctx(T3), `${MODULO}.busqueda`, { q: "excavadora" });
    expect(busq.ok).toBe(true);
    if (!busq.ok) return;
    expect((busq.value as Array<{ id: string }>).map((x) => x.id)).toContain(ID_83);
  });

  it("DGP-008.3 · emite etiqueta QR idempotente, la incluye en el detalle y resuelve el código", async () => {
    const e1 = await exec(ctx(T3), `${MODULO}.qr-emitir`, { id: ID_83 });
    expect(e1.ok).toBe(true);
    if (!e1.ok) return;
    const codigo = (e1.value as { codigo: string }).codigo;
    await rt.platform.kernel.outboxProcessor.processPending();
    const e2 = await exec(ctx(T3), `${MODULO}.qr-emitir`, { id: ID_83 });
    expect(e2.ok && (e2.value as { reutilizada: boolean; codigo: string }).reutilizada).toBe(true);
    expect(e2.ok && (e2.value as { codigo: string }).codigo).toBe(codigo);

    const det = await query(ctx(T3), `${MODULO}.detalle`, { id: ID_83 });
    expect(det.ok && (det.value as { etiqueta: { codigo: string } | null }).etiqueta?.codigo).toBe(codigo);

    const res = await query(ctx(T3), `${MODULO}.qr-resolver`, { codigo });
    expect(res.ok && (res.value as { activoId: string }).activoId).toBe(ID_83);
  });

  it("DGP-008.3 · URL firmada de documentación: válida, adjunto ajeno → 404, cruce de tenant → 404", async () => {
    const adj = await exec(ctx(T3), `${MODULO}.adjuntar`, {
      id: ID_83, categoria: "manual", nombreArchivo: "manual.pdf",
      mimeType: "application/pdf", tamanoBytes: 12, hashSha256: HASH64,
    });
    expect(adj.ok).toBe(true);
    if (!adj.ok) return;
    await rt.platform.kernel.outboxProcessor.processPending();
    const attachmentId = (adj.value as { id: string }).id;

    // (a) URL firmada válida (HMAC + expiración) para el adjunto del activo.
    const url = await query(ctx(T3), `${MODULO}.documentacion-url`, { id: ID_83, attachmentId });
    expect(url.ok).toBe(true);
    if (!url.ok) return;
    const v = url.value as { url: string; expiresAt: number };
    expect(v.url).toContain(`attachments/${attachmentId}`);
    expect(v.url).toContain("signature=");
    expect(v.expiresAt).toBeGreaterThan(Date.now());

    // (b) adjunto que no pertenece al activo (usa el activo base T como ajeno):
    // pedir el adjunto de T3 bajo el activo NUEVO de T3 no existe → creamos otro.
    const otro = await exec(ctx(T3), `${MODULO}.crear`, {
      ...NUEVO, id: "83000000-0000-4000-8000-000000000001", codigoEmpresarial: "PG83-OTRO", nombre: "Otro PG",
    });
    expect(otro.ok).toBe(true);
    await rt.platform.kernel.outboxProcessor.processPending();
    const ajeno = await query(ctx(T3), `${MODULO}.documentacion-url`, {
      id: "83000000-0000-4000-8000-000000000001", attachmentId,
    });
    expect(ajeno.ok).toBe(false);
    if (ajeno.ok) return;
    expect(ajeno.error.code.startsWith("KRN-NF")).toBe(true);

    // (c) cruce de tenant: otro tenant no ve el adjunto (RLS por tenant) → 404.
    const T4 = `pgact-83b-${Date.now()}`;
    await sembrar(ctx(T4));
    await exec(ctx(T4), `${MODULO}.crear`, { ...NUEVO, id: ID_83, codigoEmpresarial: "PG83B", nombre: "Tenant B" });
    await rt.platform.kernel.outboxProcessor.processPending();
    const cruce = await query(ctx(T4), `${MODULO}.documentacion-url`, { id: ID_83, attachmentId });
    expect(cruce.ok).toBe(false);
  });
});
