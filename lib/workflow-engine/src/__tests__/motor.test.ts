/**
 * DGP-007 · Workflow Engine — Pruebas con adaptadores Fake (offline).
 *
 * Cubre: motor de condiciones, definición→publicación→activación, transiciones
 * válidas/inválidas, permisos/capacidades/policies, pre/postcondiciones,
 * acciones declarativas, operaciones estándar (cancelar/reabrir/suspender/
 * reanudar), GATE de aprobación (la transición no cambia estado hasta
 * resolverse; imposible saltar el gate; rechazo aplica destino declarado),
 * modos de aprobación, `alVencer` en sus 3 variantes, versionado N/N-1 +
 * migración, y offline/sync atómico/idempotente (una UoW por operación).
 * CERO vocabulario de negocio.
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  aplicarVencimiento,
  createWorkflowRuntime,
  crearMotorWorkflow,
  evaluarCondicion,
  iniciarAprobacion,
  nombresInstancia,
  resolverEstado,
  validarWorkflow,
  type DefinicionAprobacionTransicion,
  type DefinicionWorkflow,
  type WorkflowRuntime,
} from "..";
import {
  PERMISO_LEER,
  PERMISO_REVISAR,
  SERVICIO,
  workflowSolicitud,
  workflowSolicitudV2,
  workflowTicket,
} from "./ejemplo";

/* ------------------------------- Utilidades -------------------------------- */

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...crearMotorWorkflow({ servicio: SERVICIO }).permissions,
    PERMISO_REVISAR,
  ]),
];

const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };
const LECTOR: Principal = { id: "lector-1", rol: "lector", permisos: [PERMISO_LEER], capacidades: [] };
const REVISOR: Principal = {
  id: "revisor",
  rol: "revisor",
  permisos: ALL_PERMISSIONS,
  capacidades: [],
};

function runtime(): WorkflowRuntime {
  return createWorkflowRuntime({ servicio: SERVICIO }, { logger: new MemoryLogger() });
}

function ctxOf(tenantId: string, principal: Principal = ADMIN): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId } });
}

const n = nombresInstancia(SERVICIO);
const exec = (rt: WorkflowRuntime, ctx: ExecutionContext, cmd: string, input: unknown) =>
  rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (rt: WorkflowRuntime, ctx: ExecutionContext, q: string, input: unknown) =>
  rt.platform.kernel.queries.execute(ctx, q, input);
const drain = (rt: WorkflowRuntime) => rt.platform.kernel.outboxProcessor.processPending();

/** Publica + activa una definición. Devuelve el id de la definición. */
async function publicarActivar(
  rt: WorkflowRuntime,
  ctx: ExecutionContext,
  def: DefinicionWorkflow,
): Promise<string> {
  const id = crypto.randomUUID();
  const pub = await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id, definicion: def });
  if (!pub.ok) throw new Error(`publicar: ${pub.error.message}`);
  const act = await exec(rt, ctx, `${SERVICIO}.definicion.activar`, { id, version: 1 });
  if (!act.ok) throw new Error(`activar: ${act.error.message}`);
  return id;
}

async function versionActual(rt: WorkflowRuntime, ctx: ExecutionContext, id: string): Promise<number> {
  const inst = await query(rt, ctx, n.obtener, { id });
  if (!inst.ok) throw new Error("instancia no encontrada");
  return (inst.value as { version: number }).version;
}
async function estadoActual(rt: WorkflowRuntime, ctx: ExecutionContext, id: string): Promise<string> {
  const inst = await query(rt, ctx, n.obtener, { id });
  if (!inst.ok) throw new Error("instancia no encontrada");
  return (inst.value as { status: string }).status;
}

/* ============================ Motor de condiciones ======================== */

describe("Motor de condiciones declarativo", () => {
  const datos = { titulo: "Solicitud X", monto: 50, tags: ["a", "b"], habilitado: true };

  it("operadores de comparación básicos", () => {
    expect(evaluarCondicion({ campo: "monto", operador: "igual", valor: 50 }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "monto", operador: "mayor", valor: 40 }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "monto", operador: "menor", valor: 40 }, datos)).toBe(false);
    expect(evaluarCondicion({ campo: "titulo", operador: "existe" }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "ausente", operador: "vacio" }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "tags", operador: "contiene", valor: "a" }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "monto", operador: "en", valor: [10, 50] }, datos)).toBe(true);
  });

  it("combinadores y / o / no", () => {
    expect(
      evaluarCondicion(
        { y: [{ campo: "habilitado", operador: "igual", valor: true }, { campo: "monto", operador: "mayor", valor: 10 }] },
        datos,
      ),
    ).toBe(true);
    expect(
      evaluarCondicion(
        { o: [{ campo: "monto", operador: "igual", valor: 999 }, { campo: "habilitado", operador: "igual", valor: true }] },
        datos,
      ),
    ).toBe(true);
    expect(evaluarCondicion({ no: { campo: "habilitado", operador: "igual", valor: false } }, datos)).toBe(true);
  });

  it("rutas con punto y nunca ejecuta código arbitrario", () => {
    expect(evaluarCondicion({ campo: "a.b", operador: "igual", valor: 1 }, { a: { b: 1 } })).toBe(true);
    expect(evaluarCondicion({ campo: "x", operador: "??" as never, valor: 1 }, datos)).toBe(false);
  });
});

