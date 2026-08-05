-- DGP-009.2 · Módulo Órdenes de Trabajo — Motor operacional (fuente de verdad
-- de escritura): planificación, asignaciones, recursos, SLA y relaciones.
-- Las proyecciones de lectura viven en 0011 (read models). ADITIVA sobre 0011;
-- RLS por tenant (app.tenant_id, set_config transaccional). 100% idempotente.

-- ===========================================================================
-- 1) PLANIFICACIÓN (declarativa). Agenda/programación/reprogramación con
--    ventanas y bloqueos. `conflicto` marca solapes detectados (declarativo).
--    Una fila por OT (estado de programación vigente).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_planificacion (
  tenant_id text NOT NULL,
  orden_id text NOT NULL,
  inicio_planificado timestamptz,
  fin_planificado timestamptz,
  ventana_inicio timestamptz,
  ventana_fin timestamptz,
  estado text NOT NULL DEFAULT 'sin-programar',   -- 'sin-programar'|'programada'|'reprogramada'|'bloqueada'
  bloqueo_motivo text,
  en_conflicto boolean NOT NULL DEFAULT false,
  reprogramaciones integer NOT NULL DEFAULT 0,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, orden_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_planificacion_inicio
  ON deltaops.ord_planificacion (tenant_id, inicio_planificado);
CREATE INDEX IF NOT EXISTS idx_ord_planificacion_estado
  ON deltaops.ord_planificacion (tenant_id, estado);

-- ===========================================================================
-- 2) ASIGNACIONES (fuente de verdad, append-only con `vigente`). Personas,
--    grupos, cuadrillas y contratistas. Histórico completo.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_asignaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  orden_id text NOT NULL,
  tipo text NOT NULL,               -- 'persona'|'grupo'|'cuadrilla'|'contratista'
  asignado_id text NOT NULL,
  rol text,
  vigente boolean NOT NULL DEFAULT true,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_asignaciones_orden
  ON deltaops.ord_asignaciones (tenant_id, orden_id, vigente);
CREATE INDEX IF NOT EXISTS idx_ord_asignaciones_asignado
  ON deltaops.ord_asignaciones (tenant_id, asignado_id, vigente);

-- ===========================================================================
-- 3) RECURSOS (SOLO referencias; NO inventario). Herramientas, materiales, EPP,
--    vehículos, equipos auxiliares. Cantidad es informativa (referencia).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_recursos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  orden_id text NOT NULL,
  clase text NOT NULL,              -- 'herramienta'|'material'|'epp'|'vehiculo'|'equipo-auxiliar'
  referencia_id text NOT NULL,
  descripcion text,
  cantidad numeric,
  unidad text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ord_recursos_orden
  ON deltaops.ord_recursos (tenant_id, orden_id, clase);

-- ===========================================================================
-- 4) SLA OPERATIVO (configurable). Vencimiento, pausas acumuladas, tiempo
--    restante y suspensión. `datos` guarda la política aplicada (por tenant).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_sla (
  tenant_id text NOT NULL,
  orden_id text NOT NULL,
  politica text,
  inicio_at timestamptz,
  vencimiento_at timestamptz,
  minutos_objetivo integer,
  minutos_pausados integer NOT NULL DEFAULT 0,
  minutos_restantes integer,
  suspendido boolean NOT NULL DEFAULT false,
  suspendido_desde timestamptz,
  estado text NOT NULL DEFAULT 'vigente',   -- 'vigente'|'en-riesgo'|'vencido'|'suspendido'|'cumplido'
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, orden_id)
);

CREATE INDEX IF NOT EXISTS idx_ord_sla_vencimiento
  ON deltaops.ord_sla (tenant_id, vencimiento_at);
CREATE INDEX IF NOT EXISTS idx_ord_sla_estado
  ON deltaops.ord_sla (tenant_id, estado);

-- ===========================================================================
-- 5) RELACIONES (fuente de verdad del grafo tipado). OT↔Activos, OT↔OT,
--    OT↔Formularios, OT↔Checklist, OT↔Evidencias, OT↔Recursos.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.ord_relaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  categoria text NOT NULL,          -- 'activo'|'orden'|'formulario'|'checklist'|'evidencia'|'recurso'
  tipo text NOT NULL,
  orden_id text NOT NULL,
  destino_id text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ord_relaciones_arista
  ON deltaops.ord_relaciones (tenant_id, categoria, tipo, orden_id, destino_id);
CREATE INDEX IF NOT EXISTS idx_ord_relaciones_orden
  ON deltaops.ord_relaciones (tenant_id, orden_id, categoria);
CREATE INDEX IF NOT EXISTS idx_ord_relaciones_destino
  ON deltaops.ord_relaciones (tenant_id, destino_id, categoria);

-- ===========================================================================
-- RLS por tenant en todas las tablas operacionales.
-- ===========================================================================
ALTER TABLE deltaops.ord_planificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_recursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE deltaops.ord_relaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ord_planificacion_iso ON deltaops.ord_planificacion;
CREATE POLICY ord_planificacion_iso ON deltaops.ord_planificacion
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_asignaciones_iso ON deltaops.ord_asignaciones;
CREATE POLICY ord_asignaciones_iso ON deltaops.ord_asignaciones
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_recursos_iso ON deltaops.ord_recursos;
CREATE POLICY ord_recursos_iso ON deltaops.ord_recursos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_sla_iso ON deltaops.ord_sla;
CREATE POLICY ord_sla_iso ON deltaops.ord_sla
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ord_relaciones_iso ON deltaops.ord_relaciones;
CREATE POLICY ord_relaciones_iso ON deltaops.ord_relaciones
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
