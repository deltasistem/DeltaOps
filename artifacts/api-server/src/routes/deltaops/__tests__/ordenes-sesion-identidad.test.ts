/**
 * DGP-020.2 (revisión R1) · Plumbing de IDENTIDAD CANÓNICA para sesiones.
 *
 * El router de Órdenes construye el `principal` con el ID ESPEJO legacy
 * (`deltaops.users.id`, entero), mientras que la identidad canónica Enterprise
 * (`idn_identities.identity_id`, UUID) vive en `req.session.identityId`. Este
 * test verifica el CONTRATO del plumbing `contextForOrdenes`:
 *
 *  - `principal.id` = ID espejo legacy (para permisos/recibos existentes).
 *  - `metadata.identityId` = identidad CANÓNICA (única que el dominio usa para
 *    atribuir sesiones y verificar asignaciones — nunca `principal.id`).
 *  - Si NO hay identidad canónica en la sesión (login legacy), `metadata` NO la
 *    incluye ⇒ el dominio de sesiones falla CERRADO (probado en module-ordenes).
 *
 * La equivalencia funcional extremo a extremo (técnico asignado con mirror ≠
 * identityId puede abrir/pausar/reanudar/cerrar y las filas guardan el canónico;
 * no-asignado ⇒ 403) está cubierta contra PostgreSQL en
 * `lib/module-ordenes/src/__tests__/sesion.pg.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { contextForOrdenes, principalOrdenes } from "../ordenes-runtime";

const MIRROR_ID = "1001"; // deltaops.users.id (entero como string)
const CANON_ID = "8f1e0c2a-1111-4a2b-9c3d-000000000001"; // idn_identities.identity_id

describe("DGP-020.2 · plumbing identidad canónica (contextForOrdenes)", () => {
  it("separa el ID espejo (principal.id) de la identidad canónica (metadata.identityId)", () => {
    const ctx = contextForOrdenes(MIRROR_ID, "operador", "deltaops", CANON_ID);
    // El principal conserva el ID espejo legacy (permisos/recibos).
    expect(ctx.principal.id).toBe(MIRROR_ID);
    // La identidad canónica se propaga SÓLO por metadata (nunca del body).
    expect(ctx.metadata["identityId"]).toBe(CANON_ID);
    expect(ctx.metadata["tenantId"]).toBe("deltaops");
    // Nunca deben coincidir por accidente en este escenario.
    expect(ctx.metadata["identityId"]).not.toBe(ctx.principal.id);
  });

  it("FALLA CERRADO: sin identidad canónica, metadata NO la incluye", () => {
    const ctx = contextForOrdenes(MIRROR_ID, "operador", "deltaops");
    expect(ctx.principal.id).toBe(MIRROR_ID);
    expect("identityId" in ctx.metadata).toBe(false);
  });

  it("una cadena vacía de identityId tampoco se propaga (fail-closed)", () => {
    const ctx = contextForOrdenes(MIRROR_ID, "operador", "deltaops", "");
    expect("identityId" in ctx.metadata).toBe(false);
  });
});

/**
 * DGP-020.2 (E2E §27/§38) · Regresión del bug de BYPASS de asignación.
 *
 * El colapso legacy asigna el mismo rol de espejo `operador` a SUPERVISOR,
 * PLANIFICADOR y TECNICO. `principalOrdenes` DEBE decidir por el ROL CANÓNICO:
 * sólo TENANT_ADMIN/SUPER_ADMIN y SUPERVISOR obtienen las capacidades
 * administrativas EXISTENTES (`validar-ordenes`/`administrar-ordenes` y el
 * permiso `modulo.ordenes.validar`) que habilitan la excepción §6 al abrir
 * sesión sin asignación. PLANIFICADOR y TECNICO NO deben obtenerlas.
 *
 * `esSupervisorOAdmin` (dominio) considera supervisor a quien tenga
 * `capacidades: *|validar-ordenes|administrar-ordenes` o
 * `permisos: *|modulo.ordenes.admin|modulo.ordenes.validar`. Verificamos aquí que
 * el principal generado NO cruza ese umbral salvo para roles realmente elevados.
 */
describe("DGP-020.2 · RBAC de sesión: bypass de asignación SÓLO para supervisor/admin", () => {
  const CAPS_ADMIN = ["validar-ordenes", "administrar-ordenes"];
  const habilitaBypass = (p: { permisos: readonly string[]; capacidades: readonly string[] }): boolean =>
    p.capacidades.includes("*") ||
    p.capacidades.includes("validar-ordenes") ||
    p.capacidades.includes("administrar-ordenes") ||
    p.permisos.includes("*") ||
    p.permisos.includes("modulo.ordenes.admin") ||
    p.permisos.includes("modulo.ordenes.validar");

  it("TENANT_ADMIN / SUPER_ADMIN: capacidades administrativas ⇒ bypass permitido", () => {
    for (const rol of ["TENANT_ADMIN", "SUPER_ADMIN", "admin", "platform_admin"]) {
      const p = principalOrdenes(MIRROR_ID, rol);
      expect(CAPS_ADMIN.every((c) => p.capacidades.includes(c))).toBe(true);
      expect(habilitaBypass(p)).toBe(true);
    }
  });

  it("SUPERVISOR: capacidad EXISTENTE `validar-ordenes` ⇒ bypass permitido (§6)", () => {
    const p = principalOrdenes(MIRROR_ID, "SUPERVISOR");
    expect(p.capacidades).toContain("validar-ordenes");
    expect(p.permisos).toContain("modulo.ordenes.validar");
    expect(habilitaBypass(p)).toBe(true);
    // Sigue pudiendo operar el ciclo de vida.
    expect(p.permisos).toContain("modulo.ordenes.operar");
  });

  it("PLANIFICADOR: opera pero NO tiene capacidad admin ⇒ SIN bypass (rechazo si no asignado)", () => {
    const p = principalOrdenes(MIRROR_ID, "PLANIFICADOR");
    expect(p.capacidades).not.toContain("validar-ordenes");
    expect(p.capacidades).not.toContain("administrar-ordenes");
    expect(p.permisos).not.toContain("modulo.ordenes.validar");
    expect(p.permisos).not.toContain("modulo.ordenes.admin");
    expect(habilitaBypass(p)).toBe(false);
    // Puede operar (para llegar a la verificación de asignación, no a un 403 de permiso).
    expect(p.permisos).toContain("modulo.ordenes.operar");
  });

  it("TECNICO: opera pero NO tiene capacidad admin ⇒ SIN bypass (debe estar asignado)", () => {
    const p = principalOrdenes(MIRROR_ID, "TECNICO");
    expect(p.capacidades).not.toContain("validar-ordenes");
    expect(p.permisos).not.toContain("modulo.ordenes.validar");
    expect(habilitaBypass(p)).toBe(false);
    expect(p.permisos).toContain("modulo.ordenes.operar");
  });

  it("el rol de espejo legacy `operador` se normaliza a SUPERVISOR (compat) y conserva su bypass", () => {
    // Compat histórica: `deltaops.users.rol = operador` ⇒ canónico SUPERVISOR.
    const p = principalOrdenes(MIRROR_ID, "operador");
    expect(habilitaBypass(p)).toBe(true);
  });

  it("CONSULTA: sólo lectura, sin operar ni bypass", () => {
    const p = principalOrdenes(MIRROR_ID, "CONSULTA");
    expect(p.permisos).not.toContain("modulo.ordenes.operar");
    expect(p.permisos).toContain("modulo.ordenes.read");
    expect(habilitaBypass(p)).toBe(false);
  });
});
