/**
 * DGP-016 · Módulo Enterprise Analytics & KPI Platform — Infraestructura de PERSISTENCIA.
 *
 * Adaptadores PostgreSQL de los PUERTOS del dominio (los Fakes en memoria viven
 * en `../fakes.ts`). Los aggregates se persisten en tablas PROPIAS del módulo
 * (deltaops.an_*), NUNCA en el Record Store (reservado a catálogos). El estado
 * completo del aggregate vive en la columna `datos` (JSONB, fuente de
 * reconstrucción); las columnas planas son sólo para filtrar/indexar. RLS por
 * tenant: escrituras con set_config vía pgSessionOf(uow); lecturas con
 * withTenantRead (transacción propia con set_config). Mismo patrón que
 * module-correctivo (0027).
 */
import type { Pool } from "pg";
import {
  fail,
  KernelErrors,
  ok,
  pgSessionOf,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { CANONICOS_POR_CATALOGO, type EntradaCatalogo, type NombreCatalogo } from "../domain/catalogos";
import type { DefinicionIndicador } from "../domain/definicion-indicador";
import type { Dashboard } from "../domain/dashboard";
import type { SnapshotEvaluacion } from "../domain/snapshot";
import type {
  CatalogoPort,
  DashboardFiltro,
  DashboardRepository,
  DefinicionFiltro,
  DefinicionRepository,
  OpcionCatalogo,
  Recibo,
  ReciboPort,
  SnapshotRepository,
  TenantId,
} from "../domain/ports";

/* --------------------------- Helpers de sesión --------------------------- */

export async function setTenant(uow: UnitOfWork, tenantId: string): Promise<void> {
  await pgSessionOf(uow).query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export async function withTenantRead<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: { query: Pool["query"] }) => Promise<T>,
): Promise<T> {
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

/* --------------------------- Serialización JSONB ------------------------- */

function serializar<T>(agg: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(agg, (_k, v) => (v instanceof Date ? v.toISOString() : v))) as Record<string, unknown>;
}
const parseDatos = (v: unknown): Record<string, unknown> => (typeof v === "string" ? JSON.parse(v) : (v as Record<string, unknown>)) ?? {};

const esConflictoUnico = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";

/* ============================ Definiciones ============================== */

export class PgDefinicionRepository implements DefinicionRepository {
  constructor(private readonly pool: Pool) {}
  async insert(uow: UnitOfWork, d: DefinicionIndicador): Promise<Result<DefinicionIndicador, KernelError>> {
    try {
      await setTenant(uow, d.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_definiciones
           (tenant_id, id, clave, nombre, categoria, fuente_modulo, fuente_dataset, unidad, formato, habilitado, del_sistema, datos, version, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [d.tenantId, d.id, d.clave, d.nombre, d.categoria, d.fuente.modulo, d.fuente.dataset, d.unidad, d.formato, d.habilitado, d.delSistema, JSON.stringify(serializar(d)), d.version, d.actorId],
      );
      return ok(d);
    } catch (err) {
      if (esConflictoUnico(err)) return fail(KernelErrors.conflict(`El indicador "${d.clave}" ya existe`));
      return fail(KernelErrors.infrastructure("definicion insert falló", err));
    }
  }
  async update(uow: UnitOfWork, d: DefinicionIndicador, expectedVersion: number): Promise<Result<DefinicionIndicador, KernelError>> {
    try {
      await setTenant(uow, d.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.an_definiciones SET
           nombre=$4, categoria=$5, fuente_modulo=$6, fuente_dataset=$7, unidad=$8, formato=$9,
           habilitado=$10, datos=$11, version=$12, actor_id=$13, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$3`,
        [d.tenantId, d.id, expectedVersion, d.nombre, d.categoria, d.fuente.modulo, d.fuente.dataset, d.unidad, d.formato, d.habilitado, JSON.stringify(serializar(d)), d.version, d.actorId],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión al actualizar el indicador "${d.clave}"`));
      return ok(d);
    } catch (err) {
      return fail(KernelErrors.infrastructure("definicion update falló", err));
    }
  }
  async findByClave(tenantId: TenantId, clave: string): Promise<Result<DefinicionIndicador | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.an_definiciones WHERE tenant_id=$1 AND lower(clave)=lower($2)`, [tenantId, clave]),
      );
      return ok(res.rows[0] ? (parseDatos(res.rows[0]["datos"]) as unknown as DefinicionIndicador) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("definicion findByClave falló", err));
    }
  }
  async list(tenantId: TenantId, filtro: DefinicionFiltro): Promise<Result<DefinicionIndicador[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.an_definiciones
           WHERE tenant_id=$1
             AND ($2::text IS NULL OR categoria=$2)
             AND ($3::boolean IS NULL OR habilitado=$3)
             AND ($4::boolean IS NULL OR del_sistema=$4)
           ORDER BY clave ASC LIMIT $5`,
          [tenantId, filtro.categoria ?? null, filtro.habilitado ?? null, filtro.delSistema ?? null, filtro.limit ?? 500],
        ),
      );
      return ok(res.rows.map((r) => parseDatos(r["datos"]) as unknown as DefinicionIndicador));
    } catch (err) {
      return fail(KernelErrors.infrastructure("definicion list falló", err));
    }
  }
}

