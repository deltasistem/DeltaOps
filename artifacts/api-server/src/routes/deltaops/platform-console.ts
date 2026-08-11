/**
 * DeltaOps · Consola Técnica de la Plataforma (DGP-003).
 * Endpoints técnicos de solo lectura sobre la Shared Platform:
 * servicios, capacidades, dependencias, knowledge graph, salud,
 * colas (outbox / dead letter), auditoría y configuración.
 * Sin pantallas funcionales ni datos de negocio.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import type { PlatformRuntime } from "@workspace/platform";
import { deltaopsRuntime } from "./reference-runtime";
import { proveedorSolicitado } from "../../deltaops/identity/notification-provider";
import { resolverConfigM365 } from "../../deltaops/identity/m365-email";

const router: IRouter = Router();

/**
 * Control de acceso: la Consola Técnica expone metadatos operativos
 * (auditoría, colas, almacenamiento) y exige sesión autenticada de DeltaOps.
 */
router.use("/deltaops/platform", async (req, res, next): Promise<void> => {
  const userId = req.session?.deltaopsUserId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  // Mínimo privilegio: la consola expone metadatos globales (colas, auditoría,
  // almacenamiento), reservados a administradores de plataforma.
  const rows = await pool.query(`SELECT rol FROM deltaops.users WHERE id = $1`, [userId]);
  const rol = rows.rows[0]?.rol;
  if (rol !== "platform_admin" && rol !== "admin") {
    res.status(403).json({ error: "Requiere rol de administrador de plataforma" });
    return;
  }
  next();
});

/** Runtime compartido de DeltaOps (Kernel + Plataforma + Reference Module). */
function platform(): PlatformRuntime {
  return deltaopsRuntime().platform;
}

router.get("/deltaops/platform/services", (_req, res): void => {
  res.json(platform().registries.services.list());
});

router.get("/deltaops/platform/capabilities", (_req, res): void => {
  res.json(platform().registries.capabilities.list());
});

router.get("/deltaops/platform/dependencies", (_req, res): void => {
  res.json(platform().registries.dependencies.list());
});

router.get("/deltaops/platform/knowledge-graph", (_req, res): void => {
  res.json(platform().registries.knowledgeGraph.snapshot());
});

router.get("/deltaops/platform/services/health", async (_req, res): Promise<void> => {
  const statuses = await platform().registries.observability.checkAll();
  const healthy = statuses.every((s) => s.healthy);
  res.status(healthy ? 200 : 503).json({ healthy, services: statuses });
});

/** Colas: outbox pendiente/procesado y dead letter del Kernel. */
router.get("/deltaops/platform/queues", async (req, res): Promise<void> => {
  try {
    const [outbox, dead] = await Promise.all([
      pool.query(
        `SELECT CASE WHEN processed_at IS NULL THEN 'pending' ELSE 'processed' END AS status,
                count(*)::int AS n
         FROM deltaops.kernel_outbox GROUP BY 1`,
      ),
      pool.query(`SELECT count(*)::int AS n FROM deltaops.kernel_dead_letter`),
    ]);
    res.json({
      outbox: Object.fromEntries(outbox.rows.map((r) => [r.status, r.n])),
      deadLetter: dead.rows[0]?.n ?? 0,
    });
  } catch (err) {
    req.log.error({ err }, "Consola: fallo consultando colas");
    res.status(500).json({ error: "No se pudieron consultar las colas" });
  }
});

/** Trabajos: registros de jobs de plataforma (export/report) por estado. */
router.get("/deltaops/platform/jobs", async (req, res): Promise<void> => {
  try {
    const jobs = await pool.query(
      `SELECT service, record_type, status, count(*)::int AS n
       FROM deltaops.platform_records
       WHERE record_type IN ('job', 'session') AND deleted_at IS NULL
       GROUP BY service, record_type, status
       ORDER BY service`,
    );
    res.json(jobs.rows);
  } catch (err) {
    req.log.error({ err }, "Consola: fallo consultando trabajos");
    res.status(500).json({ error: "No se pudieron consultar los trabajos" });
  }
});

/** Logs técnicos: auditoría de plataforma más reciente. */
router.get("/deltaops/platform/logs", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await pool.query(
      `SELECT id, tenant_id, service, action, actor_id, subject_id, correlation_id, occurred_at
       FROM deltaops.platform_audit
       ORDER BY occurred_at DESC
       LIMIT $1`,
      [limit],
    );
    res.json(logs.rows);
  } catch (err) {
    req.log.error({ err }, "Consola: fallo consultando auditoría");
    res.status(500).json({ error: "No se pudo consultar la auditoría" });
  }
});

/** Registros persistidos por servicio (métrica técnica de almacenamiento). */
router.get("/deltaops/platform/storage", async (req, res): Promise<void> => {
  try {
    const rows = await pool.query(
      `SELECT service, count(*)::int AS registros,
              count(DISTINCT tenant_id)::int AS tenants
       FROM deltaops.platform_records
       WHERE deleted_at IS NULL
       GROUP BY service ORDER BY service`,
    );
    res.json(rows.rows);
  } catch (err) {
    req.log.error({ err }, "Consola: fallo consultando almacenamiento");
    res.status(500).json({ error: "No se pudo consultar el almacenamiento" });
  }
});

/** Configuración: defaults declarados por servicio. */
router.get("/deltaops/platform/config-defaults", (_req, res): void => {
  res.json(platform().tenantConfig.listDefaults());
});

/**
 * Estado del canal de notificaciones por correo. Reporta el proveedor
 * configurado y, para m365, un resumen de VALIDEZ de configuración por etapa
 * SIN exponer secretos (solo nombres de variables faltantes). No dispara envío.
 * Reservado a administradores de plataforma (guard de este router).
 */
router.get("/deltaops/platform/notifications/status", (_req, res): void => {
  const proveedor = proveedorSolicitado(process.env);
  if (proveedor !== "m365") {
    res.json({ proveedor, configurado: true, detalle: "Proveedor Fake (dev/test)" });
    return;
  }
  const cfg = resolverConfigM365(process.env);
  if (!cfg.ok) {
    res.json({
      proveedor,
      configurado: false,
      // Solo NOMBRES de variables, nunca valores.
      variablesFaltantes: cfg.issues.map((i) => i.campo),
    });
    return;
  }
  res.json({
    proveedor,
    configurado: true,
    smtpHost: cfg.config.smtpHost,
    smtpPort: cfg.config.smtpPort,
    smtpSecure: cfg.config.smtpSecure,
    // remitente NO es secreto, pero se omite para minimizar superficie de datos.
    scope: cfg.config.scope,
  });
});

export default router;
