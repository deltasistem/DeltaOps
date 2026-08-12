/**
 * DGP-020.3 (revisión R4) · REGRESIÓN del CABLEADO REAL de la valoración.
 *
 * BUG BLOQUEANTE (§41, encontrado en vivo): la valoración orquestada NUNCA se
 * materializaba. `procesar-sesion` fallaba con `404 No encontrado: sesion`
 * (KRN-NF-001) aunque la sesión estaba CERRADA y `ord_sesion_duraciones_read`
 * tenía la fila.
 *
 * CAUSA RAÍZ: el contrato público `modulo.ordenes.sesion.duraciones` devuelve
 * DOS shapes distintas según el criterio:
 *   - por `sesionId` ⇒ `{ duraciones: <fila | null> }`  (OBJETO o null)
 *   - por `ordenId`  ⇒ `{ duraciones: <fila[]> }`         (ARREGLO)
 * El adaptador real `ordenesSesionPort` (manodeobra-runtime) normalizaba SÓLO el
 * ARREGLO (`filasDuraciones`), así que la ruta por `sesionId` — la que usan
 * `valoracion.procesar-sesion` y el disparo fail-safe tras el cierre — siempre
 * veía `[]` ⇒ sesión "no encontrada" ⇒ 404 y valoración jamás creada.
 *
 * DIVERGENCIA test/producción (el gap que ocultó el bug): TODAS las suites del
 * módulo usan `FakeOrdenesSesionPort` (implementa `duracionesDeSesion`
 * directamente devolviendo un objeto de dominio), así que NUNCA ejercitaron el
 * shape `{ duraciones: <objeto> }` del contrato real. Este test cierra ese gap:
 * ejercita la COMPOSICIÓN REAL del api-server (`manodeobraRuntime()` +
 * `ordenesSesionPort` reales) contra PostgreSQL.
 *
 * Requiere DATABASE_URL. Usa un tenant ÚNICO por corrida (aislamiento de la BD
 * dev compartida) y limpia sus filas al final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { calcularCosto, MODULO } from "@workspace/module-manodeobra";
import {
  manodeobraRuntime,
  contextServicioManodeobra,
} from "../manodeobra-runtime";

const TENANT = `mdo-cbl-${randomUUID().slice(0, 8)}`;
const ORDEN = `ot-${randomUUID().slice(0, 8)}`;
const IDENTITY = randomUUID();
const CATEGORIA = "tecnico-mecanico"; // clave de categoría (no se valida aquí)
const EFECTIVO_MS = 20139; // MISMO valor que la sesión real del reporte §41
const TARIFA_VALOR = "40000"; // tarifa vigente en iniciadoAt (NO la posterior 50000)
const MONEDA = "CLP";

// iniciadoAt/cerradoAt deterministas: la tarifa cubre [desde, ∞) alrededor de estos.
const INICIADO_AT = new Date("2024-06-01T12:00:00.000Z");
const CERRADO_AT = new Date(INICIADO_AT.getTime() + EFECTIVO_MS);
const TARIFA_DESDE = new Date("2024-01-01T00:00:00.000Z"); // vigente en iniciadoAt

const SESION_ID = randomUUID();

/** Inserta filas respetando RLS (set_config app.tenant_id en la misma tx). */
async function conTenant<T>(fn: (c: { query: (q: string, p?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT]);
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

beforeAll(async () => {
  await conTenant(async (c) => {
    // Sesión CERRADA en el READ MODEL de Órdenes (autoridad del tiempo efectivo).
    await c.query(
      `INSERT INTO deltaops.ord_sesion_duraciones_read
         (tenant_id, sesion_id, orden_id, activo_id, identity_id, estado,
          efectivo_ms, pausado_ms, transcurrido_ms, pausas, abierta,
          iniciado_at, cerrado_at, last_event_id, actualizado_at)
       VALUES ($1,$2,$3,NULL,$4,'CERRADA',$5,0,$5,0,false,$6,$7,$8,now())
       ON CONFLICT (tenant_id, sesion_id) DO NOTHING`,
      [TENANT, SESION_ID, ORDEN, IDENTITY, EFECTIVO_MS, INICIADO_AT.toISOString(), CERRADO_AT.toISOString(), randomUUID()],
    );
    // Recurso ACTIVO del técnico (categoría con tarifa vigente).
    await c.query(
      `INSERT INTO deltaops.mdo_recursos
         (tenant_id, identity_id, categoria_clave, estado, creado_at, actualizado_at, creado_por, actualizado_por)
       VALUES ($1,$2,$3,'ACTIVO',now(),now(),'test','test')
       ON CONFLICT (tenant_id, identity_id) DO NOTHING`,
      [TENANT, IDENTITY, CATEGORIA],
    );
    // Tarifa VIGENTE 40000 abierta desde antes de iniciadoAt (la que debe usarse).
    await c.query(
      `INSERT INTO deltaops.mdo_tarifas
         (id, tenant_id, sujeto_tipo, sujeto_id, valor, moneda, unidad, vigencia_desde, vigencia_hasta, estado, creado_at, creado_por, actualizado_at, actualizado_por)
       VALUES ($1,$2,'CATEGORIA',$3,$4::numeric,$5,'HORA',$6,NULL,'VIGENTE',now(),'test',now(),'test')
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [randomUUID(), TENANT, CATEGORIA, TARIFA_VALOR, MONEDA, TARIFA_DESDE.toISOString()],
    );
  });
}, 60_000);

afterAll(async () => {
  await conTenant(async (c) => {
    for (const t of ["mdo_valoraciones", "mdo_recibos", "mdo_eventos", "mdo_tarifas", "mdo_recursos"]) {
      await c.query(`DELETE FROM deltaops.${t} WHERE tenant_id=$1`, [TENANT]).catch(() => undefined);
    }
    await c.query(`DELETE FROM deltaops.ord_sesion_duraciones_read WHERE tenant_id=$1`, [TENANT]).catch(() => undefined);
  });
});

describe("DGP-020.3 · cableado REAL de la valoración (regresión §41)", () => {
  it("el puerto real duracionesDeSesion resuelve el shape {duraciones:<objeto>} (no null)", async () => {
    // Camino EXACTO que estaba roto: consultar por sesionId a través del
    // adaptador de producción `ordenesSesionPort` (compuesto en manodeobraRuntime).
    const r = await manodeobraRuntime().adapters.ordenes.duracionesDeSesion(TENANT, SESION_ID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toBeNull(); // ANTES del fix: null ⇒ 404 sesion
      expect(r.value?.sesionId).toBe(SESION_ID);
      expect(r.value?.estado).toBe("CERRADA");
      expect(r.value?.efectivoMs).toBe(EFECTIVO_MS);
    }
  });

  it("procesar-sesion (composición REAL) ⇒ VALORADA con la tarifa vigente en iniciadoAt", async () => {
    const ctx = contextServicioManodeobra(TENANT);
    const res = await manodeobraRuntime().platform.kernel.commands.execute(
      ctx,
      `${MODULO}.valoracion.procesar-sesion`,
      { sesionId: SESION_ID, ordenId: ORDEN },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const v = res.value as Record<string, unknown>;
      expect(v["estado"]).toBe("VALORADA");
      expect(v["tarifaValor"]).toBe("40000.000000"); // 40000, NO 50000
      expect(v["moneda"]).toBe(MONEDA);
      expect(v["efectivoMs"]).toBe(EFECTIVO_MS);
      // Costo EXACTO derivado del dominio (fuente única de verdad monetaria).
      const esperado = calcularCosto(EFECTIVO_MS, TARIFA_VALOR);
      expect(esperado.ok).toBe(true);
      if (esperado.ok) expect(v["costo"]).toBe(esperado.value);
    }
  });

  it("procesar-sesion es IDEMPOTENTE por (tenant, sesionId)", async () => {
    const ctx = contextServicioManodeobra(TENANT);
    const res = await manodeobraRuntime().platform.kernel.commands.execute(
      ctx,
      `${MODULO}.valoracion.procesar-sesion`,
      { sesionId: SESION_ID, ordenId: ORDEN },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const v = res.value as Record<string, unknown>;
      expect(v["yaExistia"]).toBe(true); // no duplica: reprocesar es no-op ok
      expect(v["estado"]).toBe("VALORADA");
    }
  });
});
