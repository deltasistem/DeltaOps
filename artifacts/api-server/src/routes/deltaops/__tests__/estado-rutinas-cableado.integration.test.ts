/**
 * DELTAOPS LITE-08 · REGRESIÓN del CABLEADO REAL de `GET
 * /planes/activos/:id/estado-rutinas` (arquitecto · 3 hallazgos severos).
 *
 * BUG 1 (BLOQUEANTE): `medidoresActualesDeActivo` leía `d["horometro"]/["odometro"]`
 * del resultado de `modulo.activos.detalle` esperando un NÚMERO, pero el detalle
 * devuelve `ActivoReadRow` cuyos medidores viven en `datos` como VALUE-OBJECT
 * `{ valor, unidad, fecha }`. El filtro `typeof v === "number"` descartaba SIEMPRE
 * ambos ⇒ rutinas por USO evaluadas sin medidores (nunca faltante/vencido real).
 *
 * BUG 2 (BLOQUEANTE): la consulta sólo pasaba `activoId`; nunca derivaba la
 * clasificación real (categoria/familia/empresa/ubicacion/...). `alcanceIncluye`
 * exige esas dimensiones para planes segmentados ⇒ desaparecían del resultado.
 *
 * BUG 3 (SEGURIDAD/RBAC · DGP-023): el GET leía Activos con
 * `contextForActivos(actorId, "admin", tenant)` HARDCODEADO ⇒ elevación de
 * privilegios. Debe usar el ROL REAL de la sesión y FALLAR CERRADO si el dominio
 * de Activos deniega la lectura (KRN-AUTH ⇒ 403), nunca continuar vacío.
 *
 * DIVERGENCIA test/producción que ocultó los bugs: no había prueba que ejercitara
 * el shape REAL de `ActivoReadRow` (VO en `datos`) ni el camino de composición.
 * Este archivo cierra el gap contra PostgreSQL real.
 *
 * Requiere DATABASE_URL. Tenant ÚNICO por corrida; limpia sus filas al final.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { createExecutionContext } from "@workspace/kernel";
import { alcanceIncluye, crearAlcanceActivos } from "@workspace/module-planes";
import { contextoRutinasDeActivo } from "../planes-runtime";
import { activosRuntime, contextForActivos } from "../activos-runtime";

const TENANT = `rut-cbl-${randomUUID().slice(0, 8)}`;
const ACTIVO_ID = randomUUID();
const ACTOR = "9001";

// Clasificación y medidores REALES que quedarán en `datos` (snapshot del activo),
// con los medidores como VALUE-OBJECT `{ valor, unidad, fecha }` (el shape que
// rompía la extracción por número plano).
const CATEGORIA = "bombas";
const FAMILIA = "centrifugas";
const EMPRESA = "delta-mineria";
const UBICACION_ID = "planta-norte";
const HOROMETRO_VALOR = 1250.5;
const ODOMETRO_VALOR = 84210;

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
  const datos = {
    id: ACTIVO_ID,
    tenantId: TENANT,
    codigoEmpresarial: "BC-001",
    nombre: "Bomba centrífuga norte",
    estado: "OPERATIVO",
    tipo: "equipo",
    categoria: CATEGORIA,
    familia: FAMILIA,
    subfamilia: null,
    empresa: EMPRESA,
    proyecto: null,
    // `ubicacion` es un VO { ubicacionId, etiqueta, ... }: el alcance compara por clave.
    ubicacion: { ubicacionId: UBICACION_ID, etiqueta: "Planta Norte" },
    // Medidores como VALUE-OBJECT (NO número plano): éste era el bug #1.
    horometro: { valor: HOROMETRO_VALOR, unidad: "h", fecha: "2024-06-01T00:00:00.000Z" },
    odometro: { valor: ODOMETRO_VALOR, unidad: "km", fecha: "2024-06-01T00:00:00.000Z" },
    version: 1,
  };
  await conTenant(async (c) => {
    await c.query(
      `INSERT INTO deltaops.act_activos_read
         (tenant_id, id, codigo_empresarial, nombre, estado, tipo, criticidad, ubicacion_id,
          datos, version, last_event_id, actualizado_at)
       VALUES ($1,$2,$3,$4,'OPERATIVO','equipo',NULL,$5,$6::jsonb,1,$7,now())
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [TENANT, ACTIVO_ID, "BC-001", "Bomba centrífuga norte", UBICACION_ID, JSON.stringify(datos), randomUUID()],
    );
  });
}, 60_000);

afterAll(async () => {
  await conTenant(async (c) => {
    await c.query(`DELETE FROM deltaops.act_activos_read WHERE tenant_id=$1`, [TENANT]).catch(() => undefined);
  });
});

describe("LITE-08 · estado-rutinas · cableado REAL (3 hallazgos del arquitecto)", () => {
  it("(a) extrae MEDIDORES reales del VO `{valor}` del ActivoReadRow (no descarta por número)", async () => {
    // Rol REAL de la sesión (lector/CONSULTA legacy = "lector"): tiene lectura.
    const r = await contextoRutinasDeActivo(TENANT, ACTOR, "lector", ACTIVO_ID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // ANTES del fix: {} (el filtro typeof number descartaba ambos VO).
      expect(r.value.medidores["horometro"]).toBe(HOROMETRO_VALOR);
      expect(r.value.medidores["odometro"]).toBe(ODOMETRO_VALOR);
    }
  });

  it("(b) deriva el CANDIDATO de alcance del activo; un plan SEGMENTADO por categoría/familia lo incluye", async () => {
    const r = await contextoRutinasDeActivo(TENANT, ACTOR, "lector", ACTIVO_ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value.candidato;
    expect(c.categoria).toBe(CATEGORIA);
    expect(c.familia).toBe(FAMILIA);
    expect(c.empresa).toBe(EMPRESA);
    expect(c.ubicacion).toBe(UBICACION_ID); // extraído del VO ubicacion.ubicacionId

    // Plan segmentado por categoría+familia (NO por activo puntual): el candidato
    // derivado DEBE caer en alcance (antes: candidato vacío ⇒ descartado).
    const alcance = crearAlcanceActivos({ categorias: [CATEGORIA], familias: [FAMILIA] });
    expect(alcance.ok).toBe(true);
    if (alcance.ok) {
      expect(alcanceIncluye(alcance.value, c)).toBe(true);
      // Control negativo: otra categoría NO incluye a este activo.
      const otro = crearAlcanceActivos({ categorias: ["motores"] });
      if (otro.ok) expect(alcanceIncluye(otro.value, c)).toBe(false);
    }
  });

  it("(c) SEGURIDAD fail-closed: principal SIN `modulo.activos.read` ⇒ el detalle deniega (KRN-AUTH)", async () => {
    // Un principal SIN el permiso de lectura de Activos (p.ej. una cadena de
    // composición mal formada o un rol sin entitlement) NO debe poder leer el
    // detalle: el dominio de Activos deniega con KRN-AUTH, que la ruta HTTP mapea
    // a 403. Comprobamos que la autorización REAL rechaza (no elevación).
    const ctxSinActivos = createExecutionContext({
      principal: { id: ACTOR, rol: "sin-activos", permisos: ["platform.config.read"], capacidades: [] },
      metadata: { tenantId: TENANT },
    });
    const det = await activosRuntime().platform.kernel.queries.execute(
      ctxSinActivos,
      "modulo.activos.detalle",
      { id: ACTIVO_ID },
    );
    expect(det.ok).toBe(false);
    if (!det.ok) expect(det.error.code.startsWith("KRN-AUTH")).toBe(true);
  });

  it("(c') el ROL REAL con lectura sí resuelve (no hay elevación innecesaria a admin)", async () => {
    // El lector legítimo lee su detalle; el fix NO eleva a admin para lograrlo.
    const ctxLector = contextForActivos(ACTOR, "lector", TENANT);
    const det = await activosRuntime().platform.kernel.queries.execute(
      ctxLector,
      "modulo.activos.detalle",
      { id: ACTIVO_ID },
    );
    expect(det.ok).toBe(true);
  });
});
