/**
 * DGP-014.2 · Composición OPERATIVA del Módulo Enterprise Preventive Maintenance.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el Motor de Workflow (DGP-007,
 * bajo `MODULO_WORKFLOW`) + este módulo, seleccionando adaptadores PostgreSQL o
 * Fake (offline) según haya `pool`. El gobierno del ciclo programa/generación se
 * cablea con el `WorkflowMotorAdapter` REAL (nunca auto-aprobación): si el motor
 * rechaza, el comando gobernado NO produce efecto. Mismo patrón que
 * `crearAbastecimientoRuntimeOperacional` (DGP-013.2).
 *
 * La colaboración cross-módulo (Órdenes/Activos/Planes) se inyecta por PUERTOS
 * fail-safe (`materializador`/`activos`/`planes`) desde la capa de integración
 * (API Server), que compone los comandos OFICIALES de esos módulos en sus PROPIOS
 * runtimes; el módulo permanece desacoplado.
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
import { preventivoModule, type ModuleAdapters } from "./module";
import {
  PgActividadRepository,
  PgCatalogoStore,
  PgConsecutivoStore,
  PgGeneracionDedupStore,
  PgGeneracionRepository,
  PgHistorialRepository,
  PgProgramaRepository,
  PgProgramaVersionRepository,
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
import { crearFakeAdapters } from "./infrastructure/fakes";
import type { ActivosPort, EventLogStore, MaterializadorOrdenes, PlanesPort } from "./domain/ports";
import { WorkflowMotorAdapter } from "./infrastructure/workflow-adapter";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface PreventivoRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /**
   * Materializador de Órdenes de Trabajo (colaborador cross-módulo). Lo inyecta
   * la capa de integración (API Server) porque compone el comando OFICIAL de
   * `module-ordenes` (`crear`) en su propio runtime; el módulo permanece
   * desacoplado.
   */
  readonly materializador?: MaterializadorOrdenes;
  /** Verificación de activos (composición fail-safe). */
  readonly activos?: ActivosPort;
  /** Verificación de planes publicados (composición fail-safe). */
  readonly planes?: PlanesPort;
}

export interface PreventivoRuntimeOperacional {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearPreventivoRuntimeOperacional(
  options: PreventivoRuntimeOptions = {},
): PreventivoRuntimeOperacional {
  const { pool, materializador, activos, planes } = options;

  const fakes = pool ? null : crearFakeAdapters();

  const programas = pool ? new PgProgramaRepository(pool) : fakes!.programas;
  const versiones = pool ? new PgProgramaVersionRepository(pool) : fakes!.versiones;
  const actividades = pool ? new PgActividadRepository(pool) : fakes!.actividades;
  const generaciones = pool ? new PgGeneracionRepository(pool) : fakes!.generaciones;
  const dedup = pool ? new PgGeneracionDedupStore(pool) : fakes!.dedup;
  const historial = pool ? new PgHistorialRepository(pool) : fakes!.historial;

  const readModel: ReadModelsStore = pool ? new PgReadModelsStore(pool) : new FakeReadModelsStore();
  const eventLog: EventLogStore = pool ? new PgEventLogStore(pool) : fakes!.eventLog;
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
    programas,
    versiones,
    actividades,
    generaciones,
    dedup,
    historial,
    catalogos: pool ? new PgCatalogoStore(pool) : fakes!.catalogos,
    consecutivo: pool ? new PgConsecutivoStore(pool) : fakes!.consecutivo,
    recibos: pool ? new PgReciboStore(pool) : fakes!.recibos,
    eventLog,
    readModel,
    syncReceipts,
    consola,
    workflow,
    ...(materializador ? { materializador } : {}),
    ...(activos ? { activos } : {}),
    ...(planes ? { planes } : {}),
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [
      crearMotorWorkflow({ servicio: MODULO_WORKFLOW }),
      preventivoModule(adapters),
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
