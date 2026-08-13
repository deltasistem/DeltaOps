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
import { requireIdentity, requireSuperAdmin } from "../../deltaops/identity/middleware";

const router: IRouter = Router();

/**
 * Control de acceso (DGP-022.1 · cierre de PLATFORM-CONSOLE-ACL).
 *
 * La Consola Técnica expone metadatos GLOBALES de la plataforma (auditoría,
 * colas, almacenamiento, storage) potencialmente cross-tenant. Su autorización
 * debe depender EXCLUSIVAMENTE del rol REAL de plataforma (canónico
 * `SUPER_ADMIN`, al que se eleva el legacy `platform_admin`).
 *
 * Se compone el contrato canónico ya existente, FAIL-CLOSED:
 *   1) `requireIdentity`     → exige sesión Enterprise coherente (identidad
 *      ACTIVA + membresía ACTIVA + tenant OPERATIVO + epoch vigente). Sin sesión
 *      válida ⇒ 401 canónico (`AUTH_REQUIRED`).
 *   2) `requireSuperAdmin`   → exige `esSuperAdmin(ctx.rolCanonico)`. Cualquier
 *      otro rol (TENANT_ADMIN, SUPERVISOR, PLANIFICADOR, TECNICO, CONSULTA) ⇒ 403.
 *
 * NUNCA se autoriza por el rol legacy `admin`, por membresía de tenant, por
 * nombre de tenant, por permisos de módulo ni por ausencia de tenant. El rol
 * canónico proviene de la membresía sellada en la sesión (jamás del cliente).
 */
router.use("/deltaops/platform", requireIdentity, requireSuperAdmin);

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

export default router;
