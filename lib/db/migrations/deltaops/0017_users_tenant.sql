-- DeltaOps · DGP-011.3 · Migración 0017 — columna tenant en deltaops.users
-- Aditiva: añade la pertenencia de cada usuario a su tenant (aislamiento multi-tenant).
-- Backfill: los usuarios existentes pertenecen al tenant histórico 'deltaops'.
-- Espejo Drizzle: lib/db/src/schema/deltaops.ts (users.tenant).

ALTER TABLE deltaops.users
  ADD COLUMN IF NOT EXISTS tenant varchar(64) NOT NULL DEFAULT 'deltaops';

CREATE INDEX IF NOT EXISTS idx_deltaops_users_tenant
  ON deltaops.users (tenant);
