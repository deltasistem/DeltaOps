/**
 * DGP-009.2 · Composición oficial del Módulo Órdenes de Trabajo Empresariales.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el motor de Dynamic Forms
 * (DGP-007) + el motor de Workflow (DGP-007) + este módulo, seleccionando
 * adaptadores PostgreSQL o Fake (offline) según haya `pool`. Mismo patrón que
 * `crearActivosRuntime` (DGP-008.1) y `crearWorkflowRuntime` (DGP-007).
 *
 * Los eventHandlers del módulo proyectan CQRS + bitácora + Shared Timeline desde
 * el payload autosuficiente (idempotente). `sincronizar` orquesta la cola
 * offline (una UoW por operación; NUNCA comandos anidados) y drena el outbox.
 */
import type { Pool } from "pg";
import {
  createExecutionContext,
  InMemoryOutboxStore,
  KernelTokens,
  SYSTEM_PRINCIPAL,
  type ExecutionContext,
  type OutboxRecord,
} from "@workspace/kernel";
import {
  createPlatformRuntime,
  type PlatformRuntime,
  type PlatformRuntimeOptions,
} from "@workspace/platform";
import { crearMotorFormularios, ResolutorPlantillaStore } from "@workspace/dynamic-forms";
import { crearMotorWorkflow } from "@workspace/workflow-engine";
import { MODULO_WORKFLOW } from "./module-name";
import { ordenesModule, type ModuleAdapters } from "./module";
import {
  FakeOrdenReadModel,
  PgCatalogoStore,
  PgConsecutivoStore,
  PgOrdenReadModel,
  PgOrdenRepository,
  PgReciboStore,
  type OrdenReadModel,
} from "./infrastructure/repository";
import {
  FakeConsolaStore,
  FakeEventLogStore,
  FakeMotorStore,
  FakeProyeccionesStore,
  FakeSyncReceiptStore,
  PgConsolaStore,
  PgEventLogStore,
  PgMotorStore,
  PgProyeccionesStore,
  PgSyncReceiptStore,
  type ConsolaStore,
  type EventLogStore,
  type MotorStore,
  type ProyeccionesStore,
  type SyncReceiptStore,
} from "./infrastructure/operacional";
import {
  FakeCatalogos,
  FakeConsecutivo,
  FakeOrdenRepository,
  FakeRecibos,
} from "./infrastructure/fakes";
import { plantillasDesdeRuntime } from "./infrastructure/plantillas-runtime";
import type { OrdenRepository, PlantillasPort } from "./domain/ports";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface OrdenesRuntimeOptions
  extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /** Puerto de plantillas (Dynamic Forms). Por defecto: motor REAL del runtime. */
  readonly plantillas?: PlantillasPort;
}

export interface OrdenesRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  /**
   * Sincroniza una cola de operaciones offline (una UoW por operación,
   * idempotencia durable tenant-scoped por opId). Orquestación, NO comando
   * anidado; drena el outbox al final.
   */
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearOrdenesRuntime(options: OrdenesRuntimeOptions = {}): OrdenesRuntime {
  const { pool } = options;

  // Read-side + persistencia: PG o Fake según haya pool.
  const repository: OrdenRepository = pool ? new PgOrdenRepository(pool) : new FakeOrdenRepository();
  const readModel: OrdenReadModel = pool ? new PgOrdenReadModel(pool) : new FakeOrdenReadModel();
  const eventLog: EventLogStore = pool ? new PgEventLogStore(pool) : new FakeEventLogStore();
  const proyecciones: ProyeccionesStore = pool ? new PgProyeccionesStore(pool) : new FakeProyeccionesStore();
  const motor: MotorStore = pool ? new PgMotorStore(pool) : new FakeMotorStore();
  const syncReceipts: SyncReceiptStore = pool ? new PgSyncReceiptStore(pool) : new FakeSyncReceiptStore();

  // Consola técnica: en PG lee el outbox del Kernel por SQL; en memoria lee los
  // registros del outbox in-memory mediante accesor perezoso (el store se
  // resuelve del contenedor DESPUÉS de montar la plataforma).
  let outboxRecords: () => readonly OutboxRecord[] = () => [];
  const consola: ConsolaStore = pool ? new PgConsolaStore(pool) : new FakeConsolaStore(() => outboxRecords());

  // Puerto de plantillas (Dynamic Forms). Por defecto usa el motor REAL del
  // runtime que se está montando (holder para resolver el ciclo).
  const resolutor = new ResolutorPlantillaStore();
  const holder: { runtime: PlatformRuntime | null } = { runtime: null };
  const plantillas: PlantillasPort =
    options.plantillas ??
    plantillasDesdeRuntime(
      new Proxy({} as PlatformRuntime, {
        get(_t, prop) {
          if (!holder.runtime) throw new Error("runtime aún no disponible");
          return (holder.runtime as unknown as Record<string | symbol, unknown>)[prop];
        },
      }),
      (tenantId) => createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId } }),
    );

  const adapters: ModuleAdapters = {
    repository,
    catalogos: pool ? new PgCatalogoStore(pool) : new FakeCatalogos(),
    consecutivo: pool ? new PgConsecutivoStore(pool) : new FakeConsecutivo(),
    recibos: pool ? new PgReciboStore(pool) : new FakeRecibos(),
    plantillas,
    readModel,
    eventLog,
    proyecciones,
    motor,
    syncReceipts,
    consola,
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [
      crearMotorFormularios({ resolutor }),
      crearMotorWorkflow({ servicio: MODULO_WORKFLOW }),
      ordenesModule(adapters),
    ],
  });
  holder.runtime = platform;
  resolutor.conectar(platform.store);

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
