/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Runtime de PRUEBAS.
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
import { correctivoModule, type ModuleAdapters } from "./module";
import { crearFakeAdapters, type FakeAdapters } from "./infrastructure/fakes";
import type { EstadoWorkflow, ProcesoWorkflow, ReferenciaWorkflow, WorkflowPort } from "./domain/workflow";
import type {
  AbastecimientoPort,
  ActivosPort,
  DynamicFormsPort,
  InventarioPort,
  LineaRepuesto,
  MaterializadorOrdenes,
  ResultadoConsumo,
  ResultadoDisponibilidad,
  ValidacionActivo,
} from "./domain/ports";

/** Estado destino por (proceso, acción) del ciclo neutro gobernado (test-only). */
const ESTADO_POR_ACCION: Record<ProcesoWorkflow, Record<string, EstadoWorkflow>> = {
  solicitud: {
    enviarTriage: { estado: "triage", terminal: false },
    iniciarDiagnostico: { estado: "diagnostico", terminal: false },
    enviarValidacion: { estado: "validacion", terminal: false },
    aprobar: { estado: "aprobada", terminal: true },
    rechazar: { estado: "rechazada", terminal: true },
  },
  intervencion: {
    asignar: { estado: "asignacion", terminal: false },
    iniciarEjecucion: { estado: "ejecucion", terminal: false },
    enviarVerificacion: { estado: "verificacion", terminal: false },
    cerrar: { estado: "cerrada", terminal: true },
  },
  generacion: {
    materializar: { estado: "materializada", terminal: true },
  },
};

const ESTADO_INICIAL: Record<ProcesoWorkflow, string> = {
  solicitud: "registro",
  intervencion: "preparacion",
  generacion: "pendiente",
};

/**
 * `WorkflowPort` de PRUEBA que representa un Workflow Engine APROBADO: inicia en
 * el estado inicial neutro y transiciona con éxito según el ciclo de vida. SOLO test.
 */
