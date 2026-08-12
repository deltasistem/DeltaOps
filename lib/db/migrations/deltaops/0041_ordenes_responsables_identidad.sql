-- ===========================================================================
-- DGP-020.1 (E2E fix) · Proyección de RESPONSABLES desde la asignación FUERTE
-- de persona. Corrige el defecto: un `asignar-recurso-humano` (tipo=persona,
-- rol=responsable) creaba la asignación pero NO actualizaba el read model de
-- responsables, dejando `/responsables` con responsable:null y la superficie del
-- supervisor mostrando "Sin responsable asignado".
--
-- ESTRATEGIA (aditiva, NO destructiva):
--   - Se AGREGAN `responsable_identity_id` (referencia FUERTE a la identidad
--     canónica) y `responsable_nombre` (atributo de presentación) al read model
--     append-only `ord_responsables_read`. Se conserva `responsable` (texto) por
--     compatibilidad con el flujo legado de supervisor y filas históricas.
--   - La proyección escribe una fila por EVENTO (event_id único ⇒ idempotente
--     bajo la PK (tenant_id, event_id)); la última por `registrado_at DESC` es
--     el responsable vigente.
--   - NO hay conversión heurística de históricos: las filas previas quedan con
--     `responsable_identity_id = NULL`.
--
-- RLS/tenant-isolation de ord_responsables_read se mantiene intacta.
-- ===========================================================================

ALTER TABLE deltaops.ord_responsables_read
  ADD COLUMN IF NOT EXISTS responsable_identity_id text;
ALTER TABLE deltaops.ord_responsables_read
  ADD COLUMN IF NOT EXISTS responsable_nombre text;

-- Soporte para futuras vistas "Mis órdenes" (identityId de sesión == responsable).
CREATE INDEX IF NOT EXISTS idx_ord_responsables_read_identity
  ON deltaops.ord_responsables_read (tenant_id, responsable_identity_id);
