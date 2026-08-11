-- DGP-019.1 · Módulo de Utilización — Tablas de SOPORTE.
-- Recibos de idempotencia de COMANDO (offline-first) y catálogos configurables
-- por tenant (semántica canónica). ADITIVA sobre 0036; RLS por tenant. Idempotente.

-- Recibos de idempotencia de COMANDO (distinto de utl_sync_receipts, que es la
-- reclamación durable de opId de ORQUESTACIÓN). Exactamente-una aplicación por
-- (comando, op_id).
CREATE TABLE IF NOT EXISTS deltaops.utl_recibos (
  tenant_id text NOT NULL,
  comando text NOT NULL,
  op_id text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, comando, op_id)
);

-- Catálogos configurables por tenant. En esta fase: tipos-combustible. `estado`
-- = habilitado|deshabilitado (deshabilitar es no destructivo). Si el tenant no
-- tiene entradas, se admite la semántica canónica del módulo.
CREATE TABLE IF NOT EXISTS deltaops.utl_catalogos (
  tenant_id text NOT NULL,
  catalogo text NOT NULL,
  clave text NOT NULL,
  etiqueta text NOT NULL,
  posicion integer NOT NULL DEFAULT 0,
  padre text,
  estado text NOT NULL DEFAULT 'habilitado',
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, catalogo, clave)
);
CREATE INDEX IF NOT EXISTS idx_utl_catalogos_lookup ON deltaops.utl_catalogos (tenant_id, catalogo, estado, posicion);

-- RLS por tenant.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['utl_recibos','utl_catalogos']) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
