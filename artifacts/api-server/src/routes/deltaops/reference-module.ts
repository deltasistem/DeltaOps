/**
 * DGP-004 · API HTTP del Reference Module ("Elemento de Referencia").
 * Cada endpoint es una capa fina: HTTP → Command/Query del Kernel.
 * Sesión obligatoria; el principal se deriva del usuario y su rol.
 */
import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, deltaopsUsersTable } from "@workspace/db";
import type { ExecutionContext, KernelError, Result } from "@workspace/kernel";
import { MODULO } from "@workspace/module-reference";
import { pool } from "@workspace/db";
import { contextFor, DELTAOPS_TENANT, deltaopsRuntime } from "./reference-runtime";

const router: IRouter = Router();
const BASE = "/deltaops/referencia";

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
  res.locals.ctx = contextFor(String(user.id), user.rol);
  next();
});

/* ---------------------------- Utilidades ---------------------------------- */

function ctxOf(res: { locals: Record<string, unknown> }): ExecutionContext {
  return res.locals.ctx as ExecutionContext;
}

function statusOf(err: KernelError): number {
  if (err.code === "KRN-AUTH-002" || err.code.startsWith("KRN-AUTH")) return 403;
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
  deltaopsRuntime().platform.kernel.commands.execute(ctx, name, input);
const query = (ctx: ExecutionContext, name: string, input: unknown) =>
  deltaopsRuntime().platform.kernel.queries.execute(ctx, name, input);

/** Procesa el outbox tras cada comando para proyección inmediata. */
async function drain(): Promise<void> {
  await deltaopsRuntime().platform.kernel.outboxProcessor.processPending();
}

/* ------------------------------ Consultas --------------------------------- */

router.get(BASE, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.listar`, {
    estado: typeof req.query.estado === "string" ? req.query.estado : undefined,
  }));
});

router.get(`${BASE}/dashboard`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.dashboard`, {}));
});

router.get(`${BASE}/consola`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, {}));
});

router.get(`${BASE}/config`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.consola`, {}));
});

router.get(`${BASE}/:id`, async (req, res) => {
  send(res, await query(ctxOf(res), `${MODULO}.detalle`, { id: req.params.id }));
});

router.get(`${BASE}/:id/timeline`, async (req, res) => {
  send(res, await query(ctxOf(res), "platform.timeline.byEntity", {
    entityRef: `ref:${req.params.id}`,
  }));
});

router.get(`${BASE}/:id/comentarios`, async (req, res) => {
  send(res, await query(ctxOf(res), "platform.comment.byEntity", {
    entityRef: `ref:${req.params.id}`,
  }));
});

router.get(`${BASE}/:id/adjuntos`, async (req, res) => {
  send(res, await query(ctxOf(res), "platform.attachment.byEntity", {
    entityRef: `ref:${req.params.id}`,
  }));
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

router.post(`${BASE}/:id/activar`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.activar`, { id: req.params.id, ...req.body });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/archivar`, async (req, res) => {
  const r = await exec(ctxOf(res), `${MODULO}.archivar`, { id: req.params.id, ...req.body });
  await drain();
  send(res, r);
});

router.post(`${BASE}/:id/comentarios`, async (req, res) => {
  const r = await exec(ctxOf(res), "platform.comment.create", {
    entityRef: `ref:${req.params.id}`,
    texto: String(req.body?.texto ?? ""),
  });
  await drain();
  send(res, r);
});

router.post(`${BASE}/reproyectar`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.reproyectar`, {}));
});

router.post(`${BASE}/sugerir-descripcion`, async (req, res) => {
  send(res, await exec(ctxOf(res), `${MODULO}.sugerirDescripcion`, {
    nombre: String(req.body?.nombre ?? ""),
  }));
});

router.put(`${BASE}/config/:clave`, async (req, res) => {
  const clave = req.params.clave;
  const permitidas = ["max-longitud-nombre", "archivado-directo", "webhook-activacion", "kpi-definicion-activos"];
  if (!permitidas.includes(clave)) {
    res.status(400).json({ error: `Clave de configuración desconocida: ${clave}` });
    return;
  }
  send(res, await exec(ctxOf(res), "platform.config.set", {
    key: `${MODULO}.${clave}`,
    value: String(req.body?.value ?? ""),
  }));
});

/* --------------------------- Sincronización offline ----------------------- */

const SyncOp = z.object({
  opId: z.string(),
  comando: z.enum(["crear", "editar", "activar", "archivar"]),
  input: z.record(z.string(), z.unknown()),
});

/** Recibos durables de sincronización: opId aplicado ⇒ devuelve el recibo. */
async function findReceipt(opId: string): Promise<Record<string, unknown> | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [DELTAOPS_TENANT]);
    const r = await client.query(
      `SELECT resultado FROM deltaops.ref_sync_receipts WHERE tenant_id=$1 AND op_id=$2`,
      [DELTAOPS_TENANT, opId],
    );
    await client.query("COMMIT");
    return r.rows[0]?.resultado ?? null;
  } finally {
    client.release();
  }
}

async function saveReceipt(opId: string, comando: string, resultado: unknown): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [DELTAOPS_TENANT]);
    await client.query(
      `INSERT INTO deltaops.ref_sync_receipts (tenant_id, op_id, comando, resultado)
       VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, op_id) DO NOTHING`,
      [DELTAOPS_TENANT, opId, comando, JSON.stringify(resultado)],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
}

/**
 * Sincroniza una cola de operaciones capturadas offline. Cada operación se
 * ejecuta en orden. Idempotencia doble: ids de cliente en `crear` y recibos
 * durables por opId — reintentar una operación ya aplicada (respuesta
 * perdida) devuelve su recibo en lugar de re-ejecutar y producir un falso
 * conflicto de versión. Solo las operaciones EXITOSAS generan recibo.
 */
router.post(`${BASE}/sync`, async (req, res): Promise<void> => {
  const parsed = z.array(SyncOp).max(100).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Cola de sincronización inválida" });
    return;
  }
  const resultados = [];
  for (const op of parsed.data) {
    const recibo = await findReceipt(op.opId);
    if (recibo) {
      resultados.push({ opId: op.opId, ok: true, resultado: recibo, recibo: true });
      continue;
    }
    const r = await exec(ctxOf(res), `${MODULO}.${op.comando}`, op.input);
    if (r.ok) {
      await saveReceipt(op.opId, op.comando, r.value);
      resultados.push({ opId: op.opId, ok: true, resultado: r.value });
    } else {
      resultados.push({ opId: op.opId, ok: false, code: r.error.code, error: r.error.message });
    }
  }
  await drain();
  res.json({ resultados });
});

export default router;
