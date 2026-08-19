import pg from "pg";
import { validateNeonProductionConnectionString } from "./runtime-connection";

const { Pool } = pg;

type IdentityRow = {
  current_user: string;
  current_database: string;
  current_schema: string | null;
  version: string;
};

type SchemaRow = {
  schema_name: string;
};

type CountRow = {
  count: string;
};

type TableRow = {
  table_name: string;
};

export type NeonReadonlyDiagnosticResult = {
  connectionAccepted: boolean;
  currentUser: string;
  currentDatabase: string;
  currentSchema: string | null;
  version: string;
  deltaopsSchemaExists: boolean;
  deltaopsTableCount: number;
  exampleTables: string[];
};

/**
 * Diagnóstico aislado y no destructivo. El servidor PostgreSQL fuerza todas las
 * transacciones de esta conexión a READ ONLY antes de ejecutar los SELECT.
 */
export async function runNeonReadonlyDiagnostic(
  connectionString: string | undefined,
): Promise<NeonReadonlyDiagnosticResult> {
  const validatedUrl = validateNeonProductionConnectionString(connectionString);
  const pool = new Pool({
    connectionString: validatedUrl,
    application_name: "deltaops-neon-readonly-diagnostic",
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
    options: "-c default_transaction_read_only=on -c statement_timeout=10000",
  });

  try {
    const client = await pool.connect();
    try {
      const identity = await client.query<IdentityRow>(`
        SELECT
          current_user,
          current_database(),
          current_schema(),
          version()
      `);
      const row = identity.rows[0];
      if (!row) {
        throw new Error(
          "[neon-diagnostic] PostgreSQL no devolvió identidad de conexión.",
        );
      }

      const schema = await client.query<SchemaRow>(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name = 'deltaops'
      `);
      const deltaopsSchemaExists = schema.rowCount === 1;

      let deltaopsTableCount = 0;
      let exampleTables: string[] = [];
      if (deltaopsSchemaExists) {
        const count = await client.query<CountRow>(`
          SELECT count(*)
          FROM information_schema.tables
          WHERE table_schema = 'deltaops'
        `);
        deltaopsTableCount = Number.parseInt(count.rows[0]?.count ?? "0", 10);

        if (deltaopsTableCount > 0) {
          const examples = await client.query<TableRow>(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'deltaops'
            ORDER BY table_name
            LIMIT 5
          `);
          exampleTables = examples.rows.map((item) => item.table_name);
        }
      }

      return {
        connectionAccepted:
          row.current_database === "neondb" &&
          row.current_user === "deltaops_app",
        currentUser: row.current_user,
        currentDatabase: row.current_database,
        currentSchema: row.current_schema,
        version: row.version,
        deltaopsSchemaExists,
        deltaopsTableCount,
        exampleTables,
      };
    } finally {
      client.release();
    }
  } catch {
    throw new Error(
      "[neon-diagnostic] No se pudo completar la conexión READ-ONLY a Neon. Revise NEON_DATABASE_URL, acceso de red, TLS y permisos de deltaops_app.",
    );
  } finally {
    await pool.end();
  }
}
