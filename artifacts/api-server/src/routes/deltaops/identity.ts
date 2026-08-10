/**
 * DGP-017 · API HTTP de Identidad, Tenancy y SaaS Foundation.
 *
 * Superficies (Contract-First con Zod, permisos documentados, auditadas):
 *   Auth:   POST /auth/login · POST /auth/logout · GET /auth/session
 *           POST /auth/switch-tenant · POST /auth/password/change
 *           POST /auth/password/forgot · POST /auth/password/reset
 *   Invit:  GET/POST /auth/invitations · POST /auth/invitations/:id/resend
 *           POST /auth/invitations/:id/revoke · POST /auth/invitations/accept
 *   Users:  GET/POST /users · PATCH /users/:id · POST /users/:id/(de)activate
 *           POST /users/:id/force-recovery · GET /users/:id/audit
 *   Roles:  GET /roles
 *   Tenant: GET/PATCH /tenant/config · GET/PATCH /tenant/branding
 *           GET/PATCH /tenant/modules · GET /tenant/audit
 *   Notif:  GET /notifications
 *   Admin:  GET/POST /admin/tenants · POST /admin/tenants/:id/status
 *           PATCH /admin/tenants/:id/modules · GET /admin/tenants/:id/notifications
 *
 * Reglas de seguridad: sesión con tenant-context explícito; aislamiento por
 * tenant; anti-enumeración en recuperación; tokens de un solo uso; cambio de
 * tenant renueva authVersion; sin bypass de autorización.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { auditarIdentidad, listarAuditoria } from "../../deltaops/identity/audit";
import {
  loginConCredenciales,
  prepararCambioTenant,
  proyectarSesion,
} from "../../deltaops/identity/auth-flows";
import {
  ChangePasswordBody,
  ForgotPasswordBody,
  LoginBody,
  ResetPasswordBody,
  SwitchTenantBody,
  SessionResponse,
  CrearInvitacionBody,
  AceptarInvitacionBody,
  CrearUsuarioBody,
  EditarUsuarioBody,
  ActualizarConfigBody,
  ActualizarBrandingBody,
  ActualizarModulosBody,
  CrearTenantBody,
  EstadoTenantBody,
} from "../../deltaops/identity/contracts";
import { hashPassword, verifyPassword } from "../../deltaops/identity/crypto";
import { enqueueEmail, listarCorreos, type EmailBranding } from "../../deltaops/identity/email";
import {
  crearInvitacion,
  crearReset,
  consumirReset,
  listarInvitaciones,
  marcarInvitacionAceptada,
  revocarInvitacion,
  validarInvitacion,
  validarReset,
} from "../../deltaops/identity/invitations";
import {
  identityLocals,
  requireIdentity,
  requireSuperAdmin,
  requireTenantAdmin,
} from "../../deltaops/identity/middleware";
import { CATALOGO_ROLES, aRolLegacy } from "../../deltaops/identity/rbac";
import { MODULOS_TODOS, normalizarModulos } from "../../deltaops/identity/entitlements";
import {
  actualizarBranding,
  actualizarConfiguracion,
  actualizarModulos,
  cambiarEstadoIdentidad,
  cambiarEstadoMembresia,
  cambiarEstadoTenant,
  cambiarRolMembresia,
  crearIdentidad,
  crearMembresia,
  crearTenant,
  listarTenants,
  listarUsuariosDeTenant,
  obtenerIdentidad,
  obtenerIdentidadPorEmail,
  obtenerTenant,
  membresiasDe,
  type Tenant,
} from "../../deltaops/identity/service";
import { seedRolesDeTenant } from "../../deltaops/identity/seed-roles";
import { principalFor } from "./reference-runtime";

const router: IRouter = Router();
const BASE = "/deltaops";

/* ------------------------------ Utilidades -------------------------------- */

function brandingDeTenant(tenant: Tenant): EmailBranding {
  const b = tenant.branding as Record<string, unknown>;
  return {
    nombreApp: (b.nombreApp as string) ?? "DeltaOps",
    nombreEmpresa: (b.nombre as string) ?? tenant.nombreComercial,
    logoUrl: b.logoUrl as string | undefined,
    colorPrimario: b.colorPrimario as string | undefined,
    colorSecundario: b.colorSecundario as string | undefined,
  };
}

