/**
 * DGP-019.1 · API Server — mapeo rol → permisos del Módulo de Utilización,
 * Medidores y Combustible.
 *
 * Verifica que `principalUtilizacion` deriva los permisos correctos por rol SIN
 * base de datos ni Express (RBAC del mandato):
 *  - TENANT_ADMIN: TODO.
 *  - SUPERVISOR: leer + registrar/anular (lecturas y tanqueos) + regularizar.
 *  - PLANIFICADOR: sólo leer.
 *  - TECNICO: leer + registrar (lecturas y tanqueos), SIN anular ni regularizar.
 *  - CONSULTA: sólo leer.
 * Es la superficie de autorización que consumen las rutas
 * `/api/deltaops/utilizacion`.
 */
import { describe, expect, it } from "vitest";
import { MODULO } from "@workspace/module-utilizacion";
import { principalUtilizacion } from "../utilizacion-runtime";

const P = {
  leer: `${MODULO}.leer`,
  lectRegistrar: `${MODULO}.lecturas.registrar`,
  lectAnular: `${MODULO}.lecturas.anular`,
  tanqRegistrar: `${MODULO}.tanqueos.registrar`,
  tanqAnular: `${MODULO}.tanqueos.anular`,
  regularizar: `${MODULO}.medidores.regularizar`,
};

describe("API Server · principalUtilizacion (rol → permisos)", () => {
  it("TENANT_ADMIN recibe todas las capacidades del módulo", () => {
    const p = principalUtilizacion("u1", "TENANT_ADMIN");
    for (const perm of Object.values(P)) expect(p.permisos).toContain(perm);
    expect(p.capacidades).toContain("medidores.regularizar");
  });

  it("SUPERVISOR: leer + registrar/anular (ambos) + regularizar", () => {
    const p = principalUtilizacion("u2", "SUPERVISOR");
    for (const perm of Object.values(P)) expect(p.permisos).toContain(perm);
  });

  it("TECNICO: leer + registrar (lecturas y tanqueos); SIN anular ni regularizar", () => {
    const p = principalUtilizacion("u3", "TECNICO");
    expect(p.permisos).toContain(P.leer);
    expect(p.permisos).toContain(P.lectRegistrar);
    expect(p.permisos).toContain(P.tanqRegistrar);
    expect(p.permisos).not.toContain(P.lectAnular);
    expect(p.permisos).not.toContain(P.tanqAnular);
    expect(p.permisos).not.toContain(P.regularizar);
  });

  it("PLANIFICADOR: sólo lectura", () => {
    const p = principalUtilizacion("u4", "PLANIFICADOR");
    expect(p.permisos).toContain(P.leer);
    expect(p.permisos).not.toContain(P.lectRegistrar);
    expect(p.permisos).not.toContain(P.tanqRegistrar);
    expect(p.capacidades).toEqual(["leer"]);
  });

  it("CONSULTA: sólo lectura (no escribe)", () => {
    const p = principalUtilizacion("u5", "CONSULTA");
    expect(p.permisos).toContain(P.leer);
    expect(p.permisos).not.toContain(P.lectRegistrar);
    expect(p.permisos).not.toContain(P.lectAnular);
    expect(p.permisos).not.toContain(P.tanqRegistrar);
    expect(p.permisos).not.toContain(P.tanqAnular);
    expect(p.permisos).not.toContain(P.regularizar);
    expect(p.capacidades).toEqual(["leer"]);
  });
});
