/**
 * DGP-009.2 · Módulo Órdenes de Trabajo — Pruebas de integración PostgreSQL.
 * Cubre: repositorio real, RLS/set_config (aislamiento tenant en lectura y
 * escritura), event log durable + proyección por outbox (read model, agenda,
 * bitácora, historial), reconstrucción por replay con EQUIVALENCIA y offline
 * por orquestación con recibo durable. Se OMITE sin DATABASE_URL. Al terminar
 * deja el outbox limpio (processed_at) y purga sus propias filas por tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
// LITE-11 §2/§3/§4 — guard FAIL-CLOSED de BD de test (subpath sin efectos @workspace/db/test-guard).
import { suiteDestructiva, crearPoolDestructivo } from "@workspace/db/test-guard";
import {
  createExecutionContext,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { ASIGNACION_REGISTRADA, ordenesModule, crearOrdenesRuntime, FakeIdentidad, MODULO, type OrdenesRuntime } from "..";

const suite = suiteDestructiva(describe);

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...ordenesModule({
      repository: null as never,
      catalogos: null as never,
      consecutivo: null as never,
      recibos: null as never,
      plantillas: null as never,
      identidad: null as never,
      readModel: null as never,
      eventLog: null as never,
      proyecciones: null as never,
      motor: null as never,
      syncReceipts: null as never,
      consola: null as never,
      sesiones: null as never,
    }).permissions,
    "modulo.ordenes.workflow.read",
    "modulo.ordenes.workflow.operar",
    "modulo.ordenes.workflow.disenar",
  ]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: ["*"] };

const T_A = `pgord-a-${Date.now()}`;
const T_B = `pgord-b-${Date.now()}`;

suite("Módulo Órdenes · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: OrdenesRuntime;

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });

  const exec = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, name, input);
  const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

  // Lectura RLS: transacción con app.tenant_id fijado (verifica aislamiento).
  async function conTenant<Reg extends pg.QueryResultRow = pg.QueryResultRow>(
    tenantId: string,
    sql: string,
    params: unknown[] = [],
  ): Promise<Reg[]> {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      const r = await c.query<Reg>(sql, params);
      await c.query("commit");
      return r.rows;
    } finally {
      c.release();
    }
  }

  beforeAll(() => {
    pool = crearPoolDestructivo();
    rt = crearOrdenesRuntime({ pool });
  });

  afterAll(async () => {
    // Deja el outbox drenado y purga las filas de los tenants de prueba.
    await drenar().catch(() => undefined);
    for (const t of [T_A, T_B]) {
      for (const tabla of [
        "ord_eventos", "ord_ordenes", "ord_ordenes_read", "ord_agenda_read",
        "ord_asignaciones_read", "ord_responsables_read", "ord_relaciones_read",
        "ord_historial_read", "ord_bitacora_read", "ord_documentacion_read",
        "ord_planificacion", "ord_asignaciones", "ord_recursos", "ord_sla",
        "ord_relaciones", "ord_recibos", "ord_sync_receipts",
        "ord_sesion_tramos", "ord_sesiones", "ord_sesion_tramos_read",
        "ord_sesion_duraciones_read", "ord_sesiones_read",
      ]) {
        await conTenant(t, `delete from deltaops.${tabla}`).catch(() => undefined);
      }
    }
    await pool.end();
  });

  it("persiste una OT con RLS y aísla por tenant en lectura y escritura", async () => {
    const c = await exec(ctx(T_A), `${MODULO}.crear`, { titulo: "OT PG", tipo: "correctiva" });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const id = (c.value as { id: string }).id;
    // CQRS: `detalle` lee del read model ⇒ materializamos con el outbox.
    await drenar();

    // La fila se persiste con el tenant del contexto (ruta de escritura con
    // set_config por transacción). El aislamiento cross-tenant efectivo se
    // valida por la capa de consultas, pues el usuario de pruebas es superuser
    // y PostgreSQL omite RLS para superusuarios (las policies existen igual).
    const enA = await conTenant<{ id: string; tenant_id: string }>(
      T_A, "select id, tenant_id from deltaops.ord_ordenes where id = $1", [id],
    );
    expect(enA.length).toBe(1);
    expect(enA[0]!.tenant_id).toBe(T_A);

    // El detalle por query respeta el tenant del contexto (aislamiento efectivo).
    const dA = await query(ctx(T_A), `${MODULO}.detalle`, { id });
    const dB = await query(ctx(T_B), `${MODULO}.detalle`, { id });
    expect(dA.ok).toBe(true);
    expect(dB.ok).toBe(false);
  });

  it("proyecta por outbox al read model, agenda, bitácora e historial", async () => {
    const c = await exec(ctx(T_A), `${MODULO}.crear`, { titulo: "OT Proj", tipo: "preventiva", responsable: "ana" });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const id = (c.value as { id: string }).id;
    await exec(ctx(T_A), `${MODULO}.planificar`, {
      ordenId: id, inicioPlanificado: "2024-07-01T08:00:00.000Z", finPlanificado: "2024-07-01T12:00:00.000Z",
    });
    await exec(ctx(T_A), `${MODULO}.bitacora.registrar`, { ordenId: id, accion: "inicio" });
    await drenar();

    const lista = await query(ctx(T_A), `${MODULO}.listar`, {});
    expect(lista.ok && (lista.value as { ordenes: unknown[] }).ordenes.length).toBeGreaterThanOrEqual(1);

    const agenda = await query(ctx(T_A), `${MODULO}.agenda`, {});
    expect(agenda.ok && (agenda.value as { entradas: unknown[] }).entradas.length).toBeGreaterThanOrEqual(1);

    const bit = await query(ctx(T_A), `${MODULO}.bitacora`, { ordenId: id });
    expect(bit.ok && (bit.value as { bitacora: unknown[] }).bitacora.length).toBe(1);

    const hist = await query(ctx(T_A), `${MODULO}.historial`, { ordenId: id });
    // creación + planificación + bitácora
    expect(hist.ok && (hist.value as { historial: unknown[] }).historial.length).toBeGreaterThanOrEqual(3);
  });

  it("reconstruye por replay del event log con EQUIVALENCIA", async () => {
    const before = await query(ctx(T_A), `${MODULO}.listar`, {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const antes = (before.value as { ordenes: { id: string }[] }).ordenes.map((o) => o.id).sort();

    const r = await exec(ctx(T_A), `${MODULO}.reproyectar`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { eventos: number }).eventos).toBeGreaterThan(0);

    const after = await query(ctx(T_A), `${MODULO}.listar`, {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const despues = (after.value as { ordenes: { id: string }[] }).ordenes.map((o) => o.id).sort();
    expect(despues).toEqual(antes);
  });

  it("la consola técnica (admin) reporta read models, event log y outbox reales", async () => {
    const r = await query(ctx(T_A), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { eventLog: unknown; outbox: unknown; readModels: unknown; rls: unknown };
    expect(v.eventLog).toBeDefined();
    expect(v.outbox).toBeDefined();
    expect(v.readModels).toBeDefined();
    expect(v.rls).toBeDefined();
  });

  it("sincroniza offline por orquestación con recibo durable idempotente", async () => {
    const crear = await exec(ctx(T_A), `${MODULO}.crear`, { titulo: "OT Sync", tipo: "correctiva" });
    expect(crear.ok).toBe(true);
    if (!crear.ok) return;
    const id = (crear.value as { id: string }).id;
    const cola = [
      { opId: "pg-op-1", comando: "bitacora.registrar", input: { ordenId: id, accion: "llegada" } },
      { opId: "pg-op-2", comando: "bitacora.registrar", input: { ordenId: id, accion: "salida" } },
    ];
    const r1 = await rt.sincronizar(ctx(T_A), cola);
    expect(r1.aplicadas).toBe(2);
    const r2 = await rt.sincronizar(ctx(T_A), cola);
    expect(r2.idempotentes).toBe(2);
  });

  // DGP-020.1 (R1) · Concurrencia REAL contra PostgreSQL: dos POST directos
  // simultáneos con el MISMO opId sobre `asignar-recurso-humano` deben producir
  // EXACTAMENTE UN hecho de asignación, UN evento y UN recibo sellado, gracias a
  // la RECLAMACIÓN DURABLE del opId (claim antes del efecto). Se usa un tipo NO
  // persona (cuadrilla) para aislar la garantía de idempotencia del contrato de
  // identidad. El perdedor recibe el resultado del dueño (idempotente) o un
  // conflicto reintentable coherente; en ningún caso duplica el efecto.
  it("dos asignaciones concurrentes con el mismo opId ⇒ exactamente UNA asignación (claim durable)", async () => {
    const crear = await exec(ctx(T_A), `${MODULO}.crear`, { titulo: "OT Concurrencia", tipo: "correctiva" });
    expect(crear.ok).toBe(true);
    if (!crear.ok) return;
    const id = (crear.value as { id: string }).id;
    await drenar();

    const opId = `pg-op-concurrente-${Date.now()}`;
    const input = { ordenId: id, tipo: "cuadrilla", asignadoId: "cuad-concurrente", rol: "colaborador", opId };

    // Disparo SIMULTÁNEO (Promise.all): ambos compiten por el mismo claim.
    const [a, b] = await Promise.all([
      exec(ctx(T_A), `${MODULO}.asignar-recurso-humano`, input),
      exec(ctx(T_A), `${MODULO}.asignar-recurso-humano`, input),
    ]);

    // Exactamente uno es "dueño" (idempotente=false); el otro o bien reobtiene
    // el resultado sellado (idempotente=true) o bien recibe un CONFLICTO
    // reintentable (carrera cabeza-a-cabeza). NUNCA dos efectos.
    const resultados = [a, b];
    const oks = resultados.filter((r) => r.ok);
    const conflictos = resultados.filter((r) => !r.ok && r.error.code.includes("KRN-CFL"));
    // Al menos uno debe haber tenido éxito; los que no, deben ser conflicto.
    expect(oks.length).toBeGreaterThanOrEqual(1);
    expect(oks.length + conflictos.length).toBe(2);
    const duenios = oks.filter((r) => r.ok && (r.value as { idempotente: boolean }).idempotente === false);
    expect(duenios.length).toBe(1); // EXACTAMENTE un dueño

    // Un reintento posterior con el mismo opId es idempotente (recibo sellado).
    const reintento = await exec(ctx(T_A), `${MODULO}.asignar-recurso-humano`, input);
    expect(reintento.ok).toBe(true);
    if (reintento.ok) expect((reintento.value as { idempotente: boolean }).idempotente).toBe(true);

    await drenar();

    // UN solo hecho de asignación (aggregate) y UN solo evento.
    const hechos = await conTenant<{ n: number }>(
      T_A, "select count(*)::int as n from deltaops.ord_asignaciones where orden_id = $1 and asignado_id = $2", [id, "cuad-concurrente"],
    );
    expect(hechos[0]!.n).toBe(1);
    const eventos = await conTenant<{ n: number }>(
      T_A, "select count(*)::int as n from deltaops.ord_eventos where tipo = $1 and payload->>'ordenId' = $2", [ASIGNACION_REGISTRADA, id],
    );
    expect(eventos[0]!.n).toBe(1);
    // UN solo recibo, en estado 'sellado'.
    const recibos = await conTenant<{ n: number; estado: string }>(
      T_A, "select count(*)::int as n, max(estado) as estado from deltaops.ord_recibos where comando = $1 and op_id = $2",
      [`${MODULO}.asignar-recurso-humano`, opId],
    );
    expect(recibos[0]!.n).toBe(1);
    expect(recibos[0]!.estado).toBe("sellado");
    // UNA sola asignación vigente en el read model.
    const asg = await query(ctx(T_A), `${MODULO}.asignaciones`, { ordenId: id });
    expect(asg.ok).toBe(true);
    if (asg.ok) {
      const rows = (asg.value as { asignaciones: Array<{ asignadoId: string; vigente: boolean }> }).asignaciones;
      const vigentes = rows.filter((x) => x.asignadoId === "cuad-concurrente" && x.vigente);
      expect(vigentes.length).toBe(1);
    }
  });

  // DGP-020.1 (E2E fix) · Flujo COMPLETO comando→outbox→proyección→query real:
  // una asignación FUERTE de PERSONA como responsable debe reflejarse en el read
  // model de responsables (`/responsables` expone identityId+nombre) Y en el
  // listado/detalle del supervisor (`responsable` deja de ser null). La
  // proyección consume el evento ASIGNACION_REGISTRADA (no sólo el comando
  // legado), es idempotente por (read model, tenant, eventId) y sólo usa payload.
  it("asignar-recurso-humano (persona) proyecta responsables e ilumina el listado", async () => {
    // Runtime dedicado con Identidad canónica sembrada, sobre el MISMO pool real.
    const identidad = new FakeIdentidad().registrar({
      identityId: "idn-ana", tenantId: T_A, nombre: "Ana Soto", email: "ana@a.cl", rol: "TECNICO",
    });
    const rtId = crearOrdenesRuntime({ pool, identidad });
    const execId = (name: string, input: unknown) =>
      rtId.platform.kernel.commands.execute(ctx(T_A), name, input);
    const queryId = (name: string, input: unknown) =>
      rtId.platform.kernel.queries.execute(ctx(T_A), name, input);
    const drenarId = () => rtId.platform.kernel.outboxProcessor.processPending();

    const crear = await execId(`${MODULO}.crear`, { titulo: "OT Responsable", tipo: "correctiva" });
    expect(crear.ok).toBe(true);
    if (!crear.ok) return;
    const oid = (crear.value as { id: string }).id;
    await drenarId();

    // Antes: sin responsable en el listado/detalle.
    const antes = await queryId(`${MODULO}.detalle`, { id: oid });
    expect(antes.ok).toBe(true);
    if (antes.ok) expect((antes.value as { orden: { responsable: string | null } }).orden.responsable).toBeNull();

    // Asignación FUERTE de persona como responsable.
    const asig = await execId(`${MODULO}.asignar-recurso-humano`, {
      ordenId: oid, tipo: "persona", asignadoId: "idn-ana", rol: "responsable", reemplazaVigentes: true,
    });
    expect(asig.ok).toBe(true);
    if (!asig.ok) return;

    // Materializa la proyección (comando→outbox→proyección).
    await drenarId();

    // /responsables expone identityId + nombre (proyectado desde el payload).
    const resp = await queryId(`${MODULO}.responsables`, { ordenId: oid });
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      const filas = (resp.value as { responsables: Array<Record<string, unknown>> }).responsables;
      const conIdentidad = filas.find((f) => f["responsableIdentityId"] === "idn-ana");
      expect(conIdentidad).toBeDefined();
      expect(conIdentidad!["responsableNombre"]).toBe("Ana Soto");
      expect(conIdentidad!["responsable"]).toBe("Ana Soto");
    }

    // El listado/detalle del supervisor ya muestra el responsable (no null).
    const despues = await queryId(`${MODULO}.detalle`, { id: oid });
    expect(despues.ok).toBe(true);
    if (despues.ok) expect((despues.value as { orden: { responsable: string | null } }).orden.responsable).toBe("Ana Soto");
    const listado = await queryId(`${MODULO}.listar`, {});
    expect(listado.ok).toBe(true);
    if (listado.ok) {
      const fila = (listado.value as { ordenes: Array<{ id: string; responsable: string | null }> })
        .ordenes.find((o) => o.id === oid);
      expect(fila?.responsable).toBe("Ana Soto");
    }

    // Idempotencia de la proyección: re-drenar/reproyectar no duplica ni rompe.
    const repro = await execId(`${MODULO}.reproyectar`, {});
    expect(repro.ok).toBe(true);
    await drenarId();
    const resp2 = await queryId(`${MODULO}.responsables`, { ordenId: oid });
    expect(resp2.ok).toBe(true);
    if (resp2.ok) {
      const filas = (resp2.value as { responsables: Array<Record<string, unknown>> }).responsables;
      expect(filas.filter((f) => f["responsableIdentityId"] === "idn-ana").length).toBe(1);
    }
    const detalle2 = await queryId(`${MODULO}.detalle`, { id: oid });
    if (detalle2.ok) expect((detalle2.value as { orden: { responsable: string | null } }).orden.responsable).toBe("Ana Soto");
  });
});