/* =========================== Validación estructural ======================= */

describe("Validación estructural de definiciones", () => {
  it("acepta la definición neutra de ejemplo", () => {
    expect(validarWorkflow(workflowSolicitud).valido).toBe(true);
  });

  it("rechaza vocabulario de negocio prohibido", () => {
    const malo: DefinicionWorkflow = {
      ...workflowSolicitud,
      estados: [{ nombre: "compraInicial", inicial: true, final: true }],
      transiciones: [],
    };
    const r = validarWorkflow(malo);
    expect(r.valido).toBe(false);
    expect(r.errores.some((e) => /reservada de negocio/.test(e.mensaje))).toBe(true);
  });

  it("detecta falta de estado inicial", () => {
    const malo: DefinicionWorkflow = {
      clave: "roto",
      etiqueta: "Roto",
      estados: [{ nombre: "uno" }, { nombre: "dos" }],
      transiciones: [{ de: "uno", a: "dos", comando: "ir" }],
      operacionesEstandar: { cancelar: false, suspender: false, reabrir: false, reanudar: false },
    };
    const r = validarWorkflow(malo);
    expect(r.valido).toBe(false);
    expect(r.errores.some((e) => /inicial/.test(e.mensaje))).toBe(true);
  });

  it("detecta estados inalcanzables desde el inicial (BFS)", () => {
    const malo: DefinicionWorkflow = {
      clave: "roto",
      etiqueta: "Roto",
      estados: [
        { nombre: "uno", inicial: true },
        { nombre: "dos" },
        { nombre: "aislado", final: true },
      ],
      transiciones: [{ de: "uno", a: "dos", comando: "ir" }],
      operacionesEstandar: { cancelar: false, suspender: false, reabrir: false, reanudar: false },
    };
    const r = validarWorkflow(malo);
    expect(r.valido).toBe(false);
    expect(r.errores.some((e) => /alcanzable/.test(e.mensaje))).toBe(true);
  });

  it("detecta transición ambigua (mismo de+comando)", () => {
    const malo: DefinicionWorkflow = {
      clave: "ambiguo",
      etiqueta: "Ambiguo",
      estados: [{ nombre: "inicio", inicial: true }, { nombre: "fin", final: true }],
      transiciones: [
        { de: "inicio", a: "fin", comando: "ir" },
        { de: "inicio", a: "fin", comando: "ir" },
      ],
    };
    expect(validarWorkflow(malo).valido).toBe(false);
  });

  it("detecta destino de rechazo (rechazoA) inexistente", () => {
    const malo: DefinicionWorkflow = {
      clave: "rechazo-roto",
      etiqueta: "Rechazo roto",
      estados: [{ nombre: "inicio", inicial: true }, { nombre: "fin", final: true }],
      transiciones: [
        {
          de: "inicio",
          a: "fin",
          comando: "resolver",
          rechazoA: "inexistente",
          aprobacion: { nombre: "ap", modo: "individual", permiso: PERMISO_REVISAR, aprobadores: ["revisor"] },
        },
      ],
    };
    const r = validarWorkflow(malo);
    expect(r.valido).toBe(false);
    expect(r.errores.some((e) => /rechazo/.test(e.mensaje))).toBe(true);
  });
});

/* ================== Definición → publicación → activación ================= */

describe("Workflow Designer Runtime: publicar/activar/versionar", () => {
  it("publica v1, la activa y la deja disponible como definición activa", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-def");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const activa = await query(rt, ctx, `${SERVICIO}.definicion.activa`, { clave: "solicitud-generica" });
    expect(activa.ok).toBe(true);
    if (!activa.ok) return;
    expect((activa.value as { status: string }).status).toBe("activa");
  });

  it("publicar rechaza definición inválida (vocabulario prohibido)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-def2");
    const malo = { ...workflowSolicitud, clave: "orden-x" };
    const r = await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: crypto.randomUUID(), definicion: malo });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-VAL-001");
  });

  it("versionado N incremental por clave; solo una activa por clave", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-ver");
    const id1 = crypto.randomUUID();
    await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: id1, definicion: workflowSolicitud });
    const id2 = crypto.randomUUID();
    const pub2 = await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: id2, definicion: workflowSolicitudV2 });
    expect(pub2.ok).toBe(true);
    if (!pub2.ok) return;
    expect((pub2.value as { versionN: number }).versionN).toBe(2);
    await exec(rt, ctx, `${SERVICIO}.definicion.activar`, { id: id1, version: 1 });
    await exec(rt, ctx, `${SERVICIO}.definicion.activar`, { id: id2, version: 1 });
    const activa = await query(rt, ctx, `${SERVICIO}.definicion.activa`, { clave: "solicitud-generica" });
    expect(activa.ok && (activa.value as { data: Record<string, unknown> }).data["versionN"]).toBe(2);
  });

  it("publicar es idempotente con el mismo id de cliente", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-idem-def");
    const id = crypto.randomUUID();
    const r1 = await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id, definicion: workflowSolicitud });
    const r2 = await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id, definicion: workflowSolicitud });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r2.ok) return;
    expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("diseñar requiere permiso de diseño", async () => {
    const rt = runtime();
    const r = await exec(rt, ctxOf("t-perm", LECTOR), `${SERVICIO}.definicion.publicar`, {
      id: crypto.randomUUID(),
      definicion: workflowSolicitud,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });
});

