-- DeltaOps · DGP-001 · Migración 0001 — inicialización de la plataforma
-- Sistema oficial de migraciones: archivos SQL numerados en lib/db/migrations/deltaops/,
-- espejo exacto del esquema Drizzle en lib/db/src/schema/deltaops.ts.
-- En desarrollo se aplican contra la base de desarrollo; en producción el
-- esquema lo sincroniza el flujo de publicación de la plataforma (diff dev→prod).

CREATE SCHEMA IF NOT EXISTS deltaops;

CREATE TABLE IF NOT EXISTS deltaops.users (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email varchar(255) NOT NULL UNIQUE,
  nombre varchar(255) NOT NULL,
  rol varchar(64) NOT NULL DEFAULT 'admin',
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deltaops.sessions (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deltaops_sessions_expire
  ON deltaops.sessions (expire);
