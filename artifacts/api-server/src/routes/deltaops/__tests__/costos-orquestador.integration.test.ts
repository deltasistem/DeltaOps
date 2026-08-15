/**
 * DGP-021.2 · ORQUESTADOR Inventario → Costos — pruebas END-TO-END contra
 * PostgreSQL real (§25). Ejercita la COMPOSICIÓN REAL del api-server:
 * `orquestarDesdeMover` + runtimes reales de inventario (lectura de movimiento/
 * ítem por contrato), órdenes (verificación de OT + derivación de activo),
 * abastecimiento (costo exacto string-safe) y costos (materialización idempotente),
 * más la tabla propia de pendientes (deltaops.cos_pendientes_material, migr. 0045).
 *
 * SEED: se insertan directamente los READ MODELS que consumen los contratos
 * públicos (ord_ordenes_read, abs_costos_read, inv_items_read, inv_movimientos_read),
 * respetando RLS (set_config app.tenant_id en la MISMA transacción). NO se driva
 * el `mover` físico porque su recibo/existencias son ortogonales a la orquestación;
 * el snapshot de movimiento leído es idéntico al que produce `mover`.
 *
 * Cubre: MATERIALIZADO con activo derivado + costo/cantidad exactos; identidad
 * DETERMINISTA (mismo movimiento 2× ⇒ 1 hecho) incl. concurrencia; SIN_COSTO como
 * pendiente RECUPERABLE (jamás "0"); MULTIMONEDA sin elegir/convertir/sumar;
 * movimiento NO atribuido a OT ⇒ no materializa sin basura; OT inválida ⇒ ERROR
 * recuperable; reproceso idempotente (pendiente ⇒ resuelto ⇒ re-reproceso no
 * duplica); FAIL-SAFE (nunca propaga excepción); RLS/aislamiento del pendiente;
 * outbox de costos drenado a vacío.
 *
 * Requiere DATABASE_URL. Tenant ÚNICO por corrida; limpia sus filas al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { poolDestructivo as pool, suiteDestructiva } from "../../../test-support/pg-destructivo";
import {
  orquestarDesdeMover,
  reprocesarPendientes,
  listarPendientes,
} from "../costos-orquestador";
import { costosRuntime } from "../costos-runtime";

// LITE-11 §2/§3/§4 — gate FAIL-CLOSED contra DATABASE_TEST_URL (nunca DATABASE_URL).
const suite = suiteDestructiva();

const RUN = randomUUID().slice(0, 8);
const T_A = `cos-orq-a-${RUN}`;
const T_B = `cos-orq-b-${RUN}`;

const INV = "inv-1"; // un único inventario (agrupa todos los movimientos)
const OT_OK = "ot-ok";
const OT_INEXISTENTE = "ot-fantasma";
const ACTIVO = "act-77";
const MONEDA = "CLP";

// Artículos (== itemId de inventario, invariante GAP-INV-ART).
const ART_OK = "art-ok"; // 1 sola moneda CLP con costo exacto
const ART_SIN = "art-sin"; // sin costo exacto ⇒ SIN_COSTO
const ART_MULTI = "art-multi"; // 2 monedas ⇒ MULTIMONEDA

/** Inserta respetando RLS (set_config app.tenant_id en la misma tx). */
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

