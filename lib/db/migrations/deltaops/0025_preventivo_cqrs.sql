-- DGP-014 · Módulo Enterprise Preventive Maintenance — Read models (CQRS).
-- Proyecciones especializadas alimentadas SÓLO por payloads de evento
-- AUTOSUFICIENTES (nunca releen el aggregate); idempotentes por
-- (last_event_id, version). El DETALLE también se sirve desde read models
-- (lección 009.2: la query jamás toca la tabla de escritura). ADITIVA; RLS por
-- tenant. Incluye read models de calendario/vencimientos (programaciones) y
-- reprogramaciones/suspensiones/exclusiones. 100% idempotente.

-- Detalle + listado de programas (servido SIEMPRE desde read model).
CREATE TABLE IF NOT EXISTS deltaops.prv_programas_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL,
  clasificacion text,
  padre_id text,
  estado text NOT NULL,
  version_programa integer NOT NULL DEFAULT 1,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_prv_programas_read_list ON deltaops.prv_programas_read (tenant_id, estado, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS idx_prv_programas_read_tipo ON deltaops.prv_programas_read (tenant_id, tipo);

-- Versiones históricas proyectadas (para listar/comparar sin releer aggregate).
CREATE TABLE IF NOT EXISTS deltaops.prv_programa_versiones_read (
  tenant_id text NOT NULL,
  programa_id text NOT NULL,
  version_programa integer NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, programa_id, version_programa)
);
CREATE INDEX IF NOT EXISTS idx_prv_prog_versiones_read_prog ON deltaops.prv_programa_versiones_read (tenant_id, programa_id, version_programa DESC);

-- Detalle + listado de actividades.
CREATE TABLE IF NOT EXISTS deltaops.prv_actividades_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  programa_id text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  moneda text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_prv_actividades_read_programa ON deltaops.prv_actividades_read (tenant_id, programa_id, orden);

-- Detalle + listado de generaciones (calendario/vencimientos por fecha objetivo).
CREATE TABLE IF NOT EXISTS deltaops.prv_generaciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  programa_id text NOT NULL,
  actividad_id text NOT NULL,
  activo_id text NOT NULL,
  ventana text NOT NULL,
  clave_dedup text NOT NULL,
  origen text NOT NULL,
  fecha_objetivo timestamptz NOT NULL,
  orden_trabajo_id text,
  estado text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_prv_generaciones_read_prog ON deltaops.prv_generaciones_read (tenant_id, programa_id, fecha_objetivo);
CREATE INDEX IF NOT EXISTS idx_prv_generaciones_read_cal ON deltaops.prv_generaciones_read (tenant_id, estado, fecha_objetivo);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prv_generaciones_read_dedup ON deltaops.prv_generaciones_read (tenant_id, clave_dedup);

-- Programaciones (calendario): reprogramaciones/suspensiones/exclusiones
-- proyectadas como hechos append-only, para servir el calendario y la
-- trazabilidad sin releer aggregate. `entidad` = programa|actividad|activo|ventana.
CREATE TABLE IF NOT EXISTS deltaops.prv_programaciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  tipo text NOT NULL,
  programa_id text,
  actividad_id text,
  activo_id text,
  ventana text,
  motivo text,
  desde timestamptz,
  hasta timestamptz,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_id text NOT NULL,
  ocurrido_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_prv_programaciones_read_prog ON deltaops.prv_programaciones_read (tenant_id, programa_id, ocurrido_at DESC);
CREATE INDEX IF NOT EXISTS idx_prv_programaciones_read_tipo ON deltaops.prv_programaciones_read (tenant_id, tipo, ocurrido_at DESC);

-- Historial proyectado (timeline propio del módulo).
CREATE TABLE IF NOT EXISTS deltaops.prv_historial_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  entity_ref text NOT NULL,
  hito text NOT NULL,
  version integer NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  ocurrido_at timestamptz NOT NULL,
  last_event_id text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_prv_historial_read_ref ON deltaops.prv_historial_read (tenant_id, entity_ref, ocurrido_at);

-- RLS por tenant (LECTURAS y ESCRITURAS).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'prv_programas_read','prv_programa_versiones_read','prv_actividades_read',
    'prv_generaciones_read','prv_programaciones_read','prv_historial_read'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
