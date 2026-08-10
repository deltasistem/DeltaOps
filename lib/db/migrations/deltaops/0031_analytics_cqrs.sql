-- DGP-016 · Módulo Enterprise Analytics & KPI Platform — CQRS (read models).
-- Proyecciones de SÓLO LECTURA reconstruibles por REPLAY de an_eventos. TODAS
-- las consultas del módulo se sirven de estas tablas (nunca de las de escritura;
-- lección 009.2: el detalle también). Idempotencia de proyección por
-- (tenant_id, id) + guarda (last_event_id, version): un evento re-aplicado no
-- retrocede el estado. ADITIVA; RLS por tenant en lecturas y escrituras. 100%
-- idempotente.

-- Read model de definiciones de indicador.
CREATE TABLE IF NOT EXISTS deltaops.an_definiciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  clave text NOT NULL,
  nombre text NOT NULL,
  categoria text NOT NULL,
  fuente_modulo text NOT NULL,
  fuente_dataset text NOT NULL,
  habilitado boolean NOT NULL DEFAULT true,
  del_sistema boolean NOT NULL DEFAULT false,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 0,
  last_event_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_definiciones_read_clave ON deltaops.an_definiciones_read (tenant_id, lower(clave));
CREATE INDEX IF NOT EXISTS idx_an_definiciones_read_categoria ON deltaops.an_definiciones_read (tenant_id, categoria);
CREATE INDEX IF NOT EXISTS idx_an_definiciones_read_sistema ON deltaops.an_definiciones_read (tenant_id, del_sistema, habilitado);

-- Read model de dashboards.
CREATE TABLE IF NOT EXISTS deltaops.an_dashboards_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  clave text NOT NULL,
  nombre text NOT NULL,
  del_sistema boolean NOT NULL DEFAULT false,
  propietario_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 0,
  last_event_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_dashboards_read_clave ON deltaops.an_dashboards_read (tenant_id, lower(clave));
CREATE INDEX IF NOT EXISTS idx_an_dashboards_read_sistema ON deltaops.an_dashboards_read (tenant_id, del_sistema);
CREATE INDEX IF NOT EXISTS idx_an_dashboards_read_propietario ON deltaops.an_dashboards_read (tenant_id, propietario_id);

-- Read model de snapshots (append-only; idempotente por clave_snapshot).
CREATE TABLE IF NOT EXISTS deltaops.an_snapshots_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  clave_snapshot text NOT NULL,
  target text NOT NULL,
  target_clave text NOT NULL,
  valor numeric,
  muestras integer,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluado_en timestamptz NOT NULL,
  last_event_id text NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_snapshots_read_clave ON deltaops.an_snapshots_read (tenant_id, clave_snapshot);
CREATE INDEX IF NOT EXISTS idx_an_snapshots_read_target ON deltaops.an_snapshots_read (tenant_id, target, target_clave, evaluado_en DESC);

-- RLS por tenant (app.tenant_id) en lecturas y escrituras (lección 004).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'an_definiciones_read','an_dashboards_read','an_snapshots_read'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