async function establecerSesion(
  req: Request,
  res: Response,
  datos: {
    identityId: string;
    email: string;
    nombre: string;
    passwordHash: string;
    tenantId: string;
    rolCanonico: string;
  },
): Promise<void> {
  const userId = await proyectarSesion({
    email: datos.email,
    nombre: datos.nombre,
    passwordHash: datos.passwordHash,
    rolCanonico: datos.rolCanonico,
    tenant: datos.tenantId,
  });
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.deltaopsUserId = userId;
  req.session.identityId = datos.identityId;
  req.session.tenantId = datos.tenantId;
  req.session.rolCanonico = datos.rolCanonico as never;
  req.session.authVersion = (req.session.authVersion ?? 0) + 1;
}

/* ================================ AUTH =================================== */

router.post(`${BASE}/auth/login`, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  const r = await loginConCredenciales(parsed.data.email, parsed.data.password, parsed.data.tenantId);
  if (!r.ok) {
    if (r.motivo === "seleccion-tenant") {
      res.status(409).json({ code: "SELECT_TENANT", membresias: r.membresias });
      return;
    }
    if (r.motivo === "usuario-deshabilitado") {
      res.status(403).json({ error: "Usuario deshabilitado", code: "USER_DISABLED" });
      return;
    }
    if (r.motivo === "tenant-no-operativo") {
      res.status(403).json({ error: "La empresa no está operativa", code: "TENANT_NOT_OPERATIONAL", estado: r.estado });
      return;
    }
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }
  await establecerSesion(req, res, r);
  await auditarIdentidad(r.tenantId, "login-exitoso", r.identityId, r.identityId, { email: r.email });
  const tenant = await obtenerTenant(r.tenantId);
  if (!tenant) {
    res.status(500).json({ error: "Empresa de la sesión no encontrada" });
    return;
  }
  res.json(await armarSesion(r.identityId, r.tenantId, r.rolCanonico, tenant));
});

/** Payload de sesión: usuario+tenant+rol+capacidades+módulos habilitados. */
async function construirSesion(res: Response): Promise<unknown> {
  const { ctx, tenant } = identityLocalsOrThrow(res);
  return armarSesion(ctx.identityId, ctx.tenantId, ctx.rolCanonico, tenant);
}

function identityLocalsOrThrow(res: Response) {
  const l = res.locals.identity;
  if (!l) throw new Error("Contexto de identidad ausente");
  return l as { ctx: { identityId: string; tenantId: string; rolCanonico: string }; tenant: Tenant };
}

async function armarSesion(
  identityId: string,
  tenantId: string,
  rolCanonico: string,
  tenant: Tenant,
): Promise<unknown> {
  const identidad = await obtenerIdentidad(identityId);
  const membresias = await membresiasDe(identityId);
  const detalleMembresias = await Promise.all(
    membresias.map(async (m) => {
      const t = await obtenerTenant(m.tenantId);
      return { tenantId: m.tenantId, nombre: t?.nombreComercial ?? m.tenantId, rol: m.rol };
    }),
  );
  const principal = principalFor(identityId, aRolLegacy(rolCanonico));
  const modulos = tenant.modulos?.length ? tenant.modulos : [...MODULOS_TODOS];
  return SessionResponse.parse({
    identityId,
    email: identidad?.email ?? "",
    nombre: identidad?.nombre ?? "",
    tenant: {
      id: tenant.tenantId,
      codigo: tenant.codigo,
      nombre: tenant.nombreComercial,
      estado: tenant.estado,
      idioma: tenant.idioma,
      zonaHoraria: tenant.zonaHoraria,
      moneda: tenant.moneda,
      branding: tenant.branding,
    },
    rol: rolCanonico,
    capacidades: principal.capacidades,
    permisos: principal.permisos,
    modulos,
    membresias: detalleMembresias,
  });
}

/** GET /auth/session — la construcción exige sesión válida (requireIdentity). */
router.get(`${BASE}/auth/session`, requireIdentity, async (_req, res): Promise<void> => {
  res.json(await construirSesion(res));
});

router.post(`${BASE}/auth/logout`, async (req, res): Promise<void> => {
  const identityId = req.session?.identityId;
  const tenantId = req.session?.tenantId;
  if (identityId && tenantId) {
    await auditarIdentidad(tenantId, "logout", identityId, identityId, {});
  }
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
  res.clearCookie("deltaops.sid");
  res.sendStatus(204);
});

