-- DGP-008.2 · Módulo Activos Empresariales — Persistencia operacional, CQRS,
-- relaciones e historial. ADITIVA sobre 0007: no toca ni redefine sus tablas.
-- Toda tabla nueva lleva RLS por tenant con app.tenant_id (set_config
-- transaccional), idéntico patrón a 0004/0005/0007. 100% idempotente.

-- ===========================================================================
-- 1) Relaciones entre activos (grafo dirigido tipado). Fuente de verdad de las
--    relaciones (padre/hijo, depende-de, componente-de, …). El tipo declara su
--    inverso en el dominio; aquí se materializa una fila por sentido declarado.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.act_relaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  tipo text NOT NULL,
  origen_id text NOT NULL,
  destino_id text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_act_relaciones_arista
  ON deltaops.act_relaciones (tenant_id, tipo, origen_id, destino_id);

CREATE INDEX IF NOT EXISTS idx_act_relaciones_origen
  ON deltaops.act_relaciones (tenant_id, origen_id, tipo);

CREATE INDEX IF NOT EXISTS idx_act_relaciones_destino
  ON deltaops.act_relaciones (tenant_id, destino_id, tipo);

-- ===========================================================================
-- 2) Read model de ÁRBOL jerárquico / relacionados / componentes. Proyección
--    SOLO desde el payload de los eventos de relación (idempotente por
--    last_event_id). Se consulta por origen o destino.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.act_relaciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  tipo text NOT NULL,
  categoria text NOT NULL,             -- 'jerarquia' | 'dependencia' | 'componente' | 'asociacion' | 'sustitucion'
  origen_id text NOT NULL,
  origen_codigo text,
  origen_nombre text,
  destino_id text NOT NULL,
  destino_codigo text,
  destino_nombre text,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_act_relaciones_read_origen
  ON deltaops.act_relaciones_read (tenant_id, origen_id, categoria);

CREATE INDEX IF NOT EXISTS idx_act_relaciones_read_destino
  ON deltaops.act_relaciones_read (tenant_id, destino_id, categoria);

-- ===========================================================================
-- 3) Historial de UBICACIONES (append-only). Proyección desde
--    modulo.activos.ubicacion-actualizada (y creación con ubicación).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.act_ubicaciones_hist (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  activo_id text NOT NULL,
  ubicacion_id text,
  etiqueta text,
  detalle text,
  coordenadas jsonb,
  version integer NOT NULL,
  actor_id text NOT NULL,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_act_ubic_hist_activo
  ON deltaops.act_ubicaciones_hist (tenant_id, activo_id, registrado_at DESC);

-- ===========================================================================
-- 4) Historial de RESPONSABLES (append-only). Proyección desde
--    modulo.activos.responsable-actualizado (y creación con responsable).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.act_responsables_hist (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  activo_id text NOT NULL,
  responsable text,
  supervisor text,
  version integer NOT NULL,
  actor_id text NOT NULL,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_act_resp_hist_activo
  ON deltaops.act_responsables_hist (tenant_id, activo_id, registrado_at DESC);

-- ===========================================================================
-- 5) Historial / línea de tiempo del MÓDULO (Shared Timeline propio del
--    módulo): una fila por evento de dominio proyectado, append-only. Es la
--    superficie de actividad del activo (NO se escribe jamás en las tablas
--    internas de platform.timeline; el módulo posee su propio feed).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.act_historial (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  activo_id text NOT NULL,
  entity_ref text NOT NULL,
  tipo_evento text NOT NULL,
  estado text,
  version integer NOT NULL,
  actor_id text NOT NULL,
  resumen text NOT NULL,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_act_historial_activo
  ON deltaops.act_historial (tenant_id, activo_id, registrado_at DESC);

CREATE INDEX IF NOT EXISTS idx_act_historial_actor
  ON deltaops.act_historial (tenant_id, actor_id, registrado_at DESC);

-- ===========================================================================
-- RLS por tenant (app.tenant_id fijado con set_config transaccional).
-- ===========================================================================
ALTER TABLE deltaops.act_relaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.act_relaciones_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.act_ubicaciones_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.act_responsables_hist ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.act_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS act_relaciones_tenant_isolation ON deltaops.act_relaciones;
CREATE POLICY act_relaciones_tenant_isolation ON deltaops.act_relaciones
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS act_relaciones_read_tenant_isolation ON deltaops.act_relaciones_read;
CREATE POLICY act_relaciones_read_tenant_isolation ON deltaops.act_relaciones_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS act_ubic_hist_tenant_isolation ON deltaops.act_ubicaciones_hist;
CREATE POLICY act_ubic_hist_tenant_isolation ON deltaops.act_ubicaciones_hist
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS act_resp_hist_tenant_isolation ON deltaops.act_responsables_hist;
CREATE POLICY act_resp_hist_tenant_isolation ON deltaops.act_responsables_hist
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS act_historial_tenant_isolation ON deltaops.act_historial;
CREATE POLICY act_historial_tenant_isolation ON deltaops.act_historial
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
