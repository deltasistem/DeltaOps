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

router.get(BASE, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.listar`, {
    estado: typeof req.query.estado === "string" ? req.query.estado : undefined,
    criticidad: typeof req.query.criticidad === "string" ? req.query.criticidad : undefined,
    ubicacionId: typeof req.query.ubicacionId === "string" ? req.query.ubicacionId : undefined,
    tipo: typeof req.query.tipo === "string" ? req.query.tipo : undefined,
  }));
});

router.get(`${BASE}/consola`, async (_req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, {}));
});

router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo.opciones`, { catalogo: req.params.catalogo }));
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
