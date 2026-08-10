/**
 * DeltaOps · DGP-017 — Invitaciones y recuperación de contraseña.
 *
 * Invitaciones: token opaco (hasheado en BD), expirable, un solo uso, revocable,
 * idempotente (una PENDIENTE por tenant+email), vinculada a tenant y rol; NO
 * aceptable fuera de su tenant. Aceptar ⇒ crea identidad+membresía activas.
 *
 * Recuperación: token opaco (hasheado), un solo uso, expirable, aislado por
 * tenant; anti-enumeración en la capa HTTP (respuesta pública neutra).
 */
import { generarToken, hashToken } from "./crypto";
import { withTenant } from "./db-helpers";

const INVITACION_TTL_MS = 1000 * 60 * 60 * 72; // 72 h
const RESET_TTL_MS = 1000 * 60 * 60; // 1 h

/* ------------------------------ Invitaciones ------------------------------ */

export interface Invitacion {
  invitationId: string;
  tenantId: string;
  email: string;
  rol: string;
  estado: "PENDIENTE" | "ACEPTADA" | "REVOCADA" | "EXPIRADA";
  expiresAt: string;
  createdAt: string;
}

function mapInvitacion(row: Record<string, any>): Invitacion {
  return {
    invitationId: row.invitation_id,
    tenantId: row.tenant_id,
    email: row.email,
    rol: row.rol,
    estado: row.estado,
    expiresAt: row.expires_at?.toISOString?.() ?? String(row.expires_at),
    createdAt: row.created_at?.toISOString?.() ?? String(row.created_at),
  };
}

/**
 * Crea (o reutiliza idempotentemente) una invitación PENDIENTE. Devuelve la
 * invitación y el token EN CLARO (solo para enviar por correo; nunca se persiste
 * en claro). Si ya existe una PENDIENTE para (tenant,email), la reutiliza pero
 * rota el token para un nuevo envío seguro.
 */
export async function crearInvitacion(input: {
  tenantId: string;
  email: string;
  rol: string;
  invitadoPor: string;
  ahora?: Date;
}): Promise<{ invitacion: Invitacion; token: string }> {
  const token = generarToken();
  const tokenHash = hashToken(token);
  const now = input.ahora ?? new Date();
  const expires = new Date(now.getTime() + INVITACION_TTL_MS);
  const email = input.email.toLowerCase();

  const invitacion = await withTenant(input.tenantId, async (client) => {
    // ¿Existe una PENDIENTE? (idempotencia): rota token y expiración.
    const existing = await client.query(
      `SELECT * FROM deltaops.idn_invitations
       WHERE tenant_id=$1 AND lower(email)=lower($2) AND estado='PENDIENTE'`,
      [input.tenantId, email],
    );
    if (existing.rows[0]) {
      const upd = await client.query(
        `UPDATE deltaops.idn_invitations
           SET token_hash=$3, rol=$4, expires_at=$5, invitado_por=$6, updated_at=now()
         WHERE invitation_id=$1 AND tenant_id=$2 RETURNING *`,
        [existing.rows[0].invitation_id, input.tenantId, tokenHash, input.rol, expires, input.invitadoPor],
      );
      return mapInvitacion(upd.rows[0]);
    }
    const r = await client.query(
      `INSERT INTO deltaops.idn_invitations
         (tenant_id, email, rol, token_hash, estado, invitado_por, idempotency_key, expires_at)
       VALUES ($1,$2,$3,$4,'PENDIENTE',$5,$6,$7) RETURNING *`,
      [input.tenantId, email, input.rol, tokenHash, input.invitadoPor, `${input.tenantId}:${email}`, expires],
    );
    return mapInvitacion(r.rows[0]);
  });

  return { invitacion, token };
}

export async function listarInvitaciones(tenantId: string): Promise<Invitacion[]> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.idn_invitations WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return r.rows.map(mapInvitacion);
  });
}

