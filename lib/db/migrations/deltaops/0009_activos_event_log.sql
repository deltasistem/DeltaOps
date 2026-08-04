-- DGP-008.2 (fix MAYOR reproyección) · Módulo Activos — Bitácora de eventos
-- durable e íntegra del módulo (event log canónico), independiente del outbox
-- transaccional del Kernel y de su retención/estado de procesamiento.
--
-- Motivación: el outbox (kernel_outbox) NO es un event store: filtra por
-- processed_at y está sujeto a retención/limpieza. Reconstruir los read models
-- desde el outbox deja la reconstrucción incompleta tras un fallo del procesador
-- (eventos pendientes) o tras la retención (eventos borrados). Esta tabla es la
-- fuente de verdad del replay del módulo. Se escribe en la MISMA UoW que emite
-- cada evento del módulo (tabla PROPIA del módulo, no de plataforma).
--
-- ADITIVA sobre 0008; RLS por tenant con app.tenant_id (set_config
-- transaccional), idéntico patrón. 100% idempotente.

CREATE TABLE IF NOT EXISTS deltaops.act_eventos (
  tenant_id text NOT NULL,
  event_id text NOT NULL,
  tipo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id)
);

-- Orden de replay determinista: occurred_at asc, event_id asc (desempate).
CREATE INDEX IF NOT EXISTS idx_act_eventos_stream
  ON deltaops.act_eventos (tenant_id, occurred_at, event_id);

ALTER TABLE deltaops.act_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS act_eventos_tenant_isolation ON deltaops.act_eventos;
CREATE POLICY act_eventos_tenant_isolation ON deltaops.act_eventos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ===========================================================================
-- Puente único (best-effort): backfill de eventos del módulo YA emitidos en el
-- outbox hacia la bitácora, para no perder historia previa a esta subfase. A
-- partir de aquí la bitácora se puebla en línea (misma UoW que registerEvent).
-- Idempotente (ON CONFLICT DO NOTHING). No falla si el outbox fue purgado.
-- ===========================================================================
INSERT INTO deltaops.act_eventos (tenant_id, event_id, tipo, payload, occurred_at)
SELECT (o.payload->>'tenantId') AS tenant_id,
       o.id AS event_id,
       o.event_type AS tipo,
       o.payload,
       o.occurred_at
FROM deltaops.kernel_outbox o
WHERE o.event_type LIKE 'modulo.activos.%'
  AND o.payload->>'tenantId' IS NOT NULL
ON CONFLICT (tenant_id, event_id) DO NOTHING;
