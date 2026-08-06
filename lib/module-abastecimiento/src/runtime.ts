/**
 * DGP-013.2 · Composición OPERATIVA del Módulo Enterprise Procurement.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el Motor de Workflow (DGP-007,
 * bajo `MODULO_WORKFLOW`) + este módulo, seleccionando adaptadores PostgreSQL o
 * Fake (offline) según haya `pool`. El gobierno de solicitud/OC se cablea con el
 * `WorkflowMotorAdapter` REAL (nunca auto-aprobación): si el motor rechaza, el
 * comando gobernado NO produce efecto. Mismo patrón que `crearPlanesRuntimeOperacional`
 * (DGP-012.2) e `crearInventarioRuntimeOperacional` (DGP-011.2).
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
import { abastecimientoModule, type ModuleAdapters } from "./module";
import {
  PgArticuloRepository,
  PgCatalogoStore,
  PgConsecutivoStore,
  PgCotizacionRepository,
  PgHistorialRepository,
  PgMaterializacionStore,
  PgOrdenCompraRepository,
  PgProveedorRepository,
  PgReciboStore,
  PgRecepcionRepository,
  PgSolicitudRepository,
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
  crearFakeAdapters,
  FakeMaterializacionStore,
} from "./infrastructure/fakes";
import type { EventLogStore } from "./domain/ports";
import type { MaterializacionStore, MaterializadorInventario } from "./domain/ports";
import { WorkflowMotorAdapter } from "./infrastructure/workflow-adapter";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface AbastecimientoRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /**
   * Materializador de Inventario (colaborador cross-módulo). Lo inyecta la capa
   * de integración (API Server) porque compone el comando OFICIAL de
   * `module-inventario` (`mover`) en su propio runtime; el módulo permanece
   * desacoplado.
   */
  readonly materializador?: MaterializadorInventario;
}

export interface AbastecimientoRuntimeOperacional {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearAbastecimientoRuntimeOperacional(
  options: AbastecimientoRuntimeOptions = {},
): AbastecimientoRuntimeOperacional {
  const { pool, materializador } = options;

  const fakes = pool ? null : crearFakeAdapters();

  const articulos = pool ? new PgArticuloRepository(pool) : fakes!.articulos;
  const proveedores = pool ? new PgProveedorRepository(pool) : fakes!.proveedores;
  const solicitudes = pool ? new PgSolicitudRepository(pool) : fakes!.solicitudes;
  const cotizaciones = pool ? new PgCotizacionRepository(pool) : fakes!.cotizaciones;
  const ordenes = pool ? new PgOrdenCompraRepository(pool) : fakes!.ordenes;
  const recepciones = pool ? new PgRecepcionRepository(pool) : fakes!.recepciones;
  const historial = pool ? new PgHistorialRepository(pool) : fakes!.historial;

  const readModel: ReadModelsStore = pool ? new PgReadModelsStore(pool) : new FakeReadModelsStore();
  const eventLog: EventLogStore = pool ? new PgEventLogStore(pool) : fakes!.eventLog;
  const syncReceipts: SyncReceiptStore = pool ? new PgSyncReceiptStore(pool) : new FakeSyncReceiptStore();
  const materializaciones: MaterializacionStore = pool ? new PgMaterializacionStore(pool) : new FakeMaterializacionStore();

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
    articulos,
    proveedores,
    solicitudes,
    cotizaciones,
    ordenes,
    recepciones,
    historial,
    catalogos: pool ? new PgCatalogoStore(pool) : fakes!.catalogos,
    consecutivo: pool ? new PgConsecutivoStore(pool) : fakes!.consecutivo,
    recibos: pool ? new PgReciboStore(pool) : fakes!.recibos,
    eventLog,
    readModel,
    syncReceipts,
    consola,
    materializaciones,
    workflow,
    ...(materializador ? { materializador } : {}),
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [
      crearMotorWorkflow({ servicio: MODULO_WORKFLOW }),
      abastecimientoModule(adapters),
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
