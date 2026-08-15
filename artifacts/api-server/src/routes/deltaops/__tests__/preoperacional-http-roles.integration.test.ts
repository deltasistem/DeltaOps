/**
 * DGP-LITE-04 §24 · CAMINO REAL de la ruta HTTP del PREOPERACIONAL por rol demo.
 *
 * REGRESIÓN (bloqueante en E2E real): al FINALIZAR/sellar, el backend devolvía
 * 403 «Permiso denegado: modulo.formularios.respuesta.write». Causa raíz: el
 * paso de CAPTURA embebido (`respuesta.guardarBorrador`→`enviar`) se ejecutaba
 * con un contexto de formularios que SÓLO portaba permisos de PLANTILLA, no de
 * RESPUESTA. Los tests que construían el principal directamente no lo detectaban.
 *
 * Este test ejercita el ROUTER REAL montado en Express (sin fakes de puertos:
 * runtimes reales de activos/forms/preoperacional sobre PostgreSQL), con una
 * SESIÓN autenticada real por cada rol demo, propagando el `rolCanonico` como en
 * producción. Verifica:
 *   - TENANT_ADMIN / SUPERVISOR / PLANIFICADOR / TECNICO ⇒ 200 y ejecución
 *     SELLADA (veredicto de servidor), sin 403 de respuesta.write.
 *   - CONSULTA (sólo lectura) ⇒ 403 en /registrar (guarda de escritura de la ruta).
 *   - La ejecución sella la IDENTIDAD CANÓNICA del usuario (`selladoPor`).
 *   - Idempotencia por opId también a través del HTTP real.
 *
 * Requiere DATABASE_URL. Tenant efímero; limpia sus filas al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { poolDestructivo as pool, suiteDestructiva } from "../../../test-support/pg-destructivo";
import preoperacionalRouter from "../preoperacional-module";
import { activosRuntime, contextForActivos } from "../activos-runtime";
import { formulariosRuntime, contextForFormularios } from "../correctivo-runtime";
import { SERVICIO_PREOP } from "../preoperacional-runtime";

// LITE-11 §2/§3/§4 — gate FAIL-CLOSED contra DATABASE_TEST_URL (nunca DATABASE_URL).
const suite = suiteDestructiva();

const RUN = randomUUID().slice(0, 8);
const TENANT = `preop-http-${RUN}`;
const PLANTILLA = "preop-movil";
const ACTIVO_ID = randomUUID(); // el módulo de activos exige id UUID
const ACTIVO_COD = `EQ-${RUN}`;

// Roles demo y si portan ESCRITURA en el preoperacional (activos escritura).
const ROLES: Array<{ rol: string; escribe: boolean }> = [
  { rol: "TENANT_ADMIN", escribe: true },
  { rol: "SUPERVISOR", escribe: true },
  { rol: "PLANIFICADOR", escribe: true },
  { rol: "TECNICO", escribe: true },
  { rol: "CONSULTA", escribe: false },
];

const userIdPorRol = new Map<string, number>();

let sesionActual: { deltaopsUserId: number; rolCanonico: string } | null = null;
let server: Server;
let baseUrl = "";

function construirApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { session: unknown }).session = sesionActual ?? undefined;
    next();
  });
  app.use("/api", preoperacionalRouter);
  return app;
}

async function crearUsuario(rol: string): Promise<number> {
  const email = `${rol.toLowerCase()}-${RUN}@preop.test`;
  const r = await pool.query(
    `INSERT INTO deltaops.users (email, nombre, rol, tenant, password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, `Preop ${rol}`, "operador", TENANT, "x"],
  );
  return Number(r.rows[0].id);
}

/** Habilita en el tenant efímero los valores de catálogo que usa el activo. */
async function seedCatalogos(): Promise<void> {
  const rt = activosRuntime();
  const ctx = contextForActivos("seed-preop", "admin", TENANT);
  const cats: Array<[string, string, string]> = [
    ["tipos", "movil", "Móvil"],
    ["categorias", "vehiculo", "Vehículo"],
    ["familias", "camion", "Camión"],
    ["monedas", "USD", "Dólar"],
    ["criticidades", "alta", "Alta"],
  ];
  for (const [catalogo, clave, etiqueta] of cats) {
    const r = await rt.platform.kernel.commands.execute(ctx, "modulo.activos.catalogo.upsert", { catalogo, clave, etiqueta });
    if (!r.ok) throw new Error(`No se pudo sembrar catálogo ${catalogo}/${clave}: ${r.error.code} ${r.error.message}`);
  }
  await rt.platform.kernel.outboxProcessor.processPending();
}

