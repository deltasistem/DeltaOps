/**
 * DGP-019.2 · Capacidades de PRESENTACIÓN del módulo Órdenes de Trabajo.
 *
 * El backend es la AUTORIDAD de autorización (el runtime del módulo evalúa las
 * capacidades y responde 403 sin ellas). Este helper deriva las capacidades para
 * OCULTAR/MOSTRAR acciones en la UI (nunca es un bypass). El mapeo replica
 * EXACTAMENTE la cadena canónica del backend, SIN inventar un mapeo paralelo:
 *
 *   1) `aRolLegacy` (`artifacts/api-server/src/deltaops/identity/rbac.ts`)
 *      traduce el rol canónico de la sesión al rol legacy que consumen los
 *      `principal*`:
 *        SUPER_ADMIN, TENANT_ADMIN            → "admin"
 *        SUPERVISOR, PLANIFICADOR, TECNICO    → "operador"
 *        CONSULTA (y desconocidos)            → "lector"
 *
 *   2) `principalOrdenes` (`artifacts/api-server/src/routes/deltaops/ordenes-runtime.ts`)
 *      asigna las capacidades del namespace `modulo.ordenes`:
 *        admin    → gestionar-ordenes, ejecutar-ordenes, validar-ordenes, administrar-ordenes
 *        operador → gestionar-ordenes, ejecutar-ordenes
 *        lector   → (ninguna: sólo `modulo.ordenes.read`)
 *
 * CREAR una OT exige `modulo.ordenes.write`, cubierto por la capacidad
 * `gestionar-ordenes` (permisos `[read, write]`). Por eso `crear` = admin u
 * operador (incluye TECNICO, según la capacidad REAL del módulo), y NUNCA
 * lector/CONSULTA.
 *
 * Igual que en Utilización (lección DGP-019.1), sólo una señal EXPLÍCITA del
 * namespace `modulo.ordenes.*` en el payload de sesión actúa como override; el
 * resto de permisos/capacidades (plataforma, referencia, otros módulos) es
 * IRRELEVANTE y NO debe suprimir el mapeo por rol.
 */
import type { Sesion } from "../identidad/tipos";
import { MODULO } from "./constantes";

export interface CapacidadesOrdenes {
  /** Ver órdenes (consulta de bandejas/ficha/timeline). */
  readonly leer: boolean;
  /** Crear una orden de trabajo (`modulo.ordenes.write` / gestionar-ordenes). */
  readonly crear: boolean;
  /** Ejecutar/operar una orden (avance de estados operativos). */
  readonly ejecutar: boolean;
  /** Validar/cerrar una orden. */
  readonly validar: boolean;
  /** Administrar (reabrir/anular/config). */
  readonly administrar: boolean;
}

/** Rol legacy del backend (contrato `aRolLegacy`). */
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
      return "lector"; // CONSULTA y roles desconocidos
  }
}

/** Sufijos/capacidades canónicas del namespace `modulo.ordenes`. */
const CAP = {
  gestionar: "gestionar-ordenes",
  ejecutar: "ejecutar-ordenes",
  validar: "validar-ordenes",
  administrar: "administrar-ordenes",
} as const;

/**
 * ¿La sesión declara EXPLÍCITAMENTE esta capacidad DEL MÓDULO Órdenes?
 * Sólo cuenta como "señal" si el payload trae permisos/capacidades del namespace
 * `modulo.ordenes.*` (o un comodín de módulo/global). Sin señal del módulo se
 * devuelve `undefined` para delegar en el rol (el payload real de un
 * TENANT_ADMIN NO trae capacidades de órdenes, por eso no debe ser `false`).
 */
function declara(
  sesion: Pick<Sesion, "capacidades" | "permisos">,
  capacidad: string,
): boolean | undefined {
  const prefijo = `${MODULO}.`; // modulo.ordenes.
  const caps = sesion.capacidades ?? [];
  const perms = sesion.permisos ?? [];

  if (perms.includes("*") || caps.includes("*") || perms.includes(`${MODULO}.*`) || caps.includes(`${MODULO}.*`)) {
    return true;
  }

  const haySenalModulo =
    perms.some((p) => p.startsWith(prefijo)) ||
    caps.some((c) => c === capacidad || c.endsWith("-ordenes") || c.startsWith(prefijo));
  if (!haySenalModulo) return undefined;

  return caps.includes(capacidad) || perms.includes(`${prefijo}${capacidad}`);
}

/**
 * Capacidades del módulo Órdenes para una sesión. `rol` es la fuente primaria
 * (réplica de la cadena `aRolLegacy` → `principalOrdenes` del backend); una señal
 * explícita del namespace `modulo.ordenes.*` la sobreescribe.
 */
export function capacidadesOrdenes(
  sesion: Pick<Sesion, "rol" | "capacidades" | "permisos">,
): CapacidadesOrdenes {
  const legacy = aRolLegacy(String(sesion.rol ?? ""));
  const admin = legacy === "admin";
  const operador = legacy === "operador";

  // Mapeo por rol (réplica de `principalOrdenes`).
  const porRol: CapacidadesOrdenes = {
    leer: true, // todo rol con acceso al módulo tiene `modulo.ordenes.read`
    crear: admin || operador, // gestionar-ordenes (write)
    ejecutar: admin || operador, // ejecutar-ordenes (operar)
    validar: admin, // validar-ordenes
    administrar: admin, // administrar-ordenes / admin
  };

  const conSenal = (capacidad: string, fallback: boolean): boolean => {
    const d = declara(sesion, capacidad);
    return d === undefined ? fallback : d;
  };

  return {
    leer: true,
    crear: conSenal(CAP.gestionar, porRol.crear),
    ejecutar: conSenal(CAP.ejecutar, porRol.ejecutar),
    validar: conSenal(CAP.validar, porRol.validar),
    administrar: conSenal(CAP.administrar, porRol.administrar),
  };
}

/** Azúcar: ¿esta sesión puede CREAR una orden de trabajo? */
export function puedeCrearOrden(sesion: Pick<Sesion, "rol" | "capacidades" | "permisos"> | null | undefined): boolean {
  if (!sesion) return false;
  return capacidadesOrdenes(sesion).crear;
}
