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

/**
 * Descarta TODO el estado de React Query EXCEPTO la consulta de sesión. Se usa
 * al iniciar/cerrar sesión y al cambiar de empresa: hay que invalidar los datos
 * derivados del usuario/tenant anterior SIN romper la suscripción del observador
 * de sesión. `qc.clear()` NO sirve para esto: destruye también la sesión y deja
 * al observador sin recibir el `setQueryData` posterior (datos stale). Por eso
 * se siembra primero la sesión y luego se elimina el resto por predicado.
 */
export function purgarCacheExceptoSesion(qc: ReturnType<typeof useQueryClient>) {
  qc.removeQueries({
    predicate: (q) => !(q.queryKey[0] === CLAVE_SESION[0] && q.queryKey[1] === CLAVE_SESION[1]),
  });
}

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
      // Cancelar cualquier consulta de sesión en vuelo para que NO reescriba el
      // estado tras el logout (evita una carrera con un refetch en segundo plano).
      await qc.cancelQueries({ queryKey: CLAVE_SESION });
      // Fijar la sesión a "no autenticada" (null) para que TODO consumidor
      // montado reaccione al instante y aterrice en /login, SIN romper la
      // suscripción del observador (por eso no se usa qc.clear()).
      qc.setQueryData<Sesion | null>(CLAVE_SESION, null);
      // Descartar el resto del estado: ningún dato del usuario/tenant sobrevive.
      purgarCacheExceptoSesion(qc);
    }
  }, [qc]);

  const cambiarEmpresa = useCallback(
    async (tenantId: string) => {
      const nueva = await switchTenant(tenantId);
      await qc.cancelQueries({ queryKey: CLAVE_SESION });
      // Sembrar la nueva sesión PRIMERO (evita parpadeo a "no autenticado" y
      // mantiene la suscripción del observador) y luego invalidar el resto del
      // estado local: el contexto de autorización cambió.
      qc.setQueryData(CLAVE_SESION, nueva);
      purgarCacheExceptoSesion(qc);
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
