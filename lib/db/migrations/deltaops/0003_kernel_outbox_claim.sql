-- DeltaOps · DGP-002 · Migración 0003 — lease de reclamo del outbox
-- Soporta procesadores concurrentes: claim atómico con expiración (60 s).

ALTER TABLE deltaops.kernel_outbox
  ADD COLUMN IF NOT EXISTS claimed_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_kernel_outbox_claimable
  ON deltaops.kernel_outbox (occurred_at)
  WHERE processed_at IS NULL;
