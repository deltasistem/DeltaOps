/**
 * DGP-020.3 · API HTTP de la Fundación de Mano de Obra.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol CANÓNICO (distingue SUPERVISOR/PLANIFICADOR/TECNICO,
 * que el rol espejo colapsa). Mapea KRN→HTTP (AUTH→403, NF→404, CFL→409, VAL→400,
 * INF→500). Rutas bajo /api/deltaops/manodeobra...
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { MODULO } from "@workspace/module-manodeobra";
import { manodeobraRuntime, contextForManodeobra } from "./manodeobra-runtime";
import { aRolCanonico } from "../../deltaops/identity/rbac";

const router: IRouter = Router();
const BASE = "/deltaops/manodeobra";

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
  // Rol CANÓNICO de la sesión (misma fuente/normalización que Órdenes/Utilización):
  // el modo técnico "mías" atado a la identidad canónica exige distinguir TECNICO.
  const rolCanonico = req.session?.rolCanonico ?? aRolCanonico(user.rol);
  res.locals.ctx = contextForManodeobra(String(user.id), rolCanonico, user.tenant, req.session?.identityId);
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
  manodeobraRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  manodeobraRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await manodeobraRuntime().platform.kernel.outboxProcessor.processPending();
}

const strQuery = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/* ============================== CONSULTAS ================================= */

// Catálogo de categorías (vacío ⇒ canónicas por defecto) + unidades soportadas.
router.get(`${BASE}/catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo.opciones`, { catalogo: strQuery(req.query.catalogo) ?? "categorias-mdo" }));
});

// Recursos humanos (nombre resuelto por Identidad).
router.get(`${BASE}/recursos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.recursos`, {
    categoriaClave: strQuery(req.query.categoriaClave),
    estado: strQuery(req.query.estado),
  }));
});

// Tarifas de un sujeto (histórico versionado).
router.get(`${BASE}/tarifas`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.tarifas`, {
    sujetoTipo: strQuery(req.query.sujetoTipo),
    sujetoId: strQuery(req.query.sujetoId),
    estado: strQuery(req.query.estado),
  }));
});

// Valoraciones pendientes (red de seguridad de la orquestación). ANTES de la
// colección general para evitar colisión de rutas.
router.get(`${BASE}/valoraciones/pendientes`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.valoraciones.pendientes`, { ordenId: strQuery(req.query.ordenId) }));
});

// Valoraciones (por OT/activo/identidad/estado).
router.get(`${BASE}/valoraciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.valoraciones`, {
    ordenId: strQuery(req.query.ordenId),
    activoId: strQuery(req.query.activoId),
    identityId: strQuery(req.query.identityId),
    estado: strQuery(req.query.estado),
  }));
});

// Mis valoraciones (identidad del contexto; match canónico estricto).
router.get(`${BASE}/mias`, async (_req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.mias`, {}));
});

// Resumen de mano de obra por OT (agregado + pendientes).
router.get(`${BASE}/resumen`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.resumen`, { ordenId: strQuery(req.query.ordenId) }));
});

// Costo estimado de una sesión en curso (sinTarifa nunca 0).
router.get(`${BASE}/costo-estimado`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.costo-estimado`, { sesionId: strQuery(req.query.sesionId) }));
});

/* ============================== COMANDOS ================================= */

// Catálogo de categorías.
router.post(`${BASE}/catalogo`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo.upsert`, req.body));
});
router.post(`${BASE}/catalogo/habilitar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.catalogo.habilitar`, req.body));
});

// Recursos humanos.
router.post(`${BASE}/recursos`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.recurso.definir`, req.body));
});
router.post(`${BASE}/recursos/estado`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.recurso.estado`, req.body));
});

// Tarifas versionables.
router.post(`${BASE}/tarifas`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.tarifa.crear`, req.body));
});
router.post(`${BASE}/tarifas/actualizar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.tarifa.actualizar`, req.body));
});
router.post(`${BASE}/tarifas/cerrar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.tarifa.cerrar`, req.body));
});

// Valoración orquestada (reintento manual/administrativo) + revaloración.
router.post(`${BASE}/valoraciones/procesar-sesion`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.valoracion.procesar-sesion`, req.body);
  await drain();
  send(res, r);
});
router.post(`${BASE}/valoraciones/revalorar`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.valoracion.revalorar`, req.body);
  await drain();
  send(res, r);
});

export default router;
