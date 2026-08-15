/**
 * DELTAOPS LITE-05 §19 · CAMINO REAL del bucle Hallazgo→OT→Cierre por HTTP.
 *
 * Ejercita el ROUTER REAL montado en Express (runtimes reales de activos, forms,
 * preoperacional, correctivo, órdenes y hallazgo sobre PostgreSQL; SIN fakes de
 * puertos), con sesión autenticada real por rol demo propagando `rolCanonico`.
 * Verifica, a través del HTTP real:
 *   - CONVERSIÓN con procedencia COMPLETA resuelta server-side (crea solicitud
 *     origen=preoperacional, encadena transiciones y GENERA una OT real).
 *   - IDEMPOTENCIA end-to-end: doble envío ⇒ una sola OT (mismo ordenTrabajoId).
 *   - EXCLUSIÓN MUTUA OT↔descarte (no se descarta un hallazgo con OT; sí tras
 *     reabrir un descartado se puede generar).
 *   - DESCARTE registrado + REVERSIÓN (reabrir), ambos auditados y reversibles.
 *   - RBAC por rol HTTP real: CONSULTA ⇒ 403 en /generar y /descartar.
 *   - AISLAMIENTO por tenant en la consulta de estado.
 *
 * Requiere DATABASE_URL. Tenant efímero; limpia sus filas al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { poolDestructivo as pool, suiteDestructiva } from "../../../test-support/pg-destructivo";
import preoperacionalRouter from "../preoperacional-module";
import hallazgoRouter from "../hallazgo-module";
import ordenesRouter from "../ordenes-module";
import { activosRuntime, contextForActivos } from "../activos-runtime";
import { formulariosRuntime, contextForFormularios } from "../correctivo-runtime";

// LITE-11 §2/§3/§4 — gate FAIL-CLOSED contra DATABASE_TEST_URL (nunca DATABASE_URL).
const suite = suiteDestructiva();

const RUN = randomUUID().slice(0, 8);
const TENANT = `hallazgo-http-${RUN}`;
const OTRO_TENANT = `hallazgo-otro-${RUN}`;
const PLANTILLA = "preop-movil";
const ACTIVO_ID = randomUUID();
const ACTIVO_COD = `EQ-${RUN}`;

const ROLES: Array<{ rol: string; escribe: boolean }> = [
  { rol: "TENANT_ADMIN", escribe: true },
  { rol: "SUPERVISOR", escribe: true },
  { rol: "CONSULTA", escribe: false },
];

const userIdPorRol = new Map<string, number>();
let userOtroTenant = 0;

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
  app.use("/api", hallazgoRouter);
  app.use("/api", ordenesRouter);
  return app;
}

async function crearUsuario(rol: string, tenant: string): Promise<number> {
  const email = `${rol.toLowerCase()}-${RUN}-${tenant}@hallazgo.test`;
  const r = await pool.query(
    `INSERT INTO deltaops.users (email, nombre, rol, tenant, password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, `Hallazgo ${rol}`, "operador", tenant, "x"],
  );
  return Number(r.rows[0].id);
}

async function seedCatalogos(tenant: string): Promise<void> {
  const rt = activosRuntime();
  const ctx = contextForActivos("seed-hallazgo", "admin", tenant);
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

async function seedActivo(tenant: string): Promise<void> {
  const rt = activosRuntime();
  const ctx = contextForActivos("seed-hallazgo", "admin", tenant);
  const r = await rt.platform.kernel.commands.execute(ctx, "modulo.activos.crear", {
    id: ACTIVO_ID,
    opId: `seed:activo:${RUN}:${tenant}`,
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

async function seedPlantilla(tenant: string): Promise<void> {
  const fr = formulariosRuntime();
  const ctxF = contextForFormularios("seed-hallazgo", tenant);
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
  const plantillaId = `plantilla:${PLANTILLA}:${RUN}:${tenant}`;
  const crear = await fr.platform.kernel.commands.execute(ctxF, "modulo.formularios.plantilla.crear", {
    id: plantillaId, opId: `seed:preop:crear:${RUN}:${tenant}`, clave: PLANTILLA,
    contenido: { definicion, checklist, aplicabilidad: { tiposEquipo: ["movil"], vigenciaDias: 1 } },
  });
  if (!crear.ok) throw new Error(`No se pudo crear la plantilla: ${crear.error.code} ${crear.error.message}`);
  await fr.platform.kernel.outboxProcessor.processPending();
  const publicar = await fr.platform.kernel.commands.execute(ctxF, "modulo.formularios.plantilla.publicar", { id: plantillaId, opId: `seed:preop:pub:${RUN}:${tenant}` });
  if (!publicar.ok) throw new Error(`No se pudo publicar la plantilla: ${publicar.error.code} ${publicar.error.message}`);
  await fr.platform.kernel.outboxProcessor.processPending();
}

const TABLAS_TENANT = [
  "platform_records", "platform_audit",
  "cor_solicitudes", "cor_solicitudes_read", "cor_diagnosticos", "cor_diagnosticos_read",
  "cor_generaciones", "cor_generaciones_read", "cor_generacion_materializaciones",
  "cor_historial", "cor_historial_read", "cor_recibos", "cor_secuencias", "cor_catalogos",
  "cor_eventos", "cor_sync_receipts",
  "ord_ordenes", "ord_ordenes_read", "ord_eventos", "ord_recibos", "ord_secuencias",
  "ord_historial_read", "ord_catalogos",
];

async function limpiar(tenant: string): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    for (const t of TABLAS_TENANT) {
      await c.query(`DELETE FROM deltaops.${t} WHERE tenant_id = $1`, [tenant]).catch(() => undefined);
    }
    await c.query("COMMIT");
  } catch {
    await c.query("ROLLBACK").catch(() => undefined);
  } finally {
    c.release();
  }
  await pool.query(`DELETE FROM deltaops.users WHERE tenant = $1`, [tenant]).catch(() => undefined);
}

/** Registra una ejecución preoperacional REAL y devuelve su ejecucionId. */
async function registrarPreop(rol: string, tenant: string): Promise<string> {
  sesionActual = { deltaopsUserId: userIdPorRol.get(rol) ?? userOtroTenant, rolCanonico: rol };
  const opId = `preop-${rol}-${RUN}-${tenant}`;
  const res = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      opId,
      activoId: ACTIVO_ID,
      plantillaClave: PLANTILLA,
      datos: {
        frenos: { estado: false, comentario: "sin presión" }, // crítico incumplido ⇒ hallazgo
        luces: { estado: true },
        aceite: { estado: true },
      },
    }),
  });
  const body = (await res.json()) as { id?: string };
  if (res.status !== 200 || !body.id) throw new Error(`preop falló: ${res.status} ${JSON.stringify(body)}`);
  return body.id;
}