/** Siembra un activo REAL (runtime de activos) en el tenant efímero. */
async function seedActivo(): Promise<void> {
  const rt = activosRuntime();
  const ctx = contextForActivos("seed-preop", "admin", TENANT);
  const r = await rt.platform.kernel.commands.execute(ctx, "modulo.activos.crear", {
    id: ACTIVO_ID,
    opId: `seed:activo:${RUN}`,
    codigoEmpresarial: ACTIVO_COD,
    nombre: "Camión de prueba",
    tipo: "movil",
    categoria: "vehiculo",
    familia: "camion",
    criticidad: "alta",
    moneda: "USD",
  });
  if (!r.ok) throw new Error(`No se pudo sembrar el activo: ${r.error.code} ${r.error.message}`);
  await rt.platform.kernel.outboxProcessor.processPending();
}

/** Publica la plantilla de preoperacional REAL (Dynamic Forms) en el tenant. */
async function seedPlantilla(): Promise<void> {
  const fr = formulariosRuntime();
  const ctxF = contextForFormularios("seed-preop", TENANT);
  const items = [
    { clave: "frenos", etiqueta: "Sistema de frenos operativo", categoria: "Seguridad", obligatorio: true, critico: true },
    { clave: "luces", etiqueta: "Luces y señalización", categoria: "Seguridad", obligatorio: true, critico: true },
    { clave: "aceite", etiqueta: "Nivel de aceite", categoria: "Fluidos", obligatorio: true, critico: false },
  ];
  const definicion = {
    clave: PLANTILLA,
    titulo: "Verificación operacional móvil",
    nodos: items.map((it) => ({ clase: "campo" as const, clave: it.clave, tipo: "checklist" as const, etiqueta: it.etiqueta, obligatorio: it.obligatorio })),
  };
  const checklist = {
    clave: PLANTILLA,
    titulo: "Verificación operacional móvil",
    version: 1,
    items: items.map((it) => ({ clave: it.clave, etiqueta: it.etiqueta, obligatorio: it.obligatorio, critico: it.critico, categoria: it.categoria })),
  };
  const plantillaId = `plantilla:${PLANTILLA}:${RUN}`;
  const crear = await fr.platform.kernel.commands.execute(ctxF, "modulo.formularios.plantilla.crear", {
    id: plantillaId, opId: `seed:preop:crear:${RUN}`, clave: PLANTILLA,
    contenido: { definicion, checklist, aplicabilidad: { tiposEquipo: ["movil"], vigenciaDias: 1 } },
  });
  if (!crear.ok) throw new Error(`No se pudo crear la plantilla: ${crear.error.code} ${crear.error.message}`);
  await fr.platform.kernel.outboxProcessor.processPending();
  const publicar = await fr.platform.kernel.commands.execute(ctxF, "modulo.formularios.plantilla.publicar", { id: plantillaId, opId: `seed:preop:pub:${RUN}` });
  if (!publicar.ok) throw new Error(`No se pudo publicar la plantilla: ${publicar.error.code} ${publicar.error.message}`);
  await fr.platform.kernel.outboxProcessor.processPending();
}

