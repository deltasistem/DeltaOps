-- DGP-019.1 · Módulo de Utilización — Endurecimiento de IDEMPOTENCIA de comando.
-- ADITIVA sobre 0037; idempotente. Dos objetivos:
--
--  1) Convertir `utl_recibos` en un RECIBO CON RECLAMACIÓN DURABLE (claim →
--     ejecutar → sellar), igual que `utl_sync_receipts` para la orquestación.
--     El claim atómico (INSERT ON CONFLICT DO NOTHING) DEBE ocurrir ANTES de
--     ejecutar el efecto en TODA entrada de comando directa (no sólo /sync).
--     Se añade `estado` ('pendiente' | 'sellado') para distinguir un opId
--     reclamado-pero-no-finalizado de uno ya sellado con resultado.
--
--  2) Cinturón y tirantes: índice ÚNICO parcial sobre `op_id` en las tablas de
--     HECHOS (`utl_lecturas`, `utl_tanqueos`) para que, aun ante una carrera que
--     burlara el claim, la base RECHACE un segundo hecho con el mismo op_id
--     dentro del tenant (garantía de "exactamente-un-hecho").

-- 1) Estado del recibo de comando (claim durable).
ALTER TABLE deltaops.utl_recibos
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'sellado';
ALTER TABLE deltaops.utl_recibos
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) Unicidad de op_id por tenant en tablas de hechos (op_id es NULLABLE: sólo
--    aplica a operaciones con opId; los NULL no colisionan en un índice único).
CREATE UNIQUE INDEX IF NOT EXISTS uq_utl_lecturas_opid
  ON deltaops.utl_lecturas (tenant_id, op_id)
  WHERE op_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_utl_tanqueos_opid
  ON deltaops.utl_tanqueos (tenant_id, op_id)
  WHERE op_id IS NOT NULL;
