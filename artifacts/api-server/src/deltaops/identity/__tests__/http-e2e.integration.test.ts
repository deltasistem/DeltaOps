/**
 * DGP-017 · Pruebas E2E vía la APP COMPLETA (app.ts real) sobre HTTP.
 *
 * Arranca el servidor Express real en un puerto efímero y ejerce el flujo por
 * HTTP con cookies, tal como lo haría el navegador. Verifica la integración
 * REAL de middlewares y routers (no routers aislados):
 *   - `/auth/login` devuelve `SessionResponse` COMPLETA (no la forma legacy).
 *   - `/auth/session` es coherente con la MISMA cookie.
 *   - Una ruta de módulo existente queda autorizada con esa sesión (compat).
 *   - `admin@deltaops.dev` (SUPER_ADMIN) también obtiene `SessionResponse`.
 *   - `/auth/password/forgot` es neutro (202) y `/auth/logout` invalida sesión.
 *
 * Requiere DATABASE_URL + SESSION_SECRET. Siembra idempotente las identidades
 * DEMO/principal si faltan (no depende del orden de otros tests).
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../../app";
import { hashPassword } from "../crypto";
import {
  crearTenant,
  crearIdentidad,
  crearMembresia,
  obtenerIdentidadPorEmail,
} from "../service";
import { seedRolesDeTenant } from "../seed-roles";

const MODULOS = [
  "referencia", "activos", "ordenes", "inventario", "planes",
  "abastecimiento", "preventivo", "correctivo", "analytics",
];

let server: Server;
let base = "";

/** Cliente HTTP mínimo con manejo de cookie de sesión (una sesión por cliente). */
function crearCliente() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async req(method: string, path: string, body?: unknown) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (cookie) headers.cookie = cookie;
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      return { status: res.status, json: json as any };
    },
  };
}