/* ============================== Dashboards ============================== */

export class PgDashboardRepository implements DashboardRepository {
  constructor(private readonly pool: Pool) {}
  async insert(uow: UnitOfWork, d: Dashboard): Promise<Result<Dashboard, KernelError>> {
    try {
      await setTenant(uow, d.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_dashboards
           (tenant_id, id, clave, nombre, del_sistema, propietario_id, datos, version, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [d.tenantId, d.id, d.clave, d.nombre, d.delSistema, d.propietarioId, JSON.stringify(serializar(d)), d.version, d.actorId],
      );
      return ok(d);
    } catch (err) {
      if (esConflictoUnico(err)) return fail(KernelErrors.conflict(`La clave de dashboard "${d.clave}" ya existe`));
      return fail(KernelErrors.infrastructure("dashboard insert falló", err));
    }
  }
  async update(uow: UnitOfWork, d: Dashboard, expectedVersion: number): Promise<Result<Dashboard, KernelError>> {
    try {
      await setTenant(uow, d.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.an_dashboards SET
           nombre=$4, del_sistema=$5, propietario_id=$6, datos=$7, version=$8, actor_id=$9, updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND version=$3`,
        [d.tenantId, d.id, expectedVersion, d.nombre, d.delSistema, d.propietarioId, JSON.stringify(serializar(d)), d.version, d.actorId],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión al actualizar el dashboard ${d.id}`));
      return ok(d);
    } catch (err) {
      return fail(KernelErrors.infrastructure("dashboard update falló", err));
    }
  }
  async delete(uow: UnitOfWork, tenantId: TenantId, id: string, expectedVersion: number): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `DELETE FROM deltaops.an_dashboards WHERE tenant_id=$1 AND id=$2 AND version=$3`,
        [tenantId, id, expectedVersion],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.conflict(`Conflicto de versión al eliminar el dashboard ${id}`));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("dashboard delete falló", err));
    }
  }
  async findByClave(tenantId: TenantId, clave: string): Promise<Result<Dashboard | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.an_dashboards WHERE tenant_id=$1 AND lower(clave)=lower($2)`, [tenantId, clave]),
      );
      return ok(res.rows[0] ? (parseDatos(res.rows[0]["datos"]) as unknown as Dashboard) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("dashboard findByClave falló", err));
    }
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<Dashboard | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.an_dashboards WHERE tenant_id=$1 AND id=$2`, [tenantId, id]),
      );
      return ok(res.rows[0] ? (parseDatos(res.rows[0]["datos"]) as unknown as Dashboard) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("dashboard findById falló", err));
    }
  }
  async list(tenantId: TenantId, filtro: DashboardFiltro): Promise<Result<Dashboard[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT datos FROM deltaops.an_dashboards
           WHERE tenant_id=$1
             AND ($2::boolean IS NULL OR del_sistema=$2)
             AND ($3::text IS NULL OR propietario_id=$3)
           ORDER BY clave ASC LIMIT $4`,
          [tenantId, filtro.delSistema ?? null, filtro.propietarioId ?? null, filtro.limit ?? 500],
        ),
      );
      return ok(res.rows.map((r) => parseDatos(r["datos"]) as unknown as Dashboard));
    } catch (err) {
      return fail(KernelErrors.infrastructure("dashboard list falló", err));
    }
  }
}

/* ============================== Snapshots =============================== */

export class PgSnapshotRepository implements SnapshotRepository {
  constructor(private readonly pool: Pool) {}
  async upsert(uow: UnitOfWork, s: SnapshotEvaluacion): Promise<Result<{ snapshot: SnapshotEvaluacion; nuevo: boolean }, KernelError>> {
    try {
      await setTenant(uow, s.tenantId);
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_snapshots
           (tenant_id, id, clave_snapshot, target, target_clave, valor, muestras, datos, evaluado_en, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, clave_snapshot) DO NOTHING`,
        [s.tenantId, s.id, s.claveSnapshot, s.target, s.targetClave, s.resultado.valor, s.resultado.muestras, JSON.stringify(serializar(s)), new Date(s.evaluadoEn), s.actorId],
      );
      if ((res.rowCount ?? 0) > 0) return ok({ snapshot: s, nuevo: true });
      const prev = await this.buscarPorClave(s.tenantId, s.claveSnapshot);
      if (!prev.ok) return prev;
      return ok({ snapshot: prev.value ?? s, nuevo: false });
    } catch (err) {
      return fail(KernelErrors.infrastructure("snapshot upsert falló", err));
    }
  }
  async buscarPorClave(tenantId: TenantId, claveSnapshot: string): Promise<Result<SnapshotEvaluacion | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.an_snapshots WHERE tenant_id=$1 AND clave_snapshot=$2`, [tenantId, claveSnapshot]),
      );
      return ok(res.rows[0] ? (parseDatos(res.rows[0]["datos"]) as unknown as SnapshotEvaluacion) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("snapshot buscarPorClave falló", err));
    }
  }
  async list(tenantId: TenantId, targetClave: string): Promise<Result<SnapshotEvaluacion[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT datos FROM deltaops.an_snapshots WHERE tenant_id=$1 AND target_clave=$2 ORDER BY evaluado_en DESC`, [tenantId, targetClave]),
      );
      return ok(res.rows.map((r) => parseDatos(r["datos"]) as unknown as SnapshotEvaluacion));
    } catch (err) {
      return fail(KernelErrors.infrastructure("snapshot list falló", err));
    }
  }
}