/** Cambio de tenant seguro: renueva authVersion y reproyecta el usuario. */
router.post(`${BASE}/auth/switch-tenant`, requireIdentity, async (req, res): Promise<void> => {
  const parsed = SwitchTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Solicitud inválida" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  const prep = await prepararCambioTenant(ctx.identityId, parsed.data.tenantId);
  if (!prep.ok) {
    res.status(403).json({ error: "No puede acceder a esa empresa", code: "SWITCH_DENIED", estado: prep.estado });
    return;
  }
  const identidad = await obtenerIdentidad(ctx.identityId);
  const tenant = await obtenerTenant(prep.tenantId);
  if (!identidad || !tenant) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  const idFull = await obtenerIdentidadPorEmail(identidad.email);
  await establecerSesion(req, res, {
    identityId: ctx.identityId,
    email: identidad.email,
    nombre: identidad.nombre,
    passwordHash: idFull?.passwordHash ?? "",
    tenantId: prep.tenantId,
    rolCanonico: prep.rolCanonico,
  });
  await auditarIdentidad(prep.tenantId, "cambio-tenant", ctx.identityId, ctx.identityId, {
    desde: ctx.tenantId,
    hacia: prep.tenantId,
  });
  res.locals.identity = { ctx: { identityId: ctx.identityId, tenantId: prep.tenantId, rolCanonico: prep.rolCanonico }, tenant };
  res.json(await armarSesion(ctx.identityId, prep.tenantId, prep.rolCanonico, tenant));
});

/* --------------------------- Cambio de contraseña ------------------------- */

router.post(`${BASE}/auth/password/change`, requireIdentity, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ctx, tenant } = identityLocalsOrThrow(res);
  const identidad = await obtenerIdentidad(ctx.identityId);
  const full = identidad ? await obtenerIdentidadPorEmail(identidad.email) : null;
  if (!full || !(await verifyPassword(parsed.data.actual, full.passwordHash))) {
    res.status(400).json({ error: "La contraseña actual no es correcta" });
    return;
  }
  const { actualizarPassword } = await import("../../deltaops/identity/service");
  await actualizarPassword(ctx.identityId, await hashPassword(parsed.data.nueva));
  await auditarIdentidad(ctx.tenantId, "cambio-password", ctx.identityId, ctx.identityId, {});
  await enqueueEmail({
    tenantId: ctx.tenantId,
    tipo: "cambio-password",
    destinatario: full.email,
    idempotencyKey: `pwchg:${ctx.identityId}:${Date.now()}`,
    datos: { nombre: full.nombre },
    branding: brandingDeTenant(tenant),
  });
  res.sendStatus(204);
});

/* --------------------------- Recuperación (forgot) ------------------------ */

router.post(`${BASE}/auth/password/forgot`, async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  // Respuesta pública NEUTRA (anti-enumeración): siempre 202, sin revelar nada.
  const respuestaNeutra = () =>
    res.status(202).json({ mensaje: "Si el correo existe, enviaremos instrucciones." });
  if (!parsed.success) {
    respuestaNeutra();
    return;
  }
  const identidad = await obtenerIdentidadPorEmail(parsed.data.email);
  if (identidad) {
    const membresias = await membresiasDe(identidad.identityId);
    // Determina el tenant del flujo (indicado o único).
    const tenantId =
      parsed.data.tenantId && membresias.some((m) => m.tenantId === parsed.data.tenantId)
        ? parsed.data.tenantId
        : membresias[0]?.tenantId;
    if (tenantId) {
      const tenant = await obtenerTenant(tenantId);
      const token = await crearReset({ identityId: identidad.identityId, tenantId });
      await auditarIdentidad(tenantId, "recuperacion-solicitada", identidad.identityId, identidad.identityId, {});
      await enqueueEmail({
        tenantId,
        tipo: "recuperacion",
        destinatario: identidad.email,
        idempotencyKey: `reset:${identidad.identityId}:${token.slice(0, 8)}`,
        datos: {
          nombre: identidad.nombre,
          enlace: `/deltaops/#/reset?tenant=${tenantId}&token=${token}`,
          expira: "1 hora",
        },
        branding: tenant ? brandingDeTenant(tenant) : undefined,
      });
    }
  }
  respuestaNeutra();
});

