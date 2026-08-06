/**
 * DGP-013 · Módulo Enterprise Procurement & Supply Chain — CONTRATOS de Workflow.
 *
 * TODA solicitud de compra, orden de compra y (opcionalmente) recepción se
 * gobiernan por el Workflow Engine (DGP-007) mediante contratos NEUTROS: el
 * aggregate REFLEJA el estado resultante, NUNCA decide la transición. La
 * orquestación real llega por adaptador en la etapa 2.
 *
 * REGLA DE GOBIERNO (sin bypass, lección 011.1): el ensamblaje operativo NO
 * incluye ningún modo directo/auto-aprobación. Si el módulo se monta sin un
 * `WorkflowPort` aprobado, los comandos gobernados (enviar/aprobar/rechazar/
 * cerrar/cancelar/recibir) FALLAN de forma segura con error de configuración
 * (KRN-CFL-001) y NUNCA alteran el aggregate. Cualquier implementación de
 * auto-aprobación es EXCLUSIVA de PRUEBA.
 *
 * DEFINICIONES NEUTRALES (camelCase) traducibles a dominio y extensibles por
 * tenant (config → definición activa). Los estados/acciones aquí declarados son
 * el contrato canónico neutro; el motor decide la admisibilidad de cada paso.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";

/** Procesos del módulo gobernados por workflow. */
export const PROCESOS_WORKFLOW = ["solicitud", "ordenCompra", "recepcion"] as const;
export type ProcesoWorkflow = (typeof PROCESOS_WORKFLOW)[number];

/**
 * Definiciones NEUTRALES de estados por proceso (camelCase). Son el contrato
 * canónico; un tenant puede extenderlas vía configuración (definición activa).
 * El dominio traduce estos estados neutros a su ciclo de vida.
 */
export const ESTADOS_NEUTROS: Record<ProcesoWorkflow, readonly string[]> = {
  solicitud: ["borrador", "enviada", "aprobada", "rechazada", "cerrada"],
  ordenCompra: ["borrador", "aprobada", "enviada", "parcialmenteRecibida", "recibida", "cancelada"],
  recepcion: ["borrador", "registrada"],
};

/**
 * Acciones NEUTRALES (transiciones) por proceso (camelCase). Cada acción es una
 * transición REAL con su propio comando; NUNCA se colapsan varias acciones en
 * una sola operación.
 */
export const ACCIONES_NEUTRAS: Record<ProcesoWorkflow, readonly string[]> = {
  solicitud: ["enviar", "aprobar", "rechazar", "cerrar"],
  ordenCompra: ["aprobar", "enviar", "recibirParcial", "recibirTotal", "cancelar"],
  recepcion: ["registrar"],
};

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
 * PUERTO neutro del workflow. El adaptador real lo implementa sobre el Workflow
 * Engine en la etapa 2. Aquí sólo se define el CONTRATO. El módulo NO provee
 * implementación operativa: si no se inyecta un `WorkflowPort` aprobado, los
 * comandos gobernados fallan de forma segura.
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
