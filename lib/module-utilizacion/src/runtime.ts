/**
 * DGP-019.1 · Composición OPERATIVA del Módulo de Utilización.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + este módulo, seleccionando
 * adaptadores PostgreSQL o Fake (offline) según haya `pool`. NO usa Workflow
 * Engine (fuera de alcance en esta fase).
 *
 * La composición con Activos se inyecta por PUERTO fail-safe (`ActivosPort`)
 * desde la capa de integración (API Server), que compone los comandos y
 * consultas OFICIALES de `module-activos` (detalle / actualizar-horometro /
 * actualizar-odometro) en su PROPIO runtime; el módulo permanece desacoplado.
 * Si no se inyecta, las lecturas se registran igual y la sincronización no se
 * intenta (la lectura histórica nunca se pierde).
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
import { utilizacionModule, type ModuleAdapters } from "./module";
import {
  PgCatalogoStore,
  PgLecturaRepository,
  PgReciboStore,
  PgTanqueoRepository,
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
import { crearFakeAdapters } from "./infrastructure/fakes";
import type { ActivosPort, EventLogStore } from "./domain/ports";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface UtilizacionRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /** Composición con Activos (detalle + actualizar horómetro/odómetro), fail-safe. */
  readonly activos?: ActivosPort;
}

export interface UtilizacionRuntimeOperacional {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearUtilizacionRuntimeOperacional(
  options: UtilizacionRuntimeOptions = {},
): UtilizacionRuntimeOperacional {
  const { pool, activos } = options;

  const fakes = pool ? null : crearFakeAdapters();

  const readModel: ReadModelsStore = pool ? new PgReadModelsStore(pool) : new FakeReadModelsStore();
  const eventLog: EventLogStore = pool ? new PgEventLogStore(pool) : fakes!.eventLog;
  const syncReceipts: SyncReceiptStore = pool ? new PgSyncReceiptStore(pool) : new FakeSyncReceiptStore();

  // Consola técnica: PG lee el outbox del Kernel por SQL; en memoria lee el
  // outbox in-memory por accesor perezoso (resuelto tras montar la plataforma).
  let outboxRecords: () => readonly OutboxRecord[] = () => [];
  const consola: ConsolaStore = pool ? new PgConsolaStore(pool) : new FakeConsolaStore(() => outboxRecords());

  const adapters: ModuleAdapters = {
    lecturas: pool ? new PgLecturaRepository(pool) : fakes!.lecturas,
    tanqueos: pool ? new PgTanqueoRepository(pool) : fakes!.tanqueos,
    catalogos: pool ? new PgCatalogoStore(pool) : fakes!.catalogos,
    recibos: pool ? new PgReciboStore(pool) : fakes!.recibos,
    eventLog,
    readModel,
    syncReceipts,
    consola,
    ...(activos ? { activos } : {}),
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [utilizacionModule(adapters)],
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
