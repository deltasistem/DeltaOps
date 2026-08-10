/**
 * DGP-017 · RBAC como configuración — mapeo canónico↔legacy y helpers.
 */
import { describe, expect, it } from "vitest";
import {
  aRolCanonico,
  aRolLegacy,
  esAdminDeTenant,
  esRolCanonico,
  esSuperAdmin,
  ROLES_CANONICOS,
  CATALOGO_ROLES,
} from "../rbac";

describe("RBAC · roles canónicos y mapeo legacy", () => {
  it("reconoce los seis roles canónicos", () => {
    expect(ROLES_CANONICOS).toEqual([
      "SUPER_ADMIN", "TENANT_ADMIN", "SUPERVISOR", "PLANIFICADOR", "TECNICO", "CONSULTA",
    ]);
    expect(esRolCanonico("TENANT_ADMIN")).toBe(true);
    expect(esRolCanonico("admin")).toBe(false);
  });

  it("mapea roles legacy históricos a canónicos", () => {
    expect(aRolCanonico("admin")).toBe("TENANT_ADMIN");
    expect(aRolCanonico("platform_admin")).toBe("SUPER_ADMIN");
    expect(aRolCanonico("operador")).toBe("SUPERVISOR");
    expect(aRolCanonico("lector")).toBe("CONSULTA");
    expect(aRolCanonico("desconocido")).toBe("CONSULTA");
  });

  it("deriva rol legacy de módulo desde el canónico", () => {
    expect(aRolLegacy("SUPER_ADMIN")).toBe("admin");
    expect(aRolLegacy("TENANT_ADMIN")).toBe("admin");
    expect(aRolLegacy("SUPERVISOR")).toBe("operador");
    expect(aRolLegacy("PLANIFICADOR")).toBe("operador");
    expect(aRolLegacy("TECNICO")).toBe("operador");
    expect(aRolLegacy("CONSULTA")).toBe("lector");
    // Compat: aRolLegacy acepta también rol legacy directamente.
    expect(aRolLegacy("admin")).toBe("admin");
  });

  it("distingue admin de tenant y super admin", () => {
    expect(esAdminDeTenant("TENANT_ADMIN")).toBe(true);
    expect(esAdminDeTenant("SUPER_ADMIN")).toBe(true);
    expect(esAdminDeTenant("SUPERVISOR")).toBe(false);
    expect(esSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(esSuperAdmin("TENANT_ADMIN")).toBe(false);
  });

  it("el catálogo de roles cubre los seis roles", () => {
    expect(CATALOGO_ROLES.map((r) => r.clave).sort()).toEqual([...ROLES_CANONICOS].sort());
  });
});
