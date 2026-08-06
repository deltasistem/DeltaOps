/**
 * DGP-011.2 · Composición OPERATIVA del Módulo Enterprise Inventory.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el Motor de Workflow (DGP-007,
 * bajo `MODULO_WORKFLOW`) + este módulo, seleccionando adaptadores PostgreSQL o
 * Fake (offline) según haya `pool`. El gobierno de transferencias/ajustes/
 * conteos se cablea con el `WorkflowMotorAdapter` REAL (nunca auto-aprobación):
 * si el motor rechaza, el comando gobernado NO produce efecto. Mismo patrón que
 * `crearOrdenesRuntime` (DGP-009.2).
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
import { crearMotorWorkflow } from "@workspace/workflow-engine";
import { MODULO_WORKFLOW } from "./module-name";
import { inventarioModule, type ModuleAdapters } from "./module";
import {
  PgAjusteRepository,
  PgBodegaRepository,
  PgCatalogoStore,
  PgConsecutivoStore,
  PgConteoRepository,
  PgInventarioRepository,
  PgItemRepository,
  PgLoteSerieRepository,
  PgReciboStore,
  PgReservaRepository,
  PgTransferenciaRepository,
} from "./infrastructure/repository";
import {
  FakeConsolaStore,
  FakeEventLogStore,
  FakeReadModelsStore,
  FakeSyncReceiptStore,
  PgConsolaStore,
  PgEventLogStore,
  PgReadModelsStore,
  PgSyncReceiptStore,
  type ConsolaStore,
  type EventLogStore,
  type ReadModelsStore,
  type SyncReceiptStore,
} from "./infrastructure/operacional";
import {
  FakeAjusteRepository,
  FakeBodegaRepository,
  FakeCatalogos,
  FakeConsecutivo,
  FakeConteoRepository,
  FakeInventarioRepository,
  FakeItemRepository,
  FakeLoteSerieRepository,
  FakeRecibos,
  FakeReservaRepository,
  FakeTransferenciaRepository,
} from "./infrastructure/fakes";
import { WorkflowMotorAdapter } from "./infrastructure/workflow-adapter";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface InventarioRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
}

export interface InventarioRuntimeOperacional {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearInventarioRuntimeOperacional(
  options: InventarioRuntimeOptions = {},
): InventarioRuntimeOperacional {
  const { pool } = options;

  const items = pool ? new PgItemRepository(pool) : new FakeItemRepository();
  const inventario = pool ? new PgInventarioRepository(pool) : new FakeInventarioRepository();
  const bodegas = pool ? new PgBodegaRepository(pool) : new FakeBodegaRepository();
  const lotesSeries = pool ? new PgLoteSerieRepository(pool) : new FakeLoteSerieRepository();
  const reservas = pool ? new PgReservaRepository(pool) : new FakeReservaRepository();
  const transferencias = pool ? new PgTransferenciaRepository(pool) : new FakeTransferenciaRepository();
  const ajustes = pool ? new PgAjusteRepository(pool) : new FakeAjusteRepository();
  const conteos = pool ? new PgConteoRepository(pool) : new FakeConteoRepository();

  const readModel: ReadModelsStore = pool ? new PgReadModelsStore(pool) : new FakeReadModelsStore();
  const eventLog: EventLogStore = pool ? new PgEventLogStore(pool) : new FakeEventLogStore();
  const syncReceipts: SyncReceiptStore = pool ? new PgSyncReceiptStore(pool) : new FakeSyncReceiptStore();

  // Consola técnica: PG lee el outbox del Kernel por SQL; en memoria lee el
  // outbox in-memory por accesor perezoso (resuelto tras montar la plataforma).
  let outboxRecords: () => readonly OutboxRecord[] = () => [];
  const consola: ConsolaStore = pool ? new PgConsolaStore(pool) : new FakeConsolaStore(() => outboxRecords());

  // Adaptador REAL de Workflow (holder perezoso para el ciclo runtime↔adaptador).
  const holder: { runtime: PlatformRuntime | null } = { runtime: null };
  const workflow = new WorkflowMotorAdapter(() => {
    if (!holder.runtime) throw new Error("runtime aún no disponible");
    return holder.runtime;
  }, MODULO_WORKFLOW);

  const adapters: ModuleAdapters = {
    items,
    inventario,
    bodegas,
    lotesSeries,
    reservas,
    transferencias,
    ajustes,
    conteos,
    catalogos: pool ? new PgCatalogoStore(pool) : new FakeCatalogos(),
    consecutivo: pool ? new PgConsecutivoStore(pool) : new FakeConsecutivo(),
    recibos: pool ? new PgReciboStore(pool) : new FakeRecibos(),
    readModel,
    eventLog,
    syncReceipts,
    consola,
    workflow,
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [
      crearMotorWorkflow({ servicio: MODULO_WORKFLOW }),
      inventarioModule(adapters),
    ],
  });
  holder.runtime = platform;

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
