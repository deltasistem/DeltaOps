-- DGP-014 · Módulo Enterprise Preventive Maintenance — Persistencia base.
-- Tablas PROPIAS del módulo (prefijo prv_), NUNCA Record Store (reservado a
-- catálogos). Aggregates versionados optimistamente (columna `version`); el
-- estado completo vive en `datos` (JSONB, fuente de reconstrucción) y las
-- columnas planas son sólo para filtrar/indexar. ADITIVA; RLS por tenant con
-- app.tenant_id (set_config transaccional) como 0021 (lección 004: RLS en
-- LECTURAS y ESCRITURAS). 100% idempotente.

-- ===========================================================================
-- 1) Aggregates (fuente de verdad de escritura).
-- ===========================================================================

-- Programa preventivo (aggregate raíz; jerarquía padre/hijo; versionado N/N-1).
CREATE TABLE IF NOT EXISTS deltaops.prv_programas (
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
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prv_programas_codigo ON deltaops.prv_programas (tenant_id, lower(codigo));
CREATE INDEX IF NOT EXISTS idx_prv_programas_estado ON deltaops.prv_programas (tenant_id, estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prv_programas_tipo ON deltaops.prv_programas (tenant_id, tipo);
CREATE INDEX IF NOT EXISTS idx_prv_programas_padre ON deltaops.prv_programas (tenant_id, padre_id);

-- Versiones INMUTABLES de programa (histórico N/N-1 para rollback determinista).
CREATE TABLE IF NOT EXISTS deltaops.prv_programa_versiones (
  tenant_id text NOT NULL,
  programa_id text NOT NULL,
  version_programa integer NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  guardado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, programa_id, version_programa)
);
CREATE INDEX IF NOT EXISTS idx_prv_programa_versiones_prog ON deltaops.prv_programa_versiones (tenant_id, programa_id, version_programa DESC);

-- Actividad preventiva (dentro de un programa; DAG de dependencias).
CREATE TABLE IF NOT EXISTS deltaops.prv_actividades (
  tenant_id text NOT NULL,
  id text NOT NULL,
  programa_id text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  moneda text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_prv_actividades_programa ON deltaops.prv_actividades (tenant_id, programa_id, orden);

-- Generación preventiva (ocurrencia programada → OT; guard anti-duplicado).
CREATE TABLE IF NOT EXISTS deltaops.prv_generaciones (
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
  estado text NOT NULL DEFAULT 'pendiente',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  generada_por text NOT NULL,
  generada_en timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prv_generaciones_dedup ON deltaops.prv_generaciones (tenant_id, clave_dedup);
CREATE INDEX IF NOT EXISTS idx_prv_generaciones_programa ON deltaops.prv_generaciones (tenant_id, programa_id, generada_en DESC);
CREATE INDEX IF NOT EXISTS idx_prv_generaciones_estado ON deltaops.prv_generaciones (tenant_id, estado, fecha_objetivo);

-- Vínculo DURABLE generación → orden de trabajo materializada (ORQUESTACIÓN).
-- Clave de dedup ÚNICA por claveDedup ⇒ NUNCA se duplica una OT aunque se
-- reintente/concurra/reproyecte (lección 009.3/012). `vincular` guarda con
-- guard atómico `orden_trabajo_id IS NULL`.
CREATE TABLE IF NOT EXISTS deltaops.prv_generacion_materializaciones (
  tenant_id text NOT NULL,
  clave_dedup text NOT NULL,
  generacion_id text NOT NULL,
  orden_trabajo_id text,
  estado text NOT NULL DEFAULT 'pendiente',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, clave_dedup)
);
CREATE INDEX IF NOT EXISTS idx_prv_gen_mat_generacion ON deltaops.prv_generacion_materializaciones (tenant_id, generacion_id);

-- Historial auditable (hechos append-only). Embebe el tenant en el id
-- (`${tenant}::${uuid}`) — el dominio de historial no lleva tenantId propio.
CREATE TABLE IF NOT EXISTS deltaops.prv_historial (
  tenant_id text NOT NULL,
  id text NOT NULL,
  entity_ref text NOT NULL,
  hito text NOT NULL,
  version integer NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocurrido_en timestamptz NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_prv_historial_ref ON deltaops.prv_historial (tenant_id, entity_ref, ocurrido_en);

-- ===========================================================================
-- 2) Recibos durables de sincronización offline (reclamación durable de opId).
--    Protocolo claim → ejecutar → finalize/release (lección 008.1).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.prv_sync_receipts (
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
CREATE TABLE IF NOT EXISTS deltaops.prv_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_prv_eventos_stream ON deltaops.prv_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id): LECTURAS y ESCRITURAS por igual (lección 004).
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'prv_programas','prv_programa_versiones','prv_actividades','prv_generaciones',
    'prv_generacion_materializaciones','prv_historial','prv_sync_receipts','prv_eventos'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
