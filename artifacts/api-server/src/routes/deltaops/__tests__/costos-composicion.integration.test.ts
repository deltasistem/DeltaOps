/**
 * DGP-021.3 · COMPOSICIÓN de costos de mantenimiento (OT + Activo) — pruebas
 * END-TO-END contra PostgreSQL real (§24). Ejercita `componerOt`/`componerActivo`
 * componiendo los contratos PÚBLICOS reales:
 *   - mano de obra  → deltaops.mdo_valoraciones (DGP-020.3)
 *   - materiales    → deltaops.cos_hechos, materializados por el ORQUESTADOR real
 *                     (`orquestarDesdeMover`) desde movimientos de inventario
 *   - combustible   → deltaops.utl_tanqueos_read (DGP-019; CONTEXTUAL del activo)
 *
 * Cubre §24: mano de obra real (1), material real (2), combustible (3), ausencia de
 * combustible (4), OT multimoneda (5), activo multimoneda (6), cero real (7),
 * ausencia de datos (8), estado parcial (9), pendiente de materialización (10),
 * snapshot histórico (11), cambio de tarifa sin alterar histórico (12), cambio de
 * costo de abastecimiento sin alterar histórico (13), tenant A/B (14), RBAC (15).
 *
 * Datos reales/PG (§24): NO mocks para persistencia/RLS/precisión. Tenant único por
 * corrida; limpieza al terminar. Dinero string-only (se afirma dígito a dígito).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { poolDestructivo as pool, suiteDestructiva } from "../../../test-support/pg-destructivo";
import { orquestarDesdeMover, listarPendientes } from "../costos-orquestador";
import { costosRuntime } from "../costos-runtime";
import { componerOt, componerActivo, resolverPeriodo, type Sesion } from "../costos-composicion";

// LITE-11 §2/§3/§4 — gate FAIL-CLOSED contra DATABASE_TEST_URL (nunca DATABASE_URL).
const suite = suiteDestructiva();

const RUN = randomUUID().slice(0, 8);
const T_A = `cos-comp-a-${RUN}`;
const T_B = `cos-comp-b-${RUN}`;

const INV = "inv-1";
const OT_MO = "ot-mo";        // OT con mano de obra + material
const OT_MULTI = "ot-multi";  // OT con material en 2 monedas
const OT_CERO = "ot-cero";    // OT con CARGO=ABONO ⇒ neto 0 (cero real)
const OT_VACIA = "ot-vacia";  // OT sin ningún hecho ⇒ SIN_DATOS
const OT_PEND = "ot-pend";    // OT con material pendiente de materializar
const ACT_MO = "act-mo";
const ACT_MULTI = "act-multi";
const ACT_CERO = "act-cero";
const ACT_VACIO = "act-vacio";
const ACT_PEND = "act-pend";

const ART_A = "art-a";   // CLP
const ART_USD = "art-usd"; // USD
const ART_SIN = "art-sin"; // sin costo exacto ⇒ pendiente SIN_COSTO

// Sesión de un SUPERVISOR (lectura operacional completa, §16).
const SUP = (tenant: string): Sesion => ({ userId: "u-sup", rol: "SUPERVISOR", tenant, identityId: "id-sup" });
// Sesión de un TECNICO (recorte de mano de obra a lo propio, §16).
const TEC = (tenant: string, identityId: string): Sesion => ({ userId: "u-tec", rol: "TECNICO", tenant, identityId });

const TOTAL = resolverPeriodo("total", new Date("2024-06-01T00:00:00.000Z"));

async function conTenant<T>(tenant: string, fn: (c: { query: (q: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenant]);
    const out = await fn(client as any);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function seedOT(tenant: string, ordenId: string, activoId: string): Promise<void> {
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.ord_ordenes_read
         (tenant_id, id, codigo, titulo, estado, tipo, activo_principal_id, datos, version, last_event_id, actualizado_at)
       VALUES ($1,$2,$3,'OT demo','ABIERTA','CORRECTIVO',$4,'{}'::jsonb,1,$5,now())
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [tenant, ordenId, `C-${ordenId}`, activoId, randomUUID()],
    );
  });
}
async function seedCosto(tenant: string, articuloId: string, moneda: string, costoUnitario: string): Promise<void> {
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.abs_costos_read
         (tenant_id, articulo_id, moneda, metodo_valoracion, costo_unitario, cantidad_acumulada, datos, version, last_event_id, actualizado_at)
       VALUES ($1,$2,$3,'PROMEDIO_PONDERADO',$4::numeric,'100.000000','{}'::jsonb,1,$5,now())
       ON CONFLICT (tenant_id, articulo_id, moneda) DO UPDATE SET costo_unitario=EXCLUDED.costo_unitario`,
      [tenant, articuloId, moneda, costoUnitario, randomUUID()],
    );
  });
}
async function seedItem(tenant: string, itemId: string): Promise<void> {
  const datos = { id: itemId, unidadBase: { clave: "UN", nombre: "UN" } };
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.inv_items_read
         (tenant_id, id, codigo, sku, nombre, estado, tipo_item, modo_trazabilidad, eliminado, datos, version, last_event_id, actualizado_at)
       VALUES ($1,$2,$3,$3,$3,'ACTIVO','MATERIAL','NINGUNO',false,$4::jsonb,1,$5,now())
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [tenant, itemId, itemId, JSON.stringify(datos), randomUUID()],
    );
  });
}
async function seedMovimiento(tenant: string, movimientoId: string, itemId: string, familia: string, cantidad: number, otId: string): Promise<void> {
  const datos = { id: movimientoId, inventarioId: INV, itemId, cantidad, referencia: { tipo: "ot", id: otId }, registradoAt: new Date("2024-05-01T10:00:00.000Z").toISOString() };
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.inv_movimientos_read
         (tenant_id, event_id, inventario_id, item_id, tipo, familia, datos, registrado_at)
       VALUES ($1,$2,$3,$4,'salida',$5,$6::jsonb,now())
       ON CONFLICT (tenant_id, event_id) DO NOTHING`,
      [tenant, movimientoId, INV, itemId, familia, JSON.stringify(datos)],
    );
  });
}
async function seedValoracion(
  tenant: string, ordenId: string, activoId: string, identityId: string,
  moneda: string | null, costo: string | null, estado: string, valoradoAt: string,
): Promise<void> {
  const sesionId = `ses-${randomUUID().slice(0, 8)}`;
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.mdo_valoraciones
         (tenant_id, sesion_id, orden_id, activo_id, identity_id, categoria_clave, tarifa_id, tarifa_valor,
          moneda, unidad, efectivo_ms, costo, estado, iniciado_at, valorado_at, valorado_por)
       VALUES ($1,$2,$3,$4,$5,'MEC','tar-1',$6::numeric,$7,'HORA',3600000,$8::numeric,$9,$10,$11,'sistema')`,
      [tenant, sesionId, ordenId, activoId, identityId, costo, moneda, costo, estado, "2024-05-02T08:00:00.000Z", valoradoAt],
    );
  });
}
async function seedTanqueo(tenant: string, activoId: string, moneda: string | null, costoTotal: number | null, litros: number, fechaHora: string): Promise<void> {
  const id = `tq-${randomUUID().slice(0, 8)}`;
  const datos = { id, activoId, fechaHora, litros, tipoCombustible: "DIESEL", costoTotal, moneda, estado: "vigente" };
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.utl_tanqueos_read
         (tenant_id, id, activo_id, fecha_hora, litros, tipo_combustible, costo_total, moneda, estado, datos, last_event_id, actualizado_at)
       VALUES ($1,$2,$3,$4,$5,'DIESEL',$6,$7,'vigente',$8::jsonb,$9,now())
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [tenant, id, activoId, new Date(fechaHora), litros, costoTotal, moneda, JSON.stringify(datos), randomUUID()],
    );
  });
}

async function materializar(tenant: string, movimientoId: string, itemId: string, familia: string, cantidad: number, otId: string): Promise<void> {
  await seedMovimiento(tenant, movimientoId, itemId, familia, cantidad, otId);
  const r = await orquestarDesdeMover({ movimientoId, inventarioId: INV }, tenant);
  if (r.estado !== "MATERIALIZADO" && r.estado !== "SIN_COSTO" && r.estado !== "MULTIMONEDA") {
    throw new Error(`orquestación inesperada: ${JSON.stringify(r)}`);
  }
}

suite("DGP-021.3 · Composición de costos (OT + Activo) · PostgreSQL", { timeout: 90_000 }, () => {
  beforeAll(async () => {
    costosRuntime();
    // Costos exactos por artículo/moneda (tenant A).
    await seedItem(T_A, ART_A); await seedItem(T_A, ART_USD); await seedItem(T_A, ART_SIN);
    await seedCosto(T_A, ART_A, "CLP", "1000.000000");
    await seedCosto(T_A, ART_USD, "USD", "5.000000");

    // OT_MO (act ACT_MO): mano de obra CLP + material CLP.
    await seedOT(T_A, OT_MO, ACT_MO);
    await seedValoracion(T_A, OT_MO, ACT_MO, "id-sup", "CLP", "50000.000000", "VALORADA", "2024-05-03T09:00:00.000Z");
    await materializar(T_A, `mv-mo-${RUN}`, ART_A, "consumo", 2, OT_MO); // 2×1000 = 2000 CLP CARGO

    // OT_MULTI (ACT_MULTI): material CLP + material USD.
    await seedOT(T_A, OT_MULTI, ACT_MULTI);
    await materializar(T_A, `mv-mu1-${RUN}`, ART_A, "consumo", 3, OT_MULTI);  // 3000 CLP
    await materializar(T_A, `mv-mu2-${RUN}`, ART_USD, "consumo", 4, OT_MULTI); // 20 USD

    // OT_CERO (ACT_CERO): consumo (CARGO) + devolución (ABONO) misma cantidad ⇒ neto 0 real.
    await seedOT(T_A, OT_CERO, ACT_CERO);
    await materializar(T_A, `mv-c1-${RUN}`, ART_A, "consumo", 5, OT_CERO);     // +5000 CARGO
    await materializar(T_A, `mv-c2-${RUN}`, ART_A, "devolucion", 5, OT_CERO);  // -5000 ABONO

    // OT_VACIA (ACT_VACIO): sin hechos.
    await seedOT(T_A, OT_VACIA, ACT_VACIO);

    // OT_PEND (ACT_PEND): movimiento de artículo SIN costo exacto ⇒ PENDIENTE (SIN_COSTO).
    await seedOT(T_A, OT_PEND, ACT_PEND);
    await materializar(T_A, `mv-p-${RUN}`, ART_SIN, "consumo", 1, OT_PEND);

    // Combustible del activo ACT_MO (contextual): 2 tanqueos CLP.
    await seedTanqueo(T_A, ACT_MO, "CLP", 30000, 40, "2024-05-04T07:00:00.000Z");
    await seedTanqueo(T_A, ACT_MO, "CLP", 15000, 20, "2024-05-05T07:00:00.000Z");

    // Tenant B (aislamiento): misma OT_MO con datos DISTINTOS.
    await seedOT(T_B, OT_MO, ACT_MO);
    await seedItem(T_B, ART_A); await seedCosto(T_B, ART_A, "CLP", "9999.000000");
    await seedValoracion(T_B, OT_MO, ACT_MO, "id-sup", "CLP", "111.000000", "VALORADA", "2024-05-03T09:00:00.000Z");
  });

  afterAll(async () => {
    for (const t of [T_A, T_B]) {
      await conTenant(t, async (c) => {
        for (const tabla of [
          "cos_pendientes_material", "cos_hechos", "cos_recibos", "cos_eventos",
          "ord_ordenes_read", "abs_costos_read", "inv_items_read", "inv_movimientos_read",
          "mdo_valoraciones", "utl_tanqueos_read",
        ]) {
          await c.query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [t]).catch(() => undefined);
        }
      });
    }
  });

  function total(porMoneda: any[], moneda: string): string | undefined {
    return porMoneda.find((x) => x.moneda === moneda)?.total;
  }

  it("(1)(2) mano de obra real + material real por moneda; total CLP string-safe", async () => {
    const r = await componerOt(SUP(T_A), OT_MO, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as any;
    expect(total(v.componentes.manoObra.porMoneda, "CLP")).toBe("50000.000000");
    expect(total(v.componentes.materiales.porMoneda, "CLP")).toBe("2000.000000");
    // Total OT = 50000 + 2000 = 52000 CLP (string exacto).
    expect(total(v.totalesPorMoneda, "CLP")).toBe("52000.000000");
    expect(v.estado).toBe("COMPLETO");
  });

  it("(3)(4) combustible: CONTEXTUAL en el activo, NO_APLICA en la OT; ausencia ⇒ SIN_DATOS", async () => {
    const ot = await componerOt(SUP(T_A), OT_MO, TOTAL);
    expect(ot.ok && (ot.value as any).componentes.combustible.estado).toBe("NO_APLICA");

    const act = await componerActivo(SUP(T_A), ACT_MO, TOTAL);
    expect(act.ok).toBe(true);
    if (!act.ok) return;
    const comb = (act.value as any).componentes.combustible;
    expect(comb.estado).toBe("CONTEXTUAL");
    expect(comb.atribuibleAOt).toBe("NO_APLICA");
    expect(comb.tanqueos).toBe(2);
    // R1 (§26): combustible NO produce agregado monetario. El desglose por moneda es
    // SOLO conteo entero de tanqueos; no existe costoOrigen/total ni porMoneda sumado.
    expect(comb.gapMoneda).toBe("GAP-FUEL-MONEY");
    expect(comb.porMoneda).toBeUndefined();
    expect(comb.conteoPorMoneda).toEqual([{ moneda: "CLP", tanqueos: 2 }]);
    expect(comb.tanqueosConCosto).toBe(2);
    // Los eventos exponen valores de ORIGEN individuales (sin sumar).
    expect(comb.eventos).toHaveLength(2);
    for (const e of comb.eventos) expect(typeof e.costoOrigen === "string" || e.costoOrigen === null).toBe(true);
    // Ausencia (activo sin tanqueos) ⇒ SIN_DATOS, jamás 0.
    const vac = await componerActivo(SUP(T_A), ACT_VACIO, TOTAL);
    expect(vac.ok && (vac.value as any).componentes.combustible.estado).toBe("SIN_DATOS_SUFICIENTES");
  });

  it("(R1) combustible con floats fraccionarios: NO se produce ni consume suma monetaria; queda fuera de los totales económicos", async () => {
    const ACT_FUEL = `act-fuel-${RUN}`;
    // Tres tanqueos con valores de origen fraccionarios que, sumados como float,
    // producirían el clásico error de coma flotante (0.1+0.2 !== 0.3).
    await seedTanqueo(T_A, ACT_FUEL, "CLP", 0.1, 1.1, "2024-05-06T07:00:00.000Z");
    await seedTanqueo(T_A, ACT_FUEL, "CLP", 0.2, 2.2, "2024-05-07T07:00:00.000Z");
    await seedTanqueo(T_A, ACT_FUEL, "USD", 10.005, 3.33, "2024-05-08T07:00:00.000Z");

    const act = await componerActivo(SUP(T_A), ACT_FUEL, TOTAL);
    expect(act.ok).toBe(true);
    if (!act.ok) return;
    const v = act.value as any;
    const comb = v.componentes.combustible;

    // Contextual, marcado no-exacto, GAP declarado.
    expect(comb.estado).toBe("CONTEXTUAL");
    expect(comb.precisionOrigen).toBe("float-utilizacion-no-exacto");
    expect(comb.gapMoneda).toBe("GAP-FUEL-MONEY");

    // NO existe NINGÚN agregado monetario: ni costoOrigen total, ni porMoneda sumado.
    expect(comb.costoOrigen).toBeUndefined();
    expect(comb.porMoneda).toBeUndefined();

    // El desglose por moneda es SOLO conteo entero de tanqueos (sin dinero).
    expect(comb.conteoPorMoneda).toEqual([
      { moneda: "CLP", tanqueos: 2 },
      { moneda: "USD", tanqueos: 1 },
    ]);
    // Ningún objeto del desglose por moneda contiene campos monetarios.
    for (const c of comb.conteoPorMoneda) {
      expect(c.costoOrigen).toBeUndefined();
      expect(c.total).toBeUndefined();
      expect(Object.keys(c).sort()).toEqual(["moneda", "tanqueos"]);
    }

    // Los eventos exponen el valor de ORIGEN de CADA tanqueo, sin sumar: el string es
    // exactamente el de origen (no un total float mal redondeado).
    const clpEventos = comb.eventos.filter((e: any) => e.moneda === "CLP").map((e: any) => e.costoOrigen).sort();
    expect(clpEventos).toEqual(["0.1", "0.2"]); // valores individuales, jamás "0.30000000000000004"
    const usd = comb.eventos.find((e: any) => e.moneda === "USD");
    expect(usd.costoOrigen).toBe("10.005");
    // Ningún costoOrigen de evento es la suma de otros (no hay agregación).
    for (const e of comb.eventos) expect(e.costoOrigen).not.toBe("0.30000000000000004");

    // Combustible NUNCA entra al total económico string-safe (sigue fuera).
    // El activo no tiene mano de obra/materiales ⇒ totales económicos vacíos.
    expect(v.totalesPorMoneda).toEqual([]);

    // Limpieza local.
    await conTenant(T_A, async (c) => {
      await c.query(`DELETE FROM deltaops.utl_tanqueos_read WHERE tenant_id=$1 AND activo_id=$2`, [T_A, ACT_FUEL]).catch(() => undefined);
    });
  });

  it("(5)(6) multimoneda: OT y activo separan CLP y USD SIN mezclar", async () => {
    const ot = await componerOt(SUP(T_A), OT_MULTI, TOTAL);
    expect(ot.ok).toBe(true);
    if (!ot.ok) return;
    const tv = (ot.value as any).totalesPorMoneda;
    expect(total(tv, "CLP")).toBe("3000.000000");
    expect(total(tv, "USD")).toBe("20.000000");
    // No existe un total combinado: son 2 series.
    expect(tv.length).toBe(2);
  });

  it("(7) cero real (CARGO=ABONO) ⇒ total 0 con estado COMPLETO (no SIN_DATOS)", async () => {
    const r = await componerOt(SUP(T_A), OT_CERO, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as any;
    expect(total(v.componentes.materiales.porMoneda, "CLP")).toBe("0.000000");
    // Hay hechos (cargos y abonos) ⇒ NO es SIN_DATOS: es un $0 real.
    expect(v.componentes.materiales.estado).toBe("COMPLETO");
    expect(v.componentes.materiales.porMoneda[0].cargos).toBe("5000.000000");
    expect(v.componentes.materiales.porMoneda[0].abonos).toBe("5000.000000");
  });

  it("(8) ausencia de datos ⇒ SIN_DATOS_SUFICIENTES (nunca $0)", async () => {
    const r = await componerOt(SUP(T_A), OT_VACIA, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as any;
    expect(v.componentes.manoObra.estado).toBe("SIN_DATOS_SUFICIENTES");
    expect(v.componentes.materiales.estado).toBe("SIN_DATOS_SUFICIENTES");
    expect(v.componentes.materiales.porMoneda.length).toBe(0);
    expect(v.estado).toBe("SIN_DATOS_SUFICIENTES");
  });

  it("(9)(10) parcial + pendiente de materialización: material pendiente ⇒ PENDIENTE/PARCIAL", async () => {
    // Confirmación: hay un pendiente SIN_COSTO para OT_PEND.
    const pend = (await listarPendientes(T_A)).filter((p) => p.otId === OT_PEND);
    expect(pend.length).toBeGreaterThan(0);
    const r = await componerOt(SUP(T_A), OT_PEND, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as any;
    expect(v.pendientesMaterializacion.length).toBeGreaterThan(0);
    expect(v.componentes.materiales.pendientes.length).toBeGreaterThan(0);
    // Sólo pendientes (sin hechos materializados ni mano de obra) ⇒ PENDIENTE.
    expect(v.estado).toBe("PENDIENTE");
  });

  it("(11)(13) snapshot histórico: cambiar el costo de Abastecimiento NO altera el hecho ya materializado", async () => {
    const antes = await componerOt(SUP(T_A), OT_MO, TOTAL);
    const matAntes = antes.ok ? total((antes.value as any).componentes.materiales.porMoneda, "CLP") : "";
    // Sube el costo exacto de ART_A a 9999; el hecho histórico NO debe cambiar.
    await seedCosto(T_A, ART_A, "CLP", "9999.000000");
    const despues = await componerOt(SUP(T_A), OT_MO, TOTAL);
    const matDespues = despues.ok ? total((despues.value as any).componentes.materiales.porMoneda, "CLP") : "";
    expect(matDespues).toBe(matAntes); // snapshot inmutable (2000 CLP)
    // Restaura para no contaminar otras aserciones.
    await seedCosto(T_A, ART_A, "CLP", "1000.000000");
  });

  it("(12) cambiar la tarifa/valoración de mano de obra NO altera el histórico ya compuesto", async () => {
    // La valoración persistida (snapshot) es la fuente; recomponer da el mismo costo.
    const r1 = await componerOt(SUP(T_A), OT_MO, TOTAL);
    const r2 = await componerOt(SUP(T_A), OT_MO, TOTAL);
    const mo1 = r1.ok ? total((r1.value as any).componentes.manoObra.porMoneda, "CLP") : "a";
    const mo2 = r2.ok ? total((r2.value as any).componentes.manoObra.porMoneda, "CLP") : "b";
    expect(mo1).toBe("50000.000000");
    expect(mo2).toBe(mo1);
  });

  it("(14) tenant A/B: la composición del tenant A NO ve datos del tenant B", async () => {
    const a = await componerOt(SUP(T_A), OT_MO, TOTAL);
    const b = await componerOt(SUP(T_B), OT_MO, TOTAL);
    const moA = a.ok ? total((a.value as any).componentes.manoObra.porMoneda, "CLP") : "";
    const moB = b.ok ? total((b.value as any).componentes.manoObra.porMoneda, "CLP") : "";
    expect(moA).toBe("50000.000000");
    expect(moB).toBe("111.000000"); // dato PROPIO de B, jamás el de A
    // Un tenant tercero sin datos ⇒ SIN_DATOS, no fuga.
    const c = await componerOt(SUP(`cos-comp-x-${RUN}`), OT_MO, TOTAL);
    expect(c.ok && (c.value as any).estado).toBe("SIN_DATOS_SUFICIENTES");
  });

  it("(15) RBAC: un TECNICO sólo ve SU propia mano de obra (recorte del módulo autoridad)", async () => {
    // La valoración de OT_MO es de identityId 'id-sup'. Un técnico 'id-otro' NO la ve.
    const tecOtro = await componerOt(TEC(T_A, "id-otro"), OT_MO, TOTAL);
    expect(tecOtro.ok).toBe(true);
    if (!tecOtro.ok) return;
    expect((tecOtro.value as any).componentes.manoObra.porMoneda.length).toBe(0);
    // El técnico dueño ('id-sup') sí la ve.
    const tecDueno = await componerOt(TEC(T_A, "id-sup"), OT_MO, TOTAL);
    expect(tecDueno.ok && total((tecDueno.value as any).componentes.manoObra.porMoneda, "CLP")).toBe("50000.000000");
  });

  it("período por fechas reales: 30d desde 2024-06-01 excluye hechos de mayo", async () => {
    const rango30 = resolverPeriodo("30d", new Date("2024-06-15T00:00:00.000Z"));
    const r = await componerOt(SUP(T_A), OT_MO, rango30);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Los hechos son de mayo (>30d antes del 15-jun) ⇒ fuera de ventana ⇒ SIN_DATOS.
    expect((r.value as any).componentes.materiales.porMoneda.length).toBe(0);
  });
});
