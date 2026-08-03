-- DeltaOps · DGP-003 · Migración 0004 — Shared Platform Services
-- Persistencia genérica multitenant de la plataforma:
--   platform_records : registros versionados con borrado lógico
--   platform_audit   : auditoría transversal de servicios
-- Mantiene RLS (aislamiento por tenant vía app.tenant_id), auditoría,
-- versionado (concurrencia optimista) y compatibilidad con el outbox DGP-002.

CREATE TABLE IF NOT EXISTS deltaops.platform_records (
  id           text NOT NULL,
  tenant_id    text NOT NULL,
  service      text NOT NULL,
  record_type  text NOT NULL,
  status       text NOT NULL,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  version      integer NOT NULL DEFAULT 1,
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_platform_records_lookup
  ON deltaops.platform_records (tenant_id, service, record_type, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS deltaops.platform_audit (
  id             uuid PRIMARY KEY,
  tenant_id      text NOT NULL,
  service        text NOT NULL,
  action         text NOT NULL,
  actor_id       text NOT NULL,
  subject_id     text,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_lookup
  ON deltaops.platform_audit (tenant_id, service, occurred_at DESC);

-- RLS: aislamiento por tenant. La aplicación fija app.tenant_id por sesión.
-- (El rol propietario puede tener BYPASSRLS; las políticas protegen a los
-- roles de aplicación sin privilegios.)
ALTER TABLE deltaops.platform_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.platform_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_records_tenant_isolation ON deltaops.platform_records;
CREATE POLICY platform_records_tenant_isolation ON deltaops.platform_records
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS platform_audit_tenant_isolation ON deltaops.platform_audit;
CREATE POLICY platform_audit_tenant_isolation ON deltaops.platform_audit
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
