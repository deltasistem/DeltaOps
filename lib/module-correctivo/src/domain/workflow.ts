/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — CONTRATOS de Workflow.
 *
 * TODO el ciclo correctivo (solicitud → diagnóstico → validación → generación de
 * OT → asignación → ejecución → validación → cierre) se gobierna por el Workflow
 * Engine (DGP-007) mediante contratos NEUTROS: el aggregate REFLEJA el estado
 * resultante, NUNCA decide la transición. La orquestación real llega por
 * adaptador en la etapa 2.
 *
 * REGLA DE GOBIERNO (sin bypass, lección 011.1): el ensamblaje operativo NO
 * incluye ningún modo directo/auto-aprobación. Si el módulo se monta sin un
 * `WorkflowPort` aprobado, los comandos gobernados FALLAN de forma segura con
 * error de configuración (KRN-CFL-001) y NUNCA alteran el aggregate. Cualquier
 * auto-aprobación es EXCLUSIVA de PRUEBA.
 *
 * DEFINICIONES NEUTRALES (camelCase) sin PALABRAS_RESERVADAS_NEGOCIO (DGP-006/007:
 * sin `activo`, `inventario`, `orden`, `compra`, `falla`). El motor multiplexa por
 * clave bajo un único proceso raíz (`modulo.correctivo.workflow`), de modo que
 * varias definiciones (solicitud/intervencion/generacion) conviven sin colisión.
 */
import type { KernelError, Result, UnitOfWork } from "@workspace/kernel";

/** Procesos del módulo gobernados por workflow (claves NEUTRAS). */
export const PROCESOS_WORKFLOW = ["solicitud", "intervencion", "generacion"] as const;
export type ProcesoWorkflow = (typeof PROCESOS_WORKFLOW)[number];

/**
 * Definiciones NEUTRALES de estados por proceso (camelCase). El ciclo correctivo
 * se descompone en dos procesos gobernados neutros:
 *   · `solicitud`   registro → triage → diagnóstico → validación → aprobada/rechazada
 *   · `intervencion` preparación → asignación → ejecución → verificación → cerrada
 * más el proceso `generacion` (pendiente → materializada) para la OT.
 */
export const ESTADOS_NEUTROS: Record<ProcesoWorkflow, readonly string[]> = {
  solicitud: ["registro", "triage", "diagnostico", "validacion", "aprobada", "rechazada"],
  intervencion: ["preparacion", "asignacion", "ejecucion", "verificacion", "cerrada"],
  generacion: ["pendiente", "materializada"],
};

/**
 * Acciones NEUTRALES (transiciones) por proceso (camelCase). Cada acción es una
 * transición REAL con su propio comando gobernado; NUNCA se colapsan varias
 * acciones en una sola operación.
 */
export const ACCIONES_NEUTRAS: Record<ProcesoWorkflow, readonly string[]> = {
  solicitud: ["enviarTriage", "iniciarDiagnostico", "enviarValidacion", "aprobar", "rechazar"],
  intervencion: ["asignar", "iniciarEjecucion", "enviarVerificacion", "cerrar"],
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
