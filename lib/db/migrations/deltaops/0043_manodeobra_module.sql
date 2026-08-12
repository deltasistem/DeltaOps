-- ===========================================================================
-- DGP-020.3 · Fundación de Mano de Obra (módulo `modulo.manodeobra`).
--
-- Determina de forma AUDITABLE quién trabajó, en qué OT, sobre qué activo,
-- cuánto tiempo EFECTIVO, categoría, tarifa vigente, costo derivado, tenant,
-- momento y fuente del tiempo. La FUENTE ÚNICA de tiempo es DGP-020.2 (sesiones);
-- el `efectivo_ms` se COPIA (snapshot documentado) — NUNCA se recalcula aquí.
--
-- ADITIVA, idempotente y NO destructiva. RLS por tenant (app.tenant_id) en TODAS
-- las tablas. Dinero en numeric(18,6) (convención Abastecimiento). Se aplica con
-- psql (drizzle push no ve estas tablas nuevas). Las CATEGORÍAS viven en el
-- Record Store de plataforma (deltaops.platform_records), no aquí.
--
-- INVARIANTES DURABLES:
--   * mdo_recursos: identidad canónica única por tenant (PK).
--   * mdo_tarifas: a lo sumo UNA vigencia ABIERTA por (tenant, sujeto) — índice
--     único parcial (el no-solape total se valida en dominio + serialización).
--   * mdo_valoraciones: idempotencia por (tenant_id, sesion_id) — PK. Reprocesar
--     NO duplica.
--   * mdo_recibos: idempotencia de comandos por (tenant, comando, op_id).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) RECURSOS humanos (agregado ligero). Nombre NO se persiste (se resuelve por
--    puerto). Estado ACTIVO|INACTIVO; jamás se borra.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.mdo_recursos (
  tenant_id text NOT NULL,
  identity_id text NOT NULL,               -- identidad canónica (nunca del frontend)
  categoria_clave text NOT NULL,           -- clave del catálogo categorias-mdo
  estado text NOT NULL DEFAULT 'ACTIVO',   -- 'ACTIVO' | 'INACTIVO'
  creado_at timestamptz NOT NULL,
  actualizado_at timestamptz NOT NULL,
  creado_por text NOT NULL,
  actualizado_por text NOT NULL,
  PRIMARY KEY (tenant_id, identity_id)
);

CREATE INDEX IF NOT EXISTS idx_mdo_recursos_categoria
  ON deltaops.mdo_recursos (tenant_id, categoria_clave);

-- ---------------------------------------------------------------------------
-- 2) TARIFAS versionables. sujeto_tipo='CATEGORIA' hoy; 'IDENTIDAD' admitido a
--    futuro sin romper snapshots. Cambiar = cerrar vigencia + nueva fila (nunca
--    sobrescribir una tarifa histórica utilizada).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.mdo_tarifas (
  id text NOT NULL,
  tenant_id text NOT NULL,
  sujeto_tipo text NOT NULL,               -- 'CATEGORIA' | 'IDENTIDAD'
  sujeto_id text NOT NULL,                 -- categoriaClave (o identityId futuro)
  valor numeric(18,6) NOT NULL,            -- convención monetaria Abastecimiento
  moneda text NOT NULL,                    -- explícita por fila (de la config del tenant)
  unidad text NOT NULL DEFAULT 'HORA',     -- única soportada
  vigencia_desde timestamptz NOT NULL,
  vigencia_hasta timestamptz,              -- NULL = abierta
  estado text NOT NULL,                    -- 'VIGENTE' | 'CERRADA'
  valor_anterior numeric(18,6),            -- auditoría del cambio (§24)
  motivo text,
  creado_at timestamptz NOT NULL,
  creado_por text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  actualizado_por text NOT NULL,
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT chk_mdo_tarifas_valor_nn CHECK (valor >= 0),
  CONSTRAINT chk_mdo_tarifas_unidad CHECK (unidad = 'HORA'),
  CONSTRAINT chk_mdo_tarifas_vigencia CHECK (vigencia_hasta IS NULL OR vigencia_hasta > vigencia_desde)
);

CREATE INDEX IF NOT EXISTS idx_mdo_tarifas_sujeto
  ON deltaops.mdo_tarifas (tenant_id, sujeto_tipo, sujeto_id, vigencia_desde);

