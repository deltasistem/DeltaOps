/**
 * DGP-007 · Workflow Engine — Módulo de plataforma oficial.
 *
 * `crearMotorWorkflow(opciones)` produce un `PlatformServiceDefinition` con el
 * contrato COMPLETO declarado (eventos, capacidades, permisos, recordTypes,
 * configuracionDefaults) que compone:
 *   - Comandos de instancia (motor.ts): iniciar/transicionar/estándar/aprobar/…
 *   - Comandos+consultas de diseño (registro.ts): publicar/activar/migrar/…
 *   - Comandos+consultas de sincronización (sincronizacion.ts).
 *
 * Se monta vía `extraServices` de `createPlatformRuntime`. El servicio depende
 * de `platform.config` y `platform.notification` (acción declarativa notificar).
 *
 * 100% neutro. Todo por Kernel + RecordStorePort.
 */
import { z } from "zod";
import type { CommandDefinition, QueryDefinition } from "@workspace/kernel";
import { tenantOf, type PlatformServiceDefinition, type ServiceDeps } from "@workspace/platform";
import { ok } from "@workspace/kernel";
import {
  crearComandosInstancia,
  eventosInstancia,
  nombresInstancia,
  RECORD_TYPE_INSTANCIA,
  type OpcionesMotor,
} from "./motor";
import {
  crearComandosDefinicion,
  crearQueriesDefinicion,
  crearResolverDefinicion,
  eventosDefinicion,
  RECORD_TYPE_DEFINICION,
} from "./registro";
// La sincronización offline se orquesta con `procesarCola` (función), NO con un
// comando del Kernel que envuelva a otros (ver sincronizacion.ts + DGP-006).

/** Opciones del motor de workflow. Permisos declarados por el consumidor. */
export interface OpcionesMotorWorkflow {
  /** Servicio propietario, p. ej. `flujo.demo` (kebab.segmentos). */
  readonly servicio: string;
  /** Etiqueta legible del motor. */
  readonly etiqueta?: string;
  readonly descripcion?: string;
  readonly version?: string;
  /** Permiso de lectura de instancias/definiciones. Default `<servicio>.read`. */
  readonly permisoLeer?: string;
  /** Permiso de escritura/operación de instancias. Default `<servicio>.operar`. */
  readonly permisoEscribir?: string;
  /** Permiso de diseño de definiciones. Default `<servicio>.disenar`. */
  readonly permisoDisenar?: string;
  /** Dependencias de plataforma extra. */
  readonly dependeDe?: readonly string[];
  /** Defaults de configuración por tenant (clave SIN prefijo de servicio). */
  readonly configuracionDefaults?: Record<string, string>;
  /**
   * Resolutor de definición. Por defecto se usa el resolutor basado en registro
   * (definiciones persistidas como datos). Se puede inyectar uno fijo para
   * escenarios de test unitario del motor.
   */
  readonly resolverDefinicion?: OpcionesMotor["resolverDefinicion"];
}

export interface PermisosMotor {
  readonly leer: string;
  readonly escribir: string;
  readonly disenar: string;
}

/** Permisos efectivos derivados de las opciones. */
export function permisosDe(opts: OpcionesMotorWorkflow): PermisosMotor {
  return {
    leer: opts.permisoLeer ?? `${opts.servicio}.read`,
    escribir: opts.permisoEscribir ?? `${opts.servicio}.operar`,
    disenar: opts.permisoDisenar ?? `${opts.servicio}.disenar`,
  };
}

/**
 * Fábrica principal: construye el descriptor de plataforma del motor de
 * workflow para un servicio dado.
 */
export function crearMotorWorkflow(opts: OpcionesMotorWorkflow): PlatformServiceDefinition {
  const servicio = opts.servicio;
  const permisos = permisosDe(opts);
  const nInst = nombresInstancia(servicio);

  const resolver = opts.resolverDefinicion ?? crearResolverDefinicion(servicio);

  const comandosInstancia = crearComandosInstancia({
    servicio,
    permisoLeer: permisos.leer,
    permisoEscribir: permisos.escribir,
    resolverDefinicion: resolver,
  });
  const comandosDefinicion = crearComandosDefinicion({
    servicio,
    permisoDisenar: permisos.disenar,
    permisoLeer: permisos.leer,
  });
  const queriesDefinicion = crearQueriesDefinicion({
    servicio,
    permisoDisenar: permisos.disenar,
    permisoLeer: permisos.leer,
  });
  // Consultas de instancia (obtener/listar) — genéricas sobre el store.
  const obtenerInstancia = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nInst.obtener,
    inputSchema: z.object({ id: z.string() }),
    authorization: { permissions: [permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      return deps.store.findById(tenant.value, input.id);
    },
  });
  const listarInstancias = (deps: ServiceDeps): QueryDefinition<any, any> => ({
    name: nInst.listar,
    inputSchema: z.object({
      estado: z.string().optional(),
      limit: z.number().int().positive().max(500).optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    authorization: { permissions: [permisos.leer] },
    async handle(ctx, input) {
      const tenant = tenantOf(ctx);
      if (!tenant.ok) return tenant;
      return deps.store.list(tenant.value, {
        service: servicio,
        recordType: RECORD_TYPE_INSTANCIA,
        status: input.estado,
        limit: input.limit,
        offset: input.offset,
      });
    },
  });

  const commands: readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[] = [
    ...comandosDefinicion,
    ...comandosInstancia,
  ];
  const queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[] = [
    ...queriesDefinicion,
    obtenerInstancia,
    listarInstancias,
  ];

  const eventos = [...eventosInstancia(servicio), ...eventosDefinicion(servicio)];

  const capacidades = [
    {
      name: `operar-${servicio}`,
      permissions: [permisos.leer, permisos.escribir],
      description: `Operar instancias del motor de workflow ${servicio}`,
    },
    {
      name: `disenar-${servicio}`,
      permissions: [permisos.leer, permisos.disenar],
      description: `Diseñar y versionar definiciones de workflow ${servicio}`,
    },
  ];

  return {
    name: servicio,
    version: opts.version ?? "1.0.0",
    description:
      opts.descripcion ??
      `${opts.etiqueta ?? "Motor de Workflow"} — DGP-007 Workflow Engine (neutro): instancias, ` +
        `definiciones versionadas, aprobaciones y sincronización offline.`,
    capabilities: capacidades,
    permissions: [permisos.leer, permisos.escribir, permisos.disenar],
    dependsOn: [...new Set(["platform.config", "platform.notification", ...(opts.dependeDe ?? [])])],
    events: eventos,
    recordTypes: [RECORD_TYPE_INSTANCIA, RECORD_TYPE_DEFINICION],
    configDefaults: {
      "aprobacion-permitir-autor": "false",
      "sync-max-lote": "100",
      ...(opts.configuracionDefaults ?? {}),
    },
    commands,
    queries,
    eventHandlers: [],
    healthCheck: (deps: ServiceDeps) => async () => {
      const probe = await deps.store.list("__health__", { service: servicio, limit: 1 });
      return probe.ok
        ? { healthy: true, detail: "motor de workflow operativo" }
        : { healthy: false, detail: probe.error.message };
    },
  };
}

/** Re-export de utilidades comúnmente necesarias por los consumidores. */
export { ok, nombresInstancia };
