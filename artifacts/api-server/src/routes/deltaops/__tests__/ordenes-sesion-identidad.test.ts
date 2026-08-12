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
import { contextForOrdenes } from "../ordenes-runtime";

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