export async function revocarInvitacion(
  tenantId: string,
  invitationId: string,
): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE deltaops.idn_invitations
         SET estado='REVOCADA', revoked_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND invitation_id=$2 AND estado='PENDIENTE'`,
      [tenantId, invitationId],
    );
    return (r.rowCount ?? 0) > 0;
  });
}

/**
 * Valida un token de invitación EN CLARO contra su hash y expiración/estado.
 * El tenant debe indicarse explícitamente (no aceptable fuera de su tenant).
 */
export async function validarInvitacion(
  tenantId: string,
  token: string,
  ahora?: Date,
): Promise<Invitacion | null> {
  const now = ahora ?? new Date();
  const tokenHash = hashToken(token);
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.idn_invitations
       WHERE tenant_id=$1 AND token_hash=$2 AND estado='PENDIENTE'`,
      [tenantId, tokenHash],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < now.getTime()) {
      await client.query(
        `UPDATE deltaops.idn_invitations SET estado='EXPIRADA', updated_at=now()
         WHERE invitation_id=$1 AND tenant_id=$2`,
        [row.invitation_id, tenantId],
      );
      return null;
    }
    return mapInvitacion(row);
  });
}

/** Marca una invitación como ACEPTADA (un solo uso). */
export async function marcarInvitacionAceptada(
  tenantId: string,
  invitationId: string,
): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE deltaops.idn_invitations
         SET estado='ACEPTADA', accepted_at=now(), updated_at=now()
       WHERE tenant_id=$1 AND invitation_id=$2 AND estado='PENDIENTE'`,
      [tenantId, invitationId],
    );
    return (r.rowCount ?? 0) > 0;
  });
}

/* ------------------------- Recuperación de clave -------------------------- */

export interface ResetToken {
  resetId: string;
  identityId: string;
  tenantId: string;
}

export async function crearReset(input: {
  identityId: string;
  tenantId: string;
  ahora?: Date;
}): Promise<string> {
  const token = generarToken();
  const tokenHash = hashToken(token);
  const now = input.ahora ?? new Date();
  const expires = new Date(now.getTime() + RESET_TTL_MS);
  await withTenant(input.tenantId, async (client) => {
    // Invalida resets previos pendientes del mismo (identidad,tenant).
    await client.query(
      `UPDATE deltaops.idn_password_resets SET estado='EXPIRADO'
       WHERE identity_id=$1 AND tenant_id=$2 AND estado='PENDIENTE'`,
      [input.identityId, input.tenantId],
    );
    await client.query(
      `INSERT INTO deltaops.idn_password_resets
         (identity_id, tenant_id, token_hash, estado, expires_at)
       VALUES ($1,$2,$3,'PENDIENTE',$4)`,
      [input.identityId, input.tenantId, tokenHash, expires],
    );
  });
  return token;
}

/** Valida un token de reset EN CLARO; devuelve la identidad si es válido. */
export async function validarReset(
  tenantId: string,
  token: string,
  ahora?: Date,
): Promise<ResetToken | null> {
  const now = ahora ?? new Date();
  const tokenHash = hashToken(token);
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `SELECT * FROM deltaops.idn_password_resets
       WHERE tenant_id=$1 AND token_hash=$2 AND estado='PENDIENTE'`,
      [tenantId, tokenHash],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < now.getTime()) {
      await client.query(
        `UPDATE deltaops.idn_password_resets SET estado='EXPIRADO'
         WHERE reset_id=$1 AND tenant_id=$2`,
        [row.reset_id, tenantId],
      );
      return null;
    }
    return { resetId: row.reset_id, identityId: row.identity_id, tenantId: row.tenant_id };
  });
}

/** Consume (marca USADO) un reset — un solo uso. */
export async function consumirReset(tenantId: string, resetId: string): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query(
      `UPDATE deltaops.idn_password_resets SET estado='USADO', used_at=now()
       WHERE tenant_id=$1 AND reset_id=$2 AND estado='PENDIENTE'`,
      [tenantId, resetId],
    );
    return (r.rowCount ?? 0) > 0;
  });
}
