/**
 * DGP-017 · Operaciones tipadas del contrato de identidad (una por operationId).
 * Cada función es una llamada delgada a `identidadFetch`; NO añaden lógica de
 * negocio. Los cuerpos coinciden exactamente con los esquemas Zod del backend.
 */
import { identidadFetch } from "./api";
import type {
  Sesion,
  Invitacion,
  Usuario,
  RolCatalogo,
  ConfigTenant,
  Branding,
  Notificacion,
  AuditoriaEvento,
  Tenant,
  Rol,
  Modulo,
  EstadoTenant,
} from "./tipos";

/* -------------------------------- Auth ---------------------------------- */

export function login(body: { email: string; password: string; tenantId?: string }): Promise<Sesion> {
  return identidadFetch<Sesion>("/auth/login", { method: "POST", body });
}

export function logout(): Promise<void> {
  return identidadFetch<void>("/auth/logout", { method: "POST" });
}

export function obtenerSesion(signal?: AbortSignal): Promise<Sesion> {
  return identidadFetch<Sesion>("/auth/session", { signal });
}

export function switchTenant(tenantId: string): Promise<Sesion> {
  return identidadFetch<Sesion>("/auth/switch-tenant", { method: "POST", body: { tenantId } });
}

export function cambiarPassword(body: { actual: string; nueva: string }): Promise<void> {
  return identidadFetch<void>("/auth/password/change", { method: "POST", body });
}

export function forgotPassword(body: { email: string; tenantId?: string }): Promise<void> {
  return identidadFetch<void>("/auth/password/forgot", { method: "POST", body });
}

export function resetPassword(body: { tenantId: string; token: string; password: string }): Promise<void> {
  return identidadFetch<void>("/auth/password/reset", { method: "POST", body });
}

/* ----------------------------- Invitaciones ----------------------------- */

export function listarInvitaciones(signal?: AbortSignal): Promise<Invitacion[]> {
  return identidadFetch<Invitacion[]>("/auth/invitations", { signal });
}

export function crearInvitacion(body: { email: string; rol: Rol }): Promise<Invitacion> {
  return identidadFetch<Invitacion>("/auth/invitations", { method: "POST", body });
}

export function reenviarInvitacion(id: string): Promise<Invitacion> {
  return identidadFetch<Invitacion>(`/auth/invitations/${encodeURIComponent(id)}/resend`, { method: "POST" });
}

export function revocarInvitacion(id: string): Promise<void> {
  return identidadFetch<void>(`/auth/invitations/${encodeURIComponent(id)}/revoke`, { method: "POST" });
}

export function aceptarInvitacion(body: {
  tenantId: string;
  token: string;
  nombre: string;
  password: string;
}): Promise<void> {
  return identidadFetch<void>("/auth/invitations/accept", { method: "POST", body });
}

/* ------------------------------- Usuarios ------------------------------- */

export function listarUsuarios(filtro: { q?: string; estado?: string } = {}, signal?: AbortSignal): Promise<Usuario[]> {
  const qs = new URLSearchParams();
  if (filtro.q) qs.set("q", filtro.q);
  if (filtro.estado) qs.set("estado", filtro.estado);
  const query = qs.toString();
  return identidadFetch<Usuario[]>(`/users${query ? `?${query}` : ""}`, { signal });
}

export function crearUsuario(body: { email: string; nombre: string; rol: Rol }): Promise<void> {
  return identidadFetch<void>("/users", { method: "POST", body });
}

export function editarUsuario(id: string, body: { nombre?: string; rol?: Rol }): Promise<void> {
  return identidadFetch<void>(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body });
}

export function activarUsuario(id: string): Promise<void> {
  return identidadFetch<void>(`/users/${encodeURIComponent(id)}/activate`, { method: "POST" });
}

export function desactivarUsuario(id: string): Promise<void> {
  return identidadFetch<void>(`/users/${encodeURIComponent(id)}/deactivate`, { method: "POST" });
}

export function forzarRecuperacion(id: string): Promise<void> {
  return identidadFetch<void>(`/users/${encodeURIComponent(id)}/force-recovery`, { method: "POST" });
}

export function auditoriaUsuario(id: string, signal?: AbortSignal): Promise<AuditoriaEvento[]> {
  return identidadFetch<AuditoriaEvento[]>(`/users/${encodeURIComponent(id)}/audit`, { signal });
}

/* --------------------------------- Roles -------------------------------- */

export function listarRoles(signal?: AbortSignal): Promise<RolCatalogo[]> {
  return identidadFetch<RolCatalogo[]>("/roles", { signal });
}

/* ------------------------------- Tenant --------------------------------- */

export function obtenerConfig(signal?: AbortSignal): Promise<ConfigTenant> {
  return identidadFetch<ConfigTenant>("/tenant/config", { signal });
}

export function actualizarConfig(body: {
  idioma?: string;
  zonaHoraria?: string;
  moneda?: string;
  configuracion?: Record<string, unknown>;
}): Promise<{ configuracion: Record<string, unknown> }> {
  return identidadFetch("/tenant/config", { method: "PATCH", body });
}

export function obtenerBranding(signal?: AbortSignal): Promise<Branding> {
  return identidadFetch<Branding>("/tenant/branding", { signal });
}

export function actualizarBranding(body: Branding): Promise<Branding> {
  return identidadFetch<Branding>("/tenant/branding", { method: "PATCH", body });
}

export function obtenerModulos(signal?: AbortSignal): Promise<{ modulos: Modulo[] }> {
  return identidadFetch<{ modulos: Modulo[] }>("/tenant/modules", { signal });
}

export function auditoriaTenant(signal?: AbortSignal): Promise<AuditoriaEvento[]> {
  return identidadFetch<AuditoriaEvento[]>("/tenant/audit", { signal });
}

/* ---------------------------- Notificaciones ---------------------------- */

export function listarNotificaciones(signal?: AbortSignal): Promise<Notificacion[]> {
  return identidadFetch<Notificacion[]>("/notifications", { signal });
}

/* ------------------------------ Admin SaaS ------------------------------ */

export function listarTenants(signal?: AbortSignal): Promise<Tenant[]> {
  return identidadFetch<Tenant[]>("/admin/tenants", { signal });
}

export function crearTenant(body: {
  tenantId: string;
  codigo: string;
  nombreComercial: string;
  razonSocial?: string;
  idTributaria?: string;
  zonaHoraria?: string;
  idioma?: string;
  moneda?: string;
  modulos?: Modulo[];
  adminEmail?: string;
}): Promise<Tenant> {
  return identidadFetch<Tenant>("/admin/tenants", { method: "POST", body });
}

export function cambiarEstadoTenant(id: string, estado: EstadoTenant): Promise<Tenant> {
  return identidadFetch<Tenant>(`/admin/tenants/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: { estado },
  });
}

export function cambiarModulosTenant(id: string, modulos: Modulo[]): Promise<{ modulos: Modulo[] }> {
  return identidadFetch<{ modulos: Modulo[] }>(`/admin/tenants/${encodeURIComponent(id)}/modules`, {
    method: "PATCH",
    body: { modulos },
  });
}

export function notificacionesTenant(id: string, signal?: AbortSignal): Promise<Notificacion[]> {
  return identidadFetch<Notificacion[]>(`/admin/tenants/${encodeURIComponent(id)}/notifications`, { signal });
}
