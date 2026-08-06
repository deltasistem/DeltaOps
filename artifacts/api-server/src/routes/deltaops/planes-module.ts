/**
 * DGP-012.2 · API HTTP del Módulo Enterprise Maintenance Plans.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/planes...
 *
 * El MOTOR PREVENTIVO es un COMANDO OFICIAL del módulo Planes
 * (`generar-ordenes-preventivas`): orquestador idempotente que MATERIALIZA las
 * generaciones decididas en Órdenes de Trabajo REALES (vía el puerto oficial
 * `materializador`, que compone `modulo.ordenes.crear`) y persiste el vínculo
 * generación→OT ATÓMICAMENTE. Esta ruta HTTP sólo DELEGA en ese comando.
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-planes";
import { planesRuntime, contextForPlanes } from "./planes-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/planes";

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
  res.locals.ctx = contextForPlanes(String(user.id), user.rol, user.tenant);
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
  planesRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  planesRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await planesRuntime().platform.kernel.outboxProcessor.processPending();
}

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}
const strQuery = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/* ------------------------------ Consultas --------------------------------- */

// Rutas específicas ANTES de /:id para evitar colisión de rutas.
router.get(`${BASE}/calendarios/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.calendario`, { id: req.params.id }));
});
router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo-opciones`, { catalogo: req.params.catalogo }));
});
router.get(`${BASE}/eventos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.eventos`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/consola`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/:id/versiones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.comparar-versiones`, {
    id: req.params.id, a: numQuery(req.query.a), b: numQuery(req.query.b),
  }));
});
router.get(`${BASE}/:id/historial`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.historial`, { planId: req.params.id }));
});
router.get(`${BASE}/:id/generaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.generaciones`, { planId: req.params.id }));
});

// Listado + detalle de planes.
router.get(BASE, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.planes`, {
    estado: strQuery(req.query.estado),
    tipoPlan: strQuery(req.query.tipoPlan),
    limit: numQuery(req.query.limit),
  }));
});
router.get(`${BASE}/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.plan`, { id: req.params.id }));
});

/* ------------------------------ Comandos ---------------------------------- */

// Planes
router.post(BASE, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-plan`, req.body));
  await drain();
});
router.put(`${BASE}/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.editar-plan`, { ...req.body, id: req.params.id }));
  await drain();
});

// Gobierno (Workflow Engine)
router.post(`${BASE}/:id/publicar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.publicar-plan`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/:id/transicion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transicionar-plan`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/:id/archivar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.archivar-plan`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/:id/rollback`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.rollback-plan`, { ...req.body, id: req.params.id }));
  await drain();
});

// Calendarios
router.post(`${BASE}/calendarios`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-calendario`, req.body));
  await drain();
});

// Motor de generación: DECIDIR (idempotente, no crea la OT).
router.post(`${BASE}/:id/evaluar-generacion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.evaluar-generacion`, { ...req.body, planId: req.params.id }));
  await drain();
});

// Catálogos
router.post(`${BASE}/catalogos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-upsert`, req.body));
});
router.post(`${BASE}/catalogos/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-habilitar`, req.body));
});

// Reproyección (admin) — replay del event log durable.
router.post(`${BASE}/reproyectar`, async (_req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reproyectar`, {}));
});

/* --------------------- MOTOR PREVENTIVO (comando oficial) ----------------- */
// DELEGA en el comando OFICIAL idempotente `generar-ordenes-preventivas`, que
// materializa las generaciones decididas en OT REALES (vía puerto oficial) y
// persiste el vínculo generación→OT ATÓMICAMENTE. HTTP sólo mapea params/body.

router.post(`${BASE}/:id/generar-ordenes-preventivas`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.generar-ordenes-preventivas`, {
    planId: req.params.id,
    limite: numQuery(req.query.limite),
    tipoOrden: strQuery(req.body?.tipoOrden),
    opId: strQuery(req.body?.opId),
  }));
  await drain();
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
  const resumen = await planesRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
