/**
 * DeltaOps Plataforma · Registros oficiales.
 * Shared Service Registry, Capability Registry, Dependency Registry,
 * Knowledge Graph y Observability Registry.
 * PROHIBIDO registrar manualmente: solo `registerPlatformService()` escribe
 * aquí, a partir de los descriptores declarativos de cada servicio.
 */
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";

export interface ServiceDescriptor {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly recordTypes: readonly string[];
  readonly commands: readonly string[];
  readonly queries: readonly string[];
  readonly events: readonly string[];
  readonly registeredAt: Date;
}

export interface CapabilityDescriptor {
  readonly name: string;
  readonly service: string;
  readonly permissions: readonly string[];
  readonly description: string;
}

export interface HealthStatus {
  readonly service: string;
  readonly healthy: boolean;
  readonly detail: string;
  readonly checkedAt: Date;
}

export type HealthCheck = () => Promise<Omit<HealthStatus, "service" | "checkedAt">>;

export interface KnowledgeNode {
  readonly id: string;
  readonly kind: "service" | "capability" | "event" | "recordType";
  readonly label: string;
}
export interface KnowledgeEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: "provides" | "emits" | "stores" | "depends_on";
}

/** Marca interna: impide escrituras fuera de registerPlatformService. */
const REGISTRAR = Symbol("platform.registrar");
export function registrarKey(): symbol {
  return REGISTRAR;
}

export class SharedServiceRegistry {
  private readonly services = new Map<string, ServiceDescriptor>();
  register(key: symbol, descriptor: ServiceDescriptor): Result<void, KernelError> {
    if (key !== REGISTRAR) {
      return fail(KernelErrors.forbidden("Registro manual de servicios prohibido (DGP-003)"));
    }
    if (this.services.has(descriptor.name)) {
      return fail(KernelErrors.conflict(`Servicio duplicado: ${descriptor.name}`));
    }
    this.services.set(descriptor.name, descriptor);
    return ok(undefined);
  }
  get(name: string): ServiceDescriptor | undefined {
    return this.services.get(name);
  }
  list(): ServiceDescriptor[] {
    return [...this.services.values()];
  }
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityDescriptor>();
  register(key: symbol, cap: CapabilityDescriptor): Result<void, KernelError> {
    if (key !== REGISTRAR) {
      return fail(KernelErrors.forbidden("Registro manual de capacidades prohibido (DGP-003)"));
    }
    if (this.capabilities.has(cap.name)) {
      return fail(KernelErrors.conflict(`Capacidad duplicada: ${cap.name}`));
    }
    this.capabilities.set(cap.name, cap);
    return ok(undefined);
  }
  list(): CapabilityDescriptor[] {
    return [...this.capabilities.values()];
  }
}

export class DependencyRegistry {
  private readonly deps = new Map<string, readonly string[]>();
  register(key: symbol, service: string, dependsOn: readonly string[]): Result<void, KernelError> {
    if (key !== REGISTRAR) {
      return fail(KernelErrors.forbidden("Registro manual de dependencias prohibido (DGP-003)"));
    }
    this.deps.set(service, dependsOn);
    return ok(undefined);
  }
  of(service: string): readonly string[] {
    return this.deps.get(service) ?? [];
  }
  list(): { service: string; dependsOn: readonly string[] }[] {
    return [...this.deps.entries()].map(([service, dependsOn]) => ({ service, dependsOn }));
  }
  /** Valida que toda dependencia declarada exista en el Service Registry. */
  validate(services: SharedServiceRegistry): Result<void, KernelError> {
    for (const { service, dependsOn } of this.list()) {
      for (const dep of dependsOn) {
        if (!services.get(dep)) {
          return fail(
            KernelErrors.validation(`Servicio ${service} depende de ${dep}, que no está registrado`),
          );
        }
      }
    }
    return ok(undefined);
  }
}

export class KnowledgeGraph {
  private readonly nodes = new Map<string, KnowledgeNode>();
  private readonly edges: KnowledgeEdge[] = [];
  addNode(key: symbol, node: KnowledgeNode): void {
    if (key !== registrarKey()) throw new Error("Knowledge Graph: escritura manual prohibida");
    this.nodes.set(node.id, node);
  }
  addEdge(key: symbol, edge: KnowledgeEdge): void {
    if (key !== registrarKey()) throw new Error("Knowledge Graph: escritura manual prohibida");
    this.edges.push(edge);
  }
  snapshot(): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
    return { nodes: [...this.nodes.values()], edges: [...this.edges] };
  }
}

export class ObservabilityRegistry {
  private readonly checks = new Map<string, HealthCheck>();
  register(key: symbol, service: string, check: HealthCheck): Result<void, KernelError> {
    if (key !== REGISTRAR) {
      return fail(KernelErrors.forbidden("Registro manual de observabilidad prohibido (DGP-003)"));
    }
    this.checks.set(service, check);
    return ok(undefined);
  }
  async checkAll(): Promise<HealthStatus[]> {
    const out: HealthStatus[] = [];
    for (const [service, check] of this.checks) {
      try {
        const r = await check();
        out.push({ service, ...r, checkedAt: new Date() });
      } catch (err) {
        out.push({
          service,
          healthy: false,
          detail: err instanceof Error ? err.message : "health check lanzó excepción",
          checkedAt: new Date(),
        });
      }
    }
    return out;
  }
}
