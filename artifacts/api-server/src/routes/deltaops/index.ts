import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pool, deltaopsUsersTable } from "@workspace/db";
import {
  DeltaopsHealthResponse,
  DeltaopsReadyResponse,
  DeltaopsInfoResponse,
  DeltaopsMetricsResponse,
  DeltaopsMeResponse,
} from "@workspace/api-zod";
import { DELTAOPS_PLATFORM } from "../../deltaops/config";
import { getDeltaopsMetrics } from "../../deltaops/metrics";

const router: IRouter = Router();

/* ------------------------------ Plataforma ------------------------------ */

router.get("/deltaops/platform/health", (_req, res): void => {
  res.json(
    DeltaopsHealthResponse.parse({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
});

router.get("/deltaops/platform/ready", async (req, res): Promise<void> => {
  const checks: {
    name: string;
    status: string;
    latencyMs: number | null;
    detail: string | null;
  }[] = [];

  const t0 = Date.now();
  try {
    await pool.query("SELECT 1");
    checks.push({
      name: "database",
      status: "ok",
      latencyMs: Date.now() - t0,
      detail: null,
    });
  } catch (err) {
    req.log.error({ err }, "Readiness: base de datos no disponible");
    checks.push({
      name: "database",
      status: "error",
      latencyMs: Date.now() - t0,
      detail: "No se pudo conectar a PostgreSQL",
    });
  }

  checks.push({
    name: "session_secret",
    status: process.env.SESSION_SECRET ? "ok" : "error",
    latencyMs: null,
    detail: process.env.SESSION_SECRET ? null : "SESSION_SECRET ausente",
  });

  const ready = checks.every((c) => c.status === "ok");
  res
    .status(ready ? 200 : 503)
    .json(
      DeltaopsReadyResponse.parse({
        status: ready ? "ready" : "not_ready",
        checks,
      }),
    );
});

router.get("/deltaops/platform/info", (_req, res): void => {
  res.json(
    DeltaopsInfoResponse.parse({
      name: DELTAOPS_PLATFORM.name,
      version: DELTAOPS_PLATFORM.version,
      environment: process.env.NODE_ENV ?? "development",
      uptimeSeconds: Math.round(process.uptime() * 100) / 100,
      nodeVersion: process.version,
    }),
  );
});

router.get("/deltaops/platform/metrics", (_req, res): void => {
  res.json(DeltaopsMetricsResponse.parse(getDeltaopsMetrics()));
});

/* ----------------------------- Autenticación ---------------------------- */

/**
 * DGP-017: las rutas de autenticación (`/deltaops/auth/login|logout|session|
 * switch-tenant|password/*|invitations`) las atiende AHORA de forma ÚNICA el
 * router de identidad (`routes/deltaops/identity.ts`), montado antes que este
 * router en `app.ts`. Se elimina aquí el login/logout legacy para que NO
 * sombreen la superficie Enterprise (antes devolvían la forma legacy y creaban
 * una sesión que el runtime de identidad no reconocía).
 *
 * `GET /deltaops/auth/me` se conserva por compatibilidad con clientes generados
 * (orval) y delega en la MISMA sesión: devuelve el `SessionResponse` completo si
 * hay contexto de identidad Enterprise; de lo contrario, la forma legacy.
 */
router.get("/deltaops/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.deltaopsUserId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado", code: "AUTH_REQUIRED" });
    return;
  }

  const [user] = await db
    .select()
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "No autenticado", code: "AUTH_REQUIRED" });
    return;
  }

  res.json(
    DeltaopsMeResponse.parse({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    }),
  );
});

export default router;
