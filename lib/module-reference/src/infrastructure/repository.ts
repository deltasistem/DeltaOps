/**
 * DGP-004 · Reference Module — Infraestructura.
 * Repository (aggregate) y Read Model Store (proyección) con adaptadores
 * PostgreSQL (tablas propias del módulo, RLS por tenant) y Fake (offline).
 * La Dependency Rule se respeta: el dominio no conoce esta capa; los puertos
 * se definen aquí y los consume la capa de aplicación (module.ts).
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
import type { ElementoReferencia, Estado } from "../domain/elemento";

/* -------------------------------- Puertos -------------------------------- */

export interface ElementoRepository {
  insert(uow: UnitOfWork, e: ElementoReferencia): Promise<Result<void, KernelError>>;
  /** Actualización con concurrencia optimista (expectedVersion). */
  update(
    uow: UnitOfWork,
    e: ElementoReferencia,
    expectedVersion: number,
  ): Promise<Result<void, KernelError>>;
  findById(tenantId: string, id: string): Promise<Result<ElementoReferencia | null, KernelError>>;
  findByNombre(tenantId: string, nombre: string): Promise<Result<ElementoReferencia | null, KernelError>>;
  list(
    tenantId: string,
    filter: { estado?: Estado; limit?: number },
  ): Promise<Result<ElementoReferencia[], KernelError>>;
}

export interface ElementoReadRow {
  readonly id: string;
  readonly tenantId: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly estado: Estado;
  readonly version: number;
  readonly createdBy: string;
  readonly lastEventId: string;
  readonly actualizadoAt: Date;
}

export interface ElementoReadModel {
  /** Upsert idempotente: si `lastEventId` ya fue aplicado, no re-aplica. */
  apply(uow: UnitOfWork, row: ElementoReadRow): Promise<Result<boolean, KernelError>>;
  get(tenantId: string, id: string): Promise<Result<ElementoReadRow | null, KernelError>>;
  list(
    tenantId: string,
    filter: { estado?: Estado; limit?: number },
  ): Promise<Result<ElementoReadRow[], KernelError>>;
  stats(tenantId: string): Promise<Result<Record<Estado, number>, KernelError>>;
  clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>>;
}

/* ------------------------------ Adaptadores Fake -------------------------- */

export class FakeElementoRepository implements ElementoRepository {
  private readonly rows = new Map<string, ElementoReferencia>();
  private key(t: string, id: string) {
    return `${t}::${id}`;
  }

  async insert(_uow: UnitOfWork, e: ElementoReferencia): Promise<Result<void, KernelError>> {
    if (this.rows.has(this.key(e.tenantId, e.id))) {
      return fail(KernelErrors.conflict(`Elemento ya existe: ${e.id}`));
    }
    this.rows.set(this.key(e.tenantId, e.id), e);
    return ok(undefined);
  }

  async update(
    _uow: UnitOfWork,
    e: ElementoReferencia,
    expectedVersion: number,
  ): Promise<Result<void, KernelError>> {
    const current = this.rows.get(this.key(e.tenantId, e.id));
    if (!current || current.version !== expectedVersion) {
      return fail(KernelErrors.conflict(`Conflicto de concurrencia en ${e.id}`));
    }
    this.rows.set(this.key(e.tenantId, e.id), e);
    return ok(undefined);
  }

  async findById(tenantId: string, id: string) {
    return ok(this.rows.get(this.key(tenantId, id)) ?? null);
  }

  async findByNombre(tenantId: string, nombre: string) {
    for (const e of this.rows.values()) {
      if (e.tenantId === tenantId && e.nombre.toLowerCase() === nombre.toLowerCase()) return ok(e);
    }
    return ok(null);
  }

  async list(tenantId: string, filter: { estado?: Estado; limit?: number }) {
    const all = [...this.rows.values()]
      .filter((e) => e.tenantId === tenantId && (!filter.estado || e.estado === filter.estado))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return ok(all.slice(0, filter.limit ?? 100));
  }
}

export class FakeElementoReadModel implements ElementoReadModel {
  private readonly rows = new Map<string, ElementoReadRow>();
  private readonly applied = new Set<string>();
  private key(t: string, id: string) {
    return `${t}::${id}`;
  }

