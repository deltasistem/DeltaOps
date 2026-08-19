/**
 * DGP-023.5 (FASE 7) + DELTAOPS LITE-11 §11/§12 — resolución de la cadena de
 * conexión de RUNTIME, aislada como función PURA y testeable.
 *
 * El runtime debe conectar como el rol de mínimo privilegio `deltaops_app`
 * (NOSUPERUSER, NOBYPASSRLS, no owner) para que la RLS sea EFECTIVA:
 *   - desarrollo/test conserva la conexión administrada DATABASE_URL de
 *     heliumdb, sin reutilizar credenciales de Neon;
 *   - producción usa exclusivamente el secret NEON_DATABASE_URL, que debe
 *     apuntar a neondb como deltaops_app y exigir TLS.
 *
 * FAIL-FAST en producción (ningún secreto se registra ni aparece en el error):
 *   - (I-03) Si falta `DELTAOPS_APP_PASSWORD` y no se pidió el rol owner
 *     explícito (`DELTAOPS_DB_ROLE=owner`), se LANZA en vez de caer al fallback
 *     silencioso a `DATABASE_URL` (superusuario del proveedor), que anularía la
 *     RLS.
 *   - (LITE-11 MENOR-1) Si se pidió `DELTAOPS_DB_ROLE=owner` de forma explícita
 *     pero falta `DELTAOPS_OWNER_PASSWORD` (o PGHOST/PGDATABASE), también se
 *     LANZA: un proceso de migración/mantenimiento debe conectar como
 *     `deltaops_owner` de forma inequívoca, nunca degradar al superusuario de
 *     `DATABASE_URL`.
 */
export type EntornoConexion = Record<string, string | undefined>;

const USUARIO_RUNTIME_PRODUCCION = "deltaops_app";
const BASE_PRODUCCION = "neondb";
const MODOS_SSL_SEGUROS = new Set(["require", "verify-ca", "verify-full"]);

function composeUrl(
  env: EntornoConexion,
  user: string,
  password: string,
): string {
  const host = env.PGHOST as string;
  const port = env.PGPORT ?? "5432";
  const database = env.PGDATABASE as string;
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgres://${auth}@${host}:${port}/${database}`;
}

/**
 * Valida la URL dedicada del runtime productivo sin abrir una conexión.
 * Los errores nunca incluyen el valor recibido para evitar filtrar credenciales.
 */
export function validateNeonProductionConnectionString(
  connectionString: string | undefined,
): string {
  if (!connectionString) {
    throw new Error(
      "[db] FAIL-FAST: falta el secret NEON_DATABASE_URL para el runtime de producción.",
    );
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      "[db] FAIL-FAST: NEON_DATABASE_URL no es una URL PostgreSQL válida.",
    );
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      "[db] FAIL-FAST: NEON_DATABASE_URL debe usar el protocolo PostgreSQL.",
    );
  }

  let user = "";
  let database = "";
  try {
    user = decodeURIComponent(url.username);
    database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error(
      "[db] FAIL-FAST: NEON_DATABASE_URL contiene usuario o base inválidos.",
    );
  }

  if (user !== USUARIO_RUNTIME_PRODUCCION) {
    throw new Error(
      "[db] FAIL-FAST: NEON_DATABASE_URL debe autenticar como deltaops_app, nunca como owner/admin.",
    );
  }

  if (database !== BASE_PRODUCCION) {
    throw new Error(
      "[db] FAIL-FAST: NEON_DATABASE_URL debe apuntar a la base de producción neondb.",
    );
  }

  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  if (!sslMode || !MODOS_SSL_SEGUROS.has(sslMode)) {
    throw new Error(
      "[db] FAIL-FAST: NEON_DATABASE_URL debe exigir TLS con sslmode=require, verify-ca o verify-full; sslmode=disable no está permitido.",
    );
  }

  // node-postgres 8 trata require/verify-ca como verify-full, pero cambiará esa
  // semántica en v9. Normalizar ahora conserva verificación estricta de
  // certificado y hostname sin exigir que el operador reescriba la URL de Neon.
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

/**
 * Compone la conexión productiva efectiva. La URL de Neon aporta endpoint,
 * base, usuario y TLS; la contraseña siempre procede del secret independiente
 * DELTAOPS_APP_PASSWORD para evitar credenciales duplicadas/desincronizadas.
 */
export function resolveNeonProductionConnectionString(
  connectionString: string | undefined,
  appPassword: string | undefined,
): string {
  if (!appPassword) {
    throw new Error(
      "[db] FAIL-FAST: falta DELTAOPS_APP_PASSWORD para el runtime de producción.",
    );
  }

  const url = new URL(validateNeonProductionConnectionString(connectionString));
  url.password = appPassword;
  return url.toString();
}

/**
 * Resuelve la cadena de conexión de runtime a partir del entorno dado
 * (por defecto `process.env`). Función pura: no crea pools ni conexiones.
 */
export function resolveRuntimeConnectionString(
  env: EntornoConexion = process.env,
): string {
  const host = env.PGHOST;
  const database = env.PGDATABASE;

  const enProduccion = (env.NODE_ENV ?? "").toLowerCase() === "production";
  const owner = env.DELTAOPS_DB_ROLE === "owner";

  // Procesos administrativos (migraciones/seed/mantenimiento) piden el rol
  // owner de forma EXPLÍCITA vía DELTAOPS_DB_ROLE=owner. Nunca es el default.
  if (owner && env.DELTAOPS_OWNER_PASSWORD && host && database) {
    const user = env.DELTAOPS_OWNER_USER ?? "deltaops_owner";
    return composeUrl(env, user, env.DELTAOPS_OWNER_PASSWORD);
  }

  // FAIL-FAST en producción (LITE-11 MENOR-1): se pidió el rol owner
  // EXPLÍCITAMENTE pero falta DELTAOPS_OWNER_PASSWORD (o PGHOST/PGDATABASE). No
  // se permite caer al fallback silencioso a DATABASE_URL (superusuario del
  // proveedor): un proceso de migración/mantenimiento debe conectar como
  // deltaops_owner de forma inequívoca, nunca como superusuario por defecto.
  if (enProduccion && owner) {
    throw new Error(
      "[db] FAIL-FAST (LITE-11 §11/§12, MENOR-1): se solicitó DELTAOPS_DB_ROLE=owner " +
        "en producción pero falta DELTAOPS_OWNER_PASSWORD (o PGHOST/PGDATABASE). No se " +
        "permite el fallback a la conexión admin de DATABASE_URL (superusuario). " +
        "Configure DELTAOPS_OWNER_PASSWORD para el rol deltaops_owner.",
    );
  }

  // Runtime normal de producción: Neon queda aislado de las variables
  // runtime-managed de Replit. No se permite caer a heliumdb/DATABASE_URL.
  if (enProduccion) {
    return resolveNeonProductionConnectionString(
      env.NEON_DATABASE_URL,
      env.DELTAOPS_APP_PASSWORD,
    );
  }

  // Desarrollo/test conserva la conexión administrada de heliumdb. No usa
  // DELTAOPS_APP_PASSWORD porque ese secret pertenece al rol productivo Neon.
  return env.DATABASE_URL as string;
}
