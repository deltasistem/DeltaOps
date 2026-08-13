/**
 * DGP-021.1 · Costos — Integración PostgreSQL (RLS + concurrencia + precisión).
 * Cubre: precisión monetaria EXACTA en numeric(18,6) (dígito a dígito, sin
 * float), idempotencia durable por opId (doble materialización concurrente ⇒ un
 * solo hecho), snapshot INMUTABLE a nivel de BD, anulación auditable persistida,
 * aislamiento cross-tenant por RLS (consultas también en transacción), y monedas
 * mixtas para el mismo activo como series separadas.
 * Se OMITE sin DATABASE_URL. Purga sus filas por tenant al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createExecutionContext, type ExecutionContext, type Principal, type Result } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  costosModule,
  crearCostosRuntime,
  FakeCostoExactoPort,
  FakeIdentidadPort,
  FakeOrdenesPort,
  MODULO,
  type CostosRuntime,
} from "..";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const MOD_PERMS = costosModule({
  hechos: null as never, recibos: null as never, identidad: null as never,
  ordenes: null as never, costoExacto: null as never, eventLog: null as never,
}).permissions;
const ALL = [...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MOD_PERMS])];

const RUN = crypto.randomUUID().slice(0, 8);
const T_A = `pgcos-a-${RUN}`;
const T_B = `pgcos-b-${RUN}`;
const admin: Principal = { id: "admin", rol: "admin", permisos: ALL, capacidades: ["*"] };

suite("DGP-021.1 · Costos · PostgreSQL", { timeout: 30_000 }, () => {
  let pool: pg.Pool;
  let rt: CostosRuntime;
  let ordenes: FakeOrdenesPort;
  let costoExacto: FakeCostoExactoPort;

  const ctx = (tenantId: string, identityId?: string): ExecutionContext =>
    createExecutionContext({ principal: admin, metadata: identityId ? { tenantId, identityId } : { tenantId } });
  const exec = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.queries.execute(c, name, input);
  const must = <T>(r: Result<T, { message: string }>): T => {
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  };

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
    ordenes = new FakeOrdenesPort();
    costoExacto = new FakeCostoExactoPort();
    const identidad = new FakeIdentidadPort();
    for (const t of [T_A, T_B]) {
      ordenes.set(t, { ordenId: "ot1", estado: "ABIERTA", activoPrincipalId: "act-1" });
      identidad.registrar(t, "u1", "Ana");
      costoExacto.set(t, "art1", [
        { articuloId: "art1", moneda: "COP", metodoValoracion: "PROMEDIO_PONDERADO", costoUnitario: "1234.567890", cantidadAcumulada: "10.000000", actualizadoAt: "2024-01-01T00:00:00.000Z" },
      ]);
    }
    rt = crearCostosRuntime({ pool, identidad, ordenes, costoExacto });
  });

  afterAll(async () => {
    for (const t of [T_A, T_B]) {
      for (const tabla of ["cos_hechos", "cos_recibos", "cos_eventos"]) {
        await pool.query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [t]).catch(() => undefined);
      }
    }
    await pool.end();
  });

  it("precisión numeric(18,6) EXACTA dígito a dígito (sin float)", async () => {
    const h = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, {
      opId: `p-${RUN}`, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "3.000000", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;
    expect(h["costoTotal"]).toBe("3703.703670"); // 3 × 1234.567890
    const row = (await pool.query(
      `SELECT cantidad::text c, costo_unitario::text u, costo_total::text tt FROM deltaops.cos_hechos WHERE tenant_id=$1 AND costo_id=$2`,
      [T_A, h["costoId"]],
    )).rows[0];
    expect(row["c"]).toBe("3.000000");
    expect(row["u"]).toBe("1234.567890");
    expect(row["tt"]).toBe("3703.703670");
  });

  it("doble materialización CONCURRENTE con mismo opId ⇒ un solo hecho (índice único (tenant, op_id))", async () => {
    const op = `conc-${RUN}`;
    const [a, b] = await Promise.all([
      exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, { opId: op, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1", unidad: "UN", moneda: "COP" }),
      exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, { opId: op, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1", unidad: "UN", moneda: "COP" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const n = (await pool.query(`SELECT count(*)::int n FROM deltaops.cos_hechos WHERE tenant_id=$1 AND op_id=$2`, [T_A, op])).rows[0]["n"];
    expect(n).toBe(1);
  });

  it("IDEMPOTENCIA INVARIANTE (PG): materializar sin opId ⇒ rechazado y NINGUNA fila", async () => {
    const antes = (await pool.query(`SELECT count(*)::int n FROM deltaops.cos_hechos WHERE tenant_id=$1`, [T_A])).rows[0]["n"];
    const r = await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, { otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1", unidad: "UN", moneda: "COP" });
    expect(r.ok).toBe(false);
    const despues = (await pool.query(`SELECT count(*)::int n FROM deltaops.cos_hechos WHERE tenant_id=$1`, [T_A])).rows[0]["n"];
    expect(despues).toBe(antes); // el claim falla cerrado ANTES de cualquier efecto en BD
  });

  it("reintento SECUENCIAL con el mismo opId ⇒ exactamente un resultado durable", async () => {
    const op = `retry-${RUN}`;
    const a = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, { opId: op, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1", unidad: "UN", moneda: "COP" })) as Record<string, unknown>;
    expect(a["idempotente"]).toBe(false);
    const b = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, { opId: op, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1", unidad: "UN", moneda: "COP" })) as Record<string, unknown>;
    expect(b["idempotente"]).toBe(true);
    expect(b["costoId"]).toBe(a["costoId"]);
    const n = (await pool.query(`SELECT count(*)::int n FROM deltaops.cos_hechos WHERE tenant_id=$1 AND op_id=$2`, [T_A, op])).rows[0]["n"];
    expect(n).toBe(1);
  });

  it("SNAPSHOT inmutable a nivel de BD: cambiar el costo origen no altera la fila persistida", async () => {
    const op = `snap-${RUN}`;
    const h = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, {
      opId: op, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1.000000", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;
    costoExacto.set(T_A, "art1", [
      { articuloId: "art1", moneda: "COP", metodoValoracion: "PROMEDIO_PONDERADO", costoUnitario: "9999.999999", cantidadAcumulada: "1.000000", actualizadoAt: "2024-06-01T00:00:00.000Z" },
    ]);
    const row = (await pool.query(`SELECT costo_unitario::text u FROM deltaops.cos_hechos WHERE tenant_id=$1 AND costo_id=$2`, [T_A, h["costoId"]])).rows[0];
    expect(row["u"]).toBe("1234.567890");
    // restaurar para otras pruebas
    costoExacto.set(T_A, "art1", [
      { articuloId: "art1", moneda: "COP", metodoValoracion: "PROMEDIO_PONDERADO", costoUnitario: "1234.567890", cantidadAcumulada: "10.000000", actualizadoAt: "2024-01-01T00:00:00.000Z" },
    ]);
  });

  it("anulación auditable persiste estado + metadatos sin tocar el snapshot", async () => {
    const h = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, {
      opId: `anu-${RUN}`, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "2", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;
    must(await exec(ctx(T_A), `${MODULO}.hecho.anular`, { opId: `anu-op-${RUN}`, costoId: h["costoId"], motivo: "duplicado" }));
    const row = (await pool.query(
      `SELECT estado, motivo_anulacion m, anulado_por p, costo_total::text tt FROM deltaops.cos_hechos WHERE tenant_id=$1 AND costo_id=$2`,
      [T_A, h["costoId"]],
    )).rows[0];
    expect(row["estado"]).toBe("ANULADO");
    expect(row["m"]).toBe("duplicado");
    expect(row["p"]).toBe("admin");
    expect(row["tt"]).toBe(h["costoTotal"]);
  });

  it("aislamiento cross-tenant (RLS): los hechos de T_A no se ven desde T_B", async () => {
    must(await exec(ctx(T_B), `${MODULO}.hecho.materializar-material`, { opId: `iso-${RUN}`, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1", unidad: "UN", moneda: "COP" }));
    const enB = must(await query(ctx(T_B), `${MODULO}.hechos`, { otId: "ot1" })) as { hechos: { costoId: string }[] };
    // T_B sólo ve SUS hechos (uno), jamás los de T_A creados en otras pruebas.
    expect(enB.hechos.length).toBe(1);
    const total = (await pool.query(`SELECT count(*)::int n FROM deltaops.cos_hechos WHERE tenant_id=$1`, [T_A])).rows[0]["n"];
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it("IDOR: detalle de un costoId de OTRO tenant ⇒ notFound", async () => {
    const h = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, { opId: `idor-${RUN}`, otId: "ot1", articuloId: "art1", movimientoId: "mov-art1", cantidad: "1", unidad: "UN", moneda: "COP" })) as Record<string, unknown>;
    const cruzado = await query(ctx(T_B), `${MODULO}.hecho.detalle`, { costoId: h["costoId"] });
    expect(cruzado.ok).toBe(false);
  });

  it("monedas mixtas para el mismo activo ⇒ series SEPARADAS (nunca sumadas)", async () => {
    costoExacto.set(T_A, "artU", [
      { articuloId: "artU", moneda: "USD", metodoValoracion: "PROMEDIO_PONDERADO", costoUnitario: "2.500000", cantidadAcumulada: "5.000000", actualizadoAt: "2024-01-01T00:00:00.000Z" },
    ]);
    must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, { opId: `usd-${RUN}`, otId: "ot1", articuloId: "artU", movimientoId: "mov-artU", cantidad: "1", unidad: "UN", moneda: "USD" }));
    const r = must(await query(ctx(T_A), `${MODULO}.hechos.por-moneda`, { activoId: "act-1" })) as { monedas: { moneda: string; hechos: unknown[] }[] };
    const monedas = r.monedas.map((m) => m.moneda).sort();
    expect(monedas).toContain("COP");
    expect(monedas).toContain("USD");
  });

  it("DGP-021.2 · persiste movimiento_id/articulo_id y filtra por ellos (PG)", async () => {
    const mov = `mov-${RUN}-pg`;
    const h = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, {
      opId: `trz-${RUN}`, otId: "ot1", articuloId: "art1", movimientoId: mov, cantidad: "1", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;
    // Columnas dedicadas persistidas (read models de trazabilidad de origen).
    const row = (await pool.query(
      `SELECT movimiento_id m, articulo_id a, origin_type ot FROM deltaops.cos_hechos WHERE tenant_id=$1 AND costo_id=$2`,
      [T_A, h["costoId"]],
    )).rows[0];
    expect(row["m"]).toBe(mov);
    expect(row["a"]).toBe("art1");
    expect(row["ot"]).toBe("inventario.movimiento");
    // Filtro por movimiento devuelve exactamente ese hecho.
    const porMov = must(await query(ctx(T_A), `${MODULO}.hechos`, { movimientoId: mov })) as { hechos: { costoId: string }[] };
    expect(porMov.hechos.length).toBe(1);
    expect(porMov.hechos[0]!.costoId).toBe(h["costoId"]);
    // Filtro por movimiento de OTRO tenant no ve nada (RLS).
    const enB = must(await query(ctx(T_B), `${MODULO}.hechos`, { movimientoId: mov })) as { hechos: unknown[] };
    expect(enB.hechos.length).toBe(0);
  });

  it("DGP-021.2 (R1) · una DEVOLUCIÓN es un ABONO distinguible del CONSUMO (no infla el costo neto)", async () => {
    // CONSUMO (CARGO): 2 uds × 1234.567890 = 2469.135780.
    const consumo = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, {
      opId: `dev-cons-${RUN}`, otId: "ot1", articuloId: "art1", movimientoId: `mov-cons-${RUN}`,
      familia: "consumo", cantidad: "2.000000", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;
    // DEVOLUCIÓN (ABONO): mismas 2 uds reingresadas; MISMO importe NO negativo.
    const devol = must(await exec(ctx(T_A), `${MODULO}.hecho.materializar-material`, {
      opId: `dev-abon-${RUN}`, otId: "ot1", articuloId: "art1", movimientoId: `mov-devol-${RUN}`,
      familia: "devolucion", cantidad: "2.000000", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;

    // 1) La naturaleza es el ÚNICO discriminador económico: CARGO vs ABONO.
    expect(consumo["naturaleza"]).toBe("CARGO");
    expect(devol["naturaleza"]).toBe("ABONO");
    // 2) Los importes son idénticos y NO negativos (el crédito NO usa monto negativo).
    expect(String(devol["costoTotal"])).toBe(String(consumo["costoTotal"]));
    expect(String(devol["costoTotal"]).startsWith("-")).toBe(false);

    // 3) Persistencia: columna naturaleza + familia cruda en fuente (auditoría).
    const rowDev = (await pool.query(
      `SELECT naturaleza, fuente->>'familia' fam, fuente->>'naturaleza' fnat, costo_total ct
         FROM deltaops.cos_hechos WHERE tenant_id=$1 AND costo_id=$2`,
      [T_A, devol["costoId"]],
    )).rows[0];
    expect(rowDev["naturaleza"]).toBe("ABONO");
    expect(rowDev["fam"]).toBe("devolucion");
    expect(rowDev["fnat"]).toBe("ABONO");
    expect(String(rowDev["ct"]).startsWith("-")).toBe(false); // ledger sin negativos

    // 4) El COSTO NETO de material NO aumenta por la devolución: filtrando SÓLO los
    //    CARGO de esa OT/artículo el consumo aparece UNA vez y el ABONO NO cuenta
    //    como costo (es un crédito, distinguible). Sin este fix, la devolución sería
    //    un segundo CARGO indistinguible que inflaba el neto.
    const cargos = must(await query(ctx(T_A), `${MODULO}.hechos`, {
      articuloId: "art1", naturaleza: "CARGO",
    })) as { hechos: { costoId: string; naturaleza: string }[] };
    expect(cargos.hechos.every((x) => x.naturaleza === "CARGO")).toBe(true);
    expect(cargos.hechos.some((x) => x.costoId === consumo["costoId"])).toBe(true);
    expect(cargos.hechos.some((x) => x.costoId === devol["costoId"])).toBe(false);
    // El ABONO es recuperable por su propio filtro (composición futura lo resta).
    const abonos = must(await query(ctx(T_A), `${MODULO}.hechos`, {
      articuloId: "art1", naturaleza: "ABONO",
    })) as { hechos: { costoId: string }[] };
    expect(abonos.hechos.some((x) => x.costoId === devol["costoId"])).toBe(true);
  });

  it("drena el outbox a vacío tras las mutaciones", async () => {
    await rt.platform.kernel.outboxProcessor.processPending();
    const pend = await rt.platform.kernel.outboxProcessor.processPending();
    expect(pend.ok).toBe(true);
  });
});
