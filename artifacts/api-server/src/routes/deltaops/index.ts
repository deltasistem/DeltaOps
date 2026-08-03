import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, pool, deltaopsUsersTable } from "@workspace/db";
import {
  DeltaopsHealthResponse,
  DeltaopsReadyResponse,
  DeltaopsInfoResponse,
  DeltaopsMetricsResponse,
  DeltaopsLoginBody,
  DeltaopsLoginResponse,
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

router.post("/deltaops/auth/login", async (req, res): Promise<void> => {
  const parsed = DeltaopsLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  const [user] = await db
    .select()
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.email, parsed.data.email.toLowerCase()));

  const valid =
    user != null &&
    (await bcrypt.compare(parsed.data.password, user.passwordHash));

  if (!valid || user == null) {
    req.log.warn({ email: parsed.data.email }, "Login fallido");
    res.status(401).json({ error: "Credenciales inválidas" });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.deltaopsUserId = user.id;

  req.log.info({ userId: user.id }, "Sesión iniciada");
  res.json(
    DeltaopsLoginResponse.parse({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    }),
  );
});

router.post("/deltaops/auth/logout", async (req, res): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
  res.clearCookie("deltaops.sid");
  res.sendStatus(204);
});

router.get("/deltaops/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.deltaopsUserId;
  if (!userId) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const [user] = await db
    .select()
    .from(deltaopsUsersTable)
    .where(eq(deltaopsUsersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "No autenticado" });
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
