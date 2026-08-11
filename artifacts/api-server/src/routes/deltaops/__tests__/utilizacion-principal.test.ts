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

/**
 * Regresión del bug e2e real (tecnico@delta.demo → 403): `deltaops.users.rol`
 * guarda el rol LEGACY del espejo (admin/operador/lector), y la sesión expone el
 * rol CANÓNICO por membresía. `principalUtilizacion` normaliza vía `aRolCanonico`,
 * de modo que ambos literales resuelven correctamente. Estos casos usan los
 * literales EXACTOS que existen en la BD (idn_memberships / deltaops.users).
 */
describe("API Server · principalUtilizacion (literales REALES: canónico y legacy)", () => {
  it("legacy 'admin' (espejo de TENANT_ADMIN/SUPER_ADMIN) ⇒ TODO", () => {
    const p = principalUtilizacion("u1", "admin");
    for (const perm of Object.values(P)) expect(p.permisos).toContain(perm);
  });

  it("SUPER_ADMIN ⇒ TODO", () => {
    const p = principalUtilizacion("u1b", "SUPER_ADMIN");
    for (const perm of Object.values(P)) expect(p.permisos).toContain(perm);
  });

  it("legacy 'operador' (espejo) ⇒ SUPERVISOR (registrar/anular + regularizar)", () => {
    // El espejo colapsa SUPERVISOR/PLANIFICADOR/TECNICO en 'operador'; al
    // normalizar, 'operador' equivale a SUPERVISOR. Por eso el router prioriza
    // el rol canónico de la sesión para preservar TECNICO≠SUPERVISOR.
    const p = principalUtilizacion("u2", "operador");
    for (const perm of Object.values(P)) expect(p.permisos).toContain(perm);
  });

  it("legacy 'lector' (espejo de CONSULTA) ⇒ sólo lectura", () => {
    const p = principalUtilizacion("u5", "lector");
    expect(p.permisos).toContain(P.leer);
    expect(p.permisos).not.toContain(P.lectRegistrar);
    expect(p.permisos).not.toContain(P.tanqRegistrar);
    expect(p.capacidades).toEqual(["leer"]);
  });

  it("TECNICO (canónico de la sesión) ⇒ registrar lecturas y tanqueos, SIN anular/regularizar", () => {
    const p = principalUtilizacion("u3", "TECNICO");
    expect(p.permisos).toContain(P.lectRegistrar);
    expect(p.permisos).toContain(P.tanqRegistrar);
    expect(p.permisos).not.toContain(P.lectAnular);
    expect(p.permisos).not.toContain(P.tanqAnular);
    expect(p.permisos).not.toContain(P.regularizar);
  });
});
