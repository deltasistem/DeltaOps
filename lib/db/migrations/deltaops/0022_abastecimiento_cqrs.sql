-- DGP-013.2 · Módulo Enterprise Procurement & Supply Chain — Read models (CQRS).
-- Proyecciones especializadas alimentadas SÓLO por payloads de evento
-- AUTOSUFICIENTES (nunca releen el aggregate); idempotentes por
-- (last_event_id, version). El DETALLE también se sirve desde read models
-- (lección 009.2: la query jamás toca la tabla de escritura). ADITIVA; RLS por
-- tenant. Incluye abs_costos_read (limitación de costos: module-inventario es
-- FROZEN y no expone comando de costo ⇒ el costo se materializa aquí).
-- 100% idempotente.

CREATE TABLE IF NOT EXISTS deltaops.abs_articulos_read (
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
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_abs_articulos_read_list ON deltaops.abs_articulos_read (tenant_id, tipo, actualizado_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.abs_proveedores_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  razon_social text NOT NULL,
  tipo text NOT NULL,
  calificacion_promedio numeric(6,3) NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_abs_proveedores_read_list ON deltaops.abs_proveedores_read (tenant_id, tipo, actualizado_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.abs_solicitudes_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  titulo text NOT NULL,
  estado text NOT NULL,
  prioridad text NOT NULL,
  origen_tipo text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_abs_solicitudes_read_list ON deltaops.abs_solicitudes_read (tenant_id, estado, actualizado_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.abs_cotizaciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  proveedor_id text NOT NULL,
  moneda text NOT NULL,
  total numeric(18,4) NOT NULL DEFAULT 0,
  plazo_entrega_dias integer NOT NULL DEFAULT 0,
  seleccionada boolean NOT NULL DEFAULT false,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_abs_cotizaciones_read_solicitud ON deltaops.abs_cotizaciones_read (tenant_id, solicitud_id, total);

CREATE TABLE IF NOT EXISTS deltaops.abs_ordenes_compra_read (
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
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_abs_ordenes_compra_read_list ON deltaops.abs_ordenes_compra_read (tenant_id, estado, actualizado_at DESC);

-- Recepciones proyectadas (hechos append-only), incluyendo el resumen de
-- materialización de inventario para servir el DETALLE sin releer aggregate.
CREATE TABLE IF NOT EXISTS deltaops.abs_recepciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  orden_compra_id text NOT NULL,
  consecutivo integer NOT NULL,
  completa_orden boolean NOT NULL DEFAULT false,
  con_novedades boolean NOT NULL DEFAULT false,
  estado_orden text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  recibido_por text NOT NULL,
  recibido_en timestamptz NOT NULL,
  last_event_id text NOT NULL,
  registrado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_abs_recepciones_read_orden ON deltaops.abs_recepciones_read (tenant_id, orden_compra_id, recibido_en DESC);

CREATE TABLE IF NOT EXISTS deltaops.abs_historial_read (
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
CREATE INDEX IF NOT EXISTS idx_abs_historial_read_ref ON deltaops.abs_historial_read (tenant_id, entity_ref, ocurrido_at);

-- LIMITACIÓN DE COSTOS: module-inventario es FROZEN y NO expone un comando
-- oficial de actualización de costo. La actualización automática de costo por
-- recepción se materializa en el read model PROPIO del módulo (costo por
-- artículo/moneda) alimentado por el evento AUTOSUFICIENTE COSTOS_ACTUALIZADOS.
CREATE TABLE IF NOT EXISTS deltaops.abs_costos_read (
  tenant_id text NOT NULL,
  articulo_id text NOT NULL,
  moneda text NOT NULL,
  metodo_valoracion text NOT NULL,
  costo_unitario numeric(18,6) NOT NULL DEFAULT 0,
  cantidad_acumulada numeric(18,6) NOT NULL DEFAULT 0,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, articulo_id, moneda)
);
CREATE INDEX IF NOT EXISTS idx_abs_costos_read_articulo ON deltaops.abs_costos_read (tenant_id, articulo_id);

-- RLS por tenant (LECTURAS y ESCRITURAS).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'abs_articulos_read','abs_proveedores_read','abs_solicitudes_read',
    'abs_cotizaciones_read','abs_ordenes_compra_read','abs_recepciones_read',
    'abs_historial_read','abs_costos_read'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
