/**
 * DGP-017 · Pruebas E2E vía la APP COMPLETA (app.ts real) sobre HTTP.
 *
 * Arranca el servidor Express real en un puerto efímero y ejerce el flujo por
 * HTTP con cookies, tal como lo haría el navegador. Verifica la integración
 * REAL de middlewares y routers (no routers aislados):
 *   - `/auth/login` devuelve `SessionResponse` COMPLETA (no la forma legacy).
 *   - `/auth/session` es coherente con la MISMA cookie.
 *   - Una ruta de módulo existente queda autorizada con esa sesión (compat).
 *   - Un módulo NO contratado por el tenant se rechaza con 403 (entitlements).
 *   - Sesión sin identidad Enterprise ⇒ 401/403 en superficie de módulo.
 *   - `admin@deltaops.dev` (SUPER_ADMIN) también obtiene `SessionResponse`.
 *   - `/auth/password/forgot` es neutro (202) y `/auth/logout` invalida sesión.
 *   - AISLAMIENTO CRÍTICO A/B: dos sesiones simultáneas de la MISMA identidad en
 *     tenants distintos NO se contaminan (A nunca adopta tenant/rol de B), ni
 *     tras un switch-tenant en B.
 *
 * NO hay literales de contraseña: se usa `credencialDemo(...)` (única fuente).
 * Requiere DATABASE_URL + SESSION_SECRET. Siembra idempotente y FUERZA las
 * contraseñas de las identidades usadas (determinista en aislamiento).
 */
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import app from "../../../app";
import { proveedorSolicitado } from "../notification-provider";
import { hashPassword } from "../crypto";
import {
  crearTenant,
  crearIdentidad,
  crearMembresia,
  actualizarPassword,
  actualizarModulos,
  obtenerIdentidadPorEmail,
} from "../service";
import { seedRolesDeTenant } from "../seed-roles";
import { MODULOS_TODOS } from "../entitlements";
import { credencialDemo, CLAVES_ENV } from "../../../seed/seed-credentials";

// SIEMPRE el catálogo canónico completo: este suite corre contra la BD dev y
// `actualizarModulos("delta-demo", ...)` es destructivo — una lista hardcodeada
// desactualizada despoja entitlements de módulos nuevos (pasó con `utilizacion`).
const MODULOS = [...MODULOS_TODOS];

// AISLAMIENTO DE ESTADO ENTRE ARCHIVOS (R3): `vitest run` ejecuta los archivos en
// PARALELO contra la MISMA BD dev. El tenant de plataforma `deltaops` es SEMILLA
// compartida y el seed (`seed-delta-demo`) lo (re)escribe con TODOS los módulos
// (incluye `correctivo`). Este suite necesita un tenant B que contrate SÓLO un
// subconjunto (SIN `correctivo`) para probar de verdad el 403 de entitlement, así
// que NO puede compartir `deltaops`: crea su PROPIO tenant B único por corrida.
// Patrón idéntico al de `module-manodeobra`/`flows.integration` (tenants únicos).
const RUN = crypto.randomUUID().slice(0, 8);
const TENANT_B = `e2e-plat-${RUN}`;
const MODULOS_B = ["referencia", "activos"]; // SIN correctivo, a propósito
const EMAIL_PLAT = `admin.plat.${RUN}@deltaops.test`;
const EMAIL_AB = `ab.${RUN}@delta.test`;

// Credenciales SIEMPRE desde la fuente centralizada (nunca literales).
const PASS_DEMO = credencialDemo(CLAVES_ENV.DEMO_ADMIN);
const PASS_PLAT = credencialDemo(CLAVES_ENV.PLATFORM_ADMIN);
const PASS_AB = credencialDemo(CLAVES_ENV.DEMO_SUPERVISOR); // reutiliza un default dev

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

/** Crea/asegura una identidad con password FORZADA y una membresía en un tenant. */
async function asegurarIdentidad(
  email: string,
  nombre: string,
  password: string,
  tenantId: string,
  rol: string,
): Promise<string> {
  let id = await obtenerIdentidadPorEmail(email);
  if (!id) {
    const nueva = await crearIdentidad({ email, nombre, passwordHash: await hashPassword(password), estado: "ACTIVO" });
    id = await obtenerIdentidadPorEmail(email);
    if (!id) throw new Error("no se pudo crear identidad");
    void nueva;
  }
  // Fuerza la contraseña (determinismo en aislamiento, sin depender del estado previo).
  await actualizarPassword(id.identityId, await hashPassword(password));
  await crearMembresia({ identityId: id.identityId, tenantId, rol });
  return id.identityId;
}

