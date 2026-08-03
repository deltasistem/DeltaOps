-- DGP-004 · Reference Module — Elemento de Referencia (dominio neutro).
-- Tablas propias del módulo (los módulos NO usan el Record Store de la
-- plataforma para sus entidades). Aditiva; RLS por tenant como 0004.

CREATE TABLE IF NOT EXISTS deltaops.ref_elementos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  nombre text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  estado text NOT NULL CHECK (estado IN ('BORRADOR', 'ACTIVO', 'ARCHIVADO')),
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_elementos_nombre
  ON deltaops.ref_elementos (tenant_id, lower(nombre));

CREATE INDEX IF NOT EXISTS idx_ref_elementos_estado
  ON deltaops.ref_elementos (tenant_id, estado, updated_at DESC);

CREATE TABLE IF NOT EXISTS deltaops.ref_elementos_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  nombre text NOT NULL,
  descripcion text NOT NULL DEFAULT '',
  estado text NOT NULL,
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ref_elementos_read_estado
  ON deltaops.ref_elementos_read (tenant_id, estado, actualizado_at DESC);

-- RLS por tenant (app.tenant_id fijado con set_config transaccional)
ALTER TABLE deltaops.ref_elementos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ref_elementos_read ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ref_elementos_tenant_isolation ON deltaops.ref_elementos;
CREATE POLICY ref_elementos_tenant_isolation ON deltaops.ref_elementos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ref_elementos_read_tenant_isolation ON deltaops.ref_elementos_read;
CREATE POLICY ref_elementos_read_tenant_isolation ON deltaops.ref_elementos_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
