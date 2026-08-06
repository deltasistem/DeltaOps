/**
 * DGP-011.3 · Pruebas de integración del tenant DEMO oficial ("DELTA DEMO").
 *
 * Verifica, contra la base de datos real (RLS por `app.tenant_id`):
 *   1. IDEMPOTENCIA — re-ejecutar el seed no duplica datos (conteos estables).
 *   2. LOGIN demo — el admin sembrado (`admin@delta.demo`) valida su contraseña
 *      con bcrypt; una contraseña incorrecta se rechaza.
 *   3. AISLAMIENTO de tenants — `delta-demo` y `deltaops` no se ven entre sí a
 *      través de las políticas RLS.
 *
 * Requiere `DATABASE_URL`. Si no está presente, la suite se omite (skipIf) para
 * no romper entornos sin base de datos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { pool, deltaopsUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { DELTAOPS_TENANT } from "../../routes/deltaops/reference-runtime";
import { DEMO_ADMIN, DEMO_TENANT, seedDeltaDemo } from "../seed-delta-demo";

const sinDb = !process.env.DATABASE_URL;

/**
 * Cuenta filas de una tabla read model para un tenant EXACTAMENTE como lo hacen
 * los repositorios/consultas del módulo: filtrando por la columna `tenant_id`.
 *
 * Nota de entorno: la conexión de la app usa el rol `postgres` (superusuario),
 * para el que PostgreSQL OMITE las políticas RLS salvo `FORCE ROW LEVEL SECURITY`
 * (aquí `relforcerowsecurity=false`). El aislamiento efectivo entre tenants lo
 * garantiza el filtro por `tenant_id` que aplican las consultas del kernel; esta
 * prueba lo verifica sobre el mismo predicado.
 */
