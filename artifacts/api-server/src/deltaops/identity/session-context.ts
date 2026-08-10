/**
 * DeltaOps · DGP-017 — Contexto de sesión Enterprise.
 *
 * Extiende la sesión existente (express-session sobre PostgreSQL) con el
 * contexto explícito de tenant y membresía. La sesión guarda:
 *   - deltaopsUserId    : (legacy) id de deltaops.users si el login fue por esa vía.
 *   - identityId        : identidad global (idn_identities).
 *   - tenantId          : tenant-context EXPLÍCITO y ACTIVO de la sesión.
 *   - rolCanonico       : rol Enterprise efectivo por membresía en ese tenant.
 *   - authVersion       : marca que se renueva en cada cambio de tenant para
 *                         invalidar cualquier contexto de autorización previo.
 *
 * Un cambio de tenant SIEMPRE regenera authVersion (nunca reutiliza permisos ni
 * cachés del tenant anterior).
 */
import "express-session";
import { aRolLegacy, type RolCanonico } from "./rbac";
import { obtenerTenant, type Tenant } from "./service";

declare module "express-session" {
  interface SessionData {
    /** Legacy (DGP-001): id en deltaops.users. Compat con logins existentes. */
    deltaopsUserId?: number;
    /** Identidad global (DGP-017). */
    identityId?: string;
    /** Tenant-context activo y explícito de la sesión. */
    tenantId?: string;
    /** Rol canónico efectivo por membresía en el tenant activo. */
    rolCanonico?: RolCanonico;
    /** Se renueva en cada cambio de tenant: invalida autorización previa. */
    authVersion?: number;
  }
}

export interface SessionContext {
  identityId: string;
  tenantId: string;
  rolCanonico: RolCanonico;
  /** Rol legacy (admin/operador/lector) para los `principal*` de módulo. */
  rolLegacy: "admin" | "operador" | "lector";
  authVersion: number;
}

/** Deriva el contexto de sesión desde la SessionData, o null si no aplica. */
export function contextoDeSesion(session: {
  identityId?: string;
  tenantId?: string;
  rolCanonico?: RolCanonico;
  authVersion?: number;
}): SessionContext | null {
  if (!session.identityId || !session.tenantId || !session.rolCanonico) return null;
  return {
    identityId: session.identityId,
    tenantId: session.tenantId,
    rolCanonico: session.rolCanonico,
    rolLegacy: aRolLegacy(session.rolCanonico),
    authVersion: session.authVersion ?? 0,
  };
}

/**
 * Verifica que el tenant activo de la sesión esté OPERATIVO (ACTIVO). Un tenant
 * SUSPENDIDO/INACTIVO bloquea la operación normal con un mensaje apropiado.
 */
export async function tenantOperativo(
  tenantId: string,
): Promise<{ ok: true; tenant: Tenant } | { ok: false; motivo: string; estado?: string }> {
  const tenant = await obtenerTenant(tenantId);
  if (!tenant) return { ok: false, motivo: "Empresa no encontrada" };
  if (tenant.estado !== "ACTIVO") {
    return {
      ok: false,
      estado: tenant.estado,
      motivo:
        tenant.estado === "SUSPENDIDO"
          ? "La empresa se encuentra suspendida. Contacte al administrador."
          : "La empresa se encuentra inactiva.",
    };
  }
  return { ok: true, tenant };
}
