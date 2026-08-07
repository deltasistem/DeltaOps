/**
 * DGP-015.2 · API HTTP del Módulo Enterprise Corrective Maintenance.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/correctivo...
 *
 * La GENERACIÓN de OTs correctivas es un COMANDO OFICIAL del módulo
 * (`generar-orden-correctiva`): orquestador idempotente que compone
 * `modulo.ordenes.crear` (vía puerto oficial `materializador`) y persiste el
 * vínculo generación→OT ATÓMICAMENTE. Esta ruta HTTP sólo DELEGA.
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-correctivo";
import { correctivoRuntime, contextForCorrectivo } from "./correctivo-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/correctivo";

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
  res.locals.ctx = contextForCorrectivo(String(user.id), user.rol, user.tenant);
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
  correctivoRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  correctivoRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await correctivoRuntime().platform.kernel.outboxProcessor.processPending();
}

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}
const strQuery = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/* ============================== CONSULTAS ================================= */
// Rutas específicas ANTES de /:id para evitar colisión de rutas.

// --- Solicitudes (detalle + colección) ---
router.get(`${BASE}/solicitudes/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.solicitud-detalle`, { id: req.params.id }));
});
router.get(`${BASE}/solicitudes`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.solicitudes`, {
    estado: strQuery(req.query.estado), origen: strQuery(req.query.origen),
    activoId: strQuery(req.query.activoId), limit: numQuery(req.query.limit),
  }));
});

// --- Intervenciones (detalle) ---
router.get(`${BASE}/intervenciones/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.intervencion-detalle`, { id: req.params.id }));
});

// --- Eventos de activo (historial de fallas / reincidencia) ---
router.get(`${BASE}/activos/:activoId/eventos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.eventos-activo`, { activoId: req.params.activoId }));
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

// --- Solicitudes (CRUD + evidencia/comentario + gobierno de ciclo) ---
router.post(`${BASE}/solicitudes`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-solicitud`, req.body));
  await drain();
});
router.put(`${BASE}/solicitudes/:id`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.editar-solicitud`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/solicitudes/:id/evidencia`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.adjuntar-evidencia`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/solicitudes/:id/comentario`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.comentar-solicitud`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/solicitudes/:id/diagnostico`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-diagnostico`, { ...req.body, solicitudId: req.params.id }));
  await drain();
});
router.post(`${BASE}/solicitudes/:id/transicion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transicionar-solicitud`, { ...req.body, id: req.params.id }));
  await drain();
});

// --- Generación de OT (compone modulo.ordenes.crear vía materializador) ---
router.post(`${BASE}/generar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.generar-orden-correctiva`, req.body));
  await drain();
});

// --- Intervenciones (creación + asignación + gobierno de ciclo) ---
router.post(`${BASE}/intervenciones`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.crear-intervencion`, req.body));
  await drain();
});
router.post(`${BASE}/intervenciones/:id/cuadrillas`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.asignar-cuadrillas`, { ...req.body, id: req.params.id }));
  await drain();
});
router.post(`${BASE}/intervenciones/:id/transicion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.transicionar-intervencion`, { ...req.body, id: req.params.id }));
  await drain();
});

// --- Inventario (reserva / consumo / devolución de repuestos) ---
router.post(`${BASE}/intervenciones/:id/reservar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reservar-repuestos`, { ...req.body, intervencionId: req.params.id }));
  await drain();
});
router.post(`${BASE}/intervenciones/:id/consumir`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.consumir-repuesto`, { ...req.body, intervencionId: req.params.id }));
  await drain();
});
router.post(`${BASE}/intervenciones/:id/devolver`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.devolver-repuesto`, { ...req.body, intervencionId: req.params.id }));
  await drain();
});

// --- Eventos de activo (registro autosuficiente para MTBF/MTTR/reincidencia) ---
router.post(`${BASE}/eventos-activo`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.registrar-evento-activo`, req.body));
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
  const resumen = await correctivoRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
