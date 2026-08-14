/**
 * DELTAOPS LITE-08 §21 · API HTTP de la PREFERENCIA de visibilidad de navegación.
 *
 * Router Express FINO montado bajo `/api/deltaops/visibilidad-nav`. Es una
 * superficie de COMPOSICIÓN (no es un módulo ni un segundo RBAC):
 *   - GET  → la preferencia efectiva del tenant (cualquier usuario autenticado
 *            del tenant puede LEERLA: la usa el shell para componer el nav).
 *   - PUT  → guarda la preferencia (SÓLO administrador de empresa/SUPER_ADMIN).
 *            Idempotente por `opId`; tiempo de servidor; identidad canónica.
 *
 * Visibilidad ≠ seguridad: el backend sigue rechazando (403) cualquier acceso a
 * un módulo no habilitado; ocultar un grupo del nav no concede ni revoca nada.
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import { KernelErrors, type KernelError, type Result } from "@workspace/kernel";
import { aRolCanonico } from "../../deltaops/identity/rbac";
import {
  visibilidadRuntime,
  contextForVisibilidad,
  principalVisibilidad,
  SERVICIO_VISIBILIDAD,
  PERMISOS_VISIBILIDAD,
} from "./visibilidad-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/visibilidad-nav";

interface SesionVis {
  userId: string;
  rolCanonico: string;
  tenant: string;
  identityId?: string;
}

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
  const rolCanonico = req.session?.rolCanonico ?? aRolCanonico(user.rol);
  res.locals.sesion = {
    userId: String(user.id),
    rolCanonico,
    tenant: user.tenant,
    ...(req.session?.identityId ? { identityId: req.session.identityId } : {}),
  } satisfies SesionVis;
  next();
});

function sesionOf(res: Response): SesionVis {
  return res.locals.sesion as SesionVis;
}

function statusOf(err: KernelError): number {
  if (err.code.startsWith("KRN-AUTH")) return 403;
  if (err.code.startsWith("KRN-NF")) return 404;
  if (err.code.startsWith("KRN-CFL")) return 409;
  if (err.code.startsWith("KRN-VAL")) return 400;
  return 500;
}

function sendResult(res: Response, r: Result<unknown, KernelError>): void {
  if (r.ok) {
    res.json(r.value);
    return;
  }
  res.status(statusOf(r.error)).json({ error: r.error.message, code: r.error.code });
}

/** Guarda de escritura: sólo administrador de empresa/SUPER_ADMIN. */
function puedeConfigurar(s: SesionVis): boolean {
  const permisos = principalVisibilidad(s.userId, s.rolCanonico).permisos ?? [];
  return permisos.includes("*") || permisos.includes(PERMISOS_VISIBILIDAD.write);
}

// GET · preferencia efectiva del tenant (lectura para todo usuario del tenant).
router.get(BASE, async (_req, res) => {
  const s = sesionOf(res);
  const ctx = contextForVisibilidad(s.userId, s.rolCanonico, s.tenant, s.identityId);
  const r = await visibilidadRuntime().platform.kernel.queries.execute(ctx, `${SERVICIO_VISIBILIDAD}.obtener`, {});
  sendResult(res, r);
});

// PUT · guarda la preferencia (admin de empresa/SUPER_ADMIN). Tiempo de servidor.
router.put(BASE, async (req, res) => {
  const s = sesionOf(res);
  if (!puedeConfigurar(s)) {
    res.status(403).json({ error: "No autorizado para configurar la visibilidad de la navegación" });
    return;
  }
  const ocultos = Array.isArray(req.body?.ocultos) ? req.body.ocultos : [];
  const opId = typeof req.body?.opId === "string" && req.body.opId.length > 0 ? req.body.opId : `vis-${Date.now()}`;
  const ctx = contextForVisibilidad(s.userId, s.rolCanonico, s.tenant, s.identityId);
  const r = await visibilidadRuntime().platform.kernel.commands.execute(ctx, `${SERVICIO_VISIBILIDAD}.guardar`, {
    opId,
    ocultos,
    actualizadoAt: new Date().toISOString(),
  });
  await visibilidadRuntime().platform.kernel.outboxProcessor.processPending();
  sendResult(res, r);
});

export default router;
