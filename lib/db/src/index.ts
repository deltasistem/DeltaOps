import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { resolveRuntimeConnectionString } from "./runtime-connection";

const { Pool } = pg;

const runtimeConnectionString = resolveRuntimeConnectionString();

if (!runtimeConnectionString) {
  throw new Error(
    "DATABASE_URL debe estar definida fuera de producción. ¿Falta provisionar la base de desarrollo?",
  );
}

/**
 * DGP-023.5 (FASE 7) + LITE-11 §11/§12: la resolución de la cadena de conexión
 * de runtime (rol de mínimo privilegio `deltaops_app`, FAIL-FAST en producción)
 * vive como función PURA en `./runtime-connection` para poder testearla sin
 * crear el pool. Ver ese módulo para el detalle de barreras y rollback.
 */
export const pool = new Pool({
  connectionString: runtimeConnectionString,
});
export const db = drizzle(pool, { schema });

/**
 * DGP-017 (aditivo, solo tipos): cliente de conexión del pool, reexportado
 * para que los artifacts tipen `withTenant(client => …)` sin depender de "pg".
 */
export type DbPoolClient = pg.PoolClient;

/**
 * DELTAOPS LITE-11 · §2/§3/§4 — guard de aislamiento de BD de test.
 * Reexportado para que los setups de suites destructivas lo consuman desde el
 * mismo paquete que provee `pool`/`db`, sin rutas relativas frágiles.
 */
export {
  resolverPoolDeTest,
  runtimeEsBdDeTest,
  suiteDestructiva,
  crearPoolDestructivo,
  type ResultadoGuardTest,
  type DescribeLike,
} from "./test-guard";

export {
  resolveRuntimeConnectionString,
  validateNeonProductionConnectionString,
  type EntornoConexion,
} from "./runtime-connection";

export * from "./schema";
