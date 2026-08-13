/**
 * DGP-021.1 · Costos — Infraestructura de PERSISTENCIA (PostgreSQL).
 *
 * Tablas PROPIAS del módulo (deltaops.cos_hechos / cos_recibos / cos_eventos),
 * NUNCA tablas ajenas. RLS por tenant: escrituras con `setTenant(uow)` vía
 * pgSessionOf(uow); lecturas con `withTenantRead` (transacción propia con
 * set_config, RLS también en lecturas). Mismo patrón que module-manodeobra
 * (0043). El dinero se persiste/lee como numeric(18,6) — CADENA exacta, jamás
 * float ni Number con pérdida.
 */
import type { Pool } from "pg";
import { fail, KernelErrors, ok, pgSessionOf, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import type { EstadoHecho, HechoEconomico, NaturalezaHecho, TipoHecho } from "../domain/hecho";
import type {
  FiltroHechos,
  HechoRepository,
  Recibo,
  ReciboClaim,
  ReciboPort,
  TenantId,
} from "../domain/ports";
import type { EventLogPort } from "../module";

/* --------------------------- Helpers de sesión --------------------------- */

export async function setTenant(uow: UnitOfWork, tenantId: string): Promise<void> {
  await pgSessionOf(uow).query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export async function withTenantRead<T>(pool: Pool, tenantId: string, fn: (client: { query: Pool["query"] }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client as unknown as { query: Pool["query"] });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const dt = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

/**
 * DINERO en PUNTO FIJO: `numeric(18,6)` llega desde node-pg como CADENA exacta.
 * Se normaliza a la cadena canónica del dominio (6 decimales) SIN `Number()`.
 */
const money = (v: unknown): string => normalizarMoney(String(v));
function normalizarMoney(s: string): string {
  const t = s.trim();
  const neg = t.startsWith("-");
  const abs = neg ? t.slice(1) : t;
  const [entero, frac = ""] = abs.split(".");
  const fracPad = (frac + "000000").slice(0, 6);
  return `${neg ? "-" : ""}${entero || "0"}.${fracPad}`;
}

/* -------------------------------- Hechos --------------------------------- */

function hechoDeFila(row: Record<string, unknown>): HechoEconomico {
  return {
    costoId: String(row["costo_id"]),
    tenantId: String(row["tenant_id"]),
    tipo: String(row["tipo"]) as TipoHecho,
    origen: { originType: String(row["origin_type"]), originId: String(row["origin_id"]) },
    otId: String(row["ot_id"]),
    // DGP-021.2 (R1) · naturaleza económica; filas previas a 0046 se leen como CARGO.
    naturaleza: (row["naturaleza"] == null ? "CARGO" : String(row["naturaleza"])) as NaturalezaHecho,
    activoId: row["activo_id"] == null ? null : String(row["activo_id"]),
    identityId: row["identity_id"] == null ? null : String(row["identity_id"]),
    movimientoId: row["movimiento_id"] == null ? null : String(row["movimiento_id"]),
    articuloId: row["articulo_id"] == null ? null : String(row["articulo_id"]),
    opId: String(row["op_id"]),
    estado: String(row["estado"]) as EstadoHecho,
    registradoAt: dt(row["registrado_at"]),
    registradoPor: String(row["registrado_por"]),
    anuladoAt: row["anulado_at"] == null ? null : dt(row["anulado_at"]),
    anuladoPor: row["anulado_por"] == null ? null : String(row["anulado_por"]),
    motivoAnulacion: row["motivo_anulacion"] == null ? null : String(row["motivo_anulacion"]),
    snapshot: {
      cantidad: money(row["cantidad"]),
      unidad: String(row["unidad"]),
      costoUnitario: money(row["costo_unitario"]),
      costoTotal: money(row["costo_total"]),
      moneda: String(row["moneda"]),
      fuente: (row["fuente"] as Record<string, unknown>) ?? {},
      ocurridoAt: dt(row["ocurrido_at"]),
    },
  };
}

const COLS_HECHO = `(costo_id, tenant_id, tipo, origin_type, origin_id, ot_id, naturaleza, activo_id, identity_id, movimiento_id, articulo_id, op_id, estado, cantidad, unidad, costo_unitario, costo_total, moneda, fuente, ocurrido_at, registrado_at, registrado_por, anulado_at, anulado_por, motivo_anulacion)`;

function argsHecho(h: HechoEconomico): unknown[] {
  return [
    h.costoId, h.tenantId, h.tipo, h.origen.originType, h.origen.originId, h.otId, h.naturaleza, h.activoId, h.identityId,
    h.movimientoId ?? null, h.articuloId ?? null, h.opId, h.estado,
    h.snapshot.cantidad, h.snapshot.unidad, h.snapshot.costoUnitario, h.snapshot.costoTotal, h.snapshot.moneda,
    JSON.stringify(h.snapshot.fuente), h.snapshot.ocurridoAt, h.registradoAt, h.registradoPor,
    h.anuladoAt, h.anuladoPor, h.motivoAnulacion,
  ];
}

export class PgHechoStore implements HechoRepository {
  constructor(private readonly pool: Pool) {}

  async buscar(tenantId: TenantId, costoId: string): Promise<Result<HechoEconomico | null, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.cos_hechos WHERE tenant_id=$1 AND costo_id=$2`, [tenantId, costoId]);
        return ok(r.rows[0] ? hechoDeFila(r.rows[0]) : null);
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("cos_hechos buscar falló", err));
    }
  }

  async materializar(uow: UnitOfWork, h: HechoEconomico): Promise<Result<{ insertado: boolean }, KernelError>> {
    await setTenant(uow, h.tenantId);
    try {
      // Idempotencia por índice único (tenant_id, op_id): dos materializaciones
      // concurrentes con el mismo opId ⇒ una sola fila (el segundo ve inserted=false).
      const r = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.cos_hechos ${COLS_HECHO}
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24,$25)
         ON CONFLICT (tenant_id, op_id) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        argsHecho(h),
      );
      return ok({ insertado: r.rows[0]?.["inserted"] === true });
    } catch (err) {
      return fail(KernelErrors.infrastructure("cos_hechos materializar falló", err));
    }
  }

  async anular(uow: UnitOfWork, h: HechoEconomico): Promise<Result<void, KernelError>> {
    await setTenant(uow, h.tenantId);
    // Sólo cambia estado + metadatos de anulación; el SNAPSHOT (cantidad, costos,
    // moneda, fuente) NO se toca — inmutabilidad del hecho histórico.
    await pgSessionOf(uow).query(
      `UPDATE deltaops.cos_hechos
         SET estado=$3, anulado_at=$4, anulado_por=$5, motivo_anulacion=$6
       WHERE tenant_id=$1 AND costo_id=$2`,
      [h.tenantId, h.costoId, h.estado, h.anuladoAt, h.anuladoPor, h.motivoAnulacion],
    );
    return ok(undefined);
  }

  async listar(tenantId: TenantId, filtro: FiltroHechos): Promise<Result<HechoEconomico[], KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const cond: string[] = ["tenant_id=$1"];
        const args: unknown[] = [tenantId];
        const push = (frag: string, val: unknown) => {
          args.push(val);
          cond.push(frag.replace("?", `$${args.length}`));
        };
        if (filtro.otId) push("ot_id=?", filtro.otId);
        if (filtro.activoId) push("activo_id=?", filtro.activoId);
        if (filtro.movimientoId) push("movimiento_id=?", filtro.movimientoId);
        if (filtro.articuloId) push("articulo_id=?", filtro.articuloId);
        if (filtro.tipo) push("tipo=?", filtro.tipo);
        if (filtro.naturaleza) push("naturaleza=?", filtro.naturaleza);
        if (filtro.moneda) push("moneda=?", filtro.moneda);
        if (filtro.estado) push("estado=?", filtro.estado);
        if (filtro.desde) push("ocurrido_at >= ?", filtro.desde);
        if (filtro.hasta) push("ocurrido_at < ?", filtro.hasta);
        const limit = filtro.limit && filtro.limit > 0 ? Math.min(filtro.limit, 500) : 500;
        const r = await c.query(
          `SELECT * FROM deltaops.cos_hechos WHERE ${cond.join(" AND ")} ORDER BY ocurrido_at DESC, costo_id LIMIT ${limit}`,
          args,
        );
        return ok(r.rows.map(hechoDeFila));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("cos_hechos listar falló", err));
    }
  }
}

/* -------------------------------- Recibos -------------------------------- */

export class PgReciboStore implements ReciboPort {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    return withTenantRead(this.pool, tenantId, async (c) => {
      const r = await c.query(
        `SELECT comando, op_id, resultado FROM deltaops.cos_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3 AND estado='sellado'`,
        [tenantId, comando, opId],
      );
      const row = r.rows[0];
      if (!row) return ok(null);
      return ok({ opId: String(row["op_id"]), comando: String(row["comando"]), resultado: (row["resultado"] as Record<string, unknown>) ?? {} });
    });
  }
  async reclamar(uow: UnitOfWork, tenantId: TenantId, comando: string, opId: string, actorId: string): Promise<Result<ReciboClaim, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const c = pgSessionOf(uow);
      const ins = await c.query(
        `INSERT INTO deltaops.cos_recibos (tenant_id, comando, op_id, resultado, created_by, estado)
         VALUES ($1,$2,$3,'{}'::jsonb,$4,'pendiente')
         ON CONFLICT (tenant_id, comando, op_id) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [tenantId, comando, opId, actorId],
      );
      if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true });
      const ex = await c.query(`SELECT estado, resultado FROM deltaops.cos_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`, [tenantId, comando, opId]);
      const row = ex.rows[0];
      if (row && String(row["estado"]) === "sellado") return ok({ duenio: false, resultado: (row["resultado"] as Record<string, unknown>) ?? {} });
      return ok({ duenio: false, pendiente: true });
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo reclamar falló", err));
    }
  }
  async sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>> {
    await setTenant(uow, tenantId);
    await pgSessionOf(uow).query(
      `INSERT INTO deltaops.cos_recibos (tenant_id, comando, op_id, resultado, created_by, estado, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,'sellado',now())
       ON CONFLICT (tenant_id, comando, op_id) DO UPDATE SET
         resultado=EXCLUDED.resultado, estado='sellado', updated_at=now()
         WHERE deltaops.cos_recibos.estado <> 'sellado'`,
      [tenantId, recibo.comando, recibo.opId, JSON.stringify(recibo.resultado ?? {}), actorId],
    );
    return ok(undefined);
  }
}

/* ------------------------------ Bitácora --------------------------------- */

export class PgEventLog implements EventLogPort {
  constructor(private readonly _pool: Pool) {}
  async append(
    uow: UnitOfWork,
    e: { tenantId: string; eventId: string; tipo: string; payload: Record<string, unknown>; occurredAt: Date },
  ): Promise<Result<void, KernelError>> {
    await setTenant(uow, e.tenantId);
    await pgSessionOf(uow).query(
      `INSERT INTO deltaops.cos_eventos (event_id, tenant_id, tipo, payload, occurred_at)
       VALUES ($1,$2,$3,$4::jsonb,$5)
       ON CONFLICT (event_id) DO NOTHING`,
      [e.eventId, e.tenantId, e.tipo, JSON.stringify(e.payload), e.occurredAt.toISOString()],
    );
    return ok(undefined);
  }
}