router.post(`${BASE}/auth/password/reset`, async (req, res): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const reset = await validarReset(parsed.data.tenantId, parsed.data.token);
  if (!reset) {
    res.status(400).json({ error: "Enlace inválido o expirado", code: "TOKEN_INVALID" });
    return;
  }
  const consumido = await consumirReset(parsed.data.tenantId, reset.resetId);
  if (!consumido) {
    res.status(400).json({ error: "Enlace ya utilizado", code: "TOKEN_USED" });
    return;
  }
  const { actualizarPassword } = await import("../../deltaops/identity/service");
  await actualizarPassword(reset.identityId, await hashPassword(parsed.data.password));
  await auditarIdentidad(parsed.data.tenantId, "recuperacion-completada", reset.identityId, reset.identityId, {});
  res.sendStatus(204);
});

/* ============================= INVITACIONES ============================== */

router.get(`${BASE}/auth/invitations`, requireIdentity, requireTenantAdmin, async (_req, res): Promise<void> => {
  const { ctx } = identityLocalsOrThrow(res);
  res.json(await listarInvitaciones(ctx.tenantId));
});

router.post(`${BASE}/auth/invitations`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const parsed = CrearInvitacionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ctx, tenant } = identityLocalsOrThrow(res);
  const { invitacion, token } = await crearInvitacion({
    tenantId: ctx.tenantId,
    email: parsed.data.email,
    rol: parsed.data.rol,
    invitadoPor: ctx.identityId,
  });
  await auditarIdentidad(ctx.tenantId, "invitacion-creada", ctx.identityId, invitacion.invitationId, {
    email: parsed.data.email,
    rol: parsed.data.rol,
  });
  await enqueueEmail({
    tenantId: ctx.tenantId,
    tipo: "invitacion",
    destinatario: parsed.data.email,
    idempotencyKey: `inv:${invitacion.invitationId}:${token.slice(0, 8)}`,
    datos: {
      rol: parsed.data.rol,
      enlace: `/deltaops/#/invite?tenant=${ctx.tenantId}&token=${token}`,
      expira: invitacion.expiresAt,
    },
    branding: brandingDeTenant(tenant),
  });
  res.status(201).json(invitacion);
});

router.post(`${BASE}/auth/invitations/:id/resend`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const { ctx, tenant } = identityLocalsOrThrow(res);
  const invs = await listarInvitaciones(ctx.tenantId);
  const inv = invs.find((i) => i.invitationId === pid(req) && i.estado === "PENDIENTE");
  if (!inv) {
    res.status(404).json({ error: "Invitación no encontrada o no pendiente" });
    return;
  }
  const { invitacion, token } = await crearInvitacion({
    tenantId: ctx.tenantId,
    email: inv.email,
    rol: inv.rol,
    invitadoPor: ctx.identityId,
  });
  await auditarIdentidad(ctx.tenantId, "invitacion-reenviada", ctx.identityId, invitacion.invitationId, {});
  await enqueueEmail({
    tenantId: ctx.tenantId,
    tipo: "invitacion",
    destinatario: inv.email,
    idempotencyKey: `inv:${invitacion.invitationId}:${token.slice(0, 8)}`,
    datos: { rol: inv.rol, enlace: `/deltaops/#/invite?tenant=${ctx.tenantId}&token=${token}`, expira: invitacion.expiresAt },
    branding: brandingDeTenant(tenant),
  });
  res.json(invitacion);
});

router.post(`${BASE}/auth/invitations/:id/revoke`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const { ctx } = identityLocalsOrThrow(res);
  const ok = await revocarInvitacion(ctx.tenantId, pid(req));
  if (!ok) {
    res.status(404).json({ error: "Invitación no encontrada o no pendiente" });
    return;
  }
  await auditarIdentidad(ctx.tenantId, "invitacion-revocada", ctx.identityId, pid(req), {});
  res.sendStatus(204);
});