async function seedOT(tenant: string, ordenId: string, activoId: string | null): Promise<void> {
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

async function seedItem(tenant: string, itemId: string, unidadClave: string): Promise<void> {
  const datos = { id: itemId, unidadBase: { clave: unidadClave, nombre: unidadClave } };
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

/** Inserta un movimiento en el read model idéntico al snapshot que produce `mover`. */
async function seedMovimiento(
  tenant: string,
  movimientoId: string,
  itemId: string,
  familia: string,
  cantidad: number,
  referencia: { tipo: string; id: string } | null,
): Promise<void> {
  const datos = {
    id: movimientoId,
    inventarioId: INV,
    itemId,
    cantidad, // FLOAT, como lo lleva inventario (GAP-INV-CANT)
    referencia,
    registradoAt: new Date("2024-05-01T10:00:00.000Z").toISOString(),
  };
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

async function contarHechos(tenant: string, movimientoId: string): Promise<number> {
  return conTenant(tenant, async (c) => {
    const r = await c.query(
      `SELECT count(*)::int n FROM deltaops.cos_hechos WHERE tenant_id=$1 AND movimiento_id=$2`,
      [tenant, movimientoId],
    );
    return Number(r.rows[0]?.["n"] ?? 0);
  });
}

suite("DGP-021.2 · Orquestador Inventario→Costos · PostgreSQL", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    // Fuerza construcción del runtime de costos (adaptadores PG reales).
    costosRuntime();
    // OT válida con activo principal (tenant A) y una OT en tenant B (aislamiento).
    await seedOT(T_A, OT_OK, ACTIVO);
    await seedOT(T_B, OT_OK, ACTIVO);
    // Ítems (unidad base UN).
    for (const art of [ART_OK, ART_SIN, ART_MULTI]) await seedItem(T_A, art, "UN");
    // Costos exactos: ART_OK 1 moneda; ART_MULTI 2 monedas; ART_SIN ninguno.
    await seedCosto(T_A, ART_OK, MONEDA, "1500.250000");
    await seedCosto(T_A, ART_MULTI, "CLP", "10.000000");
    await seedCosto(T_A, ART_MULTI, "USD", "0.011000");
  });

  afterAll(async () => {
    for (const t of [T_A, T_B]) {
      await conTenant(t, async (c) => {
        for (const tabla of [
          "cos_pendientes_material", "cos_hechos", "cos_recibos", "cos_eventos",
          "ord_ordenes_read", "abs_costos_read", "inv_items_read", "inv_movimientos_read",
        ]) {
          await c.query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [t]).catch(() => undefined);
        }
      });
    }
  });

  it("MATERIALIZA un consumo atribuido a OT: activo DERIVADO + costo/cantidad EXACTOS", async () => {
    const mov = `mov-ok-${RUN}`;
    await seedMovimiento(T_A, mov, ART_OK, "consumo", 2, { tipo: "ot", id: OT_OK });
    const r = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r.aplicable).toBe(true);
    expect(r.estado).toBe("MATERIALIZADO");
    expect(r.costoId).toBeTruthy();
    // Hecho persistido con snapshot exacto: 2.000000 × 1500.250000 = 3000.500000.
    const row = await conTenant(T_A, async (c) => (await c.query(
      `SELECT activo_id a, cantidad::text q, costo_unitario::text u, costo_total::text tt, moneda m, origin_type ot, articulo_id art
         FROM deltaops.cos_hechos WHERE tenant_id=$1 AND movimiento_id=$2`,
      [T_A, mov],
    )).rows[0]);
    expect(row["a"]).toBe(ACTIVO); // DERIVADO de la OT, no del frontend
    expect(row["q"]).toBe("2.000000");
    expect(row["u"]).toBe("1500.250000");
    expect(row["tt"]).toBe("3000.500000");
    expect(row["m"]).toBe(MONEDA);
    expect(row["ot"]).toBe("inventario.movimiento");
    expect(row["art"]).toBe(ART_OK);
    // Pendiente marcado MATERIALIZADO (auditable).
    const p = await listarPendientes(T_A, "MATERIALIZADO");
    expect(p.some((x) => x.movimientoId === mov && x.costoId === r.costoId)).toBe(true);
  });

  it("DGP-021.2 (R1) · una DEVOLUCIÓN atribuida a OT ⇒ hecho ABONO (NO infla el costo neto, distinguible del consumo)", async () => {
    // CONSUMO (CARGO) y DEVOLUCIÓN (ABONO) sobre el MISMO artículo/OT.
    const movC = `mov-cons-r1-${RUN}`;
    const movD = `mov-devol-r1-${RUN}`;
    await seedMovimiento(T_A, movC, ART_OK, "consumo", 2, { tipo: "ot", id: OT_OK });
    await seedMovimiento(T_A, movD, ART_OK, "devolucion", 2, { tipo: "ot", id: OT_OK });
    const rc = await orquestarDesdeMover({ movimientoId: movC, inventarioId: INV }, T_A);
    const rd = await orquestarDesdeMover({ movimientoId: movD, inventarioId: INV }, T_A);
    expect(rc.estado).toBe("MATERIALIZADO");
    expect(rd.estado).toBe("MATERIALIZADO");

    // El hecho de la devolución es ABONO, con familia cruda registrada e importe
    // NO negativo (el crédito NUNCA se representa con monto negativo).
    const dev = await conTenant(T_A, async (c) => (await c.query(
      `SELECT naturaleza n, fuente->>'familia' fam, costo_total::text tt
         FROM deltaops.cos_hechos WHERE tenant_id=$1 AND movimiento_id=$2`,
      [T_A, movD],
    )).rows[0]);
    expect(dev["n"]).toBe("ABONO");
    expect(dev["fam"]).toBe("devolucion");
    expect(String(dev["tt"]).startsWith("-")).toBe(false);

    // El consumo sigue siendo CARGO: la devolución NO lo alteró ni lo duplicó.
    const con = await conTenant(T_A, async (c) => (await c.query(
      `SELECT naturaleza n FROM deltaops.cos_hechos WHERE tenant_id=$1 AND movimiento_id=$2`,
      [T_A, movC],
    )).rows[0]);
    expect(con["n"]).toBe("CARGO");

    // COSTO NETO de material: sólo los CARGO cuentan como costo; la devolución es
    // un ABONO recuperable aparte (composición futura lo resta). Se acota a los DOS
    // movimientos de este caso (el tenant/OT/artículo lo comparten otros tests).
    const conteos = await conTenant(T_A, async (c) => (await c.query(
      `SELECT naturaleza, count(*)::int n FROM deltaops.cos_hechos
         WHERE tenant_id=$1 AND movimiento_id = ANY($2) GROUP BY naturaleza`,
      [T_A, [movC, movD]],
    )).rows as Array<{ naturaleza: string; n: number }>);
    const porNat = Object.fromEntries(conteos.map((x) => [x.naturaleza, x.n]));
    // Exactamente 1 CARGO (consumo) y 1 ABONO (devolución): la devolución NO creó
    // un SEGUNDO cargo indistinguible (bug MAYOR R1 corregido).
    expect(porNat["CARGO"]).toBe(1);
    expect(porNat["ABONO"]).toBe(1);
  });

  it("IDENTIDAD DETERMINISTA: el MISMO movimiento 2× ⇒ EXACTAMENTE 1 hecho (opId inv:<id>)", async () => {
    const mov = `mov-idem-${RUN}`;
    await seedMovimiento(T_A, mov, ART_OK, "consumo", 1, { tipo: "orden-trabajo", id: OT_OK });
    const r1 = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    const r2 = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r1.estado).toBe("MATERIALIZADO");
    expect(r2.estado).toBe("MATERIALIZADO");
    expect(r2.costoId).toBe(r1.costoId);
    expect(await contarHechos(T_A, mov)).toBe(1);
  });

  it("CONCURRENCIA: dos disparos SIMULTÁNEOS del mismo movimiento ⇒ 1 solo hecho", async () => {
    const mov = `mov-conc-${RUN}`;
    await seedMovimiento(T_A, mov, ART_OK, "consumo", 1, { tipo: "ot", id: OT_OK });
    const [a, b] = await Promise.all([
      orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A),
      orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A),
    ]);
    expect(a.aplicable && b.aplicable).toBe(true);
    // Ambos ok (uno crea, otro idempotente); jamás 2 hechos.
    expect(await contarHechos(T_A, mov)).toBe(1);
  });

  it("SIN COSTO exacto ⇒ pendiente RECUPERABLE (SIN_COSTO), NUNCA un hecho en \"0\"", async () => {
    const mov = `mov-sincosto-${RUN}`;
    await seedMovimiento(T_A, mov, ART_SIN, "consumo", 5, { tipo: "ot", id: OT_OK });
    const r = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r.aplicable).toBe(true);
    expect(r.estado).toBe("SIN_COSTO");
    expect(await contarHechos(T_A, mov)).toBe(0); // no se fabricó ningún hecho
    const p = await listarPendientes(T_A); // no resueltos
    expect(p.some((x) => x.movimientoId === mov && x.estado === "SIN_COSTO")).toBe(true);
  });

  it("MULTIMONEDA ⇒ pendiente MULTIMONEDA: NO se elige/convierte/suma", async () => {
    const mov = `mov-multi-${RUN}`;
    await seedMovimiento(T_A, mov, ART_MULTI, "consumo", 3, { tipo: "ot", id: OT_OK });
    const r = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r.estado).toBe("MULTIMONEDA");
    expect(await contarHechos(T_A, mov)).toBe(0);
    const p = await listarPendientes(T_A, "MULTIMONEDA");
    expect(p.some((x) => x.movimientoId === mov)).toBe(true);
  });

  it("movimiento NO atribuido a OT ⇒ NO materializa y NO deja pendiente basura", async () => {
    const mov = `mov-noot-${RUN}`;
    await seedMovimiento(T_A, mov, ART_OK, "consumo", 1, { tipo: "traslado", id: "x" });
    const r = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r.aplicable).toBe(false); // fuera de alcance, no es costo de OT
    expect(await contarHechos(T_A, mov)).toBe(0);
    const p = await listarPendientes(T_A);
    expect(p.some((x) => x.movimientoId === mov)).toBe(false); // sin basura
  });

  it("familia NO material (p.ej. entrada) ⇒ NO materializa ni deja pendiente", async () => {
    const mov = `mov-entrada-${RUN}`;
    await seedMovimiento(T_A, mov, ART_OK, "entrada", 1, { tipo: "ot", id: OT_OK });
    const r = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r.aplicable).toBe(false);
    expect(await contarHechos(T_A, mov)).toBe(0);
  });

  it("OT INEXISTENTE ⇒ ERROR recuperable (costos emite 404), sin hecho", async () => {
    const mov = `mov-otbad-${RUN}`;
    await seedMovimiento(T_A, mov, ART_OK, "consumo", 1, { tipo: "ot", id: OT_INEXISTENTE });
    const r = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r.aplicable).toBe(true);
    expect(r.estado).toBe("ERROR");
    expect(await contarHechos(T_A, mov)).toBe(0);
    const p = await listarPendientes(T_A, "ERROR");
    expect(p.some((x) => x.movimientoId === mov)).toBe(true);
  });

  it("REPROCESO idempotente: SIN_COSTO ⇒ (llega el costo) ⇒ MATERIALIZADO ⇒ re-reproceso NO duplica", async () => {
    const artTardio = `art-tardio-${RUN}`;
    await seedItem(T_A, artTardio, "UN");
    const mov = `mov-repro-${RUN}`;
    await seedMovimiento(T_A, mov, artTardio, "consumo", 4, { tipo: "ot", id: OT_OK });
    // 1) Sin costo aún ⇒ pendiente SIN_COSTO.
    const r0 = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_A);
    expect(r0.estado).toBe("SIN_COSTO");
    // 2) Llega el costo exacto (recepción posterior) y se reprocesa.
    await seedCosto(T_A, artTardio, MONEDA, "7.500000");
    const rep1 = await reprocesarPendientes(T_A);
    expect(rep1.materializados).toBeGreaterThanOrEqual(1);
    expect(await contarHechos(T_A, mov)).toBe(1);
    // 3) Re-reproceso: el pendiente ya está MATERIALIZADO ⇒ no vuelve a la lista;
    // el opId determinista garantiza que aunque se reintente NO se duplica.
    const rep2 = await reprocesarPendientes(T_A);
    expect(rep2.resultados.some((x) => x.movimientoId === mov)).toBe(false);
    expect(await contarHechos(T_A, mov)).toBe(1);
  });

  it("FAIL-SAFE: un resultado de `mover` corrupto NO propaga excepción (aplicable:false)", async () => {
    const r = await orquestarDesdeMover({ basura: true }, T_A);
    expect(r.aplicable).toBe(false); // sin movimientoId/inventarioId ⇒ no-op seguro
    const r2 = await orquestarDesdeMover(null, T_A);
    expect(r2.aplicable).toBe(false);
  });

  it("RLS/aislamiento: los pendientes/hechos de T_A no se ven desde T_B", async () => {
    // Un movimiento de T_B con la MISMA OT/artículo: se materializa en su tenant.
    await seedItem(T_B, ART_OK, "UN");
    await seedCosto(T_B, ART_OK, MONEDA, "1500.250000");
    const mov = `mov-rls-${RUN}`;
    await seedMovimiento(T_B, mov, ART_OK, "consumo", 1, { tipo: "ot", id: OT_OK });
    const r = await orquestarDesdeMover({ movimientoId: mov, inventarioId: INV }, T_B);
    expect(r.estado).toBe("MATERIALIZADO");
    // Desde T_A NO se ve el pendiente ni el hecho de T_B.
    const pA = await listarPendientes(T_A);
    expect(pA.some((x) => x.movimientoId === mov)).toBe(false);
    expect(await contarHechos(T_A, mov)).toBe(0);
    expect(await contarHechos(T_B, mov)).toBe(1);
  });

  it("drena el outbox de COSTOS a vacío tras las materializaciones", async () => {
    await costosRuntime().platform.kernel.outboxProcessor.processPending();
    const pend = await costosRuntime().platform.kernel.outboxProcessor.processPending();
    expect(pend.ok).toBe(true);
  });
});
