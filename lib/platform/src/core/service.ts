/**
 * DeltaOps Plataforma · Marco declarativo de Shared Platform Services.
 * Cada servicio se define como un descriptor puro (comandos, consultas,
 * eventos, capacidades, permisos, configuración por tenant, health check).
 * `registerPlatformService()` es el ÚNICO punto de registro: descubre el
 * descriptor y lo inscribe automáticamente en el Kernel y en los cinco
 * registros oficiales. Registrar manualmente está prohibido.
 */
import type {
  CommandDefinition,
  EventDispatcher,
  KernelRuntime,
  QueryDefinition,
  Result,
} from "@workspace/kernel";
import type { AuditTrailPort } from "./audit";
import type { RecordStorePort } from "./record-store";
import {
  CapabilityRegistry,
  DependencyRegistry,
  KnowledgeGraph,
  ObservabilityRegistry,
  registrarKey,
  SharedServiceRegistry,
  type HealthCheck,
} from "./registries";
import type { TenantConfigService } from "./tenant-config";

/** Dependencias inyectadas a los constructores de comandos/consultas. */
export interface ServiceDeps {
  readonly store: RecordStorePort;
  readonly audit: AuditTrailPort;
  readonly tenantConfig: TenantConfigService;
  readonly runtime: KernelRuntime;
}

export interface EventHandlerDefinition {
  readonly eventType: string;
  readonly handlerName: string;
  handle(deps: ServiceDeps): (event: {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    correlationId: string;
    occurredAt: Date;
  }) => Promise<Result<void, import("@workspace/kernel").KernelError>>;
}

export interface PlatformServiceDefinition {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  /** Capacidades ofrecidas (nombre → permisos que agrupa). */
  readonly capabilities: readonly { name: string; permissions: readonly string[]; description: string }[];
  /** Permisos que el servicio introduce. */
  readonly permissions: readonly string[];
  /** Servicios de plataforma de los que depende. */
  readonly dependsOn: readonly string[];
  /** Tipos de evento que emite. */
  readonly events: readonly string[];
  /** Tipos de registro que persiste. */
  readonly recordTypes: readonly string[];
  /** Defaults de configuración por tenant. */
  readonly configDefaults: Record<string, string>;
  readonly commands: readonly ((deps: ServiceDeps) => CommandDefinition<any, any>)[];
  readonly queries: readonly ((deps: ServiceDeps) => QueryDefinition<any, any>)[];
  readonly eventHandlers: readonly EventHandlerDefinition[];
  readonly healthCheck: (deps: ServiceDeps) => HealthCheck;
}

export interface PlatformRegistries {
  readonly services: SharedServiceRegistry;
  readonly capabilities: CapabilityRegistry;
  readonly dependencies: DependencyRegistry;
  readonly knowledgeGraph: KnowledgeGraph;
  readonly observability: ObservabilityRegistry;
}

/**
 * Registro automático: inscribe el servicio en el Kernel (pipelines +
 * dispatcher) y en los cinco registros oficiales, de forma derivada del
 * descriptor — sin pasos manuales.
 */
export function registerPlatformService(
  definition: PlatformServiceDefinition,
  deps: ServiceDeps,
  registries: PlatformRegistries,
): void {
  const key = registrarKey();
  const dispatcher: EventDispatcher = deps.runtime.dispatcher;

  const commands = definition.commands.map((build) => build(deps));
  const queries = definition.queries.map((build) => build(deps));
  for (const c of commands) deps.runtime.commands.register(c);
  for (const q of queries) deps.runtime.queries.register(q);
  for (const h of definition.eventHandlers) {
    dispatcher.subscribe(h.eventType, `${definition.name}:${h.handlerName}`, h.handle(deps));
  }

  deps.tenantConfig.registerDefaults(definition.name, definition.configDefaults);

  const descriptor = {
    name: definition.name,
    version: definition.version,
    description: definition.description,
    recordTypes: definition.recordTypes,
    commands: commands.map((c) => c.name),
    queries: queries.map((q) => q.name),
    events: definition.events,
    registeredAt: new Date(),
  };
  const sr = registries.services.register(key, descriptor);
  if (!sr.ok) throw new Error(sr.error.message);

  for (const cap of definition.capabilities) {
    const cr = registries.capabilities.register(key, {
      name: cap.name,
      service: definition.name,
      permissions: cap.permissions,
      description: cap.description,
    });
    if (!cr.ok) throw new Error(cr.error.message);
  }

  const dr = registries.dependencies.register(key, definition.name, definition.dependsOn);
  if (!dr.ok) throw new Error(dr.error.message);

  // Knowledge Graph derivado del descriptor
  registries.knowledgeGraph.addNode(key, {
    id: `service:${definition.name}`,
    kind: "service",
    label: definition.name,
  });
  for (const cap of definition.capabilities) {
    registries.knowledgeGraph.addNode(key, {
      id: `capability:${cap.name}`,
      kind: "capability",
      label: cap.name,
    });
    registries.knowledgeGraph.addEdge(key, {
      from: `service:${definition.name}`,
      to: `capability:${cap.name}`,
      relation: "provides",
    });
  }
  for (const ev of definition.events) {
    registries.knowledgeGraph.addNode(key, { id: `event:${ev}`, kind: "event", label: ev });
    registries.knowledgeGraph.addEdge(key, {
      from: `service:${definition.name}`,
      to: `event:${ev}`,
      relation: "emits",
    });
  }
  for (const rt of definition.recordTypes) {
    registries.knowledgeGraph.addNode(key, {
      id: `recordType:${definition.name}.${rt}`,
      kind: "recordType",
      label: `${definition.name}.${rt}`,
    });
    registries.knowledgeGraph.addEdge(key, {
      from: `service:${definition.name}`,
      to: `recordType:${definition.name}.${rt}`,
      relation: "stores",
    });
  }
  for (const dep of definition.dependsOn) {
    registries.knowledgeGraph.addEdge(key, {
      from: `service:${definition.name}`,
      to: `service:${dep}`,
      relation: "depends_on",
    });
  }

  const or = registries.observability.register(key, definition.name, definition.healthCheck(deps));
  if (!or.ok) throw new Error(or.error.message);
}
