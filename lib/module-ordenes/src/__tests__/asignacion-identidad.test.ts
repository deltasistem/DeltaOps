/**
 * DGP-020.1 · Contrato de identidad en asignación de OTs (resuelve G-1).
 *
 * Verifica que una asignación de RECURSO HUMANO (tipo='persona') SÓLO se admite
 * con una identidad canónica válida (existe, identidad+membresía ACTIVAS y del
 * MISMO tenant de la OT, derivado del contexto autenticado). Cubre la matriz de
 * seguridad §20/§21: identidad válida/inexistente/inactiva/otro-tenant, tipos
 * no-persona, persistencia+lectura de identityId (read model), cambio de
 * asignación auditable y aislamiento cross-tenant del selector de elegibles.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, MemoryLogger, type ExecutionContext, type Principal } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import { crearOrdenesRuntime, FakeIdentidad, FakePlantillas, MODULO, MODULO_WORKFLOW, type OrdenesRuntime } from "..";

const ALL = [
  ...new Set(officialServices().flatMap((s) => [...s.permissions])),
  `${MODULO}.read`, `${MODULO}.write`, `${MODULO}.operar`, `${MODULO}.validar`, `${MODULO}.admin`,
  `${MODULO_WORKFLOW}.read`, `${MODULO_WORKFLOW}.operar`, `${MODULO_WORKFLOW}.disenar`,
];
const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL, capacidades: ["*"] };
const LECTOR: Principal = { id: "lector-1", rol: "lector", permisos: [`${MODULO}.read`], capacidades: [] };

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";

let rt: OrdenesRuntime;
let identidad: FakeIdentidad;

beforeEach(() => {
  const plantillas = new FakePlantillas();
  identidad = new FakeIdentidad()
    // Identidades del tenant A
    .registrar({ identityId: "id-carlos", tenantId: TENANT_A, nombre: "Carlos Pacheco", email: "carlos@a.cl", rol: "TECNICO" })
    .registrar({ identityId: "id-inactivo", tenantId: TENANT_A, nombre: "Ex Técnico", email: "ex@a.cl", estadoMembresia: "DESHABILITADO" })
    .registrar({ identityId: "id-suspendido", tenantId: TENANT_A, nombre: "Susana", email: "sus@a.cl", estado: "DESHABILITADO" })
    // Identidad del tenant B (NO debe ser asignable desde A)
    .registrar({ identityId: "id-bruno", tenantId: TENANT_B, nombre: "Bruno B", email: "bruno@b.cl", rol: "TECNICO" });
  rt = crearOrdenesRuntime({ logger: new MemoryLogger(), plantillas, identidad });
});

const ctxOf = (t: string, p: Principal = ADMIN) => createExecutionContext({ principal: p, metadata: { tenantId: t } });
const exec = (ctx: ExecutionContext, cmd: string, input: unknown) => rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (ctx: ExecutionContext, q: string, input: unknown) => rt.platform.kernel.queries.execute(ctx, q, input);
const drenar = () => rt.platform.kernel.outboxProcessor.processPending();

async function crear(ctx: ExecutionContext, extra: Record<string, unknown> = {}) {
  const r = await exec(ctx, `${MODULO}.crear`, { titulo: "OT", tipo: "correctiva", ...extra });
  if (!r.ok) throw new Error(r.error.message);
  return r.value as { id: string; codigo: string };
}

const asignar = (ctx: ExecutionContext, input: Record<string, unknown>) =>
  exec(ctx, `${MODULO}.asignar-recurso-humano`, input);

describe("DGP-020.1 · Validación de identidad al asignar (persona)", () => {
  it("1) identidad válida (activa, mismo tenant) ⇒ OK y persiste identityId", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    const r = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-carlos", rol: "responsable" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { asignadoIdentityId: string }).asignadoIdentityId).toBe("id-carlos");
    await drenar();
    // Lectura por read model expone identityId + nombre/email de presentación.
    const asg = await query(ctx, `${MODULO}.asignaciones`, { ordenId: a.id });
    expect(asg.ok).toBe(true);
    if (asg.ok) {
      const rows = (asg.value as { asignaciones: Array<Record<string, unknown>> }).asignaciones;
      const persona = rows.find((x) => x["tipo"] === "persona")!;
      expect(persona["asignadoIdentityId"]).toBe("id-carlos");
      expect(persona["asignadoNombre"]).toBe("Carlos Pacheco");
      expect(persona["asignadoEmail"]).toBe("carlos@a.cl");
    }
  });

  it("2) identidad inexistente ⇒ rechazo de validación", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    const r = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "no-existe" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toContain("KRN-VAL");
  });

  it("3) identidad con membresía inactiva ⇒ rechazo", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    const r = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-inactivo" });
    expect(r.ok).toBe(false);
  });

  it("3b) identidad global deshabilitada ⇒ rechazo", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    const r = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-suspendido" });
    expect(r.ok).toBe(false);
  });

  it("4) TENANT A no puede asignar identidad de TENANT B (aislamiento) ⇒ rechazo", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    const r = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-bruno" });
    expect(r.ok).toBe(false);
  });

  it("4b) la MISMA identidad SÍ es asignable en su propio tenant (B)", async () => {
    const ctx = ctxOf(TENANT_B);
    const a = await crear(ctx);
    await drenar();
    const r = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-bruno" });
    expect(r.ok).toBe(true);
  });

  it("5) usuario sin capacidad (lector) ⇒ rechazo de autorización", async () => {
    const ctxAdmin = ctxOf(TENANT_A);
    const a = await crear(ctxAdmin);
    await drenar();
    const r = await asignar(ctxOf(TENANT_A, LECTOR), { ordenId: a.id, tipo: "persona", asignadoId: "id-carlos" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toContain("KRN-AUTH");
  });

  it("7) cambio de asignación es AUDITABLE: historial append-only (no destruye)", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    // Identidad adicional en A para el cambio.
    identidad.registrar({ identityId: "id-diana", tenantId: TENANT_A, nombre: "Diana D", email: "diana@a.cl" });
    const r1 = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-carlos", rol: "responsable", reemplazaVigentes: true });
    expect(r1.ok).toBe(true);
    const r2 = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-diana", rol: "responsable", reemplazaVigentes: true });
    expect(r2.ok).toBe(true);
    await drenar();
    const asg = await query(ctx, `${MODULO}.asignaciones`, { ordenId: a.id });
    expect(asg.ok).toBe(true);
    if (asg.ok) {
      const rows = (asg.value as { asignaciones: Array<Record<string, unknown>> }).asignaciones;
      // Ambas asignaciones conservadas (append-only): identidad anterior y nueva.
      const ids = rows.map((x) => x["asignadoIdentityId"]);
      expect(ids).toContain("id-carlos");
      expect(ids).toContain("id-diana");
    }
  });

  it("tipos NO-persona (cuadrilla) NO se validan contra Identidad; identityId = null", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    const r = await asignar(ctx, { ordenId: a.id, tipo: "cuadrilla", asignadoId: "cuad-7" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as { asignadoIdentityId: string | null }).asignadoIdentityId).toBeNull();
  });

  it("idempotencia por opId en asignación de persona", async () => {
    const ctx = ctxOf(TENANT_A);
    const a = await crear(ctx);
    await drenar();
    const op = "op-asig-1";
    const r1 = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-carlos", opId: op });
    expect(r1.ok).toBe(true);
    const r2 = await asignar(ctx, { ordenId: a.id, tipo: "persona", asignadoId: "id-carlos", opId: op });
    expect(r2.ok && (r2.value as { idempotente: boolean }).idempotente).toBe(true);
  });
});

describe("DGP-020.1 · Selector de identidades elegibles (tenant-scoped)", () => {
  it("lista sólo identidades del tenant del contexto (A no ve a B)", async () => {
    const r = await query(ctxOf(TENANT_A), `${MODULO}.identidades-elegibles`, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ids = (r.value as { identidades: Array<{ identityId: string }> }).identidades.map((x) => x.identityId);
      expect(ids).toContain("id-carlos");
      expect(ids).not.toContain("id-bruno");
    }
  });

  it("el tenant B sólo ve sus identidades", async () => {
    const r = await query(ctxOf(TENANT_B), `${MODULO}.identidades-elegibles`, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ids = (r.value as { identidades: Array<{ identityId: string }> }).identidades.map((x) => x.identityId);
      expect(ids).toEqual(["id-bruno"]);
    }
  });
});
