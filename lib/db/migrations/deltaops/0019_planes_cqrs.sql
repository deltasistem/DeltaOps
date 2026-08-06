-- DGP-012.2 · Módulo Enterprise Maintenance Plans — CQRS: Read Models.
-- TODA consulta del módulo se sirve EXCLUSIVAMENTE desde estos read models
-- (incluido el DETALLE — lección 009.2), proyectados SOLO desde el payload de
-- eventos autosuficientes, idempotentes por (last_event_id, version). ADITIVA
-- sobre 0018; RLS por tenant (lecturas y escrituras). Idempotente.

-- 1) LISTADO/DETALLE de planes (sirve `plan` y `planes`).
CREATE TABLE IF NOT EXISTS deltaops.pln_planes_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  estado text NOT NULL,
  tipo_plan text NOT NULL,
  estrategia text NOT NULL,
  prioridad text NOT NULL,
  version_activa integer NOT NULL DEFAULT 0,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pln_planes_read_estado ON deltaops.pln_planes_read (tenant_id, estado, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS idx_pln_planes_read_tipo ON deltaops.pln_planes_read (tenant_id, tipo_plan);

-- 2) CALENDARIOS operacionales (sirve `calendario` y `calendarios`).
CREATE TABLE IF NOT EXISTS deltaops.pln_calendarios_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  tipo text NOT NULL,
  ambito text NOT NULL,
  nombre text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pln_calendarios_read_tipo ON deltaops.pln_calendarios_read (tenant_id, tipo);

-- 3) GENERACIONES decididas (sirve `generaciones`). Append-only por event_id
--    con proyección idempotente; clave de dedup ÚNICA por tenant.
CREATE TABLE IF NOT EXISTS deltaops.pln_generaciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  plan_id text NOT NULL,
  version integer NOT NULL,
  activo_id text NOT NULL,
  ocurrencia text NOT NULL,
  clave_dedup text NOT NULL,
  origen text NOT NULL,
  orden_trabajo_id text,
  fecha_objetivo timestamptz NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_id text NOT NULL,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pln_generaciones_read_dedup ON deltaops.pln_generaciones_read (tenant_id, clave_dedup);
CREATE INDEX IF NOT EXISTS idx_pln_generaciones_read_plan ON deltaops.pln_generaciones_read (tenant_id, plan_id, registrado_at DESC);

-- 4) HISTORIAL / bitácora de hitos del plan (sirve `historial`). Append-only.
CREATE TABLE IF NOT EXISTS deltaops.pln_historial_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  plan_id text NOT NULL,
  hito text NOT NULL,
  version integer NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  ocurrido_at timestamptz NOT NULL,
  last_event_id text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_pln_historial_read_plan ON deltaops.pln_historial_read (tenant_id, plan_id, ocurrido_at DESC);

-- RLS por tenant en todos los read models.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'pln_planes_read','pln_calendarios_read','pln_generaciones_read','pln_historial_read'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
