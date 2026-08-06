/**
 * DGP-013.2 · Módulo Enterprise Procurement — Adaptador REAL de `WorkflowPort`
 * sobre el Workflow Engine (DGP-007).
 *
 * Implementa el CONTRATO neutro `WorkflowPort` delegando en los comandos/consultas
 * de instancia y definición del motor real, montado como `extraService` bajo el
 * servicio `MODULO_WORKFLOW`. Es el ÚNICO modo operativo de gobierno (no hay
 * auto-aprobación): toda solicitud/OC SOLO transiciona si el motor lo autoriza.
 *
 * Aislamiento de UoW: el motor gestiona su PROPIO estado (records de instancia)
 * en UoWs SEPARADAS (vía `childContext` + `runtime.commands`), NUNCA anidando la
 * UoW del comando del módulo — mismo patrón que module-planes (DGP-012.2).
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

/**
 * Definiciones NEUTRAS del ciclo de vida gobernado de cada proceso. El motor
 * exige estados camelCase; el dominio (solicitud.ts / orden-compra.ts /
 * recepcion.ts) usa las MISMAS claves — no requieren traducción.
 *
 *  · solicitud   : borrador →(enviar)→ enviada →(aprobar)→ aprobada;
 *                  enviada →(rechazar)→ rechazada[final]; aprobada →(cerrar)→ cerrada[final].
 *  · ordenCompra : borrador →(aprobar)→ aprobada →(enviar)→ enviada;
 *                  enviada →(recibirParcial)→ parcialmenteRecibida (auto-loop) →(recibirTotal)→ recibida[final];
 *                  borrador/aprobada/enviada →(cancelar)→ cancelada[final].
 *  · recepcion   : borrador →(registrar)→ registrada[final] (traza atómica).
 */
const DEFINICIONES: Record<ProcesoWorkflow, DefinicionWorkflow> = {
  solicitud: {
    clave: "ciclo-solicitud",
    etiqueta: "Solicitud de compra",
    operacionesEstandar: { cancelar: false, reabrir: false, suspender: false, reanudar: false },
    estados: [
      { nombre: "borrador", inicial: true },
      { nombre: "enviada" },
      { nombre: "aprobada" },
      { nombre: "rechazada", final: true },
      { nombre: "cerrada", final: true },
    ],
    transiciones: [
      { de: "borrador", a: "enviada", comando: "enviar" },
      { de: "enviada", a: "aprobada", comando: "aprobar" },
      { de: "enviada", a: "rechazada", comando: "rechazar" },
      { de: "aprobada", a: "cerrada", comando: "cerrar" },
    ],
  },
  ordenCompra: {
    clave: "ciclo-adquisicion",
    etiqueta: "Orden de compra",
    operacionesEstandar: { cancelar: false, reabrir: false, suspender: false, reanudar: false },
    estados: [
      { nombre: "borrador", inicial: true },
      { nombre: "aprobada" },
      { nombre: "enviada" },
      { nombre: "parcialmenteRecibida" },
      { nombre: "recibida", final: true },
      { nombre: "cancelada", final: true },
    ],
    transiciones: [
      { de: "borrador", a: "aprobada", comando: "aprobar" },
      { de: "aprobada", a: "enviada", comando: "enviar" },
      { de: "enviada", a: "parcialmenteRecibida", comando: "recibirParcial" },
      { de: "parcialmenteRecibida", a: "parcialmenteRecibida", comando: "recibirParcial" },
      { de: "enviada", a: "recibida", comando: "recibirTotal" },
      { de: "parcialmenteRecibida", a: "recibida", comando: "recibirTotal" },
      { de: "borrador", a: "cancelada", comando: "cancelar" },
      { de: "aprobada", a: "cancelada", comando: "cancelar" },
      { de: "enviada", a: "cancelada", comando: "cancelar" },
    ],
  },
  recepcion: {
    clave: "ciclo-recepcion",
    etiqueta: "Recepción",
    operacionesEstandar: { cancelar: false, reabrir: false, suspender: false, reanudar: false },
    estados: [
      { nombre: "borrador", inicial: true },
      { nombre: "registrada", final: true },
    ],
    transiciones: [
      { de: "borrador", a: "registrada", comando: "registrar" },
    ],
  },
};

/** Estado inicial que refleja el motor tras iniciar (coincide con la definición). */
export function estadoInicialDe(proceso: ProcesoWorkflow): EstadoWorkflow {
  const def = DEFINICIONES[proceso];
  const inicial = def.estados.find((e) => e.inicial)?.nombre ?? def.estados[0]!.nombre;
  const terminal = def.estados.find((e) => e.nombre === inicial)?.final === true;
  return { estado: inicial, terminal };
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
    return ok({ instanciaId, estado: { estado, terminal } });
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
    const post = await rt.kernel.queries.execute(childContext(ctx), this.nInst.obtener, { id: ref.instanciaId });
    if (!post.ok) return post;
    const estado = String((post.value as { status?: string } | null)?.status ?? accion);
    const def = DEFINICIONES[ref.proceso];
    const terminal = def.estados.find((e) => e.nombre === estado)?.final === true;
    return ok({ estado, terminal });
  }
}
