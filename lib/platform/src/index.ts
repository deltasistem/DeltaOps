/**
 * DeltaOps Plataforma · Barril público (DGP-003).
 * Los módulos futuros importan SOLO desde "@workspace/platform".
 */
export * from "./core/types";
export * from "./core/record-store";
// Registries: exportación explícita — `registrarKey` es capacidad interna
// sellada; NUNCA se expone en la API pública (registro manual prohibido).
export {
  SharedServiceRegistry,
  CapabilityRegistry,
  DependencyRegistry,
  KnowledgeGraph,
  ObservabilityRegistry,
} from "./core/registries";
export type {
  ServiceDescriptor,
  CapabilityDescriptor,
  HealthStatus,
  HealthCheck,
  KnowledgeNode,
  KnowledgeEdge,
} from "./core/registries";
export * from "./core/audit";
export * from "./core/tenant-config";
export * from "./core/service";
export * from "./core/helpers";
export * from "./runtime";
export * from "./services/notification";
export * from "./services/attachment";
export * from "./services/comment";
export * from "./services/timeline";
export * from "./services/task";
export * from "./services/search";
export * from "./services/export";
export * from "./services/import";
export * from "./services/report";
export * from "./services/qr";
export * from "./services/dashboard";
export * from "./services/kpi";
export * from "./services/integration";
export * from "./services/ai-platform";
export * from "./services/config";
