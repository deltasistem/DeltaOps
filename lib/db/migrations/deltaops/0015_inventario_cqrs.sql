-- DGP-011.2 · Módulo Enterprise Inventory — CQRS: Read Models especializados.
-- TODA consulta del módulo se sirve EXCLUSIVAMENTE desde estos read models,
-- proyectados SOLO desde el payload de eventos autosuficientes (idempotentes por
-- last_event_id). ADITIVA sobre 0014; RLS por tenant. Idempotente.

-- 1) LISTADO/DETALLE de items (sirve `item` y `items`).
CREATE TABLE IF NOT EXISTS deltaops.inv_items_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  sku text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  estado text NOT NULL,
  tipo_item text NOT NULL,
  categoria text,
  modo_trazabilidad text NOT NULL,
  eliminado boolean NOT NULL DEFAULT false,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_items_read_estado ON deltaops.inv_items_read (tenant_id, estado, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_items_read_tipo ON deltaops.inv_items_read (tenant_id, tipo_item);

-- 2) EXISTENCIAS / DISPONIBILIDAD (7 buckets de stock). Sirve `existencia`,
--    `existencias-item` y `disponibilidad`.
CREATE TABLE IF NOT EXISTS deltaops.inv_existencias_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  item_id text NOT NULL,
  bodega_id text NOT NULL,
  ubicacion_id text NOT NULL,
  lote_codigo text,
  serie_numero text,
  disponible numeric NOT NULL DEFAULT 0,
  reservado numeric NOT NULL DEFAULT 0,
  comprometido numeric NOT NULL DEFAULT 0,
  en_transito numeric NOT NULL DEFAULT 0,
  en_inspeccion numeric NOT NULL DEFAULT 0,
  bloqueado numeric NOT NULL DEFAULT 0,
  vencido numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_existencias_read_item ON deltaops.inv_existencias_read (tenant_id, item_id);
CREATE INDEX IF NOT EXISTS idx_inv_existencias_read_bodega ON deltaops.inv_existencias_read (tenant_id, bodega_id);

-- 3) MOVIMIENTOS / HISTÓRICO (append-only, idempotente por event_id).
CREATE TABLE IF NOT EXISTS deltaops.inv_movimientos_read (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  inventario_id text NOT NULL,
  item_id text,
  tipo text NOT NULL,
  familia text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_movimientos_read_inv ON deltaops.inv_movimientos_read (tenant_id, inventario_id, registrado_at DESC);

-- 4) Read models proyectados por (tenant,id): reservas, transferencias,
--    conteos, ajustes, lotes, series, bodegas, ubicaciones. Cada uno idempotente
--    por (last_event_id, version).
CREATE TABLE IF NOT EXISTS deltaops.inv_reservas_read (
  tenant_id text NOT NULL, id text NOT NULL, item_id text, estado text NOT NULL,
  tipo text, demanda_id text, datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_reservas_read_item ON deltaops.inv_reservas_read (tenant_id, item_id, estado);

CREATE TABLE IF NOT EXISTS deltaops.inv_transferencias_read (
  tenant_id text NOT NULL, id text NOT NULL, estado text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_transferencias_read_estado ON deltaops.inv_transferencias_read (tenant_id, estado, actualizado_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.inv_conteos_read (
  tenant_id text NOT NULL, id text NOT NULL, estado text NOT NULL, tipo text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_conteos_read_estado ON deltaops.inv_conteos_read (tenant_id, estado, actualizado_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.inv_ajustes_read (
  tenant_id text NOT NULL, id text NOT NULL, estado text NOT NULL, tipo text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_ajustes_read_estado ON deltaops.inv_ajustes_read (tenant_id, estado, actualizado_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.inv_lotes_read (
  tenant_id text NOT NULL, id text NOT NULL, item_id text NOT NULL, codigo text NOT NULL,
  vencimiento_at timestamptz, datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_lotes_read_item ON deltaops.inv_lotes_read (tenant_id, item_id, vencimiento_at);

CREATE TABLE IF NOT EXISTS deltaops.inv_series_read (
  tenant_id text NOT NULL, id text NOT NULL, item_id text NOT NULL, numero text NOT NULL,
  estado text, datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_series_read_item ON deltaops.inv_series_read (tenant_id, item_id);

CREATE TABLE IF NOT EXISTS deltaops.inv_bodegas_read (
  tenant_id text NOT NULL, id text NOT NULL, nombre text, tipo text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS deltaops.inv_ubicaciones_read (
  tenant_id text NOT NULL, id text NOT NULL, bodega_id text, nivel text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL, last_event_id text NOT NULL, actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_inv_ubicaciones_read_bodega ON deltaops.inv_ubicaciones_read (tenant_id, bodega_id);

-- RLS por tenant en todos los read models.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'inv_items_read','inv_existencias_read','inv_movimientos_read','inv_reservas_read',
    'inv_transferencias_read','inv_conteos_read','inv_ajustes_read','inv_lotes_read',
    'inv_series_read','inv_bodegas_read','inv_ubicaciones_read'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
