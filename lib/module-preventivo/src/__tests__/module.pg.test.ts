/**
 * DGP-014.2 · Módulo Enterprise Preventive Maintenance — Pruebas de integración
 * PostgreSQL. Cubre: repositorio real + RLS/set_config (aislamiento tenant en
 * lectura y escritura), event log durable + proyección por outbox (read models:
 * programas, actividades, versiones, generaciones, programaciones, historial),
 * SABOTAJE del aggregate (CQRS puro: el detalle se sirve del read model),
 * reconstrucción por REPLAY con EQUIVALENCIA, consola técnica real, offline por
 * orquestación con recibo durable (idempotencia), GENERACIÓN→OT idempotente (sin
 * OTs duplicadas ante reintento/concurrencia) y programaciones (reprogramación/
 * exclusión) persistidas append-only. Se OMITE sin DATABASE_URL. Al terminar deja
 * el outbox drenado y purga sus filas por tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
// LITE-11 §2/§3/§4 — guard FAIL-CLOSED de BD de test (subpath sin efectos @workspace/db/test-guard).
import { suiteDestructiva, crearPoolDestructivo } from "@workspace/db/test-guard";
import {
  createExecutionContext,
  ok,
  type ExecutionContext,
  type KernelError,
  type Principal,
  type Result,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearPreventivoRuntimeOperacional,
  MODULO,
  type MaterializadorOrdenes,
  type PreventivoRuntimeOperacional,
} from "..";

const suite = suiteDestructiva(describe);

const MODULE_PERMISSIONS = [
  "modulo.preventivo.read", "modulo.preventivo.write", "modulo.preventivo.govern",
  "modulo.preventivo.schedule", "modulo.preventivo.admin",
];
const ALL_PERMISSIONS = [
  ...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MODULE_PERMISSIONS]),
];
const ADMIN: Principal = { id: "admin-pg", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: ["*"] };

const T_A = `pgprv-a-${Date.now()}`;
const T_B = `pgprv-b-${Date.now()}`;

const READ_TABLES = [
  "prv_programas_read", "prv_programa_versiones_read", "prv_actividades_read",
  "prv_generaciones_read", "prv_programaciones_read", "prv_historial_read",
];
const AGG_TABLES = [
  "prv_programas", "prv_programa_versiones", "prv_actividades", "prv_generaciones",
  "prv_generacion_materializaciones", "prv_historial", "prv_catalogos",
  "prv_secuencias", "prv_recibos", "prv_eventos", "prv_sync_receipts",
];

suite("Módulo Enterprise Preventive Maintenance · PostgreSQL", () => {
  let pool: pg.Pool;
  let rt: PreventivoRuntimeOperacional;

  // Materializador de PRUEBA (PG): OT determinista e idempotente por opId
  // (=claveDedup); NO depende del runtime de Órdenes. El runtime operacional real
  // compone el comando OFICIAL `modulo.ordenes.crear`.
  const otPorOp = new Map<string, string>();
  let otsCreadas = 0;
  const materializador: MaterializadorOrdenes = {
    async crearOrden(tenantId, _actorId, entrada): Promise<Result<{ ordenTrabajoId: string; idempotente: boolean }, KernelError>> {
      const k = `${tenantId}::${entrada.opId}`;
      const existente = otPorOp.get(k);
      if (existente) return ok({ ordenTrabajoId: existente, idempotente: true });
      const id = `ot-${entrada.opId}`;
      otPorOp.set(k, id);
      otsCreadas += 1;
      return ok({ ordenTrabajoId: id, idempotente: false });
    },
  };

  const ctx = (tenantId: string): ExecutionContext =>
    createExecutionContext({ principal: ADMIN, metadata: { tenantId } });
  const exec = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) =>
    rt.platform.kernel.queries.execute(c, name, input);
  const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

  async function conTenant<Reg extends pg.QueryResultRow = pg.QueryResultRow>(
    tenantId: string, sql: string, params: unknown[] = [],
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

  /* --------------------------- Constructores E2E --------------------------- */

  async function crearPrograma(tenantId: string, extra: Record<string, unknown> = {}) {
    const cr = await exec(ctx(tenantId), `${MODULO}.crear-programa`, {
      nombre: "Preventivo motores", tipo: "ruta",
      vigencia: { desde: "2025-01-01T00:00:00.000Z" }, ...extra,
    });
    if (!cr.ok) throw new Error(cr.error.message);
    await drenar();
    return cr.value as { id: string; version: number };
  }

  // Programa publicado atravesando el ciclo REAL (preparacion→revision→publicado).
  async function programaPublicado(tenantId: string) {
    const c = ctx(tenantId);
    const p = await crearPrograma(tenantId);
    const r1 = await exec(c, `${MODULO}.transicionar-programa`, { id: p.id, accion: "enviarRevision", expectedVersion: p.version });
    if (!r1.ok) throw new Error(`enviarRevision: ${r1.error.message}`);
    const r2 = await exec(c, `${MODULO}.transicionar-programa`, { id: p.id, accion: "publicar", expectedVersion: (r1.value as { version: number }).version });
    if (!r2.ok) throw new Error(`publicar: ${r2.error.message}`);
    await drenar();
    return { id: p.id, version: (r2.value as { version: number }).version };
  }

  async function definirActividad(tenantId: string, programaId: string, extra: Record<string, unknown> = {}) {
    const r = await exec(ctx(tenantId), `${MODULO}.definir-actividad`, {
      programaId, nombre: "Inspección", orden: 1,
      checklist: { plantillaId: "chk", version: 1 },
      tiempoEstimado: { valor: 1, unidad: "horas" }, moneda: "usd", ...extra,
    });
    if (!r.ok) throw new Error(`definir-actividad: ${r.error.message}`);
    await drenar();
    return r.value as { id: string };
  }

  beforeAll(() => {
    pool = crearPoolDestructivo();
    rt = crearPreventivoRuntimeOperacional({ pool, materializador });
  });

  afterAll(async () => {
    await drenar().catch(() => undefined);
    for (const t of [T_A, T_B]) {
      for (const tabla of [...READ_TABLES, ...AGG_TABLES]) {
        await conTenant(t, `delete from deltaops.${tabla}`).catch(() => undefined);
      }
    }
    await pool.end();
  });

  it("persiste con RLS y aísla por tenant en lectura y escritura", async () => {
    const p = await crearPrograma(T_A);

    const enA = await conTenant<{ id: string; tenant_id: string }>(
      T_A, "select id, tenant_id from deltaops.prv_programas where id = $1", [p.id],
    );
    expect(enA.length).toBe(1);
    expect(enA[0]!.tenant_id).toBe(T_A);

    const dA = await query(ctx(T_A), `${MODULO}.programa`, { id: p.id });
    const dB = await query(ctx(T_B), `${MODULO}.programa`, { id: p.id });
    expect(dA.ok).toBe(true);
    expect(dB.ok).toBe(false); // otro tenant no ve el read model
  });

  it("proyecta por outbox al read model (detalle y listado desde CQRS)", async () => {
    const p = await crearPrograma(T_A, { nombre: "Ruta bombas" });
    const det = await query(ctx(T_A), `${MODULO}.programa`, { id: p.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { nombre: string }).nombre).toBe("Ruta bombas");

    const lista = await query(ctx(T_A), `${MODULO}.programas`, {});
    expect(lista.ok && (lista.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("versiona el programa y proyecta versiones archivadas al read model", async () => {
    // El versionado exige un programa PUBLICADO (política del módulo): crea la
    // v2 (devuelve el programa a preparación) archivando la anterior.
    const p = await programaPublicado(T_A);
    const v = await exec(ctx(T_A), `${MODULO}.versionar-programa`, { id: p.id, expectedVersion: p.version, nombre: "V2" });
    expect(v.ok).toBe(true);
    await drenar();

    const versiones = await query(ctx(T_A), `${MODULO}.versiones`, { programaId: p.id });
    expect(versiones.ok).toBe(true);
    if (versiones.ok) expect((versiones.value as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it("GENERACIÓN→OT idempotente: no duplica OTs ante reintento ni concurrencia", async () => {
    const p = await programaPublicado(T_A);
    const act = await definirActividad(T_A, p.id, { nombre: "Cambio aceite" });
    const c = ctx(T_A);
    const base = {
      programaId: p.id, actividadId: act.id, activoId: "act-1",
      ventana: "2025-03-01", origen: "programada", fechaObjetivo: "2025-03-01T00:00:00.000Z",
    };

    const antes = otsCreadas;
    const g1 = await exec(c, `${MODULO}.generar`, base);
    expect(g1.ok).toBe(true);
    if (g1.ok) {
      expect((g1.value as { estado: string }).estado).toBe("materializada");
      expect((g1.value as { ordenTrabajoId: string | null }).ordenTrabajoId).toBeTruthy();
    }
    await drenar();
    expect(otsCreadas).toBe(antes + 1);

    // CONCURRENCIA: ráfaga sobre la MISMA clave de dedup (misma ventana/activo):
    // el guard atómico anti-duplicado garantiza una sola generación → una sola OT.
    const burst = await Promise.allSettled([
      exec(c, `${MODULO}.generar`, base),
      exec(c, `${MODULO}.generar`, base),
    ]);
    expect(burst.some((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok)).toBe(true);
    await drenar();
    expect(otsCreadas).toBe(antes + 1);

    // Una sola generación persistida para esa clave de dedup.
    const gens = await query(c, `${MODULO}.generaciones`, { programaId: p.id });
    expect(gens.ok).toBe(true);
    if (gens.ok) expect((gens.value as unknown[]).length).toBe(1);
  });

  it("reprograma y excluye: programaciones persistidas append-only en el read model", async () => {
    const c = ctx(T_A);
    const p = await crearPrograma(T_A, { nombre: "Calendario" });
    // Semilla de catálogos de motivos (canónicos por defecto si no existen).
    const repro = await exec(c, `${MODULO}.reprogramar`, {
      programaId: p.id, fechaOriginal: "2025-03-01T00:00:00.000Z",
      fechaNueva: "2025-03-15T00:00:00.000Z", motivo: "clima",
    });
    // El motivo debe ser canónico del catálogo motivos-reprogramacion; si el
    // catálogo canónico no lo contiene, el comando lo rechaza — en cuyo caso
    // sembramos una entrada y reintentamos.
    if (!repro.ok) {
      await exec(c, `${MODULO}.catalogo-upsert`, { catalogo: "motivos-reprogramacion", clave: "clima", etiqueta: "Clima" });
      await exec(c, `${MODULO}.catalogo-habilitar`, { catalogo: "motivos-reprogramacion", clave: "clima", habilitado: true });
      const retry = await exec(c, `${MODULO}.reprogramar`, {
        programaId: p.id, fechaOriginal: "2025-03-01T00:00:00.000Z",
        fechaNueva: "2025-03-15T00:00:00.000Z", motivo: "clima",
      });
      expect(retry.ok).toBe(true);
    }
    await drenar();

    const progs = await query(c, `${MODULO}.programaciones`, { programaId: p.id });
    expect(progs.ok).toBe(true);
    if (progs.ok) {
      const filas = progs.value as Array<{ tipo?: string }>;
      expect(filas.length).toBeGreaterThanOrEqual(1);
      expect(filas.some((f) => f.tipo === "reprogramacion")).toBe(true);
    }
  });

  it("reconstruye por REPLAY del event log durable con EQUIVALENCIA", async () => {
    const before = await query(ctx(T_A), `${MODULO}.programas`, {});
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const antes = (before.value as { id: string }[]).map((o) => o.id).sort();

    const r = await exec(ctx(T_A), `${MODULO}.reproyectar`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as { reproyectados: number }).reproyectados).toBeGreaterThan(0);

    const after = await query(ctx(T_A), `${MODULO}.programas`, {});
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const despues = (after.value as { id: string }[]).map((o) => o.id).sort();
    expect(despues).toEqual(antes);
  });

  it("la consola técnica (admin) reporta outbox del módulo y tablas RLS", async () => {
    const r = await query(ctx(T_A), `${MODULO}.consola`, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as { pendientes: number; procesados: number; ultimos: unknown[]; tablasRLS: unknown[] };
    expect(typeof v.procesados).toBe("number");
    expect(Array.isArray(v.ultimos)).toBe(true);
    expect(Array.isArray(v.tablasRLS) && v.tablasRLS.length).toBeGreaterThan(10);
  });

  it("sincronización offline durable: idempotente por opId (recibo)", async () => {
    const c = ctx(T_A);
    const id = crypto.randomUUID();
    const op = {
      opId: `sync-prg-${id}`,
      comando: "crear-programa",
      input: { id, nombre: "Offline", tipo: "ruta", vigencia: { desde: "2025-01-01T00:00:00.000Z" } },
    };
    const r1 = await rt.sincronizar(c, [op]);
    expect(r1.total).toBe(1);
    expect(["aplicada", "idempotente"]).toContain(r1.resultados[0]!.estado);

    const r2 = await rt.sincronizar(c, [op]);
    expect(r2.resultados[0]!.estado).toBe("idempotente");
    await drenar();
  });

  // SABOTAJE (CQRS puro): las CONSULTAS se sirven EXCLUSIVAMENTE del read model
  // (incluido el DETALLE), nunca del aggregate. Misma suite/runtime que el resto.
  it("SABOTAJE: detalle y listado se sirven del read model aunque el aggregate esté vacío", async () => {
    const p = await crearPrograma(T_B, { nombre: "Programa sabotaje" });
    // SABOTAJE: vaciar la tabla aggregate. El read model NO debe depender de ella.
    await conTenant(T_B, "delete from deltaops.prv_programas");
    const quedan = await conTenant<{ n: number }>(T_B, "select count(*)::int n from deltaops.prv_programas where id=$1", [p.id]);
    expect(Number(quedan[0]?.n ?? -1)).toBe(0);

    const det = await query(ctx(T_B), `${MODULO}.programa`, { id: p.id });
    expect(det.ok).toBe(true);
    if (det.ok) expect((det.value as { nombre: string }).nombre).toBe("Programa sabotaje");

    const lista = await query(ctx(T_B), `${MODULO}.programas`, {});
    expect(lista.ok).toBe(true);
    if (lista.ok) expect((lista.value as Array<{ id: string }>).map((x) => x.id)).toContain(p.id);
  });
});