/* ============================ Ciclo de instancia ========================== */

describe("Workflow Runtime: iniciar y transicionar", () => {
  async function preparar(tenant: string): Promise<{ rt: WorkflowRuntime; ctx: ExecutionContext; id: string }> {
    const rt = runtime();
    const ctx = ctxOf(tenant);
    await publicarActivar(rt, ctx, workflowSolicitud);
    const id = crypto.randomUUID();
    const r = await exec(rt, ctx, n.iniciar, { id, data: { titulo: "Solicitud demo" } });
    if (!r.ok) throw new Error(r.error.message);
    return { rt, ctx, id };
  }

  it("inicia en el estado inicial 'borrador'", async () => {
    const { rt, ctx, id } = await preparar("t-inst");
    expect(await estadoActual(rt, ctx, id)).toBe("borrador");
  });

  it("iniciar es idempotente por id de cliente (Offline First)", async () => {
    const { rt, ctx, id } = await preparar("t-inst-idem");
    const r2 = await exec(rt, ctx, n.iniciar, { id, data: { titulo: "otra" } });
    expect(r2.ok && (r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("transición válida borrador→enviada ejecuta acciones (asignar + notificar)", async () => {
    const { rt, ctx, id } = await preparar("t-trans");
    const r = await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { estado: string }).estado).toBe("enviada");
    const inst = await query(rt, ctx, n.obtener, { id });
    if (!inst.ok) return;
    const data = (inst.value as { data: Record<string, unknown> }).data;
    expect(data["_asignadoA"]).toBe(ADMIN.id);
    const notifs = await query(rt, ctx, "platform.notification.pending", {});
    expect(notifs.ok).toBe(true);
  });

  it("transición ilegal desde el estado actual es conflicto", async () => {
    const { rt, ctx, id } = await preparar("t-illegal");
    const r = await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "resolver" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-CFL-001");
  });

  it("precondición fallida bloquea la transición", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-precond");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: {} }); // sin titulo
    const r = await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(/Precondición/.test(r.error.message)).toBe(true);
  });

  it("permiso de transición denegado (revisar) para un lector", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-permT");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    const r = await exec(rt, ctxOf("t-permT", LECTOR), n.transicionar, { id, version: 2, comando: "tomar" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });

  it("conflicto de versión (concurrencia optimista)", async () => {
    const { rt, ctx, id } = await preparar("t-cc");
    const e1 = await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    expect(e1.ok).toBe(true);
    const e2 = await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    expect(e2.ok).toBe(false);
    if (e2.ok) return;
    expect(e2.error.code).toBe("KRN-CFL-001");
  });

  it("emite auditoría de transición", async () => {
    const { rt, ctx, id } = await preparar("t-ev");
    const r = await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    expect(r.ok).toBe(true);
    await drain(rt);
    const trail = await rt.platform.audit.list("t-ev", { service: SERVICIO });
    expect(trail.ok && trail.value.some((a) => a.action === "transicionar:enviar")).toBe(true);
  });
});

/* ============ Multiplexación de PROCESOS bajo un mismo servicio =========== */
/**
 * Regresión DGP-013: un ÚNICO servicio de motor (`flujo.demo`) publica DOS
 * definiciones activas con claves distintas (`solicitud-generica` y
 * `ticket-generico`). Antes del hotfix, `crearResolverDefinicion` resolvía sólo
 * por servicio+versión y confundía definiciones homónimas por versión (N=1 en
 * ambas): transicionar una instancia resolvía la definición equivocada. Estas
 * pruebas fijan que cada instancia resuelve SU propia definición por `clave`.
 */
describe("Multiplexación: dos definiciones activas del mismo servicio por clave", () => {
  /** Publica+activa AMBAS definiciones (misma versión N=1) en el mismo servicio. */
  async function prepararDual(tenant: string): Promise<{ rt: WorkflowRuntime; ctx: ExecutionContext }> {
    const rt = runtime();
    const ctx = ctxOf(tenant, REVISOR);
    await publicarActivar(rt, ctxOf(tenant, ADMIN), workflowSolicitud);
    await publicarActivar(rt, ctxOf(tenant, ADMIN), workflowTicket);
    return { rt, ctx };
  }

  it("ambas quedan activas simultáneamente bajo el mismo servicio", async () => {
    const { rt, ctx } = await prepararDual("t-mux-activas");
    const a = await query(rt, ctx, `${SERVICIO}.definicion.activa`, { clave: "solicitud-generica" });
    const b = await query(rt, ctx, `${SERVICIO}.definicion.activa`, { clave: "ticket-generico" });
    expect(a.ok && (a.value as { status: string }).status).toBe("activa");
    expect(b.ok && (b.value as { status: string }).status).toBe("activa");
  });

  it("iniciar por clave persiste el proceso correcto y arranca en SU estado inicial", async () => {
    const { rt, ctx } = await prepararDual("t-mux-iniciar");
    const idS = crypto.randomUUID();
    const idT = crypto.randomUUID();
    const rs = await exec(rt, ctx, n.iniciar, { id: idS, data: { titulo: "s", definicion: "solicitud-generica" } });
    const rt2 = await exec(rt, ctx, n.iniciar, { id: idT, data: { titulo: "t", definicion: "ticket-generico" } });
    expect(rs.ok && rt2.ok).toBe(true);
    // Cada instancia arranca en el estado inicial de SU definición.
    expect(await estadoActual(rt, ctx, idS)).toBe("borrador"); // solicitud
    expect(await estadoActual(rt, ctx, idT)).toBe("abierto"); // ticket
    // El proceso quedó grabado en la instancia (_workflow).
    const instT = await query(rt, ctx, n.obtener, { id: idT });
    expect(instT.ok && ((instT.value as { data: Record<string, unknown> }).data["_workflow"])).toBe("ticket-generico");
  });

  it("transicionar resuelve la definición de la instancia: comando ajeno es ILEGAL en cada proceso", async () => {
    const { rt, ctx } = await prepararDual("t-mux-trans");
    const idS = crypto.randomUUID();
    const idT = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id: idS, data: { titulo: "s", definicion: "solicitud-generica" } });
    await exec(rt, ctx, n.iniciar, { id: idT, data: { titulo: "t", definicion: "ticket-generico" } });

    // (a) Comando propio de CADA proceso es válido y NO se confunde con el otro.
    const okS = await exec(rt, ctx, n.transicionar, { id: idS, version: 1, comando: "enviar" });
    expect(okS.ok && (okS.value as { estado: string }).estado).toBe("enviada");
    const okT = await exec(rt, ctx, n.transicionar, { id: idT, version: 1, comando: "abrir" });
    expect(okT.ok && (okT.value as { estado: string }).estado).toBe("atendido");

    // (b) El comando de un proceso es ILEGAL en el otro (vocabularios disjuntos):
    //     'abrir' NO existe en solicitud; 'enviar' NO existe en ticket.
    const idS2 = crypto.randomUUID();
    const idT2 = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id: idS2, data: { titulo: "s2", definicion: "solicitud-generica" } });
    await exec(rt, ctx, n.iniciar, { id: idT2, data: { titulo: "t2", definicion: "ticket-generico" } });
    const malS = await exec(rt, ctx, n.transicionar, { id: idS2, version: 1, comando: "abrir" });
    const malT = await exec(rt, ctx, n.transicionar, { id: idT2, version: 1, comando: "enviar" });
    expect(malS.ok).toBe(false);
    expect(malT.ok).toBe(false);
    if (!malS.ok) expect(malS.error.code).toBe("KRN-CFL-001");
    if (!malT.ok) expect(malT.error.code).toBe("KRN-CFL-001");
  });

  it("aprobar (gate) resuelve la definición de la instancia sin confundir procesos", async () => {
    // Sólo 'solicitud-generica' declara una transición GOBERNADA por aprobación.
    // Con 'ticket-generico' también activo, el gate debe resolver la definición
    // correcta por clave (antes: el resolver podía tomar la definición ajena).
    const { rt } = await prepararDual("t-mux-aprobar");
    const admin = ctxOf("t-mux-aprobar", ADMIN);
    const id = crypto.randomUUID();
    await exec(rt, admin, n.iniciar, { id, data: { titulo: "t", definicion: "solicitud-generica" } });
    await exec(rt, admin, n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(rt, admin, n.transicionar, { id, version: 2, comando: "tomar" });
    const abrir = await exec(rt, admin, n.transicionar, { id, version: 3, comando: "resolver" }); // gate
    expect(abrir.ok && (abrir.value as { pendienteAprobacion: boolean }).pendienteAprobacion).toBe(true);
    const ctxRev = ctxOf("t-mux-aprobar", REVISOR);
    const v = await versionActual(rt, ctxRev, id);
    const r = await exec(rt, ctxRev, n.aprobar, { id, version: v, transicion: "resolver" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { estado: string }).estado).toBe("aprobada");
  });
});

