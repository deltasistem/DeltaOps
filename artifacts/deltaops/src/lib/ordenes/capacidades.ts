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

/**
 * Contrato REAL del módulo Órdenes: cada acción exige un permiso concreto del
 * namespace `modulo.ordenes.*` (verificado en `lib/module-ordenes/src/module.ts`
 * y `artifacts/api-server/.../ordenes-runtime.ts`), y además existe una capacidad
 * corta que agrupa `[read, <permiso>]`:
 *
 *   acción      permiso REAL             capacidad corta
 *   ----------  -----------------------  ----------------------
 *   crear       modulo.ordenes.write     gestionar-ordenes
 *   ejecutar    modulo.ordenes.operar    ejecutar-ordenes
 *   validar     modulo.ordenes.validar   validar-ordenes
 *   administrar modulo.ordenes.admin     administrar-ordenes
 *
 * El permiso `admin` es super-permiso: concede todas las acciones.
 */
const ACCIONES = {
  crear: { permiso: `${MODULO}.write`, capacidadCorta: "gestionar-ordenes" },
  ejecutar: { permiso: `${MODULO}.operar`, capacidadCorta: "ejecutar-ordenes" },
  validar: { permiso: `${MODULO}.validar`, capacidadCorta: "validar-ordenes" },
  administrar: { permiso: `${MODULO}.admin`, capacidadCorta: "administrar-ordenes" },
} as const;

/**
 * ¿La sesión declara EXPLÍCITAMENTE autorización para esta acción del módulo
 * Órdenes? Devuelve:
 *  - `true`  si el payload concede la acción (permiso REAL del contrato,
 *            `modulo.ordenes.admin`, la capacidad corta equivalente o un comodín);
 *  - `false` si HAY señal del namespace `modulo.ordenes.*` pero NO concede la
 *            acción (p.ej. sólo `read`);
 *  - `undefined` si NO hay ninguna señal del módulo → delegar en el rol (el
 *            payload real de un TENANT_ADMIN NO trae permisos de órdenes, por eso
 *            la ausencia total no debe interpretarse como denegación).
 */
function declara(
  sesion: Pick<Sesion, "capacidades" | "permisos">,
  accion: { permiso: string; capacidadCorta: string },
): boolean | undefined {
  const prefijo = `${MODULO}.`; // modulo.ordenes.
  const caps = sesion.capacidades ?? [];
  const perms = sesion.permisos ?? [];

  // Comodines globales / de módulo → conceden todo.
  if (perms.includes("*") || caps.includes("*") || perms.includes(`${MODULO}.*`) || caps.includes(`${MODULO}.*`)) {
    return true;
  }

  // ¿Hay ALGUNA señal específica del namespace órdenes (permiso o capacidad corta)?
  const haySenalModulo =
    perms.some((p) => p.startsWith(prefijo)) ||
    caps.some((c) => c.endsWith("-ordenes") || c.startsWith(prefijo));
  if (!haySenalModulo) return undefined;

  // Concesión por el PERMISO REAL del contrato, por `admin` (super-permiso) o por
  // la capacidad corta equivalente. Un permiso de sólo lectura aislado NO concede
  // la acción, pero tampoco la deniega si además está presente el permiso válido.
  return (
    perms.includes(accion.permiso) ||
    perms.includes(`${MODULO}.admin`) ||
    caps.includes(accion.capacidadCorta)
  );
}

/**
 * Capacidades del módulo Órdenes para una sesión. `rol` es la fuente primaria
 * (réplica de la cadena `aRolLegacy` → `principalOrdenes` del backend); una señal
 * explícita del namespace `modulo.ordenes.*` la sobreescribe con los permisos
 * REALES del contrato.
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
    crear: admin || operador, // write / gestionar-ordenes
    ejecutar: admin || operador, // operar / ejecutar-ordenes
    validar: admin, // validar / validar-ordenes
    administrar: admin, // admin / administrar-ordenes
  };

  const conSenal = (accion: { permiso: string; capacidadCorta: string }, fallback: boolean): boolean => {
    const d = declara(sesion, accion);
    return d === undefined ? fallback : d;
  };

  return {
    leer: true,
    crear: conSenal(ACCIONES.crear, porRol.crear),
    ejecutar: conSenal(ACCIONES.ejecutar, porRol.ejecutar),
    validar: conSenal(ACCIONES.validar, porRol.validar),
    administrar: conSenal(ACCIONES.administrar, porRol.administrar),
  };
}

/** Azúcar: ¿esta sesión puede CREAR una orden de trabajo? */
export function puedeCrearOrden(sesion: Pick<Sesion, "rol" | "capacidades" | "permisos"> | null | undefined): boolean {
  if (!sesion) return false;
  return capacidadesOrdenes(sesion).crear;
}
