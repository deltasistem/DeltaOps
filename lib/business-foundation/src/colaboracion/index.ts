/**
 * DGP-006 · Business Foundation Framework — Familia Colaboración/Observabilidad.
 *
 * Runtimes genéricos y neutros que enriquecen cualquier DefinicionEntidad con
 * comentarios, adjuntos, historial/auditoría, cronología (timeline), KPIs y
 * panel — todos apoyados en los Shared Services de la plataforma y en el Kernel.
 *
 * `crearColaboracion(def, opciones)` ensambla un ExtrasModulo COMPLETO (comandos,
 * queries, event handlers, capacidades, permisos, dependencias de plataforma y
 * configuracionDefaults con clave SIN prefijo) listo para pasarse a
 * `crearModuloGenerico`, de modo que el descriptor final del módulo declare TODO
 * el contrato de colaboración.
 */
import type { CommandDefinition, QueryDefinition } from "@workspace/kernel";
import type { EventHandlerDefinition, ServiceDeps } from "@workspace/platform";
import type { ExtrasModulo } from "../nucleo/bootstrap";
import type { DefinicionEntidad } from "../nucleo/definicion";
import { capacidadComentarios, crearComentarios } from "./comentarios";
import { capacidadAdjuntos, configDefaultsAdjuntos, crearAdjuntos } from "./adjuntos";
import { capacidadAuditoria, crearHistorial } from "./historial";
import { crearCronologia, handlersCronologia } from "./cronologia";
import { capacidadIndicadores, crearIndicadores, handlersKpis, type DefinicionKpi } from "./indicadores";
import { capacidadPanel, configDefaultsPanel, crearPanel, type DefinicionPanel } from "./panel";

export * from "./comentarios";
export * from "./adjuntos";
export * from "./historial";
export * from "./cronologia";
export * from "./indicadores";
export * from "./panel";

/** Tipo de una capacidad del descriptor (nombre → permisos agrupados). */
type Capacidad = NonNullable<ExtrasModulo["capacidades"]>[number];

/** Servicios de plataforma de los que dependen los runtimes de colaboración. */
export const DEPENDENCIAS_COMENTARIOS = ["platform.comment"] as const;
export const DEPENDENCIAS_ADJUNTOS = ["platform.attachment"] as const;
export const DEPENDENCIAS_CRONOLOGIA = ["platform.timeline"] as const;

/** Opciones de colaboración por entidad. */
export interface OpcionesColaboracion {
  readonly kpis?: readonly DefinicionKpi[];
  readonly panel?: DefinicionPanel;
  /** Activa comentarios (default: true). */
  readonly comentarios?: boolean;
  /** Activa adjuntos (default: true). */
  readonly adjuntos?: boolean;
  /** Activa historial/auditoría (default: true). */
  readonly historial?: boolean;
  /** Activa cronología/timeline (default: true). */
  readonly cronologia?: boolean;
}

/**
 * Ensambla los runtimes de colaboración/observabilidad de una entidad en un
 * ExtrasModulo COMPLETO: comandos, queries, event handlers, capacidades,
 * permisos (leer/editar de la definición, para que el contrato sea explícito),
 * dependencias de plataforma y configuracionDefaults (clave SIN prefijo).
 */
export function crearColaboracion(
  def: DefinicionEntidad,
  opciones: OpcionesColaboracion = {},
): ExtrasModulo {
  const comandos: ((deps: ServiceDeps) => CommandDefinition<any, any>)[] = [];
  const queries: ((deps: ServiceDeps) => QueryDefinition<any, any>)[] = [];
  const eventHandlers: EventHandlerDefinition[] = [];
  const capacidades: Capacidad[] = [];
  const permisos = new Set<string>();
  const dependeDe = new Set<string>();
  const configuracionDefaults: Record<string, string> = {};

  const usaLectura = () => permisos.add(def.permisos.leer);
  const usaEdicion = () => permisos.add(def.permisos.editar);

  if (opciones.comentarios !== false) {
    const c = crearComentarios(def);
    comandos.push(...c.comandos);
    queries.push(...c.queries);
    capacidades.push(capacidadComentarios(def));
    usaLectura();
    usaEdicion();
    for (const d of DEPENDENCIAS_COMENTARIOS) dependeDe.add(d);
  }
  if (opciones.adjuntos !== false) {
    const a = crearAdjuntos(def);
    comandos.push(...a.comandos);
    queries.push(...a.queries);
    capacidades.push(capacidadAdjuntos(def));
    usaLectura();
    usaEdicion();
    for (const d of DEPENDENCIAS_ADJUNTOS) dependeDe.add(d);
    Object.assign(configuracionDefaults, configDefaultsAdjuntos());
  }
  if (opciones.historial !== false) {
    queries.push(...crearHistorial(def).queries);
    capacidades.push(capacidadAuditoria(def));
    usaLectura();
  }
  if (opciones.cronologia !== false) {
    queries.push(...crearCronologia(def).queries);
    eventHandlers.push(...handlersCronologia([def]));
    usaLectura();
    for (const d of DEPENDENCIAS_CRONOLOGIA) dependeDe.add(d);
  }
  if (opciones.kpis && opciones.kpis.length > 0) {
    queries.push(...crearIndicadores(def, opciones.kpis).queries);
    eventHandlers.push(...handlersKpis(def, opciones.kpis));
    capacidades.push(capacidadIndicadores(def));
    usaLectura();
  }
  if (opciones.panel) {
    queries.push(...crearPanel(def).queries);
    capacidades.push(capacidadPanel(def));
    usaLectura();
    Object.assign(configuracionDefaults, configDefaultsPanel(def, opciones.panel));
  }

  return {
    comandos,
    queries,
    eventHandlers,
    capacidades,
    permisos: [...permisos],
    dependeDe: [...dependeDe],
    configuracionDefaults,
  };
}
