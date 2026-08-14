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
import { valorarSesionFailSafe } from "./manodeobra-runtime";
import { aRolCanonico } from "../../deltaops/identity/rbac";

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
    .select({ id: deltaopsUsersTable.id, rol: deltaopsUsersTable.rol, tenant: deltaopsUsersTable.tenant })
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  // Identidad CANÓNICA (idn_identities) desde la sesión Enterprise: es la que el
  // dominio usa para atribuir sesiones de trabajo y verificar asignaciones. El
  // `user.id` legacy sólo alimenta `principal.id` (permisos/recibos). Si no hay
  // identidad canónica en la sesión, los comandos de sesión fallan CERRADO.
  //
  // DGP-020.2 · Usamos el ROL CANÓNICO de la sesión (misma fuente/normalización
  // que Utilización). Es imprescindible: el rol de espejo `operador` colapsa
  // SUPERVISOR/PLANIFICADOR/TECNICO, y sólo el canónico preserva la distinción
  // que decide la excepción §6 al abrir sesión sin asignación (supervisor/admin sí;
  // planificador/técnico no). El fallback a `aRolCanonico(user.rol)` mantiene el
  // comportamiento cuando la sesión no trae `rolCanonico`.
  const rolCanonico = req.session?.rolCanonico ?? aRolCanonico(user.rol);
  res.locals.ctx = contextForOrdenes(String(user.id), rolCanonico, user.tenant, req.session?.identityId);
  res.locals.tenant = user.tenant;
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

/** Fila de documentación tal como la expone la consulta `documentacion`. */
export interface FilaDocumentacion {
  referenciaClave?: string | null;
  datos?: Record<string, unknown> | null;
}

/**
 * Autorización IDOR: ¿el `attachmentId` está REALMENTE referenciado en la
 * documentación de la OT? El attachmentId se guarda en `referenciaClave` (y, por
 * robustez, también se acepta anidado en `datos.attachmentId`). Se usa para
 * evitar que la firma de URL se emita por attachmentId suelto (cualquier adjunto
 * del tenant) en lugar de por adjunto perteneciente a ESA OT.
 */
export function attachmentPerteneceAOrden(filas: readonly FilaDocumentacion[], attachmentId: string): boolean {
  if (!attachmentId) return false;
  return filas.some(
    (f) =>
      f.referenciaClave === attachmentId ||
      (f.datos != null && String((f.datos as Record<string, unknown>)["attachmentId"] ?? "") === attachmentId),
  );
}

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

// DGP-020.1 · Identidades canónicas elegibles del tenant (selector de asignación).
// Ruta específica antes de /:id. Tenant-scoped por el contexto autenticado.
router.get(`${BASE}/identidades-elegibles`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.identidades-elegibles`, { q: strQuery(req.query.q) }));
});

router.get(`${BASE}/catalogos/:catalogo`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.catalogo.opciones`, { catalogo: req.params.catalogo }));
});

