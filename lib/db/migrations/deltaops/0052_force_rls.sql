-- DGP-023.5 · FASE 10 · Activación de FORCE ROW LEVEL SECURITY (idempotente).
--
-- Aplica FORCE ROW LEVEL SECURITY a las tablas tenant-scoped que YA tienen RLS
-- habilitada, una política y columna `tenant_id`, EXCLUYENDO:
--   * `ten_tenants` — debe permanecer en ENABLE (no FORCE) para que la función
--     SECURITY DEFINER `deltaops.tenants_para_super_admin()` (N-1), propiedad de
--     `deltaops_owner`, pueda devolver TODOS los tenants (FORCE sujeta también al
--     owner a la política). Hallazgo verificado en el smoke test de DGP-023.5.
--   * Las 7 tablas GLOBALES sin RLS (decisión de DGP-023.4 §I4): idn_identities,
--     idn_memberships, kernel_dead_letter, kernel_outbox, ntf_email_templates,
--     sessions, users — protegidas por GRANT + scoping en capa de aplicación.
--
-- Resultado esperado: 166 tablas con relforcerowsecurity=true.

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace nsp ON nsp.oid=c.relnamespace
    WHERE nsp.nspname='deltaops' AND c.relkind='r' AND c.relrowsecurity
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema='deltaops' AND col.table_name=c.relname AND col.column_name='tenant_id'
      )
      AND c.relname <> 'ten_tenants'
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE deltaops.%I FORCE ROW LEVEL SECURITY', r.relname);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'FORCE ROW LEVEL SECURITY aplicado a % tablas', n;
END$$;

-- ROLLBACK granular (por tabla, nunca desactivar RLS ni volver a superusuario):
--   ALTER TABLE deltaops.<tabla> NO FORCE ROW LEVEL SECURITY;
