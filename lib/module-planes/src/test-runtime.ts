/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Runtime de PRUEBAS (in-memory).
 *
 * NO es infraestructura de producción: monta un runtime de plataforma con FAKES
 * en memoria de los puertos del módulo como `extraService`, para ejercer los
 * comandos/consultas/policies end-to-end de forma 100% determinista. Los
 * adaptadores reales (PostgreSQL / read models CQRS / motor de workflow) llegan
 * en la etapa 2.
 *
 * GOBIERNO DE WORKFLOW: el ensamblaje operativo del módulo NO auto-aprueba. Este
 * harness inyecta EXPLÍCITAMENTE un `WorkflowPort` de PRUEBA que representa el
 * Workflow Engine aprobado (`WorkflowPruebaAprobado`). También ofrece variantes
 * —`WorkflowPruebaRechazo`, `WorkflowPruebaRechazoTransicion` y la AUSENCIA de
 * adaptador— para verificar que sin aprobación gobernada NO hay efecto. Estas
 * implementaciones son EXCLUSIVAS de test; jamás son el modo operativo por
 * defecto del módulo.
 */
import {
  createExecutionContext,
  fail,
  KernelErrors,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { createPlatformRuntime, type PlatformRuntime } from "@workspace/platform";
import { planesModule, type ModuleAdapters } from "./module";
import { crearFakeAdapters, type FakeAdapters } from "./infrastructure/fakes";
import { FakeReadModelsStore, FakeSyncReceiptStore, type ReadModelsStore, type SyncReceiptStore } from "./infrastructure/operacional";
import type { MaterializadorOrdenes, OrdenAMaterializar, ResultadoMaterializacion } from "./domain/ports";
import { procesarCola, type OperacionSync, type ResumenSync } from "./sincronizacion";
import type {
  EstadoWorkflow,
  ProcesoWorkflow,
  ReferenciaWorkflow,
  WorkflowPort,
} from "./domain/workflow";

/** Estado destino por acción del ciclo de vida gobernado del plan (test-only). */
const ESTADO_POR_ACCION: Record<string, EstadoWorkflow> = {
  publicar: { estado: "vigente", terminal: false },
  suspender: { estado: "suspendido", terminal: false },
  posponer: { estado: "suspendido", terminal: false },
  reanudar: { estado: "vigente", terminal: false },
  extender: { estado: "vigente", terminal: false },
  reprogramar: { estado: "vigente", terminal: false },
  cancelar: { estado: "finalizado", terminal: false },
  archivar: { estado: "archivado", terminal: true },
};

/**
 * `WorkflowPort` de PRUEBA que representa un Workflow Engine APROBADO: inicia en
 * `borrador` y transiciona con éxito según el ciclo de vida del plan. SOLO test.
 */
export class WorkflowPruebaAprobado implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `planes.${proceso}.aprobado`, version: 1 });
  }
  async iniciar(
    _uow: UnitOfWork,
    _tenant: string,
    ref: ReferenciaWorkflow,
  ): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>> {
    return ok({ instanciaId: `wf-${ref.proceso}-1`, estado: { estado: "borrador", terminal: false } });
  }
  async transicionar(
    _uow: UnitOfWork,
    _tenant: string,
    _ref: ReferenciaWorkflow,
    accion: string,
  ): Promise<Result<EstadoWorkflow, KernelError>> {
    const destino = ESTADO_POR_ACCION[accion];
    if (!destino) return fail(KernelErrors.conflict(`Transición no soportada: "${accion}"`));
    return ok(destino);
  }
}

/**
 * `WorkflowPort` de PRUEBA que RECHAZA toda operación (aprobación denegada por el
 * motor). Verifica que, sin aprobación, NO hay efecto de negocio.
 */
export class WorkflowPruebaRechazo implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `planes.${proceso}.gobernado`, version: 1 });
  }
  async iniciar(): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.iniciar"));
  }
  async transicionar(): Promise<Result<EstadoWorkflow, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.transicionar"));
  }
}

