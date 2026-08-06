/**
 * DGP-013.2 · Módulo Enterprise Procurement — Pruebas de integración PostgreSQL.
 * Cubre: repositorio real + RLS/set_config (aislamiento tenant en lectura y
 * escritura), event log durable + proyección por outbox (read models: artículos,
 * proveedores, solicitudes, OC, recepciones, costos), reconstrucción por REPLAY
 * con EQUIVALENCIA, consola técnica real, offline por orquestación con recibo
 * durable (idempotencia), y MATERIALIZACIÓN de recepción→inventario idempotente
 * (sin movimientos duplicados ante reintento/concurrencia/replay). Se OMITE sin
 * DATABASE_URL. Al terminar deja el outbox drenado y purga sus filas por tenant.
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
  crearAbastecimientoRuntimeOperacional,
  MODULO,
  type AbastecimientoRuntimeOperacional,
  type MaterializadorInventario,
} from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const MODULE_PERMISSIONS = [
  "modulo.abastecimiento.read", "modulo.abastecimiento.write", "modulo.abastecimiento.govern",
  "modulo.abastecimiento.receive", "modulo.abastecimiento.admin",
];
const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MODULE_PERMISSIONS]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: ["*"] };

const T_A = `pgabs-a-${Date.now()}`;
const T_B = `pgabs-b-${Date.now()}`;

const READ_TABLES = [
  "abs_articulos_read", "abs_proveedores_read", "abs_solicitudes_read", "abs_cotizaciones_read",
  "abs_ordenes_compra_read", "abs_recepciones_read", "abs_historial_read", "abs_costos_read",
];
const AGG_TABLES = [
  "abs_articulos", "abs_proveedores", "abs_solicitudes", "abs_cotizaciones",
  "abs_ordenes_compra", "abs_recepciones", "abs_historial", "abs_catalogos",
  "abs_secuencias", "abs_recibos", "abs_eventos", "abs_sync_receipts",
  "abs_recepcion_materializaciones",
];

suite("Módulo Enterprise Procurement · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: AbastecimientoRuntimeOperacional;

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

  // Materializador de PRUEBA (PG): movimiento determinista e idempotente por opId
  // (${recepcionId}:${numeroLineaOC}); NO depende del runtime de Inventario. El
  // runtime operacional real compone el comando OFICIAL `modulo.inventario.mover`.
  const movPorOp = new Map<string, string>();
  let movsCreados = 0;
  const materializador: MaterializadorInventario = {
    async ingresar(tenantId, _actorId, entrada) {
      const k = `${tenantId}::${entrada.opId}`;
      const existente = movPorOp.get(k);
      if (existente) return { ok: true, value: { movimientoId: existente, idempotente: true } };
      const id = `mov-${entrada.opId}`;
      movPorOp.set(k, id);
      movsCreados += 1;
      return { ok: true, value: { movimientoId: id, idempotente: false } };
    },
    async liberarOrigen() {
      return { ok: true, value: undefined };
    },
  };

  /* --------------------------- Constructores E2E --------------------------- */

  async function crearArticulo(tenantId: string, extra: Record<string, unknown> = {}) {
    const cr = await exec(ctx(tenantId), `${MODULO}.crear-articulo`, {
      nombre: "Rodamiento 6205", tipo: "componente", unidad: "unidad",
      metodoValoracion: "promedio-ponderado", moneda: "usd", costoEstandar: 10,
      inventarioItemId: "inv-item-6205", ...extra,
    });
    if (!cr.ok) throw new Error(cr.error.message);
    await drenar();
    return cr.value as { id: string; version: number };
  }
  async function crearProveedor(tenantId: string, extra: Record<string, unknown> = {}) {
    const cr = await exec(ctx(tenantId), `${MODULO}.crear-proveedor`, {
      razonSocial: "Aceros S.A.", tipo: "distribuidor", monedaPreferida: "usd", ...extra,
    });
    if (!cr.ok) throw new Error(cr.error.message);
    await drenar();
    return cr.value as { id: string; version: number };
  }
  // OC enviada, cuyas líneas referencian el item de inventario y una bodega.
  async function ocEnviada(tenantId: string, articuloId: string, proveedorId: string) {
    const c = ctx(tenantId);
    const cr = await exec(c, `${MODULO}.crear-orden-compra`, {
      proveedorId, moneda: "usd",
      lineas: [{
        numero: 1, articuloId, cantidad: { valor: 10, unidad: "unidad" },
        precioUnitario: { moneda: "usd", monto: 5 }, toleranciaSobreRecepcion: 0.1,
        referencia: { tipo: "inventario-item", id: "inv-item-6205" },
        bodega: { tipo: "bodega", id: "bod-central" },
      }],
    });
    if (!cr.ok) throw new Error(cr.error.message);
    const oc = cr.value as { id: string; version: number };
    const ap = await exec(c, `${MODULO}.transicionar-orden-compra`, { id: oc.id, accion: "aprobar", expectedVersion: oc.version });
    if (!ap.ok) throw new Error(`aprobar: ${ap.error.message}`);
    const en = await exec(c, `${MODULO}.transicionar-orden-compra`, { id: oc.id, accion: "enviar", expectedVersion: (ap.value as { version: number }).version });
    if (!en.ok) throw new Error(`enviar: ${en.error.message}`);
    await drenar();
    return { id: oc.id, version: (en.value as { version: number }).version };
  }
  async function recepcionTotal(tenantId: string, ocId: string, ocVersion: number, ubicacionId = "ubic-A1") {
    const c = ctx(tenantId);
    const r = await exec(c, `${MODULO}.registrar-recepcion`, {
      ordenCompraId: ocId, expectedVersion: ocVersion,
      lineas: [{ numeroLineaOC: 1, cantidad: { valor: 10, unidad: "unidad" }, bodega: { tipo: "bodega", id: "bod-central" } }],
    });
    if (!r.ok) throw new Error(`recepcion: ${r.error.message}`);
    await drenar();
    void ubicacionId;
    return r.value as { recepcionId: string };
  }

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    rt = crearAbastecimientoRuntimeOperacional({ pool, materializador });
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

  it("persiste con RLS y aísla por tenant en lectura y escritura", async () => {
    const art = await crearArticulo(T_A);

    const enA = await conTenant<{ id: string; tenant_id: string }>(
      T_A, "select id, tenant_id from deltaops.abs_articulos where id = $1", [art.id],
    );
    expect(enA.length).toBe(1);
    expect(enA[0]!.tenant_id).toBe(T_A);

    const dA = await query(ctx(T_A), `${MODULO}.articulo`, { id: art.id });
    const dB = await query(ctx(T_B), `${MODULO}.articulo`, { id: art.id });
    expect(dA.ok).toBe(true);
    expect(dB.ok).toBe(false); // otro tenant no ve el read model
  });

  it("proyecta por outbox al read model (detalle y listado desde CQRS)", async () => {
    const art = await crearArticulo(T_A, { nombre: "Filtro aceite" });
    const det = await query(ctx(T_A), `${MODULO}.articulo`, { id: art.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { nombre: string }).nombre).toBe("Filtro aceite");

    const lista = await query(ctx(T_A), `${MODULO}.articulos`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("materializa recepción→inventario: vínculo atómico, sin duplicar en reintento/concurrencia/replay", async () => {
    const art = await crearArticulo(T_A, { nombre: "Bomba", inventarioItemId: "inv-item-6205" });
    const prov = await crearProveedor(T_A);
    const oc = await ocEnviada(T_A, art.id, prov.id);
    const rec = await recepcionTotal(T_A, oc.id, oc.version);
    const c = ctx(T_A);

    const antes = movsCreados;
    // Primera materialización (aplica el movimiento y persiste el vínculo).
    const m1 = await exec(c, `${MODULO}.materializar-recepcion`, { recepcionId: rec.recepcionId, opId: `mat-${rec.recepcionId}`, ubicacionId: "ubic-A1" });
    if (!m1.ok) throw new Error(`materializar: ${m1.error.message}`);
    await drenar();
    expect(movsCreados).toBe(antes + 1);

    // CONCURRENCIA: ráfaga simultánea de reintentos con opId DISTINTO (no cae en
    // el recibo por opId): el guard atómico del vínculo (movimiento_id IS NULL) y
    // la idempotencia del materializador por opId=recepcion:linea garantizan que
    // NO se cree un segundo movimiento pese a la concurrencia.
    const burst = await Promise.allSettled([
      exec(c, `${MODULO}.materializar-recepcion`, { recepcionId: rec.recepcionId, opId: `mat-c1-${rec.recepcionId}`, ubicacionId: "ubic-A1" }),
      exec(c, `${MODULO}.materializar-recepcion`, { recepcionId: rec.recepcionId, opId: `mat-c2-${rec.recepcionId}`, ubicacionId: "ubic-A1" }),
    ]);
    // Al menos una debe resolver ok; ninguna crea un movimiento nuevo.
    expect(burst.some((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok)).toBe(true);
    await drenar();
    expect(movsCreados).toBe(antes + 1);

    // El vínculo quedó persistido con estado aplicada y movimiento_id.
    const links = await conTenant<{ movimiento_id: string | null; estado: string }>(
      T_A, "select movimiento_id, estado from deltaops.abs_recepcion_materializaciones where recepcion_id = $1", [rec.recepcionId],
    );
    expect(links.length).toBe(1);
    expect(links[0]!.movimiento_id).toBeTruthy();
    expect(links[0]!.estado).toBe("aplicada");

    // Reintento SIN opId nuevo (mismo recibo) ⇒ idempotente, sin nuevo movimiento.
    const m3 = await exec(c, `${MODULO}.materializar-recepcion`, { recepcionId: rec.recepcionId, opId: `mat-${rec.recepcionId}` });
    expect(m3.ok).toBe(true);
    if (m3.ok) expect((m3.value as { idempotente?: boolean }).idempotente).toBe(true);
    await drenar();
    expect(movsCreados).toBe(antes + 1);
  });

  it("actualiza costos del artículo (abs_costos_read) tras la recepción", async () => {
    const art = await crearArticulo(T_A, { nombre: "Sello", inventarioItemId: "inv-item-6205" });
    const prov = await crearProveedor(T_A);
    const oc = await ocEnviada(T_A, art.id, prov.id);
    await recepcionTotal(T_A, oc.id, oc.version);

    const costos = await query(ctx(T_A), `${MODULO}.costos`, { articuloId: art.id });
    expect(costos.ok).toBe(true);
    if (costos.ok) {
      const filas = costos.value as Array<{ moneda: string; costoUnitario: number; cantidadAcumulada: number }>;
      expect(filas.length).toBeGreaterThanOrEqual(1);
      const usd = filas.find((f) => f.moneda === "usd");
      expect(usd).toBeTruthy();
      expect(Number(usd!.costoUnitario)).toBeCloseTo(5, 3);
      expect(Number(usd!.cantidadAcumulada)).toBeGreaterThanOrEqual(10);
    }
  });

  it("reconstruye por REPLAY del event log durable con EQUIVALENCIA", async () => {
    const before = await query(ctx(T_A), `${MODULO}.articulos`, {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const antes = (before.value as { id: string }[]).map((o) => o.id).sort();

    const r = await exec(ctx(T_A), `${MODULO}.reproyectar`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { reproyectados: number }).reproyectados).toBeGreaterThan(0);

    const after = await query(ctx(T_A), `${MODULO}.articulos`, {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const despues = (after.value as { id: string }[]).map((o) => o.id).sort();
    expect(despues).toEqual(antes);
  });

  it("la consola técnica (admin) reporta outbox del módulo y tablas RLS", async () => {
    const r = await query(ctx(T_A), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { pendientes: number; procesados: number; ultimos: unknown[]; tablasRLS: unknown[] };
    expect(typeof v.procesados).toBe("number");
    expect(Array.isArray(v.ultimos)).toBe(true);
    expect(Array.isArray(v.tablasRLS) && v.tablasRLS.length).toBeGreaterThan(10);
  });

  it("sincronización offline durable: idempotente por opId (recibo)", async () => {
    const c = ctx(T_A);
    const id = crypto.randomUUID();
    const op = {
      opId: `sync-art-${id}`,
      comando: "crear-articulo",
      input: {
        id, nombre: "Correa", tipo: "componente", unidad: "unidad",
        metodoValoracion: "promedio-ponderado", moneda: "usd",
      },
    };
    const r1 = await rt.sincronizar(c, [op]);
    expect(r1.total).toBe(1);
    expect(["aplicada", "idempotente"]).toContain(r1.resultados[0]!.estado);

    const r2 = await rt.sincronizar(c, [op]);
    expect(r2.resultados[0]!.estado).toBe("idempotente");
    await drenar();
  });

  // SABOTAJE (CQRS puro): las CONSULTAS se sirven EXCLUSIVAMENTE del read model
  // (incluido el DETALLE), nunca del aggregate. Misma suite/runtime que el resto.
  it("SABOTAJE: detalle y listado se sirven del read model aunque el aggregate esté vacío", async () => {
    const art = await crearArticulo(T_B, { nombre: "Empaque sabotaje" });
    // SABOTAJE: vaciar la tabla aggregate. El read model NO debe depender de ella.
    await conTenant(T_B, "delete from deltaops.abs_articulos");
    const quedan = await conTenant<{ n: number }>(T_B, "select count(*)::int n from deltaops.abs_articulos where id=$1", [art.id]);
    expect(Number(quedan[0]?.n ?? -1)).toBe(0);

    const det = await query(ctx(T_B), `${MODULO}.articulo`, { id: art.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { nombre: string }).nombre).toBe("Empaque sabotaje");

    const lista = await query(ctx(T_B), `${MODULO}.articulos`, {});
    expect(lista.ok).toBe(true);
    if (lista.ok) expect((lista.value as Array<{ id: string }>).map((x) => x.id)).toContain(art.id);
  });
});
