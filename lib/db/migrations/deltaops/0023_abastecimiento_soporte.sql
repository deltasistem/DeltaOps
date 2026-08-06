-- DGP-013.2 · Módulo Enterprise Procurement & Supply Chain — Tablas de SOPORTE.
-- Recibos de idempotencia de comando (offline-first), secuencias de código
-- (consecutivos: ART-, PRV-, SOL-, OC-) y catálogos configurables por tenant
-- (semántica canónica). ADITIVA sobre 0022; RLS por tenant. Idempotente.

-- Recibos de idempotencia de COMANDO (distinto de abs_sync_receipts, que es la
-- reclamación durable de opId de ORQUESTACIÓN). Exactamente-una aplicación por
-- (comando, op_id).
CREATE TABLE IF NOT EXISTS deltaops.abs_recibos (
  tenant_id text NOT NULL,
  comando text NOT NULL,
  op_id text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, comando, op_id)
);

-- Secuencias de código por serie (consecutivo transaccional).
CREATE TABLE IF NOT EXISTS deltaops.abs_secuencias (
  tenant_id text NOT NULL,
  serie text NOT NULL,
  valor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, serie)
);

-- Catálogos configurables por tenant (tipos-articulo, unidades-medida, monedas,
-- metodos-valoracion, prioridades, origenes-solicitud, novedades-recepcion,
-- tipos-proveedor, etc.).
CREATE TABLE IF NOT EXISTS deltaops.abs_catalogos (
  tenant_id text NOT NULL,
  catalogo text NOT NULL,
  clave text NOT NULL,
  etiqueta text NOT NULL,
  posicion integer,
  padre text,
  habilitado boolean NOT NULL DEFAULT true,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, catalogo, clave)
);
CREATE INDEX IF NOT EXISTS idx_abs_catalogos_lookup ON deltaops.abs_catalogos (tenant_id, catalogo, habilitado);

-- RLS por tenant.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['abs_recibos','abs_secuencias','abs_catalogos']) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
