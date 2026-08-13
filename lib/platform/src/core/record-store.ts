/**
 * DeltaOps Plataforma · Record Store.
 * Persistencia genérica multitenant, versionada (concurrencia optimista) y con
 * borrado lógico. Dos adaptadores oficiales: Fake (memoria/offline) y
 * PostgreSQL (deltaops.platform_records, escrituras SIEMPRE vía pgSessionOf(uow)).
 */
import type { Pool, PoolClient } from "pg";
import {
  fail,
  KernelErrors,
  ok,
  pgSessionOf,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { PlatformRecord, RecordFilter, TenantId } from "./types";

export interface NewRecord {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly service: string;
  readonly recordType: string;
  readonly status: string;
  readonly data: Record<string, unknown>;
  readonly createdBy: string;
}

export interface RecordPatch {
  readonly status?: string;
  readonly data?: Record<string, unknown>;
}

export interface RecordStorePort {
  insert(uow: UnitOfWork, record: NewRecord): Promise<Result<PlatformRecord, KernelError>>;
  /** Actualización con concurrencia optimista: falla en conflicto de versión. */
  update(
    uow: UnitOfWork,
    tenantId: TenantId,
    id: string,
    expectedVersion: number,
    patch: RecordPatch,
  ): Promise<Result<PlatformRecord, KernelError>>;
  /** Borrado lógico (nunca borra físicamente). */
  softDelete(
    uow: UnitOfWork,
    tenantId: TenantId,
    id: string,
  ): Promise<Result<void, KernelError>>;
  findById(
    tenantId: TenantId,
    id: string,
  ): Promise<Result<PlatformRecord | null, KernelError>>;
  list(
    tenantId: TenantId,
    filter: RecordFilter,
  ): Promise<Result<PlatformRecord[], KernelError>>;
}

/* ------------------------------- Adaptador Fake --------------------------- */

export class FakeRecordStore implements RecordStorePort {
  private readonly rows = new Map<string, PlatformRecord>();

  private key(tenantId: TenantId, id: string): string {
    return `${tenantId}:${id}`;
  }

  async insert(_uow: UnitOfWork, r: NewRecord): Promise<Result<PlatformRecord, KernelError>> {
    const key = this.key(r.tenantId, r.id);
    if (this.rows.has(key)) return fail(KernelErrors.conflict(`Registro duplicado: ${r.id}`));
    const now = new Date();
    const record: PlatformRecord = {
      ...r,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.rows.set(key, record);
    return ok(record);
  }

  async update(
    _uow: UnitOfWork,
    tenantId: TenantId,
    id: string,
    expectedVersion: number,
    patch: RecordPatch,
  ): Promise<Result<PlatformRecord, KernelError>> {
    const current = this.rows.get(this.key(tenantId, id));
    if (!current || current.deletedAt) return fail(KernelErrors.notFound("record", id));
    if (current.version !== expectedVersion) {
      return fail(
        KernelErrors.conflict(
          `Conflicto de concurrencia en ${id}: esperada v${expectedVersion}, actual v${current.version}`,
        ),
      );
    }
    const next: PlatformRecord = {
      ...current,
      status: patch.status ?? current.status,
      data: patch.data ?? current.data,
      version: current.version + 1,
      updatedAt: new Date(),
    };
    this.rows.set(this.key(tenantId, id), next);
    return ok(next);
  }

  async softDelete(
    _uow: UnitOfWork,
    tenantId: TenantId,
    id: string,
  ): Promise<Result<void, KernelError>> {
    const current = this.rows.get(this.key(tenantId, id));
    if (!current || current.deletedAt) return fail(KernelErrors.notFound("record", id));
    this.rows.set(this.key(tenantId, id), {
      ...current,
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
    return ok(undefined);
  }

  async findById(
    tenantId: TenantId,
    id: string,
  ): Promise<Result<PlatformRecord | null, KernelError>> {
    const r = this.rows.get(this.key(tenantId, id));
    return ok(r && !r.deletedAt ? r : null);
  }

  async list(
    tenantId: TenantId,
    filter: RecordFilter,
  ): Promise<Result<PlatformRecord[], KernelError>> {
    const all = [...this.rows.values()]
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          r.service === filter.service &&
          (!filter.recordType || r.recordType === filter.recordType) &&
          (!filter.status || r.status === filter.status) &&
          (filter.includeDeleted || r.deletedAt === null),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const offset = filter.offset ?? 0;
    return ok(all.slice(offset, offset + (filter.limit ?? 100)));
  }
}

/* ---------------------------- Adaptador PostgreSQL ------------------------ */

interface Row {
  id: string;
  tenant_id: string;
  service: string;
  record_type: string;
  status: string;
  data: Record<string, unknown>;
  version: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

function toRecord(r: Row): PlatformRecord {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    service: r.service,
    recordType: r.record_type,
    status: r.status,
    data: r.data,
    version: r.version,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

/**
 * Fija el tenant en la transacción actual (`SET LOCAL app.tenant_id` vía
 * set_config transaccional) para que las políticas RLS de las tablas de
 * plataforma sean efectivas incluso con roles de aplicación sin BYPASSRLS.
 */
export async function setTenantContext(uow: UnitOfWork, tenantId: TenantId): Promise<void> {
  await pgSessionOf(uow).query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
}

export class PgRecordStore implements RecordStorePort {
  constructor(private readonly pool: Pool) {}

  async insert(uow: UnitOfWork, r: NewRecord): Promise<Result<PlatformRecord, KernelError>> {
    try {
      await setTenantContext(uow, r.tenantId);
      const res = await pgSessionOf(uow).query<Row>(
        `INSERT INTO deltaops.platform_records
           (id, tenant_id, service, record_type, status, data, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [r.id, r.tenantId, r.service, r.recordType, r.status, JSON.stringify(r.data), r.createdBy],
      );
      return ok(toRecord(res.rows[0]!));
    } catch (err) {
      return fail(KernelErrors.infrastructure("RecordStore insert falló", err));
    }
  }

  async update(
    uow: UnitOfWork,
    tenantId: TenantId,
    id: string,
    expectedVersion: number,
    patch: RecordPatch,
  ): Promise<Result<PlatformRecord, KernelError>> {
    try {
      await setTenantContext(uow, tenantId);
      const res = await pgSessionOf(uow).query<Row>(
        `UPDATE deltaops.platform_records
         SET status = COALESCE($4, status),
             data = COALESCE($5, data),
             version = version + 1,
             updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND version = $3 AND deleted_at IS NULL
         RETURNING *`,
        [tenantId, id, expectedVersion, patch.status ?? null,
         patch.data === undefined ? null : JSON.stringify(patch.data)],
      );
      if (res.rowCount === 0) {
        return fail(
          KernelErrors.conflict(
            `Conflicto de concurrencia o registro inexistente: ${id} (esperada v${expectedVersion})`,
          ),
        );
      }
      return ok(toRecord(res.rows[0]!));
    } catch (err) {
      return fail(KernelErrors.infrastructure("RecordStore update falló", err));
    }
  }

  async softDelete(
    uow: UnitOfWork,
    tenantId: TenantId,
    id: string,
  ): Promise<Result<void, KernelError>> {
    try {
      await setTenantContext(uow, tenantId);
      const res = await pgSessionOf(uow).query(
        `UPDATE deltaops.platform_records
         SET deleted_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, id],
      );
      if (res.rowCount === 0) return fail(KernelErrors.notFound("record", id));
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("RecordStore softDelete falló", err));
    }
  }

  /**
   * DGP-023.5 (N-5): las LECTURAS del Record Store deben ejecutarse dentro de
   * una transacción que fije `app.tenant_id`, para que las políticas RLS sean
   * efectivas bajo un rol de aplicación sin BYPASSRLS y con FORCE ROW LEVEL
   * SECURITY. Antes se usaba `this.pool.query` directo, que funcionaba sólo por
   * el bypass del superusuario del runtime previo y devolvería 0 filas con el
   * rol `deltaops_app`. El filtro `WHERE tenant_id = $1` se mantiene como
   * defensa en profundidad (redundante con la política).
   */
  private async readWithTenant<T>(
    tenantId: TenantId,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
        tenantId,
      ]);
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async findById(
    tenantId: TenantId,
    id: string,
  ): Promise<Result<PlatformRecord | null, KernelError>> {
    try {
      const res = await this.readWithTenant(tenantId, (client) =>
        client.query<Row>(
          `SELECT * FROM deltaops.platform_records
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, id],
        ),
      );
      return ok(res.rows[0] ? toRecord(res.rows[0]) : null);
    } catch (err) {
      return fail(KernelErrors.infrastructure("RecordStore findById falló", err));
    }
  }

  async list(
    tenantId: TenantId,
    filter: RecordFilter,
  ): Promise<Result<PlatformRecord[], KernelError>> {
    try {
      const res = await this.readWithTenant(tenantId, (client) =>
        client.query<Row>(
          `SELECT * FROM deltaops.platform_records
           WHERE tenant_id = $1 AND service = $2
             AND ($3::text IS NULL OR record_type = $3)
             AND ($4::text IS NULL OR status = $4)
             AND ($5::boolean OR deleted_at IS NULL)
           ORDER BY created_at ASC
           LIMIT $6 OFFSET $7`,
          [
            tenantId,
            filter.service,
            filter.recordType ?? null,
            filter.status ?? null,
            filter.includeDeleted ?? false,
            filter.limit ?? 100,
            filter.offset ?? 0,
          ],
        ),
      );
      return ok(res.rows.map(toRecord));
    } catch (err) {
      return fail(KernelErrors.infrastructure("RecordStore list falló", err));
    }
  }
}
