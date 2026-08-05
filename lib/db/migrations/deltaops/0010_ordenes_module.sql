-- DGP-009.2 · Módulo Órdenes de Trabajo Empresariales — Persistencia base.
-- Tablas PROPIAS del módulo (los módulos NO usan el Record Store para su
-- aggregate; el Record Store se reserva a los catálogos). ADITIVA; RLS por
-- tenant con app.tenant_id (set_config transaccional) como 0004/0005/0007.
-- 100% idempotente.

-- ===========================================================================
-- 1) Aggregate OrdenTrabajo (fuente de verdad de escritura). Versionado
--    optimista con la columna `version`. `datos` (JSONB) contiene el estado
--    completo del aggregate; las columnas planas son para filtrar/indexar.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_ordenes (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  titulo text NOT NULL,
  estado text NOT NULL,
  tipo text NOT NULL,
  categoria text,
  prioridad text,
  severidad text,
  responsable text,
  supervisor text,
  activo_principal_id text,
  ubicacion_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ord_ordenes_codigo
  ON deltaops.ord_ordenes (tenant_id, lower(codigo));

CREATE INDEX IF NOT EXISTS idx_ord_ordenes_estado
  ON deltaops.ord_ordenes (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ord_ordenes_tipo
  ON deltaops.ord_ordenes (tenant_id, tipo);

CREATE INDEX IF NOT EXISTS idx_ord_ordenes_responsable
  ON deltaops.ord_ordenes (tenant_id, responsable);

CREATE INDEX IF NOT EXISTS idx_ord_ordenes_activo
  ON deltaops.ord_ordenes (tenant_id, activo_principal_id);

-- ===========================================================================
-- 2) Recibos durables de sincronización offline. Reclamación durable del opId:
--    un recibo se crea PRIMERO en estado 'pendiente' (ON CONFLICT DO NOTHING =
--    reclamación atómica), y se finaliza con UPDATE al estado terminal. Mismo
--    patrón que act_sync_receipts (0007).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_sync_receipts (
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
-- 3) Bitácora de eventos durable del módulo (event log canónico), fuente de
--    verdad del REPLAY de reproyección. Independiente del outbox del Kernel y
--    de su retención/estado de procesamiento. Se escribe en la MISMA UoW que
--    emite cada evento del módulo, con el MISMO event.id que el outbox (el
--    outbox NO es event store). Mismo patrón que act_eventos (0009).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);

-- Orden de replay determinista: occurred_at asc, event_id asc (desempate).
CREATE INDEX IF NOT EXISTS idx_ord_eventos_stream
  ON deltaops.ord_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id fijado con set_config transaccional). Aplica a
-- LECTURAS y ESCRITURAS por igual.
-- ===========================================================================
ALTER TABLE deltaops.ord_ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_sync_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ord_ordenes_tenant_isolation ON deltaops.ord_ordenes;
CREATE POLICY ord_ordenes_tenant_isolation ON deltaops.ord_ordenes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_sync_receipts_tenant_isolation ON deltaops.ord_sync_receipts;
CREATE POLICY ord_sync_receipts_tenant_isolation ON deltaops.ord_sync_receipts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_eventos_tenant_isolation ON deltaops.ord_eventos;
CREATE POLICY ord_eventos_tenant_isolation ON deltaops.ord_eventos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