/**
 * `WorkflowPort` de PRUEBA que APRUEBA la apertura de instancia pero RECHAZA
 * cualquier transición posterior (publicar/suspender/archivar). Verifica que una
 * transición denegada por el motor NO produce efecto. SOLO test.
 */
export class WorkflowPruebaRechazoTransicion extends WorkflowPruebaAprobado {
  override async transicionar(): Promise<Result<EstadoWorkflow, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.transicionar"));
  }
}

/**
 * Materializador de PRUEBA: crea una OT determinista por `opId` (=claveDedup),
 * idempotente (misma clave ⇒ mismo id, `idempotente:true` en reintentos), sin
 * dependencias de otro runtime. SOLO test — el runtime operacional compone el
 * comando OFICIAL `modulo.ordenes.crear`. Permite verificar la concurrencia
 * (dos evaluaciones ⇒ una sola OT) y el vínculo persistido.
 */
export class FakeMaterializadorOrdenes implements MaterializadorOrdenes {
  private readonly porClave = new Map<string, string>();
  public creadas = 0;
  async crearOrden(tenantId: string, _actorId: string, orden: OrdenAMaterializar): Promise<Result<ResultadoMaterializacion, KernelError>> {
    const k = `${tenantId}::${orden.opId}`;
    const existente = this.porClave.get(k);
    if (existente) return ok({ ordenTrabajoId: existente, idempotente: true });
    const id = `ot-${orden.claveDedup}`;
    this.porClave.set(k, id);
    this.creadas += 1;
    return ok({ ordenTrabajoId: id, idempotente: false });
  }
  async medidoresDeActivo(): Promise<Record<string, unknown> | null> {
    return { horometro: null, odometro: null };
  }
}

export interface PlanesRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: FakeAdapters;
  readonly readModel: ReadModelsStore;
  readonly syncReceipts: SyncReceiptStore;
  readonly materializador: FakeMaterializadorOrdenes;
  ctx(tenantId: string, principal?: Principal): ExecutionContext;
  sincronizar(ctx: ExecutionContext, operaciones: readonly OperacionSync[]): Promise<ResumenSync>;
}

/** Principal del sistema con permisos amplios (solo para pruebas). */
export const SISTEMA: Principal = { id: "sistema", rol: "sistema", permisos: ["*"], capacidades: ["*"] };

export interface CrearRuntimeOpts {
  /**
   * `WorkflowPort` a inyectar. Por defecto, un motor de PRUEBA aprobado. Pasa
   * `null` para montar el módulo SIN adaptador de workflow (verifica el fallo
   * seguro de los comandos gobernados) o `WorkflowPruebaRechazo`/
   * `WorkflowPruebaRechazoTransicion` para simular aprobaciones denegadas.
   */
  workflow?: WorkflowPort | null;
}

export function crearPlanesRuntime(opts: CrearRuntimeOpts = {}): PlanesRuntime {
  const fakes = crearFakeAdapters();
  const readModel = new FakeReadModelsStore();
  const syncReceipts = new FakeSyncReceiptStore();
  const materializador = new FakeMaterializadorOrdenes();
  const workflow = opts.workflow === undefined ? new WorkflowPruebaAprobado() : opts.workflow;
  const base: ModuleAdapters = { ...fakes, readModel, syncReceipts, materializador };
  const adapters: ModuleAdapters = workflow === null ? base : { ...base, workflow };
  const platform = createPlatformRuntime({ extraServices: [planesModule(adapters)] });
  return {
    platform,
    adapters: fakes,
    readModel,
    syncReceipts,
    materializador,
    ctx(tenantId, principal = SISTEMA) {
      return createExecutionContext({ principal, metadata: { tenantId } });
    },
    sincronizar(ctx, operaciones) {
      return procesarCola(platform, adapters, ctx, operaciones);
    },
  };
}