beforeAll(async () => {
  // Tenant A (delta-demo): con TODOS los módulos contratados.
  await crearTenant({
    tenantId: "delta-demo", codigo: "DELTA-DEMO", nombreComercial: "DELTA DEMO",
    zonaHoraria: "America/Santiago", idioma: "es", moneda: "CLP",
    modulos: MODULOS, branding: { nombre: "DELTA DEMO", nombreApp: "DeltaOps" },
  });
  await seedRolesDeTenant("delta-demo");
  await actualizarModulos("delta-demo", MODULOS);

  // Tenant B (ÚNICO por corrida): plataforma; contrata solo un SUBCONJUNTO de
  // módulos (SIN correctivo) para verificar el rechazo por entitlement SIN
  // depender del estado del tenant semilla `deltaops` (que el seed reescribe).
  await crearTenant({
    tenantId: TENANT_B, codigo: `E2EPLAT${RUN}`.toUpperCase(), nombreComercial: "DeltaOps E2E",
    zonaHoraria: "America/Santiago", idioma: "es", moneda: "CLP",
    modulos: MODULOS_B, branding: { nombre: "DeltaOps", nombreApp: "DeltaOps" },
  });
  await seedRolesDeTenant(TENANT_B);
  await actualizarModulos(TENANT_B, MODULOS_B);

  await asegurarIdentidad("admin@delta.demo", "Carlos Pacheco", PASS_DEMO, "delta-demo", "TENANT_ADMIN");
  // Administrador de plataforma (SUPER_ADMIN) del tenant B único (email único
  // para no colisionar con el `admin@deltaops.dev` del seed).
  await asegurarIdentidad(EMAIL_PLAT, "Administrador de Plataforma", PASS_PLAT, TENANT_B, "SUPER_ADMIN");

  // Identidad A/B: MISMA identidad con membresías en DOS tenants con roles
  // DISTINTOS. En delta-demo (A) es TENANT_ADMIN; en el tenant B único es
  // SUPERVISOR. Email único por corrida para aislar el epoch de la identidad.
  await asegurarIdentidad(EMAIL_AB, "AB Tester", PASS_AB, "delta-demo", "TENANT_ADMIN");
  await asegurarIdentidad(EMAIL_AB, "AB Tester", PASS_AB, TENANT_B, "SUPERVISOR");

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api`;
}, 60_000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  // Purga el tenant B ÚNICO y las identidades propias de esta corrida para no
  // dejar residuos en la BD dev compartida.
  const c = await pool.connect();
  try {
    for (const tbl of ["idn_invitations", "idn_password_resets", "idn_memberships", "idn_roles", "ntf_email_outbox", "platform_audit", "ten_tenants"]) {
      await c.query(`DELETE FROM deltaops.${tbl} WHERE tenant_id = $1`, [TENANT_B]).catch(() => undefined);
    }
    await c.query(`DELETE FROM deltaops.idn_identities WHERE lower(email) = ANY($1)`, [[EMAIL_PLAT.toLowerCase(), EMAIL_AB.toLowerCase()]]).catch(() => undefined);
  } finally {
    c.release();
  }
});

describe("E2E · login DEMO devuelve SessionResponse completa (no legacy)", () => {
  it("POST /auth/login → SessionResponse con tenant, rol, modulos y membresias", async () => {
    const c = crearCliente();
    const r = await c.req("POST", "/deltaops/auth/login", {
      email: "admin@delta.demo", password: PASS_DEMO, tenantId: "delta-demo",
    });
    expect(r.status).toBe(200);
    expect(r.json.identityId).toBeTruthy();
    expect(r.json.tenant).toBeTruthy();
    expect(r.json.tenant.codigo).toBe("DELTA-DEMO");
    expect(r.json.tenant.id).toBe("delta-demo");
    expect(r.json.rol).toBe("TENANT_ADMIN");
    expect(Array.isArray(r.json.modulos)).toBe(true);
    expect(r.json.modulos.length).toBeGreaterThan(0);
    expect(Array.isArray(r.json.membresias)).toBe(true);
    expect(r.json.id).toBeUndefined();
  });

  it("GET /auth/session con la MISMA cookie es coherente (no 401)", async () => {
    const c = crearCliente();
    await c.req("POST", "/deltaops/auth/login", { email: "admin@delta.demo", password: PASS_DEMO, tenantId: "delta-demo" });
    const s = await c.req("GET", "/deltaops/auth/session");
    expect(s.status).toBe(200);
    expect(s.json.email).toBe("admin@delta.demo");
    expect(s.json.tenant.id).toBe("delta-demo");
    expect(s.json.rol).toBe("TENANT_ADMIN");
  });

  it("una ruta de módulo CONTRATADO queda AUTORIZADA con esa sesión (compat)", async () => {
    const c = crearCliente();
    await c.req("POST", "/deltaops/auth/login", { email: "admin@delta.demo", password: PASS_DEMO, tenantId: "delta-demo" });
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

  it("ruta de módulo SIN sesión responde 401 (sin camino permisivo)", async () => {
    const c = crearCliente();
    const m = await c.req("GET", "/deltaops/correctivo/solicitudes");
    expect(m.status).toBe(401);
    expect(m.json.code).toBe("AUTH_REQUIRED");
  });
});

describe("E2E · login del administrador de plataforma", () => {
  it("admin de plataforma → SessionResponse con rol SUPER_ADMIN", async () => {
    const c = crearCliente();
    const r = await c.req("POST", "/deltaops/auth/login", { email: EMAIL_PLAT, password: PASS_PLAT, tenantId: TENANT_B });
    expect(r.status).toBe(200);
    expect(r.json.rol).toBe("SUPER_ADMIN");
    expect(r.json.tenant.id).toBe(TENANT_B);
    const admin = await c.req("GET", "/deltaops/admin/tenants");
    expect(admin.status).toBe(200);
    expect(Array.isArray(admin.json)).toBe(true);
  });
});

describe("E2E · entitlements de módulo (rechazo backend)", () => {
  it("módulo NO contratado por el tenant ⇒ 403 MODULE_NOT_ENTITLED", async () => {
    // El tenant B ÚNICO de esta corrida NO contrató `correctivo` (solo
    // referencia/activos) — aislado del semilla `deltaops` que el seed reescribe.
    const c = crearCliente();
    await c.req("POST", "/deltaops/auth/login", { email: EMAIL_PLAT, password: PASS_PLAT, tenantId: TENANT_B });
    const m = await c.req("GET", "/deltaops/correctivo/solicitudes");
    expect(m.status).toBe(403);
    expect(m.json.code).toBe("MODULE_NOT_ENTITLED");
  });
});

describe("E2E · estado global del proveedor de correo exige SUPER_ADMIN", () => {
  const RUTA = "/deltaops/admin/notifications/provider-status";

  it("sin sesión ⇒ 401", async () => {
    const c = crearCliente();
    const r = await c.req("GET", RUTA);
    expect(r.status).toBe(401);
  });

  it("TENANT_ADMIN (admin@delta.demo) ⇒ 403 (NO acepta 'admin' legacy)", async () => {
    const c = crearCliente();
    const login = await c.req("POST", "/deltaops/auth/login", {
      email: "admin@delta.demo", password: PASS_DEMO, tenantId: "delta-demo",
    });
    expect(login.status).toBe(200);
    expect(login.json.rol).toBe("TENANT_ADMIN");
    const r = await c.req("GET", RUTA);
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("FORBIDDEN");
  });

  it("SUPER_ADMIN (admin de plataforma) ⇒ 200 con payload redactado (sin secretos)", async () => {
    const c = crearCliente();
    const login = await c.req("POST", "/deltaops/auth/login", {
      email: EMAIL_PLAT, password: PASS_PLAT, tenantId: TENANT_B,
    });
    expect(login.status).toBe(200);
    expect(login.json.rol).toBe("SUPER_ADMIN");
    const r = await c.req("GET", RUTA);
    expect(r.status).toBe(200);
    // Contrato Graph: proveedor válido es fake | m365-graph. Robusto al valor
    // del entorno (NOTIFICATION_PROVIDER), reflejando lo que resuelve el server.
    expect(["fake", "m365-graph"]).toContain(r.json.proveedor);
    const esperado = proveedorSolicitado(process.env);
    expect(r.json.proveedor).toBe(esperado);
    // Nunca expone secretos: sin client_secret ni access_token en el payload.
    const s = JSON.stringify(r.json);
    expect(s).not.toMatch(/secret|token|password/i);
  });
});

describe("E2E · AISLAMIENTO CRÍTICO de sesiones concurrentes A/B (misma identidad)", () => {
  it("A no adopta el tenant/rol de B ni tras login/switch-tenant en B", async () => {
    // Sesión A: identidad A/B en tenant A (delta-demo) como TENANT_ADMIN.
    const A = crearCliente();
    const loginA = await A.req("POST", "/deltaops/auth/login", { email: EMAIL_AB, password: PASS_AB, tenantId: "delta-demo" });
    expect(loginA.status).toBe(200);
    expect(loginA.json.tenant.id).toBe("delta-demo");
    expect(loginA.json.rol).toBe("TENANT_ADMIN");

    // Sesión B (cookie independiente): MISMA identidad en el tenant B único como SUPERVISOR.
    const B = crearCliente();
    const loginB = await B.req("POST", "/deltaops/auth/login", { email: EMAIL_AB, password: PASS_AB, tenantId: TENANT_B });
    expect(loginB.status).toBe(200);
    expect(loginB.json.tenant.id).toBe(TENANT_B);
    expect(loginB.json.rol).toBe("SUPERVISOR");

    // La sesión A NO puede haber adoptado el contexto de B. Como el login de B
    // incrementó el epoch de la identidad, la sesión A queda OBSOLETA: su
    // `/auth/session` NO devuelve jamás el tenant/rol de B (se rechaza 401).
    const sesA = await A.req("GET", "/deltaops/auth/session");
    expect(sesA.status).toBe(401); // epoch obsoleta ⇒ nunca adopta B
    expect(sesA.json.code).toBe("AUTH_STALE");

    // Y un acceso a módulo desde A tampoco usa el contexto de B.
    const modA = await A.req("GET", "/deltaops/activos");
    expect(modA.status).toBe(401);

    // B sigue siendo coherente con SU propio tenant/rol.
    const sesB = await B.req("GET", "/deltaops/auth/session");
    expect(sesB.status).toBe(200);
    expect(sesB.json.tenant.id).toBe(TENANT_B);
    expect(sesB.json.rol).toBe("SUPERVISOR");

    // Un switch-tenant en B (a delta-demo) NO afecta el aislamiento: B pasa a A,
    // pero jamás mezcla su rol previo; y una A ya obsoleta sigue rechazada.
    const switchB = await B.req("POST", "/deltaops/auth/switch-tenant", { tenantId: "delta-demo" });
    expect(switchB.status).toBe(200);
    expect(switchB.json.tenant.id).toBe("delta-demo");
    expect(switchB.json.rol).toBe("TENANT_ADMIN");

    // Re-login de A restablece una sesión válida y correcta para tenant A.
    const A2 = crearCliente();
    const reloginA = await A2.req("POST", "/deltaops/auth/login", { email: EMAIL_AB, password: PASS_AB, tenantId: "delta-demo" });
    expect(reloginA.status).toBe(200);
    expect(reloginA.json.tenant.id).toBe("delta-demo");
    expect(reloginA.json.rol).toBe("TENANT_ADMIN"); // nunca SUPERVISOR de B
  });
});

describe("E2E · recuperación neutra y logout", () => {
  it("POST /auth/password/forgot responde 202 neutro (exista o no el correo)", async () => {
    const c = crearCliente();
    const existe = await c.req("POST", "/deltaops/auth/password/forgot", { email: "admin@delta.demo", tenantId: "delta-demo" });
    const noExiste = await c.req("POST", "/deltaops/auth/password/forgot", { email: "nadie-xyz@ninguna.test" });
    expect(existe.status).toBe(202);
    expect(noExiste.status).toBe(202);
    expect(JSON.stringify(existe.json)).toBe(JSON.stringify(noExiste.json));
  });

  it("POST /auth/logout invalida la sesión (session posterior 401)", async () => {
    const c = crearCliente();
    await c.req("POST", "/deltaops/auth/login", { email: "admin@delta.demo", password: PASS_DEMO, tenantId: "delta-demo" });
    const out = await c.req("POST", "/deltaops/auth/logout");
    expect(out.status).toBe(204);
    const s = await c.req("GET", "/deltaops/auth/session");
    expect(s.status).toBe(401);
  });

  it("credenciales inválidas → 401", async () => {
    const c = crearCliente();
    // Contraseña DELIBERADAMENTE distinta de la real (no es una credencial): se
    // deriva de la válida para garantizar que NO coincide.
    const claveInvalida = `${PASS_DEMO}-invalida`;
    const r = await c.req("POST", "/deltaops/auth/login", { email: "admin@delta.demo", password: claveInvalida, tenantId: "delta-demo" });
    expect(r.status).toBe(401);
  });
});
