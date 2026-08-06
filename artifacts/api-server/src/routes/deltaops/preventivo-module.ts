/**
 * DGP-014.2 · API HTTP del Módulo Enterprise Preventive Maintenance.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/preventivo...
 *
 * La GENERACIÓN de OTs es un COMANDO OFICIAL del módulo (`generar`): orquestador
 * idempotente que compone `modulo.ordenes.crear` (vía puerto oficial
 * `materializador`) y persiste el vínculo generación→OT ATÓMICAMENTE. Esta ruta
 * HTTP sólo DELEGA.
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-preventivo";
import { preventivoRuntime, contextForPreventivo } from "./preventivo-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/preventivo";

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
  res.locals.ctx = contextForPreventivo(String(user.id), user.rol, user.tenant);
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
  preventivoRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  preventivoRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await preventivoRuntime().platform.kernel.outboxProcessor.processPending();
}

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}
const strQuery = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/* ============================== CONSULTAS ================================= */
// Rutas específicas ANTES de /:id para evitar colisión de rutas.

// --- Programas (detalle + colecciones asociadas) ---
router.get(`${BASE}/programas/:id/actividades`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.actividades`, { programaId: req.params.id }));
});
router.get(`${BASE}/programas/:id/versiones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.versiones`, { programaId: req.params.id }));
});
router.get(`${BASE}/programas/:id/generaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.generaciones`, {
    programaId: req.params.id, estado: strQuery(req.query.estado), limit: numQuery(req.query.limit),
  }));
});
router.get(`${BASE}/programas/:id/programaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.programaciones`, {
    programaId: req.params.id, limit: numQuery(req.query.limit),
  }));
});
router.get(`${BASE}/programas/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.programa`, { id: req.params.id }));
});
router.get(`${BASE}/programas`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.programas`, {
    estado: strQuery(req.query.estado), tipo: strQuery(req.query.tipo), limit: numQuery(req.query.limit),
  }));
});

// --- Catálogos / administración ---
router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo-opciones`, { catalogo: req.params.catalogo }));
});
router.get(`${BASE}/eventos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.eventos`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/consola`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, { limit: numQuery(req.query.limit) }));
});

/* ============================== COMANDOS ================================= */

// --- Programas (CRUD + gobierno de ciclo por Workflow Engine) ---
router.post(`${BASE}/programas`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-programa`, req.body));
  await drain();
});
router.put(`${BASE}/programas/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.editar-programa`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/programas/:id/transicion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transicionar-programa`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/programas/:id/versionar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.versionar-programa`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/programas/:id/revertir`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.revertir-programa`, { ...req.body, id: req.params.id }));
  await drain();
});

// --- Actividades ---
router.post(`${BASE}/actividades`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.definir-actividad`, req.body));
  await drain();
});

// --- Generación de OT (compone modulo.ordenes.crear vía materializador) ---
router.post(`${BASE}/generar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.generar`, req.body));
  await drain();
});

// --- Programaciones: reprogramar / suspender / excluir ---
router.post(`${BASE}/reprogramar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reprogramar`, req.body));
  await drain();
});
router.post(`${BASE}/suspender`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.suspender`, req.body));
  await drain();
});
router.post(`${BASE}/excluir`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.excluir`, req.body));
  await drain();
});

// --- Catálogos ---
router.post(`${BASE}/catalogos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-upsert`, req.body));
});
router.post(`${BASE}/catalogos/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo-habilitar`, req.body));
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
  const resumen = await preventivoRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