/* ============ Retrocompatibilidad: instancias SIN clave persistida ======== */
/**
 * Regresión DGP-013 (retrocompatibilidad): una instancia en formato ANTIGUO no
 * persiste `_workflow`. En un servicio con UNA sola definición, el motor debe
 * seguir resolviendo por servicio+versión (comportamiento previo intacto), sin
 * que el hotfix introduzca dependencia obligatoria de `clave`.
 */
describe("Retrocompatibilidad: instancia sin _workflow resuelve por servicio+versión", () => {
  it("transiciona correctamente aunque la instancia no tenga clave persistida", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-legacy");
    await publicarActivar(rt, ctx, workflowSolicitud); // servicio con UNA definición
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "legacy" } });

    // Simula el formato ANTIGUO: eliminamos `_workflow`/`_versionDefinicion` de la
    // instancia persistida (el Fake ignora la UoW). Deja intacta la versión de
    // datos para la posterior transición optimista.
    const store = rt.platform.store;
    const found = await store.findById("t-legacy", id);
    if (!found.ok || !found.value) throw new Error("instancia no encontrada");
    const rec = found.value;
    const datosSinClave = { ...rec.data };
    delete datosSinClave["_workflow"];
    delete datosSinClave["_versionDefinicion"];
    const upd = await store.update({} as never, "t-legacy", id, rec.version, { data: datosSinClave });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;

    // Confirmamos que NO quedó clave persistida.
    const check = await query(rt, ctx, n.obtener, { id });
    expect(check.ok && ((check.value as { data: Record<string, unknown> }).data["_workflow"])).toBeUndefined();

    // La transición estándar sigue resolviendo la definición por servicio+versión.
    const v = (check.ok ? (check.value as { version: number }).version : 1);
    const r = await exec(rt, ctx, n.transicionar, { id, version: v, comando: "enviar" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { estado: string }).estado).toBe("enviada");
  });
});

