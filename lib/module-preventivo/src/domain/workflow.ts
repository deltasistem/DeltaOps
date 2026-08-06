/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — CONTRATOS de Workflow.
 *
 * TODO programa preventivo (y su ciclo de generación) se gobierna por el Workflow
 * Engine (DGP-007) mediante contratos NEUTROS: el aggregate REFLEJA el estado
 * resultante, NUNCA decide la transición. La orquestación real llega por
 * adaptador en la etapa 2.
 *
 * REGLA DE GOBIERNO (sin bypass, lección 011.1): el ensamblaje operativo NO
 * incluye ningún modo directo/auto-aprobación. Si el módulo se monta sin un
 * `WorkflowPort` aprobado, los comandos gobernados (publicar/suspender/reanudar/
 * archivar) FALLAN de forma segura con error de configuración (KRN-CFL-001) y
 * NUNCA alteran el aggregate. Cualquier auto-aprobación es EXCLUSIVA de PRUEBA.
 *
 * DEFINICIONES NEUTRALES (camelCase / kebab neutro) sin PALABRAS_RESERVADAS_NEGOCIO
 * (DGP-006/007: sin `activo`, `inventario`, `orden`, `compra`, `combustible`,
 * `sst`). El motor multiplexa por clave bajo un único proceso raíz
 * (`modulo.preventivo.workflow`, corrección DGP-013), de modo que varias
 * definiciones conviven sin colisión.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";

/** Procesos del módulo gobernados por workflow (claves NEUTRAS). */
export const PROCESOS_WORKFLOW = ["programa", "generacion"] as const;
export type ProcesoWorkflow = (typeof PROCESOS_WORKFLOW)[number];

/**
 * Definiciones NEUTRALES de estados por proceso (camelCase). Son el contrato
 * canónico; un tenant puede extenderlas vía configuración (definición activa).
 * El dominio traduce estos estados neutros a su ciclo de vida.
 */
export const ESTADOS_NEUTROS: Record<ProcesoWorkflow, readonly string[]> = {
  programa: ["preparacion", "revision", "publicado", "suspendido", "archivado"],
  generacion: ["pendiente", "materializada"],
};

/**
 * Acciones NEUTRALES (transiciones) por proceso (camelCase). Cada acción es una
 * transición REAL con su propio comando; NUNCA se colapsan varias acciones en
 * una sola operación.
 */
export const ACCIONES_NEUTRAS: Record<ProcesoWorkflow, readonly string[]> = {
  programa: ["enviarRevision", "publicar", "suspender", "reanudar", "archivar"],
  generacion: ["materializar"],
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
