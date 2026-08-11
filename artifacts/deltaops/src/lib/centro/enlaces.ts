/**
 * DGP-018 · Enlaces profundos del Centro Operacional (funciones PURAS).
 *
 * Componen rutas y query-strings que YA soportan las páginas existentes
 * (`src/pages/*` + `App.tsx`), sin introducir rutas nuevas ni lógica de dominio.
 * Centralizarlos aquí hace la navegación del centro testeable y consistente y
 * evita que la landing invente destinos. Todo destino apunta a una superficie
 * real: bandejas de órdenes, ficha/ejecución de OT, activos, inventario, planes,
 * preventivo y abastecimiento.
 */

/* ------------------------------- Órdenes ------------------------------- */

/** Bandeja concreta del Centro de Operaciones (`/ordenes?bandeja=<id>`). */
export function urlBandejaOrdenes(bandeja: string): string {
  return `/ordenes?bandeja=${encodeURIComponent(bandeja)}`;
}

/**
 * Ficha de la OT abriendo directamente la pestaña de EJECUCIÓN, donde viven
 * checklist, formulario, evidencia, medidor/lectura, recursos, firma y cierre
 * (tab `ejecucion` de `ordenes-ficha`). Es el destino móvil del técnico.
 */
export function urlEjecutarOrden(ordenId: string): string {
  return `/ordenes/${encodeURIComponent(ordenId)}?tab=ejecucion`;
}

/**
 * Identidad mínima de la sesión para el match estricto de asignación.
 * (Subconjunto de `Sesion`; evita acoplar esta función pura al tipo completo.)
 */
export interface IdentidadSesion {
  readonly identityId: string;
  readonly email: string;
}

/**
 * ¿La OT está asignada INEQUÍVOCAMENTE a la identidad de la sesión?
 *
 * Gap bloqueante G-1: el contrato de órdenes NO garantiza que `responsable`
 * coincida con `identityId`/`email` de la sesión (puede traer nombre o rol).
 * Para NO atribuir trabajo ajeno a un técnico, sólo se considera "propia" la OT
 * cuando `responsable` (normalizado) es EXACTAMENTE igual al `identityId` o al
 * `email` canónico de la sesión. Ante cualquier otro valor (nombre, rol, vacío,
 * null) o ambigüedad → `false` (no se muestra ni se ofrece ejecutar).
 *
 * Es un criterio conservador y explícito, no permisivo: si el backend algún día
 * expone un contrato de asignación por identityId, este match seguirá siendo
 * correcto y podrá ampliarse sin riesgo de fuga de OTs de otros responsables.
 */
export function ordenAsignadaAIdentidad(
  responsable: string | null | undefined,
  sesion: IdentidadSesion,
): boolean {
  if (responsable == null) return false;
  const r = responsable.trim().toLowerCase();
  if (r === "") return false;
  const id = sesion.identityId.trim().toLowerCase();
  const email = sesion.email.trim().toLowerCase();
  return (id !== "" && r === id) || (email !== "" && r === email);
}

/* ------------------------------- Activos ------------------------------- */

/** Búsqueda/escaneo por QR de activos (`/activos/escanear`). */
export const RUTA_ESCANEAR_ACTIVO = "/activos/escanear";

/* ----------------------------- Inventario ------------------------------ */

/** Existencias / listado de items del inventario. */
export const RUTA_INVENTARIO = "/inventario";
/** Reservas y movimientos. */
export const RUTA_INVENTARIO_MOVIMIENTOS = "/inventario/movimientos";
/** Transferencias entre bodegas. */
export const RUTA_INVENTARIO_TRANSFERENCIAS = "/inventario/transferencias";
/** Bodegas / ubicaciones de almacenamiento. */
export const RUTA_INVENTARIO_BODEGAS = "/inventario/bodegas";

/* --------------------------- Planes/Preventivo -------------------------- */

/** Calendario de planes (próximas ocurrencias / Gantt). */
export const RUTA_PLANES_CALENDARIO = "/planes/calendario";
/** Calendario preventivo (programaciones futuras). */
export const RUTA_PREVENTIVO_CALENDARIO = "/preventivo/calendario";
/** Programas preventivos (con sus órdenes generadas). */
export const RUTA_PREVENTIVO_PROGRAMAS = "/preventivo/programas";

/* ---------------------------- Abastecimiento --------------------------- */

/** Solicitudes / necesidades de abastecimiento. */
export const RUTA_ABASTECIMIENTO_SOLICITUDES = "/abastecimiento/solicitudes";

/**
 * Accesos de integración por módulo (secciones 8-12 del mandato). Cada entrada
 * apunta a una superficie REAL ya enrutada; el consumidor filtra por entitlement
 * del módulo y capacidad del rol antes de mostrarlos.
 */
export interface AccesoModulo {
  readonly clave: string;
  readonly etiqueta: string;
  readonly ruta: string;
}

export const INTEGRACIONES: Record<string, AccesoModulo[]> = {
  activos: [
    { clave: "activos-listado", etiqueta: "Listado y búsqueda", ruta: "/activos" },
    { clave: "activos-escanear", etiqueta: "Escanear / buscar por QR", ruta: RUTA_ESCANEAR_ACTIVO },
    { clave: "activos-arboles", etiqueta: "Estructuras y componentes", ruta: "/activos/arboles" },
  ],
  ordenes: [
    { clave: "ordenes-pendientes", etiqueta: "Pendientes", ruta: urlBandejaOrdenes("pendientes") },
    { clave: "ordenes-ejecucion", etiqueta: "En ejecución", ruta: urlBandejaOrdenes("ejecucion") },
    { clave: "ordenes-vencer", etiqueta: "Próximas a vencer", ruta: urlBandejaOrdenes("vencer") },
    { clave: "ordenes-criticas", etiqueta: "Críticas", ruta: urlBandejaOrdenes("criticas") },
  ],
  inventario: [
    { clave: "inventario-existencias", etiqueta: "Existencias e items", ruta: RUTA_INVENTARIO },
    { clave: "inventario-transferencias", etiqueta: "Transferencias", ruta: RUTA_INVENTARIO_TRANSFERENCIAS },
    { clave: "inventario-bodegas", etiqueta: "Bodegas", ruta: RUTA_INVENTARIO_BODEGAS },
  ],
  planes: [
    { clave: "planes-calendario", etiqueta: "Calendario de planes", ruta: RUTA_PLANES_CALENDARIO },
    { clave: "planes-listado", etiqueta: "Planes", ruta: "/planes" },
  ],
  preventivo: [
    { clave: "preventivo-calendario", etiqueta: "Calendario preventivo", ruta: RUTA_PREVENTIVO_CALENDARIO },
    { clave: "preventivo-programas", etiqueta: "Programas y órdenes generadas", ruta: RUTA_PREVENTIVO_PROGRAMAS },
  ],
  abastecimiento: [
    { clave: "abastecimiento-solicitudes", etiqueta: "Solicitudes y necesidades", ruta: RUTA_ABASTECIMIENTO_SOLICITUDES },
  ],
};
