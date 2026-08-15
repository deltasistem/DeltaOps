/**
 * DGP-023.5 (FASE 7) + DELTAOPS LITE-11 §11/§12 — resolución de la cadena de
 * conexión de RUNTIME, aislada como función PURA y testeable.
 *
 * El runtime debe conectar como el rol de mínimo privilegio `deltaops_app`
 * (NOSUPERUSER, NOBYPASSRLS, no owner) para que la RLS sea EFECTIVA. La cadena
 * se COMPONE en código desde el entorno — nunca literal en el repositorio ni en
 * logs:
 *   - host/puerto/base: PGHOST/PGPORT/PGDATABASE.
 *   - usuario: `deltaops_app` (fijo, no secreto).
 *   - contraseña: secreto `DELTAOPS_APP_PASSWORD`.
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

function composeUrl(env: EntornoConexion, user: string, password: string): string {
  const host = env.PGHOST as string;
  const port = env.PGPORT ?? "5432";
  const database = env.PGDATABASE as string;
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `postgres://${auth}@${host}:${port}/${database}`;
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

  // Runtime de la aplicación: rol de mínimo privilegio deltaops_app.
  const appPassword = env.DELTAOPS_APP_PASSWORD;
  if (appPassword && host && database) {
    const user = env.DELTAOPS_APP_USER ?? "deltaops_app";
    return composeUrl(env, user, appPassword);
  }

  // FAIL-FAST en producción (I-03): sin fallback silencioso a la conexión admin.
  if (enProduccion && !owner) {
    throw new Error(
      "[db] FAIL-FAST (LITE-11 §11/§12, I-03): falta DELTAOPS_APP_PASSWORD en " +
        "producción. No se permite el fallback a la conexión admin de DATABASE_URL " +
        "(superusuario) porque anularía la RLS (DGP-023.5). Configure " +
        "DELTAOPS_APP_PASSWORD para el rol de runtime deltaops_app, o use " +
        "DELTAOPS_DB_ROLE=owner solo para procesos de migración/mantenimiento.",
    );
  }

  // Fallback / rollback (fuera de producción): conexión admin del proveedor.
  return env.DATABASE_URL as string;
}
