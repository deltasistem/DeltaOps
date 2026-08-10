/**
 * DGP-016.2 · Composición OPERATIVA del Módulo Enterprise Analytics & KPI Platform.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + este módulo, seleccionando
 * adaptadores PostgreSQL o Fake (offline) según haya `pool`. En modo PG todas las
 * consultas se sirven de los read models CQRS; los comandos escriben aggregate +
 * bitácora durable en la MISMA UoW y proyectan por outbox. Mismo patrón que
 * `crearCorrectivoRuntimeOperacional` (DGP-015.2).
 *
 * SOLO LECTURA sobre datos ajenos: las FUENTES de hechos read-only se inyectan por
 * PUERTOS fail-safe desde la capa de integración (API Server), que compone los
 * contratos públicos de cada módulo en sus PROPIOS runtimes; el módulo permanece
 * desacoplado. Sin fuente ⇒ la evaluación FALLA de forma segura (KRN-CFL).
 *
 * `sincronizar` orquesta la cola offline (una UoW por operación; NUNCA comandos
 * anidados) y drena el outbox al final.
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
import { analyticsModule, type ModuleAdapters } from "./module";
import {
  PgCatalogoStore,
  PgDashboardRepository,
  PgDefinicionRepository,
  PgReciboStore,
  PgSnapshotRepository,
} from "./infrastructure/repository";
import {
  FakeConsolaStore,
  FakeReadModelsStore,
  FakeSyncReceiptStore,
  PgConsolaStore,
  PgEventLogStore,
  PgReadModelsStore,
  PgSyncReceiptStore,
  type ConsolaStore,
  type ReadModelsStore,
  type SyncReceiptStore,
} from "./infrastructure/operacional";
import { crearFakeAdapters } from "./fakes";
import type { EventLogStore, RegistroFuentes } from "./domain/ports";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface AnalyticsRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /**
   * Registro de fuentes read-only por módulo (fail-safe). Lo inyecta la capa de
   * integración (API Server) componiendo los contratos públicos de cada módulo.
   */
  readonly fuentes?: RegistroFuentes;
}

export interface AnalyticsRuntimeOperacional {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearAnalyticsRuntimeOperacional(
  options: AnalyticsRuntimeOptions = {},
): AnalyticsRuntimeOperacional {
  const { pool, fuentes } = options;

  const fakes = pool ? null : crearFakeAdapters();

  const definiciones = pool ? new PgDefinicionRepository(pool) : fakes!.definiciones;
  const dashboards = pool ? new PgDashboardRepository(pool) : fakes!.dashboards;
  const snapshots = pool ? new PgSnapshotRepository(pool) : fakes!.snapshots;

  const readModel: ReadModelsStore = pool ? new PgReadModelsStore(pool) : new FakeReadModelsStore();
  const eventLog: EventLogStore = pool ? new PgEventLogStore(pool) : fakes!.eventLog;
  const syncReceipts: SyncReceiptStore = pool ? new PgSyncReceiptStore(pool) : new FakeSyncReceiptStore();

  // Consola técnica: PG lee el outbox del Kernel por SQL; en memoria lee el
  // outbox in-memory por accesor perezoso (resuelto tras montar la plataforma).
  let outboxRecords: () => readonly OutboxRecord[] = () => [];
  const consola: ConsolaStore = pool ? new PgConsolaStore(pool) : new FakeConsolaStore(() => outboxRecords());

  const adapters: ModuleAdapters = {
    definiciones,
    dashboards,
    snapshots,
    catalogos: pool ? new PgCatalogoStore(pool) : fakes!.catalogos,
    recibos: pool ? new PgReciboStore(pool) : fakes!.recibos,
    eventLog,
    readModel,
    syncReceipts,
    consola,
    ...(fuentes ? { fuentes } : {}),
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [analyticsModule(adapters)],
  });

  if (!pool) {
    const store = platform.kernel.container.resolve(KernelTokens.outbox);
    if (store instanceof InMemoryOutboxStore) outboxRecords = () => store.records;
  }

  return {
    platform,
    adapters,
    sincronizar: (ctx, operaciones) => procesarCola(platform, adapters, ctx, operaciones),
  };
}
