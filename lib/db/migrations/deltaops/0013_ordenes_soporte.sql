-- DGP-009.2 · Módulo Órdenes de Trabajo Empresariales — Persistencia de soporte.
-- Tablas PROPIAS del módulo para: recibos de idempotencia de comando offline
-- (ReciboPort), catálogos configurables por tenant (CatalogoPort) y contadores
-- de consecutivos transaccionales (ConsecutivoPort). ADITIVA; RLS por tenant con
-- app.tenant_id (set_config transaccional). 100% idempotente.

-- ===========================================================================
-- 1) Recibos de idempotencia a nivel de COMANDO (ReciboPort). Distinto de
--    ord_sync_receipts (reclamación durable del opId de la cola de sync): este
--    sella el resultado exacto de un comando aplicado por (tenant, comando, opId)
--    para que reintentos devuelvan `{ idempotente: true }` sin reejecutar.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_recibos (
  tenant_id text NOT NULL,
  comando text NOT NULL,
  op_id text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, comando, op_id)
);

-- ===========================================================================
-- 2) Catálogos configurables por tenant (nada hardcodeado). Cada entrada es
--    (catalogo, clave) con etiqueta/posición/padre y bandera de habilitado.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_catalogos (
  tenant_id text NOT NULL,
  catalogo text NOT NULL,
  clave text NOT NULL,
  etiqueta text NOT NULL,
  posicion integer,
  padre text,
  habilitado boolean NOT NULL DEFAULT true,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, catalogo, clave)
);

CREATE INDEX IF NOT EXISTS idx_ord_catalogos_lista
  ON deltaops.ord_catalogos (tenant_id, catalogo, habilitado, posicion);

-- ===========================================================================
-- 3) Contadores de consecutivos por serie (ConsecutivoPort). El incremento se
--    hace transaccional (UPDATE ... RETURNING) dentro de la UoW del comando.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_secuencias (
  tenant_id text NOT NULL,
  serie text NOT NULL,
  valor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, serie)
);

-- ===========================================================================
-- RLS por tenant (app.tenant_id fijado con set_config transaccional). Aplica a
-- LECTURAS y ESCRITURAS por igual.
-- ===========================================================================
ALTER TABLE deltaops.ord_recibos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_catalogos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_secuencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ord_recibos_tenant_isolation ON deltaops.ord_recibos;
CREATE POLICY ord_recibos_tenant_isolation ON deltaops.ord_recibos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_catalogos_tenant_isolation ON deltaops.ord_catalogos;
CREATE POLICY ord_catalogos_tenant_isolation ON deltaops.ord_catalogos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_secuencias_tenant_isolation ON deltaops.ord_secuencias;
CREATE POLICY ord_secuencias_tenant_isolation ON deltaops.ord_secuencias
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
