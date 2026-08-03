/**
 * DGP-006 · Business Foundation Framework — Familia OPERACIONES.
 *
 * Runtimes genéricos y neutros que amplían una DefinicionEntidad con
 * operaciones transversales, todas por Kernel + RecordStorePort:
 *   - Asignación   (asignar/desasignar/asignaciones)
 *   - Aprobación   (solicitar/aprobar/rechazar, flujo declarativo multipaso)
 *   - Lote         (bulk sobre el bus de comandos, parcial e idempotente)
 *   - Importación  (validación Zod por fila + dry-run)
 *   - Exportación  (proyección a filas planas para CSV/JSON)
 *
 * `crearOperaciones(def, opciones)` empaqueta las fábricas seleccionadas en un
 * `ExtrasModulo` listo para `crearModuloGenerico(def, extras)`.
 */
import type { CommandDefinition, QueryDefinition } from "@workspace/kernel";
import type { PlatformServiceDefinition, ServiceDeps } from "@workspace/platform";
import type { ExtrasModulo } from "../nucleo/bootstrap";
import type { DefinicionEntidad } from "../nucleo/definicion";
import {
  capacidadAsignar,
  crearComandosAsignacion,
  crearQueriesAsignacion,
  eventosAsignacion,
  permisoAsignar,
} from "./asignacion";
import {
  capacidadAprobar,
  crearComandosAprobacion,
  CONFIG_PERMITIR_AUTOR,
  eventosAprobacion,
  PERMITIR_AUTOR_DEFAULT,
  permisosAprobacion,
  type DefinicionAprobacion,
} from "./aprobacion";
import { CONFIG_LOTE_MAX, crearComandoLote, LOTE_MAX_DEFAULT } from "./lote";
import { CONFIG_IMPORTAR_MAX, IMPORTAR_MAX_DEFAULT, importarDesdeFilas } from "./importacion";
import { capacidadExportar, crearQueryExportacion } from "./exportacion";

type Capacidad = PlatformServiceDefinition["capabilities"][number];

export * from "./comun";
export * from "./asignacion";
export * from "./aprobacion";
export * from "./lote";
export * from "./importacion";
export * from "./exportacion";

/** Selección de runtimes de operaciones a activar para una entidad. */
export interface OpcionesOperaciones {
  readonly asignacion?: boolean;
  /** Flujo declarativo de aprobación (activa los comandos de aprobación). */
  readonly aprobacion?: DefinicionAprobacion;
  readonly lote?: boolean;
  readonly importacion?: boolean;
  readonly exportacion?: boolean;
}

/**
 * Empaqueta las operaciones seleccionadas de una entidad como `ExtrasModulo`
 * COMPLETO para `crearModuloGenerico(def, extras)`: además de los comandos y
 * consultas, cada runtime aporta su parte del CONTRATO del módulo — eventos
 * declarados, capacidades dedicadas, permisos adicionales y defaults de
 * configuración (claves SIN prefijo de servicio; el núcleo/TenantConfigService
 * las prefija con `<servicio>.` al registrarlas).
 */
export function crearOperaciones(
  def: DefinicionEntidad,
  opciones: OpcionesOperaciones,
): ExtrasModulo {
  const comandos: ((deps: ServiceDeps) => CommandDefinition<any, any>)[] = [];
  const queries: ((deps: ServiceDeps) => QueryDefinition<any, any>)[] = [];
  const eventos: string[] = [];
  const capacidades: Capacidad[] = [];
  const permisos: string[] = [];
  const configuracionDefaults: Record<string, string> = {};

  if (opciones.asignacion) {
    comandos.push(...crearComandosAsignacion(def));
    queries.push(...crearQueriesAsignacion(def));
    eventos.push(...eventosAsignacion(def));
    capacidades.push(capacidadAsignar(def));
    permisos.push(permisoAsignar(def), def.permisos.leer);
  }
  if (opciones.aprobacion) {
    const flujo = opciones.aprobacion;
    comandos.push(...crearComandosAprobacion(def, flujo));
    eventos.push(...eventosAprobacion(def));
    capacidades.push(capacidadAprobar(def, flujo));
    permisos.push(def.permisos.editar, ...permisosAprobacion(flujo));
    // Default SIN prefijo: el núcleo lo registra como `<servicio>.aprobacion-permitir-autor`.
    configuracionDefaults[CONFIG_PERMITIR_AUTOR] = PERMITIR_AUTOR_DEFAULT;
  }
  if (opciones.lote) {
    comandos.push(crearComandoLote(def));
    permisos.push(def.permisos.leer);
    configuracionDefaults[CONFIG_LOTE_MAX] = String(LOTE_MAX_DEFAULT);
  }
  if (opciones.importacion) {
    comandos.push(importarDesdeFilas(def));
    permisos.push(def.permisos.crear);
    configuracionDefaults[CONFIG_IMPORTAR_MAX] = String(IMPORTAR_MAX_DEFAULT);
  }
  if (opciones.exportacion) {
    queries.push(crearQueryExportacion(def));
    capacidades.push(capacidadExportar(def));
    permisos.push(def.permisos.leer);
  }

  return {
    comandos,
    queries,
    eventos: [...new Set(eventos)],
    capacidades,
    permisos: [...new Set(permisos)],
    configuracionDefaults,
  };
}
