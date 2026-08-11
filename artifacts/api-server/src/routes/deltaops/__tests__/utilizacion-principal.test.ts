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
import {
  ACTOR_SERVICIO_SYNC,
  PERMISOS_SERVICIO_SYNC,
  contextForActivosServicioSync,
  principalUtilizacion,
} from "../utilizacion-runtime";

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

/**
 * Hallazgo CRÍTICO de arquitectura: la propagación a Activos NO debe fabricar el
 * rol `admin` del usuario. La sincronización usa un PRINCIPAL DE SERVICIO de
 * mínimo privilegio (`system:utilizacion-sync`) autorizado EXCLUSIVAMENTE para
 * `modulo.activos.operar` (el único permiso que exigen actualizar-horometro y
 * actualizar-odometro), con el actor originador como METADATO de auditoría.
 * NINGÚN rol de Utilización (ni siquiera TENANT_ADMIN) concede permisos de
 * Activos: un técnico jamás puede invocar los comandos de Activos directamente.
 */
describe("API Server · principal de SERVICIO de sincronización (sin escalada de privilegios)", () => {
  it("el principal de servicio tiene EXACTAMENTE modulo.activos.operar (mínimo privilegio)", () => {
    const ctx = contextForActivosServicioSync("delta-demo", "tecnico-originador");
    expect(ctx.principal.id).toBe(ACTOR_SERVICIO_SYNC);
    expect(ctx.principal.rol).toBe("system");
    expect([...ctx.principal.permisos]).toEqual([...PERMISOS_SERVICIO_SYNC]);
    expect([...ctx.principal.permisos]).toEqual(["modulo.activos.operar"]);
  });

  it("el actor originador viaja como METADATO de auditoría, no como principal", () => {
    const ctx = contextForActivosServicioSync("delta-demo", "u-tecnico-99");
    // Atribución: el efecto es de la sincronización de Utilización, con
    // trazabilidad al usuario originador (metadato), NUNCA como identidad activa.
    expect(ctx.principal.id).not.toBe("u-tecnico-99");
    expect(ctx.metadata["originadorActorId"]).toBe("u-tecnico-99");
    expect(ctx.metadata["origen"]).toBe(MODULO);
    expect(ctx.metadata["motivo"]).toBe("sincronizacion-utilizacion-activos");
  });

  it("NINGÚN rol de Utilización otorga permisos de Activos (no hay puente de escalada)", () => {
    for (const rol of ["TENANT_ADMIN", "SUPERVISOR", "TECNICO", "PLANIFICADOR", "CONSULTA"]) {
      const p = principalUtilizacion("u", rol);
      expect(p.permisos).not.toContain("modulo.activos.operar");
      expect(p.permisos).not.toContain("modulo.activos.write");
      expect(p.permisos).not.toContain("modulo.activos.admin");
    }
  });
});
