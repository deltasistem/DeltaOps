/**
 * DGP-017 · Hooks de datos de identidad sobre React Query. Sólo lectura de
 * listados; las mutaciones invalidan las claves afectadas. Errores honestos.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "./endpoints";
import type { IdentidadError } from "./api";
import type { Rol, Modulo, EstadoTenant } from "./tipos";

export const K = {
  usuarios: (f: { q?: string; estado?: string }) => ["identidad", "usuarios", f] as const,
  invitaciones: ["identidad", "invitaciones"] as const,
  roles: ["identidad", "roles"] as const,
  config: ["identidad", "config"] as const,
  branding: ["identidad", "branding"] as const,
  modulos: ["identidad", "modulos"] as const,
  auditoriaTenant: ["identidad", "auditoria", "tenant"] as const,
  auditoriaUsuario: (id: string) => ["identidad", "auditoria", "usuario", id] as const,
  notificaciones: ["identidad", "notificaciones"] as const,
  tenants: ["identidad", "admin", "tenants"] as const,
  tenantNotif: (id: string) => ["identidad", "admin", "tenant-notif", id] as const,
};

/* ------------------------------- Consultas ------------------------------ */

export function useUsuarios(filtro: { q?: string; estado?: string }) {
  return useQuery({ queryKey: K.usuarios(filtro), queryFn: ({ signal }) => api.listarUsuarios(filtro, signal), retry: false });
}
export function useInvitaciones(habilitado = true) {
  return useQuery({ queryKey: K.invitaciones, queryFn: ({ signal }) => api.listarInvitaciones(signal), enabled: habilitado, retry: false });
}
export function useRoles() {
  return useQuery({ queryKey: K.roles, queryFn: ({ signal }) => api.listarRoles(signal), retry: false, staleTime: 300_000 });
}
export function useConfig(habilitado = true) {
  return useQuery({ queryKey: K.config, queryFn: ({ signal }) => api.obtenerConfig(signal), enabled: habilitado, retry: false });
}
export function useBrandingTenant(habilitado = true) {
  return useQuery({ queryKey: K.branding, queryFn: ({ signal }) => api.obtenerBranding(signal), enabled: habilitado, retry: false });
}
export function useModulos(habilitado = true) {
  return useQuery({ queryKey: K.modulos, queryFn: ({ signal }) => api.obtenerModulos(signal), enabled: habilitado, retry: false });
}
export function useAuditoriaTenant(habilitado = true) {
  return useQuery({ queryKey: K.auditoriaTenant, queryFn: ({ signal }) => api.auditoriaTenant(signal), enabled: habilitado, retry: false });
}
export function useAuditoriaUsuario(id: string | null) {
  return useQuery({ queryKey: K.auditoriaUsuario(id ?? ""), queryFn: ({ signal }) => api.auditoriaUsuario(id!, signal), enabled: Boolean(id), retry: false });
}
export function useNotificaciones(habilitado = true) {
  return useQuery({ queryKey: K.notificaciones, queryFn: ({ signal }) => api.listarNotificaciones(signal), enabled: habilitado, retry: false });
}
export function useTenants(habilitado = true) {
  return useQuery({ queryKey: K.tenants, queryFn: ({ signal }) => api.listarTenants(signal), enabled: habilitado, retry: false });
}
export function useTenantNotificaciones(id: string | null) {
  return useQuery({ queryKey: K.tenantNotif(id ?? ""), queryFn: ({ signal }) => api.notificacionesTenant(id!, signal), enabled: Boolean(id), retry: false });
}

/* ------------------------------- Mutaciones ----------------------------- */

export function useMutacionesUsuarios() {
  const qc = useQueryClient();
  const inval = () => {
    void qc.invalidateQueries({ queryKey: ["identidad", "usuarios"] });
    void qc.invalidateQueries({ queryKey: K.invitaciones });
  };
  return {
    crear: useMutation<void, IdentidadError, { email: string; nombre: string; rol: Rol }>({ mutationFn: api.crearUsuario, onSuccess: inval }),
    editar: useMutation<void, IdentidadError, { id: string; nombre?: string; rol?: Rol }>({
      mutationFn: ({ id, ...body }) => api.editarUsuario(id, body),
      onSuccess: inval,
    }),
    activar: useMutation<void, IdentidadError, string>({ mutationFn: api.activarUsuario, onSuccess: inval }),
    desactivar: useMutation<void, IdentidadError, string>({ mutationFn: api.desactivarUsuario, onSuccess: inval }),
    forzarRecuperacion: useMutation<void, IdentidadError, string>({ mutationFn: api.forzarRecuperacion }),
    invitar: useMutation<unknown, IdentidadError, { email: string; rol: Rol }>({ mutationFn: api.crearInvitacion, onSuccess: inval }),
    reenviar: useMutation<unknown, IdentidadError, string>({ mutationFn: api.reenviarInvitacion, onSuccess: inval }),
    revocar: useMutation<void, IdentidadError, string>({ mutationFn: api.revocarInvitacion, onSuccess: inval }),
  };
}

export function useMutacionesTenant() {
  const qc = useQueryClient();
  return {
    guardarConfig: useMutation({
      mutationFn: api.actualizarConfig,
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: K.config });
      },
    }),
    guardarBranding: useMutation({
      mutationFn: api.actualizarBranding,
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: K.branding });
      },
    }),
  };
}

export function useMutacionesSaaS() {
  const qc = useQueryClient();
  const inval = () => void qc.invalidateQueries({ queryKey: K.tenants });
  return {
    crear: useMutation({ mutationFn: api.crearTenant, onSuccess: inval }),
    estado: useMutation<unknown, IdentidadError, { id: string; estado: EstadoTenant }>({
      mutationFn: ({ id, estado }) => api.cambiarEstadoTenant(id, estado),
      onSuccess: inval,
    }),
    modulos: useMutation<unknown, IdentidadError, { id: string; modulos: Modulo[] }>({
      mutationFn: ({ id, modulos }) => api.cambiarModulosTenant(id, modulos),
      onSuccess: inval,
    }),
  };
}
