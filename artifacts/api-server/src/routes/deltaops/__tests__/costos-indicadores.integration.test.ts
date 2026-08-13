/**
 * DGP-021.4-B/C · INDICADORES económicos (costo/hora, costo/km), COMPARATIVA y
 * TENDENCIA — pruebas END-TO-END contra PostgreSQL real (§23/§24).
 *
 * Ejercita `indicadoresActivo` / `comparativaActivos` / `tendenciaActivo`, que
 * componen los CONTRATOS PÚBLICOS reales:
 *   - NUMERADOR (dinero EXACTO): mano de obra (deltaops.mdo_valoraciones) +
 *     materiales/otros (deltaops.cos_hechos) ⇒ totales por moneda en micros BigInt.
 *   - DENOMINADOR (medidor EXACTO): deltaops.utl_lecturas_read con los campos
 *     ADITIVOS `valor_exacto` (decimal exacto) y `es_reinicio` (ancla de tramo),
 *     leídos por la query pública `modulo.utilizacion.lecturas`.
 *
 * Cobertura §23: costo/hora exacto, costo/km exacto, PRECISIÓN float-insegura,
 * multimoneda separada, CERO real vs ausencia, lecturas anuladas/inconsistentes
 * excluidas, REINICIO por tramos (nunca cruza), activo SIN odómetro ⇒ NO_APLICA,
 * costo SIN utilización y utilización SIN costo, división por cero prohibida,
 * comparativa por moneda sin ranking cross-moneda, tendencia con huecos (sin 0),
 * tenant A/B, RBAC. Dinero string-only (se afirma dígito a dígito).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { costosRuntime } from "../costos-runtime";
import { resolverPeriodo, type Sesion } from "../costos-composicion";
import { indicadoresActivo, comparativaActivos, tendenciaActivo } from "../costos-indicadores";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const RUN = randomUUID().slice(0, 8);
const T_A = `cos-ind-a-${RUN}`;
const T_B = `cos-ind-b-${RUN}`;

const SUP = (tenant: string): Sesion => ({ userId: "u-sup", rol: "SUPERVISOR", tenant, identityId: "id-sup" });
const TEC = (tenant: string): Sesion => ({ userId: "u-tec", rol: "TECNICO", tenant, identityId: "id-sup" });

const TOTAL = resolverPeriodo("total", new Date("2024-06-01T00:00:00.000Z"));

// Activos del escenario.
const ACT_HORA = "act-hora";     // horómetro: costo/hora exacto
const ACT_KM = "act-km";         // odómetro: costo/km exacto (multimoneda)
const ACT_RESET = "act-reset";   // horómetro con REINICIO intermedio
const ACT_NOODO = "act-noodo";   // sólo horómetro ⇒ km NO_APLICA
const ACT_SINLECT = "act-sinlect"; // costo pero sin lecturas ⇒ SIN_DATOS
const ACT_SINCOSTO = "act-sincosto"; // lecturas pero sin costo ⇒ SIN_DATOS
const ACT_PRECISION = "act-precision"; // 0.1+0.2 float-inseguro

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

/** Siembra una valoración de mano de obra VALORADA (dinero string-safe). */
async function seedValoracion(tenant: string, activoId: string, moneda: string, costo: string, valoradoAt: string): Promise<void> {
  const sesionId = `ses-${randomUUID().slice(0, 8)}`;
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.mdo_valoraciones
         (tenant_id, sesion_id, orden_id, activo_id, identity_id, categoria_clave, tarifa_id, tarifa_valor,
          moneda, unidad, efectivo_ms, costo, estado, iniciado_at, valorado_at, valorado_por)
       VALUES ($1,$2,$3,$4,'id-sup','MEC','tar-1',$5::numeric,$6,'HORA',3600000,$7::numeric,'VALORADA',$8,$9,'sistema')`,
      [tenant, sesionId, `ot-${activoId}`, activoId, costo, moneda, costo, "2024-05-02T08:00:00.000Z", valoradoAt],
    );
  });
}

/**
 * Siembra una lectura de medidor en el read model público, con los campos ADITIVOS
 * `valor_exacto` (decimal exacto string) y `es_reinicio`. `valor` (float) coincide
 * con el número; el cálculo económico usa SÓLO `valor_exacto`.
 */
async function seedLectura(
  tenant: string, activoId: string, tipoMedidor: "horometro" | "odometro",
  valorExacto: string, fechaHora: string,
  opts: { estado?: string; inconsistente?: boolean; esReinicio?: boolean } = {},
): Promise<void> {
  const id = `lc-${randomUUID().slice(0, 8)}`;
  const unidad = tipoMedidor === "horometro" ? "h" : "km";
  const estado = opts.estado ?? "vigente";
  const inconsistente = opts.inconsistente ?? false;
  const esReinicio = opts.esReinicio ?? false;
  const datos = { id, activoId, tipoMedidor, valor: Number(valorExacto), unidad, fechaHora, estado, inconsistente };
  await conTenant(tenant, async (c) => {
    await c.query(
      `INSERT INTO deltaops.utl_lecturas_read
         (tenant_id, id, activo_id, tipo_medidor, valor, valor_exacto, es_reinicio, unidad, fecha_hora,
          identity_id, origen, estado, inconsistente, sincronizacion_activo, datos, last_event_id, actualizado_at)
       VALUES ($1,$2,$3,$4,$5::numeric,$6,$7,$8,$9,'id-sup','manual',$10,$11,'confirmada',$12::jsonb,$13,now())
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [tenant, id, activoId, tipoMedidor, valorExacto, valorExacto, esReinicio, unidad, new Date(fechaHora),
       estado, inconsistente, JSON.stringify(datos), randomUUID()],
    );
  });
}

