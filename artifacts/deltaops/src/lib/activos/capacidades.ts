/**
 * DGP-019.2 · Capacidades de PRESENTACIÓN del módulo Activos.
 *
 * El backend es la AUTORIDAD de autorización (el runtime del módulo evalúa las
 * capacidades y responde 403 sin ellas). Este helper deriva las capacidades para
 * OCULTAR/MOSTRAR acciones en la UI (nunca es un bypass). Replica EXACTAMENTE la
 * cadena canónica del backend, SIN inventar un mapeo paralelo:
 *
 *   1) `aRolLegacy` (`artifacts/api-server/src/deltaops/identity/rbac.ts`):
 *        SUPER_ADMIN, TENANT_ADMIN            → "admin"
 *        SUPERVISOR, PLANIFICADOR, TECNICO    → "operador"
 *        CONSULTA (y desconocidos)            → "lector"
 *
 *   2) `principalActivos` (`artifacts/api-server/src/routes/deltaops/activos-runtime.ts`):
 *        admin    → todos los permisos (read/write/operar/retirar/admin)
 *        operador → read/write/operar/retirar (sin admin)
 *        lector   → sólo read
 *
 * Contrato REAL por acción (verificado en `lib/module-activos/src/module.ts`):
 *   acción            permiso REAL             capacidad corta
 *   ----------------  -----------------------  ------------------
 *   editar            modulo.activos.write     gestionar-activos
 *   transicionar      modulo.activos.operar    gestionar-activos
 *   retirar           modulo.activos.retirar   administrar-activos
 *   administrar       modulo.activos.admin     administrar-activos
 *
 * La capacidad corta `gestionar-activos` agrupa `[read, write, operar]`.
 *
 * Igual que en Órdenes/Utilización (lección DGP-019.1), sólo una señal EXPLÍCITA
 * del namespace `modulo.activos.*` actúa como override; el resto de permisos
 * (plataforma, referencia, otros módulos) es IRRELEVANTE y NO suprime el mapeo
 * por rol (el payload real de un TENANT_ADMIN no siempre trae permisos de este
 * módulo en la sesión).
 */
import type { Sesion } from "../identidad/tipos";
import { MODULO } from "./constantes";

export interface CapacidadesActivos {
  /** Ver activos (consulta de ficha/listado). */
  readonly leer: boolean;
  /** Editar el activo (`modulo.activos.write` / gestionar-activos). */
  readonly editar: boolean;
  /** Ejecutar transiciones de estado (`modulo.activos.operar`). */
  readonly transicionar: boolean;
  /** Retirar el activo (`modulo.activos.retirar`). */
  readonly retirar: boolean;
  /** Administrar (config/purga) (`modulo.activos.admin`). */
  readonly administrar: boolean;
}

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

/** Contrato REAL de cada acción (permiso + capacidad corta equivalente). */
const ACCIONES = {
  editar: { permiso: `${MODULO}.write`, capacidadCorta: "gestionar-activos" },
  transicionar: { permiso: `${MODULO}.operar`, capacidadCorta: "gestionar-activos" },
  retirar: { permiso: `${MODULO}.retirar`, capacidadCorta: "administrar-activos" },
  administrar: { permiso: `${MODULO}.admin`, capacidadCorta: "administrar-activos" },
} as const;

/**
 * ¿La sesión declara EXPLÍCITAMENTE autorización para esta acción del módulo
 * Activos? Trivalente:
 *  - `true`  concede (permiso REAL, `modulo.activos.admin` como super-permiso,
 *            la capacidad corta equivalente o un comodín);
 *  - `false` hay señal del namespace `modulo.activos.*` pero NO concede la acción
 *            (p.ej. sólo `read`);
 *  - `undefined` sin ninguna señal del módulo → delegar en el rol.
 */
function declara(
  sesion: Pick<Sesion, "capacidades" | "permisos">,
  accion: { permiso: string; capacidadCorta: string },
): boolean | undefined {
  const prefijo = `${MODULO}.`; // modulo.activos.
  const caps = sesion.capacidades ?? [];
  const perms = sesion.permisos ?? [];

  if (perms.includes("*") || caps.includes("*") || perms.includes(`${MODULO}.*`) || caps.includes(`${MODULO}.*`)) {
    return true;
  }

  const haySenalModulo =
    perms.some((p) => p.startsWith(prefijo)) ||
    caps.some((c) => c.endsWith("-activos") || c.startsWith(prefijo));
  if (!haySenalModulo) return undefined;

  return (
    perms.includes(accion.permiso) ||
    perms.includes(`${MODULO}.admin`) ||
    caps.includes(accion.capacidadCorta)
  );
}

/**
 * Capacidades del módulo Activos para una sesión. `rol` es la fuente primaria
 * (réplica de `aRolLegacy` → `principalActivos`); una señal explícita del
 * namespace `modulo.activos.*` la sobreescribe con los permisos REALES.
 */
export function capacidadesActivos(
  sesion: Pick<Sesion, "rol" | "capacidades" | "permisos"> | null | undefined,
): CapacidadesActivos {
  const legacy = aRolLegacy(String(sesion?.rol ?? ""));
  const admin = legacy === "admin";
  const operador = legacy === "operador";

  // Mapeo por rol (réplica de `principalActivos`).
  const porRol: CapacidadesActivos = {
    leer: true, // todo rol con acceso al módulo tiene `modulo.activos.read`
    editar: admin || operador, // write / gestionar-activos
    transicionar: admin || operador, // operar / gestionar-activos
    retirar: admin || operador, // retirar (operador lo conserva; sólo `admin` se filtra)
    administrar: admin, // admin / administrar-activos
  };

  if (!sesion) return { leer: true, editar: false, transicionar: false, retirar: false, administrar: false };

  const conSenal = (accion: { permiso: string; capacidadCorta: string }, fallback: boolean): boolean => {
    const d = declara(sesion, accion);
    return d === undefined ? fallback : d;
  };

  return {
    leer: true,
    editar: conSenal(ACCIONES.editar, porRol.editar),
    transicionar: conSenal(ACCIONES.transicionar, porRol.transicionar),
    retirar: conSenal(ACCIONES.retirar, porRol.retirar),
    administrar: conSenal(ACCIONES.administrar, porRol.administrar),
  };
}

/** Azúcar: ¿esta sesión puede EDITAR un activo? */
export function puedeEditarActivo(sesion: Pick<Sesion, "rol" | "capacidades" | "permisos"> | null | undefined): boolean {
  return capacidadesActivos(sesion).editar;
}
