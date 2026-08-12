-- ===========================================================================
-- DGP-020.1 (R1) · Módulo Órdenes — Endurecimiento de IDEMPOTENCIA de comando.
-- ADITIVA sobre 0013; idempotente. Misma lección que DGP-019.1: el recibo de
-- comando `ord_recibos` debe soportar RECLAMACIÓN DURABLE (claim → ejecutar →
-- sellar). El claim atómico (INSERT ON CONFLICT DO NOTHING) DEBE ocurrir ANTES
-- de producir el efecto, en TODA entrada de comando directa (POST) — no sólo en
-- `/sync`, cuyo `ord_sync_receipts` sólo protege la orquestación offline.
--
-- Se añade `estado` ('pendiente' | 'sellado') para distinguir un opId
-- reclamado-pero-no-finalizado de uno ya sellado con resultado, y `updated_at`
-- para el sellado. El DEFAULT 'sellado' preserva la semántica de los recibos
-- LEGADOS ya existentes (todos se consideran finalizados).
--
-- Nota: las tablas de HECHOS de Órdenes (p. ej. `ord_asignaciones`) NO tienen
-- columna `op_id` (el opId vive sólo en `ord_recibos`), por lo que la garantía
-- de "exactamente-un-hecho" recae ÍNTEGRAMENTE en el claim durable de
-- `ord_recibos` (PK `(tenant_id, comando, op_id)`), que da exclusión mutua.
-- ===========================================================================

ALTER TABLE deltaops.ord_recibos
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'sellado';
ALTER TABLE deltaops.ord_recibos
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
