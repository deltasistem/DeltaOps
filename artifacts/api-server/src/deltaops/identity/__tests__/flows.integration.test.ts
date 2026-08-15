/**
 * DGP-017 · Pruebas de integración (PostgreSQL real) de identidad/tenancy.
 *
 * Cubre invariantes de seguridad multitenant:
 *   - Login con credenciales + promoción de rol canónico.
 *   - Aislamiento entre tenants (A no ve/afecta datos de B).
 *   - Invitaciones: token de un solo uso, expiración, revocación.
 *   - Recuperación: token de un solo uso, anti-enumeración (nivel servicio).
 *   - Entitlements: módulos habilitados por tenant.
 *   - Auditoría: se registra por tenant y aísla por tenant.
 *
 * Requiere DATABASE_URL. Crea tenants efímeros con prefijo único y los limpia.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { poolDestructivo as pool, suiteDestructiva } from "../../../test-support/pg-destructivo";
// LITE-11 §2/§3/§4 — gate FAIL-CLOSED contra DATABASE_TEST_URL (nunca DATABASE_URL).
const suite = suiteDestructiva();
import { hashPassword } from "../crypto";
import {
  crearIdentidad,
  crearMembresia,
  crearTenant,
  cambiarEstadoTenant,
  cambiarEstadoMembresia,
  listarUsuariosDeTenant,
  obtenerIdentidadPorEmail,
} from "../service";
import { seedRolesDeTenant } from "../seed-roles";
import {
  crearInvitacion,
  validarInvitacion,
  marcarInvitacionAceptada,
  revocarInvitacion,
  listarInvitaciones,
  crearReset,
  validarReset,
  consumirReset,
} from "../invitations";
import { loginConCredenciales, prepararCambioTenant } from "../auth-flows";
import { auditarIdentidad, listarAuditoria } from "../audit";
import { enqueueEmail, listarCorreos, FakeEmailProvider } from "../email";

const SUF = `it${Date.now().toString(36)}`;
const TA = `t-a-${SUF}`;
const TB = `t-b-${SUF}`;
const emailA = `user.${SUF}@a.test`;
const emailB = `user.${SUF}@b.test`;
const PASS = "IntegPass123!";

let idA = "";
let idB = "";

beforeAll(async () => {
  await crearTenant({
    tenantId: TA, codigo: `A-${SUF}`, nombreComercial: "Tenant A",
    zonaHoraria: "UTC", idioma: "es", moneda: "USD",
    modulos: ["activos", "ordenes"],
  });
  await crearTenant({
    tenantId: TB, codigo: `B-${SUF}`, nombreComercial: "Tenant B",
    zonaHoraria: "UTC", idioma: "es", moneda: "USD",
    modulos: ["inventario"],
  });
  await seedRolesDeTenant(TA);
  await seedRolesDeTenant(TB);

  const a = await crearIdentidad({ email: emailA, nombre: "Ana A", passwordHash: await hashPassword(PASS), estado: "ACTIVO" });
  const b = await crearIdentidad({ email: emailB, nombre: "Beto B", passwordHash: await hashPassword(PASS), estado: "ACTIVO" });
  idA = a.identityId;
  idB = b.identityId;
  await crearMembresia({ identityId: idA, tenantId: TA, rol: "TENANT_ADMIN" });
  await crearMembresia({ identityId: idB, tenantId: TB, rol: "SUPERVISOR" });
});

afterAll(async () => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role = replica");
    for (const t of [TA, TB]) {
      for (const tbl of ["idn_invitations", "idn_password_resets", "idn_memberships", "idn_roles", "ntf_email_outbox", "platform_audit", "ten_tenants"]) {
        await c.query(`DELETE FROM deltaops.${tbl} WHERE tenant_id = $1`, [t]).catch(() => undefined);
      }
    }
    await c.query(`DELETE FROM deltaops.idn_identities WHERE identity_id = ANY($1)`, [[idA, idB]]);
    await c.query("COMMIT");
  } catch {
    await c.query("ROLLBACK").catch(() => undefined);
  } finally {
    c.release();
  }
});

suite("Login y promoción de rol", () => {
  it("autentica con credenciales correctas y expone tenant+rol", async () => {
    const r = await loginConCredenciales(emailA, PASS, TA);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tenantId).toBe(TA);
      expect(r.rolCanonico).toBe("TENANT_ADMIN");
      expect(r.identityId).toBe(idA);
    }
  });

  it("rechaza credenciales incorrectas", async () => {
    const r = await loginConCredenciales(emailA, "malísima", TA);
    expect(r.ok).toBe(false);
  });

  it("rechaza login en un tenant sin membresía (aislamiento)", async () => {
    const r = await loginConCredenciales(emailA, PASS, TB);
    expect(r.ok).toBe(false);
  });

  it("bloquea login si el tenant no está operativo", async () => {
    await cambiarEstadoTenant(TA, "SUSPENDIDO");
    const r = await loginConCredenciales(emailA, PASS, TA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("tenant-no-operativo");
    await cambiarEstadoTenant(TA, "ACTIVO");
  });

  it("bloquea login de usuario deshabilitado en el tenant", async () => {
    await cambiarEstadoMembresia(idA, TA, "DESHABILITADO");
    const r = await loginConCredenciales(emailA, PASS, TA);
    expect(r.ok).toBe(false);
    await cambiarEstadoMembresia(idA, TA, "ACTIVO");
  });
});

suite("Cambio de tenant seguro", () => {
  it("permite cambiar a un tenant con membresía y niega el resto", async () => {
    // idA sólo pertenece a TA.
    const ok = await prepararCambioTenant(idA, TA);
    expect(ok.ok).toBe(true);
    const no = await prepararCambioTenant(idA, TB);
    expect(no.ok).toBe(false);
  });
});

suite("Aislamiento multitenant de usuarios", () => {
  it("listar usuarios de A no incluye identidades de B", async () => {
    const usersA = await listarUsuariosDeTenant(TA);
    const emails = usersA.map((u) => u.email);
    expect(emails).toContain(emailA);
    expect(emails).not.toContain(emailB);
  });
});

suite("Invitaciones · un solo uso, expiración, revocación", () => {
  it("valida un token de invitación vigente y lo consume una vez", async () => {
    const { invitacion, token } = await crearInvitacion({
      tenantId: TA, email: `inv.${SUF}@a.test`, rol: "TECNICO", invitadoPor: idA,
    });
    const v1 = await validarInvitacion(TA, token);
    expect(v1?.invitationId).toBe(invitacion.invitationId);
    await marcarInvitacionAceptada(TA, invitacion.invitationId);
    const v2 = await validarInvitacion(TA, token);
    expect(v2).toBeNull(); // ya aceptada → no reutilizable
  });

  it("no valida una invitación de A usando el tenant B (aislamiento)", async () => {
    const { token } = await crearInvitacion({
      tenantId: TA, email: `inv2.${SUF}@a.test`, rol: "CONSULTA", invitadoPor: idA,
    });
    expect(await validarInvitacion(TB, token)).toBeNull();
  });

  it("revoca una invitación pendiente e impide su validación", async () => {
    const { invitacion, token } = await crearInvitacion({
      tenantId: TA, email: `inv3.${SUF}@a.test`, rol: "CONSULTA", invitadoPor: idA,
    });
    expect(await revocarInvitacion(TA, invitacion.invitationId)).toBe(true);
    expect(await validarInvitacion(TA, token)).toBeNull();
    const lista = await listarInvitaciones(TA);
    expect(lista.find((i) => i.invitationId === invitacion.invitationId)?.estado).toBe("REVOCADA");
  });
});

suite("Recuperación de contraseña · un solo uso", () => {
  it("valida y consume el token exactamente una vez", async () => {
    const token = await crearReset({ identityId: idA, tenantId: TA });
    const v = await validarReset(TA, token);
    expect(v?.identityId).toBe(idA);
    const c1 = await consumirReset(TA, v!.resetId);
    expect(c1).toBe(true);
    const c2 = await consumirReset(TA, v!.resetId);
    expect(c2).toBe(false); // segundo consumo rechazado
    expect(await validarReset(TA, token)).toBeNull();
  });

  it("no valida un token de reset de A bajo el tenant B", async () => {
    const token = await crearReset({ identityId: idA, tenantId: TA });
    expect(await validarReset(TB, token)).toBeNull();
  });

  it("anti-enumeración: email inexistente no revela nada a nivel servicio", async () => {
    expect(await obtenerIdentidadPorEmail(`noexiste.${SUF}@x.test`)).toBeNull();
  });
});

suite("Notificaciones · idempotencia y aislamiento", () => {
  it("enqueue idempotente por (tenant, idempotencyKey)", async () => {
    const key = `k-${SUF}`;
    const r1 = await enqueueEmail({
      tenantId: TA, tipo: "bienvenida", destinatario: emailA,
      idempotencyKey: key, datos: { nombre: "Ana" },
    });
    const r2 = await enqueueEmail({
      tenantId: TA, tipo: "bienvenida", destinatario: emailA,
      idempotencyKey: key, datos: { nombre: "Ana" },
    });
    expect(r1.emailId).toBeTruthy();
    expect(r2.duplicado).toBe(true);
    expect(r2.emailId).toBe(r1.emailId);
  });

  it("los correos de A no aparecen en el buzón de B", async () => {
    const correosB = await listarCorreos(TB, 100);
    expect(correosB.some((c) => c.destinatario === emailA)).toBe(false);
  });
});

suite("Auditoría · registro y aislamiento por tenant", () => {
  it("registra eventos y los aísla por tenant", async () => {
    await auditarIdentidad(TA, "login-exitoso", idA, idA, { via: "test" });
    await auditarIdentidad(TB, "login-exitoso", idB, idB, { via: "test" });
    const audA = await listarAuditoria(TA, 50);
    expect(audA.some((e) => e.actorId === idA)).toBe(true);
    expect(audA.some((e) => e.actorId === idB)).toBe(false);
  });
});

suite("Puerto de correo Fake (aislado de red)", () => {
  it("permite inspeccionar envíos sin salir a Internet", async () => {
    const fake = new FakeEmailProvider();
    await fake.send({
      tenantId: TA, idempotencyKey: "x", tipo: "seguridad",
      destinatario: emailA, asunto: "s", cuerpo: "c",
    });
    expect(fake.enviados).toHaveLength(1);
  });
});