export class WorkflowPruebaAprobado implements WorkflowPort {
  async asegurarDefinicion(
    _uow: UnitOfWork,
    _tenant: string,
    proceso: ProcesoWorkflow,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    return ok({ definicion: `correctivo.${proceso}.aprobado`, version: 1 });
  }
  async iniciar(
    _uow: UnitOfWork,
    _tenant: string,
    ref: ReferenciaWorkflow,
  ): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>> {
    return ok({ instanciaId: `wf-${ref.proceso}-1`, estado: { estado: ESTADO_INICIAL[ref.proceso], terminal: false } });
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
    return ok({ definicion: `correctivo.${proceso}.gobernado`, version: 1 });
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

/** ActivosPort de PRUEBA: todos los activos/componentes declarados existen. */
export class ActivosPruebaTodos implements ActivosPort {
  async existen(): Promise<Result<ValidacionActivo, KernelError>> {
    return ok({ inexistentes: [] });
  }
  async componentesExisten(): Promise<Result<ValidacionActivo, KernelError>> {
    return ok({ inexistentes: [] });
  }
}

/** ActivosPort de PRUEBA: los ids indicados NO existen (para negativos). */
export class ActivosPruebaFaltantes implements ActivosPort {
  constructor(private readonly faltantes: readonly string[]) {}
  async existen(_t: string, ids: readonly string[]): Promise<Result<ValidacionActivo, KernelError>> {
    return ok({ inexistentes: ids.filter((i) => this.faltantes.includes(i)) });
  }
  async componentesExisten(_t: string, _a: string, ids: readonly string[]): Promise<Result<ValidacionActivo, KernelError>> {
    return ok({ inexistentes: ids.filter((i) => this.faltantes.includes(i)) });
  }
}

/** DynamicFormsPort de PRUEBA: plantilla publicada y respuestas válidas. */
export class DynamicFormsPruebaOk implements DynamicFormsPort {
  async verificarPlantilla(): Promise<Result<{ publicada: boolean }, KernelError>> {
    return ok({ publicada: true });
  }
  async validarRespuestas(): Promise<Result<{ validas: boolean; errores: readonly string[] }, KernelError>> {
    return ok({ validas: true, errores: [] });
  }
}

/** DynamicFormsPort de PRUEBA: plantilla NO publicada (negativo). */
export class DynamicFormsPruebaNoPublicada implements DynamicFormsPort {
  async verificarPlantilla(): Promise<Result<{ publicada: boolean }, KernelError>> {
    return ok({ publicada: false });
  }
  async validarRespuestas(): Promise<Result<{ validas: boolean; errores: readonly string[] }, KernelError>> {
    return ok({ validas: true, errores: [] });
  }
}

/** Materializador de PRUEBA: crea una OT determinista por opId (idempotente). */
export class MaterializadorPrueba implements MaterializadorOrdenes {
  private readonly ordenes = new Map<string, string>();
  async crearOrden(
    _t: string,
    _actor: string,
    entrada: { opId: string; tipo: string },
  ): Promise<Result<{ ordenTrabajoId: string; idempotente: boolean }, KernelError>> {
    if (entrada.tipo !== "correctiva") return fail(KernelErrors.validation(`Tipo de OT no canónico: "${entrada.tipo}"`));
    const existente = this.ordenes.get(entrada.opId);
    if (existente) return ok({ ordenTrabajoId: existente, idempotente: true });
    const otId = `ot-${this.ordenes.size + 1}`;
    this.ordenes.set(entrada.opId, otId);
    return ok({ ordenTrabajoId: otId, idempotente: false });
  }
}

/**
 * InventarioPort de PRUEBA: disponibilidad configurable por artículo. Si el stock
 * < cantidad solicitada, la línea va a faltantes (activa solicitud de compra).
 * Consumo soporta consumo PARCIAL (min(stock, solicitado)).
 */
export class InventarioPrueba implements InventarioPort {
  /** Stock por inventarioId. */
  private readonly stock: Map<string, number>;
  readonly reservas: LineaRepuesto[] = [];
  readonly consumos: LineaRepuesto[] = [];
  readonly devoluciones: LineaRepuesto[] = [];
  private readonly recibos = new Map<string, unknown>();
  constructor(stock: Record<string, number> = {}) {
    this.stock = new Map(Object.entries(stock));
  }
  async verificarDisponibilidad(_t: string, lineas: readonly LineaRepuesto[]): Promise<Result<ResultadoDisponibilidad, KernelError>> {
    const disponibles: LineaRepuesto[] = [];
    const faltantes: (LineaRepuesto & { disponible: number })[] = [];
    for (const l of lineas) {
      const s = this.stock.get(l.inventarioId) ?? 0;
      if (s >= l.cantidad) disponibles.push(l);
      else faltantes.push({ ...l, disponible: s });
    }
    return ok({ disponibles, faltantes });
  }
  async reservar(_t: string, _a: string, entrada: { opId: string; demandaId: string; lineas: readonly LineaRepuesto[] }): Promise<Result<{ idempotente: boolean }, KernelError>> {
    if (this.recibos.has(entrada.opId)) return ok({ idempotente: true });
    this.recibos.set(entrada.opId, true);
    for (const l of entrada.lineas) this.reservas.push(l);
    return ok({ idempotente: false });
  }
  async consumir(_t: string, _a: string, entrada: { opId: string; demandaId: string; linea: LineaRepuesto }): Promise<Result<ResultadoConsumo, KernelError>> {
    if (this.recibos.has(entrada.opId)) return ok({ consumidoTotal: true, cantidadConsumida: entrada.linea.cantidad });
    this.recibos.set(entrada.opId, true);
    const s = this.stock.get(entrada.linea.inventarioId) ?? 0;
    const consumida = Math.min(s, entrada.linea.cantidad);
    this.stock.set(entrada.linea.inventarioId, s - consumida);
    this.consumos.push({ ...entrada.linea, cantidad: consumida });
    return ok({ consumidoTotal: consumida >= entrada.linea.cantidad, cantidadConsumida: consumida });
  }
  async devolver(_t: string, _a: string, entrada: { opId: string; demandaId: string; linea: LineaRepuesto }): Promise<Result<{ idempotente: boolean }, KernelError>> {
    if (this.recibos.has(entrada.opId)) return ok({ idempotente: true });
    this.recibos.set(entrada.opId, true);
    const s = this.stock.get(entrada.linea.inventarioId) ?? 0;
    this.stock.set(entrada.linea.inventarioId, s + entrada.linea.cantidad);
    this.devoluciones.push(entrada.linea);
    return ok({ idempotente: false });
  }
}

/** AbastecimientoPort de PRUEBA: crea una solicitud de compra por opId (idempotente). */
export class AbastecimientoPrueba implements AbastecimientoPort {
  private readonly solicitudes = new Map<string, string>();
  async solicitarCompra(
    _t: string,
    _a: string,
    entrada: { opId: string; titulo: string; prioridad: string; referenciaId: string; lineas: readonly unknown[] },
  ): Promise<Result<{ solicitudCompraId: string; idempotente: boolean }, KernelError>> {
    const existente = this.solicitudes.get(entrada.opId);
    if (existente) return ok({ solicitudCompraId: existente, idempotente: true });
    const id = `sc-${this.solicitudes.size + 1}`;
    this.solicitudes.set(entrada.opId, id);
    return ok({ solicitudCompraId: id, idempotente: false });
  }
}

export interface CorrectivoRuntime {
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
  dynamicForms?: DynamicFormsPort | null;
  materializador?: MaterializadorOrdenes | null;
  inventario?: InventarioPort | null;
  abastecimiento?: AbastecimientoPort | null;
}

export function crearCorrectivoRuntime(opts: CrearRuntimeOpts = {}): CorrectivoRuntime {
  const fakes = crearFakeAdapters();
  const workflow = opts.workflow === undefined ? new WorkflowPruebaAprobado() : opts.workflow;
  const activos = opts.activos === undefined ? new ActivosPruebaTodos() : opts.activos;
  const dynamicForms = opts.dynamicForms === undefined ? new DynamicFormsPruebaOk() : opts.dynamicForms;
  const materializador = opts.materializador === undefined ? undefined : opts.materializador;
  const inventario = opts.inventario === undefined ? undefined : opts.inventario;
  const abastecimiento = opts.abastecimiento === undefined ? undefined : opts.abastecimiento;

  const adapters: ModuleAdapters = {
    ...fakes,
    ...(workflow === null ? {} : { workflow }),
    ...(activos === null ? {} : { activos }),
    ...(dynamicForms === null ? {} : { dynamicForms }),
    ...(materializador ? { materializador } : {}),
    ...(inventario ? { inventario } : {}),
    ...(abastecimiento ? { abastecimiento } : {}),
  };
  const platform = createPlatformRuntime({ extraServices: [correctivoModule(adapters)] });
  return {
    platform,
    adapters: fakes,
    ctx(tenantId, principal = SISTEMA) {
      return createExecutionContext({ principal, metadata: { tenantId } });
    },
  };
}
