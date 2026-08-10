/**
 * DGP-017 · RBAC de presentación y entitlements de módulos. La UI OFRECE según
 * el rol y OCULTA módulos no contratados; el backend sigue siendo la autoridad.
 */
import { describe, it, expect } from "vitest";
import {
  capacidadesDe,
  esAdminEmpresa,
  esSuperAdmin,
  moduloHabilitado,
  modulosVisibles,
  nombreRol,
} from "../lib/identidad/rbac";
import type { Rol, Modulo } from "../lib/identidad/tipos";

describe("capacidades por rol", () => {
  it("TENANT_ADMIN administra usuarios y configura empresa, pero no SaaS", () => {
    const c = capacidadesDe({ rol: "TENANT_ADMIN" });
    expect(c.administrarUsuarios).toBe(true);
    expect(c.configurarEmpresa).toBe(true);
    expect(c.administrarSaaS).toBe(false);
    expect(c.cambiarModulos).toBe(false);
  });

  it("SUPER_ADMIN administra SaaS y módulos", () => {
    const c = capacidadesDe({ rol: "SUPER_ADMIN" });
    expect(c.administrarSaaS).toBe(true);
    expect(c.cambiarModulos).toBe(true);
  });

  it.each(["SUPERVISOR", "PLANIFICADOR", "TECNICO", "CONSULTA"] as Rol[])(
    "el rol %s no administra ni configura",
    (rol) => {
      const c = capacidadesDe({ rol });
      expect(c.administrarUsuarios).toBe(false);
      expect(c.configurarEmpresa).toBe(false);
      expect(c.administrarSaaS).toBe(false);
    },
  );

  it("helpers de rol", () => {
    expect(esAdminEmpresa("TENANT_ADMIN")).toBe(true);
    expect(esAdminEmpresa("SUPER_ADMIN")).toBe(true);
    expect(esAdminEmpresa("TECNICO")).toBe(false);
    expect(esSuperAdmin("SUPER_ADMIN")).toBe(true);
    expect(esSuperAdmin("TENANT_ADMIN")).toBe(false);
    expect(nombreRol("TENANT_ADMIN")).toMatch(/Administrador/);
    expect(nombreRol("DESCONOCIDO")).toBe("DESCONOCIDO");
  });
});

describe("entitlements de módulos (ocultar lo no contratado)", () => {
  const modulos: Modulo[] = ["activos", "ordenes", "inventario"];

  it("moduloHabilitado refleja la lista de la sesión", () => {
    expect(moduloHabilitado({ modulos }, "activos")).toBe(true);
    expect(moduloHabilitado({ modulos }, "analytics")).toBe(false);
  });

  it("modulosVisibles sólo devuelve los habilitados, en orden canónico", () => {
    const vis = modulosVisibles({ modulos });
    expect(vis.map((m) => m.modulo)).toEqual(["activos", "ordenes", "inventario"]);
    // Cada uno trae su ruta de entrada.
    expect(vis[0].ruta).toBe("/activos");
    // Un módulo NO contratado nunca aparece.
    expect(vis.some((m) => m.modulo === "analytics")).toBe(false);
  });

  it("sin módulos, no se muestra ninguno (conservador)", () => {
    expect(modulosVisibles({ modulos: [] })).toHaveLength(0);
  });
});