/* ======================== Operaciones estándar ============================ */

describe("Operaciones estándar: cancelar/reabrir/suspender/reanudar", () => {
  async function enRevision(tenant: string): Promise<{ rt: WorkflowRuntime; ctx: ExecutionContext; id: string }> {
    const rt = runtime();
    const ctx = ctxOf(tenant, REVISOR);
    await publicarActivar(rt, ctxOf(tenant, ADMIN), workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(rt, ctx, n.transicionar, { id, version: 2, comando: "tomar" });
    return { rt, ctx, id };
  }

  it("cancelar lleva a estado cancelado", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-cancel");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "t" } });
    const c = await exec(rt, ctx, n.cancelar, { id, version: 1 });
    expect(c.ok && (c.value as { estado: string }).estado).toBe("cancelado");
  });

  it("reabrir desde cancelado vuelve al estado inicial", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-reabrir");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, ctx, n.cancelar, { id, version: 1 });
    const re = await exec(rt, ctx, n.reabrir, { id, version: 2 });
    expect(re.ok && (re.value as { estado: string }).estado).toBe("borrador");
  });

  it("suspender/reanudar sobre estado suspendible restaura el estado previo", async () => {
    const { rt, ctx, id } = await enRevision("t-susp");
    const v = await versionActual(rt, ctx, id);
    const s = await exec(rt, ctx, n.suspender, { id, version: v });
    expect(s.ok && (s.value as { estado: string }).estado).toBe("suspendido");
    const r = await exec(rt, ctx, n.reanudar, { id, version: v + 1 });
    expect(r.ok && (r.value as { estado: string }).estado).toBe("enRevision");
  });

  it("suspender falla en un estado no suspendible", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-susp2");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "t" } });
    const s = await exec(rt, ctx, n.suspender, { id, version: 1 });
    expect(s.ok).toBe(false);
  });
});

/* ===================== GATE de aprobación (CRÍTICO #1) ===================== */

