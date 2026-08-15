/**
 * DGP-020.2 · Sesiones de trabajo — Pruebas de integración PostgreSQL.
 * Cubre: apertura/pausa/reanudación/cierre con RLS, tramos APPEND-ONLY como
 * fuente de verdad de la duración, read models CQRS de sesión/tramos/duraciones,
 * identityId SIEMPRE del contexto (rechazo si NO está asignado), activoId
 * derivado de la OT, idempotencia por opId, invariante de una sola sesión
 * abierta (índice único parcial), bordes huérfanos ⇒ negocio (no 500),
 * aislamiento cross-tenant y equivalencia de duraciones tras REPLAY.
 * Se OMITE sin DATABASE_URL. Purga sus filas por tenant al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
// LITE-11 §2/§3/§4 — guard FAIL-CLOSED de BD de test (subpath sin efectos @workspace/db/test-guard).
import { suiteDestructiva, crearPoolDestructivo } from "@workspace/db/test-guard";
import { createExecutionContext, type ExecutionContext, type Principal } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { crearOrdenesRuntime, FakeIdentidad, MODULO, ordenesModule, type OrdenesRuntime } from "..";

const suite = suiteDestructiva(describe);

const PERMS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...ordenesModule({
      repository: null as never, catalogos: null as never, consecutivo: null as never,
      recibos: null as never, plantillas: null as never, identidad: null as never,
      readModel: null as never, eventLog: null as never, proyecciones: null as never,
      motor: null as never, syncReceipts: null as never, consola: null as never, sesiones: null as never,
    }).permissions,
    "modulo.ordenes.workflow.read", "modulo.ordenes.workflow.operar", "modulo.ordenes.workflow.disenar",
  ]),
];

// Tenants ÚNICOS por corrida (sufijo aleatorio): elimina cualquier residuo de
// corridas previas interrumpidas y descarta colisiones entre archivos/reintentos.
const RUN = crypto.randomUUID().slice(0, 8);
const T_A = `pgses-a-${RUN}`;
const T_B = `pgses-b-${RUN}`;
// Identidad CANÓNICA (idn_identities.identity_id) — ÚNICA por corrida.
const TEC = `tec-1-${RUN}`;
const OTRO = `tec-2-${RUN}`;
// IDs ESPEJO legacy (deltaops.users.id) — DISTINTOS del canónico a propósito,
// para probar que la atribución jamás usa el mirror sino metadata.identityId.
const MIRROR_TEC = "1001";
const MIRROR_OTRO = "1002";

// Admin (capacidades `*`) para preparar OT/asignaciones. Su `principal.id` es un
// ID ESPEJO legacy DISTINTO del identityId canónico (modela el gap DGP-020.1).
const ADMIN: Principal = { id: "999", rol: "admin", permisos: PERMS, capacidades: ["*"] };
// Técnico: SÓLO operar, sin capacidades de supervisor (obliga a validar asignación).
// `principal.id` = ID ESPEJO legacy (entero) ≠ identityId canónico (UUID/idn).
// Modela el principal que `principalOrdenes` construye para TECNICO/PLANIFICADOR:
// puede operar pero NO tiene `modulo.ordenes.validar` ni capacidad administrativa
// ⇒ `esSupervisorOAdmin` es false ⇒ debe estar asignado para abrir sesión (§6).
const tecnico = (mirrorId: string): Principal => ({ id: mirrorId, rol: "tecnico", permisos: ["modulo.ordenes.operar", "modulo.ordenes.read"], capacidades: [] });
// PLANIFICADOR: idéntico plano de operación al técnico (sin capacidades admin).
// El bug §27/§38 era que el mapeo legacy le colaba `modulo.ordenes.validar`.
const planificador = (mirrorId: string): Principal => ({ id: mirrorId, rol: "planificador", permisos: ["modulo.ordenes.operar", "modulo.ordenes.read"], capacidades: [] });
// SUPERVISOR: excepción §6 — capacidad EXISTENTE `validar-ordenes` habilita el
// bypass legítimo de asignación (mismo principal que `principalOrdenes` da a SUPERVISOR).
const supervisor = (mirrorId: string): Principal => ({ id: mirrorId, rol: "supervisor", permisos: ["modulo.ordenes.operar", "modulo.ordenes.read", "modulo.ordenes.validar"], capacidades: ["validar-ordenes"] });

// Timeout explícito para ESTA suite de integración PG: cada test hace decenas de
// idas y vueltas SECUENCIALES contra PostgreSQL (crear OT, transiciones del motor,
// asignación, comandos de sesión y drenajes del outbox COMPARTIDO). Contra una BD
// remota/compartida bajo contención cruzada (p.ej. la suite api-server en paralelo)
// esa latencia acumulada puede superar el testTimeout por defecto de 5 s de Vitest
// sin que exista fallo funcional alguno. 30 s da margen holgado y determinista; el
// resto de patrones de integración PG del repo hacen lo propio.
suite("DGP-020.2 · Sesiones de trabajo · PostgreSQL", { timeout: 30_000 }, () => {
  let pool: pg.Pool;
  let rt: OrdenesRuntime;

  // La identidad CANÓNICA se inyecta por metadata.identityId (como hace el
  // api-server desde req.session.identityId), NUNCA se toma de principal.id.
  const ctx = (tenantId: string, p: Principal = ADMIN, identityId?: string): ExecutionContext =>
    createExecutionContext({
      principal: p,
      metadata: identityId ? { tenantId, identityId } : { tenantId },
    });
  // Contexto de un TÉCNICO: principal con ID espejo + identidad canónica en metadata.
  const ctxTec = (tenantId: string, canonId: string): ExecutionContext =>
    ctx(tenantId, tecnico(canonId === TEC ? MIRROR_TEC : MIRROR_OTRO), canonId);
  const exec = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.queries.execute(c, name, input);
  /**
   * Drena el outbox de forma DETERMINISTA: `processPending` reclama como mucho
   * un lote (batchSize=50) por llamada, así que una sola invocación NO garantiza
   * que los eventos de ESTE test queden proyectados cuando el `deltaops.kernel_outbox`
   * COMPARTIDO acumula pendientes de otros files/suites (o cuando un procesador
   * concurrente arrebata parte del lote vía `FOR UPDATE SKIP LOCKED`). Iteramos
   * hasta que un ciclo no procese nada, con un tope de seguridad para no colgarnos
   * si otro procesador va drenando en paralelo. Así las aserciones sobre read
   * models (duraciones, idempotencia, replay) leen SIEMPRE un estado asentado.
   */
  const drenar = async () => {
    let last: Awaited<ReturnType<typeof rt.platform.kernel.outboxProcessor.processPending>> | undefined;
    for (let i = 0; i < 40; i += 1) {
      last = await rt.platform.kernel.outboxProcessor.processPending();
      if (!last.ok) return last;
      if (last.value.processed === 0 && last.value.failed === 0) break;
    }
    return last!;
  };

  async function conTenant<R extends pg.QueryResultRow = pg.QueryResultRow>(t: string, sql: string, params: unknown[] = []): Promise<R[]> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('app.tenant_id', $1, true)", [t]);
      const r = await c.query<R>(sql, params);
      await c.query("commit");
      return r.rows;
    } finally { c.release(); }
  }

  /**
   * Crea una OT, la lleva a un estado que ADMITE registrar trabajo (fuera de
   * BORRADOR, sin que la sesión mute la OT) y asigna una identidad-persona.
   */
  async function otAsignada(tenantId: string, identityId: string): Promise<string> {
    const c = await exec(ctx(tenantId), `${MODULO}.crear`, { titulo: "OT sesión", tipo: "correctiva" });
    if (!c.ok) throw new Error(`crear OT falló: ${c.error.message}`);
    const id = (c.value as { id: string }).id;
    await drenar(); // asienta la proyección/outbox de `crear` antes de transicionar.
    // BORRADOR → ABIERTA → PLANIFICADA → ASIGNADA (vía Workflow Engine, no la sesión).
    // El motor sincroniza el estado en UoW separada; drenamos tras cada paso para
    // que el siguiente `findById`/instancia lea un estado ya asentado (determinista).
    for (const comando of ["abrir", "planificar", "asignar"]) {
      const t = await exec(ctx(tenantId), `${MODULO}.transicionar`, { id, comando });
      if (!t.ok) throw new Error(`transición ${comando} de OT ${id} en ${tenantId} falló: ${t.error.message}`);
      await drenar();
    }
    const a = await exec(ctx(tenantId), `${MODULO}.asignar-recurso-humano`, {
      ordenId: id, tipo: "persona", asignadoId: identityId,
    });
    if (!a.ok) throw new Error(`asignar falló: ${a.error.message}`);
    await drenar();
    return id;
  }

  /**
   * Igual que `otAsignada` pero la OT nace CON activo principal, para verificar
   * la derivación del `activoId` (§8): el dominio lo toma del agregado, jamás del
   * frontend. Devuelve { ordenId, activoId }.
   */
  async function otAsignadaConActivo(tenantId: string, identityId: string, activoId: string): Promise<{ ordenId: string; activoId: string }> {
    const c = await exec(ctx(tenantId), `${MODULO}.crear`, {
      titulo: "OT sesión con activo", tipo: "correctiva",
      activoPrincipal: { activoId, entityRef: `activo:${activoId}` },
    });
    if (!c.ok) throw new Error(`crear OT c/activo falló: ${c.error.message}`);
    const id = (c.value as { id: string }).id;
    await drenar();
    for (const comando of ["abrir", "planificar", "asignar"]) {
      const t = await exec(ctx(tenantId), `${MODULO}.transicionar`, { id, comando });
      if (!t.ok) throw new Error(`transición ${comando} falló: ${t.error.message}`);
      await drenar();
    }
    const a = await exec(ctx(tenantId), `${MODULO}.asignar-recurso-humano`, { ordenId: id, tipo: "persona", asignadoId: identityId });
    if (!a.ok) throw new Error(`asignar falló: ${a.error.message}`);
    await drenar();
    return { ordenId: id, activoId };
  }

  beforeAll(() => {
    // Pool holgado: las lecturas de sesión (`getAbierta`, `tramosDe`, …) abren
    // una conexión propia MIENTRAS el comando mantiene abierta la UoW; con la
    // suite completa compartiendo el pool, un `max` pequeño podía provocar
    // contención/espera. Un margen amplio hace las lecturas deterministas.
    pool = crearPoolDestructivo();
    const identidad = new FakeIdentidad();
    for (const t of [T_A, T_B]) {
      identidad.registrar({ identityId: TEC, tenantId: t, nombre: "Tec Uno", email: "tec1@e.co" });
      identidad.registrar({ identityId: OTRO, tenantId: t, nombre: "Tec Dos", email: "tec2@e.co" });
    }
    rt = crearOrdenesRuntime({ pool, identidad });
  });

  afterAll(async () => {
    await drenar().catch(() => undefined);
    for (const t of [T_A, T_B]) {
      for (const tabla of [
        "ord_sesion_tramos", "ord_sesiones", "ord_sesion_tramos_read", "ord_sesion_duraciones_read", "ord_sesiones_read",
        "ord_asignaciones", "ord_asignaciones_read", "ord_eventos", "ord_ordenes", "ord_ordenes_read",
        "ord_agenda_read", "ord_historial_read", "ord_bitacora_read", "ord_recibos", "ord_sync_receipts",
      ]) {
        await conTenant(t, `delete from deltaops.${tabla}`).catch(() => undefined);
      }
    }
    await pool.end();
  });

  it("abre/pausa/reanuda/cierra y deriva la duración SÓLO de los tramos", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    const t0 = "2024-03-01T08:00:00Z";
    const t1 = "2024-03-01T08:30:00Z"; // pausa tras 30m
    const t2 = "2024-03-01T08:45:00Z"; // reanuda tras 15m pausa
    const t3 = "2024-03-01T09:15:00Z"; // cierra tras 30m trabajo

    const abrir = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.abrir`, { ordenId, ocurridoAt: t0, opId: "op-abrir-1" });
    expect(abrir.ok).toBe(true);
    if (!abrir.ok) return;
    const sesionId = (abrir.value as { sesionId: string }).sesionId;
    expect((abrir.value as { activoId: string | null }).activoId).toBeNull(); // OT sin activo ⇒ derivado null
    expect((abrir.value as { identityId: string }).identityId).toBe(TEC);

    // Cada comando de sesión es una petición INDEPENDIENTE en el mundo real
    // (HTTP o worker de /sync): drenamos el outbox entre pasos para reproducir
    // fronteras de petición deterministas (evita acoplarse al orden de vaciado
    // del outbox cuando la suite completa comparte el pool y el procesador).
    await drenar();
    expect((await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.pausar`, { ordenId, ocurridoAt: t1, opId: "op-pausar-1" })).ok).toBe(true);
    await drenar();
    expect((await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.reanudar`, { ordenId, ocurridoAt: t2, opId: "op-reanudar-1" })).ok).toBe(true);
    await drenar();
    expect((await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.cerrar`, { ordenId, ocurridoAt: t3, opId: "op-cerrar-1" })).ok).toBe(true);
    await drenar();

    // Fuente de verdad: 4 tramos append-only.
    const tramos = await conTenant<{ n: string }>(T_A, "select count(*)::int as n from deltaops.ord_sesion_tramos where sesion_id=$1", [sesionId]);
    expect(Number(tramos[0]!.n)).toBe(4);

    // Read model de duraciones (el cliente NO calcula).
    const dur = await query(ctxTec(T_A, TEC), `${MODULO}.sesion.duraciones`, { sesionId });
    expect(dur.ok).toBe(true);
    if (!dur.ok) return;
    const d = (dur.value as { duraciones: { efectivoMs: number; pausadoMs: number; transcurridoMs: number; pausas: number; abierta: boolean } }).duraciones;
    expect(d.efectivoMs).toBe(60 * 60_000);   // 30m + 30m
    expect(d.pausadoMs).toBe(15 * 60_000);    // 15m
    expect(d.transcurridoMs).toBe(75 * 60_000);
    expect(d.pausas).toBe(1);
    expect(d.abierta).toBe(false);
  });

  it("rechaza abrir si el identityId (del ctx) NO está asignado a la OT (403 negocio)", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    const r = await exec(ctxTec(T_A, OTRO), `${MODULO}.sesion.abrir`, { ordenId, opId: "op-noasig" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toContain("KRN-AUTH");
  });

  it("§6/§27 · PLANIFICADOR no asignado NO puede abrir sesión (rechazo de negocio, sin bypass)", async () => {
    // Regresión del bug E2E: un planificador (rol canónico PLANIFICADOR ⇒ operador
    // legacy) NO tiene capacidades administrativas, así que NO salta la verificación
    // de asignación. OT asignada a TEC; el planificador (OTRO) no está asignado.
    const ordenId = await otAsignada(T_A, TEC);
    const ctxPlan = ctx(T_A, planificador(MIRROR_OTRO), OTRO);
    const r = await exec(ctxPlan, `${MODULO}.sesion.abrir`, { ordenId, opId: "op-plan-noasig" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toContain("KRN-AUTH"); // 403 de negocio
  });

  it("§6 · TECNICO no asignado NO puede abrir sesión (rechazo de negocio)", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    // OTRO es técnico y NO está asignado a la OT (sólo TEC lo está).
    const r = await exec(ctx(T_A, tecnico(MIRROR_OTRO), OTRO), `${MODULO}.sesion.abrir`, { ordenId, opId: "op-tec-noasig" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toContain("KRN-AUTH");
  });

  it("§6 · SUPERVISOR NO asignado SÍ puede abrir sesión (excepción por capacidad existente)", async () => {
    // La OT está asignada a TEC; el supervisor (OTRO) NO está asignado, pero su
    // capacidad EXISTENTE `validar-ordenes` habilita el bypass legítimo (§6).
    const ordenId = await otAsignada(T_A, TEC);
    const r = await exec(ctx(T_A, supervisor(MIRROR_OTRO), OTRO), `${MODULO}.sesion.abrir`, { ordenId, opId: "op-sup-noasig" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { identityId: string }).identityId).toBe(OTRO);
    await drenar();
  });

  it("§6 · ADMINISTRADOR NO asignado SÍ puede abrir sesión (capacidad `*`)", async () => {
    // ADMIN tiene capacidades `*` (TENANT_ADMIN/SUPER_ADMIN). Identidad canónica OTRO.
    const ordenId = await otAsignada(T_A, TEC);
    const r = await exec(ctx(T_A, ADMIN, OTRO), `${MODULO}.sesion.abrir`, { ordenId, opId: "op-adm-noasig" });
    expect(r.ok).toBe(true);
    await drenar();
  });

  it("FALLA CERRADO si el contexto no trae identidad canónica (login legacy)", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    // ctx SIN metadata.identityId (sólo principal con ID espejo): no debe abrir
    // ni atribuir al ID espejo; error de negocio, nunca 500.
    const r = await exec(ctx(T_A, tecnico(MIRROR_TEC)), `${MODULO}.sesion.abrir`, { ordenId, opId: "op-sin-identidad" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toContain("KRN-AUTH");
      expect(r.error.code).not.toContain("KRN-INT");
    }
  });

  it("la falta de identidad se evalúa ANTES que la OT (AUTH tiene precedencia sobre NF)", async () => {
    // OT INEXISTENTE + ctx SIN identidad canónica ⇒ debe ganar el fallo cerrado
    // por identidad (KRN-AUTH), NO KRN-NF de la OT (determinismo del orden §R2).
    const r = await exec(ctx(T_A, tecnico(MIRROR_TEC)), `${MODULO}.sesion.abrir`, { ordenId: "ot-inexistente-xyz", opId: "op-orden-precedencia" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toContain("KRN-AUTH");
      expect(r.error.code).not.toContain("KRN-NF");
    }
  });

  it("no permite DOS sesiones abiertas por (tenant, OT, identidad) — índice único parcial", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    const a = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.abrir`, { ordenId, opId: "dup-1" });
    expect(a.ok).toBe(true);
    const b = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.abrir`, { ordenId, opId: "dup-2" });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error.code).toContain("KRN-CFL");
    await drenar();
  });

  it("bordes huérfanos (pausar/reanudar/cerrar sin sesión) ⇒ negocio, nunca 500", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    for (const accion of ["pausar", "reanudar", "cerrar"] as const) {
      const r = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.${accion}`, { ordenId, opId: `huerfano-${accion}` });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).not.toContain("KRN-INT");
    }
  });

  it("idempotencia por opId: reintentar abrir devuelve el recibo sin duplicar tramos", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    const a1 = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.abrir`, { ordenId, opId: "idem-1" });
    expect(a1.ok).toBe(true);
    const a2 = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.abrir`, { ordenId, opId: "idem-1" });
    expect(a2.ok).toBe(true);
    await drenar();
    if (!a1.ok) return;
    const sesionId = (a1.value as { sesionId: string }).sesionId;
    const tramos = await conTenant<{ n: string }>(T_A, "select count(*)::int as n from deltaops.ord_sesion_tramos where sesion_id=$1", [sesionId]);
    expect(Number(tramos[0]!.n)).toBe(1);
  });

  it("aísla las sesiones por tenant (una consulta en T_B no ve las de T_A)", async () => {
    const ordenId = await otAsignada(T_B, TEC);
    const abrir = await exec(ctxTec(T_B, TEC), `${MODULO}.sesion.abrir`, { ordenId, opId: "iso-b" });
    expect(abrir.ok).toBe(true);
    await drenar();
    const enB = await query(ctxTec(T_B, TEC), `${MODULO}.sesiones`, { ordenId });
    expect(enB.ok).toBe(true);
    if (enB.ok) expect((enB.value as { sesiones: unknown[] }).sesiones.length).toBe(1);
    // La capa de consultas aplica el filtro por tenant: bajo T_A la OT de T_B no
    // aparece (el usuario de pruebas es superuser y PG omite RLS para superusers,
    // por lo que el aislamiento efectivo se valida por la capa de consultas).
    const enA = await query(ctxTec(T_A, TEC), `${MODULO}.sesiones`, { ordenId });
    expect(enA.ok).toBe(true);
    if (enA.ok) expect((enA.value as { sesiones: unknown[] }).sesiones.length).toBe(0);
  });

  it("reproyección por replay reconstruye read models de sesión con EQUIVALENCIA", async () => {
    const ordenId = await otAsignada(T_A, TEC);
    const abrir = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.abrir`, { ordenId, ocurridoAt: "2024-04-01T10:00:00Z", opId: "rep-abrir" });
    expect(abrir.ok).toBe(true);
    if (!abrir.ok) return;
    const sesionId = (abrir.value as { sesionId: string }).sesionId;
    await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.cerrar`, { ordenId, ocurridoAt: "2024-04-01T11:00:00Z", opId: "rep-cerrar" });
    await drenar();

    const antes = await query(ctxTec(T_A, TEC), `${MODULO}.sesion.duraciones`, { sesionId });
    expect(antes.ok).toBe(true);

    const rep = await exec(ctx(T_A), `${MODULO}.reproyectar`, {});
    expect(rep.ok).toBe(true);
    await drenar();

    const despues = await query(ctxTec(T_A, TEC), `${MODULO}.sesion.duraciones`, { sesionId });
    expect(despues.ok).toBe(true);
    if (antes.ok && despues.ok) {
      const da = (antes.value as { duraciones: { efectivoMs: number } }).duraciones;
      const dd = (despues.value as { duraciones: { efectivoMs: number } }).duraciones;
      expect(dd.efectivoMs).toBe(da.efectivoMs);
      expect(dd.efectivoMs).toBe(60 * 60_000);
    }
  });

  it("§8 · deriva y CONSERVA el activoId de la OT (respuesta, cabecera fuente-de-verdad y read models)", async () => {
    const ACTIVO = `activo-${RUN}`;
    const { ordenId } = await otAsignadaConActivo(T_A, TEC, ACTIVO);

    // (1) La respuesta del comando trae el activoId DERIVADO de la OT (no null).
    const abrir = await exec(ctxTec(T_A, TEC), `${MODULO}.sesion.abrir`, { ordenId, ocurridoAt: "2024-05-01T08:00:00Z", opId: "act-abrir" });
    expect(abrir.ok).toBe(true);
    if (!abrir.ok) return;
    const sesionId = (abrir.value as { sesionId: string; activoId: string | null }).sesionId;
    expect((abrir.value as { activoId: string | null }).activoId).toBe(ACTIVO);
    await drenar();

    // (2) Cabecera FUENTE DE VERDAD: `ord_sesiones.activo_id` persistido.
    const cab = await conTenant<{ activo_id: string | null }>(T_A, "select activo_id from deltaops.ord_sesiones where id=$1", [sesionId]);
    expect(cab[0]?.activo_id).toBe(ACTIVO);

    // (3) Read model CQRS `ord_sesiones_read` (vía capa de consultas por OT).
    const porOrden = await query(ctxTec(T_A, TEC), `${MODULO}.sesiones`, { ordenId });
    expect(porOrden.ok).toBe(true);
    if (porOrden.ok) {
      const s = (porOrden.value as { sesiones: { activoId: string | null }[] }).sesiones[0];
      expect(s?.activoId).toBe(ACTIVO);
    }

    // (4) La sesión es localizable POR activo (índice del read model por activo).
    const porActivo = await query(ctxTec(T_A, TEC), `${MODULO}.sesiones`, { activoId: ACTIVO });
    expect(porActivo.ok).toBe(true);
    if (porActivo.ok) {
      const rows = (porActivo.value as { sesiones: { sesionId?: string; activoId: string | null }[] }).sesiones;
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.every((r) => r.activoId === ACTIVO)).toBe(true);
    }

    // (5) Read model de duraciones (`ord_sesion_duraciones_read`) conserva el activoId.
    const dur = await query(ctxTec(T_A, TEC), `${MODULO}.sesion.duraciones`, { sesionId });
    expect(dur.ok).toBe(true);
    if (dur.ok) expect((dur.value as { duraciones: { activoId: string | null } }).duraciones.activoId).toBe(ACTIVO);
    await drenar();
  });
});
