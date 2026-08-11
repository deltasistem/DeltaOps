/**
 * DGP-019.1 · API HTTP del Módulo de Utilización, Medidores y Combustible.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/utilizacion...
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-utilizacion";
import { utilizacionRuntime, contextForUtilizacion } from "./utilizacion-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/utilizacion";

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
  res.locals.ctx = contextForUtilizacion(String(user.id), user.rol, user.tenant);
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
  utilizacionRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  utilizacionRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await utilizacionRuntime().platform.kernel.outboxProcessor.processPending();
}

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}
const strQuery = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/* ============================== CONSULTAS ================================= */
// Rutas específicas ANTES de /:id para evitar colisión.

// --- Última lectura vigente (por activo + tipo de medidor) ---
router.get(`${BASE}/ultima-lectura`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.ultima-lectura`, {
    activoId: strQuery(req.query.activoId),
    tipoMedidor: strQuery(req.query.tipoMedidor),
  }));
});

// --- Lecturas (detalle + colección) ---
router.get(`${BASE}/lecturas/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.lectura-detalle`, { id: req.params.id }));
});
router.get(`${BASE}/lecturas`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.lecturas`, {
    activoId: strQuery(req.query.activoId),
    tipoMedidor: strQuery(req.query.tipoMedidor),
    estado: strQuery(req.query.estado),
    limit: numQuery(req.query.limit),
  }));
});

// --- Tanqueos (detalle + colección) ---
router.get(`${BASE}/tanqueos/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.tanqueo-detalle`, { id: req.params.id }));
});
router.get(`${BASE}/tanqueos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.tanqueos`, {
    activoId: strQuery(req.query.activoId),
    estado: strQuery(req.query.estado),
    limit: numQuery(req.query.limit),
  }));
});

// --- Resumen operacional del activo (deltas + consumo, "sin datos" ≠ 0) ---
router.get(`${BASE}/activos/:activoId/resumen`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.resumen`, {
    activoId: req.params.activoId,
    desde: strQuery(req.query.desde),
    hasta: strQuery(req.query.hasta),
  }));
});

// --- Catálogos / administración ---
router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo-opciones`, { catalogo: req.params.catalogo }));
});
router.get(`${BASE}/eventos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.eventos`, {}));
});
router.get(`${BASE}/consola`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, { limit: numQuery(req.query.limit) }));
});

/* ============================== COMANDOS ================================= */

// --- Catálogos ---
router.post(`${BASE}/catalogos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-upsert`, req.body));
});
router.post(`${BASE}/catalogos/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-habilitar`, req.body));
});

// --- Lecturas de medidor (registrar / anular / reinicio-medidor) ---
router.post(`${BASE}/lecturas`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-lectura`, req.body));
  await drain();
});
router.post(`${BASE}/lecturas/:id/anular`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.anular-lectura`, { ...req.body, id: req.params.id }));
  await drain();
});
// Reintento idempotente de la sincronización con Activos de una lectura cuya
// propagación quedó `fallida`: re-encola `sincronizar-activo` y drena el outbox.
router.post(`${BASE}/lecturas/:id/reintentar-sincronizacion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reintentar-sincronizacion`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/reinicio-medidor`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reinicio-medidor`, req.body));
  await drain();
});

// --- Tanqueos de combustible (registrar / anular) ---
router.post(`${BASE}/tanqueos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-tanqueo`, req.body));
  await drain();
});
router.post(`${BASE}/tanqueos/:id/anular`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.anular-tanqueo`, { ...req.body, id: req.params.id }));
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
  const resumen = await utilizacionRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
