/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Runtime de PRUEBAS.
 *
 * NO es infraestructura de producción: monta un runtime de plataforma con FAKES
 * en memoria de los puertos del módulo como `extraService`, para ejercer los
 * comandos/consultas/policies end-to-end de forma 100% determinista.
 *
 * GOBIERNO DE WORKFLOW: el ensamblaje operativo del módulo NO auto-aprueba. Este
 * harness inyecta EXPLÍCITAMENTE un `WorkflowPort` de PRUEBA que representa el
 * Workflow Engine aprobado (`WorkflowPruebaAprobado`). También ofrece variantes
 * —`WorkflowPruebaRechazo`, `WorkflowPruebaRechazoTransicion` y la AUSENCIA de
 * adaptador— para verificar que sin aprobación gobernada NO hay efecto. Estas
 * implementaciones son EXCLUSIVAS de test; jamás el modo operativo por defecto.
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
import { preventivoModule, type ModuleAdapters } from "./module";
import { crearFakeAdapters, type FakeAdapters } from "./infrastructure/fakes";
import type { EstadoWorkflow, ProcesoWorkflow, ReferenciaWorkflow, WorkflowPort } from "./domain/workflow";
import type { ActivosPort, MaterializadorOrdenes, PlanesPort } from "./domain/ports";

/** Estado destino por (proceso, acción) del ciclo neutro gobernado (test-only). */
const ESTADO_POR_ACCION: Record<ProcesoWorkflow, Record<string, EstadoWorkflow>> = {
  programa: {
    enviarRevision: { estado: "revision", terminal: false },
    publicar: { estado: "publicado", terminal: false },
    suspender: { estado: "suspendido", terminal: false },
    reanudar: { estado: "publicado", terminal: false },
    archivar: { estado: "archivado", terminal: true },
  },
  generacion: {
    materializar: { estado: "materializada", terminal: true },
  },
};

/**
 * `WorkflowPort` de PRUEBA que representa un Workflow Engine APROBADO: inicia en
 * `preparacion` y transiciona con éxito según el ciclo de vida neutro. SOLO test.
 */
export class WorkflowPruebaAprobado implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `preventivo.${proceso}.aprobado`, version: 1 });
  }
  async iniciar(
    _uow: UnitOfWork,
    _tenant: string,
    ref: ReferenciaWorkflow,
  ): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>> {
    const estado = ref.proceso === "programa" ? "preparacion" : "pendiente";
    return ok({ instanciaId: `wf-${ref.proceso}-1`, estado: { estado, terminal: false } });
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

/** `WorkflowPort` de PRUEBA que RECHAZA toda operación (aprobación denegada). */
export class WorkflowPruebaRechazo implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `preventivo.${proceso}.gobernado`, version: 1 });
  }
  async iniciar(): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.iniciar"));
  }
  async transicionar(): Promise<Result<EstadoWorkflow, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.transicionar"));
  }
}

/** APRUEBA la apertura pero RECHAZA cualquier transición posterior. SOLO test. */
export class WorkflowPruebaRechazoTransicion extends WorkflowPruebaAprobado {
  override async transicionar(): Promise<Result<EstadoWorkflow, KernelError>> {
    return fail(KernelErrors.forbidden("workflow.transicionar"));
  }
}

/* ---------------------- Colaboradores de PRUEBA -------------------------- */

/** ActivosPort de PRUEBA: todos los activos declarados existen. */
export class ActivosPruebaTodos implements ActivosPort {
  async existen(): Promise<Result<{ inexistentes: readonly string[] }, KernelError>> {
    return ok({ inexistentes: [] });
  }
}

/** ActivosPort de PRUEBA: los ids indicados NO existen (para negativos). */
export class ActivosPruebaFaltantes implements ActivosPort {
  constructor(private readonly faltantes: readonly string[]) {}
  async existen(_t: string, ids: readonly string[]): Promise<Result<{ inexistentes: readonly string[] }, KernelError>> {
    return ok({ inexistentes: ids.filter((i) => this.faltantes.includes(i)) });
  }
}

/** PlanesPort de PRUEBA: todos los planes referenciados están publicados. */
export class PlanesPruebaPublicados implements PlanesPort {
  async verificarPublicados(): Promise<Result<{ noPublicados: readonly { planId: string; version: number }[] }, KernelError>> {
    return ok({ noPublicados: [] });
  }
}

/** PlanesPort de PRUEBA: los planes indicados NO están publicados. */
export class PlanesPruebaNoPublicados implements PlanesPort {
  constructor(private readonly noPub: readonly { planId: string; version: number }[]) {}
  async verificarPublicados(
    _t: string,
    refs: readonly { planId: string; version: number }[],
  ): Promise<Result<{ noPublicados: readonly { planId: string; version: number }[] }, KernelError>> {
    const bloqueados = refs.filter((r) => this.noPub.some((n) => n.planId === r.planId && n.version === r.version));
    return ok({ noPublicados: bloqueados });
  }
}

/** Materializador de PRUEBA: crea una OT determinista por opId (idempotente). */
export class MaterializadorPrueba implements MaterializadorOrdenes {
  private readonly ordenes = new Map<string, string>();
  async crearOrden(
    _t: string,
    _actor: string,
    entrada: { opId: string },
  ): Promise<Result<{ ordenTrabajoId: string; idempotente: boolean }, KernelError>> {
    const existente = this.ordenes.get(entrada.opId);
    if (existente) return ok({ ordenTrabajoId: existente, idempotente: true });
    const otId = `ot-${this.ordenes.size + 1}`;
    this.ordenes.set(entrada.opId, otId);
    return ok({ ordenTrabajoId: otId, idempotente: false });
  }
}

export interface PreventivoRuntime {
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
  activos?: ActivosPort | null;
  planes?: PlanesPort | null;
  materializador?: MaterializadorOrdenes | null;
}

export function crearPreventivoRuntime(opts: CrearRuntimeOpts = {}): PreventivoRuntime {
  const fakes = crearFakeAdapters();
  const workflow = opts.workflow === undefined ? new WorkflowPruebaAprobado() : opts.workflow;
  const activos = opts.activos === undefined ? new ActivosPruebaTodos() : opts.activos;
  const planes = opts.planes === undefined ? new PlanesPruebaPublicados() : opts.planes;
  const materializador = opts.materializador === undefined ? undefined : opts.materializador;

  const adapters: ModuleAdapters = {
    ...fakes,
    ...(workflow === null ? {} : { workflow }),
    ...(activos === null ? {} : { activos }),
    ...(planes === null ? {} : { planes }),
    ...(materializador ? { materializador } : {}),
  };
  const platform = createPlatformRuntime({ extraServices: [preventivoModule(adapters)] });
  return {
    platform,
    adapters: fakes,
    ctx(tenantId, principal = SISTEMA) {
      return createExecutionContext({ principal, metadata: { tenantId } });
    },
  };
}
