import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";
import type { DeltaopsEnv } from "./config";

declare module "express-session" {
  interface SessionData {
    deltaopsUserId?: number;
  }
}

/**
 * DeltaOps · DGP-001 — Gestión de sesiones.
 * Sesiones persistidas en PostgreSQL (deltaops.sessions) vía connect-pg-simple.
 * Cookie firmada con SESSION_SECRET; HttpOnly siempre; Secure en producción.
 */
export function createDeltaopsSession(config: DeltaopsEnv): RequestHandler {
  const PgStore = connectPgSimple(session);
  return session({
    name: "deltaops.sid",
    store: new PgStore({
      pool,
      schemaName: "deltaops",
      tableName: "sessions",
      createTableIfMissing: false,
    }),
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  });
}
