/**
 * DGP-014.2 · API Server — mapeo rol → permisos del Módulo Enterprise Preventive
 * Maintenance.
 *
 * Verifica que `principalPreventivo` deriva permisos correctos por rol (admin:
 * todo el módulo + plataforma; operador: sin `.admin`; lector: sólo lectura) SIN
 * base de datos ni Express. Es la superficie de autorización que consumen las
 * rutas de `/api/deltaops/preventivo`.
 */
import { describe, expect, it } from "vitest";
import { principalPreventivo } from "../preventivo-runtime";

describe("API Server · principalPreventivo (rol → permisos)", () => {
  it("admin recibe todos los permisos del módulo + plataforma y capacidades", () => {
    const p = principalPreventivo("u1", "admin");
    expect(p.permisos).toContain("modulo.preventivo.admin");
    expect(p.permisos).toContain("modulo.preventivo.write");
    expect(p.permisos).toContain("modulo.preventivo.govern");
    expect(p.permisos).toContain("modulo.preventivo.schedule");
    expect(p.permisos).toContain("modulo.preventivo.read");
    expect(p.capacidades).toContain("administrar-preventivo");
  });

  it("operador recibe write/govern/schedule pero NO el permiso admin", () => {
    const p = principalPreventivo("u2", "operador");
    expect(p.permisos).toContain("modulo.preventivo.write");
    expect(p.permisos).toContain("modulo.preventivo.govern");
    expect(p.permisos).toContain("modulo.preventivo.schedule");
    expect(p.permisos).not.toContain("modulo.preventivo.admin");
    expect(p.capacidades).not.toContain("administrar-preventivo");
  });

  it("lector sólo recibe lectura del módulo (más lecturas de plataforma)", () => {
    const p = principalPreventivo("u3", "lector");
    expect(p.permisos).toContain("modulo.preventivo.read");
    expect(p.permisos).not.toContain("modulo.preventivo.write");
    expect(p.permisos).not.toContain("modulo.preventivo.schedule");
    expect(p.permisos).not.toContain("modulo.preventivo.admin");
    expect(p.capacidades).toEqual([]);
  });
});