function ratio(ind: any, moneda: string): string | undefined {
  return ind.porMoneda.find((p: any) => p.moneda === moneda)?.valor;
}

suite("DGP-021.4 · Indicadores económicos (costo/hora, costo/km) · PostgreSQL", { timeout: 90_000 }, () => {
  beforeAll(async () => {
    costosRuntime();

    // ACT_HORA: 200 CLP de mano de obra / Δhorómetro 100→150 = 50 h ⇒ 4.000000 CLP/h.
    await seedValoracion(T_A, ACT_HORA, "CLP", "200.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_A, ACT_HORA, "horometro", "100.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_A, ACT_HORA, "horometro", "150.000000", "2024-05-10T08:00:00Z");

    // ACT_KM: 1500 CLP + 20 USD / Δodómetro 1000→3000 = 2000 km ⇒ 0.75 CLP/km, 0.01 USD/km.
    await seedValoracion(T_A, ACT_KM, "CLP", "1500.000000", "2024-05-03T09:00:00.000Z");
    await seedValoracion(T_A, ACT_KM, "USD", "20.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_A, ACT_KM, "odometro", "1000.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_A, ACT_KM, "odometro", "3000.000000", "2024-05-10T08:00:00Z");

    // ACT_RESET: horómetro con REINICIO. Tramo1: 90→100 (=10). Reset a 0. Tramo2: 0→40 (=40).
    // Δ total exacto = 50 h. NUNCA resta el salto 100→0. Costo 100 CLP ⇒ 2.000000 CLP/h.
    await seedValoracion(T_A, ACT_RESET, "CLP", "100.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_A, ACT_RESET, "horometro", "90.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_A, ACT_RESET, "horometro", "100.000000", "2024-05-02T08:00:00Z");
    await seedLectura(T_A, ACT_RESET, "horometro", "0.000000", "2024-05-03T08:00:00Z", { esReinicio: true });
    await seedLectura(T_A, ACT_RESET, "horometro", "40.000000", "2024-05-04T08:00:00Z");

    // ACT_NOODO: sólo horómetro (sin odómetro) ⇒ costo/km NO_APLICA; costo/hora COMPLETO.
    await seedValoracion(T_A, ACT_NOODO, "CLP", "300.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_A, ACT_NOODO, "horometro", "10.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_A, ACT_NOODO, "horometro", "40.000000", "2024-05-10T08:00:00Z"); // 30 h ⇒ 10 CLP/h

    // ACT_SINLECT: costo pero SIN lecturas ⇒ SIN_DATOS_SUFICIENTES (nunca 0).
    await seedValoracion(T_A, ACT_SINLECT, "CLP", "999.000000", "2024-05-03T09:00:00.000Z");

    // ACT_SINCOSTO: lecturas (Δ>0) pero SIN costo ⇒ SIN_DATOS_SUFICIENTES.
    await seedLectura(T_A, ACT_SINCOSTO, "horometro", "5.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_A, ACT_SINCOSTO, "horometro", "25.000000", "2024-05-10T08:00:00Z");

    // ACT_PRECISION: Δ = 0.1+0.2 = 0.3 exacto (float-inseguro). Costo 3 CLP ⇒ 10.000000 CLP/h.
    // Lecturas 10.0 → 10.1 → 10.3 (dos pasos: 0.1 y 0.2). Con float, 0.1+0.2=0.30000000000000004.
    await seedValoracion(T_A, ACT_PRECISION, "CLP", "3.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_A, ACT_PRECISION, "horometro", "10.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_A, ACT_PRECISION, "horometro", "10.100000", "2024-05-02T08:00:00Z");
    await seedLectura(T_A, ACT_PRECISION, "horometro", "10.300000", "2024-05-03T08:00:00Z");

    // Tenant B (aislamiento): mismo activo con datos DISTINTOS.
    await seedValoracion(T_B, ACT_HORA, "CLP", "1000.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_B, ACT_HORA, "horometro", "0.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_B, ACT_HORA, "horometro", "10.000000", "2024-05-10T08:00:00Z"); // 10 h ⇒ 100 CLP/h
  });

  afterAll(async () => {
    for (const t of [T_A, T_B]) {
      await conTenant(t, async (c) => {
        for (const tabla of ["mdo_valoraciones", "cos_hechos", "utl_lecturas_read"]) {
          await c.query(`DELETE FROM deltaops.${tabla} WHERE tenant_id=$1`, [t]).catch(() => undefined);
        }
      });
    }
  });

  it("(1) costo/hora EXACTO por moneda: 200 CLP / 50 h = 4.000000 CLP/h", async () => {
    const r = await indicadoresActivo(SUP(T_A), ACT_HORA, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as any;
    expect(v.costoPorHora.estado).toBe("COMPLETO");
    expect(v.costoPorHora.delta).toBe("50.000000");
    expect(ratio(v.costoPorHora, "CLP")).toBe("4.000000");
    // Sin odómetro ⇒ km NO_APLICA (no 0).
    expect(v.costoPorKm.estado).toBe("NO_APLICA");
  });

  it("(2) costo/km EXACTO multimoneda: 1500 CLP y 20 USD / 2000 km", async () => {
    const r = await indicadoresActivo(SUP(T_A), ACT_KM, TOTAL);
    expect(r.ok && (r.value as any).costoPorKm.estado).toBe("COMPLETO");
    if (!r.ok) return;
    const km = (r.value as any).costoPorKm;
    expect(km.delta).toBe("2000.000000");
    expect(ratio(km, "CLP")).toBe("0.750000");
    expect(ratio(km, "USD")).toBe("0.010000");
    // Series por moneda separadas (nunca sumadas).
    expect(km.porMoneda.length).toBe(2);
  });

  it("(3) REINICIO: Δ se suma por tramos y NUNCA cruza el reinicio (50 h ⇒ 2.000000 CLP/h)", async () => {
    const r = await indicadoresActivo(SUP(T_A), ACT_RESET, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cph = (r.value as any).costoPorHora;
    expect(cph.delta).toBe("50.000000"); // 10 (tramo1) + 40 (tramo2), sin restar el salto a 0
    expect(cph.tramos).toBe(2);
    expect(ratio(cph, "CLP")).toBe("2.000000");
  });

  it("(4) activo SIN odómetro ⇒ costo/km NO_APLICA; costo/hora COMPLETO", async () => {
    const r = await indicadoresActivo(SUP(T_A), ACT_NOODO, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as any).costoPorKm.estado).toBe("NO_APLICA");
    expect(ratio((r.value as any).costoPorHora, "CLP")).toBe("10.000000");
  });

  it("(5) costo SIN utilización ⇒ SIN_DATOS_SUFICIENTES (ausencia ≠ 0)", async () => {
    const r = await indicadoresActivo(SUP(T_A), ACT_SINLECT, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as any).costoPorHora.estado).toBe("SIN_DATOS_SUFICIENTES");
    expect((r.value as any).costoPorHora.delta).toBeNull();
    expect((r.value as any).costoPorHora.porMoneda.length).toBe(0);
  });

  it("(6) utilización SIN costo ⇒ SIN_DATOS_SUFICIENTES (hay Δ pero sin numerador)", async () => {
    const r = await indicadoresActivo(SUP(T_A), ACT_SINCOSTO, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Hay avance (Δ=20) pero no hay dinero ⇒ ratio no calculable.
    expect((r.value as any).costoPorHora.estado).toBe("SIN_DATOS_SUFICIENTES");
    expect((r.value as any).costoPorHora.porMoneda.length).toBe(0);
  });

  it("(7) PRECISIÓN float-insegura: Δ=0.1+0.2=0.300000 EXACTO ⇒ 10.000000 CLP/h (no 9.999...)", async () => {
    const r = await indicadoresActivo(SUP(T_A), ACT_PRECISION, TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cph = (r.value as any).costoPorHora;
    // El denominador es EXACTO (string decimal), no el 0.30000000000000004 de float.
    expect(cph.delta).toBe("0.300000");
    expect(ratio(cph, "CLP")).toBe("10.000000");
  });

  it("(8) división por cero PROHIBIDA: Δ=0 (misma lectura) ⇒ SIN_DATOS, nunca throw/Infinity", async () => {
    const T_Z = `${T_A}-zero`;
    await seedValoracion(T_Z, "az", "CLP", "500.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_Z, "az", "horometro", "77.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_Z, "az", "horometro", "77.000000", "2024-05-10T08:00:00Z"); // Δ=0
    try {
      const r = await indicadoresActivo(SUP(T_Z), "az", TOTAL);
      expect(r.ok).toBe(true);
      if (r.ok) expect((r.value as any).costoPorHora.estado).toBe("SIN_DATOS_SUFICIENTES");
    } finally {
      await conTenant(T_Z, async (c) => {
        for (const t of ["mdo_valoraciones", "utl_lecturas_read"]) {
          await c.query(`DELETE FROM deltaops.${t} WHERE tenant_id=$1`, [T_Z]).catch(() => undefined);
        }
      });
    }
  });

  it("(9) tenant A/B AISLADOS: mismo activo, indicadores distintos", async () => {
    const a = await indicadoresActivo(SUP(T_A), ACT_HORA, TOTAL);
    const b = await indicadoresActivo(SUP(T_B), ACT_HORA, TOTAL);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(ratio((a.value as any).costoPorHora, "CLP")).toBe("4.000000");
    expect(ratio((b.value as any).costoPorHora, "CLP")).toBe("100.000000");
  });

  it("(10) comparativa: SERIES POR MONEDA, ordenadas por costo total; sin ranking cross-moneda", async () => {
    const r = await comparativaActivos(SUP(T_A), [ACT_HORA, ACT_KM], TOTAL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as any;
    // Una serie por moneda: CLP (ambos) y USD (sólo ACT_KM).
    const clp = v.rankingPorMoneda.find((m: any) => m.moneda === "CLP");
    const usd = v.rankingPorMoneda.find((m: any) => m.moneda === "USD");
    expect(clp).toBeDefined();
    expect(usd.activos.length).toBe(1); // USD sólo ACT_KM
    // CLP ordenado desc por total: ACT_KM(1500) antes de ACT_HORA(200).
    expect(clp.activos[0].activoId).toBe(ACT_KM);
    expect(clp.activos[0].total).toBe("1500.000000");
  });

  it("(11) tendencia mensual: mes con datos COMPLETO, meses sin datos SIN_DATOS (null, jamás 0)", async () => {
    const rango = resolverPeriodo("rango", new Date("2024-06-01T00:00:00.000Z"), "2024-04-01T00:00:00Z", "2024-06-30T23:59:59Z");
    const r = await tendenciaActivo(SUP(T_A), ACT_HORA, rango);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const puntos = (r.value as any).puntos as any[];
    const mayo = puntos.find((p) => p.mes === "2024-05");
    const abril = puntos.find((p) => p.mes === "2024-04");
    expect(mayo.estado).toBe("COMPLETO");
    expect(mayo.horas).toBe("50.000000");
    // Abril sin datos: nunca 0 artificial.
    expect(abril.estado).toBe("SIN_DATOS_SUFICIENTES");
    expect(abril.horas).toBeNull();
    expect(abril.costoPorMoneda).toBeNull();
  });

  it("(12b) lecturas ANULADAS/INCONSISTENTES se EXCLUYEN del denominador", async () => {
    const T_X = `${T_A}-excl`;
    // Válidas: 0 → 20 (Δ=20). Una anulada (estado!=vigente) y una inconsistente en 500
    // que, de contarse, inflarían el Δ. Deben ignorarse ⇒ Δ=20, 100 CLP/20 h = 5 CLP/h.
    await seedValoracion(T_X, "ax", "CLP", "100.000000", "2024-05-03T09:00:00.000Z");
    await seedLectura(T_X, "ax", "horometro", "0.000000", "2024-05-01T08:00:00Z");
    await seedLectura(T_X, "ax", "horometro", "500.000000", "2024-05-02T08:00:00Z", { estado: "anulada" });
    await seedLectura(T_X, "ax", "horometro", "600.000000", "2024-05-03T08:00:00Z", { inconsistente: true });
    await seedLectura(T_X, "ax", "horometro", "20.000000", "2024-05-04T08:00:00Z");
    try {
      const r = await indicadoresActivo(SUP(T_X), "ax", TOTAL);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const cph = (r.value as any).costoPorHora;
      expect(cph.delta).toBe("20.000000");
      expect(ratio(cph, "CLP")).toBe("5.000000");
    } finally {
      await conTenant(T_X, async (c) => {
        for (const t of ["mdo_valoraciones", "utl_lecturas_read"]) {
          await c.query(`DELETE FROM deltaops.${t} WHERE tenant_id=$1`, [T_X]).catch(() => undefined);
        }
      });
    }
  });

  it("(13) RBAC: TECNICO obtiene lectura (backend recorta su mano de obra); no rompe indicadores", async () => {
    const r = await indicadoresActivo(TEC(T_A), ACT_HORA, TOTAL);
    // El TECNICO ve su propia mano de obra (misma identidad id-sup en la semilla),
    // por lo que el indicador se compone sin error (recorte lo aplica el backend).
    expect(r.ok).toBe(true);
  });
});
