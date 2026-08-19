import pg from "pg";
import { resolveNeonProductionConnectionString } from "./runtime-connection";

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

function safeConnectionError(error: unknown): Error {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : undefined;

  const detail = (() => {
    switch (code) {
      case "28P01":
      case "28000":
        return "Neon rechazó la autenticación de deltaops_app. Verifique la contraseña de ese rol.";
      case "3D000":
        return "La base neondb no existe o no es accesible para deltaops_app.";
      case "42501":
        return "deltaops_app no tiene permiso para una de las consultas de catálogo autorizadas.";
      case "ENOTFOUND":
      case "EAI_AGAIN":
        return "No fue posible resolver por DNS el endpoint configurado.";
      case "ECONNREFUSED":
        return "El endpoint rechazó la conexión de red.";
      case "ETIMEDOUT":
      case "ECONNRESET":
        return "La conexión de red a Neon expiró o fue reiniciada.";
      case "DEPTH_ZERO_SELF_SIGNED_CERT":
      case "SELF_SIGNED_CERT_IN_CHAIN":
      case "CERT_HAS_EXPIRED":
      case "ERR_TLS_CERT_ALTNAME_INVALID":
        return "La validación TLS del certificado de Neon falló.";
      default:
        return "Revise NEON_DATABASE_URL, acceso de red, TLS y permisos de deltaops_app.";
    }
  })();

  const safeCode = code && /^[A-Z0-9_]+$/.test(code) ? ` Código: ${code}.` : "";
  return new Error(`[neon-diagnostic] ${detail}${safeCode}`);
}

/**
 * Diagnóstico aislado y no destructivo. Cada SELECT se ejecuta dentro de una
 * transacción explícita BEGIN READ ONLY que siempre finaliza con ROLLBACK.
 */
export async function runNeonReadonlyDiagnostic(
  connectionString: string | undefined,
  appPassword: string | undefined,
): Promise<NeonReadonlyDiagnosticResult> {
  const validatedUrl = resolveNeonProductionConnectionString(
    connectionString,
    appPassword,
  );
  const pool = new Pool({
    connectionString: validatedUrl,
    application_name: "deltaops-neon-readonly-diagnostic",
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 1_000,
  });

  try {
    const client = await pool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN READ ONLY");
      transactionOpen = true;

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
      if (transactionOpen) {
        await client.query("ROLLBACK");
      }
      client.release();
    }
  } catch (error) {
    throw safeConnectionError(error);
  } finally {
    await pool.end();
  }
}
