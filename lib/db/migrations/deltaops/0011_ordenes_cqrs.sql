-- DGP-009.2 · Módulo Órdenes de Trabajo — CQRS: Read Models especializados.
-- TODA consulta del módulo se sirve EXCLUSIVAMENTE desde estos read models,
-- proyectados SOLO desde el payload de eventos autosuficientes (idempotentes por
-- last_event_id). ADITIVA sobre 0010; RLS por tenant (app.tenant_id). Idempotente.

-- ===========================================================================
-- 1) Read model de LISTADO/DETALLE (resumen del aggregate). Sirve `listar` y
--    `detalle`. Proyección idempotente por (last_event_id, version).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_ordenes_read (
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
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_ordenes_read_estado
  ON deltaops.ord_ordenes_read (tenant_id, estado, actualizado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ord_ordenes_read_tipo
  ON deltaops.ord_ordenes_read (tenant_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ord_ordenes_read_responsable
  ON deltaops.ord_ordenes_read (tenant_id, responsable);
CREATE INDEX IF NOT EXISTS idx_ord_ordenes_read_activo
  ON deltaops.ord_ordenes_read (tenant_id, activo_principal_id);

-- ===========================================================================
-- 2) Read model de AGENDA / CALENDARIO. Ventanas planificadas (inicio/fin),
--    estado de programación y conflicto. Sirve `agenda` y `calendario`.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_agenda_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  titulo text NOT NULL,
  estado text NOT NULL,
  responsable text,
  inicio_planificado timestamptz,
  fin_planificado timestamptz,
  ventana_inicio timestamptz,
  ventana_fin timestamptz,
  programacion_estado text,          -- 'programada' | 'reprogramada' | 'sin-programar'
  en_conflicto boolean NOT NULL DEFAULT false,
  version integer NOT NULL,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_agenda_read_inicio
  ON deltaops.ord_agenda_read (tenant_id, inicio_planificado);
CREATE INDEX IF NOT EXISTS idx_ord_agenda_read_responsable
  ON deltaops.ord_agenda_read (tenant_id, responsable, inicio_planificado);

-- ===========================================================================
-- 3) Read model de ASIGNACIONES (histórico completo append-only). Personas,
--    grupos, cuadrillas y contratistas. Sirve `asignaciones`.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_asignaciones_read (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  orden_id text NOT NULL,
  tipo text NOT NULL,                -- 'persona' | 'grupo' | 'cuadrilla' | 'contratista'
  asignado_id text NOT NULL,
  rol text,                          -- 'responsable' | 'colaborador' | 'supervisor'
  vigente boolean NOT NULL DEFAULT true,
  version integer NOT NULL,
  actor_id text NOT NULL,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_asignaciones_read_orden
  ON deltaops.ord_asignaciones_read (tenant_id, orden_id, registrado_at DESC);
CREATE INDEX IF NOT EXISTS idx_ord_asignaciones_read_asignado
  ON deltaops.ord_asignaciones_read (tenant_id, asignado_id, vigente);

-- ===========================================================================
-- 4) Read model de RESPONSABLES (histórico de cambios de responsable/supervisor).
--    Sirve `responsables`.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_responsables_read (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  orden_id text NOT NULL,
  responsable text,
  supervisor text,
  version integer NOT NULL,
  actor_id text NOT NULL,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_responsables_read_orden
  ON deltaops.ord_responsables_read (tenant_id, orden_id, registrado_at DESC);

-- ===========================================================================
-- 5) Read model de RELACIONES (OT↔Activos, OT↔OT, OT↔Recursos, etc.). Grafo
--    tipado. Sirve `activos relacionados` y `dependencias`.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_relaciones_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  categoria text NOT NULL,           -- 'activo' | 'orden' | 'formulario' | 'checklist' | 'evidencia' | 'recurso'
  tipo text NOT NULL,                -- subtipo declarativo (p.ej. 'depende-de','bloquea','activo-principal')
  orden_id text NOT NULL,
  destino_id text NOT NULL,
  destino_codigo text,
  destino_nombre text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_relaciones_read_orden
  ON deltaops.ord_relaciones_read (tenant_id, orden_id, categoria);
CREATE INDEX IF NOT EXISTS idx_ord_relaciones_read_destino
  ON deltaops.ord_relaciones_read (tenant_id, destino_id, categoria);

-- ===========================================================================
-- 6) Read model de HISTORIAL (línea de tiempo interna del módulo, append-only).
--    Sirve `historial`. NO es el Shared Timeline (ese es platform.timeline).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_historial_read (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  orden_id text NOT NULL,
  tipo text NOT NULL,
  resumen text NOT NULL,
  actor_id text,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_historial_read_orden
  ON deltaops.ord_historial_read (tenant_id, orden_id, registrado_at DESC, event_id);

-- ===========================================================================
-- 7) Read model de BITÁCORA OPERACIONAL (append-only). Inicio, pausa,
--    reanudación, espera, cambio de responsable, llegada, salida, finalización.
--    Sirve `bitácora operacional`. SOLO se puebla desde eventos.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_bitacora_read (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  orden_id text NOT NULL,
  accion text NOT NULL,              -- 'inicio'|'pausa'|'reanudacion'|'espera'|'cambio-responsable'|'llegada'|'salida'|'finalizacion'
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text,
  ocurrido_at timestamptz NOT NULL,
  registrado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_bitacora_read_orden
  ON deltaops.ord_bitacora_read (tenant_id, orden_id, ocurrido_at DESC, event_id);
CREATE INDEX IF NOT EXISTS idx_ord_bitacora_read_accion
  ON deltaops.ord_bitacora_read (tenant_id, accion);

-- ===========================================================================
-- 8) Read model de DOCUMENTACIÓN / FORMULARIOS / CHECKLISTS. Referencias
--    (plantilla+versión+respuesta) asociadas a la OT. Sirve `documentacion`,
--    `formularios` y `checklists` filtrando por `clase`.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_documentacion_read (
  tenant_id text NOT NULL,
  id text NOT NULL,
  orden_id text NOT NULL,
  clase text NOT NULL,               -- 'formulario' | 'checklist' | 'evidencia' | 'documento'
  referencia_clave text,
  referencia_version integer,
  respuesta_id text,
  titulo text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_id text NOT NULL,
  actualizado_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_documentacion_read_orden
  ON deltaops.ord_documentacion_read (tenant_id, orden_id, clase);

-- ===========================================================================
-- RLS por tenant en TODOS los read models (lecturas y escrituras de proyección).
-- ===========================================================================
ALTER TABLE deltaops.ord_ordenes_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_agenda_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_asignaciones_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_responsables_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_relaciones_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_historial_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_bitacora_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_documentacion_read ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ord_ordenes_read_iso ON deltaops.ord_ordenes_read;
CREATE POLICY ord_ordenes_read_iso ON deltaops.ord_ordenes_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_agenda_read_iso ON deltaops.ord_agenda_read;
CREATE POLICY ord_agenda_read_iso ON deltaops.ord_agenda_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_asignaciones_read_iso ON deltaops.ord_asignaciones_read;
CREATE POLICY ord_asignaciones_read_iso ON deltaops.ord_asignaciones_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_responsables_read_iso ON deltaops.ord_responsables_read;
CREATE POLICY ord_responsables_read_iso ON deltaops.ord_responsables_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_relaciones_read_iso ON deltaops.ord_relaciones_read;
CREATE POLICY ord_relaciones_read_iso ON deltaops.ord_relaciones_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_historial_read_iso ON deltaops.ord_historial_read;
CREATE POLICY ord_historial_read_iso ON deltaops.ord_historial_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_bitacora_read_iso ON deltaops.ord_bitacora_read;
CREATE POLICY ord_bitacora_read_iso ON deltaops.ord_bitacora_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_documentacion_read_iso ON deltaops.ord_documentacion_read;
CREATE POLICY ord_documentacion_read_iso ON deltaops.ord_documentacion_read
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
