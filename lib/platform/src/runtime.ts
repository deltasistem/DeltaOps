/**
 * DeltaOps Plataforma · Platform Runtime (DGP-003).
 * Punto de composición oficial de la Plataforma de Servicios Compartidos.
 * Monta el Kernel (DGP-002), los adaptadores (Fake o PostgreSQL), los cinco
 * registros oficiales y registra automáticamente los 14 servicios.
 */
import type { Pool } from "pg";
import {
  createKernelRuntime,
  type KernelRuntime,
  type KernelRuntimeOptions,
} from "@workspace/kernel";
import { FakeAuditTrail, PgAuditTrail, type AuditTrailPort } from "./core/audit";
import { FakeRecordStore, PgRecordStore, type RecordStorePort } from "./core/record-store";
import {
  CapabilityRegistry,
  DependencyRegistry,
  KnowledgeGraph,
  ObservabilityRegistry,
  SharedServiceRegistry,
} from "./core/registries";
import {
  registerPlatformService,
  type PlatformRegistries,
  type PlatformServiceDefinition,
  type ServiceDeps,
} from "./core/service";
import { TenantConfigService } from "./core/tenant-config";
import { aiPlatformService } from "./services/ai-platform";
import { attachmentService } from "./services/attachment";
import { commentService } from "./services/comment";
import { configPlatformService } from "./services/config";
import { dashboardService } from "./services/dashboard";
import { exportService } from "./services/export";
import { importService } from "./services/import";
import { integrationService } from "./services/integration";
import { kpiService } from "./services/kpi";
import { notificationService } from "./services/notification";
import { qrService } from "./services/qr";
import { reportService } from "./services/report";
import { searchService } from "./services/search";
import { taskService } from "./services/task";
import { timelineService } from "./services/timeline";

export interface PlatformRuntimeOptions extends KernelRuntimeOptions {
  pool?: Pool;
  /** Servicios adicionales (extensión futura, mismo mecanismo declarativo). */
  extraServices?: PlatformServiceDefinition[];
}

export interface PlatformRuntime {
  readonly kernel: KernelRuntime;
  readonly registries: PlatformRegistries;
  readonly store: RecordStorePort;
  readonly audit: AuditTrailPort;
  readonly tenantConfig: TenantConfigService;
  readonly deps: ServiceDeps;
}

/** Catálogo oficial de servicios de la plataforma (orden respeta dependencias). */
export function officialServices(): PlatformServiceDefinition[] {
  return [
    configPlatformService(),
    notificationService(),
    attachmentService(),
    commentService(),
    timelineService(),
    taskService(),
    searchService(),
    exportService(),
    importService(),
    reportService(),
    qrService(),
    dashboardService(),
    kpiService(),
    integrationService(),
    aiPlatformService(),
  ];
}

export function createPlatformRuntime(
  options: PlatformRuntimeOptions = {},
): PlatformRuntime {
  const kernel = createKernelRuntime(options);
  const store: RecordStorePort = options.pool
    ? new PgRecordStore(options.pool)
    : new FakeRecordStore();
  const audit: AuditTrailPort = options.pool
    ? new PgAuditTrail(options.pool)
    : new FakeAuditTrail();
  const tenantConfig = new TenantConfigService(store, kernel.config);

  const registries: PlatformRegistries = {
    services: new SharedServiceRegistry(),
    capabilities: new CapabilityRegistry(),
    dependencies: new DependencyRegistry(),
    knowledgeGraph: new KnowledgeGraph(),
    observability: new ObservabilityRegistry(),
  };

  const deps: ServiceDeps = { store, audit, tenantConfig, runtime: kernel };

  for (const definition of [...officialServices(), ...(options.extraServices ?? [])]) {
    registerPlatformService(definition, deps, registries);
  }

  const valid = registries.dependencies.validate(registries.services);
  if (!valid.ok) throw new Error(valid.error.message);

  return { kernel, registries, store, audit, tenantConfig, deps };
}