beforeAll(async () => {
  // Siembra idempotente de las identidades usadas por el E2E (no depende de
  // que otros seeds hayan corrido).
  await crearTenant({
    tenantId: "delta-demo", codigo: "DELTA-DEMO", nombreComercial: "DELTA DEMO",
    zonaHoraria: "America/Santiago", idioma: "es", moneda: "CLP",
    modulos: MODULOS, branding: { nombre: "DELTA DEMO", nombreApp: "DeltaOps" },
  });
  await seedRolesDeTenant("delta-demo");
  await crearTenant({
    tenantId: "deltaops", codigo: "DELTAOPS", nombreComercial: "DeltaOps",
    zonaHoraria: "America/Santiago", idioma: "es", moneda: "CLP",
    modulos: MODULOS, branding: { nombre: "DeltaOps", nombreApp: "DeltaOps" },
  });
  await seedRolesDeTenant("deltaops");

  const demo = await obtenerIdentidadPorEmail("admin@delta.demo");
  if (!demo) {
    const id = await crearIdentidad({
      email: "admin@delta.demo", nombre: "Carlos Pacheco",
      passwordHash: await hashPassword("DeltaOps2026!"), estado: "ACTIVO",
    });
    await crearMembresia({ identityId: id.identityId, tenantId: "delta-demo", rol: "TENANT_ADMIN" });
  } else {
    await crearMembresia({ identityId: demo.identityId, tenantId: "delta-demo", rol: "TENANT_ADMIN" });
  }

  const plat = await obtenerIdentidadPorEmail("admin@deltaops.dev");
  if (!plat) {
    const id = await crearIdentidad({
      email: "admin@deltaops.dev", nombre: "Administrador de Plataforma",
      passwordHash: await hashPassword("deltaops-dev-2026"), estado: "ACTIVO",
    });
    await crearMembresia({ identityId: id.identityId, tenantId: "deltaops", rol: "SUPER_ADMIN" });
  } else {
    await crearMembresia({ identityId: plat.identityId, tenantId: "deltaops", rol: "SUPER_ADMIN" });
  }

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("E2E · login DEMO devuelve SessionResponse completa (no legacy)", () => {
  it("POST /auth/login → SessionResponse con tenant, rol, modulos y membresias", async () => {
    const c = crearCliente();
    const r = await c.req("POST", "/deltaops/auth/login", {
      email: "admin@delta.demo",
      password: "DeltaOps2026!",
      tenantId: "delta-demo",
    });
    expect(r.status).toBe(200);
    // Forma NUEVA (no la legacy {id,email,nombre,rol}).
    expect(r.json.identityId).toBeTruthy();
    expect(r.json.tenant).toBeTruthy();
    expect(r.json.tenant.codigo).toBe("DELTA-DEMO");
    expect(r.json.tenant.id).toBe("delta-demo");
    expect(r.json.rol).toBe("TENANT_ADMIN");
    expect(Array.isArray(r.json.modulos)).toBe(true);
    expect(r.json.modulos.length).toBeGreaterThan(0);
    expect(Array.isArray(r.json.membresias)).toBe(true);
    // No debe existir la forma legacy.
    expect(r.json.id).toBeUndefined();
  });

  it("GET /auth/session con la MISMA cookie es coherente (no 401)", async () => {
    const c = crearCliente();
    await c.req("POST", "/deltaops/auth/login", {
      email: "admin@delta.demo", password: "DeltaOps2026!", tenantId: "delta-demo",
    });
    const s = await c.req("GET", "/deltaops/auth/session");
    expect(s.status).toBe(200);
    expect(s.json.email).toBe("admin@delta.demo");
    expect(s.json.tenant.id).toBe("delta-demo");
    expect(s.json.rol).toBe("TENANT_ADMIN");
  });

  it("una ruta de módulo existente queda AUTORIZADA con esa sesión (compat)", async () => {
    const c = crearCliente();
    await c.req("POST", "/deltaops/auth/login", {
      email: "admin@delta.demo", password: "DeltaOps2026!", tenantId: "delta-demo",
    });
    // Módulo contratado (correctivo): no debe ser 401/403; el espejo legacy da rol.
    const m = await c.req("GET", "/deltaops/correctivo/solicitudes");
    expect(m.status).not.toBe(401);
    expect(m.status).not.toBe(403);
    expect(m.status).toBeLessThan(500);
  });

  it("GET /auth/session SIN cookie responde 401 AUTH_REQUIRED", async () => {
    const c = crearCliente();
    const s = await c.req("GET", "/deltaops/auth/session");
    expect(s.status).toBe(401);
    expect(s.json.code).toBe("AUTH_REQUIRED");
  });
});

describe("E2E · login del administrador de plataforma", () => {
  it("admin@deltaops.dev → SessionResponse con rol SUPER_ADMIN", async () => {
    const c = crearCliente();
    const r = await c.req("POST", "/deltaops/auth/login", {
      email: "admin@deltaops.dev", password: "deltaops-dev-2026", tenantId: "deltaops",
    });
    expect(r.status).toBe(200);
    expect(r.json.rol).toBe("SUPER_ADMIN");
    expect(r.json.tenant.id).toBe("deltaops");
    // SUPER_ADMIN puede listar tenants (superficie admin).
    const admin = await c.req("GET", "/deltaops/admin/tenants");
    expect(admin.status).toBe(200);
    expect(Array.isArray(admin.json)).toBe(true);
  });
});

describe("E2E · recuperación neutra y logout", () => {
  it("POST /auth/password/forgot responde 202 neutro (exista o no el correo)", async () => {
    const c = crearCliente();
    const existe = await c.req("POST", "/deltaops/auth/password/forgot", { email: "admin@delta.demo", tenantId: "delta-demo" });
    const noExiste = await c.req("POST", "/deltaops/auth/password/forgot", { email: "nadie-xyz@ninguna.test" });
    expect(existe.status).toBe(202);
    expect(noExiste.status).toBe(202);
    // Cuerpo idéntico (sin revelar existencia).
    expect(JSON.stringify(existe.json)).toBe(JSON.stringify(noExiste.json));
  });

  it("POST /auth/logout invalida la sesión (session posterior 401)", async () => {
    const c = crearCliente();
    await c.req("POST", "/deltaops/auth/login", {
      email: "admin@delta.demo", password: "DeltaOps2026!", tenantId: "delta-demo",
    });
    const out = await c.req("POST", "/deltaops/auth/logout");
    expect(out.status).toBe(204);
    const s = await c.req("GET", "/deltaops/auth/session");
    expect(s.status).toBe(401);
  });

  it("credenciales inválidas → 401", async () => {
    const c = crearCliente();
    const r = await c.req("POST", "/deltaops/auth/login", {
      email: "admin@delta.demo", password: "incorrecta", tenantId: "delta-demo",
    });
    expect(r.status).toBe(401);
  });
});
