/**
 * DGP-016.2 · API HTTP del Módulo Enterprise Analytics & KPI Platform.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/analytics...
 *
 * Todas las CONSULTAS se sirven de los read models CQRS del módulo. La evaluación
 * de indicadores (`evaluar`) es una lectura PURA contra las fuentes read-only
 * fail-safe. La sincronización offline se ORQUESTA por operación (jamás comandos
 * anidados) vía `sincronizar` (procesarCola).
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-analytics";
import { analyticsRuntime, contextForAnalytics } from "./analytics-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/analytics";

/* ------------------------------ Sesión ------------------------------------ */

router.use(BASE, async (req, res, next): Promise<void> => {
  const userId = req.session?.deltaopsUserId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const [user] = await db
    .select({ id: deltaopsUsersTable.id, rol: deltaopsUsersTable.rol, tenant: deltaopsUsersTable.tenant })
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  res.locals.ctx = contextForAnalytics(String(user.id), user.rol, user.tenant);
  res.locals.user = user;
  next();
});

/* ---------------------------- Utilidades ---------------------------------- */

function ctxOf(res: { locals: Record<string, unknown> }): ExecutionContext {
  return res.locals.ctx as ExecutionContext;
}

function statusOf(err: KernelError): number {
  if (err.code.startsWith("KRN-AUTH")) return 403;
  if (err.code.startsWith("KRN-NF")) return 404;
  if (err.code.startsWith("KRN-NOT")) return 404;
  if (err.code.startsWith("KRN-CFL")) return 409;
  if (err.code.startsWith("KRN-VAL")) return 400;
  return 500;
}

function send(res: Response, r: Result<unknown, KernelError>): void {
  if (r.ok) {
    res.json(r.value);
    return;
  }
  res.status(statusOf(r.error)).json({ error: r.error.message, code: r.error.code });
}

const exec = (ctx: ExecutionContext, name: string, input: unknown) =>
  analyticsRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  analyticsRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await analyticsRuntime().platform.kernel.outboxProcessor.processPending();
}

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}
const strQuery = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
function boolQuery(v: unknown): boolean | undefined {
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

/* ============================== CONSULTAS ================================= */
// Rutas específicas ANTES de /:clave para evitar colisión de rutas.

// --- Indicadores ---
router.get(`${BASE}/indicadores`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.indicadores`, {
    categoria: strQuery(req.query.categoria),
    habilitado: boolQuery(req.query.habilitado),
    delSistema: boolQuery(req.query.delSistema),
    limit: numQuery(req.query.limit),
  }));
});

// --- Evaluación de indicador (lectura pura sobre fuentes read-only) ---
router.post(`${BASE}/indicadores/:clave/evaluar`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.evaluar`, { ...req.body, clave: req.params.clave }));
});

router.get(`${BASE}/indicadores/:clave`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.indicador`, { clave: req.params.clave }));
});

// --- Dashboards ---
router.get(`${BASE}/dashboards`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.dashboards`, {
    delSistema: boolQuery(req.query.delSistema),
    propietarioId: strQuery(req.query.propietarioId),
    limit: numQuery(req.query.limit),
  }));
});
router.get(`${BASE}/dashboards/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.dashboard`, { id: req.params.id }));
});

// --- Snapshots ---
router.get(`${BASE}/snapshots`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.snapshots`, { targetClave: strQuery(req.query.targetClave) }));
});

// --- Catálogos / diagnóstico ---
router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo-opciones`, { catalogo: req.params.catalogo }));
});
router.get(`${BASE}/eventos`, async (_req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.eventos`, {}));
});
router.get(`${BASE}/consola`, async (_req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, {}));
});

/* ============================== COMANDOS ================================= */

// --- Semilla del sistema (catálogos + indicadores + dashboards canónicos) ---
router.post(`${BASE}/sembrar`, async (_req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.sembrar-sistema`, {}));
  await drain();
});

// --- Catálogos ---
router.post(`${BASE}/catalogos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-upsert`, req.body));
  await drain();
});
router.post(`${BASE}/catalogos/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-habilitar`, req.body));
  await drain();
});

// --- Indicadores (definición / actualización / habilitación) ---
router.post(`${BASE}/indicadores`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.definir-indicador`, req.body));
  await drain();
});
router.put(`${BASE}/indicadores/:clave`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.actualizar-indicador`, { ...req.body, clave: req.params.clave }));
  await drain();
});
router.post(`${BASE}/indicadores/:clave/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.habilitar-indicador`, { ...req.body, clave: req.params.clave }));
  await drain();
});

// --- Snapshots (materialización idempotente por clave determinista) ---
router.post(`${BASE}/indicadores/:clave/snapshot`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.materializar-snapshot`, { ...req.body, clave: req.params.clave }));
  await drain();
});

// --- Dashboards (CRUD + clonado) ---
router.post(`${BASE}/dashboards`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-dashboard`, req.body));
  await drain();
});
router.put(`${BASE}/dashboards/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.actualizar-dashboard`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/dashboards/:id/clonar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.clonar-dashboard`, { ...req.body, id: req.params.id }));
  await drain();
});
router.delete(`${BASE}/dashboards/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.eliminar-dashboard`, { ...req.body, id: req.params.id }));
  await drain();
});

// --- Reproyección (admin) — replay del event log durable ---
router.post(`${BASE}/reproyectar`, async (_req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reproyectar`, {}));
});

/* --------------------------- Sincronización offline ----------------------- */
// ORQUESTACIÓN (no comando anidado): una UoW por operación real. El outbox se
// drena dentro de `sincronizar` (procesarCola). Ver sincronizacion.ts.

router.post(`${BASE}/sync`, async (req, res) => {
  const parsed = ColaSyncSchema.safeParse(req.body?.operaciones ?? req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Cola de sincronización inválida", code: "KRN-VAL-001" });
    return;
  }
  const resumen = await analyticsRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
