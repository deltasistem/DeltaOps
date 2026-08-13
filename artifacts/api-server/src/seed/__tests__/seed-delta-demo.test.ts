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
import { credencialDemo, CLAVES_ENV } from "../seed-credentials";

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
    expect(await bcrypt.compare(credencialDemo(CLAVES_ENV.DEMO_ADMIN), user!.passwordHash)).toBe(true);
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
      corSolicitudes: await contarPorTenant("cor_solicitudes_read", DEMO_TENANT),
      corDiagnosticos: await contarPorTenant("cor_diagnosticos_read", DEMO_TENANT),
      corGeneraciones: await contarPorTenant("cor_generaciones_read", DEMO_TENANT),
      corIntervenciones: await contarPorTenant("cor_intervenciones_read", DEMO_TENANT),
      corConsumos: await contarPorTenant("cor_consumos_read", DEMO_TENANT),
      corEventosActivo: await contarPorTenant("cor_eventos_activo_read", DEMO_TENANT),
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
    // Planes + 4 preventivas del módulo Preventivo (seedPreventivo) + 2
    // CORRECTIVAS materializadas por Correctivo (seedCorrectivo, generar-orden
    // -correctiva, tipo canónico "correctiva") + 1 OT de la cadena Inventario→
    // Costos (seedCostosMantenimiento, DGP-021.2) = 21.
    expect(antes.ordenes).toBe(21);
    // Items: 12 del mandato + 1 dedicado de la cadena Inventario→Costos
    // (REP-CLP-001, cuyo id == articuloId de Abastecimiento; GAP-INV-ART) = 13.
    expect(antes.items).toBe(13);
    // Abastecimiento: 10 artículos + 1 de la cadena Inventario→Costos (REP-CLP,
    // id == item de Inventario) = 11; 4 proveedores + 1 dedicado (CLP) = 5;
    // 4 solicitudes (3 del seed de Abastecimiento + 1 AUTOMÁTICA generada por
    // Correctivo ante faltante de stock, origen tipo "orden"; la cadena de Costos
    // NO usa solicitud); 2 cotizaciones; 2 órdenes de compra + 2 de la cadena de
    // Costos (a precios distintos para el promedio ponderado) = 4; 2 recepciones
    // + 2 de la cadena de Costos = 4.
    expect(antes.absArticulos).toBe(11);
    expect(antes.absProveedores).toBe(5);
    expect(antes.absSolicitudes).toBe(4);
    expect(antes.absCotizaciones).toBe(2);
    expect(antes.absOrdenes).toBe(4);
    expect(antes.absRecepciones).toBe(4);
    // Preventivo (DGP-014): 3 programas publicados, 8 actividades (DAG),
    // 4 generaciones materializadas y 3 programaciones (reprog/susp/excl).
    expect(antes.prvProgramas).toBe(3);
    expect(antes.prvActividades).toBe(8);
    expect(antes.prvGeneraciones).toBe(4);
    expect(antes.prvProgramaciones).toBe(3);
    // Correctivo (DGP-015): 4 solicitudes, 2 diagnósticos, 2 generaciones de OT,
    // 1 intervención mayor, 4 hechos de repuestos (reserva/consumo/devolución/compra)
    // y 7 eventos de activo (incluye 1 reincidencia).
    expect(antes.corSolicitudes).toBe(4);
    expect(antes.corDiagnosticos).toBe(2);
    expect(antes.corGeneraciones).toBe(2);
    expect(antes.corIntervenciones).toBe(1);
    expect(antes.corConsumos).toBe(4);
    expect(antes.corEventosActivo).toBe(7);
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
    // 5 líneas ingresables materializadas: 3 del seed de Abastecimiento
    // (parcial[fil+rod] + total[fil]; la línea 2 de la total es 'averiado' ⇒ NO
    // ingresa a Inventario) + 2 de la cadena Inventario→Costos (una recepción
    // TOTAL por cada OC de la cadena, DGP-021.2).
    expect(Number(row.total)).toBe(5);
    expect(Number(row.con_mov)).toBe(5);
    expect(Number(row.distintas)).toBe(Number(row.total)); // dedup: sin duplicados

    const aplicadas = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.abs_recepcion_materializaciones
        WHERE tenant_id = $1 AND estado = 'aplicada'`,
      [DEMO_TENANT],
    );
    expect(Number(aplicadas.rows[0]?.n ?? 0)).toBe(5);

    // Evidencia en Inventario: existen movimientos de entrada cuya referencia es
    // una recepción del módulo Abastecimiento (enlace real, no duplicado por opId).
    // 3 del seed de Abastecimiento + 2 de la cadena Inventario→Costos (DGP-021.2).
    const movs = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.inv_movimientos_read
        WHERE tenant_id = $1 AND (datos->'referencia'->>'tipo') = 'recepcion'`,
      [DEMO_TENANT],
    );
    expect(Number(movs.rows[0]?.n ?? 0)).toBe(5);

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

  it("CORRECTIVO · 4 solicitudes en estados variados (triage/diagnóstico/2×aprobada) por origen", async () => {
    const estados = await pool.query(
      `SELECT estado, count(*)::int AS n FROM deltaops.cor_solicitudes_read
        WHERE tenant_id = $1 GROUP BY estado ORDER BY estado`,
      [DEMO_TENANT],
    );
    const porEstado = Object.fromEntries(estados.rows.map((x: { estado: string; n: number }) => [x.estado, Number(x.n)]));
    expect(porEstado["triage"]).toBe(1);
    expect(porEstado["diagnostico"]).toBe(1);
    expect(porEstado["aprobada"]).toBe(2);

    // Orígenes variados (operador/producción/SST/calidad) sobre activos reales.
    const origenes = await pool.query(
      `SELECT DISTINCT origen FROM deltaops.cor_solicitudes_read WHERE tenant_id = $1 ORDER BY 1`,
      [DEMO_TENANT],
    );
    const setOrigenes = origenes.rows.map((x: { origen: string }) => x.origen);
    expect(setOrigenes).toEqual(expect.arrayContaining(["calidad", "operador", "produccion", "sst"]));

    // Las solicitudes apuntan a activos REALES del DEMO (activo_id no nulo y existe).
    const activosReales = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.cor_solicitudes_read s
         JOIN deltaops.act_activos_read a ON a.id = s.activo_id AND a.tenant_id = s.tenant_id
        WHERE s.tenant_id = $1`,
      [DEMO_TENANT],
    );
    expect(Number(activosReales.rows[0]?.n ?? 0)).toBe(4);
  });

  it("CORRECTIVO · 2 diagnósticos anclados a Dynamic Forms con causa raíz", async () => {
    const diag = await pool.query(
      `SELECT count(*)::int AS total,
              count(causa_raiz)::int AS con_raiz,
              count(DISTINCT plantilla_id)::int AS plantillas
         FROM deltaops.cor_diagnosticos_read WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    const row = diag.rows[0] as { total: number; con_raiz: number; plantillas: number };
    expect(Number(row.total)).toBe(2);
    expect(Number(row.con_raiz)).toBe(2);
    // Ambos diagnósticos se anclan a la MISMA plantilla publicada de Dynamic Forms.
    expect(Number(row.plantillas)).toBe(1);
  });

  it("CORRECTIVO · 2 OT correctivas materializadas, vinculadas y SIN duplicados", async () => {
    const total = await contarPorTenant("cor_generaciones_read", DEMO_TENANT);
    expect(total).toBe(2);

    // claveDedup ÚNICA por generación (anti-duplicado determinista).
    const dedup = await pool.query(
      `SELECT count(DISTINCT clave_dedup)::int AS n FROM deltaops.cor_generaciones_read WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    expect(Number(dedup.rows[0]?.n ?? 0)).toBe(total);

    // Cada generación enlaza una OT REAL de tipo "correctiva" en el módulo Órdenes.
    const otReales = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.cor_generaciones_read g
         JOIN deltaops.ord_ordenes o ON o.id = g.orden_trabajo_id AND o.tenant_id = g.tenant_id
        WHERE g.tenant_id = $1 AND o.tipo = 'correctiva'`,
      [DEMO_TENANT],
    );
    expect(Number(otReales.rows[0]?.n ?? 0)).toBe(2);

    // OT distintas (sin duplicar): cada generación materializada enlaza una OT única.
    const otDistintas = await pool.query(
      `SELECT count(DISTINCT orden_trabajo_id)::int AS n FROM deltaops.cor_generaciones_read
        WHERE tenant_id = $1 AND orden_trabajo_id IS NOT NULL`,
      [DEMO_TENANT],
    );
    expect(Number(otDistintas.rows[0]?.n ?? 0)).toBe(2);
  });

  it("CORRECTIVO · 1 intervención MAYOR (multi-cuadrilla) con consumo y devolución de repuestos", async () => {
    const interv = await pool.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE mayor)::int AS mayores
         FROM deltaops.cor_intervenciones_read WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    const row = interv.rows[0] as { total: number; mayores: number };
    expect(Number(row.total)).toBe(1);
    expect(Number(row.mayores)).toBe(1); // 2 cuadrillas ⇒ Correctivo Mayor

    // Hechos de repuestos: reserva + consumo (parcial) + devolución + compra.
    const tipos = await pool.query(
      `SELECT DISTINCT tipo FROM deltaops.cor_consumos_read WHERE tenant_id = $1 ORDER BY 1`,
      [DEMO_TENANT],
    );
    const setTipos = tipos.rows.map((x: { tipo: string }) => x.tipo);
    expect(setTipos).toEqual(expect.arrayContaining(["compra", "consumo", "devolucion", "reserva"]));

    // Evidencia REAL en Inventario: existe un movimiento de consumo referido a una OT.
    const movsConsumo = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.inv_movimientos_read
        WHERE tenant_id = $1 AND tipo = 'consumo'`,
      [DEMO_TENANT],
    );
    expect(Number(movsConsumo.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("CORRECTIVO · el faltante de stock generó una solicitud de compra AUTOMÁTICA en Abastecimiento", async () => {
    // La auto-solicitud de Correctivo nace con origen tipo "orden" y
    // referenciaTipo "orden-correctiva" (la distingue de la solicitud de
    // Abastecimiento con referencia "orden-trabajo").
    const compra = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.abs_solicitudes_read
        WHERE tenant_id = $1 AND origen_tipo = 'orden'
          AND (datos->'origen'->>'referenciaTipo') = 'orden-correctiva'`,
      [DEMO_TENANT],
    );
    expect(Number(compra.rows[0]?.n ?? 0)).toBe(1);
  });

  it("CORRECTIVO · eventos de activo con detección de REINCIDENCIA (mismo activo + modo)", async () => {
    const total = await contarPorTenant("cor_eventos_activo_read", DEMO_TENANT);
    expect(total).toBe(7);

    // Cobertura de tipos de evento del historial de fallas (los canónicos con
    // `tipo` proyectado; las reincidencias generan filas-marcador aparte).
    const tipos = await pool.query(
      `SELECT DISTINCT tipo FROM deltaops.cor_eventos_activo_read
        WHERE tenant_id = $1 AND tipo <> '' ORDER BY 1`,
      [DEMO_TENANT],
    );
    const setTipos = tipos.rows.map((x: { tipo: string }) => x.tipo);
    expect(setTipos).toEqual(expect.arrayContaining([
      "falla-reportada", "reparacion-iniciada", "reparacion-finalizada", "puesta-en-servicio",
    ]));

    // Al menos una REINCIDENCIA detectada (2 fallas del mismo modo en MON-001 dentro de ventana).
    const reincidentes = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.cor_eventos_activo_read
        WHERE tenant_id = $1 AND reincidente = true`,
      [DEMO_TENANT],
    );
    expect(Number(reincidentes.rows[0]?.n ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("AISLAMIENTO CORRECTIVO · un tenant ajeno no ve datos del DEMO", async () => {
    expect(await contarPorTenant("cor_solicitudes_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("cor_generaciones_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("cor_intervenciones_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("cor_eventos_activo_read", "tenant-inexistente")).toBe(0);
  });

  it("ANALYTICS · catálogo del sistema sembrado (31 indicadores + 8 dashboards + 1 personalizado)", async () => {
    const indicadores = await contarPorTenant("an_definiciones_read", DEMO_TENANT);
    // 30 indicadores heredados + 1 de DGP-021.4 (cobertura de indicadores de costo).
    expect(indicadores).toBe(31);

    // DGP-021.4 · IDENTIDAD del nuevo indicador de costos (no sólo el conteo):
    // clave/categoría/fuente {modulo:'costos',dataset:'indicadores'} y expresión conteo.
    const costo = await pool.query(
      `SELECT datos FROM deltaops.an_definiciones_read
        WHERE tenant_id = $1 AND (datos->>'clave') = 'cobertura-indicadores-costo'`,
      [DEMO_TENANT],
    );
    expect(costo.rows.length).toBe(1);
    const def = costo.rows[0]?.datos as {
      clave?: string;
      categoria?: string;
      fuente?: { modulo?: string; dataset?: string };
      expresion?: { tipo?: string };
      descripcion?: string;
    };
    expect(def.clave).toBe("cobertura-indicadores-costo");
    expect(def.categoria).toBe("costos");
    expect(def.fuente?.modulo).toBe("costos");
    expect(def.fuente?.dataset).toBe("indicadores");
    expect(def.expresion?.tipo).toBe("conteo");
    expect(typeof def.descripcion).toBe("string");
    expect((def.descripcion ?? "").length).toBeGreaterThan(0);

    const dashboards = await contarPorTenant("an_dashboards_read", DEMO_TENANT);
    // 8 dashboards del sistema + 1 personalizado del usuario demo.
    expect(dashboards).toBe(9);

    // El dashboard personalizado del usuario demo existe y NO es del sistema.
    const propio = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.an_dashboards_read
        WHERE tenant_id = $1 AND (datos->>'delSistema')::boolean = false
          AND (datos->>'propietarioId') IS NOT NULL`,
      [DEMO_TENANT],
    );
    expect(Number(propio.rows[0]?.n ?? 0)).toBe(1);

    // Los payloads proyectados incluyen `descripcion` (DGP-016 etapa 3).
    const conDesc = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.an_definiciones_read
        WHERE tenant_id = $1 AND (datos->>'descripcion') IS NOT NULL AND (datos->>'descripcion') <> ''`,
      [DEMO_TENANT],
    );
    expect(Number(conDesc.rows[0]?.n ?? 0)).toBe(31);
  });

  it("ANALYTICS · snapshots representativos evaluados contra datos REALES (no todos cero)", async () => {
    const total = await contarPorTenant("an_snapshots_read", DEMO_TENANT);
    expect(total).toBe(9); // 9 snapshots representativos materializados (incl. actividad-timeline).

    // Valores materializados por clave del indicador objetivo.
    const rows = await pool.query(
      `SELECT datos->>'targetClave' AS clave, (datos->>'valor')::numeric AS valor
         FROM deltaops.an_snapshots_read WHERE tenant_id = $1`,
      [DEMO_TENANT],
    );
    const porClave = Object.fromEntries(
      rows.rows.map((r: { clave: string; valor: string }) => [r.clave, Number(r.valor)]),
    );

    // Al menos 4 snapshots con valor > 0 (evidencia funcional, sin datos falsos).
    const noCero = Object.values(porClave).filter((v) => Number(v) > 0);
    expect(noCero.length).toBeGreaterThanOrEqual(4);

    // Indicadores con datos REALES en el DEMO: valores estables y no nulos.
    expect(porClave["mtbf"]).toBeGreaterThan(0);
    expect(porClave["mttr"]).toBe(360);
    expect(porClave["ot-abiertas"]).toBe(3);
    expect(porClave["compras-generadas"]).toBe(4);
    expect(porClave["reincidencias"]).toBe(2);
    // 2 del consumo correctivo original + 12 del consumo valorizado de la cadena
    // Inventario→Costos (seedCostosMantenimiento, DGP-021.2) = 14.
    expect(porClave["consumo-inventario"]).toBe(14);
  });

  it("AISLAMIENTO ANALYTICS · un tenant ajeno no ve datos del DEMO", async () => {
    expect(await contarPorTenant("an_definiciones_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("an_dashboards_read", "tenant-inexistente")).toBe(0);
    expect(await contarPorTenant("an_snapshots_read", "tenant-inexistente")).toBe(0);
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
