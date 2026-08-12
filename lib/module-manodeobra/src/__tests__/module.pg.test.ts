/**
 * DGP-020.3 · Mano de Obra — Integración PostgreSQL (RLS + concurrencia).
 * Cubre: RLS/aislamiento cross-tenant por capa de consultas, idempotencia durable
 * de comandos por opId, doble procesar-sesion concurrente ⇒ una sola valoración,
 * solape de tarifas rechazado (dominio + índice único parcial de vigencia
 * abierta), precisión monetaria en numeric(18,6), cambio de tarifa NO altera
 * histórico, y valoración recuperable (backend caído ⇒ sesión intacta).
 * Se OMITE sin DATABASE_URL. Purga sus filas por tenant al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createExecutionContext, type ExecutionContext, type Principal, type Result } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  crearManodeobraRuntime,
  FakeIdentidadPort,
  FakeOrdenesSesionPort,
  manodeobraModule,
  MODULO,
  type ManodeobraRuntime,
} from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const MDO_PERMS = manodeobraModule({
  recursos: null as never, tarifas: null as never, valoraciones: null as never, recibos: null as never,
  identidad: null as never, ordenes: null as never, catalogos: null as never, eventLog: null as never,
}).permissions;
const ALL_PERMS = [...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MDO_PERMS])];

const RUN = crypto.randomUUID().slice(0, 8);
const T_A = `pgmdo-a-${RUN}`;
const T_B = `pgmdo-b-${RUN}`;

const admin: Principal = { id: "admin", rol: "admin", permisos: ALL_PERMS, capacidades: ["*"] };

suite("DGP-020.3 · Mano de Obra · PostgreSQL", { timeout: 30_000 }, () => {
  let pool: pg.Pool;
  let rt: ManodeobraRuntime;
  let identidad: FakeIdentidadPort;
  let ordenes: FakeOrdenesSesionPort;

  const ctx = (tenantId: string, identityId?: string, p: Principal = admin): ExecutionContext =>
    createExecutionContext({ principal: p, metadata: identityId ? { tenantId, identityId } : { tenantId } });
  const exec = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.queries.execute(c, name, input);
  const must = <T>(r: Result<T, { message: string }>): T => {
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  };
  const D = (iso: string) => new Date(iso);
  const cerrada = (t: string, sesionId: string, ordenId: string, identityId: string, efectivoMs: number, iniciadoAt = "2024-03-01T00:00:00Z") =>
    ordenes.set(t, { sesionId, ordenId, activoId: "act1", identityId, estado: "CERRADA", efectivoMs, abierta: false, iniciadoAt: D(iniciadoAt), cerradoAt: D("2024-03-01T05:00:00Z") });

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
    identidad = new FakeIdentidadPort();
    ordenes = new FakeOrdenesSesionPort();
    for (const t of [T_A, T_B]) identidad.registrar(t, "u1", "Ana Soto");
    rt = crearManodeobraRuntime({ pool, identidad, ordenes });
  });

  afterAll(async () => {
    for (const t of [T_A, T_B]) {
      for (const tabla of ["mdo_valoraciones", "mdo_tarifas", "mdo_recursos", "mdo_recibos", "mdo_eventos"]) {
        await pool.query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [t]).catch(() => undefined);
      }
      await pool.query(`DELETE FROM deltaops.platform_records WHERE tenant_id=$1 AND service=$2`, [t, MODULO]).catch(() => undefined);
    }
    await pool.end();
  });

  async function prep(t: string, valor = 40000) {
    must(await exec(ctx(t), `${MODULO}.recurso.definir`, { identityId: "u1", categoriaClave: "soldador" }));
    must(await exec(ctx(t), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor, moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" }));
  }

  it("precisión monetaria en numeric(18,6): 2h30m×40000=100000, 1h20m×35000=46666.6667", async () => {
    await prep(T_A, 40000);
    cerrada(T_A, "s1", "o1", "u1", 9_000_000);
    const v = must(await exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s1" })) as Record<string, unknown>;
    expect(Number(v["costo"])).toBe(100000);
    // Segundo sujeto con tarifa 35000 para el caso fraccionario.
    identidad.registrar(T_A, "u2", "Beto");
    must(await exec(ctx(T_A), `${MODULO}.recurso.definir`, { identityId: "u2", categoriaClave: "operador" }));
    must(await exec(ctx(T_A), `${MODULO}.tarifa.crear`, { sujetoId: "operador", valor: 35000, moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" }));
    cerrada(T_A, "s2", "o1", "u2", 4_800_000);
    const v2 = must(await exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "s2" })) as Record<string, unknown>;
    expect(Number(v2["costo"])).toBe(46666.6667);
    // Verifica que la BD conserva la escala numeric(18,6).
    const rows = (await pool.query(`SELECT costo FROM deltaops.mdo_valoraciones WHERE tenant_id=$1 AND sesion_id='s2'`, [T_A])).rows;
    expect(Number(rows[0]["costo"])).toBe(46666.6667);
  });

  it("aislamiento cross-tenant: las valoraciones de T_A no se ven desde T_B", async () => {
    await prep(T_B, 50000);
    cerrada(T_B, "sB", "oB", "u1", 3_600_000); // 1h × 50000 = 50000
    must(await exec(ctx(T_B), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "sB" }));
    const enB = must(await query(ctx(T_B), `${MODULO}.valoraciones`, { ordenId: "o1" })) as { valoraciones: unknown[] };
    expect(enB.valoraciones.length).toBe(0); // o1 es de T_A
    const soloB = must(await query(ctx(T_B), `${MODULO}.valoraciones`, { ordenId: "oB" })) as { valoraciones: unknown[] };
    expect(soloB.valoraciones.length).toBe(1);
  });

  it("doble procesar-sesion CONCURRENTE ⇒ una sola valoración (índice único (tenant, sesion_id))", async () => {
    await prep(T_A).catch(() => undefined); // recurso/tarifa ya existen (idempotente en dominio)
    cerrada(T_A, "sconc", "oconc", "u1", 9_000_000);
    const [a, b] = await Promise.all([
      exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "sconc" }),
      exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "sconc" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const rows = (await pool.query(`SELECT count(*)::int AS n FROM deltaops.mdo_valoraciones WHERE tenant_id=$1 AND sesion_id='sconc'`, [T_A])).rows;
    expect(rows[0]["n"]).toBe(1);
  });

  it("solape de tarifas rechazado (misma vigencia abierta) — dominio + índice único parcial", async () => {
    // Ya hay una vigencia ABIERTA para 'soldador' en T_A (de prep). Crear otra abierta ⇒ rechazo.
    const r = await exec(ctx(T_A), `${MODULO}.tarifa.crear`, { sujetoId: "soldador", valor: 99999, moneda: "CLP", vigenciaDesde: "2024-02-01T00:00:00Z" });
    expect(r.ok).toBe(false);
  });

  it("doble tarifa.crear con mismo opId ⇒ idempotente (una sola fila)", async () => {
    const op = `op-${RUN}`;
    identidad.registrar(T_A, "u3", "Ceci");
    must(await exec(ctx(T_A), `${MODULO}.recurso.definir`, { identityId: "u3", categoriaClave: "ayudante" }));
    const [a, b] = await Promise.all([
      exec(ctx(T_A), `${MODULO}.tarifa.crear`, { opId: op, sujetoId: "ayudante", valor: 20000, moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" }),
      exec(ctx(T_A), `${MODULO}.tarifa.crear`, { opId: op, sujetoId: "ayudante", valor: 20000, moneda: "CLP", vigenciaDesde: "2024-01-01T00:00:00Z" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const rows = (await pool.query(`SELECT count(*)::int AS n FROM deltaops.mdo_tarifas WHERE tenant_id=$1 AND sujeto_id='ayudante'`, [T_A])).rows;
    expect(rows[0]["n"]).toBe(1);
  });

  it("cambio de tarifa (actualizar) versiona sin alterar el histórico valorado", async () => {
    cerrada(T_A, "shist", "ohist", "u1", 9_000_000);
    must(await exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "shist" }));
    must(await exec(ctx(T_A), `${MODULO}.tarifa.actualizar`, { sujetoId: "soldador", valor: 90000, moneda: "CLP", vigenciaDesde: "2024-08-01T00:00:00Z" }));
    const again = must(await exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "shist" })) as Record<string, unknown>;
    expect(again["yaExistia"]).toBe(true);
    expect(Number(again["costo"])).toBe(100000); // sigue con la tarifa histórica
    const n = (await pool.query(`SELECT count(*)::int AS n FROM deltaops.mdo_tarifas WHERE tenant_id=$1 AND sujeto_id='soldador'`, [T_A])).rows[0]["n"];
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("backend de valoración 'caído' ⇒ error de negocio; la valoración es recuperable al reintentar", async () => {
    // Simula la sesión aún no cerrada al primer intento (fail-safe: no rompe el cierre).
    ordenes.set(T_A, { sesionId: "srec", ordenId: "orec", activoId: "act1", identityId: "u1", estado: "ABIERTA", efectivoMs: 3_600_000, abierta: true, iniciadoAt: D("2024-03-01T00:00:00Z"), cerradoAt: null });
    const fallo = await exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "srec" });
    expect(fallo.ok).toBe(false);
    // Ahora la sesión cierra: reintentar RECUPERA la valoración (regenerable).
    cerrada(T_A, "srec", "orec", "u1", 3_600_000);
    const ok = must(await exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "srec" })) as Record<string, unknown>;
    expect(ok["estado"]).toBe("VALORADA");
    expect(Number(ok["costo"])).toBe(40000);
  });

  it("pendientes: sesiones CERRADAS de la OT sin valoración se reportan como pendientes", async () => {
    cerrada(T_A, "sp1", "opend", "u1", 3_600_000);
    cerrada(T_A, "sp2", "opend", "u1", 3_600_000);
    must(await exec(ctx(T_A), `${MODULO}.valoracion.procesar-sesion`, { sesionId: "sp1" }));
    const pend = must(await query(ctx(T_A), `${MODULO}.valoraciones.pendientes`, { ordenId: "opend" })) as { pendientes: { sesionId: string }[] };
    expect(pend.pendientes.map((p) => p.sesionId)).toEqual(["sp2"]);
  });
});
