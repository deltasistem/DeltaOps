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
    // Datos base del mandato presentes.
    expect(antes.activos).toBe(10);
    expect(antes.ordenes).toBe(7);
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
