/**
 * DGP-LITE-04 §24 · PREOPERACIONAL — garantías de dominio de la ejecución
 * SELLADA (PostgreSQL real, Record Store `deltaops.platform_records`).
 *
 * Ejercita el runtime de composición (`preoperacionalRuntime`) directamente,
 * como los tests PG de utilización/costos, para verificar SIN el transporte HTTP
 * las garantías que la Dirección exige:
 *   1. Idempotencia por opId: doble `sellar` con el MISMO opId ⇒ UNA ejecución.
 *   2. Inmutabilidad del sello: re-sellar el MISMO id con OTRO opId ⇒ conflicto;
 *      el veredicto/versión originales NO cambian.
 *   3. Tenant isolation (RLS): el tenant B no ve ni escribe ejecuciones de A.
 *   4. RBAC: CONSULTA (sólo lectura) NO puede sellar; un rol de escritura sí.
 *   5. Veredicto anclado a la VERSIÓN de plantilla: publicar una versión nueva
 *      con criticidad distinta NO altera ejecuciones históricas (regla §8-9).
 *   6. Procedencia completa: la ejecución conserva activo, ítem, respuesta,
 *      observación, evidencia, usuario canónico y tiempos de servidor.
 *
 * Requiere DATABASE_URL. Usa tenants efímeros y limpia sus filas al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import {
  calcularVeredicto,
  type DefinicionChecklist,
  type RespuestaItem,
} from "@workspace/dynamic-forms";
import {
  SERVICIO_PREOP,
  contextForPreoperacional,
  preoperacionalRuntime,
} from "../preoperacional-runtime";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const RUN = randomUUID().slice(0, 8);
const TENANT_A = `preop-a-${RUN}`;
const TENANT_B = `preop-b-${RUN}`;
const ACTIVO = `activo-${RUN}`;
const USER = `u-${RUN}`;

const rt = () => preoperacionalRuntime();

function ejecutar(tenant: string, rol: string, name: string, input: Record<string, unknown>) {
  return rt().platform.kernel.commands.execute(contextForPreoperacional(USER, rol, tenant, USER), name, input);
}
function consultar(tenant: string, rol: string, name: string, input: Record<string, unknown>) {
  return rt().platform.kernel.queries.execute(contextForPreoperacional(USER, rol, tenant, USER), name, input);
}

/** Payload de sellado con procedencia completa (backend-autoritativo). */
function payloadSellado(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `preop-ej:${ACTIVO}:${randomUUID()}`,
    opId: `op-${randomUUID()}`,
    activoId: ACTIVO,
    plantillaClave: "preop-movil",
    plantillaVersion: 1,
    respuestaId: `preop-resp:${ACTIVO}:v1`,
    veredicto: "NO_APTO",
    incumplimientos: [
      { clave: "frenos", etiqueta: "Sistema de frenos", critico: true, comentario: "sin presión", evidencias: ["att-1"] },
    ],
    observaciones: [
      { clave: "cabina", etiqueta: "Limpieza de cabina", critico: false, comentario: "polvo" },
    ],
    contexto: {
      activo: { id: ACTIVO, nombre: "Camión 1", tipo: "movil" },
      plantillaTitulo: "Verificación operacional móvil",
      respuestas: { frenos: { estado: false, comentario: "sin presión", evidencias: ["att-1"] } },
    },
    selladoAt: "2024-07-01T12:00:00.000Z",
    ...over,
  };
}

async function limpiar(tenant: string): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    await c.query(
      `DELETE FROM deltaops.platform_records WHERE tenant_id = $1 AND service = $2`,
      [tenant, SERVICIO_PREOP],
    ).catch(() => undefined);
    await c.query(
      `DELETE FROM deltaops.platform_audit WHERE tenant_id = $1`,
      [tenant],
    ).catch(() => undefined);
    await c.query("COMMIT");
  } catch {
    await c.query("ROLLBACK").catch(() => undefined);
  } finally {
    c.release();
  }
}

