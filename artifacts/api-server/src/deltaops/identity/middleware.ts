/**
 * DeltaOps · DGP-017 — Middlewares de identidad y entitlements.
 *
 * - `requireIdentity`: exige sesión con identidad+tenant; verifica que la
 *   identidad esté ACTIVA, la membresía ACTIVA y el tenant OPERATIVO. Deja el
 *   contexto en `res.locals.identity`.
 * - `requireRol`: exige un rol canónico mínimo (o super-admin).
 * - `enforceEntitlements`: rechaza superficies de módulos NO contratados por el
 *   tenant (403), incluso si el usuario tiene permisos.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { contextoDeSesion, tenantOperativo, type SessionContext } from "./session-context";
import { esAdminDeTenant, esSuperAdmin, type RolCanonico } from "./rbac";
import { obtenerIdentidad, membresia, type Tenant } from "./service";
import { RUTA_A_MODULO, MODULOS_TODOS, esModuloConocido } from "./entitlements";

export interface IdentityLocals {
  ctx: SessionContext;
  tenant: Tenant;
}

function locals(res: Response): IdentityLocals {
  return res.locals.identity as IdentityLocals;
}
export { locals as identityLocals };

/** Guard de identidad + tenant operativo + coherencia de estado. */
export const requireIdentity: RequestHandler = async (req, res, next) => {
  const ctx = contextoDeSesion(req.session ?? {});
  if (!ctx) {
    res.status(401).json({ error: "No autenticado", code: "AUTH_REQUIRED" });
    return;
  }
  const identidad = await obtenerIdentidad(ctx.identityId);
  if (!identidad || identidad.estado === "DESHABILITADO") {
    res.status(403).json({ error: "Usuario deshabilitado", code: "USER_DISABLED" });
    return;
  }
  const mem = await membresia(ctx.identityId, ctx.tenantId);
  if (!mem || mem.estado !== "ACTIVO") {
    res.status(403).json({ error: "Membresía no activa en la empresa", code: "MEMBERSHIP_INACTIVE" });
    return;
  }
  const op = await tenantOperativo(ctx.tenantId);
  if (!op.ok) {
    res.status(403).json({ error: op.motivo, code: "TENANT_NOT_OPERATIONAL", estado: op.estado });
    return;
  }
  res.locals.identity = { ctx, tenant: op.tenant } satisfies IdentityLocals;
  next();
};

/** Exige que el actor sea TENANT_ADMIN o SUPER_ADMIN. */
export const requireTenantAdmin: RequestHandler = (_req, res, next) => {
  const { ctx } = locals(res);
  if (!esAdminDeTenant(ctx.rolCanonico)) {
    res.status(403).json({ error: "Requiere administrador de empresa", code: "FORBIDDEN" });
    return;
  }
  next();
};

/** Exige que el actor sea SUPER_ADMIN (administración global SaaS). */
export const requireSuperAdmin: RequestHandler = (_req, res, next) => {
  const { ctx } = locals(res);
  if (!esSuperAdmin(ctx.rolCanonico)) {
    res.status(403).json({ error: "Requiere super administrador", code: "FORBIDDEN" });
    return;
  }
  next();
};

/** Exige uno de los roles canónicos dados. */
export function requireRol(...roles: RolCanonico[]): RequestHandler {
  return (_req, res, next) => {
    const { ctx } = locals(res);
    if (esSuperAdmin(ctx.rolCanonico) || roles.includes(ctx.rolCanonico)) {
      next();
      return;
    }
    res.status(403).json({ error: "Rol insuficiente", code: "FORBIDDEN" });
  };
}

/**
 * Enforcement de entitlements de módulo en BACKEND. Dada la ruta
 * `/api/deltaops/<segmento>/…`, si `<segmento>` es un módulo de negocio conocido
 * y el tenant NO lo tiene habilitado, responde 403. Superficies de identidad,
 * plataforma y admin quedan siempre disponibles.
 *
 * El tenant activo debe estar resuelto por `requireIdentity` antes.
 */
export function moduloDeRuta(url: string): string | null {
  // url ejemplo: /api/deltaops/activos/... o /deltaops/activos/...
  const m = url.match(/\/deltaops\/([a-z0-9-]+)/i);
  if (!m) return null;
  const seg = m[1].toLowerCase();
  return RUTA_A_MODULO[seg] ?? null;
}

/**
 * Resolver SUAVE de identidad: si la sesión tiene identidad+tenant válidos,
 * puebla `res.locals.identity` (para entitlements). No falla si no hay sesión
 * Enterprise (preserva la compatibilidad de módulos con login legacy). Verifica
 * también que el tenant esté operativo cuando el contexto Enterprise existe.
 */
export async function resolveIdentitySoft(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ctx = contextoDeSesion(req.session ?? {});
  if (!ctx) {
    next();
    return;
  }
  const op = await tenantOperativo(ctx.tenantId);
  if (!op.ok) {
    res.status(403).json({ error: op.motivo, code: "TENANT_NOT_OPERATIONAL", estado: op.estado });
    return;
  }
  res.locals.identity = { ctx, tenant: op.tenant } satisfies IdentityLocals;
  next();
}

export function enforceEntitlements(req: Request, res: Response, next: NextFunction): void {
  const modulo = moduloDeRuta(req.originalUrl);
  if (!modulo || !esModuloConocido(modulo)) {
    next();
    return;
  }
  const l = res.locals.identity as IdentityLocals | undefined;
  // Si no hay contexto de identidad resuelto (login legacy sin tenant en idn_*),
  // no bloqueamos: la compatibilidad de módulos existentes se preserva.
  if (!l) {
    next();
    return;
  }
  const habilitados = l.tenant.modulos?.length ? l.tenant.modulos : MODULOS_TODOS;
  if (!habilitados.includes(modulo)) {
    res.status(403).json({
      error: `Módulo no habilitado para esta empresa: ${modulo}`,
      code: "MODULE_NOT_ENTITLED",
    });
    return;
  }
  next();
}
