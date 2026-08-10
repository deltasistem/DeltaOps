/**
 * DeltaOps · DGP-017 — Auditoría de eventos sensibles de identidad/tenancy.
 *
 * Reutiliza el mecanismo OFICIAL de auditoría del programa: la tabla
 * `deltaops.platform_audit` (misma que `PgAuditTrail`). No crea un sistema
 * paralelo. Los eventos se escriben con `service = 'deltaops.identity'` y una
 * `action` por evento (login-ok, login-fallido, logout, recuperacion, etc.),
 * aislados por tenant (RLS) dentro de `withTenant`.
 */
import { randomUUID } from "node:crypto";
import { withTenant } from "./db-helpers";

const SERVICE = "deltaops.identity";

export type AccionAuditoria =
  | "login-exitoso"
  | "login-fallido"
  | "logout"
  | "recuperacion-solicitada"
  | "recuperacion-completada"
  | "cambio-password"
  | "invitacion-creada"
  | "invitacion-aceptada"
  | "invitacion-revocada"
  | "invitacion-reenviada"
  | "usuario-creado"
  | "usuario-modificado"
  | "cambio-rol"
  | "usuario-activado"
  | "usuario-desactivado"
  | "cambio-tenant"
  | "cambio-configuracion"
  | "cambio-branding"
  | "tenant-creado"
  | "tenant-estado"
  | "modulos-actualizados";

export async function auditarIdentidad(
  tenantId: string,
  action: AccionAuditoria,
  actorId: string,
  subjectId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await withTenant(tenantId, async (client) => {
    await client.query(
      `INSERT INTO deltaops.platform_audit
         (id, tenant_id, service, action, actor_id, subject_id, detail, correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        tenantId,
        SERVICE,
        action,
        actorId,
        subjectId,
        JSON.stringify(detail),
        randomUUID(),
      ],
    );
  });
}

/** Lista auditoría de identidad de un tenant (para admin/super-admin). */
export async function listarAuditoria(
  tenantId: string,
  limit = 100,
): Promise<
  Array<{
    action: string;
    actorId: string;
    subjectId: string | null;
    detail: Record<string, unknown>;
    occurredAt: string;
  }>
> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT action, actor_id, subject_id, detail, occurred_at
       FROM deltaops.platform_audit
       WHERE tenant_id=$1 AND service=$2
       ORDER BY occurred_at DESC LIMIT $3`,
      [tenantId, SERVICE, limit],
    );
    return r.rows.map((row: Record<string, any>) => ({
      action: row.action,
      actorId: row.actor_id,
      subjectId: row.subject_id,
      detail: row.detail,
      occurredAt: row.occurred_at?.toISOString?.() ?? String(row.occurred_at),
    }));
  });
}
