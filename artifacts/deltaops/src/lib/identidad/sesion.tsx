/**
 * DGP-017 · Contexto de sesión de identidad (fuente de verdad del cliente).
 *
 * Carga `GET /auth/session` con React Query, expone la sesión, el rol, las
 * capacidades de presentación y los módulos habilitados, y ofrece:
 *  - `cerrarSesion()`  → logout + limpieza total de estado local.
 *  - `cambiarEmpresa(tenantId)` → switch-tenant SEGURO: renueva el contexto de
 *    autorización, INVALIDA todo el estado local (React Query cache clear y
 *    guarda offline por tenant) y nunca reutiliza permisos/colas del tenant
 *    anterior.
 *
 * El backend es la autoridad: 401/403 aquí son datos que el AppShell interpreta.
 */
import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { obtenerSesion, logout as apiLogout, switchTenant } from "./endpoints";
import { IdentidadError } from "./api";
import { capacidadesDe, type Capacidades } from "./rbac";
import { guardarTenantActivo, purgarColasDeOtrosTenants } from "./guardas-offline";
import type { Sesion } from "./tipos";

export const CLAVE_SESION = ["identidad", "sesion"] as const;

interface SesionCtx {
  readonly sesion: Sesion | null;
  readonly cargando: boolean;
  /** Error de carga de sesión (401 = no autenticado). */
  readonly error: IdentidadError | null;
  readonly capacidades: Capacidades;
  cerrarSesion: () => Promise<void>;
  cambiarEmpresa: (tenantId: string) => Promise<void>;
  recargar: () => Promise<void>;
}

const Ctx = createContext<SesionCtx | null>(null);

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const consulta = useQuery<Sesion, IdentidadError>({
    queryKey: CLAVE_SESION,
    queryFn: ({ signal }) => obtenerSesion(signal),
    retry: false,
    staleTime: 30_000,
  });

  const sesion = consulta.data ?? null;

  // Persistir el tenant activo y purgar colas offline de tenants ajenos: una
  // cola de otro tenant nunca debe reutilizarse en el contexto actual.
  React.useEffect(() => {
    if (sesion) {
      guardarTenantActivo(sesion.tenant.id, sesion.identityId);
      purgarColasDeOtrosTenants(sesion.tenant.id);
    }
  }, [sesion?.tenant.id, sesion?.identityId]);

  const cerrarSesion = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Limpieza total: ningún dato del usuario/tenant sobrevive al logout.
      qc.clear();
    }
  }, [qc]);

  const cambiarEmpresa = useCallback(
    async (tenantId: string) => {
      const nueva = await switchTenant(tenantId);
      // INVALIDAR todo el estado local: el contexto de autorización cambió.
      qc.clear();
      // Sembrar la nueva sesión para evitar un parpadeo a "no autenticado".
      qc.setQueryData(CLAVE_SESION, nueva);
      guardarTenantActivo(nueva.tenant.id, nueva.identityId);
      purgarColasDeOtrosTenants(nueva.tenant.id);
    },
    [qc],
  );

  const recargar = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: CLAVE_SESION });
  }, [qc]);

  const valor = useMemo<SesionCtx>(
    () => ({
      sesion,
      cargando: consulta.isLoading,
      error: (consulta.error as IdentidadError) ?? null,
      capacidades: sesion ? capacidadesDe(sesion) : capacidadesDe({ rol: "CONSULTA" }),
      cerrarSesion,
      cambiarEmpresa,
      recargar,
    }),
    [sesion, consulta.isLoading, consulta.error, cerrarSesion, cambiarEmpresa, recargar],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): SesionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <SesionProvider>");
  return ctx;
}

/** Acceso a la sesión ya garantizada (dentro del AppShell autenticado). */
export function useSesionActiva(): Sesion {
  const { sesion } = useSesion();
  if (!sesion) throw new Error("No hay sesión activa");
  return sesion;
}
