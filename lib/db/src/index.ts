import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * DGP-023.5 (FASE 7): el runtime debe conectar como el rol de mínimo privilegio
 * `deltaops_app` (NOSUPERUSER, NOBYPASSRLS, no owner) para que la RLS sea
 * EFECTIVA. La cadena de conexión de runtime se COMPONE en código desde el
 * entorno — nunca se escribe literal en el repositorio ni se registra:
 *
 *   - host/puerto/base: reutiliza PGHOST/PGPORT/PGDATABASE del entorno.
 *   - usuario: `deltaops_app` (fijo, no secreto).
 *   - contraseña: secreto `DELTAOPS_APP_PASSWORD` (Replit Secret).
 *
 * Si el secreto no está presente, se hace *fallback* a `DATABASE_URL`
 * (conexión admin gestionada por el proveedor). Esto también define el
 * ROLLBACK de runtime: basta con retirar `DELTAOPS_APP_PASSWORD` del entorno
 * para que el pool vuelva a `DATABASE_URL` sin cambios de código.
 */
function composeUrl(user: string, password: string): string {
  const host = process.env.PGHOST as string;
  const port = process.env.PGPORT ?? "5432";
  const database = process.env.PGDATABASE as string;
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgres://${auth}@${host}:${port}/${database}`;
}

function resolveRuntimeConnectionString(): string {
  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;

  // Procesos administrativos (migraciones/seed/mantenimiento) piden el rol
  // owner de forma EXPLÍCITA vía DELTAOPS_DB_ROLE=owner. Nunca es el default.
  if (
    process.env.DELTAOPS_DB_ROLE === "owner" &&
    process.env.DELTAOPS_OWNER_PASSWORD &&
    host &&
    database
  ) {
    const user = process.env.DELTAOPS_OWNER_USER ?? "deltaops_owner";
    return composeUrl(user, process.env.DELTAOPS_OWNER_PASSWORD);
  }

  // Runtime de la aplicación: rol de mínimo privilegio deltaops_app.
  const appPassword = process.env.DELTAOPS_APP_PASSWORD;
  if (appPassword && host && database) {
    const user = process.env.DELTAOPS_APP_USER ?? "deltaops_app";
    return composeUrl(user, appPassword);
  }

  // Fallback / rollback: conexión admin gestionada por el proveedor.
  return process.env.DATABASE_URL as string;
}

export const pool = new Pool({
  connectionString: resolveRuntimeConnectionString(),
});
export const db = drizzle(pool, { schema });

/**
 * DGP-017 (aditivo, solo tipos): cliente de conexión del pool, reexportado
 * para que los artifacts tipen `withTenant(client => …)` sin depender de "pg".
 */
export type DbPoolClient = pg.PoolClient;

export * from "./schema";
