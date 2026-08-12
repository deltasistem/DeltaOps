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
import { createExecutionContext, type ExecutionContext, type Principal } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { crearOrdenesRuntime, FakeIdentidad, MODULO, ordenesModule, type OrdenesRuntime } from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

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
const tecnico = (mirrorId: string): Principal => ({ id: mirrorId, rol: "tecnico", permisos: ["modulo.ordenes.operar", "modulo.ordenes.read"], capacidades: [] });

suite("DGP-020.2 · Sesiones de trabajo · PostgreSQL", () => {
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
  const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

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

  beforeAll(() => {
    // Pool holgado: las lecturas de sesión (`getAbierta`, `tramosDe`, …) abren
    // una conexión propia MIENTRAS el comando mantiene abierta la UoW; con la
    // suite completa compartiendo el pool, un `max` pequeño podía provocar
    // contención/espera. Un margen amplio hace las lecturas deterministas.
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
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
});
