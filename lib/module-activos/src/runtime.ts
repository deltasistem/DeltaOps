/**
 * DGP-008.1 · Composición oficial del Módulo Activos Empresariales.
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + este módulo, seleccionando
 * adaptadores PostgreSQL o Fake (offline) según haya pool. Idéntico patrón a
 * createReferenceRuntime (DGP-004) y createWorkflowRuntime (DGP-007).
 */
import type { Pool } from "pg";
import type { ExecutionContext } from "@workspace/kernel";
import {
  createPlatformRuntime,
  type PlatformRuntime,
  type PlatformRuntimeOptions,
} from "@workspace/platform";
import {
  FakeActivoReadModel,
  FakeActivoRepository,
  FakeSyncReceiptStore,
  PgActivoReadModel,
  PgActivoRepository,
  PgSyncReceiptStore,
  type ActivoReadModel,
  type ActivoRepository,
  type SyncReceiptStore,
} from "./infrastructure/repository";
import { activosModule, type ModuleAdapters } from "./module";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface ActivosRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  /**
   * Sincroniza una cola de operaciones offline (una UoW por operación,
   * idempotencia durable tenant-scoped). Orquestación, NO comando anidado.
   */
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearActivosRuntime(
  options: Omit<PlatformRuntimeOptions, "extraServices"> & { pool?: Pool } = {},
): ActivosRuntime {
  const repository: ActivoRepository = options.pool
    ? new PgActivoRepository(options.pool)
    : new FakeActivoRepository();
  const readModel: ActivoReadModel = options.pool
    ? new PgActivoReadModel(options.pool)
    : new FakeActivoReadModel();
  // Store de recibos durables por opId (idempotencia Offline First tenant-scoped).
  const syncReceipts: SyncReceiptStore = options.pool
    ? new PgSyncReceiptStore(options.pool)
    : new FakeSyncReceiptStore();
  const adapters: ModuleAdapters = { repository, readModel };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [activosModule(adapters)],
  });

  return {
    platform,
    adapters,
    sincronizar: (ctx, operaciones) => procesarCola(platform, syncReceipts, repository, ctx, operaciones),
  };
}
