-- DGP-011.2 · Módulo Enterprise Inventory — Persistencia base (aggregates).
-- Tablas PROPIAS del módulo (prefijo inv_), NUNCA Record Store (reservado a
-- catálogos). Aggregates versionados optimistamente (columna `version`); el
-- estado completo vive en `datos` (JSONB, fuente de reconstrucción) y las
-- columnas planas son sólo para filtrar/indexar. ADITIVA; RLS por tenant con
-- app.tenant_id (set_config transaccional) como 0010. 100% idempotente.

-- ===========================================================================
-- 1) Aggregates (fuente de verdad de escritura).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.inv_items (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  sku text NOT NULL,
  nombre text NOT NULL,
  estado text NOT NULL,
  tipo_item text NOT NULL,
  categoria text,
  modo_trazabilidad text NOT NULL,
  eliminado boolean NOT NULL DEFAULT false,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_items_sku ON deltaops.inv_items (tenant_id, lower(sku));
CREATE INDEX IF NOT EXISTS idx_inv_items_estado ON deltaops.inv_items (tenant_id, estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_items_tipo ON deltaops.inv_items (tenant_id, tipo_item);

CREATE TABLE IF NOT EXISTS deltaops.inv_existencias (
  tenant_id text NOT NULL,
  id text NOT NULL,
  item_id text NOT NULL,
  bodega_id text NOT NULL,
  ubicacion_id text NOT NULL,
  lote_codigo text,
  serie_numero text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_existencias_clave
  ON deltaops.inv_existencias (tenant_id, item_id, bodega_id, ubicacion_id, COALESCE(lote_codigo, ''), COALESCE(serie_numero, ''));
CREATE INDEX IF NOT EXISTS idx_inv_existencias_item ON deltaops.inv_existencias (tenant_id, item_id);

CREATE TABLE IF NOT EXISTS deltaops.inv_movimientos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  inventario_id text NOT NULL,
  item_id text,
  tipo text NOT NULL,
  familia text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_movimientos_inv ON deltaops.inv_movimientos (tenant_id, inventario_id, created_at);

CREATE TABLE IF NOT EXISTS deltaops.inv_bodegas (
  tenant_id text NOT NULL,
  id text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_ubicaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  bodega_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_lotes (
  tenant_id text NOT NULL,
  item_id text NOT NULL,
  codigo text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, item_id, codigo)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_series (
  tenant_id text NOT NULL,
  item_id text NOT NULL,
  numero text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, item_id, numero)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_reservas (
  tenant_id text NOT NULL,
  id text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_transferencias (
  tenant_id text NOT NULL,
  id text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_ajustes (
  tenant_id text NOT NULL,
  id text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_conteos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- ===========================================================================
-- 2) Recibos durables de sincronización offline (reclamación durable de opId).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.inv_sync_receipts (
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
--    el outbox del Kernel (el outbox NO es event store).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.inv_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_eventos_stream ON deltaops.inv_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id): LECTURAS y ESCRITURAS por igual.
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'inv_items','inv_existencias','inv_movimientos','inv_bodegas','inv_ubicaciones',
    'inv_lotes','inv_series','inv_reservas','inv_transferencias','inv_ajustes','inv_conteos',
    'inv_sync_receipts','inv_eventos'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
