-- DGP-015 · Módulo Enterprise Corrective Maintenance — Persistencia base.
-- Tablas PROPIAS del módulo (prefijo cor_), NUNCA Record Store (reservado a
-- catálogos). Aggregates versionados optimistamente (columna `version`); el
-- estado completo vive en `datos` (JSONB, fuente de reconstrucción) y las
-- columnas planas son sólo para filtrar/indexar. ADITIVA; RLS por tenant con
-- app.tenant_id (set_config transaccional) como 0024 (lección 004: RLS en
-- LECTURAS y ESCRITURAS). 100% idempotente.

-- ===========================================================================
-- 1) Aggregates (fuente de verdad de escritura).
-- ===========================================================================

-- Solicitud de mantenimiento correctivo (aggregate raíz; ciclo NEUTRO gobernado
-- por Workflow Engine).
CREATE TABLE IF NOT EXISTS deltaops.cor_solicitudes (
  tenant_id text NOT NULL,
  id text NOT NULL,
  codigo text NOT NULL,
  titulo text NOT NULL,
  origen text NOT NULL,
  activo_id text,
  prioridad text NOT NULL,
  criticidad text,
  estado text NOT NULL,
  diagnostico_id text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cor_solicitudes_codigo ON deltaops.cor_solicitudes (tenant_id, lower(codigo));
CREATE INDEX IF NOT EXISTS idx_cor_solicitudes_estado ON deltaops.cor_solicitudes (tenant_id, estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cor_solicitudes_origen ON deltaops.cor_solicitudes (tenant_id, origen);
CREATE INDEX IF NOT EXISTS idx_cor_solicitudes_activo ON deltaops.cor_solicitudes (tenant_id, activo_id);

-- Diagnóstico (Dynamic Forms). Uno por solicitud (referencia a plantilla+versión).
CREATE TABLE IF NOT EXISTS deltaops.cor_diagnosticos (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  plantilla_id text NOT NULL,
  plantilla_version integer NOT NULL,
  causa_raiz text,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  registrado_por text NOT NULL,
  registrado_en timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_diagnosticos_solicitud ON deltaops.cor_diagnosticos (tenant_id, solicitud_id);

-- Intervención correctiva (ejecución multi-cuadrilla; ciclo NEUTRO gobernado).
CREATE TABLE IF NOT EXISTS deltaops.cor_intervenciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  orden_trabajo_id text NOT NULL,
  activo_id text NOT NULL,
  mayor boolean NOT NULL DEFAULT false,
  estado text NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_intervenciones_solicitud ON deltaops.cor_intervenciones (tenant_id, solicitud_id);
CREATE INDEX IF NOT EXISTS idx_cor_intervenciones_estado ON deltaops.cor_intervenciones (tenant_id, estado, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cor_intervenciones_activo ON deltaops.cor_intervenciones (tenant_id, activo_id);

-- Generación de OT correctiva (solicitud aprobada → OT; guard anti-duplicado).
CREATE TABLE IF NOT EXISTS deltaops.cor_generaciones (
  tenant_id text NOT NULL,
  id text NOT NULL,
  solicitud_id text NOT NULL,
  activo_id text NOT NULL,
  clave_dedup text NOT NULL,
  orden_trabajo_id text,
  estado text NOT NULL DEFAULT 'pendiente',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  generada_por text NOT NULL,
  generada_en timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cor_generaciones_dedup ON deltaops.cor_generaciones (tenant_id, clave_dedup);
CREATE INDEX IF NOT EXISTS idx_cor_generaciones_solicitud ON deltaops.cor_generaciones (tenant_id, solicitud_id, generada_en DESC);
CREATE INDEX IF NOT EXISTS idx_cor_generaciones_estado ON deltaops.cor_generaciones (tenant_id, estado);

-- Vínculo DURABLE generación → orden de trabajo materializada (ORQUESTACIÓN).
-- Clave de dedup ÚNICA por claveDedup ⇒ NUNCA se duplica una OT aunque se
-- reintente/concurra/reproyecte (lección 009.3/012). `vincular` guarda con
-- guard atómico `orden_trabajo_id IS NULL`.
CREATE TABLE IF NOT EXISTS deltaops.cor_generacion_materializaciones (
  tenant_id text NOT NULL,
  clave_dedup text NOT NULL,
  generacion_id text NOT NULL,
  orden_trabajo_id text,
  estado text NOT NULL DEFAULT 'pendiente',
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, clave_dedup)
);
CREATE INDEX IF NOT EXISTS idx_cor_gen_mat_generacion ON deltaops.cor_generacion_materializaciones (tenant_id, generacion_id);

-- Eventos de historial del ACTIVO (fallas/reparaciones; insumos crudos de KPIs).
-- Alimenta la detección de reincidencia (mismo modo-falla en ventana temporal).
CREATE TABLE IF NOT EXISTS deltaops.cor_eventos_activo (
  tenant_id text NOT NULL,
  id text NOT NULL,
  activo_id text NOT NULL,
  solicitud_id text,
  orden_trabajo_id text,
  tipo text NOT NULL,
  modo_falla text,
  ocurrido_en timestamptz NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  registrado_por text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_eventos_activo_ref ON deltaops.cor_eventos_activo (tenant_id, activo_id, ocurrido_en);
CREATE INDEX IF NOT EXISTS idx_cor_eventos_activo_modo ON deltaops.cor_eventos_activo (tenant_id, activo_id, modo_falla, ocurrido_en);

-- Historial auditable (hechos append-only). Embebe el tenant en el id
-- (`${tenant}::${uuid}`) — el dominio de historial no lleva tenantId propio.
CREATE TABLE IF NOT EXISTS deltaops.cor_historial (
  tenant_id text NOT NULL,
  id text NOT NULL,
  entity_ref text NOT NULL,
  hito text NOT NULL,
  version integer NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  ocurrido_en timestamptz NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cor_historial_ref ON deltaops.cor_historial (tenant_id, entity_ref, ocurrido_en);

-- ===========================================================================
-- 2) Recibos durables de sincronización offline (reclamación durable de opId).
--    Protocolo claim → ejecutar → finalize/release (lección 008.1).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.cor_sync_receipts (
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
-- 3) Bitácora de eventos durable (event log canónico), fuente del REPLAY.
--    Se escribe en la MISMA UoW que emite el evento, con el MISMO event.id que
--    el outbox del Kernel (el outbox NO es event store — lección 008.2).
-- ===========================================================================
CREATE TABLE IF NOT EXISTS deltaops.cor_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_cor_eventos_stream ON deltaops.cor_eventos (tenant_id, occurred_at, event_id);

-- ===========================================================================
-- RLS por tenant (app.tenant_id): LECTURAS y ESCRITURAS por igual (lección 004).
-- ===========================================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'cor_solicitudes','cor_diagnosticos','cor_intervenciones','cor_generaciones',
    'cor_generacion_materializaciones','cor_eventos_activo','cor_historial',
    'cor_sync_receipts','cor_eventos'
  ]) LOOP
    EXECUTE format('ALTER TABLE deltaops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON deltaops.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON deltaops.%I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;