  async apply(_uow: UnitOfWork, row: ElementoReadRow): Promise<Result<boolean, KernelError>> {
    if (this.applied.has(row.lastEventId)) return ok(false); // idempotente
    this.applied.add(row.lastEventId);
    this.rows.set(this.key(row.tenantId, row.id), row);
    return ok(true);
  }

  async get(tenantId: string, id: string) {
    return ok(this.rows.get(this.key(tenantId, id)) ?? null);
  }

  async list(tenantId: string, filter: { estado?: Estado; limit?: number }) {
    const all = [...this.rows.values()]
      .filter((r) => r.tenantId === tenantId && (!filter.estado || r.estado === filter.estado))
      .sort((a, b) => b.actualizadoAt.getTime() - a.actualizadoAt.getTime());
    return ok(all.slice(0, filter.limit ?? 100));
  }

  async stats(tenantId: string): Promise<Result<Record<Estado, number>, KernelError>> {
    const s: Record<Estado, number> = { BORRADOR: 0, ACTIVO: 0, ARCHIVADO: 0 };
    for (const r of this.rows.values()) if (r.tenantId === tenantId) s[r.estado] += 1;
    return ok(s);
  }

  async clear(_uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>> {
    for (const [k, r] of this.rows) if (r.tenantId === tenantId) this.rows.delete(k);
    return ok(undefined);
  }
}

/* ---------------------------- Adaptadores PG ------------------------------ */

async function setTenant(uow: UnitOfWork, tenantId: string): Promise<void> {
  // RLS operativo: fija app.tenant_id en la transacción (set_config local).
  await pgSessionOf(uow).query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

/**
 * Sesión de LECTURA con tenant fijado: toda lectura del módulo pasa por una
 * transacción con set_config('app.tenant_id'), de modo que RLS aplica también
 * a los reads (nunca pool "desnudo"). Patrón obligatorio para módulos.
 */
async function withTenantRead<T>(
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

interface PgRow {
  id: string;
  tenant_id: string;
  nombre: string;
  descripcion: string;
  estado: Estado;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function toElemento(r: PgRow): ElementoReferencia {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    estado: r.estado,
    version: r.version,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class PgElementoRepository implements ElementoRepository {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, e: ElementoReferencia): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, e.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ref_elementos
           (id, tenant_id, nombre, descripcion, estado, version, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [e.id, e.tenantId, e.nombre, e.descripcion, e.estado, e.version, e.createdBy, e.createdAt, e.updatedAt],
      );
      return ok(undefined);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "23505") {
        return fail(KernelErrors.conflict(`Elemento duplicado (${e.id} / ${e.nombre})`));
      }
      return fail(KernelErrors.infrastructure("Repository insert falló", err));
    }
  }

  async update(
    uow: UnitOfWork,
    e: ElementoReferencia,
    expectedVersion: number,
  ): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, e.tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.ref_elementos
         SET nombre=$4, descripcion=$5, estado=$6, version=$7, updated_at=$8
         WHERE tenant_id=$1 AND id=$2 AND version=$3`,
        [e.tenantId, e.id, expectedVersion, e.nombre, e.descripcion, e.estado, e.version, e.updatedAt],
      );
      if (res.rowCount === 0) {
        return fail(KernelErrors.conflict(`Conflicto de concurrencia en ${e.id} (esperada v${expectedVersion})`));
      }
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository update falló", err));
    }
  }

  async findById(tenantId: string, id: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgRow>(
          `SELECT * FROM deltaops.ref_elementos WHERE tenant_id=$1 AND id=$2`,
          [tenantId, id],
        ),
      );
      return ok(res.rows[0] ? toElemento(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository findById falló", err));
    }
  }

  async findByNombre(tenantId: string, nombre: string) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgRow>(
          `SELECT * FROM deltaops.ref_elementos WHERE tenant_id=$1 AND lower(nombre)=lower($2)`,
          [tenantId, nombre],
        ),
      );
      return ok(res.rows[0] ? toElemento(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository findByNombre falló", err));
    }
  }

  async list(tenantId: string, filter: { estado?: Estado; limit?: number }) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query<PgRow>(
          `SELECT * FROM deltaops.ref_elementos
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2)
           ORDER BY updated_at DESC LIMIT $3`,
          [tenantId, filter.estado ?? null, filter.limit ?? 100],
        ),
      );
      return ok(res.rows.map(toElemento));
    } catch (err) {
      return fail(KernelErrors.infrastructure("Repository list falló", err));
    }
  }
}

export class PgElementoReadModel implements ElementoReadModel {
  constructor(private readonly pool: Pool) {}

  async apply(uow: UnitOfWork, row: ElementoReadRow): Promise<Result<boolean, KernelError>> {
    try {
      await setTenant(uow, row.tenantId);
      // Idempotencia: si last_event_id ya fue aplicado a esta fila, no-op.
      const res = await pgSessionOf(uow).query(
        `INSERT INTO deltaops.ref_elementos_read
           (tenant_id, id, nombre, descripcion, estado, version, created_by, last_event_id, actualizado_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (tenant_id, id) DO UPDATE
           SET nombre=EXCLUDED.nombre, descripcion=EXCLUDED.descripcion,
               estado=EXCLUDED.estado, version=EXCLUDED.version,
               created_by=EXCLUDED.created_by,
               last_event_id=EXCLUDED.last_event_id, actualizado_at=EXCLUDED.actualizado_at
           WHERE deltaops.ref_elementos_read.last_event_id <> EXCLUDED.last_event_id
             AND deltaops.ref_elementos_read.version <= EXCLUDED.version`,
        [row.tenantId, row.id, row.nombre, row.descripcion, row.estado, row.version, row.createdBy, row.lastEventId, row.actualizadoAt],
      );
      return ok((res.rowCount ?? 0) > 0);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel apply falló", err));
    }
  }

  async get(tenantId: string, id: string): Promise<Result<ElementoReadRow | null, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.ref_elementos_read WHERE tenant_id=$1 AND id=$2`,
          [tenantId, id],
        ),
      );
      const r = res.rows[0];
      return ok(r ? this.toRow(r) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel get falló", err));
    }
  }

  async list(tenantId: string, filter: { estado?: Estado; limit?: number }) {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT * FROM deltaops.ref_elementos_read
           WHERE tenant_id=$1 AND ($2::text IS NULL OR estado=$2)
           ORDER BY actualizado_at DESC LIMIT $3`,
          [tenantId, filter.estado ?? null, filter.limit ?? 100],
        ),
      );
      return ok(res.rows.map((r) => this.toRow(r)));
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel list falló", err));
    }
  }

  async stats(tenantId: string): Promise<Result<Record<Estado, number>, KernelError>> {
    try {
      const res = await withTenantRead(this.pool, tenantId, (c) =>
        c.query(
          `SELECT estado, count(*)::int AS n FROM deltaops.ref_elementos_read
           WHERE tenant_id=$1 GROUP BY estado`,
          [tenantId],
        ),
      );
      const s: Record<Estado, number> = { BORRADOR: 0, ACTIVO: 0, ARCHIVADO: 0 };
      for (const r of res.rows) s[r.estado as Estado] = r.n;
      return ok(s);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel stats falló", err));
    }
  }

  async clear(uow: UnitOfWork, tenantId: string): Promise<Result<void, KernelError>> {
    try {
      await setTenant(uow, tenantId);
      await pgSessionOf(uow).query(`DELETE FROM deltaops.ref_elementos_read WHERE tenant_id=$1`, [tenantId]);
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("ReadModel clear falló", err));
    }
  }

  private toRow(r: Record<string, unknown>): ElementoReadRow {
    return {
      tenantId: String(r["tenant_id"]),
      id: String(r["id"]),
      nombre: String(r["nombre"]),
      descripcion: String(r["descripcion"]),
      estado: r["estado"] as Estado,
      version: Number(r["version"]),
      createdBy: String(r["created_by"] ?? ""),
      lastEventId: String(r["last_event_id"]),
      actualizadoAt: r["actualizado_at"] as Date,
    };
  }
}
