-- ===========================================================================
-- DGP-021.1 · Fundación del Módulo de Costos (`modulo.costos`).
--
-- Materializa HECHOS ECONÓMICOS de mantenimiento de forma AUDITABLE, exacta y
-- multitenant, con SNAPSHOT histórico INMUTABLE y estados mínimos ACTIVO/ANULADO
-- (sin workflow). NO calcula agregados (costo total OT/activo, costo/hora,
-- costo/km) ni duplica fuentes de verdad (mano de obra/combustible/materiales
-- viven en sus módulos ORIGEN). El costo exacto de materiales se consume por el
-- contrato público de Abastecimiento (DGP-021.0), nunca leyendo tablas ajenas.
--
-- ADITIVA, idempotente y NO destructiva. RLS por tenant (app.tenant_id) en TODAS
-- las tablas. Dinero en numeric(18,6) (convención Abastecimiento; string-safe).
-- Se aplica con psql (drizzle push no ve estas tablas nuevas).
--
-- INVARIANTES DURABLES:
--   * cos_hechos: PK (tenant_id, costo_id). Idempotencia de materialización por
--     índice único (tenant_id, op_id): mismo opId concurrente ⇒ un solo hecho.
--   * SNAPSHOT INMUTABLE: cantidad/costo_unitario/costo_total/moneda/fuente NO se
--     actualizan tras materializar; sólo el estado transita ACTIVO→ANULADO.
--   * cos_recibos: idempotencia de comandos por (tenant, comando, op_id).
--   * cos_eventos: bitácora durable idempotente por event_id.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) HECHOS ECONÓMICOS (identidad del hecho + snapshot congelado + auditoría).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.cos_hechos (
  tenant_id text NOT NULL,
  costo_id text NOT NULL,
  tipo text NOT NULL,                      -- 'MATERIAL' | 'COMBUSTIBLE' | 'MANO_DE_OBRA' | 'OTROS'
  origin_type text NOT NULL,               -- origen auditable (nunca texto libre suelto)
  origin_id text NOT NULL,                 -- identificador canónico en la fuente
  ot_id text NOT NULL,                     -- OT verificada por contrato público
  activo_id text,                          -- derivado de la relación canónica OT→activo (nunca del frontend)
  identity_id text,                        -- identidad canónica atribuible (NULL si no aplica)
  op_id text NOT NULL,                     -- idempotencia de la materialización
  estado text NOT NULL DEFAULT 'ACTIVO',   -- 'ACTIVO' | 'ANULADO'
  -- ---- SNAPSHOT congelado (punto fijo string-safe) ----
  cantidad numeric(18,6) NOT NULL,
  unidad text NOT NULL,
  costo_unitario numeric(18,6) NOT NULL,   -- costo exacto en el momento de materializar
  costo_total numeric(18,6) NOT NULL,      -- cantidad × costo_unitario (derivado en dominio)
  moneda text NOT NULL,                    -- explícita por hecho; nunca se convierte/suma
  fuente jsonb NOT NULL DEFAULT '{}'::jsonb, -- copia CRUDA de la fuente (auditoría del origen)
  ocurrido_at timestamptz NOT NULL,        -- momento en que el costo OCURRIÓ
  -- ---- Auditoría del ciclo de vida ----
  registrado_at timestamptz NOT NULL,      -- server-time de la materialización
  registrado_por text NOT NULL,
  anulado_at timestamptz,
  anulado_por text,
  motivo_anulacion text,
  PRIMARY KEY (tenant_id, costo_id),
  CONSTRAINT chk_cos_hechos_tipo CHECK (tipo IN ('MATERIAL','COMBUSTIBLE','MANO_DE_OBRA','OTROS')),
  CONSTRAINT chk_cos_hechos_estado CHECK (estado IN ('ACTIVO','ANULADO')),
  CONSTRAINT chk_cos_hechos_cantidad CHECK (cantidad >= 0),
  CONSTRAINT chk_cos_hechos_unitario CHECK (costo_unitario >= 0),
  CONSTRAINT chk_cos_hechos_total CHECK (costo_total >= 0),
  CONSTRAINT chk_cos_hechos_anulacion CHECK (
    (estado = 'ANULADO' AND anulado_at IS NOT NULL AND anulado_por IS NOT NULL AND motivo_anulacion IS NOT NULL)
    OR (estado = 'ACTIVO' AND anulado_at IS NULL AND anulado_por IS NULL AND motivo_anulacion IS NULL)
  )
);

-- Idempotencia de materialización a nivel de base: mismo (tenant, op_id) ⇒ una
-- sola fila aunque haya dos comandos concurrentes con el mismo opId.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cos_hechos_opid
  ON deltaops.cos_hechos (tenant_id, op_id);

CREATE INDEX IF NOT EXISTS idx_cos_hechos_ot
  ON deltaops.cos_hechos (tenant_id, ot_id);
CREATE INDEX IF NOT EXISTS idx_cos_hechos_activo
  ON deltaops.cos_hechos (tenant_id, activo_id);
CREATE INDEX IF NOT EXISTS idx_cos_hechos_tipo
  ON deltaops.cos_hechos (tenant_id, tipo);
CREATE INDEX IF NOT EXISTS idx_cos_hechos_moneda
  ON deltaops.cos_hechos (tenant_id, moneda);
CREATE INDEX IF NOT EXISTS idx_cos_hechos_periodo
  ON deltaops.cos_hechos (tenant_id, ocurrido_at);
CREATE INDEX IF NOT EXISTS idx_cos_hechos_estado
  ON deltaops.cos_hechos (tenant_id, estado);

-- ---------------------------------------------------------------------------
-- 2) RECIBOS de idempotencia de comandos (claim durable ANTES de efectos).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.cos_recibos (
  tenant_id text NOT NULL,
  comando text NOT NULL,
  op_id text NOT NULL,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'sellado'
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, comando, op_id)
);

-- ---------------------------------------------------------------------------
-- 3) BITÁCORA durable de eventos (fuente de replay; idempotente por event_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.cos_eventos (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  registrado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cos_eventos_tenant
  ON deltaops.cos_eventos (tenant_id, occurred_at);

-- ===========================================================================
-- RLS por tenant en TODAS las tablas nuevas (patrón 0043).
-- ===========================================================================
ALTER TABLE deltaops.cos_hechos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.cos_recibos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.cos_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cos_hechos_iso ON deltaops.cos_hechos;
CREATE POLICY cos_hechos_iso ON deltaops.cos_hechos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS cos_recibos_iso ON deltaops.cos_recibos;
CREATE POLICY cos_recibos_iso ON deltaops.cos_recibos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS cos_eventos_iso ON deltaops.cos_eventos;
CREATE POLICY cos_eventos_iso ON deltaops.cos_eventos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
