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
import { componerOt, componerActivo, resolverPeriodo, type Sesion } from "./costos-composicion";
import {
  componerActivoConIndicadores,
  indicadoresActivo,
  comparativaActivos,
  tendenciaActivo,
} from "./costos-indicadores";
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
  // DGP-021.3 · datos de sesión para la COMPOSICIÓN (orquesta manodeobra/costos/
  // utilización con el PRINCIPAL de sesión; cada módulo aplica su RBAC y su RLS).
  // TENANT SÓLO de sesión (§17): nunca del frontend.
  res.locals.sesion = {
    userId: String(user.id),
    rol: rolCanonico,
    tenant: user.tenant,
    identityId: req.session?.identityId,
  };
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
    // DGP-021.2 (R1) · filtro CARGO/ABONO: distingue costo de crédito (devolución).
    naturaleza: strQuery(req.query.naturaleza),
    moneda: strQuery(req.query.moneda),
    estado: strQuery(req.query.estado),
  }));
});

/* ---------------- Composición de costos de mantenimiento (DGP-021.3) ----- */
// LECTURA de orquestación: compone mano de obra + materiales + otros (+ combustible
// contextual del activo) por moneda, con estados COMPLETO/PARCIAL/SIN_DATOS/
// PENDIENTE/NO_APLICA (§8). RBAC de lectura por rol canónico (P_READ ya presente en
// el contexto). Tenant SÓLO de sesión (§17); `otId`/`activoId` de la URL se leen
// bajo el tenant de sesión ⇒ IDOR-safe/cross-tenant seguro (RLS).
function sesionOf(res: { locals: Record<string, unknown> }): Sesion {
  return res.locals.sesion as Sesion;
}

router.get(`${BASE}/composicion/ot/:otId`, async (req, res) => {
  const rango = resolverPeriodo(strQuery(req.query.periodo), new Date(), strQuery(req.query.desde), strQuery(req.query.hasta));
  send(res, await componerOt(sesionOf(res), req.params.otId, rango));
});

router.get(`${BASE}/composicion/activo/:activoId`, async (req, res) => {
  const rango = resolverPeriodo(strQuery(req.query.periodo), new Date(), strQuery(req.query.desde), strQuery(req.query.hasta));
  // DGP-021.4: la composición por activo se AMPLÍA con los indicadores económicos
  // (costo/hora, costo/km) reales, sustituyendo los placeholders diferidos.
  send(res, await componerActivoConIndicadores(sesionOf(res), req.params.activoId, rango));
});

/* ---------------- Indicadores económicos DGP-021.4 (LECTURA) ------------- */
// Costo/hora y costo/km por activo/período, POR MONEDA. Numerador EXACTO (021.3),
// denominador EXACTO (utilización, valorExacto por tramo). Tenant SÓLO de sesión.

router.get(`${BASE}/indicadores/activo/:activoId`, async (req, res) => {
  const rango = resolverPeriodo(strQuery(req.query.periodo), new Date(), strQuery(req.query.desde), strQuery(req.query.hasta));
  send(res, await indicadoresActivo(sesionOf(res), req.params.activoId, rango));
});

// Comparativa entre activos (§13): SERIES POR MONEDA, sin ranking cross-moneda.
// `activos` = lista separada por comas (IDs bajo el tenant de sesión ⇒ IDOR-safe).
router.get(`${BASE}/comparativa`, async (req, res) => {
  const rango = resolverPeriodo(strQuery(req.query.periodo), new Date(), strQuery(req.query.desde), strQuery(req.query.hasta));
  const ids = (strQuery(req.query.activos) ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "");
  send(res, await comparativaActivos(sesionOf(res), ids, rango));
});

// Tendencia mensual (§14): costo, horas, km, costo/hora, costo/km; huecos = sin-datos.
router.get(`${BASE}/tendencia/activo/:activoId`, async (req, res) => {
  const rango = resolverPeriodo(strQuery(req.query.periodo), new Date(), strQuery(req.query.desde), strQuery(req.query.hasta));
  send(res, await tendenciaActivo(sesionOf(res), req.params.activoId, rango));
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

// DGP-021.2 (R2) · ANTI-BYPASS (§20): NO existe ruta HTTP para materializar
// MATERIAL. La ÚNICA vía canónica es la ORQUESTACIÓN del api-server tras un
// movimiento físico CONFIRMADO en Inventario (`orquestarDesdeMover`): TODA la
// procedencia (artículo, cantidad, unidad, familia, referencia OT) se DERIVA del
// snapshot del movimiento leído del servidor — NUNCA de un cuerpo HTTP. Un
// llamante HTTP no puede fabricar un CARGO/ABONO inventando movimientoId/familia.
// La RECUPERACIÓN administrativa es `POST /pendientes/reprocesar` (arriba), que
// relee el movimiento contra Inventario y reintenta idempotentemente (opId
// determinista `inv:<movimientoId>`). El comando de kernel
// `hecho.materializar-material` sigue existiendo SÓLO para la orquestación de
// servicio y, en defensa en profundidad, EXIGE el marcador interno de origen
// (`metadata.origenOrquestacion`) que sólo el principal de SERVICIO fija.
// Decisión documentada en DGP-021.2-auditoria-inventario.md §D5 y en OpenAPI (la
// operación `costos.hecho.materializar-material` NO se publica como ruta HTTP).

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
