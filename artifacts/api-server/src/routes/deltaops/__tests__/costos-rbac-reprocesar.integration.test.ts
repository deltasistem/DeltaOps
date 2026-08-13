/**
 * DGP-021.2 · RBAC del REPROCESO de pendientes (hallazgo E2E).
 *
 * BUG: `POST /api/deltaops/costos/pendientes/reprocesar` devolvía 200 a un
 * TECNICO. El reproceso ejecuta la materialización con el principal de SERVICIO
 * (no el del llamante), así que la `authorization` del comando NUNCA verificaba
 * al solicitante. §20 exige separación consulta/materialización/administración:
 * TECNICO es SÓLO LECTURA en costos ⇒ no puede disparar reproceso.
 *
 * FIX: guarda EXPLÍCITA en la frontera HTTP (`puedeMaterializar`) que exige el
 * MISMO permiso `modulo.costos.materializar` que los comandos
 * `hecho.materializar-material|otros` (sin permisos nuevos). Este test ejercita
 * el router REAL montado en Express, con la sesión propagando el `rolCanonico`
 * (única fuente del rol, como en producción) y usuarios reales en la BD.
 *
 * Cubre: TECNICO ⇒ 403; SUPERVISOR (rol materializador) ⇒ 200 con el resumen.
 * Requiere DATABASE_URL. Limpia sus filas de usuario al terminar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
import costosRouter from "../costos-module";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

const RUN = randomUUID().slice(0, 8);
const TENANT = `cos-rbac-${RUN}`;

// Usuarios reales (la fila alimenta el lookup del middleware de sesión del
// router). El `rolCanonico` lo fija la sesión (como en producción); el `rol`
// legacy de la fila es indiferente para la decisión.
let idTecnico = 0;
let idSupervisor = 0;

// Sesión INYECTADA por el test (equivalente a la sesión autenticada real): el
// router lee `req.session.deltaopsUserId` + `req.session.rolCanonico`.
let sesionActual: { deltaopsUserId: number; rolCanonico: string } | null = null;

let server: Server;
let baseUrl = "";

function construirApp(): Express {
  const app = express();
  app.use(express.json());
  // Inyecta la sesión del caso actual ANTES del router (sin store real).
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { session: unknown }).session = sesionActual ?? undefined;
    next();
  });
  app.use("/api", costosRouter);
  return app;
}

async function crearUsuario(etiqueta: string): Promise<number> {
  const email = `${etiqueta}-${RUN}@rbac.test`;
  const r = await pool.query(
    `INSERT INTO deltaops.users (email, nombre, rol, tenant, password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, `RBAC ${etiqueta}`, "operador", TENANT, "x"],
  );
  return Number(r.rows[0].id);
}

suite("DGP-021.2 · RBAC reprocesar pendientes (HTTP real)", () => {
  beforeAll(async () => {
    idTecnico = await crearUsuario("tecnico");
    idSupervisor = await crearUsuario("supervisor");
    await new Promise<void>((resolve) => {
      server = createServer(construirApp());
      server.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query(`DELETE FROM deltaops.users WHERE tenant = $1`, [TENANT]);
  });

  it("TECNICO (sólo lectura) ⇒ 403 al reprocesar", async () => {
    sesionActual = { deltaopsUserId: idTecnico, rolCanonico: "TECNICO" };
    const res = await fetch(`${baseUrl}/api/deltaops/costos/pendientes/reprocesar`, { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: unknown };
    expect(String(body.code)).toBe("KRN-AUTH-002");
  });

  it("SUPERVISOR (materializador) ⇒ 200 con resumen de reproceso", async () => {
    sesionActual = { deltaopsUserId: idSupervisor, rolCanonico: "SUPERVISOR" };
    const res = await fetch(`${baseUrl}/api/deltaops/costos/pendientes/reprocesar`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // El tenant no tiene pendientes ⇒ resumen vacío pero SIEMPRE presente.
    expect(body).toMatchObject({ total: expect.any(Number), materializados: expect.any(Number), pendientes: expect.any(Number) });
  });

  it("sin sesión ⇒ 401 (no autenticado)", async () => {
    sesionActual = null;
    const res = await fetch(`${baseUrl}/api/deltaops/costos/pendientes/reprocesar`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
