/**
 * DeltaOps · DGP-017 — Contratos Zod de Identidad, Tenancy y SaaS.
 *
 * Contract-First: cada payload de entrada/salida se valida con Zod. Estos
 * esquemas se definen aquí (co-locados, additivos) y NO en el archivo generado
 * por orval (`@workspace/api-zod`, "Do not edit manually"). El export de OpenAPI
 * determinista se deriva de estos esquemas en `openapi.ts` con drift test.
 */
import { z } from "zod";
import { ROLES_CANONICOS } from "./rbac";
import { MODULOS_CONOCIDOS } from "./entitlements";

const RolEnum = z.enum(ROLES_CANONICOS);
const ModuloEnum = z.enum(MODULOS_CONOCIDOS);

/* --------------------------------- Auth ----------------------------------- */

export const LoginBody = z.object({
  email: z.string().min(1).max(255),
  password: z.string().min(1).max(200),
  tenantId: z.string().min(1).max(64).optional(),
});

export const SwitchTenantBody = z.object({
  tenantId: z.string().min(1).max(64),
});

export const ForgotPasswordBody = z.object({
  email: z.string().min(1).max(255),
  tenantId: z.string().min(1).max(64).optional(),
});

export const ResetPasswordBody = z.object({
  tenantId: z.string().min(1).max(64),
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export const ChangePasswordBody = z.object({
  actual: z.string().min(1).max(200),
  nueva: z.string().min(8).max(200),
});

export const SessionResponse = z.object({
  identityId: z.string(),
  email: z.string(),
  nombre: z.string(),
  tenant: z.object({
    id: z.string(),
    codigo: z.string(),
    nombre: z.string(),
    estado: z.string(),
    idioma: z.string(),
    zonaHoraria: z.string(),
    moneda: z.string(),
    branding: z.record(z.string(), z.unknown()),
  }),
  rol: RolEnum,
  capacidades: z.array(z.string()),
  permisos: z.array(z.string()),
  modulos: z.array(ModuloEnum),
  membresias: z.array(
    z.object({ tenantId: z.string(), nombre: z.string(), rol: z.string() }),
  ),
});

/* ------------------------------ Invitaciones ------------------------------ */

export const CrearInvitacionBody = z.object({
  email: z.string().min(1).max(255),
  rol: RolEnum,
});

export const AceptarInvitacionBody = z.object({
  tenantId: z.string().min(1).max(64),
  token: z.string().min(1),
  nombre: z.string().min(1).max(255),
  password: z.string().min(8).max(200),
});

/* --------------------------------- Users ---------------------------------- */

export const CrearUsuarioBody = z.object({
  email: z.string().min(1).max(255),
  nombre: z.string().min(1).max(255),
  rol: RolEnum,
});

export const EditarUsuarioBody = z.object({
  nombre: z.string().min(1).max(255).optional(),
  rol: RolEnum.optional(),
});

/* ------------------------------- Tenant admin ----------------------------- */

export const ActualizarConfigBody = z.object({
  idioma: z.string().max(8).optional(),
  zonaHoraria: z.string().max(64).optional(),
  moneda: z.string().max(8).optional(),
  formatoFecha: z.string().max(32).optional(),
  formatoNumerico: z.string().max(32).optional(),
  notificaciones: z.record(z.string(), z.unknown()).optional(),
  politicasSeguridad: z.record(z.string(), z.unknown()).optional(),
});

/** Branding con tokens SEGUROS (sin CSS arbitrario). */
export const ActualizarBrandingBody = z.object({
  nombre: z.string().max(120).optional(),
  nombreApp: z.string().max(120).optional(),
  logoUrl: z.string().url().max(2048).optional(),
  logoAltUrl: z.string().url().max(2048).optional(),
  faviconUrl: z.string().url().max(2048).optional(),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  colorSecundario: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const ActualizarModulosBody = z.object({
  modulos: z.array(ModuloEnum),
});

/* ------------------------------ Super admin ------------------------------- */

export const CrearTenantBody = z.object({
  tenantId: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  codigo: z.string().min(1).max(64),
  nombreComercial: z.string().min(1).max(255),
  razonSocial: z.string().max(255).optional(),
  idTributaria: z.string().max(64).optional(),
  zonaHoraria: z.string().max(64).optional(),
  idioma: z.string().max(8).optional(),
  moneda: z.string().max(8).optional(),
  modulos: z.array(ModuloEnum).optional(),
  adminEmail: z.string().min(1).max(255).optional(),
  adminNombre: z.string().max(255).optional(),
});

export const EstadoTenantBody = z.object({
  estado: z.enum(["ACTIVO", "SUSPENDIDO", "INACTIVO"]),
});
