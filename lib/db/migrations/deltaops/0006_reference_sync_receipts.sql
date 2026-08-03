-- DGP-004 (correcciones de revisión) · Reference Module.
-- 1) created_by en el read model (las consultas CQRS no releen el aggregate).
-- 2) Recibos durables de sincronización offline: una operación de cliente
--    (opId) aplicada conserva su resultado; un reintento devuelve el recibo
--    en lugar de re-ejecutar (evita falsos conflictos tras respuesta perdida).

ALTER TABLE deltaops.ref_elementos_read
  ADD COLUMN IF NOT EXISTS created_by text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS deltaops.ref_sync_receipts (
  tenant_id text NOT NULL,
  op_id text NOT NULL,
  comando text NOT NULL,
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, op_id)
);

ALTER TABLE deltaops.ref_sync_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ref_sync_receipts_tenant_isolation ON deltaops.ref_sync_receipts;
CREATE POLICY ref_sync_receipts_tenant_isolation ON deltaops.ref_sync_receipts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
