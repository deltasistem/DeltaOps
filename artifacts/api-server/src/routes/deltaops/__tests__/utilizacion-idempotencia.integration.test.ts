/**
 * DGP-019.1 · API Server — IDEMPOTENCIA de comando bajo CONCURRENCIA (PG real).
 *
 * Hallazgo MAYOR de arquitectura: dos POST simultáneos con el MISMO
 * (tenant, comando, opId) no debían poder crear dos hechos. El fix introduce un
 * CLAIM DURABLE atómico del opId ANTES de ejecutar en toda entrada de comando
 * (igual que /sync), más un índice ÚNICO de op_id en las tablas de hechos como
 * cinturón. Esta prueba dispara dos `registrar-lectura` concurrentes con el
 * mismo opId contra PostgreSQL real y verifica que:
 *   - EXACTAMENTE un hecho queda persistido en `utl_lecturas`.
 *   - Ambas respuestas son coherentes (una aplica, la otra es idempotente o un
 *     conflicto reintentable; nunca dos aplicaciones).
 *
 * Requiere DATABASE_URL. Usa un tenant efímero y lo limpia al final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolDestructivo as pool, suiteDestructiva } from "../../../test-support/pg-destructivo";
// LITE-11 §2/§3/§4 — gate FAIL-CLOSED contra DATABASE_TEST_URL (nunca DATABASE_URL).
const suite = suiteDestructiva();
import {
  crearUtilizacionRuntimeOperacional,
  MODULO,
  type UtilizacionRuntimeOperacional,
} from "@workspace/module-utilizacion";
import { createExecutionContext, type ExecutionContext } from "@workspace/kernel";

const SUF = `it${Date.now().toString(36)}`;
const TENANT = `t-utl-${SUF}`;
const ACTIVO = `activo-${SUF}`;

// Principal con permisos plenos del módulo (registrar lecturas). El módulo NO
// gatea entitlements (eso vive en el HTTP layer); aquí probamos la carrera.
const PRINCIPAL = {
  id: `u-${SUF}`,
  rol: "TENANT_ADMIN",
  permisos: [
    `${MODULO}.leer`, `${MODULO}.lecturas.registrar`, `${MODULO}.lecturas.anular`,
    `${MODULO}.tanqueos.registrar`, `${MODULO}.tanqueos.anular`, `${MODULO}.medidores.regularizar`,
  ],
  capacidades: ["leer", "lecturas.registrar"],
};

function ctx(): ExecutionContext {
  return createExecutionContext({ principal: PRINCIPAL, metadata: { tenantId: TENANT } });
}

// Runtime PG SIN puerto de Activos: aísla la idempotencia de la propagación.
let rt: UtilizacionRuntimeOperacional;

beforeAll(() => {
  rt = crearUtilizacionRuntimeOperacional({ pool });
});

afterAll(async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // DGP-023.5 (FASE 11): bajo FORCE RLS el propio owner queda sujeto a la
    // política; el borrado por tenant exige fijar el contexto en la misma tx.
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT]);
    for (const tbl of ["utl_lecturas", "utl_lecturas_read", "utl_recibos", "utl_eventos", "utl_sync_receipts"]) {
      await c.query(`DELETE FROM deltaops.${tbl} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }
    await c.query("COMMIT");
  } catch {
    await c.query("ROLLBACK").catch(() => undefined);
  } finally {
    c.release();
  }
});

suite("API Server · idempotencia de opId bajo concurrencia (PG real)", () => {
  it("doble POST simultáneo con el mismo opId ⇒ EXACTAMENTE un hecho y respuestas coherentes", async () => {
    const opId = `op-concurrente-${SUF}`;
    // MISMO id de cliente + MISMO opId en ambas: la carrera la resuelve el claim.
    const input = {
      id: "33333333-3333-4333-8333-333333333333",
      opId,
      activoId: ACTIVO,
      tipoMedidor: "horometro",
      valor: 100,
      unidad: "h",
      fechaHora: "2024-05-01T08:00:00Z",
      origen: "manual",
    };
    const comando = `${MODULO}.registrar-lectura`;

    // Dos ejecuciones EN PARALELO (contextos independientes, misma UoW por comando).
    const [r1, r2] = await Promise.all([
      rt.platform.kernel.commands.execute(ctx(), comando, { ...input }),
      rt.platform.kernel.commands.execute(ctx(), comando, { ...input }),
    ]);

    // Coherencia: como mucho UNA aplicación "fresca"; la otra es idempotente o
    // un conflicto reintentable. Jamás dos aplicaciones que crean dos hechos.
    const oks = [r1, r2].filter((r) => r.ok);
    const idempotentes = oks.filter((r) => (r as { value: { idempotente?: boolean } }).value.idempotente === true);
    const frescas = oks.filter((r) => (r as { value: { idempotente?: boolean } }).value.idempotente !== true);
    const conflictos = [r1, r2].filter((r) => !r.ok && (r as { error: { code: string } }).error.code === "KRN-CFL-001");

    expect(frescas.length).toBe(1);
    expect(idempotentes.length + conflictos.length).toBe(1);

    // Cinturón: EXACTAMENTE un hecho persistido para ese tenant+activo+opId.
    const c = await pool.connect();
    try {
      // DGP-023.5: bajo FORCE RLS, `set_config(...,true)` es transaccional; la
      // verificación debe leer dentro de la MISMA transacción que fija el tenant.
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT]);
      const res = await c.query(
        `SELECT count(*)::int AS n FROM deltaops.utl_lecturas WHERE tenant_id=$1 AND op_id=$2`,
        [TENANT, opId],
      );
      await c.query("COMMIT");
      expect(res.rows[0]?.["n"]).toBe(1);
    } finally {
      c.release();
    }
  });

  it("repetición secuencial del mismo opId ⇒ idempotente (no crea otro hecho)", async () => {
    const opId = `op-secuencial-${SUF}`;
    const input = {
      id: "44444444-4444-4444-8444-444444444444",
      opId,
      activoId: ACTIVO,
      tipoMedidor: "horometro",
      valor: 150,
      unidad: "h",
      fechaHora: "2024-06-01T08:00:00Z",
      origen: "manual",
    };
    const comando = `${MODULO}.registrar-lectura`;
    const r1 = await rt.platform.kernel.commands.execute(ctx(), comando, { ...input });
    const r2 = await rt.platform.kernel.commands.execute(ctx(), comando, { ...input });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect((r2 as { value: { idempotente?: boolean } }).value.idempotente).toBe(true);

    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT]);
      const res = await c.query(
        `SELECT count(*)::int AS n FROM deltaops.utl_lecturas WHERE tenant_id=$1 AND op_id=$2`,
        [TENANT, opId],
      );
      await c.query("COMMIT");
      expect(res.rows[0]?.["n"]).toBe(1);
    } finally {
      c.release();
    }
  });
});