async function post(path: string, rol: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  sesionActual = { deltaopsUserId: userIdPorRol.get(rol)!, rolCanonico: rol };
  const res = await fetch(`${baseUrl}/api/deltaops/activos/hallazgo${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function estado(rol: string, ejecucionId: string, itemClave: string): Promise<{ status: number; body: Record<string, unknown> }> {
  sesionActual = { deltaopsUserId: userIdPorRol.get(rol)!, rolCanonico: rol };
  const qs = new URLSearchParams({ ejecucionId, itemClave });
  const res = await fetch(`${baseUrl}/api/deltaops/activos/hallazgo/estado?${qs.toString()}`);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

interface Resumen {
  hallazgosPendientes: number;
  mantenimientosDerivados: number;
  descartados: number;
  totalHallazgos: number;
}

async function resumen(rol: string, uid?: number): Promise<{ status: number; body: Resumen }> {
  sesionActual = { deltaopsUserId: uid ?? userIdPorRol.get(rol)!, rolCanonico: rol };
  const res = await fetch(`${baseUrl}/api/deltaops/activos/hallazgo/resumen`);
  return { status: res.status, body: (await res.json()) as Resumen };
}

/** POST a una ruta del módulo de ÓRDENES (mismo camino HTTP que la ficha de OT). */
async function orden(path: string, rol: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  sesionActual = { deltaopsUserId: userIdPorRol.get(rol)!, rolCanonico: rol };
  const res = await fetch(`${baseUrl}/api/deltaops/ordenes${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function ordenDetalle(rol: string, id: string): Promise<Record<string, unknown>> {
  sesionActual = { deltaopsUserId: userIdPorRol.get(rol)!, rolCanonico: rol };
  const res = await fetch(`${baseUrl}/api/deltaops/ordenes/${id}`);
  return (await res.json()) as Record<string, unknown>;
}

let ejecucionId = "";

suite("DELTAOPS LITE-05 §19 · bucle Hallazgo→OT (HTTP real)", () => {
  beforeAll(async () => {
    await limpiar(TENANT);
    await limpiar(OTRO_TENANT);
    for (const { rol } of ROLES) userIdPorRol.set(rol, await crearUsuario(rol, TENANT));
    userOtroTenant = await crearUsuario("SUPERVISOR", OTRO_TENANT);
    await seedCatalogos(TENANT);
    await seedActivo(TENANT);
    await seedPlantilla(TENANT);
    await new Promise<void>((resolve) => {
      server = createServer(construirApp());
      server.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
    ejecucionId = await registrarPreop("SUPERVISOR", TENANT);
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await limpiar(TENANT);
    await limpiar(OTRO_TENANT);
  });

  it("estado inicial del hallazgo crítico ⇒ pendiente con procedencia completa (server-side)", async () => {
    const r = await estado("SUPERVISOR", ejecucionId, "frenos");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.estado).toBe("pendiente");
    const proc = r.body.procedencia as Record<string, unknown>;
    expect(proc).toBeTruthy();
    expect((proc.item as { clave: string }).clave).toBe("frenos");
    expect((proc.item as { critico: boolean }).critico).toBe(true);
    expect((proc.activo as { id: string }).id).toBe(ACTIVO_ID);
    expect((proc.preoperacional as { veredicto: string }).veredicto).toBe("NO_APTO");
  });

  it("CONSULTA ⇒ 403 en /generar y /descartar (RBAC de la ruta, KRN-AUTH)", async () => {
    const g = await post("/generar", "CONSULTA", { ejecucionId, itemClave: "frenos", opId: `c-gen-${RUN}` });
    expect(g.status).toBe(403);
    expect(String(g.body.code).startsWith("KRN-AUTH")).toBe(true);
    const d = await post("/descartar", "CONSULTA", { ejecucionId, itemClave: "frenos", opId: `c-desc-${RUN}` });
    expect(d.status).toBe(403);
    expect(String(d.body.code).startsWith("KRN-AUTH")).toBe(true);
  });

  it("GENERAR ⇒ convierte, crea OT real y deja el hallazgo en «convertido» con ordenTrabajoId", async () => {
    const r = await post("/generar", "SUPERVISOR", { ejecucionId, itemClave: "frenos", opId: `gen-${RUN}` });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.estado).toBe("convertido");
    expect(typeof r.body.ordenTrabajoId).toBe("string");
    expect((r.body.ordenTrabajoId as string).length).toBeGreaterThan(0);

    const e = await estado("SUPERVISOR", ejecucionId, "frenos");
    expect(e.body.estado).toBe("convertido");
    expect(e.body.ordenTrabajoId).toBe(r.body.ordenTrabajoId);
  });

  it("IDEMPOTENCIA end-to-end ⇒ re-generar devuelve la MISMA OT", async () => {
    const primero = await estado("SUPERVISOR", ejecucionId, "frenos");
    const ot = primero.body.ordenTrabajoId;
    const r = await post("/generar", "SUPERVISOR", { ejecucionId, itemClave: "frenos", opId: `gen2-${RUN}` });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.ordenTrabajoId).toBe(ot);
    expect(r.body.idempotente).toBe(true);
  });

  it("EXCLUSIÓN MUTUA ⇒ no se puede descartar un hallazgo con OT ya generada (409)", async () => {
    const r = await post("/descartar", "SUPERVISOR", { ejecucionId, itemClave: "frenos", opId: `desc-x-${RUN}` });
    expect(r.status).toBe(409);
    expect(String(r.body.code).startsWith("KRN-CFL")).toBe(true);
  });

  it("DESCARTE + REVERSIÓN sobre un hallazgo pendiente (otro ítem: aceite)", async () => {
    // Registramos una ejecución con el ítem 'aceite' como observación/incumplido.
    // 'aceite' no es crítico; para provocar un hallazgo lo marcamos no cumplido.
    sesionActual = { deltaopsUserId: userIdPorRol.get("SUPERVISOR")!, rolCanonico: "SUPERVISOR" };
    const res = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opId: `preop-aceite-${RUN}`,
        activoId: ACTIVO_ID,
        plantillaClave: PLANTILLA,
        datos: {
          frenos: { estado: true },
          luces: { estado: true },
          aceite: { estado: false, comentario: "nivel bajo" },
        },
      }),
    });
    const b = (await res.json()) as { id: string };
    const ejec2 = b.id;

    // Descartar (pendiente ⇒ descartado).
    const d = await post("/descartar", "SUPERVISOR", { ejecucionId: ejec2, itemClave: "aceite", opId: `desc-a-${RUN}`, motivo: "Se corrigió en sitio" });
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    const e1 = await estado("SUPERVISOR", ejec2, "aceite");
    expect(e1.body.estado).toBe("descartado");
    expect((e1.body.descarte as { motivo?: string }).motivo).toBe("Se corrigió en sitio");

    // Idempotencia del descarte (mismo opId).
    const dIdem = await post("/descartar", "SUPERVISOR", { ejecucionId: ejec2, itemClave: "aceite", opId: `desc-a-${RUN}`, motivo: "Se corrigió en sitio" });
    expect(dIdem.status).toBe(200);
    expect(dIdem.body.idempotente).toBe(true);

    // Reabrir (descartado ⇒ pendiente).
    const rr = await post("/reabrir", "SUPERVISOR", { ejecucionId: ejec2, itemClave: "aceite", opId: `reab-a-${RUN}` });
    expect(rr.status, JSON.stringify(rr.body)).toBe(200);
    const e2 = await estado("SUPERVISOR", ejec2, "aceite");
    expect(e2.body.estado).toBe("pendiente");

    // Tras reabrir, SÍ se puede generar OT.
    const g = await post("/generar", "SUPERVISOR", { ejecucionId: ejec2, itemClave: "aceite", opId: `gen-a-${RUN}` });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    expect(g.body.estado).toBe("convertido");
    expect(typeof g.body.ordenTrabajoId).toBe("string");
  });

  it("§15 · RESUMEN por tenant refleja transiciones reales (pendiente→convertido/descartado) y CONSULTA lo lee", async () => {
    // Estado base (por pruebas previas: 'frenos' y 'aceite' quedaron convertidos).
    const base = await resumen("SUPERVISOR");
    expect(base.status, JSON.stringify(base.body)).toBe(200);
    const derivadosBase = base.body.mantenimientosDerivados;
    const descartadosBase = base.body.descartados;

    // Nueva ejecución con un incumplimiento crítico ('frenos') y una observación
    // ('aceite'): añade 2 hallazgos PENDIENTES al conteo.
    sesionActual = { deltaopsUserId: userIdPorRol.get("SUPERVISOR")!, rolCanonico: "SUPERVISOR" };
    const res = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opId: `preop-resumen-${RUN}`,
        activoId: ACTIVO_ID,
        plantillaClave: PLANTILLA,
        datos: {
          frenos: { estado: false, comentario: "fuga" },
          luces: { estado: true },
          aceite: { estado: false, comentario: "bajo" },
        },
      }),
    });
    const ejec3 = ((await res.json()) as { id: string }).id;

    const conPendientes = await resumen("SUPERVISOR");
    expect(conPendientes.body.hallazgosPendientes).toBeGreaterThanOrEqual(base.body.hallazgosPendientes + 2);

    // Convertir 'frenos' de ejec3 ⇒ mantenimientosDerivados +1, pendientes -1.
    const g = await post("/generar", "SUPERVISOR", { ejecucionId: ejec3, itemClave: "frenos", opId: `gen-r-${RUN}` });
    expect(g.status).toBe(200);
    // Descartar 'aceite' de ejec3 ⇒ descartados +1, pendientes -1.
    const d = await post("/descartar", "SUPERVISOR", { ejecucionId: ejec3, itemClave: "aceite", opId: `desc-r-${RUN}` });
    expect(d.status).toBe(200);

    const tras = await resumen("SUPERVISOR");
    expect(tras.body.mantenimientosDerivados).toBe(derivadosBase + 1);
    expect(tras.body.descartados).toBe(descartadosBase + 1);
    expect(tras.body.hallazgosPendientes).toBe(conPendientes.body.hallazgosPendientes - 2);

    // CONSULTA (sólo lectura) SÍ puede leer el resumen.
    const c = await resumen("CONSULTA");
    expect(c.status).toBe(200);
    expect(c.body.totalHallazgos).toBe(tras.body.totalHallazgos);
  });

  it("CIERRE COMPLETO de la OT derivada del hallazgo por el CAMINO HTTP real (shape del frontend)", async () => {
    // Genera una OT desde un hallazgo NUEVO para no acoplarse a estado previo.
    sesionActual = { deltaopsUserId: userIdPorRol.get("SUPERVISOR")!, rolCanonico: "SUPERVISOR" };
    const preop = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opId: `preop-cierre-${RUN}`,
        activoId: ACTIVO_ID,
        plantillaClave: PLANTILLA,
        datos: { frenos: { estado: false, comentario: "cierre e2e" }, luces: { estado: true }, aceite: { estado: true } },
      }),
    });
    const ejecCierre = ((await preop.json()) as { id: string }).id;

    const g = await post("/generar", "SUPERVISOR", { ejecucionId: ejecCierre, itemClave: "frenos", opId: `gen-cierre-${RUN}` });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    const ot = g.body.ordenTrabajoId as string;
    expect(typeof ot).toBe("string");

    // Ciclo de vida por las MISMAS rutas HTTP que usa la ficha de OT:
    // abrir → planificar → asignar → iniciar → enviarValidacion → cerrar(gate).
    for (const comando of ["abrir", "planificar", "asignar", "iniciar", "enviarValidacion", "cerrar"]) {
      const r = await orden(`/${ot}/transicionar`, "SUPERVISOR", { comando, opId: `tr-${comando}-${RUN}` });
      expect(r.status, `transición ${comando}: ${JSON.stringify(r.body)}`).toBe(200);
    }

    // «Aprobar y cerrar»: EXACTAMENTE el shape que emite el frontend
    // (mutaciones.ts → decision), a través de POST /ordenes/:id/aprobar-cierre.
    // Separación de funciones (gobierno del gate): el APROBADOR debe ser distinto
    // del solicitante ⇒ lo aprueba TENANT_ADMIN (también con capacidad validadora).
    const ap = await orden(`/${ot}/aprobar-cierre`, "TENANT_ADMIN", { decision: "aprobar", opId: `ap-cierre-${RUN}` });
    expect(ap.status, `aprobar-cierre: ${JSON.stringify(ap.body)}`).toBe(200);
    expect(ap.body.estado).toBe("CERRADA");

    // La OT queda CERRADA en el detalle real.
    const det = await ordenDetalle("SUPERVISOR", ot);
    const ordenRec = det.orden as { estado?: string } | undefined;
    expect(ordenRec?.estado).toBe("CERRADA");
  });

  it("REPRO+FIX camino ficha · gate en DOS pasos (bug: aprobar-cierre directo ⇒ CFL; fix: transicionar(cerrar)+aprobar)", async () => {
    // La ficha (ordenes-ficha.tsx) mapeaba el botón «Aprobar y cerrar» de
    // EN_VALIDACION DIRECTAMENTE a aprobarCierre, SIN abrir antes el gate con
    // transicionar(cerrar). Este test reproduce ese camino roto (⇒ conflicto) y
    // valida el fix (`resolverCierre`): abrir gate + decidir ⇒ CERRADA.
    sesionActual = { deltaopsUserId: userIdPorRol.get("SUPERVISOR")!, rolCanonico: "SUPERVISOR" };
    const preop = await fetch(`${baseUrl}/api/deltaops/activos/preoperacional/registrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opId: `preop-ficha-${RUN}`,
        activoId: ACTIVO_ID,
        plantillaClave: PLANTILLA,
        datos: { frenos: { estado: false, comentario: "ficha e2e" }, luces: { estado: true }, aceite: { estado: true } },
      }),
    });
    const ejec = ((await preop.json()) as { id: string }).id;
    const g = await post("/generar", "SUPERVISOR", { ejecucionId: ejec, itemClave: "frenos", opId: `gen-ficha-${RUN}` });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    const ot = g.body.ordenTrabajoId as string;

    // Igual que la ficha: se detiene en EN_VALIDACION (NO emite `cerrar`).
    for (const comando of ["abrir", "planificar", "asignar", "iniciar", "enviarValidacion"]) {
      const r = await orden(`/${ot}/transicionar`, "SUPERVISOR", { comando, opId: `trf-${comando}-${RUN}` });
      expect(r.status, `transición ${comando}: ${JSON.stringify(r.body)}`).toBe(200);
    }

    // (BUG) aprobar-cierre DIRECTO, sin abrir el gate ⇒ conflicto (no hay aprobación pendiente).
    const roto = await orden(`/${ot}/aprobar-cierre`, "TENANT_ADMIN", { decision: "aprobar", opId: `apf-roto-${RUN}` });
    expect(roto.status, `aprobar-cierre directo: ${JSON.stringify(roto.body)}`).toBe(409);
    expect(String(roto.body.code).startsWith("KRN-CFL")).toBe(true);

    // (FIX) DOS pasos como hace `resolverCierre`: abrir gate `cerrar` (idempotente) + aprobar.
    const gate = await orden(`/${ot}/transicionar`, "TENANT_ADMIN", { comando: "cerrar", opId: `apf-gate-${RUN}` });
    expect(gate.status, `abrir gate cerrar: ${JSON.stringify(gate.body)}`).toBe(200);
    const ap = await orden(`/${ot}/aprobar-cierre`, "TENANT_ADMIN", { decision: "aprobar", opId: `apf-ok-${RUN}` });
    expect(ap.status, `aprobar-cierre tras gate: ${JSON.stringify(ap.body)}`).toBe(200);
    expect(ap.body.estado).toBe("CERRADA");

    const det = await ordenDetalle("SUPERVISOR", ot);
    expect((det.orden as { estado?: string }).estado).toBe("CERRADA");
  });

  it("REGRESIÓN de contrato · aprobar-cierre EXIGE `decision` (el `aprobado` booleano del bug ⇒ 400)", async () => {
    // Documenta la CAUSA RAÍZ: el backend valida `decision: enum`; enviar el shape
    // viejo del frontend (`aprobado`) produce «Entrada inválida» (KRN-VAL / 400).
    // Usamos un id cualquiera: la validación de entrada ocurre ANTES de resolver la OT.
    const malo = await orden(`/${ACTIVO_ID}/aprobar-cierre`, "SUPERVISOR", { aprobado: true, opId: `ap-malo-${RUN}` });
    expect(malo.status).toBe(400);
    expect(String(malo.body.code).startsWith("KRN-VAL")).toBe(true);
  });

  it("§15 · AISLAMIENTO por tenant ⇒ el resumen de OTRO tenant es cero", async () => {
    const otro = await resumen("SUPERVISOR", userOtroTenant);
    expect(otro.status).toBe(200);
    expect(otro.body.totalHallazgos).toBe(0);
    expect(otro.body.hallazgosPendientes).toBe(0);
    expect(otro.body.mantenimientosDerivados).toBe(0);
  });

  it("AISLAMIENTO por tenant ⇒ un usuario de OTRO tenant no ve el estado convertido", async () => {
    // El usuario de OTRO_TENANT no tiene la ejecución sellada de este tenant.
    sesionActual = { deltaopsUserId: userOtroTenant, rolCanonico: "SUPERVISOR" };
    const qs = new URLSearchParams({ ejecucionId, itemClave: "frenos" });
    const res = await fetch(`${baseUrl}/api/deltaops/activos/hallazgo/estado?${qs.toString()}`);
    // La ejecución no existe en su tenant ⇒ 404 (procedencia no resoluble).
    expect(res.status).toBe(404);
  });
});
