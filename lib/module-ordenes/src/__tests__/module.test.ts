/**
 * DGP-009.1 · Pruebas de aplicación (adaptadores Fake / Record Store en memoria).
 * Cubre: consecutivo configurable, catálogos (canónico vs present+enabled),
 * ciclo de vida gobernado por Workflow Engine (transiciones, pausa, cancelación,
 * cierre con aprobación y rechazo), estados/transiciones EXTENDIDOS por tenant
 * (operables vía el motor + coherencia catálogo/definición), formularios/
 * checklists, evidencias, offline idempotencia por opId, lectura mínima del
 * aggregate (`detalle`), multitenancy y permisos.
 *
 * NOTA (alcance 009.1): el read-side materializado (listar/dashboard),
 * la proyección CQRS y la bitácora durable son INFRAESTRUCTURA DE LECTURA y se
 * cubren en DGP-009.2; aquí no se ejercen.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, MemoryLogger, type ExecutionContext, type Principal } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { nombresDefinicion } from "@workspace/workflow-engine";
import { FakePlantillas, PERMISO_OPERAR, procesarCola, WORKFLOW_ORDEN, type OperacionSync } from "..";
import { crearHarness, MODULO, MODULO_WORKFLOW, type OrdenesHarness } from "./harness";

// Permiso EXTENDIDO por el tenant para una transición extendida (no canónico).
const PERMISO_ESPERA = `${MODULO}.espera`;

const ALL = [
  ...new Set(officialServices().flatMap((s) => [...s.permissions])),
  `${MODULO}.read`, `${MODULO}.write`, `${MODULO}.operar`, `${MODULO}.validar`, `${MODULO}.admin`, PERMISO_ESPERA,
  `${MODULO_WORKFLOW}.read`, `${MODULO_WORKFLOW}.operar`, `${MODULO_WORKFLOW}.disenar`,
  "modulo.formularios.plantilla.read", "modulo.formularios.plantilla.write",
  "modulo.formularios.plantilla.publicar", "modulo.formularios.plantilla.admin",
  "modulo.formularios.respuesta.read", "modulo.formularios.respuesta.write", "modulo.formularios.respuesta.enviar",
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL, capacidades: ["*"] };
const LECTOR: Principal = { id: "lec-1", rol: "lector", permisos: [`${MODULO}.read`], capacidades: [] };
const VALIDADOR: Principal = { id: "val-1", rol: "validador", permisos: ALL, capacidades: ["*"] };

// Operador estándar: puede operar el ciclo (y el motor) pero NO tiene el permiso
// extendido `modulo.ordenes.espera`.
const PERMISOS_OPERADOR = [
  `${MODULO}.read`, `${MODULO}.write`, `${MODULO}.operar`,
  `${MODULO_WORKFLOW}.read`, `${MODULO_WORKFLOW}.operar`,
];
const OPERADOR: Principal = { id: "op-1", rol: "operador", permisos: PERMISOS_OPERADOR, capacidades: ["*"] };
const OPERADOR_ESPERA: Principal = { id: "op-2", rol: "operador", permisos: [...PERMISOS_OPERADOR, PERMISO_ESPERA], capacidades: ["*"] };

// Fake del puerto de Dynamic Forms con plantillas/respuestas registradas para
// las pruebas de asociación (validación de existencia/clase/versión/anclaje).
let fakePlantillas: FakePlantillas;
let rt: OrdenesHarness;
beforeEach(() => {
  fakePlantillas = new FakePlantillas()
    .registrarPlantilla({ clave: "form-1", version: 1, clase: "formulario", titulo: "Formulario 1" })
    .registrarPlantilla({ clave: "form-1", version: 2, clase: "formulario", titulo: "Formulario 1 v2" })
    .registrarPlantilla({ clave: "chk-1", version: 1, clase: "checklist", titulo: "Checklist 1" })
    .registrarRespuesta({ respuestaId: "resp-1", plantillaClave: "form-1", plantillaVersion: 2 });
  rt = crearHarness({ logger: new MemoryLogger(), plantillas: fakePlantillas });
});

const ctxOf = (t: string, p: Principal = ADMIN) => createExecutionContext({ principal: p, metadata: { tenantId: t } });
const exec = (ctx: ExecutionContext, cmd: string, input: unknown) => rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (ctx: ExecutionContext, q: string, input: unknown) => rt.platform.kernel.queries.execute(ctx, q, input);
const sincronizar = (ctx: ExecutionContext, ops: readonly OperacionSync[]) =>
  procesarCola(rt.platform, rt.adapters, ctx, ops);

async function crear(ctx: ExecutionContext, extra: Record<string, unknown> = {}) {
  const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva", ...extra });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string; estado: string; version: number };
}

async function avanzar(ctx: ExecutionContext, id: string, comandos: string[]) {
  for (const comando of comandos) {
    const r = await exec(ctx, `${MODULO}.transicionar`, { id, comando });
    if (!r.ok) throw new Error(`${comando}: ${r.error.message}`);
  }
}

describe("consecutivo configurable", () => {
  it("genera OT-000001, OT-000002 … con padding por defecto", async () => {
    const ctx = ctxOf("t1");
    expect((await crear(ctx)).codigo).toBe("OT-000001");
    expect((await crear(ctx)).codigo).toBe("OT-000002");
  });

  it("respeta prefijo/separador/padding de la configuración del tenant", async () => {
    const ctx = ctxOf("t-cfg");
    await exec(ctx, "platform.config.set", { key: `${MODULO}.codigo-prefijo`, value: "WRK" });
    await exec(ctx, "platform.config.set", { key: `${MODULO}.codigo-separador`, value: "/" });
    await exec(ctx, "platform.config.set", { key: `${MODULO}.codigo-padding`, value: "4" });
    expect((await crear(ctx)).codigo).toBe("WRK/0001");
  });
});

describe("catálogos configurables", () => {
  it("catálogo vacío admite tipo canónico", async () => {
    const ctx = ctxOf("t-cat");
    const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "preventiva" });
    expect(r.ok).toBe(true);
  });

  it("catálogo vacío rechaza tipo NO canónico", async () => {
    const ctx = ctxOf("t-cat2");
    const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "tipo-inventado" });
    expect(r.ok).toBe(false);
  });

  it("catálogo no vacío exige valor presente y habilitado", async () => {
    const ctx = ctxOf("t-cat3");
    await exec(ctx, `${MODULO}.catalogo.upsert`, { catalogo: "tipos", clave: "campana", etiqueta: "Campaña" });
    // 'campana' presente y habilitado
    expect((await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "campana" })).ok).toBe(true);
    // 'preventiva' ya no está en el catálogo (ahora no vacío) ⇒ rechazado
    expect((await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "preventiva" })).ok).toBe(false);
    // deshabilitar 'campana' ⇒ rechazado
    await exec(ctx, `${MODULO}.catalogo.habilitar`, { catalogo: "tipos", clave: "campana", habilitado: false });
    expect((await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "campana" })).ok).toBe(false);
  });

  it("expone opciones habilitadas del catálogo", async () => {
    const ctx = ctxOf("t-cat4");
    await exec(ctx, `${MODULO}.catalogo.upsert`, { catalogo: "prioridades", clave: "p1", etiqueta: "Alta", posicion: 1 });
    const r = await query(ctx, `${MODULO}.catalogo.opciones`, { catalogo: "prioridades" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as unknown[]).length).toBe(1);
  });
});

describe("ciclo de vida gobernado por Workflow Engine", () => {
  it("recorre BORRADOR→ABIERTA→…→EN_VALIDACION y cierra con aprobación", async () => {
    const ctx = ctxOf("t-wf");
    const { id } = await crear(ctx);
    await avanzar(ctx, id, ["abrir", "planificar", "asignar", "iniciar", "enviarValidacion"]);

    const cerrar = await exec(ctx, `${MODULO}.transicionar`, { id, comando: "cerrar" });
    expect(cerrar.ok).toBe(true);
    if (cerrar.ok) {
      expect((cerrar.value as { estado: string }).estado).toBe("EN_VALIDACION");
      expect((cerrar.value as { aprobacionPendiente: boolean }).aprobacionPendiente).toBe(true);
    }
    const ap = await exec(ctxOf("t-wf", VALIDADOR), `${MODULO}.aprobarCierre`, { id, decision: "aprobar" });
    expect(ap.ok).toBe(true);
    if (ap.ok) expect((ap.value as { estado: string }).estado).toBe("CERRADA");
  });

  it("rechazo de cierre devuelve a EN_EJECUCION", async () => {
    const ctx = ctxOf("t-wf2");
    const { id } = await crear(ctx);
    await avanzar(ctx, id, ["abrir", "planificar", "asignar", "iniciar", "enviarValidacion"]);
    await exec(ctx, `${MODULO}.transicionar`, { id, comando: "cerrar" });
    const rej = await exec(ctxOf("t-wf2", VALIDADOR), `${MODULO}.aprobarCierre`, { id, decision: "rechazar", motivo: "faltan evidencias" });
    expect(rej.ok).toBe(true);
    if (rej.ok) expect((rej.value as { estado: string }).estado).toBe("EN_EJECUCION");
  });

  it("pausar y reanudar la ejecución", async () => {
    const ctx = ctxOf("t-wf3");
    const { id } = await crear(ctx);
    await avanzar(ctx, id, ["abrir", "planificar", "asignar", "iniciar", "pausar"]);
    // `detalle` lee el AGGREGATE (no read model): el estado ya está sincronizado.
    const det = await query(ctx, `${MODULO}.detalle`, { id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { orden: { estado: string } }).orden.estado).toBe("PAUSADA");
    await avanzar(ctx, id, ["reanudarEjecucion"]);
  });

  it("cancelar desde un estado no final", async () => {
    const ctx = ctxOf("t-wf4");
    const { id } = await crear(ctx);
    await avanzar(ctx, id, ["abrir"]);
    // La cancelación es la operación estándar del motor: comando 'cancelar'.
    const r = await exec(ctx, `${MODULO}.transicionar`, { id, comando: "cancelar" });
    expect(r.ok, !r.ok ? r.error.message : "").toBe(true);
    if (r.ok) expect((r.value as { estado: string }).estado).toBe("CANCELADA");
  });
});

describe("formularios, checklists y evidencias", () => {
  it("asocia formulario y checklist anclados a versión (plantilla verificada)", async () => {
    const ctx = ctxOf("t-fc");
    const { id, version } = await crear(ctx);
    const f = await exec(ctx, `${MODULO}.asociarFormulario`, {
      id, expectedVersion: version, plantilla: { clave: "form-1", version: 2 },
    });
    expect(f.ok, !f.ok ? f.error.message : "").toBe(true);
    const c = await exec(ctx, `${MODULO}.asociarChecklist`, {
      id, expectedVersion: (f.ok && (f.value as { version: number }).version)!, plantilla: { clave: "chk-1", version: 1 },
    });
    expect(c.ok, !c.ok ? c.error.message : "").toBe(true);
  });

  it("rechaza asociar una plantilla INEXISTENTE", async () => {
    const ctx = ctxOf("t-fc-nx");
    const { id, version } = await crear(ctx);
    const f = await exec(ctx, `${MODULO}.asociarFormulario`, {
      id, expectedVersion: version, plantilla: { clave: "no-existe", version: 1 },
    });
    expect(f.ok).toBe(false);
  });

  it("rechaza una plantilla de CLASE incorrecta (checklist como formulario)", async () => {
    const ctx = ctxOf("t-fc-clase");
    const { id, version } = await crear(ctx);
    const f = await exec(ctx, `${MODULO}.asociarFormulario`, {
      id, expectedVersion: version, plantilla: { clave: "chk-1", version: 1 },
    });
    expect(f.ok).toBe(false);
  });

  it("rechaza una versión INCOMPATIBLE (fuera de N/N-1)", async () => {
    // La versión activa de form-1 es 2; asociar la versión 0/inexistente falla,
    // y una versión demasiado antigua respecto a la activa es incompatible.
    const ctx = ctxOf("t-fc-ver");
    fakePlantillas.registrarPlantilla({ clave: "form-1", version: 4, clase: "formulario" }); // activa = 4
    const { id, version } = await crear(ctx);
    // v2 con activa v4 ⇒ delta 2 (> N-1) ⇒ incompatible.
    const f = await exec(ctx, `${MODULO}.asociarFormulario`, {
      id, expectedVersion: version, plantilla: { clave: "form-1", version: 2 },
    });
    expect(f.ok).toBe(false);
  });

  it("ancla la RESPUESTA a la versión exacta de la plantilla", async () => {
    const ctx = ctxOf("t-fc-resp");
    const { id, version } = await crear(ctx);
    const f = await exec(ctx, `${MODULO}.asociarFormulario`, {
      id, expectedVersion: version, plantilla: { clave: "form-1", version: 2 }, respuestaId: "resp-1",
    });
    expect(f.ok, !f.ok ? f.error.message : "").toBe(true);
    if (f.ok) {
      const anc = (f.value as { respuesta: { respuestaId: string; version: number } | null }).respuesta;
      expect(anc).toEqual({ respuestaId: "resp-1", version: 2 });
    }
  });

  it("rechaza anclar una respuesta a una versión de plantilla que no coincide", async () => {
    const ctx = ctxOf("t-fc-resp2");
    const { id, version } = await crear(ctx);
    // resp-1 está anclada a v2; referir v1 ⇒ incoherente.
    const f = await exec(ctx, `${MODULO}.asociarFormulario`, {
      id, expectedVersion: version, plantilla: { clave: "form-1", version: 1 }, respuestaId: "resp-1",
    });
    expect(f.ok).toBe(false);
  });

  it("agrega evidencia (referencia a platform.attachment)", async () => {
    const ctx = ctxOf("t-ev");
    const { id, version } = await crear(ctx);
    const r = await exec(ctx, `${MODULO}.agregarEvidencia`, {
      id, expectedVersion: version,
      evidencia: { attachmentId: "att-1", nombreArchivo: "foto.jpg", mimeType: "image/jpeg", tamanoBytes: 2048, hashSha256: "b".repeat(64) },
    });
    expect(r.ok, !r.ok ? r.error.message : "").toBe(true);
    if (r.ok) expect((r.value as { evidencias: number }).evidencias).toBe(1);
  });
});

describe("offline-first · idempotencia por opId", () => {
  it("reintentar crear con el mismo opId no duplica ni consume secuencia", async () => {
    const ctx = ctxOf("t-off");
    const id = crypto.randomUUID();
    const r1 = await exec(ctx, `${MODULO}.crear`, { id, opId: "op-1", titulo: "OT", tipo: "correctiva" });
    expect(r1.ok).toBe(true);
    const r2 = await exec(ctx, `${MODULO}.crear`, { id, opId: "op-1", titulo: "OT", tipo: "correctiva" });
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect((r2.value as { idempotente: boolean }).idempotente).toBe(true);
      expect((r2.value as { codigo: string }).codigo).toBe((r1.value as { codigo: string }).codigo);
    }
    // segundo crear (nuevo) => siguiente consecutivo, sin salto por el reintento
    const r3 = await crear(ctx);
    expect(r3.codigo).toBe("OT-000002");
  });

  it("procesarCola sincroniza una cola offline con idempotencia", async () => {
    const ctx = ctxOf("t-sync");
    const id = crypto.randomUUID();
    const resumen = await sincronizar(ctx, [
      { opId: "s1", comando: "crear", input: { id, titulo: "OT sync", tipo: "correctiva" } },
      { opId: "s1", comando: "crear", input: { id, titulo: "OT sync", tipo: "correctiva" } }, // reintento
    ]);
    expect(resumen.total).toBe(2);
    expect(resumen.aplicadas).toBe(1);
    expect(resumen.idempotentes).toBe(1);
  });

  it("la creación offline exige id de cliente", async () => {
    const ctx = ctxOf("t-sync2");
    const resumen = await sincronizar(ctx, [{ opId: "s2", comando: "crear", input: { titulo: "x", tipo: "correctiva" } }]);
    expect(resumen.rechazadas).toBe(1);
  });

  it("aprobarCierre: reintento con mismo opId tras fallo parcial NO reaplica (idempotente)", async () => {
    const ctx = ctxOf("t-idem-ap");
    const { id } = await crear(ctx);
    await avanzar(ctx, id, ["abrir", "planificar", "asignar", "iniciar", "enviarValidacion"]);
    await exec(ctx, `${MODULO}.transicionar`, { id, comando: "cerrar" });

    const vctx = ctxOf("t-idem-ap", VALIDADOR);
    const ap1 = await exec(vctx, `${MODULO}.aprobarCierre`, { id, decision: "aprobar", opId: "ap-99" });
    expect(ap1.ok, !ap1.ok ? ap1.error.message : "").toBe(true);
    if (ap1.ok) expect((ap1.value as { estado: string }).estado).toBe("CERRADA");

    // Reintento con el MISMO opId: el motor y el recibo son idempotentes; no
    // hay doble aplicación ni inconsistencia de estado.
    const ap2 = await exec(vctx, `${MODULO}.aprobarCierre`, { id, decision: "aprobar", opId: "ap-99" });
    expect(ap2.ok, !ap2.ok ? ap2.error.message : "").toBe(true);
    if (ap2.ok) {
      expect((ap2.value as { idempotente: boolean }).idempotente).toBe(true);
      expect((ap2.value as { estado: string }).estado).toBe("CERRADA");
    }
  });
});

describe("lectura mínima del dominio (detalle sobre el aggregate)", () => {
  it("`detalle` devuelve el aggregate desde el repositorio (fuente de verdad)", async () => {
    const ctx = ctxOf("t-detalle");
    const { id, codigo } = await crear(ctx);
    const det = await query(ctx, `${MODULO}.detalle`, { id });
    expect(det.ok, !det.ok ? det.error.message : "").toBe(true);
    if (det.ok) {
      const orden = (det.value as { orden: { id: string; estado: string; codigo: { valor: string } } }).orden;
      expect(orden.id).toBe(id);
      expect(orden.estado).toBe("BORRADOR");
      expect(orden.codigo.valor).toBe(codigo);
    }
  });

  it("`detalle` de una OT inexistente ⇒ notFound", async () => {
    const ctx = ctxOf("t-detalle2");
    const det = await query(ctx, `${MODULO}.detalle`, { id: crypto.randomUUID() });
    expect(det.ok).toBe(false);
  });
});

describe("estados/transiciones extendidos por tenant (operables vía el motor)", () => {
  it("una OT ALCANZA un estado extendido de tenant y se refleja EN_ESPERA en el aggregate", async () => {
    const tenant = "t-ext-ok";
    // El tenant declara el estado neutro `enEspera` en el catálogo `estados` y la
    // extensión declarativa de la máquina (transiciones desde/hacia).
    rt.adapters.catalogos.registrarExtension(tenant, {
      estados: [{ nombre: "enEspera", etiqueta: "En espera" }],
      transiciones: [
        { de: "enEjecucion", comando: "ponerEnEspera", hacia: "enEspera" },
        { de: "enEspera", comando: "reanudarDesdeEspera", hacia: "enEjecucion" },
      ],
    });
    const ctx = ctxOf(tenant);
    // El catálogo `estados` debe declarar el estado (coherencia).
    await exec(ctx, `${MODULO}.catalogo.upsert`, { catalogo: "estados", clave: "enEspera", etiqueta: "En espera" });

    const { id } = await crear(ctx);
    // Transición real hasta enEjecución y luego al estado extendido.
    await avanzar(ctx, id, ["abrir", "planificar", "asignar", "iniciar", "ponerEnEspera"]);

    const det = await query(ctx, `${MODULO}.detalle`, { id });
    expect(det.ok, !det.ok ? det.error.message : "").toBe(true);
    if (det.ok) expect((det.value as { orden: { estado: string } }).orden.estado).toBe("EN_ESPERA");

    // Y puede volver por la transición extendida inversa.
    await avanzar(ctx, id, ["reanudarDesdeEspera"]);
    const det2 = await query(ctx, `${MODULO}.detalle`, { id });
    if (det2.ok) expect((det2.value as { orden: { estado: string } }).orden.estado).toBe("EN_EJECUCION");
  });

  it("divergencia catálogo/definición ⇒ error explícito (estado en catálogo sin transiciones)", async () => {
    const tenant = "t-ext-div";
    // El catálogo declara `enEspera` PERO la extensión NO lo introduce en la
    // definición ⇒ el estado sería inalcanzable ⇒ error de coherencia al componer
    // la definición activa (ocurre ya al crear, que asegura el workflow).
    const ctx = ctxOf(tenant);
    await exec(ctx, `${MODULO}.catalogo.upsert`, { catalogo: "estados", clave: "enEspera", etiqueta: "En espera" });
    const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message.toLowerCase()).toContain("estados");
  });

  it("divergencia inversa ⇒ error (estado en definición sin declarar en catálogo)", async () => {
    const tenant = "t-ext-div2";
    // La extensión introduce `enEspera` en la definición pero el catálogo NO lo
    // declara ⇒ error de coherencia.
    rt.adapters.catalogos.registrarExtension(tenant, {
      estados: [{ nombre: "enEspera" }],
      transiciones: [{ de: "enEjecucion", comando: "ponerEnEspera", hacia: "enEspera" }],
    });
    const ctx = ctxOf(tenant);
    const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva" });
    expect(r.ok).toBe(false);
  });

  it("cambiar el PERMISO de una transición extendida republica/activa y el motor aplica el permiso nuevo", async () => {
    const tenant = "t-ext-perm";
    const nDef = nombresDefinicion(MODULO_WORKFLOW);
    const sys = ctxOf(tenant); // ADMIN: puede publicar/activar/operar
    await exec(sys, `${MODULO}.catalogo.upsert`, { catalogo: "estados", clave: "enEspera", etiqueta: "En espera" });

    // v1 de la extensión: 'ponerEnEspera' exige el permiso operativo estándar.
    rt.adapters.catalogos.registrarExtension(tenant, {
      estados: [{ nombre: "enEspera", etiqueta: "En espera" }],
      transiciones: [{ de: "enEjecucion", comando: "ponerEnEspera", hacia: "enEspera", permiso: PERMISO_OPERAR }],
    });
    // Fuerza la publicación/activación de la definición v1 (crear asegura el WF).
    await crear(sys);
    const activaV1 = await query(sys, nDef.activa, { clave: WORKFLOW_ORDEN });
    const idV1 = activaV1.ok ? (activaV1.value as { id: string }).id : "";

    // v2 de la extensión: MISMA topología, PERMISO distinto en la transición.
    rt.adapters.catalogos.registrarExtension(tenant, {
      estados: [{ nombre: "enEspera", etiqueta: "En espera" }],
      transiciones: [{ de: "enEjecucion", comando: "ponerEnEspera", hacia: "enEspera", permiso: PERMISO_ESPERA }],
    });

    // Nueva OT ⇒ asegurarWorkflow detecta firma distinta ⇒ publica/activa v2.
    const { id } = await crear(sys);
    const activaV2 = await query(sys, nDef.activa, { clave: WORKFLOW_ORDEN });
    expect(activaV2.ok).toBe(true);
    if (activaV2.ok) {
      const rec = activaV2.value as { id: string; data: { definicion: { transiciones: { comando: string; permiso?: string }[] } } };
      // Se activó una definición DISTINTA (id derivado de la firma completa).
      expect(rec.id).not.toBe(idV1);
      // Y su transición extendida lleva el PERMISO NUEVO (no el antiguo).
      const tr = rec.data.definicion.transiciones.find((t) => t.comando === "ponerEnEspera");
      expect(tr?.permiso).toBe(PERMISO_ESPERA);
    }

    // La instancia de esta OT arranca bajo v2. Llevamos la OT a enEjecución.
    await avanzar(sys, id, ["abrir", "planificar", "asignar", "iniciar"]);

    // Enforcement: un operador SIN el permiso nuevo es RECHAZADO por el motor.
    const sinPermiso = ctxOf(tenant, OPERADOR);
    const rechazado = await exec(sinPermiso, `${MODULO}.transicionar`, { id, comando: "ponerEnEspera" });
    expect(rechazado.ok).toBe(false);
    // El estado NO cambió (el aggregate sigue en EN_EJECUCION).
    const detRechazo = await query(sys, `${MODULO}.detalle`, { id });
    if (detRechazo.ok) expect((detRechazo.value as { orden: { estado: string } }).orden.estado).toBe("EN_EJECUCION");

    // Enforcement: un operador CON el permiso nuevo es ACEPTADO.
    const conPermiso = ctxOf(tenant, OPERADOR_ESPERA);
    const aceptado = await exec(conPermiso, `${MODULO}.transicionar`, { id, comando: "ponerEnEspera" });
    expect(aceptado.ok, !aceptado.ok ? aceptado.error.message : "").toBe(true);
    const det = await query(sys, `${MODULO}.detalle`, { id });
    if (det.ok) expect((det.value as { orden: { estado: string } }).orden.estado).toBe("EN_ESPERA");
  });
});

describe("multitenancy y permisos", () => {
  it("aísla las OT por tenant (detalle cruzado ⇒ notFound)", async () => {
    const a = ctxOf("tenant-A");
    const b = ctxOf("tenant-B");
    const { id } = await crear(a);
    const detB = await query(b, `${MODULO}.detalle`, { id });
    expect(detB.ok).toBe(false);
  });

  it("un lector no puede crear (permiso write requerido)", async () => {
    const ctx = ctxOf("t-perm", LECTOR);
    const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva" });
    expect(r.ok).toBe(false);
  });

  it("sin tenant, toda operación falla (multitenancy obligatoria)", async () => {
    const ctx = createExecutionContext({ principal: ADMIN, metadata: {} });
    const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva" });
    expect(r.ok).toBe(false);
  });
});
