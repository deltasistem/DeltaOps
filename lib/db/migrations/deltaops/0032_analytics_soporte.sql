-- DGP-016 · Módulo Enterprise Analytics & KPI Platform — Soporte transversal.
-- Catálogos CONFIGURABLES por tenant (categorías de indicador, unidades,
-- formatos, periodos de meta) con fallback a canónicos cuando están vacíos, y
-- recibos de IDEMPOTENCIA de comando (opId por comando) para escrituras
-- exactamente-una-vez. ADITIVA; RLS por tenant en lecturas y escrituras. 100%
-- idempotente.

-- Catálogos administrables (jerárquicos y ordenables).
CREATE TABLE IF NOT EXISTS deltaops.an_catalogos (
  tenant_id text NOT NULL,
  catalogo text NOT NULL,
  clave text NOT NULL,
  etiqueta text NOT NULL,
  posicion integer NOT NULL DEFAULT 0,
  padre text,
  habilitado boolean NOT NULL DEFAULT true,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, catalogo, clave)
);
CREATE INDEX IF NOT EXISTS idx_an_catalogos_lista ON deltaops.an_catalogos (tenant_id, catalogo, habilitado, posicion);

-- Recibos de idempotencia de comando (opId por comando → resultado sellado).
CREATE TABLE IF NOT EXISTS deltaops.an_recibos (
  tenant_id text NOT NULL,
  comando text NOT NULL,
  op_id text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, comando, op_id)
);

-- RLS por tenant (app.tenant_id) en lecturas y escrituras (lección 004).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['an_catalogos','an_recibos']) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
