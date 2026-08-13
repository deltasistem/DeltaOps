-- ===========================================================================
-- DGP-021.2 (R1) · NATURALEZA económica del HECHO (CARGO/ABONO).
--
-- HALLAZGO MAYOR (revisión R1): una `devolucion` de inventario atribuida a una OT
-- se materializaba por el MISMO comando POSITIVO de consumo ⇒ un segundo hecho
-- indistinguible del consumo que INFLABA el costo neto de material. El ledger
-- inmutable quedaba incorrecto y la composición futura no podía RESTAR el crédito.
--
-- CORRECCIÓN: se añade un SIGNO SEMÁNTICO explícito al hecho — `naturaleza`:
--   * CARGO: aumenta el costo de material (consumo/salida atribuido a la OT).
--   * ABONO: crédito/reingreso que COMPENSA un cargo previo (devolución a stock).
-- Los importes SIGUEN siendo NO negativos (invariante de dinero string-safe): la
-- dirección económica la lleva `naturaleza`, NUNCA un monto negativo. Esto hace el
-- ledger correcto y COMPONIBLE (restable) sin que el módulo sume/agregue (§22).
--
-- La FAMILIA contable cruda del movimiento origen se registra en `fuente.familia`
-- (JSON del snapshot) para auditoría de la naturaleza — trazabilidad completa.
--
-- ADITIVA, idempotente y NO destructiva. Backfill: las filas existentes son todas
-- CARGO (no había devoluciones materializadas todavía; ver auditoría §6). Se aplica
-- con psql (drizzle push no ve esta columna/constraint).
-- ===========================================================================

-- 1) Columna naturaleza (default CARGO para compatibilidad y backfill implícito).
ALTER TABLE deltaops.cos_hechos
  ADD COLUMN IF NOT EXISTS naturaleza text NOT NULL DEFAULT 'CARGO';

-- 2) Backfill explícito de filas históricas (idempotente; el default ya las cubre).
UPDATE deltaops.cos_hechos SET naturaleza = 'CARGO' WHERE naturaleza IS NULL;

-- 3) Dominio acotado: sólo CARGO|ABONO (fail-closed).
ALTER TABLE deltaops.cos_hechos
  DROP CONSTRAINT IF EXISTS chk_cos_hechos_naturaleza;
ALTER TABLE deltaops.cos_hechos
  ADD CONSTRAINT chk_cos_hechos_naturaleza CHECK (naturaleza IN ('CARGO','ABONO'));

-- 4) Índice para read models que separan costo (CARGO) de crédito (ABONO).
CREATE INDEX IF NOT EXISTS idx_cos_hechos_naturaleza
  ON deltaops.cos_hechos (tenant_id, naturaleza);