/* ============================== Catálogos =============================== */

export class PgCatalogoStore implements CatalogoPort {
  constructor(private readonly pool: Pool) {}
  async upsert(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, entrada: EntradaCatalogo, actorId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_catalogos (tenant_id, catalogo, clave, etiqueta, posicion, padre, actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, catalogo, clave) DO UPDATE SET
           etiqueta=EXCLUDED.etiqueta, posicion=EXCLUDED.posicion, padre=EXCLUDED.padre, actor_id=EXCLUDED.actor_id, updated_at=now()`,
        [tenantId, catalogo, entrada.clave, entrada.etiqueta, entrada.posicion ?? 0, entrada.padre ?? null, actorId],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo upsert falló", err));
    }
  }
  async habilitar(uow: UnitOfWork, tenantId: TenantId, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.an_catalogos SET habilitado=$4, updated_at=now() WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`,
        [tenantId, catalogo, clave, habilitado],
      );
      if ((res.rowCount ?? 0) === 0) return fail(KernelErrors.notFound(`catalogo:${catalogo}`, clave));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo habilitar falló", err));
    }
  }
  async opciones(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT clave, etiqueta, posicion, padre FROM deltaops.an_catalogos
           WHERE tenant_id=$1 AND catalogo=$2 AND habilitado=true ORDER BY posicion ASC, clave ASC`,
          [tenantId, catalogo],
        ),
      );
      return ok(res.rows.map((r) => ({
        value: String(r["clave"]),
        label: String(r["etiqueta"]),
        posicion: Number(r["posicion"] ?? 0),
        padre: (r["padre"] as string | null) ?? null,
      })));
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo opciones falló", err));
    }
  }
  async contarEntradas(tenantId: TenantId, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT count(*)::int AS n FROM deltaops.an_catalogos WHERE tenant_id=$1 AND catalogo=$2`, [tenantId, catalogo]),
      );
      return ok(Number(res.rows[0]?.["n"] ?? 0));
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo contarEntradas falló", err));
    }
  }
  async validarReferencia(tenantId: TenantId, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>> {
    const valor = clave ?? "";
    if (valor === "") {
      return obligatorio ? fail(KernelErrors.validation(`La referencia a "${catalogo}" es obligatoria`)) : ok(undefined);
    }
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT habilitado FROM deltaops.an_catalogos WHERE tenant_id=$1 AND catalogo=$2 AND clave=$3`, [tenantId, catalogo, valor]),
      );
      if (res.rows.length === 0) {
        const total = await this.contarEntradas(tenantId, catalogo);
        if (!total.ok) return total;
        if (total.value === 0) {
          const canonicos = CANONICOS_POR_CATALOGO[catalogo];
          if (!canonicos || canonicos.length === 0) return ok(undefined);
          return canonicos.includes(valor)
            ? ok(undefined)
            : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
        }
        return fail(KernelErrors.validation(`"${valor}" no existe en el catálogo "${catalogo}"`));
      }
      if (res.rows[0]["habilitado"] !== true) return fail(KernelErrors.validation(`"${valor}" está deshabilitado en "${catalogo}"`));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("catalogo validarReferencia falló", err));
    }
  }
}

/* ========================= Recibos de idempotencia ====================== */

export class PgReciboStore implements ReciboPort {
  constructor(private readonly pool: Pool) {}
  async buscar(tenantId: TenantId, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(`SELECT op_id, comando, resultado FROM deltaops.an_recibos WHERE tenant_id=$1 AND comando=$2 AND op_id=$3`, [tenantId, comando, opId]),
      );
      const r = res.rows[0];
      if (!r) return ok(null);
      return ok({ opId: String(r["op_id"]), comando: String(r["comando"]), resultado: parseDatos(r["resultado"]) });
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo buscar falló", err));
    }
  }
  async sellar(uow: UnitOfWork, tenantId: TenantId, recibo: Recibo, actorId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.an_recibos (tenant_id, comando, op_id, resultado, actor_id)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, comando, op_id) DO NOTHING`,
        [tenantId, recibo.comando, recibo.opId, JSON.stringify(recibo.resultado), actorId],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("recibo sellar falló", err));
    }
  }
}
