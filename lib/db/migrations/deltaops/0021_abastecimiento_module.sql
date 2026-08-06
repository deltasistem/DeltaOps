-- DGP-013.2 · Módulo Enterprise Procurement & Supply Chain — Persistencia base.
-- Tablas PROPIAS del módulo (prefijo abs_), NUNCA Record Store (reservado a
-- catálogos). Aggregates versionados optimistamente (columna `version`); el
-- estado completo vive en `datos` (JSONB, fuente de reconstrucción) y las
-- columnas planas son sólo para filtrar/indexar. ADITIVA; RLS por tenant con
-- app.tenant_id (set_config transaccional) como 0018 (lección 004: RLS en
-- LECTURAS y ESCRITURAS). 100% idempotente.

-- ===========================================================================
-- 1) Aggregates (fuente de verdad de escritura).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.abs_articulos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL,
  unidad text NOT NULL,
  familia text,
  metodo_valoracion text NOT NULL,
  moneda text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abs_articulos_codigo ON deltaops.abs_articulos (tenant_id, lower(codigo));
CREATE INDEX IF NOT EXISTS idx_abs_articulos_tipo ON deltaops.abs_articulos (tenant_id, tipo, updated_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.abs_proveedores (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  razon_social text NOT NULL,
  tipo text NOT NULL,
  calificacion_promedio numeric(6,3) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abs_proveedores_codigo ON deltaops.abs_proveedores (tenant_id, lower(codigo));
CREATE INDEX IF NOT EXISTS idx_abs_proveedores_tipo ON deltaops.abs_proveedores (tenant_id, tipo);

CREATE TABLE IF NOT EXISTS deltaops.abs_solicitudes (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  titulo text NOT NULL,
  estado text NOT NULL,
  prioridad text NOT NULL,
  origen_tipo text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abs_solicitudes_codigo ON deltaops.abs_solicitudes (tenant_id, lower(codigo));
CREATE INDEX IF NOT EXISTS idx_abs_solicitudes_estado ON deltaops.abs_solicitudes (tenant_id, estado, updated_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.abs_cotizaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  proveedor_id text NOT NULL,
  moneda text NOT NULL,
  total numeric(18,4) NOT NULL DEFAULT 0,
  plazo_entrega_dias integer NOT NULL DEFAULT 0,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_abs_cotizaciones_solicitud ON deltaops.abs_cotizaciones (tenant_id, solicitud_id, created_at);

CREATE TABLE IF NOT EXISTS deltaops.abs_ordenes_compra (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  proveedor_id text NOT NULL,
  solicitud_id text,
  cotizacion_id text,
  moneda text NOT NULL,
  estado text NOT NULL,
  total numeric(18,4) NOT NULL DEFAULT 0,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abs_ordenes_compra_codigo ON deltaops.abs_ordenes_compra (tenant_id, lower(codigo));
CREATE INDEX IF NOT EXISTS idx_abs_ordenes_compra_estado ON deltaops.abs_ordenes_compra (tenant_id, estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_abs_ordenes_compra_proveedor ON deltaops.abs_ordenes_compra (tenant_id, proveedor_id);

-- Recepciones (hechos INMUTABLES) con consecutivo por OC. Cada recepción
-- proyecta entradas de inventario por ORQUESTACIÓN; el vínculo línea→movimiento
-- se persiste atómicamente en abs_recepcion_materializaciones (0022 read model
-- espeja el vínculo). append-only.
CREATE TABLE IF NOT EXISTS deltaops.abs_recepciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  orden_compra_id text NOT NULL,
  consecutivo integer NOT NULL,
  completa_orden boolean NOT NULL DEFAULT false,
  con_novedades boolean NOT NULL DEFAULT false,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  recibido_por text NOT NULL,
  recibido_en timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abs_recepciones_consecutivo ON deltaops.abs_recepciones (tenant_id, orden_compra_id, consecutivo);
CREATE INDEX IF NOT EXISTS idx_abs_recepciones_orden ON deltaops.abs_recepciones (tenant_id, orden_compra_id, recibido_en);

-- Vínculo DURABLE recepción-línea → movimiento de inventario materializado
-- (ORQUESTACIÓN). Clave de dedup ÚNICA por (recepcionId, línea) ⇒ NUNCA se
-- duplica un movimiento aunque se reintente/concurra (lección 009.3/012).
CREATE TABLE IF NOT EXISTS deltaops.abs_recepcion_materializaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  recepcion_id text NOT NULL,
  orden_compra_id text NOT NULL,
  numero_linea_oc integer NOT NULL,
  clave_dedup text NOT NULL,
  articulo_id text,
  inventario_item_id text,
  cantidad numeric(18,6) NOT NULL DEFAULT 0,
  movimiento_id text,
  estado text NOT NULL DEFAULT 'pendiente',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abs_recepcion_mat_dedup ON deltaops.abs_recepcion_materializaciones (tenant_id, clave_dedup);
CREATE INDEX IF NOT EXISTS idx_abs_recepcion_mat_recepcion ON deltaops.abs_recepcion_materializaciones (tenant_id, recepcion_id);

CREATE TABLE IF NOT EXISTS deltaops.abs_historial (
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
CREATE INDEX IF NOT EXISTS idx_abs_historial_ref ON deltaops.abs_historial (tenant_id, entity_ref, ocurrido_en);

-- ===========================================================================
-- 2) Recibos durables de sincronización offline (reclamación durable de opId).
--    Protocolo claim → ejecutar → finalize/release (lección 008.1).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.abs_sync_receipts (
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
CREATE TABLE IF NOT EXISTS deltaops.abs_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_abs_eventos_stream ON deltaops.abs_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id): LECTURAS y ESCRITURAS por igual (lección 004).
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'abs_articulos','abs_proveedores','abs_solicitudes','abs_cotizaciones',
    'abs_ordenes_compra','abs_recepciones','abs_recepcion_materializaciones',
    'abs_historial','abs_sync_receipts','abs_eventos'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
