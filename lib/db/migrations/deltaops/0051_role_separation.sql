-- DGP-023.5 · FASES 4–6 · Separación de roles PostgreSQL (idempotente).
--
-- CONFIDENCIALIDAD: este archivo NO contiene contraseñas. Las contraseñas de
-- `deltaops_owner` y `deltaops_app` se asignan FUERA de la migración, desde
-- secretos del entorno (Replit Secrets `DELTAOPS_OWNER_PASSWORD` /
-- `DELTAOPS_APP_PASSWORD`), p.ej.:
--
--   psql ... -v owner_pw="$DELTAOPS_OWNER_PASSWORD" -v app_pw="$DELTAOPS_APP_PASSWORD" \
--            -f 0051_role_separation.sql
--   -- y ejecutar manualmente:
--   --   ALTER ROLE deltaops_owner PASSWORD :'owner_pw';
--   --   ALTER ROLE deltaops_app   PASSWORD :'app_pw';
--
-- EJECUCIÓN: las secciones de CREATE ROLE / GRANT ROLE / ALTER … OWNER requieren
-- privilegios de administrador (rol `postgres` / dueño de la base); `deltaops_owner`
-- NO tiene CREATEROLE por diseño. Las secciones GRANT de FASE 5 y ALTER DEFAULT
-- PRIVILEGES pueden ejecutarse como `deltaops_owner`. Este archivo documenta el
-- estado operativo aplicado; es idempotente.
--
-- El rol de runtime `deltaops_app` es de MÍNIMO PRIVILEGIO: NOSUPERUSER,
-- NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION. El DML se hereda del
-- rol NOLOGIN `deltaops_app_rw`. El dueño de los objetos es `deltaops_owner`
-- (tampoco superusuario ni bypass).

-- FASE 4 — Roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='deltaops_owner') THEN
    CREATE ROLE deltaops_owner LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='deltaops_app_rw') THEN
    CREATE ROLE deltaops_app_rw NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='deltaops_app') THEN
    CREATE ROLE deltaops_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END$$;

GRANT deltaops_app_rw TO deltaops_app;

-- FASE 6 — Ownership (esquema + tablas + secuencias autónomas + vistas + funciones)
ALTER SCHEMA deltaops OWNER TO deltaops_owner;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relkind, n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='deltaops' AND c.relkind IN ('r','p','v','m')
  LOOP
    IF r.relkind IN ('r','p') THEN
      EXECUTE format('ALTER TABLE %I.%I OWNER TO deltaops_owner', r.nspname, r.relname);
    ELSE
      EXECUTE format('ALTER %s %I.%I OWNER TO deltaops_owner',
        CASE WHEN r.relkind='m' THEN 'MATERIALIZED VIEW' ELSE 'VIEW' END, r.nspname, r.relname);
    END IF;
  END LOOP;
  -- Secuencias autónomas (las ligadas a columnas serial siguen a su tabla).
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='deltaops' AND c.relkind='S'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype IN ('a','i'))
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO deltaops_owner', r.nspname, r.relname);
  END LOOP;
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='deltaops'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO deltaops_owner', r.sig);
  END LOOP;
END$$;

-- FASE 5 — Privilegios mínimos (ejecutar como owner o superusuario)
GRANT USAGE ON SCHEMA deltaops TO deltaops_app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA deltaops TO deltaops_app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA deltaops TO deltaops_app_rw;

-- N-1: EXECUTE de la función SECURITY DEFINER sólo para el rol de aplicación.
REVOKE ALL ON FUNCTION deltaops.tenants_para_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deltaops.tenants_para_super_admin() TO deltaops_app_rw;

-- DEFAULT PRIVILEGES para objetos futuros creados por el owner.
ALTER DEFAULT PRIVILEGES FOR ROLE deltaops_owner IN SCHEMA deltaops
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO deltaops_app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE deltaops_owner IN SCHEMA deltaops
  GRANT USAGE, SELECT ON SEQUENCES TO deltaops_app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE deltaops_owner IN SCHEMA deltaops
  GRANT EXECUTE ON FUNCTIONS TO deltaops_app_rw;

-- CONNECT a la base (ejecutar como el dueño de la base / admin).
-- GRANT CONNECT ON DATABASE heliumdb TO deltaops_app, deltaops_app_rw;

-- ROLLBACK (granular, sin superusuario permanente):
--   REVOKE ... ; ALTER ... OWNER TO postgres ; DROP ROLE deltaops_app, deltaops_app_rw, deltaops_owner;
