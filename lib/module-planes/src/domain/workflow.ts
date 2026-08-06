/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — CONTRATOS de Workflow (NEUTROS).
 *
 * TODO plan se gobierna por el Workflow Engine (DGP-007) mediante contratos
 * neutrales: el aggregate REFLEJA el estado resultante, NUNCA decide la
 * transición. La orquestación real llega por adaptador (workflow-adapter.ts).
 *
 * REGLA DE GOBIERNO (sin bypass, lección 011.1): el ensamblaje operativo NO
 * incluye ningún modo directo/auto-aprobación. Si el módulo se monta sin un
 * `WorkflowPort` aprobado, los comandos gobernados (publicar, suspender,
 * reanudar, posponer, extender, cancelar, reprogramar, archivar) FALLAN de forma
 * segura con error de configuración (KRN-CFL-001) y NUNCA alteran el plan.
 * Cualquier implementación de auto-aprobación es EXCLUSIVA de PRUEBA.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";

/** Procesos del módulo gobernados por workflow. */
export const PROCESOS_WORKFLOW = ["plan"] as const;
export type ProcesoWorkflow = (typeof PROCESOS_WORKFLOW)[number];

/**
 * Referencia INMUTABLE al workflow que gobierna una instancia de proceso. Es un
 * contrato serializable: `definicion` (clave neutra), `instanciaId` (asignado
 * por el motor) y `version`. `instanciaId` puede ser `null` hasta que el motor
 * asigne identidad a la instancia.
 */
export interface ReferenciaWorkflow {
  readonly proceso: ProcesoWorkflow;
  readonly definicion: string;
  readonly instanciaId: string | null;
  readonly version: number;
}

/** Estado neutro resultante que el motor comunica de vuelta al aggregate. */
export interface EstadoWorkflow {
  readonly estado: string;
  readonly terminal: boolean;
}

/**
 * PUERTO neutro del workflow. El adaptador real (workflow-adapter.ts) lo
 * implementa sobre el Workflow Engine. Aquí sólo se define el CONTRATO. El
 * módulo NO provee implementación operativa: si no se inyecta un `WorkflowPort`
 * aprobado, los comandos gobernados fallan de forma segura.
 */
export interface WorkflowPort {
  /**
   * Asegura la definición del proceso para el tenant y devuelve su versión
   * vigente (idempotente). No decide transiciones.
   */
  asegurarDefinicion(
    uow: UnitOfWork,
    tenant: string,
    proceso: ProcesoWorkflow,
    actorId: string,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>>;

  /** Inicia una instancia y devuelve el estado inicial neutro. */
  iniciar(
    uow: UnitOfWork,
    tenant: string,
    ref: ReferenciaWorkflow,
    actorId: string,
  ): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>>;

  /** Solicita una transición; el motor decide y devuelve el estado resultante. */
  transicionar(
    uow: UnitOfWork,
    tenant: string,
    ref: ReferenciaWorkflow,
    accion: string,
    actorId: string,
  ): Promise<Result<EstadoWorkflow, KernelError>>;
}
