-- DGP-019.1 · Módulo de Utilización, Medidores y Combustible — Persistencia base.
-- Tablas PROPIAS del módulo (prefijo utl_), NUNCA Record Store. Hechos
-- APPEND-ONLY (lecturas y tanqueos): la corrección es una ANULACIÓN no
-- destructiva + un nuevo hecho (no UPDATE de valor). El estado completo vive en
-- `datos` (JSONB, fuente de reconstrucción); las columnas planas son sólo para
-- filtrar/indexar. ADITIVA; RLS por tenant con app.tenant_id (set_config
-- transaccional) como 0024 (lección 004: RLS en LECTURAS y ESCRITURAS).
-- 100% idempotente. NO usa Workflow Engine.

-- ===========================================================================
-- 1) Hechos append-only (fuente de verdad de escritura).
-- ===========================================================================

-- Lectura de medidor (horómetro/odómetro). Append-only; `estado` vigente|anulada,
-- `inconsistente` marca lecturas decrecientes que NO propagan a Activos,
-- `sincronizacion_activo` = pendiente|confirmada|no-aplica|fallida.
CREATE TABLE IF NOT EXISTS deltaops.utl_lecturas (
  tenant_id text NOT NULL,
  id text NOT NULL,
  activo_id text NOT NULL,
  tipo_medidor text NOT NULL,
  valor numeric NOT NULL,
  unidad text NOT NULL,
  fecha_hora timestamptz NOT NULL,
  identity_id text NOT NULL,
  origen text NOT NULL,
  estado text NOT NULL DEFAULT 'vigente',
  inconsistente boolean NOT NULL DEFAULT false,
  sincronizacion_activo text NOT NULL DEFAULT 'pendiente',
  op_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_utl_lecturas_medidor ON deltaops.utl_lecturas (tenant_id, activo_id, tipo_medidor, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_utl_lecturas_valida ON deltaops.utl_lecturas (tenant_id, activo_id, tipo_medidor, estado, inconsistente, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_utl_lecturas_activo ON deltaops.utl_lecturas (tenant_id, activo_id, fecha_hora DESC);

-- Tanqueo de combustible. Append-only con anulación no destructiva. proveedor_id
-- es referencia string SIN FK dura; tipo_combustible es del catálogo del módulo.
CREATE TABLE IF NOT EXISTS deltaops.utl_tanqueos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  activo_id text NOT NULL,
  fecha_hora timestamptz NOT NULL,
  litros numeric NOT NULL,
  tipo_combustible text NOT NULL,
  precio_unitario numeric,
  costo_total numeric,
  moneda text,
  lectura_medidor_ref text,
  identity_id text NOT NULL,
  proveedor_id text,
  estado text NOT NULL DEFAULT 'vigente',
  op_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_utl_tanqueos_activo ON deltaops.utl_tanqueos (tenant_id, activo_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_utl_tanqueos_estado ON deltaops.utl_tanqueos (tenant_id, estado, fecha_hora DESC);

-- ===========================================================================
-- 2) Recibos de sincronización durables (protocolo de reclamación offline).
--    Protocolo claim → ejecutar → finalize/release (lección 008.1).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.utl_sync_receipts (
  tenant_id text NOT NULL,
  op_id text NOT NULL,
  cliente_id text,
  comando text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',
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
CREATE TABLE IF NOT EXISTS deltaops.utl_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_utl_eventos_stream ON deltaops.utl_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id): LECTURAS y ESCRITURAS por igual (lección 004).
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'utl_lecturas','utl_tanqueos','utl_sync_receipts','utl_eventos'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
