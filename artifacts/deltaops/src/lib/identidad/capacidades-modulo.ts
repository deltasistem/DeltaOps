/**
 * DGP-019.2 · Helper canónico de capacidad de ESCRITURA por módulo (presentación).
 *
 * Varios módulos (planes, preventivo, correctivo, documentación/comentarios de
 * activos, etc.) comparten EXACTAMENTE el mismo contrato de autorización que ya
 * verificamos en Órdenes/Activos: la creación/edición exige `<modulo>.write`, y
 * la cadena canónica del backend es `aRolLegacy` → `principal*`:
 *   - admin    (SUPER_ADMIN, TENANT_ADMIN)          → write
 *   - operador (SUPERVISOR, PLANIFICADOR, TECNICO)  → write
 *   - lector   (CONSULTA / desconocido)             → sólo read
 *
 * Este helper deriva la capacidad de ESCRITURA para OCULTAR CTAs sin permiso
 * (nunca es un bypass; el backend es la autoridad y responde 403). Replica el
 * patrón trivalente de `lib/ordenes/capacidades.ts` sin duplicar un archivo por
 * módulo: sólo una señal EXPLÍCITA del namespace `<modulo>.*` en la sesión actúa
 * como override; permisos de otros módulos NO contaminan el gating.
 */
import type { Sesion } from "./tipos";

type RolLegacy = "admin" | "operador" | "lector";

/** Réplica EXACTA de `aRolLegacy` (rbac.ts): rol canónico → rol legacy. */
function aRolLegacy(rol: string): RolLegacy {
  switch (String(rol ?? "").toUpperCase()) {
    case "SUPER_ADMIN":
    case "TENANT_ADMIN":
      return "admin";
    case "SUPERVISOR":
    case "PLANIFICADOR":
    case "TECNICO":
      return "operador";
    default:
      return "lector";
  }
}

/**
 * ¿La sesión declara EXPLÍCITAMENTE permiso de escritura del módulo? Trivalente:
 *  - `true`  concede (`<modulo>.write`, `<modulo>.admin`, capacidad corta
 *            `gestionar-<sufijo>` o comodín);
 *  - `false` hay señal del namespace `<modulo>.*` pero NO concede escritura;
 *  - `undefined` sin señal del módulo → delegar en el rol.
 */
function declaraEscritura(
  sesion: Pick<Sesion, "capacidades" | "permisos">,
  modulo: string,
  sufijoCapacidad: string,
): boolean | undefined {
  const prefijo = `${modulo}.`;
  const caps = sesion.capacidades ?? [];
  const perms = sesion.permisos ?? [];

  if (perms.includes("*") || caps.includes("*") || perms.includes(`${modulo}.*`) || caps.includes(`${modulo}.*`)) {
    return true;
  }

  const haySenalModulo =
    perms.some((p) => p.startsWith(prefijo)) ||
    caps.some((c) => c.endsWith(`-${sufijoCapacidad}`) || c.startsWith(prefijo));
  if (!haySenalModulo) return undefined;

  return (
    perms.includes(`${modulo}.write`) ||
    perms.includes(`${modulo}.admin`) ||
    caps.includes(`gestionar-${sufijoCapacidad}`)
  );
}

/**
 * ¿Esta sesión puede ESCRIBIR (crear/editar) en el módulo indicado?
 *
 * @param modulo         Namespace completo, p.ej. `"modulo.planes"`.
 * @param sufijoCapacidad Sufijo de la capacidad corta canónica, p.ej. `"planes"`
 *                        → `gestionar-planes` (por defecto se deriva del namespace).
 */
export function puedeEscribirModulo(
  sesion: Pick<Sesion, "rol" | "capacidades" | "permisos"> | null | undefined,
  modulo: string,
  sufijoCapacidad = modulo.replace(/^modulo\./, ""),
): boolean {
  if (!sesion) return false;
  const legacy = aRolLegacy(String(sesion.rol ?? ""));
  const fallback = legacy === "admin" || legacy === "operador";
  const d = declaraEscritura(sesion, modulo, sufijoCapacidad);
  return d === undefined ? fallback : d;
}