describe("Gate de aprobación: la transición NO cambia estado hasta resolverse", () => {
  // Coloca la instancia en 'enRevision' con REVISOR como solicitante.
  async function enRevision(tenant: string, solicitante: Principal = REVISOR) {
    const rt = runtime();
    await publicarActivar(rt, ctxOf(tenant, ADMIN), workflowSolicitud);
    const ctx = ctxOf(tenant, solicitante);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(rt, ctx, n.transicionar, { id, version: 2, comando: "tomar" });
    return { rt, ctx, id };
  }

  it("transicionar 'resolver' abre el gate y NO cambia el estado (sigue enRevision)", async () => {
    const { rt, ctx, id } = await enRevision("t-gate");
    const v = await versionActual(rt, ctx, id);
    const r = await exec(rt, ctx, n.transicionar, { id, version: v, comando: "resolver" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { pendienteAprobacion: boolean }).pendienteAprobacion).toBe(true);
    expect((r.value as { estado: string }).estado).toBe("enRevision");
    expect(await estadoActual(rt, ctx, id)).toBe("enRevision");
  });

  it("es IMPOSIBLE saltar el gate: 'aprobar' es la única vía al estado destino", async () => {
    const rt = runtime();
    const admin = ctxOf("t-gate2", ADMIN);
    await publicarActivar(rt, admin, workflowSolicitud);
    const ctx = ctxOf("t-gate2", ADMIN);
    const id = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, ctx, n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(rt, ctx, n.transicionar, { id, version: 2, comando: "tomar" });
    // Abre el gate.
    await exec(rt, ctx, n.transicionar, { id, version: 3, comando: "resolver" });
    // Un segundo 'resolver' no fuerza el estado; sigue en revisión (idempotente).
    const v = await versionActual(rt, ctx, id);
    const otra = await exec(rt, ctx, n.transicionar, { id, version: v, comando: "resolver" });
    expect(otra.ok && (otra.value as { estado: string }).estado).toBe("enRevision");
    expect(await estadoActual(rt, ctx, id)).toBe("enRevision");
  });

  it("aprobar resuelve el gate y EJECUTA la transición completa (→aprobada + evento)", async () => {
    // solicitante ADMIN, aprobador REVISOR (distinto) ⇒ sin auto-aprobación.
    const rt = runtime();
    const admin = ctxOf("t-gate3", ADMIN);
    await publicarActivar(rt, admin, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, admin, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, admin, n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(rt, admin, n.transicionar, { id, version: 2, comando: "tomar" });
    await exec(rt, admin, n.transicionar, { id, version: 3, comando: "resolver" }); // abre gate
    const ctxRev = ctxOf("t-gate3", REVISOR);
    const v = await versionActual(rt, ctxRev, id);
    const r = await exec(rt, ctxRev, n.aprobar, { id, version: v, transicion: "resolver" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { estado: string }).estado).toBe("aprobada");
    expect((r.value as { aprobacion: { estado: string } }).aprobacion.estado).toBe("aprobada");
    expect(await estadoActual(rt, ctxRev, id)).toBe("aprobada");
  });

  it("rechazar aplica el destino de rechazo declarado (rechazoA → rechazada)", async () => {
    const rt = runtime();
    const admin = ctxOf("t-gate4", ADMIN);
    await publicarActivar(rt, admin, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, admin, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, admin, n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(rt, admin, n.transicionar, { id, version: 2, comando: "tomar" });
    await exec(rt, admin, n.transicionar, { id, version: 3, comando: "resolver" });
    const ctxRev = ctxOf("t-gate4", REVISOR);
    const v = await versionActual(rt, ctxRev, id);
    const r = await exec(rt, ctxRev, n.rechazar, { id, version: v, transicion: "resolver", motivo: "no procede" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { estado: string }).estado).toBe("rechazada");
    expect(await estadoActual(rt, ctxRev, id)).toBe("rechazada");
  });

  it("el solicitante no puede auto-aprobar su propia solicitud", async () => {
    // REVISOR inicia (solicitante) y también es el aprobador declarado.
    const { rt, ctx, id } = await enRevision("t-gate5", REVISOR);
    await exec(rt, ctx, n.transicionar, { id, version: 3, comando: "resolver" });
    const v = await versionActual(rt, ctx, id);
    const r = await exec(rt, ctx, n.aprobar, { id, version: v, transicion: "resolver" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });

  it("aprobar sin gate abierto es conflicto", async () => {
    const { rt, ctx, id } = await enRevision("t-gate6");
    const v = await versionActual(rt, ctx, id);
    const r = await exec(rt, ctx, n.aprobar, { id, version: v, transicion: "resolver" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-CFL-001");
  });
});

/* ===================== Aprobaciones: lógica pura de modos ================== */

describe("Approval Runtime: resolución por modo (lógica pura)", () => {
  const base = (
    modo: DefinicionAprobacionTransicion["modo"],
    aprobadores: string[],
    extra: Partial<DefinicionAprobacionTransicion> = {},
  ): DefinicionAprobacionTransicion => ({
    nombre: "ap",
    modo,
    permiso: PERMISO_REVISAR,
    aprobadores,
    ...extra,
  });

  it("individual: una aprobación basta", () => {
    expect(resolverEstado(base("individual", ["a"]), [{ aprobador: "a", actorId: "a", decision: "aprobada", fecha: "x" }])).toBe("aprobada");
  });

  it("paralela: alcanza minAprobaciones", () => {
    const def = base("paralela", ["a", "b", "c"], { minAprobaciones: 2 });
    expect(resolverEstado(def, [{ aprobador: "a", actorId: "a", decision: "aprobada", fecha: "x" }])).toBe("pendiente");
    expect(
      resolverEstado(def, [
        { aprobador: "a", actorId: "a", decision: "aprobada", fecha: "x" },
        { aprobador: "b", actorId: "b", decision: "aprobada", fecha: "x" },
      ]),
    ).toBe("aprobada");
  });

  it("mayoria: más de la mitad", () => {
    const def = base("mayoria", ["a", "b", "c"]);
    expect(
      resolverEstado(def, [
        { aprobador: "a", actorId: "a", decision: "aprobada", fecha: "x" },
        { aprobador: "b", actorId: "b", decision: "aprobada", fecha: "x" },
      ]),
    ).toBe("aprobada");
  });

  it("unanimidad: todos", () => {
    const def = base("unanimidad", ["a", "b"]);
    expect(resolverEstado(def, [{ aprobador: "a", actorId: "a", decision: "aprobada", fecha: "x" }])).toBe("pendiente");
    expect(
      resolverEstado(def, [
        { aprobador: "a", actorId: "a", decision: "aprobada", fecha: "x" },
        { aprobador: "b", actorId: "b", decision: "aprobada", fecha: "x" },
      ]),
    ).toBe("aprobada");
  });

  it("cualquier rechazo resuelve como rechazada", () => {
    const def = base("unanimidad", ["a", "b"]);
    expect(resolverEstado(def, [{ aprobador: "a", actorId: "a", decision: "rechazada", fecha: "x" }])).toBe("rechazada");
  });
});

/* ================= alVencer en sus 3 variantes (MAYOR #3) ================== */

describe("aplicarVencimiento: alVencer escalar / rechazar / nada", () => {
  const objetivo = { comando: "resolver", estadoOrigen: "enRevision", estadoDestino: "aprobada", rechazoA: "rechazada" };
  const venc = (extra: Partial<DefinicionAprobacionTransicion>) =>
    iniciarAprobacion(
      { nombre: "ap", modo: "individual", permiso: PERMISO_REVISAR, aprobadores: ["a"], vencimientoMinutos: 1, ...extra },
      objetivo,
      "sol",
      new Date(Date.now() - 120_000),
    );

  it("alVencer 'nada' → expirada sin escalar ni rechazar", () => {
    const r = aplicarVencimiento(venc({ alVencer: "nada" }), new Date());
    expect(r.cambio).toBe(true);
    expect(r.escalada).toBe(false);
    expect(r.aprobacion.estado).toBe("expirada");
  });

  it("alVencer 'rechazar' → rechazada (destino de rechazo lo aplica el motor)", () => {
    const r = aplicarVencimiento(venc({ alVencer: "rechazar" }), new Date());
    expect(r.aprobacion.estado).toBe("rechazada");
    expect(r.aprobacion.rechazoA).toBe("rechazada");
  });

  it("alVencer 'escalar' → escala UNA vez (sigue pendiente); NO fuerza rechazo", () => {
    const ap = venc({ alVencer: "escalar", rolEscalamiento: "supervisor" });
    const r1 = aplicarVencimiento(ap, new Date());
    expect(r1.escalada).toBe(true);
    expect(r1.aprobacion.escalado).toBe(true);
    expect(r1.aprobacion.estado).toBe("pendiente");
  });

  it("escalar por defecto cuando hay rolEscalamiento y no se declara alVencer", () => {
    const ap = venc({ rolEscalamiento: "supervisor" });
    expect(ap.alVencer).toBe("escalar");
    const r = aplicarVencimiento(ap, new Date());
    expect(r.escalada).toBe(true);
  });

  it("no vencida → sin cambios (idempotente)", () => {
    const futura = iniciarAprobacion(
      { nombre: "ap", modo: "individual", permiso: PERMISO_REVISAR, aprobadores: ["a"], vencimientoMinutos: 60 },
      objetivo,
      "sol",
      new Date(),
    );
    const r = aplicarVencimiento(futura, new Date());
    expect(r.cambio).toBe(false);
  });
});

/* =================== Aprobaciones: integración vía comandos ================ */

describe("Approval Runtime: integración (expirar idempotente)", () => {
  async function prepararGate(tenant: string) {
    const rt = runtime();
    const admin = ctxOf(tenant, ADMIN);
    await publicarActivar(rt, admin, workflowSolicitud);
    const id = crypto.randomUUID();
    await exec(rt, admin, n.iniciar, { id, data: { titulo: "t" } });
    await exec(rt, admin, n.transicionar, { id, version: 1, comando: "enviar" });
    await exec(rt, admin, n.transicionar, { id, version: 2, comando: "tomar" });
    await exec(rt, admin, n.transicionar, { id, version: 3, comando: "resolver" }); // gate
    return { rt, ctx: ctxOf(tenant, REVISOR), id };
  }

  it("expirarAprobaciones es idempotente cuando no hay vencidas (sin vencimiento)", async () => {
    const { rt, ctx, id } = await prepararGate("t-exp");
    const v = await versionActual(rt, ctx, id);
    const r = await exec(rt, ctx, n.expirar, { id, version: v });
    expect(r.ok && (r.value as { expiradas: number }).expiradas).toBe(0);
  });

  it("delegar registra la delegación del turno", async () => {
    const { rt, ctx, id } = await prepararGate("t-deleg");
    const v = await versionActual(rt, ctx, id);
    const r = await exec(rt, ctx, n.delegar, { id, version: v, transicion: "resolver", a: "otro-revisor" });
    expect(r.ok).toBe(true);
  });
});

/* ========================= Versionado N/N-1 + migración =================== */

describe("Compatibilidad N/N-1 y migración de instancias", () => {
  it("instancias en N-1 siguen transicionando con su versión; nuevas usan la activa", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-mig");
    const idV1 = crypto.randomUUID();
    await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: idV1, definicion: workflowSolicitud });
    await exec(rt, ctx, `${SERVICIO}.definicion.activar`, { id: idV1, version: 1 });

    const inst = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id: inst, data: { titulo: "t" } });

    const idV2 = crypto.randomUUID();
    await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: idV2, definicion: workflowSolicitudV2 });
    await exec(rt, ctx, `${SERVICIO}.definicion.activar`, { id: idV2, version: 2 });

    const t = await exec(rt, ctx, n.transicionar, { id: inst, version: 1, comando: "enviar" });
    expect(t.ok && (t.value as { estado: string }).estado).toBe("enviada");
  });

  it("migrar re-mapea el estado actual al equivalente de la versión destino", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-mig2");
    const idV1 = crypto.randomUUID();
    await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: idV1, definicion: workflowSolicitud });
    await exec(rt, ctx, `${SERVICIO}.definicion.activar`, { id: idV1, version: 1 });
    const idV2 = crypto.randomUUID();
    await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: idV2, definicion: workflowSolicitudV2 });

    const inst = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id: inst, data: { titulo: "t" } });
    await exec(rt, ctx, n.transicionar, { id: inst, version: 1, comando: "enviar" });
    const version = await versionActual(rt, ctx, inst);

    const mig = await exec(rt, ctx, `${SERVICIO}.definicion.migrar`, {
      instanciaId: inst,
      version,
      versionDestino: 2,
      mapa: { enviada: "enRevision" },
    });
    expect(mig.ok).toBe(true);
    if (!mig.ok) return;
    expect((mig.value as { estado: string }).estado).toBe("enRevision");
  });

  it("migrar rechaza mapa a un estado inexistente en destino", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-mig3");
    const idV1 = crypto.randomUUID();
    await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: idV1, definicion: workflowSolicitud });
    await exec(rt, ctx, `${SERVICIO}.definicion.activar`, { id: idV1, version: 1 });
    const idV2 = crypto.randomUUID();
    await exec(rt, ctx, `${SERVICIO}.definicion.publicar`, { id: idV2, definicion: workflowSolicitudV2 });
    const inst = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id: inst, data: { titulo: "t" } });
    const version = await versionActual(rt, ctx, inst);
    const r = await exec(rt, ctx, `${SERVICIO}.definicion.migrar`, {
      instanciaId: inst,
      version,
      versionDestino: 2,
      mapa: { borrador: "inexistente" },
    });
    expect(r.ok).toBe(false);
  });
});

