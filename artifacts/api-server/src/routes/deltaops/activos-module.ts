/**
 * DGP-008.1 · API HTTP del Módulo Activos Empresariales.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol. Mapea códigos KRN → HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400). Rutas bajo /api/deltaops/activos...
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { ColaSyncSchema, MODULO } from "@workspace/module-activos";
import { activosRuntime, contextForActivos } from "./activos-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/activos";

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
  res.locals.ctx = contextForActivos(String(user.id), user.rol);
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
  activosRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  activosRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await activosRuntime().platform.kernel.outboxProcessor.processPending();
}

/* ------------------------------ Consultas --------------------------------- */

function numQuery(v: unknown): number | undefined {
  return typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;
}

router.get(BASE, async (req, res) => {
  const q = req.query;
  send(res, await query(ctxOf(res), `${MODULO}.listar`, {
    estado: typeof q.estado === "string" ? q.estado : undefined,
    criticidad: typeof q.criticidad === "string" ? q.criticidad : undefined,
    ubicacionId: typeof q.ubicacionId === "string" ? q.ubicacionId : undefined,
    tipo: typeof q.tipo === "string" ? q.tipo : undefined,
    categoria: typeof q.categoria === "string" ? q.categoria : undefined,
    familia: typeof q.familia === "string" ? q.familia : undefined,
    responsable: typeof q.responsable === "string" ? q.responsable : undefined,
    q: typeof q.q === "string" ? q.q : undefined,
    limit: numQuery(q.limit),
    offset: numQuery(q.offset),
  }));
});

// Búsqueda rápida/contextual de activos (delega en platform.search).
router.get(`${BASE}/busqueda`, async (req, res) => {
  const q = req.query;
  send(res, await query(ctxOf(res), `${MODULO}.busqueda`, {
    q: typeof q.q === "string" ? q.q : "",
    estado: typeof q.estado === "string" ? q.estado : undefined,
    tipo: typeof q.tipo === "string" ? q.tipo : undefined,
    categoria: typeof q.categoria === "string" ? q.categoria : undefined,
    familia: typeof q.familia === "string" ? q.familia : undefined,
    criticidad: typeof q.criticidad === "string" ? q.criticidad : undefined,
    ubicacionId: typeof q.ubicacionId === "string" ? q.ubicacionId : undefined,
    responsable: typeof q.responsable === "string" ? q.responsable : undefined,
    limit: numQuery(q.limit),
  }));
});

// Resolución de etiqueta QR/barcode/NFC → {activoId} (navegación directa).
router.get(`${BASE}/qr/resolver`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.qr-resolver`, {
    codigo: typeof req.query.codigo === "string" ? req.query.codigo : "",
  }));
});

router.get(`${BASE}/consola`, async (_req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, {}));
});

router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo.opciones`, { catalogo: req.params.catalogo }));
});

// Read models operacionales DGP-008.2 (rutas específicas antes de /:id).
router.get(`${BASE}/:id/relacionados`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.relacionados`, {
    id: req.params.id,
    categoria: typeof req.query.categoria === "string" ? req.query.categoria : undefined,
  }));
});

router.get(`${BASE}/:id/arbol`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.arbol`, { id: req.params.id }));
});

router.get(`${BASE}/:id/componentes`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.componentes`, { id: req.params.id }));
});

router.get(`${BASE}/:id/historial/ubicaciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.historial-ubicaciones`, { id: req.params.id }));
});

router.get(`${BASE}/:id/historial/responsables`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.historial-responsables`, { id: req.params.id }));
});

// Historial cronológico interno del activo (read model act_historial).
router.get(`${BASE}/:id/historial`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.historial`, { id: req.params.id }));
});

// Línea de tiempo CANÓNICA (Shared Timeline de plataforma) con filtros:
// actor, estado, entidadRelacionada, rango de fechas (desde/hasta).
router.get(`${BASE}/:id/timeline`, async (req, res) => {
  const q = req.query;
  send(res, await query(ctxOf(res), `${MODULO}.timeline`, {
    id: req.params.id,
    actor: typeof q.actor === "string" ? q.actor : undefined,
    estado: typeof q.estado === "string" ? q.estado : undefined,
    entidadRelacionada: typeof q.entidadRelacionada === "string" ? q.entidadRelacionada : undefined,
    desde: typeof q.desde === "string" ? q.desde : undefined,
    hasta: typeof q.hasta === "string" ? q.hasta : undefined,
  }));
});

// Colaboración: comentarios y documentación técnica del activo.
router.get(`${BASE}/:id/comentarios`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.comentarios`, { id: req.params.id }));
});

router.get(`${BASE}/:id/documentacion/:attachmentId/url`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.documentacion-url`, {
    id: req.params.id,
    attachmentId: req.params.attachmentId,
  }));
});

router.get(`${BASE}/:id/documentacion`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.documentacion`, { id: req.params.id }));
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

for (const accion of ["registrar", "operar", "mantener", "fuera-servicio", "retirar"]) {
  router.post(`${BASE}/:id/${accion}`, async (req, res) => {
    const r = await exec(ctxOf(res), `${MODULO}.${accion}`, { id: req.params.id, ...req.body });
    await drain();
    send(res, r);
  });
}

router.post(`${BASE}/:id/ubicacion`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.cambiar-ubicacion`, { id: req.params.id, ...req.body });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/responsable`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.asignar-responsable`, { id: req.params.id, ...req.body });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/horometro`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.actualizar-horometro`, { id: req.params.id, ...req.body });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/odometro`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.actualizar-odometro`, { id: req.params.id, ...req.body });
  await drain();
  send(res, r);
});

// Emitir/reutilizar etiqueta QR (o barcode/nfc) para el activo (idempotente).
router.post(`${BASE}/:id/qr`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.qr-emitir`, {
    id: req.params.id,
    tipo: typeof req.body?.tipo === "string" ? req.body.tipo : "qr",
  });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/relaciones`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.crear-relacion`, { ...req.body, origenId: req.params.id });
  await drain();
  send(res, r);
});

router.delete(`${BASE}/relaciones/:relId`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.eliminar-relacion`, { id: req.params.relId });
  await drain();
  send(res, r);
});

// Colaboración: comentarios (crear/responder, editar, borrar lógico) y
// adjuntar documentación técnica por referencia — delegan en plataforma.
router.post(`${BASE}/:id/comentarios`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.comentar`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});

router.put(`${BASE}/comentarios/:comentarioId`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.editar-comentario`, { ...req.body, comentarioId: req.params.comentarioId });
  await drain();
  send(res, r);
});

router.delete(`${BASE}/comentarios/:comentarioId`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.borrar-comentario`, { comentarioId: req.params.comentarioId });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/documentacion`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.adjuntar`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});

router.post(`${BASE}/catalogos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo.upsert`, req.body));
});

router.post(`${BASE}/catalogos/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo.habilitar`, req.body));
});

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
  const resumen = await activosRuntime().sincronizar(ctxOf(res), parsed.data);
  res.json(resumen);
});

export default router;
