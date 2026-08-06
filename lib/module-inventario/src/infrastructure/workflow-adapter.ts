/**
 * DGP-011.2 · Módulo Enterprise Inventory — Adaptador REAL de `WorkflowPort`
 * sobre el Workflow Engine (DGP-007).
 *
 * Implementa el CONTRATO neutro `WorkflowPort` del dominio (011.1) delegando en
 * los comandos/consultas de instancia y definición del motor real, montado como
 * `extraService` bajo el servicio `MODULO_WORKFLOW`. Es el ÚNICO modo operativo
 * de gobierno del módulo (no hay auto-aprobación): transferencias, ajustes y
 * conteos SOLO transicionan si el motor lo autoriza.
 *
 * Aislamiento de UoW: el motor gestiona su PROPIO estado (records de instancia)
 * en UoWs SEPARADAS (vía `childContext` + `runtime.commands`), NUNCA anidando la
 * UoW del comando del módulo — mismo patrón que `module-ordenes` (DGP-009.2).
 */
import {
  childContext,
  createExecutionContext,
  fail,
  KernelErrors,
  ok,
  SYSTEM_PRINCIPAL,
  type KernelError,
  type Result,
  type UnitOfWork,
} from "@workspace/kernel";
import type { PlatformRuntime } from "@workspace/platform";
import type { DefinicionWorkflow } from "@workspace/workflow-engine";
import { nombresDefinicion, nombresInstancia } from "@workspace/workflow-engine";
import type {
  EstadoWorkflow,
  ProcesoWorkflow,
  ReferenciaWorkflow,
  WorkflowPort,
} from "../domain/workflow";

/** Definiciones mínimas por proceso (ciclo de vida gobernado del inventario). */
const DEFINICIONES: Record<ProcesoWorkflow, DefinicionWorkflow> = {
  transferencia: {
    clave: "ciclo-traslado",
    etiqueta: "Transferencia de inventario",
    // NOTA: el motor exige nombres de estado camelCase. El dominio (011.1) usa
    // `en-transito` (kebab); la traducción motor↔dominio ocurre en `aDominio`.
    // El estado inicial es `enTransito` (despacho implícito al iniciar), lo que
    // coincide con el estado inicial que el dominio de transferencias espera.
    estados: [
      { nombre: "enTransito", inicial: true },
      { nombre: "completada", final: true },
    ],
    transiciones: [{ de: "enTransito", a: "completada", comando: "completada" }],
  },
  ajuste: {
    clave: "ciclo-regularizacion",
    etiqueta: "Ajuste de inventario",
    estados: [
      { nombre: "borrador", inicial: true },
      { nombre: "aplicado", final: true },
    ],
    transiciones: [{ de: "borrador", a: "aplicado", comando: "aplicado" }],
  },
  conteo: {
    clave: "ciclo-recuento",
    etiqueta: "Conteo físico",
    estados: [
      { nombre: "abierto", inicial: true },
      { nombre: "contado" },
      { nombre: "cerrado", final: true },
    ],
    transiciones: [
      { de: "abierto", a: "contado", comando: "contado" },
      { de: "contado", a: "cerrado", comando: "cerrado" },
    ],
  },
};

/**
 * Traducción de nombres de estado motor→dominio. El motor exige camelCase; el
 * dominio de transferencias (011.1) usa `en-transito` (kebab). Sólo difiere ese
 * estado; el resto es idéntico entre ambos vocabularios.
 */
const ESTADO_MOTOR_A_DOMINIO: Partial<Record<ProcesoWorkflow, Record<string, string>>> = {
  transferencia: { enTransito: "en-transito" },
};
function aDominio(proceso: ProcesoWorkflow, estadoMotor: string): string {
  return ESTADO_MOTOR_A_DOMINIO[proceso]?.[estadoMotor] ?? estadoMotor;
}

/** Estado inicial que refleja el motor tras iniciar (coincide con la definición). */
function estadoInicialDe(proceso: ProcesoWorkflow): EstadoWorkflow {
  const def = DEFINICIONES[proceso];
  const inicial = def.estados.find((e) => e.inicial)?.nombre ?? def.estados[0]!.nombre;
  const terminal = def.estados.find((e) => e.nombre === inicial)?.final === true;
  return { estado: aDominio(proceso, inicial), terminal };
}

export interface WorkflowMotorAdapterOpts {
  readonly servicio: string;
}

/**
 * Adaptador que satisface `WorkflowPort` mediante el Workflow Engine real. Se
 * conecta al `PlatformRuntime` (holder perezoso: el runtime se resuelve tras el
 * montaje). Ignora deliberadamente la `uow` del módulo: el motor persiste su
 * estado en UoWs propias (child-context), evitando anidamiento.
 */