-- A lo sumo UNA vigencia ABIERTA por (tenant, sujeto): el índice único parcial
-- rechaza en la base una segunda vigencia abierta concurrente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdo_tarifas_abierta
  ON deltaops.mdo_tarifas (tenant_id, sujeto_tipo, sujeto_id)
  WHERE vigencia_hasta IS NULL;

-- ---------------------------------------------------------------------------
-- 3) VALORACIONES (snapshot histórico inmutable de la mano de obra por sesión).
--    Una fila por sesión CERRADA. costo NULL cuando SIN_TARIFA/SIN_RECURSO
--    (jamás 0). Idempotencia por (tenant_id, sesion_id) = PK.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.mdo_valoraciones (
  tenant_id text NOT NULL,
  sesion_id text NOT NULL,                 -- id de la sesión DGP-020.2
  orden_id text NOT NULL,
  activo_id text,                          -- derivado de la OT (nunca del frontend)
  identity_id text NOT NULL,               -- identidad canónica de la sesión
  categoria_clave text,                    -- NULL si SIN_RECURSO
  tarifa_id text,                          -- NULL si SIN_TARIFA/SIN_RECURSO
  tarifa_valor numeric(18,6),              -- snapshot del valor aplicado
  moneda text,
  unidad text,
  efectivo_ms bigint NOT NULL,             -- COPIA (snapshot) del efectivo_ms de DGP-020.2
  costo numeric(18,6),                     -- NULL cuando no se pudo valorar
  estado text NOT NULL,                    -- 'VALORADA' | 'SIN_TARIFA' | 'SIN_RECURSO'
  vigencia_desde timestamptz,              -- vigencia de la tarifa aplicada
  vigencia_hasta timestamptz,
  cruza_periodos boolean NOT NULL DEFAULT false,
  iniciado_at timestamptz NOT NULL,        -- de la sesión (device-time)
  cerrado_at timestamptz,
  valorado_at timestamptz NOT NULL,        -- server-time de la valoración
  valorado_por text NOT NULL,
  PRIMARY KEY (tenant_id, sesion_id),
  CONSTRAINT chk_mdo_valoraciones_estado CHECK (estado IN ('VALORADA','SIN_TARIFA','SIN_RECURSO')),
  CONSTRAINT chk_mdo_valoraciones_efectivo CHECK (efectivo_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_mdo_valoraciones_orden
  ON deltaops.mdo_valoraciones (tenant_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_mdo_valoraciones_activo
  ON deltaops.mdo_valoraciones (tenant_id, activo_id);
CREATE INDEX IF NOT EXISTS idx_mdo_valoraciones_identity
  ON deltaops.mdo_valoraciones (tenant_id, identity_id);
CREATE INDEX IF NOT EXISTS idx_mdo_valoraciones_estado
  ON deltaops.mdo_valoraciones (tenant_id, estado);

-- ---------------------------------------------------------------------------
-- 4) RECIBOS de idempotencia de comandos (claim durable ANTES de efectos).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.mdo_recibos (
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
-- 5) BITÁCORA durable de eventos (fuente de replay; idempotente por event_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.mdo_eventos (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  registrado_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mdo_eventos_tenant
  ON deltaops.mdo_eventos (tenant_id, occurred_at);

-- ===========================================================================
-- RLS por tenant en TODAS las tablas nuevas (patrón 0042).
-- ===========================================================================
ALTER TABLE deltaops.mdo_recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.mdo_tarifas ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.mdo_valoraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.mdo_recibos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.mdo_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mdo_recursos_iso ON deltaops.mdo_recursos;
CREATE POLICY mdo_recursos_iso ON deltaops.mdo_recursos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS mdo_tarifas_iso ON deltaops.mdo_tarifas;
CREATE POLICY mdo_tarifas_iso ON deltaops.mdo_tarifas
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS mdo_valoraciones_iso ON deltaops.mdo_valoraciones;
CREATE POLICY mdo_valoraciones_iso ON deltaops.mdo_valoraciones
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS mdo_recibos_iso ON deltaops.mdo_recibos;
CREATE POLICY mdo_recibos_iso ON deltaops.mdo_recibos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS mdo_eventos_iso ON deltaops.mdo_eventos;
CREATE POLICY mdo_eventos_iso ON deltaops.mdo_eventos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
