/**
 * DGP-020.3 · Capacidades de PRESENTACIÓN del módulo Mano de Obra.
 *
 * El backend es la AUTORIDAD de autorización (responde 403 sin capacidad). Este
 * helper deriva qué mostrar/OCULTAR (nunca es un bypass; §22). Mapeo por rol
 * canónico según la directiva (§22/§35/§36/§37):
 *
 *   TENANT_ADMIN / SUPER_ADMIN → administra (categorías, recursos, tarifas) + consulta
 *   SUPERVISOR                 → consulta (gestión sólo si el backend la concede)
 *   PLANIFICADOR               → consulta
 *   TECNICO                    → SÓLO su propia mano de obra (sin admin)
 *   CONSULTA / desconocido     → sólo lectura (nunca crear/modificar/configurar)
 *
 * Una señal EXPLÍCITA del namespace `modulo.manodeobra.*`/`administrar-manodeobra`
 * en el payload de sesión sobreescribe el mapeo por rol (contrato real del
 * backend); su ausencia NO deniega (delegar en el rol).
 */
import type { Sesion } from "../identidad/tipos";
import { MODULO } from "./constantes";

export interface CapacidadesManoDeObra {
  /** Ver mano de obra (consulta de OT/valoraciones). Todo rol con acceso. */
  readonly leer: boolean;
  /** Administrar catálogo/recursos/tarifas (TENANT_ADMIN). */
  readonly administrar: boolean;
  /** Ver «mi mano de obra» (el técnico ve lo suyo). */
  readonly verPropia: boolean;
}

type RolLegacy = "admin" | "operador" | "lector";

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
 * ¿La sesión declara EXPLÍCITAMENTE la capacidad de administrar mano de obra?
 * `undefined` = sin señal → delegar en el rol.
 */
function declaraAdministrar(sesion: Pick<Sesion, "capacidades" | "permisos">): boolean | undefined {
  const prefijo = `${MODULO}.`;
  const caps = sesion.capacidades ?? [];
  const perms = sesion.permisos ?? [];

  if (perms.includes("*") || caps.includes("*") || perms.includes(`${MODULO}.*`) || caps.includes(`${MODULO}.*`)) {
    return true;
  }
  const haySenal =
    perms.some((p) => p.startsWith(prefijo)) ||
    caps.some((c) => c.endsWith("-manodeobra") || c.startsWith(prefijo));
  if (!haySenal) return undefined;

  return (
    perms.includes(`${MODULO}.admin`) ||
    perms.includes(`${MODULO}.write`) ||
    caps.includes("administrar-manodeobra")
  );
}

/** Capacidades del módulo Mano de Obra para una sesión. */
export function capacidadesManoDeObra(
  sesion: Pick<Sesion, "rol" | "capacidades" | "permisos"> | null | undefined,
): CapacidadesManoDeObra {
  if (!sesion) return { leer: false, administrar: false, verPropia: false };
  const legacy = aRolLegacy(String(sesion.rol ?? ""));
  const esTecnico = String(sesion.rol ?? "").toUpperCase() === "TECNICO";

  const porRolAdmin = legacy === "admin";
  const d = declaraAdministrar(sesion);
  const administrar = d === undefined ? porRolAdmin : d;

  return {
    leer: true, // todo rol con acceso al módulo consulta mano de obra
    administrar,
    // El técnico SIEMPRE ve su propia mano de obra; el resto también puede
    // consultar la suya, pero la superficie «Mi mano de obra» es del técnico.
    verPropia: esTecnico || legacy === "operador" || porRolAdmin,
  };
}