async function limpiar(): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT]);
    await c.query(`DELETE FROM deltaops.platform_records WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    await c.query(`DELETE FROM deltaops.platform_audit WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    await c.query("COMMIT");
  } catch {
    await c.query("ROLLBACK").catch(() => undefined);
  } finally {
    c.release();
  }
  await pool.query(`DELETE FROM deltaops.users WHERE tenant = $1`, [TENANT]).catch(() => undefined);
}

function bodyRegistro(opId: string): Record<string, unknown> {
  // Respuestas: un CRÍTICO incumplido (frenos=false) ⇒ NO_APTO (veredicto de servidor).
  return {
    opId,
    activoId: ACTIVO_ID,
    plantillaClave: PLANTILLA,
    datos: {
      frenos: { estado: false, comentario: "sin presión" },
      luces: { estado: true },
      aceite: { estado: true },
    },
  };
}

suite("DGP-LITE-04 §24 · /registrar (HTTP real) por rol demo", () => {
  beforeAll(async () => {
    await limpiar();
    for (const { rol } of ROLES) userIdPorRol.set(rol, await crearUsuario(rol));
    await seedCatalogos();
    await seedActivo();
    await seedPlantilla();
    await new Promise<void>((resolve) => {
      server = createServer(construirApp());
      server.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await limpiar();
  });

  for (const { rol, escribe } of ROLES.filter((r) => r.escribe)) {
    it(`${rol} (escritura) ⇒ 200 y ejecución sellada (sin 403 de respuesta.write)`, async () => {
      sesionActual = { deltaopsUserId: userIdPorRol.get(rol)!, rolCanonico: rol };
      const opId = `op-${rol}-${RUN}`;
      const res = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyRegistro(opId)),
      });
      const body = (await res.json()) as Record<string, unknown>;
      expect(res.status, `body=${JSON.stringify(body)}`).toBe(200);
      expect(body.veredicto).toBe("NO_APTO"); // crítico incumplido ⇒ veredicto de servidor
      expect(body.hayCriticoIncumplido).toBe(true);
      expect(typeof body.id).toBe("string");
      void escribe;
    });
  }

  it("CONSULTA (sólo lectura) ⇒ 403 en /registrar (guarda de escritura de la ruta)", async () => {
    sesionActual = { deltaopsUserId: userIdPorRol.get("CONSULTA")!, rolCanonico: "CONSULTA" };
    const res = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyRegistro(`op-consulta-${RUN}`)),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: unknown };
    expect(String(body.code).startsWith("KRN-AUTH")).toBe(true);
  });

  it("idempotencia por opId a través del HTTP real ⇒ mismo id, idempotente=true", async () => {
    sesionActual = { deltaopsUserId: userIdPorRol.get("TENANT_ADMIN")!, rolCanonico: "TENANT_ADMIN" };
    const opId = `op-idem-${RUN}`;
    const call = () =>
      fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyRegistro(opId)),
      }).then((r) => r.json() as Promise<Record<string, unknown>>);
    const a = await call();
    const b = await call();
    expect(a.id).toBe(b.id);
    expect(b.idempotente).toBe(true);
  });

  it("la ejecución sella la IDENTIDAD CANÓNICA del usuario (selladoPor) y consulta OK", async () => {
    const uid = String(userIdPorRol.get("SUPERVISOR")!);
    sesionActual = { deltaopsUserId: userIdPorRol.get("SUPERVISOR")!, rolCanonico: "SUPERVISOR" };
    // Lista de ejecuciones del activo (lectura permitida a escritura).
    const res = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/ejecuciones?activoId=${ACTIVO_ID}`);
    expect(res.status).toBe(200);
    const filas = (await res.json()) as Array<{ data: { selladoPor: string; activoId: string } }>;
    expect(filas.length).toBeGreaterThan(0);
    // El SUPERVISOR selló al menos una; su selladoPor es SU id canónico (no del cliente).
    expect(filas.some((f) => f.data.selladoPor === uid)).toBe(true);
    expect(filas.every((f) => f.data.activoId === ACTIVO_ID)).toBe(true);
    void SERVICIO_PREOP;
  });
});
