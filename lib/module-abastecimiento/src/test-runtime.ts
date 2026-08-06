/**
 * DGP-013 · Módulo Enterprise Procurement — Runtime de PRUEBAS (in-memory).
 *
 * NO es infraestructura de producción: monta un runtime de plataforma con FAKES
 * en memoria de los puertos del módulo como `extraService`, para ejercer los
 * comandos/consultas/policies end-to-end de forma 100% determinista. Los
 * adaptadores reales (PostgreSQL / read models CQRS / motor de workflow) llegan
 * en la ETAPA 2.
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
import { abastecimientoModule, type ModuleAdapters } from "./module";
import { crearFakeAdapters, type FakeAdapters } from "./infrastructure/fakes";
import type { EstadoWorkflow, ProcesoWorkflow, ReferenciaWorkflow, WorkflowPort } from "./domain/workflow";

/**
 * Estado destino por (proceso, acción) del ciclo de vida gobernado (test-only).
 * Refleja el ciclo neutro: solicitud (enviar/aprobar/rechazar/cerrar) y orden de
 * compra (aprobar/enviar/recibirParcial/recibirTotal/cancelar).
 */
const ESTADO_POR_ACCION: Record<ProcesoWorkflow, Record<string, EstadoWorkflow>> = {
  solicitud: {
    enviar: { estado: "enviada", terminal: false },
    aprobar: { estado: "aprobada", terminal: false },
    rechazar: { estado: "rechazada", terminal: true },
    cerrar: { estado: "cerrada", terminal: true },
  },
  ordenCompra: {
    aprobar: { estado: "aprobada", terminal: false },
    enviar: { estado: "enviada", terminal: false },
    recibirParcial: { estado: "parcialmenteRecibida", terminal: false },
    recibirTotal: { estado: "recibida", terminal: true },
    cancelar: { estado: "cancelada", terminal: true },
  },
  recepcion: {
    registrar: { estado: "registrada", terminal: true },
  },
};

/**
 * `WorkflowPort` de PRUEBA que representa un Workflow Engine APROBADO: inicia en
 * `borrador` y transiciona con éxito según el ciclo de vida neutro. SOLO test.
 */
export class WorkflowPruebaAprobado implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `abastecimiento.${proceso}.aprobado`, version: 1 });
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
    ref: ReferenciaWorkflow,
    accion: string,
  ): Promise<Result<EstadoWorkflow, KernelError>> {
    const destino = ESTADO_POR_ACCION[ref.proceso]?.[accion];
    if (!destino) return fail(KernelErrors.conflict(`Transición no soportada: "${ref.proceso}/${accion}"`));
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
    return ok({ definicion: `abastecimiento.${proceso}.gobernado`, version: 1 });
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
 * cualquier transición posterior. Verifica que una transición denegada por el
 * motor NO produce efecto. SOLO test.
 */
export class WorkflowPruebaRechazoTransicion extends WorkflowPruebaAprobado {
  override async transicionar(): Promise<Result<EstadoWorkflow, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.transicionar"));
  }
}

export interface AbastecimientoRuntime {
  readonly platform: PlatformRuntime;
  readonly adapters: FakeAdapters;
  ctx(tenantId: string, principal?: Principal): ExecutionContext;
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

export function crearAbastecimientoRuntime(opts: CrearRuntimeOpts = {}): AbastecimientoRuntime {
  const fakes = crearFakeAdapters();
  const workflow = opts.workflow === undefined ? new WorkflowPruebaAprobado() : opts.workflow;
  const adapters: ModuleAdapters = workflow === null ? { ...fakes } : { ...fakes, workflow };
  const platform = createPlatformRuntime({ extraServices: [abastecimientoModule(adapters)] });
  return {
    platform,
    adapters: fakes,
    ctx(tenantId, principal = SISTEMA) {
      return createExecutionContext({ principal, metadata: { tenantId } });
    },
  };
}