/** Aceptar invitación: pública (usa token). Crea identidad+membresía activas. */
router.post(`${BASE}/auth/invitations/accept`, async (req, res): Promise<void> => {
  const parsed = AceptarInvitacionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const inv = await validarInvitacion(parsed.data.tenantId, parsed.data.token);
  if (!inv) {
    res.status(400).json({ error: "Invitación inválida o expirada", code: "INVITE_INVALID" });
    return;
  }
  const identidad = await crearIdentidad({
    email: inv.email,
    nombre: parsed.data.nombre,
    passwordHash: await hashPassword(parsed.data.password),
    estado: "ACTIVO",
  });
  await crearMembresia({ identityId: identidad.identityId, tenantId: inv.tenantId, rol: inv.rol });
  await marcarInvitacionAceptada(inv.tenantId, inv.invitationId);
  await cambiarEstadoIdentidad(identidad.identityId, "ACTIVO");
  await auditarIdentidad(inv.tenantId, "invitacion-aceptada", identidad.identityId, inv.invitationId, {});
  const tenant = await obtenerTenant(inv.tenantId);
  if (tenant) {
    await enqueueEmail({
      tenantId: inv.tenantId,
      tipo: "bienvenida",
      destinatario: inv.email,
      idempotencyKey: `welcome:${identidad.identityId}`,
      datos: { nombre: parsed.data.nombre },
      branding: brandingDeTenant(tenant),
    });
  }
  res.status(201).json({ ok: true });
});

/* ================================ USERS ================================== */

router.get(`${BASE}/users`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const { ctx } = identityLocalsOrThrow(res);
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
  res.json(await listarUsuariosDeTenant(ctx.tenantId, { q, estado }));
});

router.post(`${BASE}/users`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const parsed = CrearUsuarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ctx, tenant } = identityLocalsOrThrow(res);
  // Crea/invita: genera identidad PENDIENTE + invitación (establece contraseña al aceptar).
  const existente = await obtenerIdentidadPorEmail(parsed.data.email);
  if (!existente) {
    await crearIdentidad({
      email: parsed.data.email,
      nombre: parsed.data.nombre,
      passwordHash: await hashPassword(cryptoRandom()),
      estado: "PENDIENTE",
    });
  }
  const { invitacion, token } = await crearInvitacion({
    tenantId: ctx.tenantId,
    email: parsed.data.email,
    rol: parsed.data.rol,
    invitadoPor: ctx.identityId,
  });
  await auditarIdentidad(ctx.tenantId, "usuario-creado", ctx.identityId, parsed.data.email, { rol: parsed.data.rol });
  await enqueueEmail({
    tenantId: ctx.tenantId,
    tipo: "invitacion",
    destinatario: parsed.data.email,
    idempotencyKey: `inv:${invitacion.invitationId}:${token.slice(0, 8)}`,
    datos: { rol: parsed.data.rol, enlace: `/deltaops/#/invite?tenant=${ctx.tenantId}&token=${token}`, expira: invitacion.expiresAt },
    branding: brandingDeTenant(tenant),
  });
  res.status(201).json({ email: parsed.data.email, invitacion: invitacion.invitationId });
});

router.patch(`${BASE}/users/:id`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const parsed = EditarUsuarioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  if (parsed.data.rol) {
    const upd = await cambiarRolMembresia(pid(req), ctx.tenantId, parsed.data.rol);
    if (!upd) {
      res.status(404).json({ error: "Usuario no pertenece a la empresa" });
      return;
    }
    await auditarIdentidad(ctx.tenantId, "cambio-rol", ctx.identityId, pid(req), { rol: parsed.data.rol });
  }
  if (parsed.data.nombre) {
    await auditarIdentidad(ctx.tenantId, "usuario-modificado", ctx.identityId, pid(req), { nombre: parsed.data.nombre });
  }
  res.sendStatus(204);
});

router.post(`${BASE}/users/:id/deactivate`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const { ctx, tenant } = identityLocalsOrThrow(res);
  const upd = await cambiarEstadoMembresia(pid(req), ctx.tenantId, "DESHABILITADO");
  if (!upd) {
    res.status(404).json({ error: "Usuario no pertenece a la empresa" });
    return;
  }
  await auditarIdentidad(ctx.tenantId, "usuario-desactivado", ctx.identityId, pid(req), {});
  const id = await obtenerIdentidad(pid(req));
  if (id) {
    await enqueueEmail({
      tenantId: ctx.tenantId,
      tipo: "cuenta-deshabilitada",
      destinatario: id.email,
      idempotencyKey: `disable:${pid(req)}:${Date.now()}`,
      datos: { nombre: id.nombre },
      branding: brandingDeTenant(tenant),
    });
  }
  res.sendStatus(204);
});

