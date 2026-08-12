/**
 * DGP-020.3 · Mano de Obra — Infraestructura de PERSISTENCIA (PostgreSQL).
 *
 * Tablas PROPIAS del módulo (deltaops.mdo_recursos / mdo_tarifas /
 * mdo_valoraciones / mdo_recibos / mdo_eventos), NUNCA el Record Store (reservado
 * a catálogos). RLS por tenant: escrituras con `setTenant(uow)` vía
 * pgSessionOf(uow); lecturas con `withTenantRead` (transacción propia con
 * set_config). Mismo patrón que module-ordenes/activos (0042). El dinero se
 * persiste como numeric(18,6) — sin floating point sin control.
 */
import type { Pool } from "pg";
import { fail, KernelErrors, ok, pgSessionOf, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import type { EstadoRecurso, RecursoHumano } from "../domain/recurso";
import type { EstadoTarifa, SujetoTarifa, Tarifa } from "../domain/tarifa";
import type { EstadoValoracion, Valoracion } from "../domain/valoracion";
import type { UnidadTarifa } from "../domain/dinero";
import type {
  Recibo,
  ReciboClaim,
  ReciboPort,
  RecursoRepository,
  TarifaRepository,
  TenantId,
  ValoracionRepository,
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

const num = (v: unknown): number => Number(v);
const dt = (v: unknown): Date => new Date(String(v));
const dtN = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(String(v)));

/**
 * DINERO en PUNTO FIJO: `numeric(18,6)` llega desde node-pg como CADENA exacta.
 * Se normaliza a la cadena canónica del dominio (6 decimales) SIN `Number()` con
 * pérdida. Nunca se convierte a float.
 */
const money = (v: unknown): string => normalizarMoney(String(v));
const moneyN = (v: unknown): string | null => (v === null || v === undefined ? null : normalizarMoney(String(v)));
function normalizarMoney(s: string): string {
  const t = s.trim();
  const neg = t.startsWith("-");
  const abs = neg ? t.slice(1) : t;
  const [entero, frac = ""] = abs.split(".");
  const fracPad = (frac + "000000").slice(0, 6);
  return `${neg ? "-" : ""}${entero || "0"}.${fracPad}`;
}

/* ------------------------------- Recursos -------------------------------- */

function recursoDeFila(row: Record<string, unknown>): RecursoHumano {
  return {
    tenantId: String(row["tenant_id"]),
    identityId: String(row["identity_id"]),
    categoriaClave: String(row["categoria_clave"]),
    estado: String(row["estado"]) as EstadoRecurso,
    creadoAt: dt(row["creado_at"]),
    actualizadoAt: dt(row["actualizado_at"]),
    creadoPor: String(row["creado_por"]),
    actualizadoPor: String(row["actualizado_por"]),
  };
}

export class PgRecursoStore implements RecursoRepository {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, identityId: string): Promise<Result<RecursoHumano | null, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.mdo_recursos WHERE tenant_id=$1 AND identity_id=$2`, [tenantId, identityId]);
        return ok(r.rows[0] ? recursoDeFila(r.rows[0]) : null);
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("mdo_recursos buscar falló", err));
    }
  }
  async upsert(uow: UnitOfWork, r: RecursoHumano): Promise<Result<void, KernelError>> {
    await setTenant(uow, r.tenantId);
    await pgSessionOf(uow).query(
      `INSERT INTO deltaops.mdo_recursos (tenant_id, identity_id, categoria_clave, estado, creado_at, actualizado_at, creado_por, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, identity_id) DO UPDATE SET
         categoria_clave=EXCLUDED.categoria_clave, estado=EXCLUDED.estado,
         actualizado_at=EXCLUDED.actualizado_at, actualizado_por=EXCLUDED.actualizado_por`,
      [r.tenantId, r.identityId, r.categoriaClave, r.estado, r.creadoAt.toISOString(), r.actualizadoAt.toISOString(), r.creadoPor, r.actualizadoPor],
    );
    return ok(undefined);
  }
  async listar(tenantId: TenantId, filtro?: { estado?: EstadoRecurso }): Promise<Result<RecursoHumano[], KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const cond = filtro?.estado ? ` AND estado=$2` : "";
        const args = filtro?.estado ? [tenantId, filtro.estado] : [tenantId];
        const r = await c.query(`SELECT * FROM deltaops.mdo_recursos WHERE tenant_id=$1${cond} ORDER BY identity_id`, args);
        return ok(r.rows.map(recursoDeFila));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("mdo_recursos listar falló", err));
    }
  }
}

/* -------------------------------- Tarifas -------------------------------- */

function tarifaDeFila(row: Record<string, unknown>): Tarifa {
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    sujetoTipo: String(row["sujeto_tipo"]) as SujetoTarifa,
    sujetoId: String(row["sujeto_id"]),
    valor: money(row["valor"]),
    moneda: String(row["moneda"]),
    unidad: String(row["unidad"]) as UnidadTarifa,
    vigenciaDesde: dt(row["vigencia_desde"]),
    vigenciaHasta: dtN(row["vigencia_hasta"]),
    estado: String(row["estado"]) as EstadoTarifa,
    creadoAt: dt(row["creado_at"]),
    creadoPor: String(row["creado_por"]),
    actualizadoAt: dt(row["actualizado_at"]),
    actualizadoPor: String(row["actualizado_por"]),
    valorAnterior: moneyN(row["valor_anterior"]),
    motivo: row["motivo"] == null ? null : String(row["motivo"]),
  };
}

export class PgTarifaStore implements TarifaRepository {
  constructor(private readonly pool: Pool) {}
  async buscarPorId(tenantId: TenantId, id: string): Promise<Result<Tarifa | null, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.mdo_tarifas WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
        return ok(r.rows[0] ? tarifaDeFila(r.rows[0]) : null);
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("mdo_tarifas buscarPorId falló", err));
    }
  }
  async listarPorSujeto(tenantId: TenantId, sujetoTipo: string, sujetoId: string): Promise<Result<Tarifa[], KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(
          `SELECT * FROM deltaops.mdo_tarifas WHERE tenant_id=$1 AND sujeto_tipo=$2 AND sujeto_id=$3 ORDER BY vigencia_desde`,
          [tenantId, sujetoTipo, sujetoId],
        );
        return ok(r.rows.map(tarifaDeFila));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("mdo_tarifas listarPorSujeto falló", err));
    }
  }
  async insertar(uow: UnitOfWork, t: Tarifa): Promise<Result<void, KernelError>> {
    await setTenant(uow, t.tenantId);
    try {
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.mdo_tarifas
          (id, tenant_id, sujeto_tipo, sujeto_id, valor, moneda, unidad, vigencia_desde, vigencia_hasta, estado, valor_anterior, motivo, creado_at, creado_por, actualizado_at, actualizado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          t.id, t.tenantId, t.sujetoTipo, t.sujetoId, t.valor, t.moneda, t.unidad,
          t.vigenciaDesde.toISOString(), t.vigenciaHasta ? t.vigenciaHasta.toISOString() : null,
          t.estado, t.valorAnterior, t.motivo, t.creadoAt.toISOString(), t.creadoPor, t.actualizadoAt.toISOString(), t.actualizadoPor,
        ],
      );
      return ok(undefined);
    } catch (err) {
      // El índice único parcial de vigencia abierta por sujeto materializa la
      // invariante de no-solape a nivel de base (concurrencia determinista).
      return fail(KernelErrors.conflict("No se pudo insertar la tarifa (posible solape de vigencias)", { cause: String(err) }));
    }
  }
  async actualizar(uow: UnitOfWork, t: Tarifa): Promise<Result<void, KernelError>> {
    await setTenant(uow, t.tenantId);
    await pgSessionOf(uow).query(
      `UPDATE deltaops.mdo_tarifas SET valor=$3, moneda=$4, unidad=$5, vigencia_desde=$6, vigencia_hasta=$7,
         estado=$8, valor_anterior=$9, motivo=$10, actualizado_at=$11, actualizado_por=$12
       WHERE tenant_id=$1 AND id=$2`,
      [
        t.tenantId, t.id, t.valor, t.moneda, t.unidad, t.vigenciaDesde.toISOString(),
        t.vigenciaHasta ? t.vigenciaHasta.toISOString() : null, t.estado, t.valorAnterior, t.motivo,
        t.actualizadoAt.toISOString(), t.actualizadoPor,
      ],
    );
    return ok(undefined);
  }
}

/* ------------------------------ Valoraciones ----------------------------- */

function valoracionDeFila(row: Record<string, unknown>): Valoracion {
  return {
    tenantId: String(row["tenant_id"]),
    sesionId: String(row["sesion_id"]),
    ordenId: String(row["orden_id"]),
    activoId: row["activo_id"] == null ? null : String(row["activo_id"]),
    identityId: String(row["identity_id"]),
    categoriaClave: row["categoria_clave"] == null ? null : String(row["categoria_clave"]),
    tarifaId: row["tarifa_id"] == null ? null : String(row["tarifa_id"]),
    tarifaValor: moneyN(row["tarifa_valor"]),
    moneda: row["moneda"] == null ? null : String(row["moneda"]),
    unidad: row["unidad"] == null ? null : (String(row["unidad"]) as UnidadTarifa),
    efectivoMs: num(row["efectivo_ms"]),
    costo: moneyN(row["costo"]),
    estado: String(row["estado"]) as EstadoValoracion,
    vigenciaDesde: dtN(row["vigencia_desde"]),
    vigenciaHasta: dtN(row["vigencia_hasta"]),
    cruzaPeriodos: row["cruza_periodos"] === true,
    iniciadoAt: dt(row["iniciado_at"]),
    cerradoAt: dtN(row["cerrado_at"]),
    valoradoAt: dt(row["valorado_at"]),
    valoradoPor: String(row["valorado_por"]),
  };
}

const COLS_VAL = `(tenant_id, sesion_id, orden_id, activo_id, identity_id, categoria_clave, tarifa_id, tarifa_valor, moneda, unidad, efectivo_ms, costo, estado, vigencia_desde, vigencia_hasta, cruza_periodos, iniciado_at, cerrado_at, valorado_at, valorado_por)`;
function argsVal(v: Valoracion): unknown[] {
  return [
    v.tenantId, v.sesionId, v.ordenId, v.activoId, v.identityId, v.categoriaClave, v.tarifaId, v.tarifaValor, v.moneda, v.unidad,
    v.efectivoMs, v.costo, v.estado, v.vigenciaDesde ? v.vigenciaDesde.toISOString() : null, v.vigenciaHasta ? v.vigenciaHasta.toISOString() : null,
    v.cruzaPeriodos, v.iniciadoAt.toISOString(), v.cerradoAt ? v.cerradoAt.toISOString() : null, v.valoradoAt.toISOString(), v.valoradoPor,
  ];
}

export class PgValoracionStore implements ValoracionRepository {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, sesionId: string): Promise<Result<Valoracion | null, KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.mdo_valoraciones WHERE tenant_id=$1 AND sesion_id=$2`, [tenantId, sesionId]);
        return ok(r.rows[0] ? valoracionDeFila(r.rows[0]) : null);
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("mdo_valoraciones buscar falló", err));
    }
  }
  async registrar(uow: UnitOfWork, v: Valoracion): Promise<Result<{ insertada: boolean }, KernelError>> {
    await setTenant(uow, v.tenantId);
    // Idempotencia por índice único (tenant_id, sesion_id): dos procesamientos
    // concurrentes ⇒ una sola fila (el segundo ve inserted=false).
    const r = await pgSessionOf(uow).query(
      `INSERT INTO deltaops.mdo_valoraciones ${COLS_VAL}
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (tenant_id, sesion_id) DO NOTHING
       RETURNING (xmax = 0) AS inserted`,
      argsVal(v),
    );
    return ok({ insertada: r.rows[0]?.["inserted"] === true });
  }
  async reemplazar(uow: UnitOfWork, v: Valoracion): Promise<Result<void, KernelError>> {
    await setTenant(uow, v.tenantId);
    await pgSessionOf(uow).query(
      `UPDATE deltaops.mdo_valoraciones SET
         orden_id=$3, activo_id=$4, identity_id=$5, categoria_clave=$6, tarifa_id=$7, tarifa_valor=$8, moneda=$9, unidad=$10,
         efectivo_ms=$11, costo=$12, estado=$13, vigencia_desde=$14, vigencia_hasta=$15, cruza_periodos=$16,
         iniciado_at=$17, cerrado_at=$18, valorado_at=$19, valorado_por=$20
       WHERE tenant_id=$1 AND sesion_id=$2`,
      argsVal(v),
    );
    return ok(undefined);
  }
  private async listar(tenantId: TenantId, col: string, val: string): Promise<Result<Valoracion[], KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.mdo_valoraciones WHERE tenant_id=$1 AND ${col}=$2 ORDER BY valorado_at`, [tenantId, val]);
        return ok(r.rows.map(valoracionDeFila));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("mdo_valoraciones listar falló", err));
    }
  }
  listarPorOrden(t: TenantId, ordenId: string) { return this.listar(t, "orden_id", ordenId); }
  listarPorActivo(t: TenantId, activoId: string) { return this.listar(t, "activo_id", activoId); }
  listarPorIdentidad(t: TenantId, identityId: string) { return this.listar(t, "identity_id", identityId); }
  async listarPorEstado(tenantId: TenantId, estados: readonly EstadoValoracion[]): Promise<Result<Valoracion[], KernelError>> {
    try {
      return await withTenantRead(this.pool, tenantId, async (c) => {
        const r = await c.query(`SELECT * FROM deltaops.mdo_valoraciones WHERE tenant_id=$1 AND estado = ANY($2) ORDER BY valorado_at`, [tenantId, estados as unknown as string[]]);
        return ok(r.rows.map(valoracionDeFila));
      });
    } catch (err) {
      return fail(KernelErrors.infrastructure("mdo_valoraciones listarPorEstado falló", err));
    }
  }
}

/* -------------------------------- Recibos -------------------------------- */

export class PgReciboStore implements ReciboPort {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    return withTenantRead(this.pool, tenantId, async (c) => {
      const r = await c.query(
        `SELECT comando, op_id, resultado FROM deltaops.mdo_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3 AND estado='sellado'`,
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
        `INSERT INTO deltaops.mdo_recibos (tenant_id, comando, op_id, resultado, created_by, estado)
         VALUES ($1,$2,$3,'{}'::jsonb,$4,'pendiente')
         ON CONFLICT (tenant_id, comando, op_id) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [tenantId, comando, opId, actorId],
      );
      if (ins.rows[0]?.["inserted"] === true) return ok({ duenio: true });
      const ex = await c.query(`SELECT estado, resultado FROM deltaops.mdo_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`, [tenantId, comando, opId]);
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
      `INSERT INTO deltaops.mdo_recibos (tenant_id, comando, op_id, resultado, created_by, estado, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,'sellado',now())
       ON CONFLICT (tenant_id, comando, op_id) DO UPDATE SET
         resultado=EXCLUDED.resultado, estado='sellado', updated_at=now()
         WHERE deltaops.mdo_recibos.estado <> 'sellado'`,
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
      `INSERT INTO deltaops.mdo_eventos (event_id, tenant_id, tipo, payload, occurred_at)
       VALUES ($1,$2,$3,$4::jsonb,$5)
       ON CONFLICT (event_id) DO NOTHING`,
      [e.eventId, e.tenantId, e.tipo, JSON.stringify(e.payload), e.occurredAt.toISOString()],
    );
    return ok(undefined);
  }
}
