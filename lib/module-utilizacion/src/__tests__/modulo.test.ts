/**
 * DGP-019.1 · Módulo de Utilización — Suite de comportamiento (§20 A–R).
 * Ejercita comandos/consultas/handlers end-to-end con FAKES deterministas
 * (read models CQRS, recibos durables, sincronización con Activos).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ActivosPruebaConflicto,
  ActivosPruebaFaltantes,
  ActivosPruebaTodos,
  crearUtilizacionRuntime,
  MODULO,
  type UtilizacionRuntime,
} from "../index";
import { deltaMedidor, litrosPorHora } from "../domain/calculos";
import { crearLectura, crearTanqueo } from "../domain/value-objects";

const T = "delta-demo";
const A = "activo-1";
const CONSULTA = { id: "u-consulta", rol: "CONSULTA", permisos: [`${MODULO}.leer`], capacidades: [] };
const cmd = (rt: UtilizacionRuntime, ctx: ReturnType<UtilizacionRuntime["ctx"]>, name: string, input: unknown) =>
  rt.platform.kernel.commands.execute(ctx, `${MODULO}.${name}`, input as Record<string, unknown>);
const qry = (rt: UtilizacionRuntime, ctx: ReturnType<UtilizacionRuntime["ctx"]>, name: string, input: unknown) =>
  rt.platform.kernel.queries.execute(ctx, `${MODULO}.${name}`, input as Record<string, unknown>);

let rt: UtilizacionRuntime;
beforeEach(() => {
  rt = crearUtilizacionRuntime();
});

describe("A · Cálculos puros ('sin datos' ≠ 0)", () => {
  it("delta no positivo ⇒ sin-datos, no 0", () => {
    expect(deltaMedidor(undefined, 5).tipo).toBe("sin-datos");
    expect(deltaMedidor(5, 5).tipo).toBe("sin-datos");
    expect(deltaMedidor(5, 10)).toEqual({ tipo: "valor", valor: 5 });
  });
  it("consumo sin datos no devuelve 0", () => {
    expect(litrosPorHora(null, null).tipo).toBe("sin-datos");
  });
});

describe("B · VOs de dominio", () => {
  it("crearLectura valida tipo/valor/unidad canónica", () => {
    const bad = crearLectura({ id: "x", tenantId: T, activoId: A, tipoMedidor: "horometro", valor: -1, fechaHora: new Date(0).toISOString(), identityId: "u", origen: "manual", createdAt: new Date(0).toISOString() });
    expect(bad.ok).toBe(false);
  });
  it("crearTanqueo exige litros > 0 y combustible", () => {
    const bad = crearTanqueo({ id: "x", tenantId: T, activoId: A, fechaHora: new Date(0).toISOString(), litros: 0, tipoCombustible: "diesel", identityId: "u", createdAt: new Date(0).toISOString() });
    expect(bad.ok).toBe(false);
  });
});

describe("C · Registrar lectura + read model CQRS", () => {
  it("registra y la sirve por detalle/listado desde read model", async () => {
    const ctx = rt.ctx(T);
    const r = await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    expect(r.ok).toBe(true);
    const id = (r as { value: { id: string } }).value.id;
    await rt.drenar();
    const det = await qry(rt, ctx, "lectura-detalle", { id });
    expect(det.ok).toBe(true);
    const list = await qry(rt, ctx, "lecturas", { activoId: A });
    expect((list as { value: unknown[] }).value.length).toBe(1);
  });
});

describe("D · Consistencia: lectura decreciente ⇒ inconsistente, NO propaga", () => {
  it("marca inconsistente y no sincroniza a Activos", async () => {
    const activos = new ActivosPruebaTodos();
    rt = crearUtilizacionRuntime({ activos });
    const ctx = rt.ctx(T);
    await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    await rt.drenar();
    const menor = await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 50, fechaHora: "2024-01-02T08:00:00Z" });
    expect((menor as { value: { inconsistente: boolean } }).value.inconsistente).toBe(true);
    await rt.drenar();
    // El activo mantiene el valor de la primera lectura (la inconsistente no propaga).
    expect(activos.medicion(A, "horometro")?.valor).toBe(100);
    // La lectura inconsistente sigue VISIBLE en queries.
    const list = await qry(rt, ctx, "lecturas", { activoId: A });
    expect((list as { value: unknown[] }).value.length).toBe(2);
  });
});

describe("E · Sincronización con Activos (gana la más reciente)", () => {
  it("propaga el último valor válido y confirma", async () => {
    const activos = new ActivosPruebaTodos();
    rt = crearUtilizacionRuntime({ activos });
    const ctx = rt.ctx(T);
    const r = await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "odometro", valor: 500, fechaHora: "2024-01-01T08:00:00Z" });
    const id = (r as { value: { id: string } }).value.id;
    await rt.drenar();
    expect(activos.medicion(A, "odometro")?.valor).toBe(500);
    const det = await qry(rt, ctx, "lectura-detalle", { id });
    expect((det as { value: { sincronizacionActivo: string } }).value.sincronizacionActivo).toBe("confirmada");
  });
});

describe("F · Sincronización FALLIDA (ruidosa) ante 409 persistente", () => {
  it("agota reintentos ⇒ estado fallida + evento", async () => {
    rt = crearUtilizacionRuntime({ activos: new ActivosPruebaConflicto() });
    const ctx = rt.ctx(T);
    const r = await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 10, fechaHora: "2024-01-01T08:00:00Z" });
    const id = (r as { value: { id: string } }).value.id;
    await rt.drenar();
    const det = await qry(rt, ctx, "lectura-detalle", { id });
    expect((det as { value: { sincronizacionActivo: string } }).value.sincronizacionActivo).toBe("fallida");
    const eventos = await qry(rt, rt.ctx(T), "eventos", {});
    const tipos = (eventos as { value: { tipo: string }[] }).value.map((e) => e.tipo);
    expect(tipos).toContain(`${MODULO}.sincronizacion-fallida`);
  });
});

describe("G · Activo inexistente ⇒ fallo seguro (not found)", () => {
  it("rechaza la lectura si el activo no existe", async () => {
    rt = crearUtilizacionRuntime({ activos: new ActivosPruebaFaltantes() });
    const ctx = rt.ctx(T);
    const r = await cmd(rt, ctx, "registrar-lectura", { activoId: "fantasma", tipoMedidor: "horometro", valor: 10, fechaHora: "2024-01-01T08:00:00Z" });
    expect(r.ok).toBe(false);
    expect((r as { error: { code: string } }).error.code.startsWith("KRN-NF")).toBe(true);
  });
});

describe("H · Reinicio de medidor (regularización auditada)", () => {
  it("exige capacidad y motivo, ancla nuevo tramo válido menor", async () => {
    rt = crearUtilizacionRuntime({ activos: new ActivosPruebaTodos() });
    const ctx = rt.ctx(T);
    await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 1000, fechaHora: "2024-01-01T08:00:00Z" });
    await rt.drenar();
    const rein = await cmd(rt, ctx, "reinicio-medidor", { activoId: A, tipoMedidor: "horometro", valorNuevo: 0, fechaHora: "2024-01-05T08:00:00Z", motivo: "cambio de motor" });
    expect(rein.ok).toBe(true);
    await rt.drenar();
    const ultima = await qry(rt, ctx, "ultima-lectura", { activoId: A, tipoMedidor: "horometro" });
    expect((ultima as { value: { valor: number } }).value.valor).toBe(0);
  });
  it("sin motivo la policy rechaza", async () => {
    const ctx = rt.ctx(T);
    const rein = await cmd(rt, ctx, "reinicio-medidor", { activoId: A, tipoMedidor: "horometro", valorNuevo: 0, fechaHora: "2024-01-05T08:00:00Z", motivo: "   " });
    expect(rein.ok).toBe(false);
  });
});

describe("I · Anulación no destructiva de lectura", () => {
  it("anula y conserva el hecho histórico", async () => {
    const ctx = rt.ctx(T);
    const r = await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    const id = (r as { value: { id: string } }).value.id;
    await rt.drenar();
    const an = await cmd(rt, ctx, "anular-lectura", { id, motivo: "error de captura" });
    expect(an.ok).toBe(true);
    await rt.drenar();
    const det = await qry(rt, ctx, "lectura-detalle", { id });
    expect((det as { value: { estado: string } }).value.estado).toBe("anulada");
  });
});

describe("J · Tanqueos con catálogo canónico", () => {
  it("registra con combustible canónico y lo lista", async () => {
    const ctx = rt.ctx(T);
    const r = await cmd(rt, ctx, "registrar-tanqueo", { activoId: A, fechaHora: "2024-01-01T08:00:00Z", litros: 50, tipoCombustible: "diesel", precioUnitario: 2, moneda: "USD" });
    expect(r.ok).toBe(true);
    await rt.drenar();
    const list = await qry(rt, ctx, "tanqueos", { activoId: A });
    expect((list as { value: { costoTotal: number }[] }).value[0]!.costoTotal).toBe(100);
  });
  it("rechaza combustible no canónico", async () => {
    const ctx = rt.ctx(T);
    const r = await cmd(rt, ctx, "registrar-tanqueo", { activoId: A, fechaHora: "2024-01-01T08:00:00Z", litros: 50, tipoCombustible: "plutonio" });
    expect(r.ok).toBe(false);
  });
});

describe("K · Resumen operacional (cálculos puros)", () => {
  it("calcula deltas y consumo; sin datos no es 0", async () => {
    const ctx = rt.ctx(T);
    await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 150, fechaHora: "2024-01-10T08:00:00Z" });
    await cmd(rt, ctx, "registrar-tanqueo", { activoId: A, fechaHora: "2024-01-05T08:00:00Z", litros: 100, tipoCombustible: "diesel" });
    await rt.drenar();
    const res = await qry(rt, ctx, "resumen", { activoId: A });
    const v = (res as { value: Record<string, { tipo: string; valor?: number }> }).value;
    expect(v["deltaHorometro"]).toEqual({ tipo: "valor", valor: 50 });
    expect(v["litrosPorHora"]).toEqual({ tipo: "valor", valor: 2 });
    expect(v["deltaOdometro"]!.tipo).toBe("sin-datos");
    expect(v["costoPorHora"]!.tipo).toBe("sin-datos");
  });
});

describe("L · Idempotencia por opId (recibo)", () => {
  it("repetir el mismo opId no duplica la lectura", async () => {
    const ctx = rt.ctx(T);
    const input = { opId: "op-123", activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z", id: "11111111-1111-4111-8111-111111111111" };
    await cmd(rt, ctx, "registrar-lectura", input);
    const dup = await cmd(rt, ctx, "registrar-lectura", input);
    expect((dup as { value: { idempotente?: boolean } }).value.idempotente).toBe(true);
    await rt.drenar();
    const list = await qry(rt, ctx, "lecturas", { activoId: A });
    expect((list as { value: unknown[] }).value.length).toBe(1);
  });
});

describe("M · Sincronización offline (cola con claim durable)", () => {
  it("aplica una operación y su repetición es idempotente", async () => {
    const ctx = rt.ctx(T);
    const op = { opId: "sync-1", comando: "registrar-lectura", input: { id: "22222222-2222-4222-8222-222222222222", activoId: A, tipoMedidor: "horometro", valor: 200, fechaHora: "2024-02-01T08:00:00Z" } };
    const r1 = await rt.sincronizar(ctx, [op]);
    expect(r1.aplicadas).toBe(1);
    const r2 = await rt.sincronizar(ctx, [op]);
    expect(r2.idempotentes).toBe(1);
  });
  it("operación de creación sin id de cliente ⇒ rechazada", async () => {
    const ctx = rt.ctx(T);
    const r = await rt.sincronizar(ctx, [{ opId: "sync-2", comando: "registrar-tanqueo", input: { activoId: A, fechaHora: "2024-02-01T08:00:00Z", litros: 10, tipoCombustible: "diesel" } }]);
    expect(r.rechazadas).toBe(1);
  });
});

describe("N · RBAC — CONSULTA sólo lee (no escribe)", () => {
  it("CONSULTA puede leer pero no registrar", async () => {
    const ctxSys = rt.ctx(T);
    await cmd(rt, ctxSys, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    await rt.drenar();
    const ctxC = rt.ctx(T, CONSULTA);
    const list = await qry(rt, ctxC, "lecturas", { activoId: A });
    expect(list.ok).toBe(true);
    const w = await cmd(rt, ctxC, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 200, fechaHora: "2024-01-02T08:00:00Z" });
    expect(w.ok).toBe(false);
    expect((w as { error: { code: string } }).error.code.startsWith("KRN-AUTH")).toBe(true);
  });
});

describe("O · Tenant fail-closed", () => {
  it("sin tenant la escritura falla", async () => {
    const noTenant = rt.platform.kernel.commands.execute(
      { principal: { id: "u", rol: "TENANT_ADMIN", permisos: ["*"], capacidades: ["*"] }, correlationId: "c", metadata: {} } as never,
      `${MODULO}.registrar-lectura`,
      { activoId: A, tipoMedidor: "horometro", valor: 1, fechaHora: "2024-01-01T08:00:00Z" },
    );
    expect((await noTenant).ok).toBe(false);
  });
});

describe("P · Reproyección (replay del event log)", () => {
  it("reconstruye read models desde la bitácora durable", async () => {
    const ctx = rt.ctx(T);
    await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    await cmd(rt, ctx, "registrar-tanqueo", { activoId: A, fechaHora: "2024-01-02T08:00:00Z", litros: 10, tipoCombustible: "diesel" });
    await rt.drenar();
    const r = await cmd(rt, ctx, "reproyectar", {});
    expect(r.ok).toBe(true);
    expect((r as { value: { aplicados: number } }).value.aplicados).toBeGreaterThan(0);
  });
});

describe("Q · Consola técnica (outbox del módulo)", () => {
  it("reporta actividad del outbox del módulo", async () => {
    const ctx = rt.ctx(T);
    await cmd(rt, ctx, "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    const c = await qry(rt, ctx, "consola", {});
    expect(c.ok).toBe(true);
    expect((c as { value: { tablasRLS: string[] } }).value.tablasRLS).toContain("utl_lecturas");
  });
});

describe("R · Aislamiento por tenant en read models", () => {
  it("un tenant no ve lecturas de otro", async () => {
    await cmd(rt, rt.ctx("tenant-a"), "registrar-lectura", { activoId: A, tipoMedidor: "horometro", valor: 100, fechaHora: "2024-01-01T08:00:00Z" });
    await rt.drenar();
    const otro = await qry(rt, rt.ctx("tenant-b"), "lecturas", { activoId: A });
    expect((otro as { value: unknown[] }).value.length).toBe(0);
  });
});
