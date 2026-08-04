/**
 * DGP-008.1 · Composición oficial del Módulo Activos Empresariales.
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + este módulo, seleccionando
 * adaptadores PostgreSQL o Fake (offline) según haya pool. Idéntico patrón a
 * createReferenceRuntime (DGP-004) y createWorkflowRuntime (DGP-007).
 */
import type { Pool } from "pg";
import {
  InMemoryOutboxStore,
  KernelTokens,
  type ExecutionContext,
  type OutboxRecord,
} from "@workspace/kernel";
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
import {
  FakeConsolaStore,
  FakeEventLogStore,
  FakeHistorialStore,
  FakeRelacionReadModel,
  FakeRelacionRepository,
  PgConsolaStore,
  PgEventLogStore,
  PgHistorialStore,
  PgRelacionReadModel,
  PgRelacionRepository,
  type ConsolaStore,
  type EventLogStore,
  type HistorialStore,
  type RelacionReadModel,
  type RelacionRepository,
} from "./infrastructure/relaciones-store";
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
  const relaciones: RelacionRepository = options.pool
    ? new PgRelacionRepository(options.pool)
    : new FakeRelacionRepository();
  const relacionesRead: RelacionReadModel = options.pool
    ? new PgRelacionReadModel(options.pool)
    : new FakeRelacionReadModel();
  const historial: HistorialStore = options.pool
    ? new PgHistorialStore(options.pool)
    : new FakeHistorialStore();
  // Bitácora de eventos durable del módulo (fuente de verdad del replay).
  const eventLog: EventLogStore = options.pool
    ? new PgEventLogStore(options.pool)
    : new FakeEventLogStore();

  // Consola técnica: en PG lee el outbox del Kernel por SQL; en memoria lee los
  // registros del outbox in-memory del Kernel mediante un accesor perezoso
  // (el store se resuelve del contenedor DESPUÉS de montar la plataforma).
  let outboxRecords: () => readonly OutboxRecord[] = () => [];
  const consola: ConsolaStore = options.pool
    ? new PgConsolaStore(options.pool)
    : new FakeConsolaStore(() => outboxRecords());

  const adapters: ModuleAdapters = {
    repository, readModel, relaciones, relacionesRead, historial, syncReceipts, consola, eventLog,
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [activosModule(adapters)],
  });

  if (!options.pool) {
    const store = platform.kernel.container.resolve(KernelTokens.outbox);
    if (store instanceof InMemoryOutboxStore) outboxRecords = () => store.records;
  }

  return {
    platform,
    adapters,
    sincronizar: (ctx, operaciones) => procesarCola(platform, syncReceipts, repository, ctx, operaciones),
  };
}
