/**
 * DGP-013.2 · API HTTP del Módulo Enterprise Procurement & Supply Chain.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/abastecimiento...
 *
 * La MATERIALIZACIÓN de inventario es un COMANDO OFICIAL del módulo
 * (`materializar-recepcion`): orquestador idempotente que compone
 * `modulo.inventario.mover` (vía puerto oficial `materializador`) y persiste el
 * vínculo línea→movimiento ATÓMICAMENTE. Esta ruta HTTP sólo DELEGA.
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-abastecimiento";
import { abastecimientoRuntime, contextForAbastecimiento } from "./abastecimiento-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/abastecimiento";

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
  res.locals.ctx = contextForAbastecimiento(String(user.id), user.rol, user.tenant);
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
  abastecimientoRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  abastecimientoRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await abastecimientoRuntime().platform.kernel.outboxProcessor.processPending();
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
// Rutas específicas ANTES de /:id para evitar colisión de rutas.

// --- Artículos ---
router.get(`${BASE}/articulos/:id/costos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.costos`, { articuloId: req.params.id }));
});
// DGP-021.0 · Costos EXACTOS del artículo (contrato público string-decimal,
// GAP-COST-14). Tenant SOLO desde la sesión; misma autorización que /costos
// (`modulo.abastecimiento.read`). Aditivo; no altera /costos existente.
router.get(`${BASE}/articulos/:id/costos-exactos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.costos-exactos`, { articuloId: req.params.id }));
});
router.get(`${BASE}/articulos/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.articulo`, { id: req.params.id }));
});
router.get(`${BASE}/articulos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.articulos`, {
    tipo: strQuery(req.query.tipo), familia: strQuery(req.query.familia),
    activo: boolQuery(req.query.activo), limit: numQuery(req.query.limit),
  }));
});

// --- Proveedores ---
router.get(`${BASE}/proveedores/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.proveedor`, { id: req.params.id }));
});
router.get(`${BASE}/proveedores`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.proveedores`, {
    tipo: strQuery(req.query.tipo), activo: boolQuery(req.query.activo), limit: numQuery(req.query.limit),
  }));
});

// --- Solicitudes + cotizaciones ---
router.get(`${BASE}/solicitudes/:id/cotizaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.cotizaciones`, { solicitudId: req.params.id }));
});
router.get(`${BASE}/solicitudes/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.solicitud`, { id: req.params.id }));
});
router.get(`${BASE}/solicitudes`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.solicitudes`, {
    estado: strQuery(req.query.estado), limit: numQuery(req.query.limit),
  }));
});

// --- Órdenes de compra + recepciones ---
router.get(`${BASE}/ordenes-compra/:id/recepciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.recepciones`, { ordenCompraId: req.params.id }));
});
router.get(`${BASE}/ordenes-compra/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.orden-compra`, { id: req.params.id }));
});
router.get(`${BASE}/ordenes-compra`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.ordenes-compra`, {
    estado: strQuery(req.query.estado), proveedorId: strQuery(req.query.proveedorId), limit: numQuery(req.query.limit),
  }));
});

// --- Catálogos / administración ---
router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo-opciones`, { catalogo: req.params.catalogo }));
});
router.get(`${BASE}/historial`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.historial`, { entityRef: strQuery(req.query.entityRef) }));
});
router.get(`${BASE}/eventos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.eventos`, { limit: numQuery(req.query.limit) }));
});
router.get(`${BASE}/consola`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, { limit: numQuery(req.query.limit) }));
});

/* ============================== COMANDOS ================================= */

// --- Artículos ---
router.post(`${BASE}/articulos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-articulo`, req.body));
  await drain();
});
router.put(`${BASE}/articulos/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.editar-articulo`, { ...req.body, id: req.params.id }));
  await drain();
});

// --- Proveedores ---
router.post(`${BASE}/proveedores`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-proveedor`, req.body));
  await drain();
});
router.put(`${BASE}/proveedores/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.editar-proveedor`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/proveedores/:id/calificar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.calificar-proveedor`, { ...req.body, id: req.params.id }));
  await drain();
});

// --- Solicitudes (gobernadas por Workflow Engine) ---
router.post(`${BASE}/solicitudes`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-solicitud`, req.body));
  await drain();
});
router.post(`${BASE}/solicitudes/:id/transicion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transicionar-solicitud`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/solicitudes/:id/seleccionar-cotizacion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.seleccionar-cotizacion`, { ...req.body, solicitudId: req.params.id }));
  await drain();
});

// --- Cotizaciones ---
router.post(`${BASE}/cotizaciones`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-cotizacion`, req.body));
  await drain();
});

// --- Órdenes de compra (gobernadas por Workflow Engine) ---
router.post(`${BASE}/ordenes-compra`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-orden-compra`, req.body));
  await drain();
});
router.post(`${BASE}/ordenes-compra/:id/transicion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transicionar-orden-compra`, { ...req.body, id: req.params.id }));
  await drain();
});

// --- Recepciones + materialización de inventario ---
router.post(`${BASE}/recepciones`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-recepcion`, req.body));
  await drain();
});
router.post(`${BASE}/recepciones/:id/materializar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.materializar-recepcion`, { ...req.body, recepcionId: req.params.id }));
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
  const resumen = await abastecimientoRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
