-- DGP-008.1 · Módulo Activos Empresariales.
-- Tablas PROPIAS del módulo (los módulos NO usan el Record Store para su
-- aggregate; el Record Store se reserva a los catálogos). Aditiva; RLS por
-- tenant con app.tenant_id como las migraciones 0004/0005.

CREATE TABLE IF NOT EXISTS deltaops.act_activos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo_empresarial text NOT NULL,
  nombre text NOT NULL,
  estado text NOT NULL CHECK (estado IN
    ('BORRADOR','REGISTRADO','OPERATIVO','MANTENIMIENTO','FUERA_SERVICIO','RETIRADO')),
  tipo text NOT NULL,
  criticidad text,
  ubicacion_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_act_activos_codigo
  ON deltaops.act_activos (tenant_id, lower(codigo_empresarial));

CREATE INDEX IF NOT EXISTS idx_act_activos_estado
  ON deltaops.act_activos (tenant_id, estado, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_act_activos_criticidad
  ON deltaops.act_activos (tenant_id, criticidad);

CREATE INDEX IF NOT EXISTS idx_act_activos_ubicacion
  ON deltaops.act_activos (tenant_id, ubicacion_id);

CREATE TABLE IF NOT EXISTS deltaops.act_activos_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo_empresarial text NOT NULL,
  nombre text NOT NULL,
  estado text NOT NULL,
  tipo text NOT NULL,
  criticidad text,
  ubicacion_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_act_activos_read_estado
  ON deltaops.act_activos_read (tenant_id, estado, actualizado_at DESC);

CREATE INDEX IF NOT EXISTS idx_act_activos_read_criticidad
  ON deltaops.act_activos_read (tenant_id, criticidad);

CREATE INDEX IF NOT EXISTS idx_act_activos_read_ubicacion
  ON deltaops.act_activos_read (tenant_id, ubicacion_id);

-- Recibos durables de sincronización offline (opId aplicado ⇒ devuelve recibo).
-- Registra: op_id, id de cliente, comando, estado (pendiente durante la
-- reclamación; luego aplicada/idempotente/conflicto/rechazada) y el payload de
-- respuesta (ResultadoSync completo, `null` mientras 'pendiente').
CREATE TABLE IF NOT EXISTS deltaops.act_sync_receipts (
  tenant_id text NOT NULL,
  op_id text NOT NULL,
  cliente_id text,
  comando text NOT NULL,
  estado text NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, op_id)
);
-- Idempotente ante despliegues sobre tablas ya creadas por una 0007 anterior.
ALTER TABLE deltaops.act_sync_receipts ADD COLUMN IF NOT EXISTS cliente_id text;
ALTER TABLE deltaops.act_sync_receipts ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'aplicada';
-- Reclamación durable del opId: un recibo se crea PRIMERO en estado 'pendiente'
-- (ON CONFLICT DO NOTHING = reclamación atómica), y se finaliza con UPDATE al
-- estado terminal. `actualizado_at` habilita la recuperación de pendientes
-- "viejos" (adopción de propiedad con reconciliación) tras un fallo de guardado.
ALTER TABLE deltaops.act_sync_receipts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- RLS por tenant (app.tenant_id fijado con set_config transaccional).
ALTER TABLE deltaops.act_activos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.act_activos_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.act_sync_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS act_activos_tenant_isolation ON deltaops.act_activos;
CREATE POLICY act_activos_tenant_isolation ON deltaops.act_activos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS act_activos_read_tenant_isolation ON deltaops.act_activos_read;
CREATE POLICY act_activos_read_tenant_isolation ON deltaops.act_activos_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS act_sync_receipts_tenant_isolation ON deltaops.act_sync_receipts;
CREATE POLICY act_sync_receipts_tenant_isolation ON deltaops.act_sync_receipts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
