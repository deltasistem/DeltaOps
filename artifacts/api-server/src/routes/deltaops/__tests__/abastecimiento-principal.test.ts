/**
 * DGP-013.2 · API Server — mapeo rol → permisos del Módulo Enterprise Procurement.
 *
 * Verifica que `principalAbastecimiento` deriva permisos correctos por rol
 * (admin: todo el módulo + plataforma; operador: sin `.admin`; lector: sólo
 * lectura) SIN base de datos ni Express. Es la superficie de autorización que
 * consumen las rutas de `/api/deltaops/abastecimiento`.
 */
import { describe, expect, it } from "vitest";
import { principalAbastecimiento } from "../abastecimiento-runtime";

describe("API Server · principalAbastecimiento (rol → permisos)", () => {
  it("admin recibe todos los permisos del módulo + plataforma y capacidades", () => {
    const p = principalAbastecimiento("u1", "admin");
    expect(p.permisos).toContain("modulo.abastecimiento.admin");
    expect(p.permisos).toContain("modulo.abastecimiento.write");
    expect(p.permisos).toContain("modulo.abastecimiento.govern");
    expect(p.permisos).toContain("modulo.abastecimiento.receive");
    expect(p.permisos).toContain("modulo.abastecimiento.read");
    expect(p.capacidades).toContain("administrar-abastecimiento");
  });

  it("operador recibe write/govern/receive pero NO el permiso admin", () => {
    const p = principalAbastecimiento("u2", "operador");
    expect(p.permisos).toContain("modulo.abastecimiento.write");
    expect(p.permisos).toContain("modulo.abastecimiento.govern");
    expect(p.permisos).toContain("modulo.abastecimiento.receive");
    expect(p.permisos).not.toContain("modulo.abastecimiento.admin");
    expect(p.capacidades).not.toContain("administrar-abastecimiento");
  });

  it("lector sólo recibe lectura del módulo (más lecturas de plataforma)", () => {
    const p = principalAbastecimiento("u3", "lector");
    expect(p.permisos).toContain("modulo.abastecimiento.read");
    expect(p.permisos).not.toContain("modulo.abastecimiento.write");
    expect(p.permisos).not.toContain("modulo.abastecimiento.receive");
    expect(p.permisos).not.toContain("modulo.abastecimiento.admin");
    expect(p.capacidades).toEqual([]);
  });
});
