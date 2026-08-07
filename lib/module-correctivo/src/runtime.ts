/**
 * DGP-015.2 · Composición OPERATIVA del Módulo Enterprise Corrective Maintenance.
 *
 * Monta Kernel (DGP-002) + Plataforma (DGP-003) + el Motor de Workflow (DGP-007,
 * bajo `MODULO_WORKFLOW`) + este módulo, seleccionando adaptadores PostgreSQL o
 * Fake (offline) según haya `pool`. El gobierno del ciclo solicitud/intervención/
 * generación se cablea con el `WorkflowMotorAdapter` REAL (nunca auto-aprobación):
 * si el motor rechaza, el comando gobernado NO produce efecto. Mismo patrón que
 * `crearPreventivoRuntimeOperacional` (DGP-014.2).
 *
 * La colaboración cross-módulo (Órdenes/Activos/Dynamic Forms/Inventario/
 * Abastecimiento) se inyecta por PUERTOS fail-safe desde la capa de integración
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
import { correctivoModule, type ModuleAdapters } from "./module";
import {
  PgCatalogoStore,
  PgConsecutivoStore,
  PgDiagnosticoRepository,
  PgEventoActivoRepository,
  PgGeneracionDedupStore,
  PgGeneracionRepository,
  PgHistorialRepository,
  PgIntervencionRepository,
  PgReciboStore,
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
import { crearFakeAdapters } from "./infrastructure/fakes";
import type {
  AbastecimientoPort,
  ActivosPort,
  DynamicFormsPort,
  EventLogStore,
  InventarioPort,
  MaterializadorOrdenes,
} from "./domain/ports";
import { WorkflowMotorAdapter } from "./infrastructure/workflow-adapter";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";

export interface CorrectivoRuntimeOptions extends Omit<PlatformRuntimeOptions, "extraServices"> {
  /** Pool PG: si está presente usa adaptadores PostgreSQL; si no, Fakes. */
  readonly pool?: Pool;
  /**
   * Materializador de Órdenes de Trabajo (colaborador cross-módulo). Lo inyecta
   * la capa de integración (API Server) porque compone el comando OFICIAL de
   * `module-ordenes` (`crear`) en su propio runtime; el módulo permanece
   * desacoplado.
   */
  readonly materializador?: MaterializadorOrdenes;
  /** Verificación de activos/componentes (composición fail-safe). */
  readonly activos?: ActivosPort;
  /** Verificación/validación de plantillas de Dynamic Forms (fail-safe). */
  readonly dynamicForms?: DynamicFormsPort;
  /** Composición con Inventario (reservas/consumo/devolución) (fail-safe). */
  readonly inventario?: InventarioPort;
  /** Composición con Abastecimiento (solicitud de compra) (fail-safe). */
  readonly abastecimiento?: AbastecimientoPort;
}

export interface CorrectivoRuntimeOperacional {
  readonly platform: PlatformRuntime;
  readonly adapters: ModuleAdapters;
  readonly sincronizar: (ctx: ExecutionContext, operaciones: readonly OperacionSync[]) => Promise<ResumenSync>;
}

export function crearCorrectivoRuntimeOperacional(
  options: CorrectivoRuntimeOptions = {},
): CorrectivoRuntimeOperacional {
  const { pool, materializador, activos, dynamicForms, inventario, abastecimiento } = options;

  const fakes = pool ? null : crearFakeAdapters();

  const solicitudes = pool ? new PgSolicitudRepository(pool) : fakes!.solicitudes;
  const diagnosticos = pool ? new PgDiagnosticoRepository(pool) : fakes!.diagnosticos;
  const intervenciones = pool ? new PgIntervencionRepository(pool) : fakes!.intervenciones;
  const generaciones = pool ? new PgGeneracionRepository(pool) : fakes!.generaciones;
  const dedup = pool ? new PgGeneracionDedupStore(pool) : fakes!.dedup;
  const historial = pool ? new PgHistorialRepository(pool) : fakes!.historial;
  const eventosActivo = pool ? new PgEventoActivoRepository(pool) : fakes!.eventosActivo;

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
    solicitudes,
    diagnosticos,
    intervenciones,
    generaciones,
    dedup,
    historial,
    eventosActivo,
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
    ...(dynamicForms ? { dynamicForms } : {}),
    ...(inventario ? { inventario } : {}),
    ...(abastecimiento ? { abastecimiento } : {}),
  };

  const platform = createPlatformRuntime({
    ...options,
    extraServices: [
      crearMotorWorkflow({ servicio: MODULO_WORKFLOW }),
      correctivoModule(adapters),
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