router.post(`${BASE}/users/:id/activate`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const { ctx, tenant } = identityLocalsOrThrow(res);
  const upd = await cambiarEstadoMembresia(pid(req), ctx.tenantId, "ACTIVO");
  if (!upd) {
    res.status(404).json({ error: "Usuario no pertenece a la empresa" });
    return;
  }
  await auditarIdentidad(ctx.tenantId, "usuario-activado", ctx.identityId, pid(req), {});
  const id = await obtenerIdentidad(pid(req));
  if (id) {
    await enqueueEmail({
      tenantId: ctx.tenantId,
      tipo: "cuenta-habilitada",
      destinatario: id.email,
      idempotencyKey: `enable:${pid(req)}:${Date.now()}`,
      datos: { nombre: id.nombre },
      branding: brandingDeTenant(tenant),
    });
  }
  res.sendStatus(204);
});

router.post(`${BASE}/users/:id/force-recovery`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const { ctx, tenant } = identityLocalsOrThrow(res);
  const id = await obtenerIdentidad(pid(req));
  if (!id) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }
  const token = await crearReset({ identityId: id.identityId, tenantId: ctx.tenantId });
  await auditarIdentidad(ctx.tenantId, "recuperacion-solicitada", ctx.identityId, id.identityId, { forzada: true });
  await enqueueEmail({
    tenantId: ctx.tenantId,
    tipo: "recuperacion",
    destinatario: id.email,
    idempotencyKey: `reset:${id.identityId}:${token.slice(0, 8)}`,
    datos: { nombre: id.nombre, enlace: `/deltaops/#/reset?tenant=${ctx.tenantId}&token=${token}`, expira: "1 hora" },
    branding: brandingDeTenant(tenant),
  });
  res.sendStatus(202);
});

router.get(`${BASE}/users/:id/audit`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const { ctx } = identityLocalsOrThrow(res);
  const todas = await listarAuditoria(ctx.tenantId, 500);
  res.json(todas.filter((e) => e.subjectId === pid(req)));
});

/* ================================ ROLES ================================= */

router.get(`${BASE}/roles`, requireIdentity, async (_req, res): Promise<void> => {
  res.json(CATALOGO_ROLES);
});

/* ============================ TENANT (admin) ============================ */

router.get(`${BASE}/tenant/config`, requireIdentity, requireTenantAdmin, async (_req, res): Promise<void> => {
  const { tenant } = identityLocalsOrThrow(res);
  res.json({
    idioma: tenant.idioma,
    zonaHoraria: tenant.zonaHoraria,
    moneda: tenant.moneda,
    configuracion: tenant.configuracion,
    modulos: tenant.modulos,
  });
});

router.patch(`${BASE}/tenant/config`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const parsed = ActualizarConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  const t = await actualizarConfiguracion(ctx.tenantId, parsed.data as Record<string, unknown>);
  await auditarIdentidad(ctx.tenantId, "cambio-configuracion", ctx.identityId, ctx.tenantId, parsed.data as Record<string, unknown>);
  res.json({ configuracion: t?.configuracion ?? {} });
});

router.get(`${BASE}/tenant/branding`, requireIdentity, async (_req, res): Promise<void> => {
  const { tenant } = identityLocalsOrThrow(res);
  res.json(tenant.branding);
});

router.patch(`${BASE}/tenant/branding`, requireIdentity, requireTenantAdmin, async (req, res): Promise<void> => {
  const parsed = ActualizarBrandingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Branding inválido (solo tokens seguros)", code: "BRANDING_INVALID" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  const t = await actualizarBranding(ctx.tenantId, parsed.data as Record<string, unknown>);
  await auditarIdentidad(ctx.tenantId, "cambio-branding", ctx.identityId, ctx.tenantId, parsed.data as Record<string, unknown>);
  res.json(t?.branding ?? {});
});

router.get(`${BASE}/tenant/modules`, requireIdentity, async (_req, res): Promise<void> => {
  const { tenant } = identityLocalsOrThrow(res);
  res.json({ modulos: tenant.modulos?.length ? tenant.modulos : [...MODULOS_TODOS] });
});

router.patch(`${BASE}/tenant/modules`, requireIdentity, requireSuperAdmin, async (req, res): Promise<void> => {
  const parsed = ActualizarModulosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Módulos inválidos" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  const t = await actualizarModulos(ctx.tenantId, normalizarModulos(parsed.data.modulos));
  await auditarIdentidad(ctx.tenantId, "modulos-actualizados", ctx.identityId, ctx.tenantId, { modulos: parsed.data.modulos });
  res.json({ modulos: t?.modulos ?? [] });
});

