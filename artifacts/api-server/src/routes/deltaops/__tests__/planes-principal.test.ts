/**
 * DGP-012.2 · API Server — mapeo rol → permisos del Módulo Maintenance Plans.
 *
 * Verifica que `principalPlanes` deriva permisos correctos por rol (admin: todo;
 * operador: sin admin; lector: sólo lectura) SIN necesidad de base de datos ni
 * de arrancar Express. Es la superficie de autorización que consumen las rutas.
 */
import { describe, expect, it } from "vitest";
import { principalPlanes } from "../planes-runtime";

describe("API Server · principalPlanes (rol → permisos)", () => {
  it("admin recibe permisos de módulo y de plataforma + todas las capacidades", () => {
    const p = principalPlanes("u1", "admin");
    expect(p.permisos).toContain("modulo.planes.admin");
    expect(p.permisos).toContain("modulo.planes.write");
    expect(p.permisos).toContain("modulo.planes.govern");
    expect(p.permisos).toContain("modulo.planes.generate");
    expect(p.capacidades).toContain("administrar-planes");
  });

  it("operador NO recibe el permiso admin del módulo", () => {
    const p = principalPlanes("u2", "operador");
    expect(p.permisos).toContain("modulo.planes.write");
    expect(p.permisos).not.toContain("modulo.planes.admin");
    expect(p.capacidades).not.toContain("administrar-planes");
  });

  it("lector sólo recibe lectura del módulo (más lecturas de plataforma)", () => {
    const p = principalPlanes("u3", "lector");
    expect(p.permisos).toContain("modulo.planes.read");
    expect(p.permisos).not.toContain("modulo.planes.write");
    expect(p.permisos).not.toContain("modulo.planes.admin");
    expect(p.capacidades).toEqual([]);
  });
});
