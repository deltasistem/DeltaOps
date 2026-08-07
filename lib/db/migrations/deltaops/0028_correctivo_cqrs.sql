-- DGP-015 · Módulo Enterprise Corrective Maintenance — Read models (CQRS).
-- Proyecciones especializadas alimentadas SÓLO por payloads de evento
-- AUTOSUFICIENTES (nunca releen el aggregate); idempotentes por
-- (last_event_id, version). El DETALLE también se sirve desde read models
-- (lección 009.2: la query jamás toca la tabla de escritura). ADITIVA; RLS por
-- tenant. Incluye read models de eventos-de-activo (historial de fallas y
-- reincidencia) y consumos de inventario. 100% idempotente.

-- Detalle + listado de solicitudes (servido SIEMPRE desde read model).
CREATE TABLE IF NOT EXISTS deltaops.cor_solicitudes_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  titulo text NOT NULL,
  origen text NOT NULL,
  activo_id text,
  prioridad text NOT NULL,
  criticidad text,
  estado text NOT NULL,
  diagnostico_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_solicitudes_read_list ON deltaops.cor_solicitudes_read (tenant_id, estado, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS idx_cor_solicitudes_read_origen ON deltaops.cor_solicitudes_read (tenant_id, origen);
CREATE INDEX IF NOT EXISTS idx_cor_solicitudes_read_activo ON deltaops.cor_solicitudes_read (tenant_id, activo_id);

-- Detalle de diagnóstico (uno por solicitud; servido desde read model).
CREATE TABLE IF NOT EXISTS deltaops.cor_diagnosticos_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  plantilla_id text NOT NULL,
  plantilla_version integer NOT NULL,
  causa_raiz text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_diagnosticos_read_solicitud ON deltaops.cor_diagnosticos_read (tenant_id, solicitud_id);

-- Detalle + listado de intervenciones (multi-cuadrilla).
CREATE TABLE IF NOT EXISTS deltaops.cor_intervenciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  orden_trabajo_id text NOT NULL,
  activo_id text NOT NULL,
  mayor boolean NOT NULL DEFAULT false,
  estado text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_intervenciones_read_solicitud ON deltaops.cor_intervenciones_read (tenant_id, solicitud_id);
CREATE INDEX IF NOT EXISTS idx_cor_intervenciones_read_estado ON deltaops.cor_intervenciones_read (tenant_id, estado, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS idx_cor_intervenciones_read_activo ON deltaops.cor_intervenciones_read (tenant_id, activo_id);

-- Detalle + listado de generaciones (dedup solicitud → OT).
CREATE TABLE IF NOT EXISTS deltaops.cor_generaciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  activo_id text NOT NULL,
  clave_dedup text NOT NULL,
  orden_trabajo_id text,
  estado text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_generaciones_read_solicitud ON deltaops.cor_generaciones_read (tenant_id, solicitud_id, actualizado_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cor_generaciones_read_dedup ON deltaops.cor_generaciones_read (tenant_id, clave_dedup);

-- Eventos-de-activo proyectados (historial de fallas y reincidencias por activo).
-- Insumos crudos de KPIs (sin cálculo agregado). Append-only por event id.
CREATE TABLE IF NOT EXISTS deltaops.cor_eventos_activo_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  activo_id text NOT NULL,
  solicitud_id text,
  orden_trabajo_id text,
  tipo text NOT NULL,
  modo_falla text,
  reincidente boolean NOT NULL DEFAULT false,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocurrido_at timestamptz NOT NULL,
  last_event_id text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_eventos_activo_read_ref ON deltaops.cor_eventos_activo_read (tenant_id, activo_id, ocurrido_at);
CREATE INDEX IF NOT EXISTS idx_cor_eventos_activo_read_modo ON deltaops.cor_eventos_activo_read (tenant_id, activo_id, modo_falla, ocurrido_at);

-- Consumos/devoluciones/reservas de inventario proyectados (trazabilidad de
-- repuestos por intervención/OT). Hechos append-only por event id.
CREATE TABLE IF NOT EXISTS deltaops.cor_consumos_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  intervencion_id text,
  orden_trabajo_id text,
  tipo text NOT NULL,
  inventario_id text,
  articulo_id text,
  cantidad numeric,
  unidad text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocurrido_at timestamptz NOT NULL,
  last_event_id text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_consumos_read_int ON deltaops.cor_consumos_read (tenant_id, intervencion_id, ocurrido_at);
CREATE INDEX IF NOT EXISTS idx_cor_consumos_read_ot ON deltaops.cor_consumos_read (tenant_id, orden_trabajo_id, ocurrido_at);

-- Historial proyectado (timeline propio del módulo).
CREATE TABLE IF NOT EXISTS deltaops.cor_historial_read (
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
CREATE INDEX IF NOT EXISTS idx_cor_historial_read_ref ON deltaops.cor_historial_read (tenant_id, entity_ref, ocurrido_at);

-- RLS por tenant (LECTURAS y ESCRITURAS).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'cor_solicitudes_read','cor_diagnosticos_read','cor_intervenciones_read',
    'cor_generaciones_read','cor_eventos_activo_read','cor_consumos_read','cor_historial_read'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
