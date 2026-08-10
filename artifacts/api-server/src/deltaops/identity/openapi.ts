/**
 * DGP-017 · Contrato OpenAPI 3 (contract-first) de Identidad, Tenancy y SaaS.
 *
 * Generador DETERMINISTA y AUTOSUFICIENTE (sin imports del workspace) para poder
 * exportarse sin arrancar el servidor. Enumera TODAS las superficies HTTP bajo
 * `/api/deltaops` de la Etapa 1 (auth, invitaciones, usuarios, roles, tenant,
 * notificaciones, admin SaaS), cada una con `operationId` estable `identity.*`.
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que cada ruta del router tiene su operación.
 */

const BASE = "/api/deltaops";

type Schema = Record<string, unknown>;

const ref = (n: string): Schema => ({ $ref: `#/components/schemas/${n}` });
const str = (extra: Schema = {}): Schema => ({ type: "string", ...extra });
const bool = (): Schema => ({ type: "boolean" });
const arr = (items: Schema): Schema => ({ type: "array", items });
const obj = (props: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties: props,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const ROLES = ["SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "PLANIFICADOR", "TECNICO", "CONSULTA"];
const MODULOS = [
  "referencia", "activos", "ordenes", "inventario", "planes",
  "abastecimiento", "preventivo", "correctivo", "analytics",
];

const schemas: Record<string, Schema> = {
  Error: obj({ error: str(), code: str() }, ["error"]),
  LoginBody: obj({ email: str(), password: str(), tenantId: str() }, ["email", "password"]),
  SwitchTenantBody: obj({ tenantId: str() }, ["tenantId"]),
  ForgotPasswordBody: obj({ email: str(), tenantId: str() }, ["email"]),
  ResetPasswordBody: obj({ tenantId: str(), token: str(), password: str({ minLength: 8 }) }, ["tenantId", "token", "password"]),
  ChangePasswordBody: obj({ actual: str(), nueva: str({ minLength: 8 }) }, ["actual", "nueva"]),
  MembresiaResumen: obj({ tenantId: str(), nombre: str(), rol: str({ enum: ROLES }) }, ["tenantId", "nombre", "rol"]),
  Tenant: obj({
    id: str(), codigo: str(), nombre: str(), estado: str(),
    idioma: str(), zonaHoraria: str(), moneda: str(), branding: obj({}),
  }, ["id", "codigo", "nombre", "estado"]),
  SessionResponse: obj({
    identityId: str(), email: str(), nombre: str(),
    tenant: ref("Tenant"), rol: str({ enum: ROLES }),
    capacidades: arr(str()), permisos: arr(str()),
    modulos: arr(str({ enum: MODULOS })), membresias: arr(ref("MembresiaResumen")),
  }, ["identityId", "email", "nombre", "tenant", "rol", "modulos", "membresias"]),
  CrearInvitacionBody: obj({ email: str(), rol: str({ enum: ROLES }) }, ["email", "rol"]),
  AceptarInvitacionBody: obj({ tenantId: str(), token: str(), nombre: str(), password: str({ minLength: 8 }) }, ["tenantId", "token", "nombre", "password"]),
  Invitacion: obj({
    invitationId: str(), email: str(), rol: str({ enum: ROLES }),
    estado: str(), expiresAt: str(), createdAt: str(),
  }, ["invitationId", "email", "rol", "estado"]),
  CrearUsuarioBody: obj({ email: str(), nombre: str(), rol: str({ enum: ROLES }) }, ["email", "nombre", "rol"]),
  EditarUsuarioBody: obj({ nombre: str(), rol: str({ enum: ROLES }) }),
  Usuario: obj({
    identityId: str(), email: str(), nombre: str(), estado: str(),
    rol: str({ enum: ROLES }), estadoMembresia: str(),
  }, ["identityId", "email", "nombre", "rol"]),
  Rol: obj({ clave: str({ enum: ROLES }), nombre: str(), descripcion: str() }, ["clave", "nombre"]),
  ActualizarConfigBody: obj({ idioma: str(), zonaHoraria: str(), moneda: str(), configuracion: obj({}) }),
  ActualizarBrandingBody: obj({ nombre: str(), nombreApp: str(), logoUrl: str(), colorPrimario: str(), colorSecundario: str() }),
  ActualizarModulosBody: obj({ modulos: arr(str({ enum: MODULOS })) }, ["modulos"]),
  CrearTenantBody: obj({
    tenantId: str(), codigo: str(), nombreComercial: str(), razonSocial: str(),
    idTributaria: str(), zonaHoraria: str(), idioma: str(), moneda: str(),
    modulos: arr(str({ enum: MODULOS })), adminEmail: str(),
  }, ["tenantId", "codigo", "nombreComercial"]),
  EstadoTenantBody: obj({ estado: str({ enum: ["ACTIVO", "SUSPENDIDO", "CERRADO"] }) }, ["estado"]),
  Notificacion: obj({
    emailId: str(), tipo: str(), destinatario: str(), asunto: str(),
    estado: str(), createdAt: str(), sentAt: str({ nullable: true }),
  }, ["emailId", "tipo", "destinatario", "estado"]),
  AuditoriaEvento: obj({
    action: str(), actorId: str(), subjectId: str({ nullable: true }),
    detail: obj({}), occurredAt: str(),
  }, ["action", "actorId", "occurredAt"]),
};

/** Descriptor compacto de operación → objeto OpenAPI. */
interface OpSpec {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  auth: string; // documentación de autorización
  body?: string; // schema ref name
  ok: { code: string; schema?: string };
}

const OPS: OpSpec[] = [
  // Auth
  { method: "post", path: "/auth/login", operationId: "identity.auth.login", summary: "Autenticar con credenciales", tag: "Auth", auth: "Público", body: "LoginBody", ok: { code: "200", schema: "SessionResponse" } },
  { method: "post", path: "/auth/logout", operationId: "identity.auth.logout", summary: "Cerrar sesión", tag: "Auth", auth: "Autenticado", ok: { code: "204" } },
  { method: "get", path: "/auth/session", operationId: "identity.auth.session", summary: "Sesión activa (usuario+tenant+rol+módulos)", tag: "Auth", auth: "Autenticado", ok: { code: "200", schema: "SessionResponse" } },
  { method: "post", path: "/auth/switch-tenant", operationId: "identity.auth.switchTenant", summary: "Cambiar de empresa (renueva authVersion)", tag: "Auth", auth: "Autenticado", body: "SwitchTenantBody", ok: { code: "200", schema: "SessionResponse" } },
  { method: "post", path: "/auth/password/change", operationId: "identity.auth.passwordChange", summary: "Cambiar la propia contraseña", tag: "Auth", auth: "Autenticado", body: "ChangePasswordBody", ok: { code: "204" } },
  { method: "post", path: "/auth/password/forgot", operationId: "identity.auth.passwordForgot", summary: "Solicitar recuperación (anti-enumeración)", tag: "Auth", auth: "Público", body: "ForgotPasswordBody", ok: { code: "202" } },
  { method: "post", path: "/auth/password/reset", operationId: "identity.auth.passwordReset", summary: "Restablecer con token de un solo uso", tag: "Auth", auth: "Público (token)", body: "ResetPasswordBody", ok: { code: "204" } },
  // Invitaciones
  { method: "get", path: "/auth/invitations", operationId: "identity.invitations.list", summary: "Listar invitaciones del tenant", tag: "Invitaciones", auth: "TENANT_ADMIN", ok: { code: "200", schema: "Invitacion" } },
  { method: "post", path: "/auth/invitations", operationId: "identity.invitations.create", summary: "Crear invitación", tag: "Invitaciones", auth: "TENANT_ADMIN", body: "CrearInvitacionBody", ok: { code: "201", schema: "Invitacion" } },
  { method: "post", path: "/auth/invitations/{id}/resend", operationId: "identity.invitations.resend", summary: "Reenviar invitación pendiente", tag: "Invitaciones", auth: "TENANT_ADMIN", ok: { code: "200", schema: "Invitacion" } },
  { method: "post", path: "/auth/invitations/{id}/revoke", operationId: "identity.invitations.revoke", summary: "Revocar invitación pendiente", tag: "Invitaciones", auth: "TENANT_ADMIN", ok: { code: "204" } },
  { method: "post", path: "/auth/invitations/accept", operationId: "identity.invitations.accept", summary: "Aceptar invitación (token) y crear cuenta", tag: "Invitaciones", auth: "Público (token)", body: "AceptarInvitacionBody", ok: { code: "201" } },
  // Usuarios
  { method: "get", path: "/users", operationId: "identity.users.list", summary: "Listar usuarios del tenant", tag: "Usuarios", auth: "TENANT_ADMIN", ok: { code: "200", schema: "Usuario" } },
  { method: "post", path: "/users", operationId: "identity.users.create", summary: "Crear/invitar usuario", tag: "Usuarios", auth: "TENANT_ADMIN", body: "CrearUsuarioBody", ok: { code: "201" } },
  { method: "patch", path: "/users/{id}", operationId: "identity.users.update", summary: "Editar nombre/rol de usuario", tag: "Usuarios", auth: "TENANT_ADMIN", body: "EditarUsuarioBody", ok: { code: "204" } },
  { method: "post", path: "/users/{id}/activate", operationId: "identity.users.activate", summary: "Habilitar usuario en el tenant", tag: "Usuarios", auth: "TENANT_ADMIN", ok: { code: "204" } },
  { method: "post", path: "/users/{id}/deactivate", operationId: "identity.users.deactivate", summary: "Deshabilitar usuario en el tenant", tag: "Usuarios", auth: "TENANT_ADMIN", ok: { code: "204" } },
  { method: "post", path: "/users/{id}/force-recovery", operationId: "identity.users.forceRecovery", summary: "Forzar recuperación de contraseña", tag: "Usuarios", auth: "TENANT_ADMIN", ok: { code: "202" } },
  { method: "get", path: "/users/{id}/audit", operationId: "identity.users.audit", summary: "Auditoría del usuario", tag: "Usuarios", auth: "TENANT_ADMIN", ok: { code: "200", schema: "AuditoriaEvento" } },
  // Roles
  { method: "get", path: "/roles", operationId: "identity.roles.list", summary: "Catálogo de roles", tag: "Roles", auth: "Autenticado", ok: { code: "200", schema: "Rol" } },
  // Tenant
  { method: "get", path: "/tenant/config", operationId: "identity.tenant.getConfig", summary: "Configuración del tenant", tag: "Tenant", auth: "TENANT_ADMIN", ok: { code: "200" } },
  { method: "patch", path: "/tenant/config", operationId: "identity.tenant.updateConfig", summary: "Actualizar configuración", tag: "Tenant", auth: "TENANT_ADMIN", body: "ActualizarConfigBody", ok: { code: "200" } },
  { method: "get", path: "/tenant/branding", operationId: "identity.tenant.getBranding", summary: "Branding del tenant", tag: "Tenant", auth: "Autenticado", ok: { code: "200" } },
  { method: "patch", path: "/tenant/branding", operationId: "identity.tenant.updateBranding", summary: "Actualizar branding (tokens seguros)", tag: "Tenant", auth: "TENANT_ADMIN", body: "ActualizarBrandingBody", ok: { code: "200" } },
  { method: "get", path: "/tenant/modules", operationId: "identity.tenant.getModules", summary: "Módulos habilitados", tag: "Tenant", auth: "Autenticado", ok: { code: "200" } },
  { method: "patch", path: "/tenant/modules", operationId: "identity.tenant.updateModules", summary: "Actualizar módulos (super admin)", tag: "Tenant", auth: "SUPER_ADMIN", body: "ActualizarModulosBody", ok: { code: "200" } },
  { method: "get", path: "/tenant/audit", operationId: "identity.tenant.audit", summary: "Auditoría del tenant", tag: "Tenant", auth: "TENANT_ADMIN", ok: { code: "200", schema: "AuditoriaEvento" } },
  // Notificaciones
  { method: "get", path: "/notifications", operationId: "identity.notifications.list", summary: "Buzón de correos del tenant", tag: "Notificaciones", auth: "TENANT_ADMIN", ok: { code: "200", schema: "Notificacion" } },
  // Admin SaaS
  { method: "get", path: "/admin/tenants", operationId: "identity.admin.tenantsList", summary: "Listar empresas", tag: "Admin", auth: "SUPER_ADMIN", ok: { code: "200", schema: "Tenant" } },
  { method: "post", path: "/admin/tenants", operationId: "identity.admin.tenantsCreate", summary: "Crear empresa", tag: "Admin", auth: "SUPER_ADMIN", body: "CrearTenantBody", ok: { code: "201", schema: "Tenant" } },
  { method: "post", path: "/admin/tenants/{id}/status", operationId: "identity.admin.tenantStatus", summary: "Cambiar estado de empresa", tag: "Admin", auth: "SUPER_ADMIN", body: "EstadoTenantBody", ok: { code: "200", schema: "Tenant" } },
  { method: "patch", path: "/admin/tenants/{id}/modules", operationId: "identity.admin.tenantModules", summary: "Actualizar módulos de empresa", tag: "Admin", auth: "SUPER_ADMIN", body: "ActualizarModulosBody", ok: { code: "200" } },
  { method: "get", path: "/admin/tenants/{id}/notifications", operationId: "identity.admin.tenantNotifications", summary: "Buzón de una empresa", tag: "Admin", auth: "SUPER_ADMIN", ok: { code: "200", schema: "Notificacion" } },
];

function paramsDeRuta(path: string): Schema[] {
  const out: Schema[] = [];
  for (const m of path.matchAll(/\{(\w+)\}/g)) {
    out.push({ name: m[1], in: "path", required: true, schema: { type: "string" } });
  }
  return out;
}

function respuestaOk(op: OpSpec): Schema {
  const content = op.ok.schema
    ? {
        content: {
          "application/json": {
            schema: op.ok.code === "200" && ["Invitacion", "Usuario", "Rol", "Tenant", "Notificacion", "AuditoriaEvento"].includes(op.ok.schema)
              ? arr(ref(op.ok.schema))
              : ref(op.ok.schema),
          },
        },
      }
    : {};
  return { description: "OK", ...content };
}

export function construirOpenApi(): Schema {
  const paths: Record<string, Record<string, Schema>> = {};
  // Orden estable: por ruta y método tal como se declaran.
  for (const op of OPS) {
    const full = `${BASE}${op.path}`;
    paths[full] ??= {};
    const responses: Record<string, Schema> = {
      [op.ok.code]: respuestaOk(op),
      "400": { description: "Solicitud inválida", content: { "application/json": { schema: ref("Error") } } },
      "401": { description: "No autenticado", content: { "application/json": { schema: ref("Error") } } },
      "403": { description: "Prohibido / sin permiso / tenant no operativo", content: { "application/json": { schema: ref("Error") } } },
    };
    paths[full][op.method] = {
      operationId: op.operationId,
      summary: op.summary,
      tags: [op.tag],
      description: `Autorización: ${op.auth}.`,
      ...(paramsDeRuta(op.path).length ? { parameters: paramsDeRuta(op.path) } : {}),
      ...(op.body
        ? { requestBody: { required: true, content: { "application/json": { schema: ref(op.body) } } } }
        : {}),
      responses,
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Identidad, Tenancy y SaaS (DGP-017)",
      version: "1.0.0",
      description:
        "API Enterprise de identidad, multi-tenancy, RBAC como datos, invitaciones, " +
        "recuperación de contraseña, administración de usuarios/empresas, configuración/" +
        "branding/entitlements por tenant y notificaciones por correo. Contract-first.",
    },
    servers: [{ url: "/" }],
    paths,
    components: { schemas },
    tags: [
      { name: "Auth", description: "Autenticación y sesión" },
      { name: "Invitaciones", description: "Invitaciones de usuarios" },
      { name: "Usuarios", description: "Administración de usuarios del tenant" },
      { name: "Roles", description: "Catálogo de roles (RBAC)" },
      { name: "Tenant", description: "Configuración, branding y módulos del tenant" },
      { name: "Notificaciones", description: "Buzón de correos" },
      { name: "Admin", description: "Administración SaaS (super admin)" },
    ],
  };
}

/** Serialización DETERMINISTA (2 espacios + newline final). */
export function serializarOpenApi(): string {
  return JSON.stringify(construirOpenApi(), null, 2) + "\n";
}

/** Lista de operationIds del contrato (para el drift test). */
export const OPERATION_IDS: readonly string[] = OPS.map((o) => o.operationId);
