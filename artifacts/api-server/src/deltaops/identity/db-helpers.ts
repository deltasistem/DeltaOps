/**
 * DeltaOps · DGP-017 — Helpers de acceso a datos con contexto de tenant.
 *
 * Todas las lecturas/escrituras de recursos PROPIEDAD del tenant se ejecutan
 * dentro de una transacción con `set_config('app.tenant_id', …, true)` para que
 * la RLS de PostgreSQL aísle por tenant (mismo patrón que los módulos DGP-004+).
 *
 * Las tablas de IDENTIDAD GLOBAL (idn_identities / idn_memberships) NO llevan
 * RLS por tenant (la identidad es cross-tenant por naturaleza); su aislamiento
 * se garantiza en la capa de aplicación filtrando por identity_id/membership.
 */
import { pool, type DbPoolClient } from "@workspace/db";

/** Cliente de conexión del pool de @workspace/db (tipos que provee "pg"). */
export type DbClient = DbPoolClient;

/** Ejecuta `fn` dentro de una transacción con el tenant fijado para la RLS. */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback error */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Ejecuta `fn` con una conexión sin contexto de tenant (identidad global). */
export async function withGlobal<T>(
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