router.get(`${BASE}/tenant/audit`, requireIdentity, requireTenantAdmin, async (_req, res): Promise<void> => {
  const { ctx } = identityLocalsOrThrow(res);
  res.json(await listarAuditoria(ctx.tenantId, 200));
});

/* ============================ NOTIFICATIONS ============================= */

router.get(`${BASE}/notifications`, requireIdentity, requireTenantAdmin, async (_req, res): Promise<void> => {
  const { ctx } = identityLocalsOrThrow(res);
  res.json(await listarCorreos(ctx.tenantId, 200));
});

/* =============================== ADMIN SaaS ============================= */

router.get(`${BASE}/admin/tenants`, requireIdentity, requireSuperAdmin, async (_req, res): Promise<void> => {
  res.json(await listarTenants());
});

router.post(`${BASE}/admin/tenants`, requireIdentity, requireSuperAdmin, async (req, res): Promise<void> => {
  const parsed = CrearTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  const tenant = await crearTenant({
    tenantId: parsed.data.tenantId,
    codigo: parsed.data.codigo,
    nombreComercial: parsed.data.nombreComercial,
    razonSocial: parsed.data.razonSocial ?? null,
    idTributaria: parsed.data.idTributaria ?? null,
    zonaHoraria: parsed.data.zonaHoraria,
    idioma: parsed.data.idioma,
    moneda: parsed.data.moneda,
    modulos: parsed.data.modulos ?? [...MODULOS_TODOS],
  });
  await seedRolesDeTenant(tenant.tenantId);
  await auditarIdentidad(tenant.tenantId, "tenant-creado", ctx.identityId, tenant.tenantId, { codigo: tenant.codigo });
  // Admin inicial opcional (invitación).
  if (parsed.data.adminEmail) {
    const { invitacion, token } = await crearInvitacion({
      tenantId: tenant.tenantId,
      email: parsed.data.adminEmail,
      rol: "TENANT_ADMIN",
      invitadoPor: ctx.identityId,
    });
    await enqueueEmail({
      tenantId: tenant.tenantId,
      tipo: "invitacion",
      destinatario: parsed.data.adminEmail,
      idempotencyKey: `inv:${invitacion.invitationId}:${token.slice(0, 8)}`,
      datos: { rol: "TENANT_ADMIN", enlace: `/deltaops/#/invite?tenant=${tenant.tenantId}&token=${token}`, expira: invitacion.expiresAt },
      branding: brandingDeTenant(tenant),
    });
  }
  res.status(201).json(tenant);
});

router.post(`${BASE}/admin/tenants/:id/status`, requireIdentity, requireSuperAdmin, async (req, res): Promise<void> => {
  const parsed = EstadoTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Estado inválido" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  const t = await cambiarEstadoTenant(pid(req), parsed.data.estado);
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  await auditarIdentidad(pid(req), "tenant-estado", ctx.identityId, pid(req), { estado: parsed.data.estado });
  res.json(t);
});

router.patch(`${BASE}/admin/tenants/:id/modules`, requireIdentity, requireSuperAdmin, async (req, res): Promise<void> => {
  const parsed = ActualizarModulosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Módulos inválidos" });
    return;
  }
  const { ctx } = identityLocalsOrThrow(res);
  const t = await actualizarModulos(pid(req), normalizarModulos(parsed.data.modulos));
  if (!t) {
    res.status(404).json({ error: "Empresa no encontrada" });
    return;
  }
  await auditarIdentidad(pid(req), "modulos-actualizados", ctx.identityId, pid(req), { modulos: parsed.data.modulos });
  res.json({ modulos: t.modulos });
});

router.get(`${BASE}/admin/tenants/:id/notifications`, requireIdentity, requireSuperAdmin, async (req, res): Promise<void> => {
  res.json(await listarCorreos(pid(req), 200));
});

/* ------------------------------- Utilidad -------------------------------- */

/** Coerce del parámetro de ruta `:id` a string (Express 5 lo tipa como unión). */
function pid(req: Request): string {
  const v = req.params.id;
  return Array.isArray(v) ? v[0] : String(v);
}

function cryptoRandom(): string {
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}Aa1!`;
}

export default router;
