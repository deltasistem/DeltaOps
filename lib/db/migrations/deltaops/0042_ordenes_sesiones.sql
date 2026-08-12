-- ===========================================================================
-- DGP-020.2 · Sesiones de trabajo y DURACIÓN REAL de las OT.
--
-- Registro operacional AUDITABLE de sesiones de trabajo por OT. La FUENTE DE
-- VERDAD de la duración son los TRAMOS APPEND-ONLY (`ord_sesion_tramos`): la
-- cabecera (`ord_sesiones`) es un derivado de conveniencia. Los read models
-- (`_read`) se proyectan SÓLO desde el payload de eventos (idempotentes por
-- (tenant_id, event_id)). La duración NUNCA se calcula desde el workflow /
-- bitácora / Timeline.
--
-- ADITIVA, idempotente y NO destructiva (nada histórico se altera). RLS por
-- tenant (app.tenant_id) en TODAS las tablas (fuente de verdad, append-only y
-- read models). Vive dentro del esquema `deltaops` del módulo de Órdenes; los
-- comandos son `modulo.ordenes.sesion.{abrir,pausar,reanudar,cerrar}`.
--
-- INVARIANTE DURABLE CLAVE (§16): NO puede haber DOS sesiones ABIERTAS (estado
-- distinto de 'CERRADA') para el mismo (tenant_id, orden_id, identity_id). Se
-- garantiza con un ÍNDICE ÚNICO PARCIAL (no un chequeo de aplicación).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) CABECERA de sesión (fuente de verdad del estado/cerradoAt; derivado de los
--    tramos append-only). Una fila por sesión.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.ord_sesiones (
  tenant_id text NOT NULL,
  id text NOT NULL,                       -- sessionId (id de cliente / uuid)
  orden_id text NOT NULL,                 -- OT (mismo tenant)
  activo_id text,                         -- SIEMPRE derivado de la OT (nunca del frontend)
  identity_id text NOT NULL,              -- identidad autenticada (nunca del frontend)
  estado text NOT NULL,                   -- 'ABIERTA' | 'PAUSADA' | 'CERRADA'
  origen text NOT NULL DEFAULT 'online',  -- 'online' | 'offline'
  iniciado_at timestamptz NOT NULL,       -- ocurridoAt del primer tramo (device-time)
  cerrado_at timestamptz,                 -- ocurridoAt del cierre (NULL mientras abierta)
  registrado_at timestamptz NOT NULL,     -- server-time del alta
  actualizado_at timestamptz NOT NULL,
  op_id text,                             -- opId del comando que abrió la sesión
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_sesiones_orden
  ON deltaops.ord_sesiones (tenant_id, orden_id, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ord_sesiones_identity
  ON deltaops.ord_sesiones (tenant_id, identity_id, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ord_sesiones_activo
  ON deltaops.ord_sesiones (tenant_id, activo_id, iniciado_at DESC);

-- INVARIANTE DURABLE (§16): a lo sumo UNA sesión no cerrada por (tenant, OT,
-- identidad). El índice único PARCIAL rechaza en la base una segunda apertura
-- concurrente (no depende del chequeo de aplicación).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ord_sesiones_abierta
  ON deltaops.ord_sesiones (tenant_id, orden_id, identity_id)
  WHERE estado <> 'CERRADA';

-- ---------------------------------------------------------------------------
-- 2) TRAMOS APPEND-ONLY (FUENTE DE VERDAD de la duración). Inmutables: sólo
--    INSERT. `ocurrido_at` (device-time) nunca se reemplaza; `anomalia_reloj`
--    marca (sin corregir el hecho) futuros/retrocesos/no-monotonicidad.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.ord_sesion_tramos (
  tenant_id text NOT NULL,
  sesion_id text NOT NULL,
  secuencia integer NOT NULL,             -- orden append determinista (0..n)
  tipo text NOT NULL,                     -- 'trabajo' | 'pausa'
  origen text NOT NULL,                   -- 'iniciar' | 'pausar' | 'reanudar' | 'cerrar'
  ocurrido_at timestamptz NOT NULL,       -- device-time (inmutable)
  registrado_at timestamptz NOT NULL,     -- server-time (inmutable)
  anomalia_reloj jsonb,                   -- NULL si no hay anomalía
  identity_id text NOT NULL,
  op_id text,
  event_id text NOT NULL,
  PRIMARY KEY (tenant_id, sesion_id, secuencia)
);

CREATE INDEX IF NOT EXISTS idx_ord_sesion_tramos_sesion
  ON deltaops.ord_sesion_tramos (tenant_id, sesion_id, secuencia);

-- ---------------------------------------------------------------------------
-- 3) READ MODEL de sesión (listado/detalle por OT/identidad/activo). Proyectado
--    idempotentemente desde el payload de eventos (upsert por (tenant, id) con
--    guarda last_event_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.ord_sesiones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  orden_id text NOT NULL,
  activo_id text,
  identity_id text NOT NULL,
  estado text NOT NULL,
  origen text NOT NULL,
  iniciado_at timestamptz NOT NULL,
  cerrado_at timestamptz,
  registrado_at timestamptz NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_sesiones_read_orden
  ON deltaops.ord_sesiones_read (tenant_id, orden_id, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ord_sesiones_read_identity
  ON deltaops.ord_sesiones_read (tenant_id, identity_id, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ord_sesiones_read_activo
  ON deltaops.ord_sesiones_read (tenant_id, activo_id, iniciado_at DESC);
-- Sesión ACTIVA por (OT, identidad): una sola no cerrada.
CREATE INDEX IF NOT EXISTS idx_ord_sesiones_read_activa
  ON deltaops.ord_sesiones_read (tenant_id, orden_id, identity_id)
  WHERE estado <> 'CERRADA';

-- ---------------------------------------------------------------------------
-- 4) READ MODEL de TRAMOS (append-only, una fila por evento). Espejo de la
--    fuente de verdad para consulta CQRS (el frontend NO calcula duración).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.ord_sesion_tramos_read (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  sesion_id text NOT NULL,
  orden_id text NOT NULL,
  secuencia integer NOT NULL,
  tipo text NOT NULL,
  origen text NOT NULL,
  ocurrido_at timestamptz NOT NULL,
  registrado_at timestamptz NOT NULL,
  anomalia_reloj jsonb,
  identity_id text NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_sesion_tramos_read_sesion
  ON deltaops.ord_sesion_tramos_read (tenant_id, sesion_id, secuencia);
CREATE INDEX IF NOT EXISTS idx_ord_sesion_tramos_read_orden
  ON deltaops.ord_sesion_tramos_read (tenant_id, orden_id, ocurrido_at DESC);

-- ---------------------------------------------------------------------------
-- 5) READ MODEL de DURACIONES (resumen derivado de tramos). Se recalcula en cada
--    evento de la sesión desde la secuencia completa de tramos (idempotente por
--    (tenant, sesion) con guarda last_event_id). El frontend consume esto tal
--    cual: NUNCA recalcula.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.ord_sesion_duraciones_read (
  tenant_id text NOT NULL,
  sesion_id text NOT NULL,
  orden_id text NOT NULL,
  activo_id text,
  identity_id text NOT NULL,
  estado text NOT NULL,
  efectivo_ms bigint NOT NULL DEFAULT 0,
  pausado_ms bigint NOT NULL DEFAULT 0,
  transcurrido_ms bigint NOT NULL DEFAULT 0,
  pausas integer NOT NULL DEFAULT 0,
  abierta boolean NOT NULL DEFAULT true,
  iniciado_at timestamptz NOT NULL,
  cerrado_at timestamptz,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, sesion_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_sesion_duraciones_read_orden
  ON deltaops.ord_sesion_duraciones_read (tenant_id, orden_id);
CREATE INDEX IF NOT EXISTS idx_ord_sesion_duraciones_read_activo
  ON deltaops.ord_sesion_duraciones_read (tenant_id, activo_id);
CREATE INDEX IF NOT EXISTS idx_ord_sesion_duraciones_read_identity
  ON deltaops.ord_sesion_duraciones_read (tenant_id, identity_id);

-- ===========================================================================
-- RLS por tenant en TODAS las tablas (fuente de verdad, append-only y reads).
-- ===========================================================================
ALTER TABLE deltaops.ord_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_sesion_tramos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_sesiones_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_sesion_tramos_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_sesion_duraciones_read ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ord_sesiones_iso ON deltaops.ord_sesiones;
CREATE POLICY ord_sesiones_iso ON deltaops.ord_sesiones
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_sesion_tramos_iso ON deltaops.ord_sesion_tramos;
CREATE POLICY ord_sesion_tramos_iso ON deltaops.ord_sesion_tramos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_sesiones_read_iso ON deltaops.ord_sesiones_read;
CREATE POLICY ord_sesiones_read_iso ON deltaops.ord_sesiones_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_sesion_tramos_read_iso ON deltaops.ord_sesion_tramos_read;
CREATE POLICY ord_sesion_tramos_read_iso ON deltaops.ord_sesion_tramos_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_sesion_duraciones_read_iso ON deltaops.ord_sesion_duraciones_read;
CREATE POLICY ord_sesion_duraciones_read_iso ON deltaops.ord_sesion_duraciones_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
