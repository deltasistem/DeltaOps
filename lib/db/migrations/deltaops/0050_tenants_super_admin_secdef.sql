-- DeltaOps · DGP-023.5 · Migración 0050 — N-1: listado cross-tenant de tenants
--
-- Problema (DGP-023.4 §I1): `listarTenants` leía `deltaops.ten_tenants` (RLS=ON)
-- bajo `withGlobal` (sin contexto), confiando en el BYPASS de superusuario. Bajo
-- el rol runtime `deltaops_app` (no-superusuario, no-owner, no-bypass) devolvería
-- 0 filas y rompería la consola SUPER_ADMIN.
--
-- Solución de MENOR PRIVILEGIO (diseño B de DGP-023.4): función SECURITY DEFINER
-- acotada, propiedad de `deltaops_owner`, que devuelve la lista completa de tenants.
--
-- RIGOR (obligatorio para SECURITY DEFINER):
--   * OWNER = deltaops_owner (dueño del esquema/tablas ⇒ exento de RLS ENABLE-only).
--   * search_path FIJO (deltaops, pg_temp) — sin resolución dinámica.
--   * SIN SQL dinámico, SIN parámetros (no acepta tenantId del frontend).
--   * SOLO SELECT de las columnas del catálogo de tenants.
--   * EXECUTE revocado a public y concedido SOLO a deltaops_app_rw.
--
-- IMPORTANTE (FASE 10): `ten_tenants` debe permanecer con RLS en modo ENABLE (NO
-- FORCE). Con FORCE, incluso el owner queda sujeto a RLS y esta función devolvería
-- 0 filas. Verificado empíricamente en el smoke test de FASE 3.
--
-- La autorización efectiva (SOLO SUPER_ADMIN) vive en la capa HTTP
-- (`requireSuperAdmin` en identity.ts). Esta función NO decide autorización: solo
-- provee el acceso de datos cross-tenant que el guard ya restringió.

CREATE OR REPLACE FUNCTION deltaops.tenants_para_super_admin()
  RETURNS SETOF deltaops.ten_tenants
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = deltaops, pg_temp
AS $$
  SELECT * FROM deltaops.ten_tenants ORDER BY codigo
$$;

-- Owner y privilegios: se aplican en la ventana de roles productivos (FASE 6/7).
-- Descomentar/ejecutar como parte del despliegue de roles:
--   ALTER FUNCTION deltaops.tenants_para_super_admin() OWNER TO deltaops_owner;
--   REVOKE EXECUTE ON FUNCTION deltaops.tenants_para_super_admin() FROM public;
--   GRANT EXECUTE ON FUNCTION deltaops.tenants_para_super_admin() TO deltaops_app_rw;
