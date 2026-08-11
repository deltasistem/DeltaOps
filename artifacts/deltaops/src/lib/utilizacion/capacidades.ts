/**
 * DGP-019.1 · Capacidades de PRESENTACIÓN del módulo Utilización.
 *
 * El backend es la AUTORIDAD de autorización (el runtime del módulo evalúa las
 * capacidades y responde 403 sin ellas). Este helper deriva las capacidades
 * para OCULTAR/MOSTRAR acciones en la UI (nunca es un bypass). El mapeo replica
 * EXACTAMENTE el del runtime del backend (`principalUtilizacion` en
 * `artifacts/api-server/src/routes/deltaops/utilizacion-runtime.ts`):
 *   - TENANT_ADMIN / SUPER_ADMIN: todo.
 *   - SUPERVISOR: leer + registrar/anular (lecturas y tanqueos) + regularizar.
 *   - TECNICO: leer + registrar (lecturas y tanqueos).
 *   - PLANIFICADOR / CONSULTA / otros: sólo leer.
 *
 * El rol es la fuente primaria (igual que el backend, que deriva las
 * capacidades del rol vía `principalUtilizacion`). Sólo si el payload de sesión
 * expusiera capacidades/permisos ESPECÍFICOS del módulo (namespace
 * `modulo.utilizacion.*`) se honran como override (a prueba de futuro); los
 * permisos de plataforma/referencia/otros módulos de la sesión NO afectan el
 * gating de utilización.
 */
import type { Sesion } from "../identidad/tipos";
import { MODULO } from "./constantes";

export interface CapacidadesUtilizacion {
  /** Ver utilización (consulta de lecturas/tanqueos/resumen). */
  readonly leer: boolean;
  /** Registrar lectura de medidor. */
  readonly registrarLectura: boolean;
  /** Anular/corregir lectura (motivo obligatorio). */
  readonly anularLectura: boolean;
  /** Registrar tanqueo de combustible. */
  readonly registrarTanqueo: boolean;
  /** Anular tanqueo. */
  readonly anularTanqueo: boolean;
  /** Regularizar medidor (reinicio de tramo auditado, motivo obligatorio). */
  readonly regularizarMedidor: boolean;
}

/** Sufijos canónicos de las capacidades del módulo (contrato del backend). */
const CAP = {
  leer: "leer",
  registrarLectura: "lecturas.registrar",
  anularLectura: "lecturas.anular",
  registrarTanqueo: "tanqueos.registrar",
  anularTanqueo: "tanqueos.anular",
  regularizarMedidor: "medidores.regularizar",
} as const;

/**
 * ¿La sesión declara explícitamente esta capacidad DEL MÓDULO Utilización?
 *
 * Sólo se considera "señal" si el payload contiene permisos/capacidades del
 * namespace `modulo.utilizacion.*` (o un comodín de módulo). El resto de
 * permisos/capacidades de la sesión (plataforma, referencia, otros módulos) es
 * IRRELEVANTE y NO debe suprimir el mapeo por rol: la sesión real de un
 * TENANT_ADMIN trae capacidades/permisos de referencia pero NINGUNO de
 * utilización, por lo que aquí debe devolverse `undefined` (usar el rol), no
 * `false`. En su ausencia total de señal del módulo, el rol es la fuente.
 */
function declara(sesion: Pick<Sesion, "capacidades" | "permisos">, sufijo: string): boolean | undefined {
  const permisoLargo = `${MODULO}.${sufijo}`; // p.ej. modulo.utilizacion.leer
  const prefijo = `${MODULO}.`; // modulo.utilizacion.
  const caps = sesion.capacidades ?? [];
  const perms = sesion.permisos ?? [];

  // Comodines globales / de módulo → concede todo.
  if (perms.includes("*") || caps.includes("*") || perms.includes(`${MODULO}.*`) || caps.includes(`${MODULO}.*`)) {
    return true;
  }

  // ¿Hay ALGUNA señal específica del módulo utilización? Si no, delega al rol.
  const haySenalModulo =
    perms.some((p) => p.startsWith(prefijo)) || caps.some((c) => c === sufijo || c.startsWith(prefijo));
  if (!haySenalModulo) return undefined;

  return caps.includes(sufijo) || caps.includes(permisoLargo) || perms.includes(permisoLargo);
}

/** Capacidades del módulo para una sesión, según el mandato §19. */
export function capacidadesUtilizacion(sesion: Pick<Sesion, "rol" | "capacidades" | "permisos">): CapacidadesUtilizacion {
  const rol = String(sesion.rol ?? "").toUpperCase();
  const admin = rol === "TENANT_ADMIN" || rol === "SUPER_ADMIN" || rol === "ADMIN" || rol === "PLATFORM_ADMIN";
  const supervisor = rol === "SUPERVISOR";
  const tecnico = rol === "TECNICO";

  // Mapeo por rol (réplica del backend).
  const porRol: CapacidadesUtilizacion = {
    leer: true, // todos los roles con acceso al módulo pueden leer
    registrarLectura: admin || supervisor || tecnico,
    anularLectura: admin || supervisor,
    registrarTanqueo: admin || supervisor || tecnico,
    anularTanqueo: admin || supervisor,
    regularizarMedidor: admin || supervisor,
  };

  // Preferencia por señal explícita de la sesión (si existe).
  const conSenal = (sufijo: string, fallback: boolean): boolean => {
    const d = declara(sesion, sufijo);
    return d === undefined ? fallback : d;
  };

  return {
    leer: conSenal(CAP.leer, porRol.leer),
    registrarLectura: conSenal(CAP.registrarLectura, porRol.registrarLectura),
    anularLectura: conSenal(CAP.anularLectura, porRol.anularLectura),
    registrarTanqueo: conSenal(CAP.registrarTanqueo, porRol.registrarTanqueo),
    anularTanqueo: conSenal(CAP.anularTanqueo, porRol.anularTanqueo),
    regularizarMedidor: conSenal(CAP.regularizarMedidor, porRol.regularizarMedidor),
  };
}

/**
 * ¿El módulo Utilización es visible en la navegación para esta sesión?
 * Requiere el entitlement `"utilizacion"` (el backend lo habilita por tenant) Y
 * capacidad de lectura. El tipo `Modulo` del contrato de identidad no enumera
 * este módulo emergente, por eso se comprueba de forma tolerante sobre la lista
 * cruda de módulos de la sesión.
 */
export function utilizacionVisible(sesion: Pick<Sesion, "rol" | "modulos" | "capacidades" | "permisos">): boolean {
  const modulos = (sesion.modulos ?? []) as readonly string[];
  const habilitado = modulos.includes("utilizacion");
  return habilitado && capacidadesUtilizacion(sesion).leer;
}
