/**
 * DGP-017 · Contrato del cliente de identidad. Verifica que cada operación
 * llama a la ruta correcta con el método correcto y con un cuerpo que satisface
 * los campos requeridos del contrato CONGELADO `identity.openapi.json`. No se
 * congela un JSON aparte: se valida contra el propio OpenAPI comprometido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as api from "../lib/identidad/endpoints";
import { IdentidadError } from "../lib/identidad/api";

const spec = JSON.parse(
  fs.readFileSync(
    path.resolve(process.cwd(), "../api-server/openapi/identity.openapi.json"),
    "utf8",
  ),
) as {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, { required?: string[] }> };
};

let ultima: { url: string; method: string; body: unknown } | null = null;

function mock(status = 200, cuerpo: unknown = {}) {
  return vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    ultima = {
      url: String(u),
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
    // jsdom no permite construir Response con 204; se simula con 200 sin cuerpo.
    const esVacio = status === 204;
    return new Response(esVacio ? null : JSON.stringify(cuerpo), {
      status: esVacio ? 200 : status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function requeridos(schema: string): string[] {
  return spec.components.schemas[schema]?.required ?? [];
}

function tieneRuta(metodo: string, ruta: string): boolean {
  const p = spec.paths[`/api/deltaops${ruta}`];
  return Boolean(p && p[metodo.toLowerCase()]);
}

beforeEach(() => (ultima = null));
afterEach(() => vi.restoreAllMocks());

describe("rutas y métodos coinciden con el OpenAPI congelado", () => {
  it("login apunta a POST /auth/login con los requeridos de LoginBody", async () => {
    mock(200, { identityId: "i", email: "e", nombre: "n", tenant: { id: "t", codigo: "C", nombre: "N", estado: "ACTIVO" }, rol: "CONSULTA", modulos: [], membresias: [] });
    await api.login({ email: "a@b.c", password: "secreta1" });
    expect(ultima!.method).toBe("POST");
    expect(ultima!.url).toContain("/api/deltaops/auth/login");
    for (const campo of requeridos("LoginBody")) {
      expect(Object.keys(ultima!.body as object)).toContain(campo);
    }
    expect(tieneRuta("post", "/auth/login")).toBe(true);
  });

  it("switch-tenant envía tenantId (requerido de SwitchTenantBody)", async () => {
    mock(200, {});
    await api.switchTenant("t-123").catch(() => {});
    expect(ultima!.url).toContain("/api/deltaops/auth/switch-tenant");
    expect((ultima!.body as { tenantId: string }).tenantId).toBe("t-123");
    expect(requeridos("SwitchTenantBody")).toContain("tenantId");
  });

  it("password reset envía tenantId+token+password", async () => {
    mock(204);
    await api.resetPassword({ tenantId: "t", token: "tok", password: "secreta1" });
    expect(ultima!.url).toContain("/api/deltaops/auth/password/reset");
    for (const campo of requeridos("ResetPasswordBody")) {
      expect(Object.keys(ultima!.body as object)).toContain(campo);
    }
  });

  it("aceptar invitación envía tenantId+token+nombre+password", async () => {
    mock(201);
    await api.aceptarInvitacion({ tenantId: "t", token: "tok", nombre: "Ada", password: "secreta1" });
    expect(ultima!.url).toContain("/api/deltaops/auth/invitations/accept");
    for (const campo of requeridos("AceptarInvitacionBody")) {
      expect(Object.keys(ultima!.body as object)).toContain(campo);
    }
  });

  it("crear invitación envía email+rol", async () => {
    mock(201, { invitationId: "x", email: "e", rol: "TECNICO", estado: "pendiente" });
    await api.crearInvitacion({ email: "a@b.c", rol: "TECNICO" });
    expect(ultima!.url).toContain("/api/deltaops/auth/invitations");
    for (const campo of requeridos("CrearInvitacionBody")) {
      expect(Object.keys(ultima!.body as object)).toContain(campo);
    }
  });

  it("crear usuario envía email+nombre+rol", async () => {
    mock(201);
    await api.crearUsuario({ email: "a@b.c", nombre: "Ada", rol: "PLANIFICADOR" });
    for (const campo of requeridos("CrearUsuarioBody")) {
      expect(Object.keys(ultima!.body as object)).toContain(campo);
    }
  });

  it("cambiar estado de tenant usa POST /admin/tenants/:id/status con estado", async () => {
    mock(200, { id: "t", codigo: "C", nombre: "N", estado: "SUSPENDIDO" });
    await api.cambiarEstadoTenant("t-1", "SUSPENDIDO");
    expect(ultima!.method).toBe("POST");
    expect(ultima!.url).toContain("/api/deltaops/admin/tenants/t-1/status");
    expect((ultima!.body as { estado: string }).estado).toBe("SUSPENDIDO");
    expect(requeridos("EstadoTenantBody")).toContain("estado");
  });

  it("cambiar módulos de tenant usa PATCH con {modulos}", async () => {
    mock(200, { modulos: ["activos"] });
    await api.cambiarModulosTenant("t-1", ["activos", "ordenes"]);
    expect(ultima!.method).toBe("PATCH");
    expect(ultima!.url).toContain("/api/deltaops/admin/tenants/t-1/modules");
    expect((ultima!.body as { modulos: string[] }).modulos).toEqual(["activos", "ordenes"]);
  });

  it("listar usuarios traduce filtros q/estado a querystring", async () => {
    mock(200, []);
    await api.listarUsuarios({ q: "ada", estado: "ACTIVO" });
    expect(ultima!.url).toContain("q=ada");
    expect(ultima!.url).toContain("estado=ACTIVO");
  });
});

describe("mapeo de errores {error, code?}", () => {
  it("propaga el código y el status del cuerpo de error", async () => {
    mock(403, { error: "La empresa no está operativa", code: "TENANT_NOT_OPERATIONAL", estado: "SUSPENDIDO" });
    await expect(api.login({ email: "a@b.c", password: "x" })).rejects.toMatchObject({
      status: 403,
      code: "TENANT_NOT_OPERATIONAL",
    });
  });

  it("el 409 SELECT_TENANT propaga las membresías en datos", async () => {
    mock(409, { code: "SELECT_TENANT", membresias: [{ tenantId: "t1", nombre: "Uno", rol: "CONSULTA" }] });
    try {
      await api.login({ email: "a@b.c", password: "x" });
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(IdentidadError);
      const err = e as IdentidadError;
      expect(err.code).toBe("SELECT_TENANT");
      expect((err.datos.membresias as unknown[]).length).toBe(1);
    }
  });
});
