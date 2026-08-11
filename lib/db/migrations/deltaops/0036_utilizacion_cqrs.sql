-- DGP-019.1 · Módulo de Utilización — Read models (CQRS).
-- Proyecciones especializadas alimentadas SÓLO por payloads de evento
-- AUTOSUFICIENTES (nunca releen el aggregate); idempotentes por last_event_id.
-- El DETALLE también se sirve desde read models (lección 009.2: la query jamás
-- toca la tabla de escritura). ADITIVA; RLS por tenant. 100% idempotente.

-- Detalle + listado de lecturas (servido SIEMPRE desde read model). Incluye
-- lecturas inconsistentes (visibles en queries) y el estado de sincronización.
CREATE TABLE IF NOT EXISTS deltaops.utl_lecturas_read (
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
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_utl_lecturas_read_list ON deltaops.utl_lecturas_read (tenant_id, activo_id, tipo_medidor, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_utl_lecturas_read_ultima ON deltaops.utl_lecturas_read (tenant_id, activo_id, tipo_medidor, estado, inconsistente, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_utl_lecturas_read_estado ON deltaops.utl_lecturas_read (tenant_id, estado, fecha_hora DESC);

-- Detalle + listado de tanqueos (servido SIEMPRE desde read model).
CREATE TABLE IF NOT EXISTS deltaops.utl_tanqueos_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  activo_id text NOT NULL,
  fecha_hora timestamptz NOT NULL,
  litros numeric NOT NULL,
  tipo_combustible text NOT NULL,
  costo_total numeric,
  moneda text,
  estado text NOT NULL DEFAULT 'vigente',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_utl_tanqueos_read_list ON deltaops.utl_tanqueos_read (tenant_id, activo_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_utl_tanqueos_read_estado ON deltaops.utl_tanqueos_read (tenant_id, estado, fecha_hora DESC);

-- RLS por tenant.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['utl_lecturas_read','utl_tanqueos_read']) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
