import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * DGP-017 (aditivo, solo tipos): cliente de conexión del pool, reexportado
 * para que los artifacts tipen `withTenant(client => …)` sin depender de "pg".
 */
export type DbPoolClient = pg.PoolClient;

export * from "./schema";