/* ================ Offline + Sync (CRÍTICO #2: atómico/idempotente) ======== */

describe("Offline + Synchronization Runtime (procesarCola, una UoW por op)", () => {
  it("replay seguro: la segunda sincronización del mismo opId es idempotente", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const inst = crypto.randomUUID();
    const op = { opId: crypto.randomUUID(), comando: n.iniciar, input: { id: inst, data: { titulo: "t" } } };
    const r1 = await rt.sincronizar(ctx, [op]);
    const r2 = await rt.sincronizar(ctx, [op]);
    expect(r1.aplicadas).toBe(1);
    expect(r2.idempotentes).toBe(1);
    expect(r2.resultados[0]!.estado).toBe("idempotente");
  });

  it("creación offline exige id de cliente", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync2");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const op = { opId: crypto.randomUUID(), comando: n.iniciar, input: { data: { titulo: "t" } } };
    const r = await rt.sincronizar(ctx, [op]);
    expect(r.resultados[0]!.estado).toBe("rechazada");
  });

  it("detección de conflicto por versión devuelve estado actual para resolución", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync3");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const inst = crypto.randomUUID();
    await exec(rt, ctx, n.iniciar, { id: inst, data: { titulo: "t" } });
    await exec(rt, ctx, n.transicionar, { id: inst, version: 1, comando: "enviar" });
    const op = { opId: crypto.randomUUID(), comando: n.transicionar, input: { id: inst, version: 1, comando: "enviar" } };
    const r = await rt.sincronizar(ctx, [op]);
    const res = r.resultados[0]!;
    expect(res.estado).toBe("conflicto");
    expect((res.actual as { version: number }).version).toBe(2);
  });

  it("idempotencia durable tenant-scoped: mismo opId, distinto tenant, no cruza", async () => {
    const rt = runtime();
    const opId = crypto.randomUUID();
    await publicarActivar(rt, ctxOf("t-a"), workflowSolicitud);
    await publicarActivar(rt, ctxOf("t-b"), workflowSolicitud);
    const instA = crypto.randomUUID();
    await rt.sincronizar(ctxOf("t-a"), [{ opId, comando: n.iniciar, input: { id: instA, data: { titulo: "t" } } }]);
    // Tenant B: el mismo opId con otro id se APLICA (no hay recibo compartido).
    const instB = crypto.randomUUID();
    const rb = await rt.sincronizar(ctxOf("t-b"), [{ opId, comando: n.iniciar, input: { id: instB, data: { titulo: "t" } } }]);
    expect(rb.resultados[0]!.estado).toBe("aplicada");
    // La instancia A no existe para B (multitenancy).
    const listB = await query(rt, ctxOf("t-b"), n.listar, {});
    expect(listB.ok && (listB.value as unknown[]).length).toBe(1);
  });

  it("atomicidad: una operación aplicada persiste; sin UoW exterior compartida", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-sync4");
    await publicarActivar(rt, ctx, workflowSolicitud);
    const inst = crypto.randomUUID();
    const buena = { opId: crypto.randomUUID(), comando: n.iniciar, input: { id: inst, data: { titulo: "t" } } };
    const mala = { opId: crypto.randomUUID(), comando: n.transicionar, input: { id: crypto.randomUUID(), version: 1, comando: "enviar" } };
    const r = await rt.sincronizar(ctx, [buena, mala]);
    // La buena se aplicó (UoW propia); la mala falló sin afectar a la buena.
    expect(r.aplicadas).toBe(1);
    expect(await estadoActual(rt, ctx, inst)).toBe("borrador");
  });

  it("multitenancy: las instancias no cruzan tenants", async () => {
    const rt = runtime();
    await publicarActivar(rt, ctxOf("t-x"), workflowSolicitud);
    await exec(rt, ctxOf("t-x"), n.iniciar, { id: crypto.randomUUID(), data: { titulo: "solo x" } });
    const listB = await query(rt, ctxOf("t-y"), n.listar, {});
    expect(listB.ok && (listB.value as unknown[]).length).toBe(0);
  });
});

