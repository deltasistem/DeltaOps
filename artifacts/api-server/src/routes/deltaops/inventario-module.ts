/**
 * DGP-011.2 · API HTTP del Módulo Enterprise Inventory.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/inventario...
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-inventario";
import { inventarioRuntime, contextForInventario } from "./inventario-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/inventario";

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
  res.locals.ctx = contextForInventario(String(user.id), user.rol, user.tenant);
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
  inventarioRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  inventarioRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await inventarioRuntime().platform.kernel.outboxProcessor.processPending();
}

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}
const strQuery = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const boolQuery = (v: unknown): boolean | undefined => (v === "true" ? true : v === "false" ? false : undefined);

/* ------------------------------ Consultas --------------------------------- */

// Listados/rutas específicas ANTES de /:id para evitar colisión de rutas.
router.get(`${BASE}/bodegas`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.bodegas`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/bodegas/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.bodega`, { id: req.params.id }));
});
router.get(`${BASE}/ubicaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.ubicaciones`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/ubicaciones/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.ubicacion`, { id: req.params.id }));
});
router.get(`${BASE}/lotes`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.lotes`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/lotes/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.lote`, { id: req.params.id }));
});
router.get(`${BASE}/series`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.series`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/series/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.serie`, { id: req.params.id }));
});
router.get(`${BASE}/reservas`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.reservas`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/reservas/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.reserva`, { id: req.params.id }));
});
router.get(`${BASE}/transferencias`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.transferencias`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/transferencias/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.transferencia`, { id: req.params.id }));
});
router.get(`${BASE}/ajustes`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.ajustes`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/ajustes/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.ajuste`, { id: req.params.id }));
});
router.get(`${BASE}/conteos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.conteos`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/conteos/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.conteo`, { id: req.params.id }));
});
router.get(`${BASE}/existencias/:id/movimientos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.movimientos`, { inventarioId: req.params.id, limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/existencias/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.existencia`, { id: req.params.id }));
});
router.get(`${BASE}/items/:itemId/existencias`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.existencias-item`, { itemId: req.params.itemId }));
});
router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo-opciones`, { catalogo: req.params.catalogo }));
});
router.get(`${BASE}/consola`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, { limit: numQuery(req.query.limit) }));
});

// Listado + detalle de items.
router.get(BASE, async (req, res) => {
  const q = req.query;
  send(res, await query(ctxOf(res), `${MODULO}.items`, {
    estado: strQuery(q.estado),
    tipoItem: strQuery(q.tipoItem),
    incluirEliminados: boolQuery(q.incluirEliminados),
    limit: numQuery(q.limit),
  }));
});
router.get(`${BASE}/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.item`, { id: req.params.id }));
});

/* ------------------------------ Comandos ---------------------------------- */

// Items
router.post(BASE, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-item`, req.body));
  await drain();
});
router.put(`${BASE}/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.editar-item`, { ...req.body, id: req.params.id }));
  await drain();
});
router.delete(`${BASE}/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.eliminar-item`, { ...req.body, id: req.params.id }));
  await drain();
});

// Bodegas / ubicaciones
router.post(`${BASE}/bodegas`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-bodega`, req.body));
  await drain();
});
router.post(`${BASE}/ubicaciones`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-ubicacion`, req.body));
  await drain();
});

// Lotes / series
router.post(`${BASE}/lotes`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-lote`, req.body));
  await drain();
});
router.post(`${BASE}/series`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-serie`, req.body));
  await drain();
});

// Existencias / movimientos
router.post(`${BASE}/mover`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.mover`, req.body));
  await drain();
});

// Reservas
router.post(`${BASE}/reservas`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reservar`, req.body));
  await drain();
});
router.post(`${BASE}/reservas/:id/liberar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.liberar-reserva`, { ...req.body, id: req.params.id }));
  await drain();
});

// Transferencias (gobernadas)
router.post(`${BASE}/transferencias`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transferir`, req.body));
  await drain();
});
router.post(`${BASE}/transferencias/:id/completar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.completar-transferencia`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/transferencias/:id/transicion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transicionar-transferencia`, { ...req.body, id: req.params.id }));
  await drain();
});

// Ajustes (gobernados)
router.post(`${BASE}/ajustes`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.ajustar`, req.body));
  await drain();
});

// Conteos (gobernados)
router.post(`${BASE}/conteos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.iniciar-conteo`, req.body));
  await drain();
});
router.post(`${BASE}/conteos/:id/registrar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-conteo`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/conteos/:id/cerrar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.cerrar-conteo`, { ...req.body, id: req.params.id }));
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

/* --------------------------- Sincronización offline ----------------------- */
// ORQUESTACIÓN (no comando anidado): una UoW por operación real. El outbox se
// drena dentro de `sincronizar` (procesarCola). Ver sincronizacion.ts.

router.post(`${BASE}/sync`, async (req, res) => {
  const parsed = ColaSyncSchema.safeParse(req.body?.operaciones ?? req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Cola de sincronización inválida", code: "KRN-VAL-001" });
    return;
  }
  const resumen = await inventarioRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