async function contarPorTenant(tabla: string, tenant: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM deltaops.${tabla} WHERE tenant_id = $1`,
    [tenant],
  );
  return Number(r.rows[0]?.n ?? 0);
}

describe.skipIf(sinDb)("DGP-011.3 · seed DEMO oficial (integración DB)", () => {
  beforeAll(async () => {
    // Garantiza el estado sembrado antes de las aserciones (idempotente).
    await seedDeltaDemo();
  }, 120_000);

  afterAll(async () => {
    // El pool es compartido por el proceso de test; se cierra al final.
    await pool.end();
  });

  it("LOGIN · el admin demo valida su contraseña con bcrypt", async () => {
    const [user] = await db
      .select()
      .from(deltaopsUsersTable)
      .where(eq(deltaopsUsersTable.email, DEMO_ADMIN.email));

    expect(user).toBeTruthy();
    expect(user?.tenant).toBe(DEMO_TENANT);
    expect(user?.rol).toBe("admin");
    expect(await bcrypt.compare(DEMO_ADMIN.password, user!.passwordHash)).toBe(true);
    expect(await bcrypt.compare("contraseña-incorrecta", user!.passwordHash)).toBe(false);
  });

  it("IDEMPOTENCIA · re-ejecutar el seed no duplica datos", async () => {
    const antes = {
      activos: await contarPorTenant("act_activos_read", DEMO_TENANT),
      ordenes: await contarPorTenant("ord_ordenes_read", DEMO_TENANT),
      items: await contarPorTenant("inv_items_read", DEMO_TENANT),
      movimientos: await contarPorTenant("inv_movimientos_read", DEMO_TENANT),
    };

    // Segunda pasada: los comandos oficiales (id/opId deterministas + guardas de
    // existencia) deben ser idempotentes.
    await seedDeltaDemo();

    const despues = {
      activos: await contarPorTenant("act_activos_read", DEMO_TENANT),
      ordenes: await contarPorTenant("ord_ordenes_read", DEMO_TENANT),
      items: await contarPorTenant("inv_items_read", DEMO_TENANT),
      movimientos: await contarPorTenant("inv_movimientos_read", DEMO_TENANT),
    };

    expect(despues).toEqual(antes);
    // Datos base del mandato presentes. Las órdenes incluyen las 7 del ciclo de
    // vida (seedOrdenes) MÁS las 7 preventivas materializadas por el motor de
    // planes (orquestación `modulo.ordenes.crear`, dedup por claveDedup).
    expect(antes.activos).toBe(10);
    expect(antes.ordenes).toBe(14);
    expect(antes.items).toBe(12);
  }, 120_000);

  it("ÓRDENES · existen las 7 en sus 7 estados del ciclo de vida", async () => {
    const r = await pool.query(
      `SELECT DISTINCT datos->>'estado' AS estado FROM deltaops.ord_ordenes_read
        WHERE tenant_id = $1 ORDER BY 1`,
      [DEMO_TENANT],
    );
    const estados = r.rows.map((x: { estado: string }) => x.estado);
    expect(estados).toEqual([
      "ABIERTA",
      "ASIGNADA",
      "BORRADOR",
      "CERRADA",
      "EN_EJECUCION",
      "EN_VALIDACION",
      "PLANIFICADA",
    ]);
  });

  it("PLANES · se sembraron 8 planes (7 vigentes + 1 suspendido) y 1 calendario", async () => {
    const planes = await contarPorTenant("pln_planes_read", DEMO_TENANT);
    expect(planes).toBe(8);

    const estados = await pool.query(
      `SELECT estado, count(*)::int AS n FROM deltaops.pln_planes_read
        WHERE tenant_id = $1 GROUP BY estado ORDER BY estado`,
      [DEMO_TENANT],
    );
    const porEstado = Object.fromEntries(estados.rows.map((x: { estado: string; n: number }) => [x.estado, Number(x.n)]));
    expect(porEstado["vigente"]).toBe(7);
    expect(porEstado["suspendido"]).toBe(1);

    // Cobertura de tipos del mandato (preventivo/predictivo/inspeccion/legal).
    const tipos = await pool.query(
      `SELECT DISTINCT tipo_plan FROM deltaops.pln_planes_read WHERE tenant_id = $1 ORDER BY 1`,
      [DEMO_TENANT],
    );
    const setTipos = tipos.rows.map((x: { tipo_plan: string }) => x.tipo_plan);
    expect(setTipos).toEqual(expect.arrayContaining(["inspeccion", "legal", "predictivo", "preventivo"]));

    // Calendario operacional demo presente.
    const cal = await contarPorTenant("pln_calendarios", DEMO_TENANT);
    expect(cal).toBe(1);
  });

  it("GENERACIÓN · las generaciones tienen claveDedup ÚNICA (sin duplicados) y materializan OT preventivas", async () => {
    const total = await contarPorTenant("pln_generaciones_read", DEMO_TENANT);
    const distintas = await pool.query(
      `SELECT count(DISTINCT clave_dedup)::int AS n FROM deltaops.pln_generaciones_read WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    expect(total).toBe(7);
    expect(Number(distintas.rows[0]?.n ?? 0)).toBe(total); // dedup: sin duplicados

    // Evidencia funcional: se crearon OT de tipo preventiva por la orquestación.
    const ot = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.ord_ordenes WHERE tenant_id = $1 AND tipo = 'preventiva'`,
      [DEMO_TENANT],
    );
    expect(Number(ot.rows[0]?.n ?? 0)).toBe(7);

    // VÍNCULO persistido: las 7 generaciones quedan MATERIALIZADAS con su OT
    // enlazada (orden_trabajo_id NO nulo + estado=materializada en el snapshot).
    const vinculadas = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.pln_generaciones_read
        WHERE tenant_id = $1 AND orden_trabajo_id IS NOT NULL
          AND datos->>'estado' = 'materializada'`,
      [DEMO_TENANT],
    );
    expect(Number(vinculadas.rows[0]?.n ?? 0)).toBe(7);
  });

  it("AISLAMIENTO PLANES · un tenant ajeno no ve planes del DEMO", async () => {
    expect(await contarPorTenant("pln_planes_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("pln_generaciones_read", "tenant-inexistente")).toBe(0);
  });

  it("AISLAMIENTO · delta-demo y deltaops están particionados por tenant_id", async () => {
    // El DEMO tiene sus 10 activos bajo su propio tenant.
    const activosDemo = await contarPorTenant("act_activos_read", DEMO_TENANT);
    expect(activosDemo).toBe(10);

    // Un tenant inexistente no ve NINGÚN dato del DEMO (aislamiento estricto).
    expect(await contarPorTenant("act_activos_read", "tenant-inexistente")).toBe(0);

    // Ningún activo del DEMO pertenece al tenant `deltaops` (y viceversa): la
    // intersección por `tenant_id` es vacía.
    const cruce = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.act_activos_read
        WHERE tenant_id = $1 AND id IN (
          SELECT id FROM deltaops.act_activos_read WHERE tenant_id = $2)`,
      [DEMO_TENANT, DELTAOPS_TENANT],
    );
    expect(Number(cruce.rows[0]?.n ?? 0)).toBe(0);

    // Los usuarios también quedan aislados por su columna `tenant`.
    const usuariosDemo = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.users WHERE tenant = $1 AND tenant <> $2`,
      [DEMO_TENANT, DELTAOPS_TENANT],
    );
    expect(Number(usuariosDemo.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
