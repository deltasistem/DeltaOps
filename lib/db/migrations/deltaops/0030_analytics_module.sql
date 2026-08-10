-- DGP-016 · Módulo Enterprise Analytics & KPI Platform — Persistencia base.
-- Tablas PROPIAS del módulo (prefijo an_), NUNCA Record Store (reservado a
-- catálogos). SOLO LECTURA sobre datos ajenos: el módulo únicamente PERSISTE su
-- propia configuración (definiciones de indicador, dashboards) y los snapshots
-- de evaluación (offline). Aggregates versionados optimistamente (columna
-- `version`); el estado completo vive en `datos` (JSONB, fuente de
-- reconstrucción) y las columnas planas son sólo para filtrar/indexar. ADITIVA;
-- RLS por tenant con app.tenant_id (set_config transaccional) como 0027
-- (lección 004: RLS en LECTURAS y ESCRITURAS). 100% idempotente.

-- ===========================================================================
-- 1) Aggregates (fuente de verdad de escritura).
-- ===========================================================================

-- Definición DECLARATIVA de indicador (aggregate raíz; versionado inmutable).
CREATE TABLE IF NOT EXISTS deltaops.an_definiciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  clave text NOT NULL,
  nombre text NOT NULL,
  categoria text NOT NULL,
  fuente_modulo text NOT NULL,
  fuente_dataset text NOT NULL,
  unidad text NOT NULL,
  formato text NOT NULL,
  habilitado boolean NOT NULL DEFAULT true,
  del_sistema boolean NOT NULL DEFAULT false,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_definiciones_clave ON deltaops.an_definiciones (tenant_id, lower(clave));
CREATE INDEX IF NOT EXISTS idx_an_definiciones_categoria ON deltaops.an_definiciones (tenant_id, categoria);
CREATE INDEX IF NOT EXISTS idx_an_definiciones_sistema ON deltaops.an_definiciones (tenant_id, del_sistema, habilitado);

-- Dashboard DECLARATIVO (lista ordenada de widgets; del sistema o personalizado).
CREATE TABLE IF NOT EXISTS deltaops.an_dashboards (
  tenant_id text NOT NULL,
  id text NOT NULL,
  clave text NOT NULL,
  nombre text NOT NULL,
  del_sistema boolean NOT NULL DEFAULT false,
  propietario_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_dashboards_clave ON deltaops.an_dashboards (tenant_id, lower(clave));
CREATE INDEX IF NOT EXISTS idx_an_dashboards_sistema ON deltaops.an_dashboards (tenant_id, del_sistema);
CREATE INDEX IF NOT EXISTS idx_an_dashboards_propietario ON deltaops.an_dashboards (tenant_id, propietario_id);

-- Snapshot de evaluación (offline). Idempotente por clave_snapshot (determinista).
CREATE TABLE IF NOT EXISTS deltaops.an_snapshots (
  tenant_id text NOT NULL,
  id text NOT NULL,
  clave_snapshot text NOT NULL,
  target text NOT NULL,
  target_clave text NOT NULL,
  valor numeric,
  muestras integer,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluado_en timestamptz NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_an_snapshots_clave ON deltaops.an_snapshots (tenant_id, clave_snapshot);
CREATE INDEX IF NOT EXISTS idx_an_snapshots_target ON deltaops.an_snapshots (tenant_id, target, target_clave, evaluado_en DESC);

-- ===========================================================================
-- 2) Recibos durables de sincronización offline (reclamación durable de opId).
--    Protocolo claim → ejecutar → finalize/release (lección 008.1).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.an_sync_receipts (
  tenant_id text NOT NULL,
  op_id text NOT NULL,
  cliente_id text,
  comando text NOT NULL,
  estado text NOT NULL DEFAULT 'aplicada',
  resultado jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, op_id)
);

-- ===========================================================================
-- 3) Bitácora de eventos durable (event log canónico), fuente del REPLAY.
--    Se escribe en la MISMA UoW que emite el evento, con el MISMO event.id que
--    el outbox del Kernel (el outbox NO es event store — lección 008.2).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.an_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_an_eventos_stream ON deltaops.an_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id): LECTURAS y ESCRITURAS por igual (lección 004).
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'an_definiciones','an_dashboards','an_snapshots','an_sync_receipts','an_eventos'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
