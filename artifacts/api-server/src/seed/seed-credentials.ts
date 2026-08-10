/**
 * DeltaOps · DGP-017 — Credenciales de DESARROLLO centralizadas (ÚNICA fuente).
 *
 * Este es el ÚNICO lugar del repositorio donde puede existir un valor por
 * defecto de contraseña, y solo como fallback de DESARROLLO. Reglas:
 *   - En producción, TODAS las contraseñas deben venir de variables de entorno
 *     (`process.env`). Si falta una var requerida en producción, se lanza error.
 *   - En desarrollo/tests, si la var no está definida, se usa un default
 *     DERIVADO y NO secreto por rol (documentado en `.env.example`), de modo que
 *     el seed y los tests sean deterministas sin literales dispersos.
 *
 * Ni la seed ni los tests deben escribir contraseñas literales: siempre pasan
 * por `credencialDemo(envKey)`.
 */

/** Mapa de rol/usuario → nombre de la variable de entorno de su contraseña. */
export const CLAVES_ENV = {
  DEMO_ADMIN: "DEMO_ADMIN_PASSWORD",
  DEMO_SUPERVISOR: "DEMO_SUPERVISOR_PASSWORD",
  DEMO_PLANIFICADOR: "DEMO_PLANIFICADOR_PASSWORD",
  DEMO_TECNICO: "DEMO_TECNICO_PASSWORD",
  DEMO_CONSULTA: "DEMO_CONSULTA_PASSWORD",
  PLATFORM_ADMIN: "DELTAOPS_ADMIN_PASSWORD",
} as const;

export type ClaveEnv = (typeof CLAVES_ENV)[keyof typeof CLAVES_ENV];

/**
 * Default de DESARROLLO derivado (no secreto) por variable. No es un literal
 * "bonito" reutilizable en producción: incorpora un sufijo por-var para que
 * cada usuario tenga una credencial distinta aun sin configurar el entorno.
 */
function defaultDev(envKey: string): string {
  return `dev-${envKey.toLowerCase().replace(/_/g, "-")}-0001!`;
}

function enProduccion(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Devuelve la contraseña para una variable de entorno dada. En producción exige
 * que la variable esté definida (sin defaults). En dev/test usa el default
 * derivado si falta.
 */
export function credencialDemo(envKey: ClaveEnv): string {
  const v = process.env[envKey];
  if (v && v.length > 0) return v;
  if (enProduccion()) {
    throw new Error(
      `Falta la variable de entorno obligatoria ${envKey} (contraseña de seed) en producción.`,
    );
  }
  return defaultDev(envKey);
}
