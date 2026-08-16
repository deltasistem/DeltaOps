/**
 * DELTAOPS FINAL-02 §31 · Informes operacionales y exportación (HTTP real, PG).
 *
 * Ejercita el ROUTER REAL de /api/deltaops/informes montado en Express, con
 * runtimes reales sobre PostgreSQL y tenants efímeros A/B. Verifica:
 *   - Catálogo servido con filtros declarados.
 *   - 401 sin sesión; CONSULTA (solo lectura) SÍ consulta y SÍ exporta.
 *   - AISLAMIENTO DE TENANT: el dataset del tenant A jamás contiene filas del B.
 *   - Filtros reales (activoId, rango de fechas inclusivo) aplicados por builder.
 *   - Paginación offset/limit con total del conjunto completo.
 *   - «Lo que se ve = lo que se exporta»: el CSV trae exactamente las filas del
 *     dataset (mismo builder, mismos filtros), sin paginar.
 *   - centroCosto inexistente ⇒ «—» en el CSV (nunca valores inventados).
 *   - Lecturas inconsistentes VISIBLES y marcadas (no se ocultan).
 *   - La exportación queda AUDITADA (job platform.export en platform_audit).
 *
 * Requiere DATABASE_TEST_URL (gate destructivo). Limpia sus tenants al final.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { poolDestructivo as pool, suiteDestructiva } from "../../../test-support/pg-destructivo";
import informesRouter from "../informes-module";
import { activosRuntime, contextForActivos } from "../activos-runtime";
import { utilizacionRuntime, contextForUtilizacion } from "../utilizacion-runtime";

const suite = suiteDestructiva();

const RUN = randomUUID().slice(0, 8);
const TENANT_A = `inf-a-${RUN}`;
const TENANT_B = `inf-b-${RUN}`;
const ACTIVO_A1 = randomUUID();
const ACTIVO_A2 = randomUUID();
const ACTIVO_B1 = randomUUID();

let sesionActual: { deltaopsUserId: number; rolCanonico?: string } | null = null;
let server: Server;
let baseUrl = "";
const userIds = new Map<string, number>(); // `${tenant}:${rol}` → id

function construirApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { session: unknown }).session = sesionActual ?? undefined;
    next();
  });
  app.use("/api", informesRouter);
  return app;
}

async function crearUsuario(tenant: string, rolCanonico: string, rolLegacy: string): Promise<number> {
  const email = `${rolCanonico.toLowerCase()}-${randomUUID().slice(0, 6)}@informes.test`;
  const r = await pool.query(
    `INSERT INTO deltaops.users (email, nombre, rol, tenant, password_hash)
     VALUES ($1, $2, $3, $4, 'x') RETURNING id`,
    [email, `Informes ${rolCanonico}`, rolLegacy, tenant],
  );
  return Number(r.rows[0].id);
}

function conSesion(tenant: string, rolCanonico: string): void {
  const id = userIds.get(`${tenant}:${rolCanonico}`);
  if (!id) throw new Error(`Usuario no sembrado: ${tenant}:${rolCanonico}`);
  sesionActual = { deltaopsUserId: id, rolCanonico };
}

async function get(path: string): Promise<{ status: number; json: () => Promise<unknown>; text: () => Promise<string> }> {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, json: () => res.json(), text: () => res.text() };
}

async function seedActivo(tenant: string, id: string, codigo: string): Promise<void> {
  const rt = activosRuntime();
  const ctx = contextForActivos("seed-informes", "admin", tenant);
  const cats: Array<[string, string, string]> = [
    ["tipos", "movil", "Móvil"],
    ["categorias", "vehiculo", "Vehículo"],
    ["familias", "camion", "Camión"],
    ["monedas", "USD", "Dólar"],
    ["criticidades", "alta", "Alta"],
  ];
  for (const [catalogo, clave, etiqueta] of cats) {
    const r = await rt.platform.kernel.commands.execute(ctx, "modulo.activos.catalogo.upsert", { catalogo, clave, etiqueta });
    if (!r.ok) throw new Error(`Catálogo ${catalogo}: ${r.error.code}`);
  }
  const r = await rt.platform.kernel.commands.execute(ctx, "modulo.activos.crear", {
    id,
    codigoEmpresarial: codigo,
    nombre: `Equipo ${codigo}`,
    tipo: "movil",
    categoria: "vehiculo",
    familia: "camion",
    criticidad: "alta",
    // SIN centroCosto: el informe debe mostrar «—», jamás inventar.
  });
  if (!r.ok) throw new Error(`Crear activo ${codigo}: ${r.error.code} ${r.error.message}`);
  await rt.platform.kernel.outboxProcessor.processPending();
}

async function seedLectura(tenant: string, activoId: string, valor: number, fechaHora: string, n: number): Promise<void> {
  const rt = utilizacionRuntime();
  const ctx = contextForUtilizacion(`seed-${n}`, "admin", tenant);
  const r = await rt.platform.kernel.commands.execute(ctx, "modulo.utilizacion.registrar-lectura", {
    id: randomUUID(),
    opId: `op-inf-lec-${RUN}-${n}`,
    activoId,
    tipoMedidor: "horometro",
    valor,
    unidad: "h",
    fechaHora,
    origen: "manual",
  });
  if (!r.ok) throw new Error(`Lectura ${n}: ${r.error.code} ${r.error.message}`);
  await rt.platform.kernel.outboxProcessor.processPending();
}

async function seedTanqueo(tenant: string, activoId: string, litros: number, fechaHora: string, n: number): Promise<void> {
  const rt = utilizacionRuntime();
  const ctx = contextForUtilizacion(`seed-${n}`, "admin", tenant);
  const r = await rt.platform.kernel.commands.execute(ctx, "modulo.utilizacion.registrar-tanqueo", {
    id: randomUUID(),
    opId: `op-inf-tan-${RUN}-${n}`,
    activoId,
    litros,
    fechaHora,
    tipoCombustible: "diesel",
  });
  if (!r.ok) throw new Error(`Tanqueo ${n}: ${r.error.code} ${r.error.message}`);
  await rt.platform.kernel.outboxProcessor.processPending();
}

beforeAll(async () => {
  // Usuarios por tenant/rol (la sesión inyecta rolCanonico como producción).
  userIds.set(`${TENANT_A}:TENANT_ADMIN`, await crearUsuario(TENANT_A, "TENANT_ADMIN", "admin"));
  userIds.set(`${TENANT_A}:CONSULTA`, await crearUsuario(TENANT_A, "CONSULTA", "lector"));
  userIds.set(`${TENANT_B}:TENANT_ADMIN`, await crearUsuario(TENANT_B, "TENANT_ADMIN", "admin"));

  await seedActivo(TENANT_A, ACTIVO_A1, `INF-A1-${RUN}`);
  await seedActivo(TENANT_A, ACTIVO_A2, `INF-A2-${RUN}`);
  await seedActivo(TENANT_B, ACTIVO_B1, `INF-B1-${RUN}`);

  // Lecturas del tenant A: 3 en A1 (una INCONSISTENTE por retroceso), 1 en A2.
  await seedLectura(TENANT_A, ACTIVO_A1, 100, "2026-03-01T08:00:00Z", 1);
  await seedLectura(TENANT_A, ACTIVO_A1, 150, "2026-03-10T08:00:00Z", 2);
  await seedLectura(TENANT_A, ACTIVO_A1, 120, "2026-03-20T08:00:00Z", 3); // retrocede ⇒ inconsistente
  await seedLectura(TENANT_A, ACTIVO_A2, 50, "2026-04-05T08:00:00Z", 4);
  // Lectura del tenant B (JAMÁS debe verse desde A).
  await seedLectura(TENANT_B, ACTIVO_B1, 999, "2026-03-15T08:00:00Z", 5);
  // Tanqueos A.
  await seedTanqueo(TENANT_A, ACTIVO_A1, 40, "2026-03-05T09:00:00Z", 6);
  await seedTanqueo(TENANT_A, ACTIVO_A2, 25, "2026-04-06T09:00:00Z", 7);

  const app = construirApp();
  server = createServer(app);
  await new Promise<void>((ok) => server.listen(0, ok));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Sin puerto de test");
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 120_000);

afterAll(async () => {
  await new Promise<void>((ok) => server?.close(() => ok()));
  const c = await pool.connect();
  try {
    for (const tenant of [TENANT_A, TENANT_B]) {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
      for (const tbl of [
        "utl_lecturas", "utl_lecturas_read", "utl_tanqueos", "utl_tanqueos_read",
        "utl_recibos", "utl_eventos", "utl_sync_receipts",
        "act_activos", "act_activos_read", "act_eventos", "act_catalogos",
        "platform_records", "platform_audit", "platform_outbox",
      ]) {
        await c.query(`DELETE FROM deltaops.${tbl} WHERE tenant_id = $1`, [tenant]).catch(() => undefined);
      }
      await c.query(`DELETE FROM deltaops.users WHERE tenant = $1`, [tenant]).catch(() => undefined);
      await c.query("COMMIT");
    }
  } catch {
    await c.query("ROLLBACK").catch(() => undefined);
  } finally {
    c.release();
  }
});

interface Ds {
  informe: string;
  columnas: { clave: string; titulo: string }[];
  filas: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

suite("FINAL-02 §31 · /api/deltaops/informes (HTTP real sobre PG)", () => {
  it("401 sin sesión", async () => {
    sesionActual = null;
    const r = await get("/api/deltaops/informes");
    expect(r.status).toBe(401);
  });

  it("catálogo con filtros declarados por informe", async () => {
    conSesion(TENANT_A, "TENANT_ADMIN");
    const r = await get("/api/deltaops/informes");
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as { informes: { clave: string; filtros: string[] }[] };
    const claves = cuerpo.informes.map((i) => i.clave);
    expect(claves).toContain("horometros");
    expect(claves).toContain("combustible");
    const horo = cuerpo.informes.find((i) => i.clave === "horometros");
    expect(horo?.filtros).toContain("activoId");
    expect(horo?.filtros).toContain("desde");
  });

  it("AISLAMIENTO: el dataset de A no contiene filas de B (y viceversa)", async () => {
    conSesion(TENANT_A, "TENANT_ADMIN");
    const dsA = (await (await get("/api/deltaops/informes/horometros?limit=500")).json()) as Ds;
    expect(dsA.total).toBe(4); // 3 de A1 + 1 de A2; JAMÁS la de B (999)
    expect(dsA.filas.some((f) => String(f.valor) === "999")).toBe(false);

    conSesion(TENANT_B, "TENANT_ADMIN");
    const dsB = (await (await get("/api/deltaops/informes/horometros?limit=500")).json()) as Ds;
    expect(dsB.total).toBe(1);
    expect(String(dsB.filas[0]?.valor)).toBe("999");
  });

  it("filtros reales: activoId y rango de fechas (hasta INCLUSIVO)", async () => {
    conSesion(TENANT_A, "TENANT_ADMIN");
    const porActivo = (await (await get(`/api/deltaops/informes/horometros?activoId=${ACTIVO_A2}`)).json()) as Ds;
    expect(porActivo.total).toBe(1);

    // hasta=2026-03-10 debe INCLUIR la lectura de ese día (fin de día).
    const rango = (await (await get("/api/deltaops/informes/horometros?desde=2026-03-01&hasta=2026-03-10")).json()) as Ds;
    expect(rango.total).toBe(2);
  });

  it("paginación: offset/limit con total del conjunto completo", async () => {
    conSesion(TENANT_A, "TENANT_ADMIN");
    const p1 = (await (await get("/api/deltaops/informes/horometros?limit=2&offset=0")).json()) as Ds;
    const p2 = (await (await get("/api/deltaops/informes/horometros?limit=2&offset=2")).json()) as Ds;
    expect(p1.total).toBe(4);
    expect(p1.filas.length).toBe(2);
    expect(p2.filas.length).toBe(2);
    const ids = new Set([...p1.filas, ...p2.filas].map((f) => JSON.stringify(f)));
    expect(ids.size).toBe(4); // sin solapamiento entre páginas
  });

  it("lecturas INCONSISTENTES visibles y marcadas (no se ocultan)", async () => {
    conSesion(TENANT_A, "TENANT_ADMIN");
    const ds = (await (await get(`/api/deltaops/informes/horometros?activoId=${ACTIVO_A1}`)).json()) as Ds;
    expect(ds.total).toBe(3);
    const marcadas = ds.filas.filter((f) => f.inconsistente === "SÍ");
    expect(marcadas.length).toBeGreaterThanOrEqual(1);
    // El motivo de la inconsistencia también es visible (no se corrige el dato).
    expect(marcadas.some((f) => String(f.motivo ?? "").length > 3)).toBe(true);
  });

  it("CONSULTA (solo lectura) consulta y exporta; el CSV = dataset (mismas filas) con «—» en centroCosto", async () => {
    conSesion(TENANT_A, "CONSULTA");
    const ds = (await (await get("/api/deltaops/informes/combustible?limit=500")).json()) as Ds;
    expect(ds.total).toBe(2);

    const exp = await get("/api/deltaops/informes/combustible/exportar?formato=csv");
    expect(exp.status).toBe(200);
    const csv = await exp.text();
    const lineas = csv.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l !== "");
    expect(lineas.length).toBe(1 + ds.total); // encabezado + TODAS las filas (sin paginar)
    // centroCosto no configurado ⇒ «—» literal (nunca inventado).
    expect(lineas[1]).toContain("—");
  });

  it("la exportación queda AUDITADA (job platform.export en platform_audit)", async () => {
    conSesion(TENANT_A, "CONSULTA");
    const antes = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.platform_audit WHERE tenant_id=$1 AND service='platform.export'`,
      [TENANT_A],
    );
    const exp = await get("/api/deltaops/informes/horometros/exportar?formato=xlsx");
    expect(exp.status).toBe(200);
    const despues = await pool.query(
      `SELECT count(*)::int AS n FROM deltaops.platform_audit WHERE tenant_id=$1 AND service='platform.export'`,
      [TENANT_A],
    );
    expect(Number(despues.rows[0].n)).toBeGreaterThan(Number(antes.rows[0].n));
  });

  it("CSV neutraliza inyección de fórmulas (= + - @) sin perder el dato", async () => {
    // Un tanqueo con observación maliciosa entraría por comandos del módulo;
    // aquí se verifica la barrera de serialización con los 4 prefijos.
    const { aCsvParaTest } = await import("../informes-module");
    const ds = {
      informe: "x", titulo: "x",
      columnas: [{ clave: "v", titulo: "V" }],
      filas: [{ v: "=1+1" }, { v: "+57 300" }, { v: "-5" }, { v: "@SUM(A1)" }, { v: "normal" }, { v: "—" }],
      total: 6, offset: 0, limit: 6, meta: {},
    };
    const csv = aCsvParaTest(ds).replace(/^\uFEFF/, "");
    const lineas = csv.split("\r\n");
    expect(lineas[1]).toBe("'=1+1");
    expect(lineas[2]).toBe("'+57 300");
    expect(lineas[3]).toBe("'-5");
    expect(lineas[4]).toBe("'@SUM(A1)");
    expect(lineas[5]).toBe("normal");
    expect(lineas[6]).toBe("—"); // el marcador de inexistente NO se toca
  });

  it("las advertencias de ventana declaradas en meta se anexan al CSV (estado explícito)", async () => {
    const { aCsvParaTest } = await import("../informes-module");
    const ds = {
      informe: "x", titulo: "x",
      columnas: [{ clave: "v", titulo: "V" }],
      filas: [{ v: "dato" }],
      total: 1, offset: 0, limit: 1,
      meta: { advertencias: ["Posible ventana alcanzada: el equipo Z devolvió el tope de 200 ejecuciones del contrato; use filtros de veredicto/fechas para un corte completo."] },
    };
    const csv = aCsvParaTest(ds).replace(/^\uFEFF/, "");
    const ultima = csv.split("\r\n").at(-1) ?? "";
    expect(ultima).toContain("Advertencia: Posible ventana alcanzada");
    expect(ultima).toContain("tope de 200");
  });

  it("la exportación deja el job de export COMPLETED (no pending)", async () => {
    conSesion(TENANT_A, "TENANT_ADMIN");
    const exp = await get("/api/deltaops/informes/combustible/exportar?formato=csv");
    expect(exp.status).toBe(200);
    const jobs = await pool.query(
      `SELECT status FROM deltaops.platform_records
       WHERE tenant_id=$1 AND service='platform.export' ORDER BY created_at DESC LIMIT 1`,
      [TENANT_A],
    );
    expect(jobs.rows[0]?.status).toBe("completed");
  });

  it("informe inexistente ⇒ 404; formato inválido ⇒ 400", async () => {
    conSesion(TENANT_A, "TENANT_ADMIN");
    expect((await get("/api/deltaops/informes/no-existe")).status).toBe(404);
    expect((await get("/api/deltaops/informes/horometros/exportar?formato=pdf")).status).toBe(400);
  });
});
