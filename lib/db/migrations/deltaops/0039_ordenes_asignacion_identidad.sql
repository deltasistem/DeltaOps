-- ===========================================================================
-- DGP-020.1 · Contrato de identidad en asignación de Órdenes de Trabajo.
-- Resuelve G-1: la asignación de un RECURSO HUMANO (tipo='persona') debe
-- referenciar la IDENTIDAD CANÓNICA de DeltaOps (deltaops.idn_identities) por
-- su `identity_id`, no por texto libre.
--
-- ESTRATEGIA (aditiva, NO destructiva):
--   - Se AGREGA `asignado_identity_id` (nullable) al aggregate y al read model,
--     como referencia FUERTE a la identidad canónica. Se conserva `asignado_id`
--     por compatibilidad con:
--       (a) asignaciones NO-persona (grupo/cuadrilla/contratista), y
--       (b) filas HISTÓRICAS por texto libre (backward compatibility §11).
--   - El read model expone además `asignado_nombre`/`asignado_email` como
--     ATRIBUTOS DE PRESENTACIÓN (nunca clave; proyectados desde el payload).
--   - NO hay conversión automática de históricos: las filas previas quedan con
--     `asignado_identity_id = NULL` ("requiere regularización"). No se aplican
--     heurísticas por nombre/email/username. No se borran ni modifican datos.
--
-- Sin FK física a idn_identities: la validación fuerte la garantiza el comando
-- de aplicación mediante el IdentidadPort (identidad+membresía activas del MISMO
-- tenant), coherente con el aislamiento por capa de aplicación de la migración
-- 0033 (idn_* se consultan bajo withGlobal filtrando por tenant, no por RLS de
-- ord_*). RLS/tenant-isolation de las tablas ord_* se mantiene intacta.
-- ===========================================================================

-- 1) Aggregate: referencia fuerte opcional a la identidad canónica.
ALTER TABLE deltaops.ord_asignaciones
  ADD COLUMN IF NOT EXISTS asignado_identity_id text;

CREATE INDEX IF NOT EXISTS idx_ord_asignaciones_identity
  ON deltaops.ord_asignaciones (tenant_id, asignado_identity_id, vigente);

-- 2) Read model: referencia fuerte + atributos de presentación.
ALTER TABLE deltaops.ord_asignaciones_read
  ADD COLUMN IF NOT EXISTS asignado_identity_id text;
ALTER TABLE deltaops.ord_asignaciones_read
  ADD COLUMN IF NOT EXISTS asignado_nombre text;
ALTER TABLE deltaops.ord_asignaciones_read
  ADD COLUMN IF NOT EXISTS asignado_email text;

-- Soporte para futuras vistas "Mis órdenes" (identityId de sesión == asignación).
CREATE INDEX IF NOT EXISTS idx_ord_asignaciones_read_identity
  ON deltaops.ord_asignaciones_read (tenant_id, asignado_identity_id, vigente);