// DGP-020.2 · Sesiones de trabajo — read models (rutas específicas antes de /:id).
router.get(`${BASE}/sesiones/duraciones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.sesion.duraciones`, {
    sesionId: strQuery(req.query.sesionId), ordenId: strQuery(req.query.ordenId), activoId: strQuery(req.query.activoId),
  }));
});
router.get(`${BASE}/sesiones/:sesionId/tramos`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.sesion.tramos`, { sesionId: req.params.sesionId }));
});
router.get(`${BASE}/sesiones`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.sesiones`, {
    ordenId: strQuery(req.query.ordenId), identityId: strQuery(req.query.identityId), activoId: strQuery(req.query.activoId),
  }));
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
router.get(`${BASE}/:id/sesion/activa`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.sesion.activa`, {
    ordenId: req.params.id, identityId: strQuery(req.query.identityId),
  }));
});

/**
 * Definición de una plantilla de Dynamic Forms (clave + versión EXACTA) para
 * RENDERIZAR el formulario/checklist asociado a la OT durante la ejecución.
 * Proxy fino a `modulo.formularios.plantilla.obtener`; devuelve la definición y
 * metadatos (no expone el almacén completo). Sólo lectura.
 */
router.get(`${BASE}/plantillas/:clave/:version`, async (req, res) => {
  const version = Number(req.params.version);
  if (!Number.isInteger(version) || version < 1) {
    res.status(400).json({ error: "Versión de plantilla inválida.", code: "KRN-VAL" });
    return;
  }
  const r = await query(ctxOf(res), "modulo.formularios.plantilla.obtener", { clave: req.params.clave, version });
  if (!r.ok) { send(res, r); return; }
  const rec = r.value as { data?: Record<string, unknown> } | null;
  const data = rec?.data ?? {};
  const contenido = data["contenido"] as { definicion?: unknown } | undefined;
  res.json({
    clave: req.params.clave,
    version,
    titulo: (data["titulo"] as string) ?? req.params.clave,
    definicion: contenido?.definicion ?? null,
  });
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
/**
 * Captura de la RESPUESTA de un formulario/checklist asociado (flujo REAL de
 * Dynamic Forms, anclado a clave+versión). Es una ÚNICA operación del módulo:
 * el comando orquestador `${MODULO}.capturarRespuesta` compone en el servidor
 * `respuesta.guardarBorrador` → `respuesta.enviar` → asociación a la OT
 * (re-leyendo su versión ACTUAL), es idempotente por `opId` y RECUPERABLE (un
 * reintento tras conflicto converge sin dejar respuestas huérfanas ni
 * duplicarlas). Al ser un comando único, la MISMA operación se replaya vía
 * `/sync` desde la cola offline (Offline First).
 */
router.post(`${BASE}/:id/:clase/respuesta`, async (req, res) => {
  const ctx = ctxOf(res);
  const ordenId = req.params.id;
  const clase = req.params.clase as "formulario" | "checklist";
  if (clase !== "formulario" && clase !== "checklist") {
    res.status(404).json({ error: "Clase de plantilla no soportada.", code: "KRN-NOTFOUND" });
    return;
  }
  const b = req.body as { clave?: string; version?: number; datos?: Record<string, unknown>; opId?: string };
  if (!b.clave || typeof b.version !== "number" || b.datos == null || !b.opId) {
    res.status(400).json({ error: "Faltan datos de la respuesta (clave, version, datos, opId).", code: "KRN-VAL" });
    return;
  }
  const r = await exec(ctx, `${MODULO}.capturarRespuesta`, {
    id: ordenId,
    opId: b.opId,
    clase,
    plantilla: { clave: b.clave, version: b.version },
    datos: b.datos,
  });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/evidencias`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.agregarEvidencia`, { ...req.body, id: req.params.id });
  await drain();
  send(res, r);
});

/**
 * DGP-020.2 · Sesiones de trabajo. El `identityId` proviene SIEMPRE del contexto
 * autenticado (jamás del cuerpo) y el `activoId` se deriva de la OT en el
 * dominio; el cuerpo sólo aporta `ocurridoAt` (device-time), `origen` y `opId`.
 * Idempotentes por `opId` y despachables por `/sync` (Offline First).
 */
for (const accion of ["abrir", "pausar", "reanudar", "cerrar"] as const) {
  router.post(`${BASE}/:id/sesion/${accion}`, async (req, res) => {
    const b = (req.body ?? {}) as { sesionId?: string; ocurridoAt?: string; origen?: string; opId?: string };
    const r = await exec(ctxOf(res), `${MODULO}.sesion.${accion}`, {
      ordenId: req.params.id,
      ...(b.sesionId ? { sesionId: b.sesionId } : {}),
      ...(b.ocurridoAt ? { ocurridoAt: b.ocurridoAt } : {}),
      ...(b.origen ? { origen: b.origen } : {}),
      ...(b.opId ? { opId: b.opId } : {}),
    });
    await drain();
    // DGP-020.3 · Integración por ORQUESTACIÓN (Opción B, ver decisiones.md §2):
    // al CERRAR una sesión, dispara la valoración de mano de obra FAIL-SAFE (nunca
    // rompe el cierre; idempotente por (tenant, sesión); recuperable si falla).
    if (accion === "cerrar" && r.ok) {
      const v = r.value as { sesionId?: string; ordenId?: string };
      const tenant = res.locals.tenant as string | undefined;
      if (tenant && v?.sesionId) await valorarSesionFailSafe(tenant, v.sesionId, v.ordenId);
    }
    send(res, r);
  });
}

/**
 * Registro de evidencia REFERENCIA-ONLY (patrón Attachment Service, igual que
 * Activos DGP-008.3): (1) registra el adjunto en `platform.attachment.register`
 * — sólo metadatos + hash, el binario NUNCA sale de plataforma — obteniendo el
 * `attachmentId`; (2) agrega la evidencia a la OT vía `agregarEvidencia`
 * anclada a `expectedVersion`. La categoría documental viaja como prefijo del
 * nombre lógico (metadato), sin tocar el binario.
 */
router.post(`${BASE}/:id/documentacion`, async (req, res) => {
  const ctx = ctxOf(res);
  const id = req.params.id;
  const b = req.body as {
    categoria?: string; nombreArchivo?: string; mimeType?: string;
    tamanoBytes?: number; hashSha256?: string; expectedVersion?: number; opId?: string;
  };
  if (!b.nombreArchivo || !b.mimeType || !b.hashSha256 || typeof b.tamanoBytes !== "number" || typeof b.expectedVersion !== "number") {
    res.status(400).json({ error: "Faltan metadatos de la evidencia (nombreArchivo, mimeType, tamanoBytes, hashSha256, expectedVersion).", code: "KRN-VAL" });
    return;
  }
  const nombreLogico = b.categoria ? `[${b.categoria}] ${b.nombreArchivo}` : b.nombreArchivo;
  const reg = await exec(ctx, "platform.attachment.register", {
    entityRef: `orden:${id}`,
    nombreArchivo: nombreLogico,
    mimeType: b.mimeType,
    tamanoBytes: b.tamanoBytes,
    hashSha256: b.hashSha256,
  });
  if (!reg.ok) { send(res, reg); return; }
  const attachmentId = (reg.value as { id: string }).id;
  const r = await exec(ctx, `${MODULO}.agregarEvidencia`, {
    id,
    expectedVersion: b.expectedVersion,
    opId: b.opId,
    evidencia: {
      attachmentId,
      nombreArchivo: nombreLogico,
      mimeType: b.mimeType,
      tamanoBytes: b.tamanoBytes,
      hashSha256: b.hashSha256,
      ...(b.categoria ? { descripcion: b.categoria } : {}),
    },
  });
  await drain();
  send(res, r);
});

/**
 * URL firmada + metadatos verificables de una evidencia (verificación de la
 * referencia). El binario NUNCA se expone por esta vía. Igual que Activos.
 */
router.get(`${BASE}/:id/documentacion/:attachmentId/url`, async (req, res) => {
  const ctx = ctxOf(res);
  const id = req.params.id;
  const attachmentId = req.params.attachmentId;

  // Autorización IDOR: la firma se emite SÓLO si el adjunto está realmente
  // referenciado en la documentación de ESTA OT. Consultar `documentacion`
  // aplica la autorización de lectura de la OT y el aislamiento por tenant; si
  // el adjunto no pertenece a la OT devolvemos 404 (no se filtra su existencia).
  const docs = await query(ctx, `${MODULO}.documentacion`, { ordenId: id });
  if (!docs.ok) { send(res, docs); return; }
  const filas = (docs.value as { documentacion?: FilaDocumentacion[] }).documentacion ?? [];
  if (!attachmentPerteneceAOrden(filas, attachmentId)) {
    res.status(404).json({ error: `El adjunto ${attachmentId} no está referenciado en la orden ${id}.`, code: "KRN-NOTFOUND" });
    return;
  }

  const signed = await query(ctx, "platform.attachment.signedUrl", { id: attachmentId });
  if (!signed.ok) { send(res, signed); return; }
  const meta = await query(ctx, "platform.attachment.get", { id: attachmentId });
  const m = meta.ok ? (meta.value as { data?: Record<string, unknown> } | null) : null;
  const datos = m?.data ?? {};
  const s = signed.value as { url: string; expiresAt: number };
  res.json({
    attachmentId,
    url: s.url,
    expiresAt: s.expiresAt,
    nombreArchivo: (datos["nombreArchivo"] as string) ?? null,
    mimeType: (datos["mimeType"] as string) ?? null,
    tamanoBytes: (datos["tamanoBytes"] as number) ?? null,
    hashSha256: (datos["hashSha256"] as string) ?? null,
  });
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
  // DGP-020.3 · Tras sincronizar la cola offline, dispara la valoración FAIL-SAFE
  // de mano de obra para CADA operación de cierre de sesión (aplicada o
  // idempotente). Idempotente por (tenant, sesión); jamás rompe la sincronización.
  const tenant = res.locals.tenant as string | undefined;
  if (tenant) {
    for (const rs of resumen.resultados) {
      const suf = rs.comando.startsWith(`${MODULO}.`) ? rs.comando.slice(MODULO.length + 1) : rs.comando;
      if (suf !== "sesion.cerrar") continue;
      const payload = (rs.resultado ?? rs.actual) as { sesionId?: string; ordenId?: string; estado?: string } | undefined;
      if (payload?.sesionId && payload.estado === "CERRADA") {
        await valorarSesionFailSafe(tenant, payload.sesionId, payload.ordenId);
      }
    }
  }
  res.json(resumen);
});

export default router;
