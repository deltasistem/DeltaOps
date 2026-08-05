/**
 * DGP-009.2 · API HTTP del Módulo Órdenes de Trabajo Empresariales.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/ordenes...
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-ordenes";
import { ordenesRuntime, contextForOrdenes } from "./ordenes-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/ordenes";

/* ------------------------------ Sesión ------------------------------------ */

router.use(BASE, async (req, res, next): Promise<void> => {
  const userId = req.session?.deltaopsUserId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const [user] = await db
    .select({ id: deltaopsUsersTable.id, rol: deltaopsUsersTable.rol })
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  res.locals.ctx = contextForOrdenes(String(user.id), user.rol);
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
  ordenesRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  ordenesRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await ordenesRuntime().platform.kernel.outboxProcessor.processPending();
}

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}
const strQuery = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/* ------------------------------ Consultas --------------------------------- */

router.get(BASE, async (req, res) => {
  const q = req.query;
  send(res, await query(ctxOf(res), `${MODULO}.listar`, {
    estado: strQuery(q.estado),
    tipo: strQuery(q.tipo),
    responsable: strQuery(q.responsable),
    activoPrincipalId: strQuery(q.activoPrincipalId),
    limit: numQuery(q.limit),
  }));
});

// Agenda / calendario (rutas específicas antes de /:id).
router.get(`${BASE}/agenda`, async (req, res) => {
  const q = req.query;
  send(res, await query(ctxOf(res), `${MODULO}.agenda`, {
    desde: strQuery(q.desde), hasta: strQuery(q.hasta), limit: numQuery(q.limit),
  }));
});

router.get(`${BASE}/calendario`, async (req, res) => {
  const q = req.query;
  send(res, await query(ctxOf(res), `${MODULO}.calendario`, {
    desde: strQuery(q.desde) ?? "", hasta: strQuery(q.hasta) ?? "",
  }));
});

router.get(`${BASE}/consola`, async (_req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, {}));
});

router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo.opciones`, { catalogo: req.params.catalogo }));
});

// Read models operacionales por OT (rutas específicas antes de /:id).
router.get(`${BASE}/:id/asignaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.asignaciones`, { ordenId: req.params.id }));
});
router.get(`${BASE}/:id/responsables`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.responsables`, { ordenId: req.params.id }));
});
router.get(`${BASE}/:id/relaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.relaciones`, {
    ordenId: req.params.id, categoria: strQuery(req.query.categoria),
  }));
});
router.get(`${BASE}/:id/activos-relacionados`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.activos-relacionados`, { ordenId: req.params.id }));
});
router.get(`${BASE}/:id/dependencias`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.dependencias`, { ordenId: req.params.id }));
});
router.get(`${BASE}/:id/historial`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.historial`, { ordenId: req.params.id, limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/:id/bitacora`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.bitacora`, { ordenId: req.params.id, limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/:id/documentacion`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.documentacion`, { ordenId: req.params.id, clase: strQuery(req.query.clase) }));
});
router.get(`${BASE}/:id/formularios`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.formularios`, { ordenId: req.params.id }));
});
router.get(`${BASE}/:id/checklists`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.checklists`, { ordenId: req.params.id }));
});

router.get(`${BASE}/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.detalle`, { id: req.params.id }));
});

/* ------------------------------ Comandos ---------------------------------- */

router.post(BASE, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.crear`, req.body);
  await drain();
  send(res, r);
});

router.put(`${BASE}/:id`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.editar`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});

// Ciclo de vida (aggregate; usan `id`).
router.post(`${BASE}/:id/transicionar`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.transicionar`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/aprobar-cierre`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.aprobarCierre`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/asignar`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.asignar`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/ejecucion`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.registrarEjecucion`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/formulario`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.asociarFormulario`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/checklist`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.asociarChecklist`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/evidencias`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.agregarEvidencia`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});

// Operacional (usan `ordenId`).
router.post(`${BASE}/:id/planificar`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.planificar`, { ...req.body, ordenId: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/asignar-recurso-humano`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.asignar-recurso-humano`, { ...req.body, ordenId: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/recursos`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.registrar-recurso`, { ...req.body, ordenId: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/sla`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.sla.definir`, { ...req.body, ordenId: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/relaciones`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.crear-relacion`, { ...req.body, ordenId: req.params.id });
  await drain();
  send(res, r);
});
router.post(`${BASE}/:id/bitacora`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.bitacora.registrar`, { ...req.body, ordenId: req.params.id });
  await drain();
  send(res, r);
});

// Catálogos.
router.post(`${BASE}/catalogos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo.upsert`, req.body));
});
router.post(`${BASE}/catalogos/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo.habilitar`, req.body));
});

// Reproyección (admin) — replay del event log durable.
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
  const resumen = await ordenesRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
