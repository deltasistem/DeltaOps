-- DeltaOps · DGP-002 · Migración 0002 — infraestructura del Kernel
-- Outbox transaccional y dead letter del Kernel (esquema deltaops).

CREATE TABLE IF NOT EXISTS deltaops.kernel_outbox (
  id uuid PRIMARY KEY,
  event_type varchar(255) NOT NULL,
  payload jsonb NOT NULL,
  correlation_id varchar(255) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_kernel_outbox_pending
  ON deltaops.kernel_outbox (occurred_at)
  WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS deltaops.kernel_dead_letter (
  id uuid PRIMARY KEY,
  event_type varchar(255) NOT NULL,
  payload jsonb NOT NULL,
  correlation_id varchar(255) NOT NULL,
  failure_reason text NOT NULL,
  attempts integer NOT NULL,
  dead_at timestamptz NOT NULL DEFAULT now()
);