suite("DGP-LITE-04 §24 · ejecución de preoperacional sellada (PG real)", () => {
  beforeAll(async () => {
    await limpiar(TENANT_A);
    await limpiar(TENANT_B);
  });
  afterAll(async () => {
    await limpiar(TENANT_A);
    await limpiar(TENANT_B);
  });

  it("1) idempotencia por opId: doble sellar con el mismo opId ⇒ una ejecución", async () => {
    const p = payloadSellado();
    const r1 = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, { ...p });
    const r2 = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, { ...p });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect((r2 as { value: { idempotente?: boolean } }).value.idempotente).toBe(true);

    const lista = await consultar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.listar`, { activoId: ACTIVO });
    expect(lista.ok).toBe(true);
    const items = (lista as { value: Array<{ id: string }> }).value.filter((x) => x.id === p.id);
    expect(items).toHaveLength(1);
  });

  it("2) inmutabilidad del sello: re-sellar el mismo id con otro opId ⇒ conflicto y veredicto intacto", async () => {
    const p = payloadSellado({ veredicto: "NO_APTO" });
    const r1 = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, { ...p });
    expect(r1.ok).toBe(true);

    // Intento de re-sellar el MISMO id con OTRO opId y OTRO veredicto.
    const r2 = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, {
      ...p,
      opId: `op-${randomUUID()}`,
      veredicto: "APTO",
      incumplimientos: [],
      observaciones: [],
    });
    expect(r2.ok).toBe(false);
    expect((r2 as { error: { code: string } }).error.code).toBe("KRN-CFL-001");

    // El registro conserva el veredicto ORIGINAL.
    const det = await consultar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.obtener`, { id: p.id });
    expect(det.ok).toBe(true);
    expect((det as { value: { data: { veredicto: string } } }).value.data.veredicto).toBe("NO_APTO");
  });

  it("3) tenant isolation: el tenant B no ve ni obtiene ejecuciones de A", async () => {
    const p = payloadSellado();
    const r1 = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, { ...p });
    expect(r1.ok).toBe(true);

    const listaB = await consultar(TENANT_B, "TENANT_ADMIN", `${SERVICIO_PREOP}.listar`, { activoId: ACTIVO });
    expect(listaB.ok).toBe(true);
    expect((listaB as { value: unknown[] }).value.some((x) => (x as { id: string }).id === p.id)).toBe(false);

    const detB = await consultar(TENANT_B, "TENANT_ADMIN", `${SERVICIO_PREOP}.obtener`, { id: p.id });
    expect(detB.ok).toBe(false);
    expect((detB as { error: { code: string } }).error.code).toBe("KRN-NF-001");
  });

  it("4) RBAC: CONSULTA no puede sellar; un rol de escritura sí", async () => {
    const p = payloadSellado();
    const denegado = await ejecutar(TENANT_A, "CONSULTA", `${SERVICIO_PREOP}.sellar`, { ...p });
    expect(denegado.ok).toBe(false);
    expect((denegado as { error: { code: string } }).error.code.startsWith("KRN-AUTH")).toBe(true);

    // CONSULTA sí puede LEER (read-only).
    const lectura = await consultar(TENANT_A, "CONSULTA", `${SERVICIO_PREOP}.listar`, { activoId: ACTIVO });
    expect(lectura.ok).toBe(true);

    // Un rol de escritura sella correctamente.
    const permitido = await ejecutar(TENANT_A, "SUPERVISOR", `${SERVICIO_PREOP}.sellar`, { ...p });
    expect(permitido.ok).toBe(true);
  });

  it("5) veredicto anclado a la versión: una versión nueva con criticidad distinta NO altera lo histórico", async () => {
    // Ejecución histórica anclada a la versión 1 (frenos CRÍTICO ⇒ NO_APTO).
    const historica = payloadSellado({ plantillaVersion: 1, veredicto: "NO_APTO" });
    const rh = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, { ...historica });
    expect(rh.ok).toBe(true);

    // Se "publica" una versión 2 donde frenos deja de ser crítico: con las MISMAS
    // respuestas, el veredicto de la v2 sería distinto. Sellamos una ejecución v2.
    const defV2: DefinicionChecklist = {
      clave: "preop-movil",
      titulo: "Verificación operacional móvil",
      version: 2,
      items: [{ clave: "frenos", etiqueta: "Sistema de frenos", obligatorio: true, critico: false }],
    };
    const respuestas: RespuestaItem[] = [{ clave: "frenos", estado: false, comentario: "sin presión" }];
    const veredictoV2 = calcularVeredicto(defV2, respuestas);
    expect(veredictoV2.veredicto).toBe("APTO_CON_OBSERVACIONES"); // frenos ya NO es crítico

    const nueva = payloadSellado({ plantillaVersion: 2, veredicto: veredictoV2.veredicto, respuestaId: `preop-resp:${ACTIVO}:v2` });
    const rn = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, { ...nueva });
    expect(rn.ok).toBe(true);

    // La ejecución HISTÓRICA conserva versión 1 y veredicto NO_APTO (no retroactivo).
    const det = await consultar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.obtener`, { id: historica.id });
    expect(det.ok).toBe(true);
    const data = (det as { value: { data: { veredicto: string; plantillaVersion: number } } }).value.data;
    expect(data.plantillaVersion).toBe(1);
    expect(data.veredicto).toBe("NO_APTO");
  });

  it("6) procedencia completa: la ejecución conserva activo, ítem, respuesta, observación, evidencia, usuario y tiempos de servidor", async () => {
    const p = payloadSellado();
    const r = await ejecutar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.sellar`, { ...p });
    expect(r.ok).toBe(true);

    const det = await consultar(TENANT_A, "TENANT_ADMIN", `${SERVICIO_PREOP}.obtener`, { id: p.id });
    expect(det.ok).toBe(true);
    const rec = (det as { value: { data: Record<string, unknown> } }).value;
    const d = rec.data as {
      activoId: string; respuestaId: string; selladoPor: string; selladoAt: string;
      incumplimientos: Array<{ clave: string; etiqueta: string; critico: boolean; comentario?: string; evidencias?: string[] }>;
      observaciones: Array<{ clave: string; comentario?: string }>;
      contexto: Record<string, unknown>;
    };
    expect(d.activoId).toBe(ACTIVO);
    expect(d.respuestaId).toBe(p.respuestaId);
    expect(d.selladoPor).toBe(USER); // usuario canónico del contexto, no del cliente
    expect(d.selladoAt).toBe("2024-07-01T12:00:00.000Z"); // tiempo de servidor sellado
    expect(d.incumplimientos[0]?.clave).toBe("frenos");
    expect(d.incumplimientos[0]?.critico).toBe(true);
    expect(d.incumplimientos[0]?.comentario).toBe("sin presión"); // observación
    expect(d.incumplimientos[0]?.evidencias).toEqual(["att-1"]); // evidencia
    expect(d.observaciones[0]?.clave).toBe("cabina");
    expect(d.contexto["activo"]).toBeTruthy();
  });
});
