/**
 * DeltaOps Plataforma · Auditoría transversal.
 * Toda operación de escritura de los servicios de plataforma queda auditada.
 * Adaptadores: Fake (memoria/offline) y PostgreSQL (deltaops.platform_audit).
 * Las entradas se escriben DENTRO del Unit of Work del comando (atómicas con
 * los datos) mediante `pgSessionOf(uow)`.
 */
import type { Pool } from "pg";
import {
  fail,
  KernelErrors,
  ok,
  pgSessionOf,
  type ExecutionContext,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { TenantId } from "./types";
import { setTenantContext } from "./record-store";

export interface AuditEntry {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly service: string;
  readonly action: string;
  readonly actorId: string;
  readonly subjectId: string | null;
  readonly detail: Record<string, unknown>;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export interface AuditTrailPort {
  append(
    uow: UnitOfWork,
    entry: Omit<AuditEntry, "id" | "occurredAt">,
  ): Promise<Result<void, KernelError>>;
  list(
    tenantId: TenantId,
    filter: { service?: string; subjectId?: string; limit?: number },
  ): Promise<Result<AuditEntry[], KernelError>>;
}

/** Helper oficial para auditar desde un comando de servicio. */
export async function audit(
  trail: AuditTrailPort,
  uow: UnitOfWork,
  ctx: ExecutionContext,
  tenantId: TenantId,
  service: string,
  action: string,
  subjectId: string | null,
  detail: Record<string, unknown> = {},
): Promise<Result<void, KernelError>> {
  return trail.append(uow, {
    tenantId,
    service,
    action,
    actorId: ctx.principal.id,
    subjectId,
    detail,
    correlationId: ctx.correlationId,
  });
}

export class FakeAuditTrail implements AuditTrailPort {
  readonly entries: AuditEntry[] = [];

  async append(
    _uow: UnitOfWork,
    entry: Omit<AuditEntry, "id" | "occurredAt">,
  ): Promise<Result<void, KernelError>> {
    this.entries.push({ ...entry, id: crypto.randomUUID(), occurredAt: new Date() });
    return ok(undefined);
  }

  async list(
    tenantId: TenantId,
    filter: { service?: string; subjectId?: string; limit?: number },
  ): Promise<Result<AuditEntry[], KernelError>> {
    return ok(
      this.entries
        .filter(
          (e) =>
            e.tenantId === tenantId &&
            (!filter.service || e.service === filter.service) &&
            (!filter.subjectId || e.subjectId === filter.subjectId),
        )
        .slice(0, filter.limit ?? 100),
    );
  }
}

export class PgAuditTrail implements AuditTrailPort {
  constructor(private readonly pool: Pool) {}

  async append(
    uow: UnitOfWork,
    e: Omit<AuditEntry, "id" | "occurredAt">,
  ): Promise<Result<void, KernelError>> {
    try {
      await setTenantContext(uow, e.tenantId);
      await pgSessionOf(uow).query(
        `INSERT INTO deltaops.platform_audit
           (id, tenant_id, service, action, actor_id, subject_id, detail, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          e.tenantId,
          e.service,
          e.action,
          e.actorId,
          e.subjectId,
          JSON.stringify(e.detail),
          e.correlationId,
        ],
      );
      return ok(undefined);
    } catch (err) {
      return fail(KernelErrors.infrastructure("AuditTrail append falló", err));
    }
  }

  async list(
    tenantId: TenantId,
    filter: { service?: string; subjectId?: string; limit?: number },
  ): Promise<Result<AuditEntry[], KernelError>> {
    try {
      // DGP-023.5 (N-5): la lectura del audit trail debe fijar `app.tenant_id`
      // en una transacción para que la RLS (con FORCE) sea efectiva bajo el rol
      // de aplicación sin BYPASSRLS. Antes usaba `this.pool.query` directo.
      const client = await this.pool.connect();
      let res: import("pg").QueryResult;
      try {
        await client.query("BEGIN");
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
          tenantId,
        ]);
        res = await client.query(
          `SELECT * FROM deltaops.platform_audit
           WHERE tenant_id = $1
             AND ($2::text IS NULL OR service = $2)
             AND ($3::text IS NULL OR subject_id = $3)
           ORDER BY occurred_at DESC
           LIMIT $4`,
          [tenantId, filter.service ?? null, filter.subjectId ?? null, filter.limit ?? 100],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
      return ok(
        res.rows.map((r) => ({
          id: r.id,
          tenantId: r.tenant_id,
          service: r.service,
          action: r.action,
          actorId: r.actor_id,
          subjectId: r.subject_id,
          detail: r.detail,
          correlationId: r.correlation_id,
          occurredAt: r.occurred_at,
        })),
      );
    } catch (err) {
      return fail(KernelErrors.infrastructure("AuditTrail list falló", err));
    }
  }
}