/* ============================ Registro del módulo ========================= */

describe("Registro automático del motor de workflow", () => {
  it("se inscribe en los registros con contrato completo (capacidades/dependencias)", () => {
    const rt = runtime();
    const names = rt.platform.registries.services.list().map((s) => s.name);
    expect(names).toContain(SERVICIO);
    const caps = rt.platform.registries.capabilities.list().map((c) => c.name);
    expect(caps).toContain(`operar-${SERVICIO}`);
    expect(caps).toContain(`disenar-${SERVICIO}`);
    expect(rt.platform.registries.dependencies.of(SERVICIO)).toContain("platform.notification");
  });

  it("observabilidad incluye el health check del motor", async () => {
    const rt = runtime();
    const statuses = await rt.platform.registries.observability.checkAll();
    expect(statuses.find((s) => s.service === SERVICIO)?.healthy).toBe(true);
  });

  it("permisos: un lector no puede iniciar instancias", async () => {
    const rt = runtime();
    const ctx = ctxOf("t-perm-ini", ADMIN);
    await publicarActivar(rt, ctx, workflowSolicitud);
    const r = await exec(rt, ctxOf("t-perm-ini", LECTOR), n.iniciar, { id: crypto.randomUUID(), data: { titulo: "t" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("KRN-AUTH-002");
  });
});
