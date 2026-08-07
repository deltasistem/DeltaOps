/**
 * DGP-015.2 · API Server — mapeo rol → permisos del Módulo Enterprise Corrective
 * Maintenance.
 *
 * Verifica que `principalCorrectivo` deriva permisos correctos por rol (admin:
 * todo el módulo + plataforma; operador: sin `.admin`; lector: sólo lectura) SIN
 * base de datos ni Express. Es la superficie de autorización que consumen las
 * rutas de `/api/deltaops/correctivo`.
 */
import { describe, expect, it } from "vitest";
import { principalCorrectivo } from "../correctivo-runtime";

describe("API Server · principalCorrectivo (rol → permisos)", () => {
  it("admin recibe todos los permisos del módulo + plataforma y capacidades", () => {
    const p = principalCorrectivo("u1", "admin");
    expect(p.permisos).toContain("modulo.correctivo.admin");
    expect(p.permisos).toContain("modulo.correctivo.write");
    expect(p.permisos).toContain("modulo.correctivo.govern");
    expect(p.permisos).toContain("modulo.correctivo.execute");
    expect(p.permisos).toContain("modulo.correctivo.read");
    expect(p.capacidades).toContain("administrar-correctivo");
  });

  it("operador recibe write/govern/execute pero NO el permiso admin", () => {
    const p = principalCorrectivo("u2", "operador");
    expect(p.permisos).toContain("modulo.correctivo.write");
    expect(p.permisos).toContain("modulo.correctivo.govern");
    expect(p.permisos).toContain("modulo.correctivo.execute");
    expect(p.permisos).not.toContain("modulo.correctivo.admin");
    expect(p.capacidades).not.toContain("administrar-correctivo");
  });

  it("lector sólo recibe lectura del módulo (más lecturas de plataforma)", () => {
    const p = principalCorrectivo("u3", "lector");
    expect(p.permisos).toContain("modulo.correctivo.read");
    expect(p.permisos).not.toContain("modulo.correctivo.write");
    expect(p.permisos).not.toContain("modulo.correctivo.execute");
    expect(p.permisos).not.toContain("modulo.correctivo.admin");
    expect(p.capacidades).toEqual([]);
  });
});
