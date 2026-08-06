/**
 * DGP-012.2 · Composición OPERATIVA del Módulo Enterprise Maintenance Plans.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el Motor de Workflow (DGP-007,
 * bajo `MODULO_WORKFLOW`) + este módulo, seleccionando adaptadores PostgreSQL o
 * Fake (offline) según haya `pool`. El gobierno de publicación/suspensión/
 * archivado se cablea con el `WorkflowMotorAdapter` REAL (nunca auto-aprobación):
 * si el motor rechaza, el comando gobernado NO produce efecto. Mismo patrón que
 * `crearInventarioRuntimeOperacional` (DGP-011.2).
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
import { planesModule, type ModuleAdapters } from "./module";
import {
  PgCalendarioRepository,
  PgCatalogoStore,
  PgConsecutivoStore,
  PgGeneracionRepository,
  PgHistorialRepository,
  PgPlanRepository,
  PgReciboStore,
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
import {
  FakeCalendarioRepository,
  FakeCatalogos,
  FakeConsecutivo,
  FakeEventLogStore,
  FakeGeneracionRepository,
  FakeHistorialRepository,
  FakePlanRepository,
  FakeRecibos,
} from "./infrastructure/fakes";
import type { EventLogStore, MaterializadorOrdenes } from "./domain/ports";
import { WorkflowMotorAdapter } from "./infrastructure/workflow-adapter";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface PlanesRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /**
   * Materializador de Órdenes de Trabajo (colaborador cross-módulo). Lo inyecta
   * la capa de integración (API Server) porque compone el comando OFICIAL de
   * `module-ordenes` en su propio runtime; el módulo permanece desacoplado.
   */
  readonly materializador?: MaterializadorOrdenes;
}

export interface PlanesRuntimeOperacional {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearPlanesRuntimeOperacional(
  options: PlanesRuntimeOptions = {},
): PlanesRuntimeOperacional {
  const { pool, materializador } = options;

  const planes = pool ? new PgPlanRepository(pool) : new FakePlanRepository();
  const calendarios = pool ? new PgCalendarioRepository(pool) : new FakeCalendarioRepository();
  const generaciones = pool ? new PgGeneracionRepository(pool) : new FakeGeneracionRepository();
  const historial = pool ? new PgHistorialRepository(pool) : new FakeHistorialRepository();

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
    planes,
    calendarios,
    generaciones,
    historial,
    catalogos: pool ? new PgCatalogoStore(pool) : new FakeCatalogos(),
    consecutivo: pool ? new PgConsecutivoStore(pool) : new FakeConsecutivo(),
    recibos: pool ? new PgReciboStore(pool) : new FakeRecibos(),
    eventLog,
    readModel,
    syncReceipts,
    consola,
    workflow,
    ...(materializador ? { materializador } : {}),
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [
      crearMotorWorkflow({ servicio: MODULO_WORKFLOW }),
      planesModule(adapters),
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