export class WorkflowMotorAdapter implements WorkflowPort {
  private readonly nDef: ReturnType<typeof nombresDefinicion>;
  private readonly nInst: ReturnType<typeof nombresInstancia>;
  private readonly definidas = new Set<string>();

  constructor(
    private readonly runtime: () => PlatformRuntime,
    private readonly servicio: string,
  ) {
    this.nDef = nombresDefinicion(servicio);
    this.nInst = nombresInstancia(servicio);
  }

  private ctxSistema(tenant: string) {
    return createExecutionContext({ principal: SYSTEM_PRINCIPAL, metadata: { tenantId: tenant } });
  }

  async asegurarDefinicion(
    _uow: UnitOfWork,
    tenant: string,
    proceso: ProcesoWorkflow,
    _actorId: string,
  ): Promise<Result<{ definicion: string; version: number }, KernelError>> {
    const def = DEFINICIONES[proceso];
    const id = `wf-def:${def.clave}:${tenant}`;
    const rt = this.runtime();
    const ctx = this.ctxSistema(tenant);

    // ¿Ya está activa esta definición? (idempotente entre llamadas/tenants).
    const activa = await rt.kernel.queries.execute(childContext(ctx), this.nDef.activa, { clave: def.clave });
    if (activa.ok && activa.value && (activa.value as { id?: string }).id === id) {
      const v = Number((activa.value as { data?: Record<string, unknown> }).data?.["versionN"] ?? 1);
      this.definidas.add(id);
      return ok({ definicion: def.clave, version: Number.isFinite(v) && v > 0 ? v : 1 });
    }

    const pub = await rt.kernel.commands.execute(childContext(ctx), this.nDef.publicar, { id, definicion: def });
    if (!pub.ok) return pub;
    const versionN = Number((pub.value as { versionN?: number }).versionN ?? 1);

    const rec = await rt.kernel.queries.execute(childContext(ctx), this.nDef.obtener, { id });
    if (!rec.ok) return rec;
    const versionOptimista = Number((rec.value as { version?: number }).version ?? 1);
    const act = await rt.kernel.commands.execute(childContext(ctx), this.nDef.activar, { id, version: versionOptimista });
    if (!act.ok) return act;
    this.definidas.add(id);
    return ok({ definicion: def.clave, version: versionN });
  }

  async iniciar(
    _uow: UnitOfWork,
    tenant: string,
    ref: ReferenciaWorkflow,
    _actorId: string,
  ): Promise<Result<{ instanciaId: string | null; estado: EstadoWorkflow }, KernelError>> {
    const rt = this.runtime();
    const ctx = this.ctxSistema(tenant);
    const instanciaId = ref.instanciaId ?? `wf-${ref.proceso}:${tenant}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const r = await rt.kernel.commands.execute(childContext(ctx), this.nInst.iniciar, {
      id: instanciaId,
      data: { proceso: ref.proceso, definicion: ref.definicion },
    });
    if (!r.ok) return r;
    const def = DEFINICIONES[ref.proceso];
    const inicial = def.estados.find((e) => e.inicial)?.nombre ?? def.estados[0]!.nombre;
    const estado = String((r.value as { estado?: string }).estado ?? inicial);
    const terminal = def.estados.find((e) => e.nombre === estado)?.final === true;
    return ok({ instanciaId, estado: { estado: aDominio(ref.proceso, estado), terminal } });
  }

  async transicionar(
    _uow: UnitOfWork,
    tenant: string,
    ref: ReferenciaWorkflow,
    accion: string,
    _actorId: string,
  ): Promise<Result<EstadoWorkflow, KernelError>> {
    if (!ref.instanciaId) return fail(KernelErrors.conflict("La referencia de workflow no tiene instancia iniciada"));
    const rt = this.runtime();
    const ctx = this.ctxSistema(tenant);
    const actual = await rt.kernel.queries.execute(childContext(ctx), this.nInst.obtener, { id: ref.instanciaId });
    if (!actual.ok) return actual;
    const inst = actual.value as { version?: number } | null;
    if (!inst) return fail(KernelErrors.notFound("workflow-instancia", ref.instanciaId));
    const tr = await rt.kernel.commands.execute(childContext(ctx), this.nInst.transicionar, {
      id: ref.instanciaId,
      version: Number(inst.version ?? 1),
      comando: accion,
    });
    if (!tr.ok) return tr;
    // Relee el estado resuelto por el motor (fuente de verdad neutra).
    const post = await rt.kernel.queries.execute(childContext(ctx), this.nInst.obtener, { id: ref.instanciaId });
    if (!post.ok) return post;
    const estado = String((post.value as { status?: string } | null)?.status ?? accion);
    const def = DEFINICIONES[ref.proceso];
    const terminal = def.estados.find((e) => e.nombre === estado)?.final === true;
    return ok({ estado: aDominio(ref.proceso, estado), terminal });
  }
}
