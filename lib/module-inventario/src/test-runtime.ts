/**
 * DGP-011.1 · Módulo Enterprise Inventory — Runtime de PRUEBAS (in-memory).
 *
 * NO es infraestructura de producción: monta un runtime de plataforma con FAKES
 * en memoria de los puertos del módulo como `extraService`. Sirve para ejercer
 * los comandos/consultas/policies end-to-end de forma 100% determinista. Los
 * adaptadores de persistencia reales llegan por fase posterior.
 *
 * GOBIERNO DE WORKFLOW: el ensamblaje operativo del módulo NO auto-aprueba. Este
 * harness inyecta EXPLÍCITAMENTE un `WorkflowPort` de PRUEBA que representa el
 * Workflow Engine aprobado (`WorkflowPruebaAprobado`). También ofrece variantes
 * de prueba —`WorkflowPruebaRechazo` y la ausencia de adaptador— para verificar
 * que sin aprobación gobernada NO hay efecto. Estas implementaciones son
 * EXCLUSIVAS de test; jamás son el modo operativo por defecto del módulo.
 */
import {
  ok,
  fail,
  KernelErrors,
  createExecutionContext,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import { createPlatformRuntime, type PlatformRuntime } from "@workspace/platform";
import { inventarioModule, type ModuleAdapters } from "./module";
import { crearFakeAdapters, type FakeAdapters } from "./infrastructure/fakes";
import type {
  EstadoWorkflow,
  ProcesoWorkflow,
  ReferenciaWorkflow,
  WorkflowPort,
} from "./domain/workflow";

/**
 * `WorkflowPort` de PRUEBA que representa un Workflow Engine APROBADO: inicia y
 * transiciona con éxito. SOLO para test — no es un modo operativo del módulo.
 */
export class WorkflowPruebaAprobado implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `inventario.${proceso}.aprobado`, version: 1 });
  }
  async iniciar(
    _uow: UnitOfWork,
    _tenant: string,
    ref: ReferenciaWorkflow,
  ): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>> {
    const estado: EstadoWorkflow =
      ref.proceso === "transferencia"
        ? { estado: "en-transito", terminal: false }
        : { estado: "borrador", terminal: false };
    return ok({ instanciaId: `wf-${ref.proceso}-1`, estado });
  }
  async transicionar(
    _uow: UnitOfWork,
    _tenant: string,
    _ref: ReferenciaWorkflow,
    accion: string,
  ): Promise<Result<EstadoWorkflow, KernelError>> {
    const terminal =
      accion === "completada" || accion === "aplicado" || accion === "cerrado" || accion === "rechazado" || accion === "cancelada";
    return ok({ estado: accion, terminal });
  }
}

/**
 * `WorkflowPort` de PRUEBA que RECHAZA toda transición (aprobación denegada por
 * el motor). Permite verificar que, sin aprobación, NO hay efecto de negocio.
 */
export class WorkflowPruebaRechazo implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `inventario.${proceso}.gobernado`, version: 1 });
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
 * cualquier transición posterior. Permite verificar que un cierre/completado
 * denegado por el motor NO produce efecto (p. ej. cerrar-conteo, completar-
 * transferencia). SOLO para test.
 */
export class WorkflowPruebaRechazoTransicion extends WorkflowPruebaAprobado {
  override async transicionar(): Promise<Result<EstadoWorkflow, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.transicionar"));
  }
}

export interface InventarioRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: FakeAdapters;
  ctx(tenantId: string, principal?: Principal): ExecutionContext;
}

/** Principal del sistema con permisos amplios (solo para pruebas). */
const SISTEMA: Principal = { id: "sistema", rol: "sistema", permisos: ["*"], capacidades: ["*"] };

export interface CrearRuntimeOpts {
  /**
   * `WorkflowPort` a inyectar. Por defecto, un motor de PRUEBA aprobado. Pasa
   * `null` para montar el módulo SIN adaptador de workflow (verifica el fallo
   * seguro de los comandos gobernados) o `WorkflowPruebaRechazo` para simular
   * una aprobación denegada.
   */
  workflow?: WorkflowPort | null;
}

export function crearInventarioRuntime(opts: CrearRuntimeOpts = {}): InventarioRuntime {
  const fakes = crearFakeAdapters();
  const workflow = opts.workflow === undefined ? new WorkflowPruebaAprobado() : opts.workflow;
  const adapters: ModuleAdapters =
    workflow === null ? { ...fakes } : { ...fakes, workflow };
  const platform = createPlatformRuntime({ extraServices: [inventarioModule(adapters)] });
  return {
    platform,
    adapters: fakes,
    ctx(tenantId, principal = SISTEMA) {
      return createExecutionContext({ principal, metadata: { tenantId } });
    },
  };
}
