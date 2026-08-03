/**
 * DGP-006 · Business Foundation Framework — Generic Module Bootstrap Runtime.
 *
 * crearModuloGenerico(definicionModulo, extras?) transforma una DefinicionModulo
 * declarativa en un PlatformServiceDefinition listo para `extraServices` de
 * createPlatformRuntime. Al montarse (registerPlatformService) inscribe
 * automáticamente: defaults de configuración por tenant, capacidades y
 * permisos, comandos+consultas CRUD de TODAS las entidades y, opcionalmente,
 * event handlers de proyección genérica vía el hook `proyeccion`.
 */
import type {
  CommandDefinition,
  QueryDefinition,
} from "@workspace/kernel";
import type {
  EventHandlerDefinition,
  PlatformServiceDefinition,
  ServiceDeps,
} from "@workspace/platform";
import { crearComandosCrud, crearQueriesCrud } from "./crud";
import {
  eventosDeEntidad,
  type DefinicionEntidad,
  type DefinicionModulo,
} from "./definicion";

/** Tipo de una capacidad, idéntico al del descriptor de plataforma. */
type Capacidad = PlatformServiceDefinition["capabilities"][number];

/**
 * Extras que COMPONEN el contrato del módulo. Todo lo declarado aquí se fusiona
 * con lo derivado de la DefinicionModulo (dedupe por nombre / por clave), de
 * modo que un módulo pueda ampliar cualquier faceta del PlatformServiceDefinition
 * sin salirse del mecanismo declarativo.
 */
export interface ExtrasModulo {
  /** Comandos adicionales específicos del módulo (mismo mecanismo declarativo). */
  readonly comandos?: readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[];
  /** Consultas adicionales específicas del módulo. */
  readonly queries?: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
  /**
   * Hook OPCIONAL de proyección genérica: recibe las entidades del módulo y
   * devuelve los EventHandlerDefinition que actualizarán read models u otros
   * efectos. La proyección debe ser idempotente y construirse solo desde el
   * payload del evento (patrón module-reference).
   */
  readonly proyeccion?: (entidades: readonly DefinicionEntidad[]) => readonly EventHandlerDefinition[];
  /** Event handlers adicionales arbitrarios. */
  readonly eventHandlers?: readonly EventHandlerDefinition[];
  /** Tipos de evento extra que se AÑADEN a los declarados por las entidades. */
  readonly eventos?: readonly string[];
  /** Capacidades extra (mismo tipo que el descriptor); dedupe por `name`. */
  readonly capacidades?: readonly Capacidad[];
  /** Permisos extra; dedupe con los del módulo. */
  readonly permisos?: readonly string[];
  /** Dependencias de plataforma extra; dedupe con las del módulo. */
  readonly dependeDe?: readonly string[];
  /** Defaults de configuración extra (clave SIN prefijo de servicio). */
  readonly configuracionDefaults?: Record<string, string>;
}

/** Deduplica strings preservando el orden de primera aparición. */
function unicos(...listas: readonly (readonly string[])[]): string[] {
  return [...new Set(listas.flat())];
}

/** Reúne todos los tipos de evento emitidos por las entidades del módulo. */
function eventosDelModulo(def: DefinicionModulo): string[] {
  return def.entidades.flatMap((e) => [...eventosDeEntidad(e).todos]);
}

/**
 * Fusiona los defaults de configuración: módulo → cada entidad → extras. Las
 * claves van SIN prefijo de servicio; `TenantConfigService.registerDefaults`
 * las prefija con el nombre del servicio al registrarlas (ver docs/nucleo.md:
 * los handlers consultan con `tenantConfig.get(tenant, '<servicio>.<clave>')`).
 */
function configDefaults(def: DefinicionModulo, extras: ExtrasModulo): Record<string, string> {
  const out: Record<string, string> = { ...(def.configuracionDefaults ?? {}) };
  for (const e of def.entidades) {
    for (const [k, v] of Object.entries(e.configuracionDefaults ?? {})) out[k] = v;
  }
  for (const [k, v] of Object.entries(extras.configuracionDefaults ?? {})) out[k] = v;
  return out;
}

/** Fusiona capacidades del módulo + extras, deduplicando por `name`. */
function capacidadesFusionadas(def: DefinicionModulo, extras: ExtrasModulo): Capacidad[] {
  const porNombre = new Map<string, Capacidad>();
  for (const c of [...def.capacidades, ...(extras.capacidades ?? [])]) {
    if (!porNombre.has(c.name)) porNombre.set(c.name, c);
  }
  return [...porNombre.values()];
}

export function crearModuloGenerico(
  def: DefinicionModulo,
  extras: ExtrasModulo = {},
): PlatformServiceDefinition {
  const comandosCrud = def.entidades.flatMap((e) => crearComandosCrud(e));
  const queriesCrud = def.entidades.flatMap((e) => crearQueriesCrud(e));

  const eventHandlers: EventHandlerDefinition[] = [
    ...(extras.proyeccion ? extras.proyeccion(def.entidades) : []),
    ...(extras.eventHandlers ?? []),
  ];

  return {
    name: def.servicio,
    version: def.version ?? "1.0.0",
    description:
      def.descripcion ??
      `${def.etiqueta} — módulo genérico Business Foundation (DGP-006); framework neutro`,
    capabilities: capacidadesFusionadas(def, extras),
    permissions: unicos(def.permisos, extras.permisos ?? []),
    dependsOn: unicos(def.dependeDe ?? ["platform.config"], extras.dependeDe ?? []),
    events: unicos(eventosDelModulo(def), extras.eventos ?? []),
    // El framework persiste mediante el Record Store: un recordType por entidad.
    recordTypes: def.entidades.map((e) => e.nombre),
    configDefaults: configDefaults(def, extras),
    commands: [...comandosCrud, ...(extras.comandos ?? [])],
    queries: [...queriesCrud, ...(extras.queries ?? [])],
    eventHandlers,
    healthCheck: (deps: ServiceDeps) => async () => {
      const probe = await deps.store.list("__health__", { service: def.servicio, limit: 1 });
      return probe.ok
        ? { healthy: true, detail: "record store del módulo operativo" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}
