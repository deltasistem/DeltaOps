/**
 * DGP-021.1 · API HTTP de la Fundación del Módulo de Costos.
 * Router Express FINO: HTTP → Command/Query del Kernel. Sesión obligatoria;
 * principal derivado del rol CANÓNICO (distingue SUPERVISOR/PLANIFICADOR/TECNICO,
 * que el rol espejo colapsa) y la IDENTIDAD canónica de sesión propagada como
 * autorizante de los costos manuales OTROS. Mapea KRN→HTTP (AUTH→403, NF→404,
 * CFL→409, VAL→400, INF→500). Rutas bajo /api/deltaops/costos...
 *
 * Las mutaciones que cambian estado del hecho drenan el outbox para publicar los
 * eventos (`hecho.materializado` / `hecho.anulado`) tras la transacción.
 */
import { Router, type IRouter, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { MODULO } from "@workspace/module-costos";
import { costosRuntime, contextForCostos } from "./costos-runtime";
import { listarPendientes, reprocesarPendientes, type EstadoPendiente } from "./costos-orquestador";
import { aRolCanonico } from "../../deltaops/identity/rbac";

const router: IRouter = Router();
const BASE = "/deltaops/costos";

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
  // Rol CANÓNICO de la sesión; la identidad canónica es la única fuente del
  // autorizante en costos manuales (nunca del cuerpo de la petición).
  const rolCanonico = req.session?.rolCanonico ?? aRolCanonico(user.rol);
  res.locals.ctx = contextForCostos(String(user.id), rolCanonico, user.tenant, req.session?.identityId);
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
  costosRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  costosRuntime().platform.kernel.queries.execute(ctx, name, input);

async function drain(): Promise<void> {
  await costosRuntime().platform.kernel.outboxProcessor.processPending();
}

const strQuery = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/* ============================== CONSULTAS ================================= */

// Series por moneda (nunca sumadas): ANTES de la colección general y del detalle
// para evitar colisión de rutas.
router.get(`${BASE}/hechos/por-moneda`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.hechos.por-moneda`, {
    otId: strQuery(req.query.otId),
    activoId: strQuery(req.query.activoId),
    tipo: strQuery(req.query.tipo),
    estado: strQuery(req.query.estado),
  }));
});

// Colección de hechos económicos (filtros por OT/activo/movimiento/artículo/
// tipo/moneda/estado). DGP-021.2 añade los read models de trazabilidad de origen.
router.get(`${BASE}/hechos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.hechos`, {
    otId: strQuery(req.query.otId),
    activoId: strQuery(req.query.activoId),
    movimientoId: strQuery(req.query.movimientoId),
    articuloId: strQuery(req.query.articuloId),
    tipo: strQuery(req.query.tipo),
    moneda: strQuery(req.query.moneda),
    estado: strQuery(req.query.estado),
  }));
});

/* --------------------- Pendientes de materialización (DGP-021.2) --------- */
// Permiso de MATERIALIZACIÓN del módulo (mismo que exigen los comandos
// `hecho.materializar-material|otros`: `authorization.permissions=[P_MATERIALIZAR]`).
// Se deriva del `MODULO` exportado (idéntico a como lo compone `principalCostos`),
// sin introducir permisos nuevos. §20: sólo materialización/administración puede
// disparar el reproceso; CONSULTA/TECNICO son de sola lectura en costos.
const P_MATERIALIZAR = `${MODULO}.materializar`;

/** Espeja `PermissionResolver.hasPermission` del kernel (comodín `*` incluido). */
function puedeMaterializar(ctx: ExecutionContext): boolean {
  const permisos = ctx.principal.permisos ?? [];
  return permisos.includes("*") || permisos.includes(P_MATERIALIZAR);
}

// Trazabilidad/recuperación de la orquestación inventario→costos. Tenant del
// contexto (RLS). DECISIÓN (§20): la LECTURA de pendientes es trazabilidad de
// costos y queda cubierta por la visibilidad de lectura del módulo que ya tienen
// CONSULTA/TECNICO/SUPERVISOR (permiso `P_READ`); NO requiere permiso de
// materialización. El registro es tenant-scoped (RLS por el tenant del contexto),
// de sólo lectura y sin datos sensibles adicionales ⇒ no se restringe más.
router.get(`${BASE}/pendientes`, async (req, res) => {
  try {
    const ctx = ctxOf(res);
    const tenant = (ctx.metadata as Record<string, unknown>)["tenantId"];
    const estado = strQuery(req.query.estado) as EstadoPendiente | undefined;
    const filas = typeof tenant === "string"
      ? await listarPendientes(tenant, estado)
      : await listarPendientes(undefined, estado);
    res.json({ pendientes: filas });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Reproceso idempotente de pendientes NO resueltos (opId determinista ⇒ sin
// duplicados). El reproceso ejecuta la materialización con el principal de
// SERVICIO (no el del llamante), por lo que el permiso del comando NO alcanza a
// verificar al solicitante. GUARDA EXPLÍCITA en la frontera HTTP: sólo roles con
// permiso de MATERIALIZACIÓN (SUPERVISOR/PLANIFICADOR/admin) pueden dispararlo;
// TECNICO/CONSULTA ⇒ 403 (§20 separación consulta/materialización/administración).
router.post(`${BASE}/pendientes/reprocesar`, async (req, res) => {
  try {
    const ctx = ctxOf(res);
    if (!puedeMaterializar(ctx)) {
      res.status(403).json({ error: `Permiso denegado: ${P_MATERIALIZAR}`, code: "KRN-AUTH-002" });
      return;
    }
    const tenant = (ctx.metadata as Record<string, unknown>)["tenantId"];
    const resumen = await reprocesarPendientes(typeof tenant === "string" ? tenant : undefined);
    res.json(resumen);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Detalle de un hecho (RUTA ANIDADA ⇒ tenant del contexto evita IDOR).
router.get(`${BASE}/hechos/:costoId`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.hecho.detalle`, { costoId: req.params.costoId }));
});

/* ============================== COMANDOS ================================= */

// Materializar hecho de MATERIAL (costo exacto de Abastecimiento; activo derivado de la OT).
router.post(`${BASE}/hechos/material`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.hecho.materializar-material`, req.body);
  await drain();
  send(res, r);
});

// Materializar hecho de OTROS (costo manual; autorizante = identidad de sesión).
router.post(`${BASE}/hechos/otros`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.hecho.materializar-otros`, req.body);
  await drain();
  send(res, r);
});

// Anular un hecho (RUTA ANIDADA ⇒ tenant del contexto evita IDOR; append-only).
router.post(`${BASE}/hechos/:costoId/anular`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.hecho.anular`, { ...req.body, costoId: req.params.costoId });
  await drain();
  send(res, r);
});

export default router;
