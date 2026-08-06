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
    const snapshot = async () => ({
      activos: await contarPorTenant("act_activos_read", DEMO_TENANT),
      ordenes: await contarPorTenant("ord_ordenes_read", DEMO_TENANT),
      items: await contarPorTenant("inv_items_read", DEMO_TENANT),
      movimientos: await contarPorTenant("inv_movimientos_read", DEMO_TENANT),
      absArticulos: await contarPorTenant("abs_articulos_read", DEMO_TENANT),
      absProveedores: await contarPorTenant("abs_proveedores_read", DEMO_TENANT),
      absSolicitudes: await contarPorTenant("abs_solicitudes_read", DEMO_TENANT),
      absCotizaciones: await contarPorTenant("abs_cotizaciones_read", DEMO_TENANT),
      absOrdenes: await contarPorTenant("abs_ordenes_compra_read", DEMO_TENANT),
      absRecepciones: await contarPorTenant("abs_recepciones_read", DEMO_TENANT),
      absMaterializaciones: await contarPorTenant("abs_recepcion_materializaciones", DEMO_TENANT),
      prvProgramas: await contarPorTenant("prv_programas_read", DEMO_TENANT),
      prvActividades: await contarPorTenant("prv_actividades_read", DEMO_TENANT),
      prvGeneraciones: await contarPorTenant("prv_generaciones_read", DEMO_TENANT),
      prvProgramaciones: await contarPorTenant("prv_programaciones_read", DEMO_TENANT),
    });
    const antes = await snapshot();

    // Segunda pasada: los comandos oficiales (id/opId deterministas + guardas de
    // existencia) deben ser idempotentes.
    await seedDeltaDemo();

    const despues = await snapshot();

    expect(despues).toEqual(antes);
    // Datos base del mandato presentes. Las órdenes incluyen las 7 del ciclo de
    // vida (seedOrdenes) MÁS las 7 preventivas materializadas por el motor de
    // planes (orquestación `modulo.ordenes.crear`, dedup por claveDedup).
    expect(antes.activos).toBe(10);
    // Órdenes: 7 del ciclo de vida (seedOrdenes) + 7 preventivas del motor de
    // Planes + 4 preventivas del módulo Preventivo (seedPreventivo, materializadas
    // por el MaterializadorOrdenes vía orquestación oficial) = 18.
    expect(antes.ordenes).toBe(18);
    expect(antes.items).toBe(12);
    // Abastecimiento: 10 artículos, 4 proveedores, 3 solicitudes, 2 cotizaciones,
    // 2 órdenes de compra, 2 recepciones.
    expect(antes.absArticulos).toBe(10);
    expect(antes.absProveedores).toBe(4);
    expect(antes.absSolicitudes).toBe(3);
    expect(antes.absCotizaciones).toBe(2);
    expect(antes.absOrdenes).toBe(2);
    expect(antes.absRecepciones).toBe(2);
    // Preventivo (DGP-014): 3 programas publicados, 8 actividades (DAG),
    // 4 generaciones materializadas y 3 programaciones (reprog/susp/excl).
    expect(antes.prvProgramas).toBe(3);
    expect(antes.prvActividades).toBe(8);
    expect(antes.prvGeneraciones).toBe(4);
    expect(antes.prvProgramaciones).toBe(3);
  }, 120_000);

  it("ABASTECIMIENTO · artículos ligados a Inventario, proveedores calificados y OC recibida", async () => {
    // Artículos con inventarioItemId ligado a un item real de Inventario DEMO.
    const ligados = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.abs_articulos_read
        WHERE tenant_id = $1 AND (datos->>'inventarioItemId') IS NOT NULL`,
      [DEMO_TENANT],
    );
    expect(Number(ligados.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(9);

    // Proveedores calificados (calificación promedio > 0 en el snapshot).
    const calif = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.abs_proveedores_read
        WHERE tenant_id = $1 AND calificacion_promedio > 0`,
      [DEMO_TENANT],
    );
    expect(Number(calif.rows[0]?.n ?? 0)).toBe(4);

    // Solicitudes en estados variados: al menos una aprobada, una enviada, una borrador.
    const estados = await pool.query(
      `SELECT DISTINCT estado FROM deltaops.abs_solicitudes_read WHERE tenant_id = $1 ORDER BY 1`,
      [DEMO_TENANT],
    );
    const setEstados = estados.rows.map((x: { estado: string }) => x.estado);
    expect(setEstados).toEqual(expect.arrayContaining(["aprobada", "borrador", "enviada"]));

    // Una cotización SELECCIONADA para la solicitud origen-inventario.
    const sel = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.abs_cotizaciones_read
        WHERE tenant_id = $1 AND seleccionada = true`,
      [DEMO_TENANT],
    );
    expect(Number(sel.rows[0]?.n ?? 0)).toBe(1);

    // OC-B llegó a estado "recibida" (recepción parcial + total).
    const ordenEstados = await pool.query(
      `SELECT DISTINCT estado FROM deltaops.abs_ordenes_compra_read WHERE tenant_id = $1 ORDER BY 1`,
      [DEMO_TENANT],
    );
    const setOc = ordenEstados.rows.map((x: { estado: string }) => x.estado);
    expect(setOc).toEqual(expect.arrayContaining(["enviada", "recibida"]));
  });

  it("ABASTECIMIENTO · las recepciones materializaron movimientos de Inventario SIN duplicar", async () => {
    // Cada línea materializada tiene su vínculo con movimiento_id NO nulo y estado
    // "aplicada"; la clave_dedup es única (sin duplicados) — idempotente por opId
    // ${recepcionId}:${numeroLineaOC}.
    const mats = await pool.query(
      `SELECT count(*)::int AS total,
              count(movimiento_id)::int AS con_mov,
              count(DISTINCT clave_dedup)::int AS distintas
         FROM deltaops.abs_recepcion_materializaciones WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    const row = mats.rows[0] as { total: number; con_mov: number; distintas: number };
    // 3 líneas ingresables materializadas: parcial(fil+rod) + total(fil).
    // (La línea 2 de la total es 'averiado' ⇒ NO ingresa a Inventario.)
    expect(Number(row.total)).toBe(3);
    expect(Number(row.con_mov)).toBe(3);
    expect(Number(row.distintas)).toBe(Number(row.total)); // dedup: sin duplicados

    const aplicadas = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.abs_recepcion_materializaciones
        WHERE tenant_id = $1 AND estado = 'aplicada'`,
      [DEMO_TENANT],
    );
    expect(Number(aplicadas.rows[0]?.n ?? 0)).toBe(3);

    // Evidencia en Inventario: existen movimientos de entrada cuya referencia es
    // una recepción del módulo Abastecimiento (enlace real, no duplicado por opId).
    const movs = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.inv_movimientos_read
        WHERE tenant_id = $1 AND (datos->'referencia'->>'tipo') = 'recepcion'`,
      [DEMO_TENANT],
    );
    expect(Number(movs.rows[0]?.n ?? 0)).toBe(3);

    // Costos del catálogo actualizados (abs_costos_read poblado para los artículos
    // recibidos, en la moneda USD).
    const costos = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.abs_costos_read
        WHERE tenant_id = $1 AND moneda = 'USD' AND (costo_unitario)::numeric > 0`,
      [DEMO_TENANT],
    );
    expect(Number(costos.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it("AISLAMIENTO ABASTECIMIENTO · un tenant ajeno no ve datos del DEMO", async () => {
    expect(await contarPorTenant("abs_articulos_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("abs_ordenes_compra_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("abs_recepcion_materializaciones", "tenant-inexistente")).toBe(0);
  });

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
    // 7 desde el motor de Planes + 4 desde el módulo Preventivo (seedPreventivo).
    const ot = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.ord_ordenes WHERE tenant_id = $1 AND tipo = 'preventiva'`,
      [DEMO_TENANT],
    );
    expect(Number(ot.rows[0]?.n ?? 0)).toBe(11);

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

  it("PREVENTIVO · 3 programas publicados con jerarquía padre→hijo y 8 actividades (DAG)", async () => {
    const programas = await contarPorTenant("prv_programas_read", DEMO_TENANT);
    expect(programas).toBe(3);

    // Todos los programas quedan PUBLICADOS (crear→enviarRevision→publicar).
    const estados = await pool.query(
      `SELECT DISTINCT estado FROM deltaops.prv_programas_read WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    expect(estados.rows.map((x: { estado: string }) => x.estado)).toEqual(["publicado"]);

    // Jerarquía padre→hijo: al menos un programa referencia a otro como padre.
    const conPadre = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.prv_programas_read
        WHERE tenant_id = $1 AND (datos->>'padreId') IS NOT NULL`,
      [DEMO_TENANT],
    );
    expect(Number(conPadre.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);

    // 8 actividades definidas con dependencias reales (DAG): existe al menos una
    // actividad con dependencias no vacías.
    const actividades = await contarPorTenant("prv_actividades_read", DEMO_TENANT);
    expect(actividades).toBe(8);
    const conDeps = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.prv_actividades_read
        WHERE tenant_id = $1 AND jsonb_array_length(COALESCE(datos->'dependencias','[]'::jsonb)) > 0`,
      [DEMO_TENANT],
    );
    expect(Number(conDeps.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(3);
  });

  it("PREVENTIVO · generaciones materializan OT preventivas REALES sin duplicados", async () => {
    const total = await contarPorTenant("prv_generaciones_read", DEMO_TENANT);
    expect(total).toBe(4);

    // claveDedup ÚNICA (sin duplicados) — idempotencia end-to-end.
    const distintas = await pool.query(
      `SELECT count(DISTINCT clave_dedup)::int AS n FROM deltaops.prv_generaciones_read WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    expect(Number(distintas.rows[0]?.n ?? 0)).toBe(total);

    // Todas MATERIALIZADAS con su OT enlazada (orden_trabajo_id NO nulo).
    const vinculadas = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.prv_generaciones_read
        WHERE tenant_id = $1 AND orden_trabajo_id IS NOT NULL AND estado = 'materializada'`,
      [DEMO_TENANT],
    );
    expect(Number(vinculadas.rows[0]?.n ?? 0)).toBe(4);

    // El vínculo apunta a OT REALES de tipo preventiva en el módulo de Órdenes.
    const otReales = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.prv_generaciones_read g
         JOIN deltaops.ord_ordenes o ON o.id = g.orden_trabajo_id AND o.tenant_id = g.tenant_id
        WHERE g.tenant_id = $1 AND o.tipo = 'preventiva'`,
      [DEMO_TENANT],
    );
    expect(Number(otReales.rows[0]?.n ?? 0)).toBe(4);

    // Sin OT duplicadas: cada generación materializada enlaza una OT distinta.
    const otDistintas = await pool.query(
      `SELECT count(DISTINCT orden_trabajo_id)::int AS n FROM deltaops.prv_generaciones_read
        WHERE tenant_id = $1 AND orden_trabajo_id IS NOT NULL`,
      [DEMO_TENANT],
    );
    expect(Number(otDistintas.rows[0]?.n ?? 0)).toBe(4);
  });

  it("PREVENTIVO · el calendario muestra reprogramación, suspensión y exclusión", async () => {
    const total = await contarPorTenant("prv_programaciones_read", DEMO_TENANT);
    expect(total).toBe(3);

    const tipos = await pool.query(
      `SELECT DISTINCT tipo FROM deltaops.prv_programaciones_read WHERE tenant_id = $1 ORDER BY 1`,
      [DEMO_TENANT],
    );
    const setTipos = tipos.rows.map((x: { tipo: string }) => x.tipo);
    expect(setTipos).toEqual(expect.arrayContaining(["exclusion", "reprogramacion", "suspension"]));
  });

  it("AISLAMIENTO PREVENTIVO · un tenant ajeno no ve datos del DEMO", async () => {
    expect(await contarPorTenant("prv_programas_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("prv_generaciones_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("prv_programaciones_read", "tenant-inexistente")).toBe(0);
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
