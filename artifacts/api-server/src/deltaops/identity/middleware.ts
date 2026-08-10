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
import { obtenerIdentidad, membresia, obtenerIdentidadPorEmail, type Tenant } from "./service";
import { RUTA_A_MODULO, MODULOS_TODOS, esModuloConocido } from "./entitlements";
import { proyectarUsuario } from "./user-mirror";

/**
 * Verificación de coherencia de sesión Enterprise, compartida por
 * `requireIdentity` y por el guard estricto de módulos. Devuelve el contexto y
 * el tenant operativo, o un error HTTP a emitir. INCLUYE la validación del
 * epoch de autorización: si la sesión trae `authVersion` distinta del
 * `auth_epoch` vigente de la identidad, la sesión es OBSOLETA y se rechaza (401).
 */
async function verificarSesionEnterprise(
  req: Request,
): Promise<
  | { ok: true; ctx: SessionContext; tenant: Tenant; email: string; nombre: string; passwordHash: string }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const ctx = contextoDeSesion(req.session ?? {});
  if (!ctx) {
    return { ok: false, status: 401, body: { error: "No autenticado", code: "AUTH_REQUIRED" } };
  }
  const identidad = await obtenerIdentidad(ctx.identityId);
  if (!identidad || identidad.estado === "DESHABILITADO") {
    return { ok: false, status: 403, body: { error: "Usuario deshabilitado", code: "USER_DISABLED" } };
  }
  // Epoch de autorización: sesión con marca obsoleta ⇒ 401 (p. ej. cookie previa
  // a un login/switch-tenant posterior de la misma identidad).
  if ((req.session?.authVersion ?? -1) !== identidad.authEpoch) {
    return { ok: false, status: 401, body: { error: "Sesión expirada", code: "AUTH_STALE" } };
  }
  const mem = await membresia(ctx.identityId, ctx.tenantId);
  if (!mem || mem.estado !== "ACTIVO") {
    return { ok: false, status: 403, body: { error: "Membresía no activa en la empresa", code: "MEMBERSHIP_INACTIVE" } };
  }
  const op = await tenantOperativo(ctx.tenantId);
  if (!op.ok) {
    return { ok: false, status: 403, body: { error: op.motivo, code: "TENANT_NOT_OPERATIONAL", estado: op.estado } };
  }
  // Datos de identidad completos (para reproyección del espejo por sesión).
  const full = await obtenerIdentidadPorEmail(identidad.email);
  return {
    ok: true,
    ctx,
    tenant: op.tenant,
    email: identidad.email,
    nombre: identidad.nombre,
    passwordHash: full?.passwordHash ?? "",
  };
}

export interface IdentityLocals {
  ctx: SessionContext;
  tenant: Tenant;
}

function locals(res: Response): IdentityLocals {
  return res.locals.identity as IdentityLocals;
}
export { locals as identityLocals };

/** Guard de identidad + tenant operativo + coherencia de estado + epoch. */
export const requireIdentity: RequestHandler = async (req, res, next) => {
  const v = await verificarSesionEnterprise(req);
  if (!v.ok) {
    res.status(v.status).json(v.body);
    return;
  }
  res.locals.identity = { ctx: v.ctx, tenant: v.tenant } satisfies IdentityLocals;
  next();
};

/**
 * Guard ESTRICTO para las superficies de MÓDULO de negocio. A diferencia del
 * antiguo resolver suave, NO tiene camino permisivo: toda sesión que llegue a un
 * router de módulo DEBE estar respaldada por identidad + membresía activa +
 * tenant operativo + epoch vigente. Además REPROYECTA y FIJA `deltaopsUserId` a
 * la fila espejo DEDICADA del par (identidad, tenant) de ESTA sesión, de modo
 * que la derivación de contexto de los módulos (que leen esa fila por id) sea
 * SIEMPRE la de la sesión y JAMÁS la de otra sesión concurrente.
 */
export const requireIdentityForModules: RequestHandler = async (req, res, next) => {
  // Solo gobierna superficies de MÓDULO de negocio conocidas. Rutas ajenas
  // (health, SGMA genérico, etc.) pasan sin exigir identidad Enterprise.
  const modulo = moduloDeRuta(req.originalUrl);
  if (!modulo || !esModuloConocido(modulo)) {
    next();
    return;
  }
  const v = await verificarSesionEnterprise(req);
  if (!v.ok) {
    res.status(v.status).json(v.body);
    return;
  }
  // Re-pin del espejo legacy a la fila (identidad, tenant) de ESTA sesión.
  const p = await proyectarUsuario({
    identityId: v.ctx.identityId,
    email: v.email,
    nombre: v.nombre,
    passwordHash: v.passwordHash,
    rolCanonico: v.ctx.rolCanonico,
    tenant: v.ctx.tenantId,
  });
  if (req.session) req.session.deltaopsUserId = p.userId;
  res.locals.identity = { ctx: v.ctx, tenant: v.tenant } satisfies IdentityLocals;
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

export function enforceEntitlements(req: Request, res: Response, next: NextFunction): void {
  const modulo = moduloDeRuta(req.originalUrl);
  if (!modulo || !esModuloConocido(modulo)) {
    next();
    return;
  }
  const l = res.locals.identity as IdentityLocals | undefined;
  // Defensa en profundidad: para una superficie de módulo el contexto de
  // identidad DEBE existir (lo garantiza `requireIdentityForModules`). Si no,
  // se rechaza (ya NO hay camino permisivo legacy).
  if (!l) {
    res.status(401).json({ error: "No autenticado", code: "AUTH_REQUIRED" });
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
