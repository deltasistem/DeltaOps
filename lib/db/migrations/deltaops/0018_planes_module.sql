-- DGP-012.2 · Módulo Enterprise Maintenance Plans — Persistencia base (aggregates).
-- Tablas PROPIAS del módulo (prefijo pln_), NUNCA Record Store (reservado a
-- catálogos). Aggregates versionados optimistamente (columna `version`); el
-- estado completo vive en `datos` (JSONB, fuente de reconstrucción) y las
-- columnas planas son sólo para filtrar/indexar. ADITIVA; RLS por tenant con
-- app.tenant_id (set_config transaccional) como 0014 (lección 004: RLS en
-- LECTURAS y ESCRITURAS). 100% idempotente.

-- ===========================================================================
-- 1) Aggregates (fuente de verdad de escritura).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.pln_planes (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  estado text NOT NULL,
  tipo_plan text NOT NULL,
  estrategia text NOT NULL,
  prioridad text NOT NULL,
  version_activa integer NOT NULL DEFAULT 0,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pln_planes_codigo ON deltaops.pln_planes (tenant_id, lower(codigo));
CREATE INDEX IF NOT EXISTS idx_pln_planes_estado ON deltaops.pln_planes (tenant_id, estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pln_planes_tipo ON deltaops.pln_planes (tenant_id, tipo_plan);

CREATE TABLE IF NOT EXISTS deltaops.pln_calendarios (
  tenant_id text NOT NULL,
  id text NOT NULL,
  tipo text NOT NULL,
  ambito text NOT NULL,
  nombre text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pln_calendarios_tipo ON deltaops.pln_calendarios (tenant_id, tipo);

-- Generaciones DECIDIDAS con dedup determinista (planId+version+ocurrencia).
-- La CLAVE de dedup es ÚNICA por tenant ⇒ NUNCA se duplica una OT aunque se
-- reevalúe (lección 009.3). `orden_trabajo_id` referencia la OT real creada por
-- ORQUESTACIÓN (composición de comandos oficiales de module-ordenes).
CREATE TABLE IF NOT EXISTS deltaops.pln_generaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  plan_id text NOT NULL,
  version integer NOT NULL,
  activo_id text NOT NULL,
  ocurrencia text NOT NULL,
  clave_dedup text NOT NULL,
  origen text NOT NULL,
  fecha_objetivo timestamptz NOT NULL,
  orden_trabajo_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  generada_por text NOT NULL,
  generada_en timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pln_generaciones_dedup ON deltaops.pln_generaciones (tenant_id, clave_dedup);
CREATE INDEX IF NOT EXISTS idx_pln_generaciones_plan ON deltaops.pln_generaciones (tenant_id, plan_id, generada_en);
CREATE INDEX IF NOT EXISTS idx_pln_generaciones_orden ON deltaops.pln_generaciones (tenant_id, orden_trabajo_id);

CREATE TABLE IF NOT EXISTS deltaops.pln_historial (
  tenant_id text NOT NULL,
  id text NOT NULL,
  plan_id text NOT NULL,
  hito text NOT NULL,
  version integer NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocurrido_en timestamptz NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pln_historial_plan ON deltaops.pln_historial (tenant_id, plan_id, ocurrido_en);

-- ===========================================================================
-- 2) Recibos durables de sincronización offline (reclamación durable de opId).
--    Protocolo claim → ejecutar → finalize/release (lección 008.1).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.pln_sync_receipts (
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
CREATE TABLE IF NOT EXISTS deltaops.pln_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_pln_eventos_stream ON deltaops.pln_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id): LECTURAS y ESCRITURAS por igual (lección 004).
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'pln_planes','pln_calendarios','pln_generaciones','pln_historial',
    'pln_sync_receipts','pln_eventos'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
