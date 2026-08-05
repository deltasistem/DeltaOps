/**
 * DGP-011.1 · Módulo Enterprise Inventory — CONTRATOS de Workflow (NEUTROS).
 *
 * Transferencias, ajustes y conteos están PREPARADOS para gobernarse por el
 * Workflow Engine (DGP-007) SIN implementar aquí ninguna infraestructura de
 * workflow. Este archivo define ÚNICAMENTE contratos (puertos + referencias)
 * neutrales: el aggregate REFLEJA el estado resultante, nunca decide la
 * transición. La orquestación real llegará por adaptador en una fase posterior.
 *
 * REGLA DE GOBIERNO (sin bypass de aprobaciones): el ensamblaje operativo NO
 * incluye ningún modo directo/auto-aprobación. Si el módulo se monta sin un
 * `WorkflowPort` aprobado (el adaptador real del Workflow Engine, que llega en
 * DGP-011.2), los comandos gobernados —transferir, completar-transferencia,
 * ajustar y cerrar-conteo— FALLAN de forma segura con error de configuración y
 * NUNCA alteran stock, transferencias, ajustes ni conteos. Cualquier
 * implementación de auto-aprobación es EXCLUSIVA de infraestructura de PRUEBA.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";

/** Procesos del módulo que pueden requerir aprobación/flujo configurable. */
export const PROCESOS_WORKFLOW = ["transferencia", "ajuste", "conteo"] as const;
export type ProcesoWorkflow = (typeof PROCESOS_WORKFLOW)[number];

/**
 * Referencia INMUTABLE al workflow que gobierna una instancia de proceso. Es un
 * contrato serializable: `definicion` (clave neutra), `instanciaId` (asignado
 * por el motor cuando exista) y `version`. `instanciaId` puede ser `null` hasta
 * que el motor asigne una identidad a la instancia.
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
 * PUERTO neutro del workflow. Un adaptador futuro (DGP-011.2) lo implementará
 * sobre el Workflow Engine real. Aquí sólo se define el CONTRATO. El módulo NO
 * provee implementación operativa: si no se inyecta un `WorkflowPort` aprobado,
 * los comandos gobernados fallan de forma segura (ver REGLA DE GOBIERNO arriba).
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
