/**
 * DGP-021.1 · Costos — Pruebas de APLICACIÓN (runtime con Fakes, sin PG).
 * Cubre: verificación de OT + derivación del activo (nunca del frontend),
 * identidad canónica fail-closed en OTROS, SIN COSTO ≠ 0 en MATERIAL,
 * idempotencia por opId, snapshot inmutable ante cambio de costo origen,
 * anulación auditable, series por moneda separadas, y el fake string-only que
 * rechaza number.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createExecutionContext, type ExecutionContext, type Principal, type Result } from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  costosModule,
  crearCostosRuntime,
  FakeCostoExactoPort,
  MODULO,
  type CostosRuntime,
} from "..";

const MOD_PERMS = costosModule({
  hechos: null as never, recibos: null as never, identidad: null as never,
  ordenes: null as never, costoExacto: null as never, eventLog: null as never,
}).permissions;
const ALL = [...new Set([...officialServices().flatMap((s) => [...s.permissions]), ...MOD_PERMS])];

const TENANT = "t-app";
const admin: Principal = { id: "admin", rol: "admin", permisos: ALL, capacidades: ["*"] };

function must<T>(r: Result<T, { message: string }>): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("DGP-021.1 · Costos · aplicación (Fakes)", () => {
  let rt: CostosRuntime;
  const ctx = (identityId?: string, p: Principal = admin): ExecutionContext =>
    createExecutionContext({ principal: p, metadata: identityId ? { tenantId: TENANT, identityId } : { tenantId: TENANT } });
  const exec = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.commands.execute(c, name, input);
  const query = (c: ExecutionContext, name: string, input: unknown) => rt.platform.kernel.queries.execute(c, name, input);

  beforeEach(() => {
    rt = crearCostosRuntime();
    const f = rt.fakes!;
    // OT con activo principal, y OT sin activo (administrativa).
    f.ordenes.set(TENANT, { ordenId: "ot1", estado: "ABIERTA", activoPrincipalId: "act-9" });
    f.ordenes.set(TENANT, { ordenId: "ot-admin", estado: "ABIERTA", activoPrincipalId: null });
    f.identidad.registrar(TENANT, "u1", "Ana");
    f.costoExacto.set(TENANT, "art1", [
      { articuloId: "art1", moneda: "COP", metodoValoracion: "PROMEDIO_PONDERADO", costoUnitario: "1500.250000", cantidadAcumulada: "100.000000", actualizadoAt: "2024-01-01T00:00:00.000Z" },
    ]);
  });

  it("MATERIAL: verifica OT, DERIVA activo de la OT y congela el costo exacto", async () => {
    const h = must(await exec(ctx(), `${MODULO}.hecho.materializar-material`, {
      otId: "ot1", articuloId: "art1", cantidad: "2.000000", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;
    expect(h["activoId"]).toBe("act-9"); // derivado, NO del frontend
    expect(h["costoUnitario"]).toBe("1500.250000");
    expect(h["costoTotal"]).toBe("3000.500000");
    expect(h["estado"]).toBe("ACTIVO");
    expect((h["fuente"] as Record<string, unknown>)["metodoValoracion"]).toBe("PROMEDIO_PONDERADO");
  });

  it("MATERIAL: OT inexistente ⇒ 404; SIN COSTO exacto ⇒ rechazo (≠ 0)", async () => {
    const noOt = await exec(ctx(), `${MODULO}.hecho.materializar-material`, { otId: "zzz", articuloId: "art1", cantidad: "1", unidad: "UN", moneda: "COP" });
    expect(noOt.ok).toBe(false);
    const sinCosto = await exec(ctx(), `${MODULO}.hecho.materializar-material`, { otId: "ot1", articuloId: "art-sin", cantidad: "1", unidad: "UN", moneda: "COP" });
    expect(sinCosto.ok).toBe(false);
    // moneda sin costo exacto tampoco materializa
    const otraMoneda = await exec(ctx(), `${MODULO}.hecho.materializar-material`, { otId: "ot1", articuloId: "art1", cantidad: "1", unidad: "UN", moneda: "USD" });
    expect(otraMoneda.ok).toBe(false);
  });

  it("SNAPSHOT INMUTABLE: cambiar el costo origen NO altera el hecho ya materializado", async () => {
    const h = must(await exec(ctx(), `${MODULO}.hecho.materializar-material`, {
      opId: "op-snap", otId: "ot1", articuloId: "art1", cantidad: "1.000000", unidad: "UN", moneda: "COP",
    })) as Record<string, unknown>;
    expect(h["costoUnitario"]).toBe("1500.250000");
    // El costo origen cambia radicalmente...
    rt.fakes!.costoExacto.set(TENANT, "art1", [
      { articuloId: "art1", moneda: "COP", metodoValoracion: "PROMEDIO_PONDERADO", costoUnitario: "9999.990000", cantidadAcumulada: "1.000000", actualizadoAt: "2024-06-01T00:00:00.000Z" },
    ]);
    const det = must(await query(ctx(), `${MODULO}.hecho.detalle`, { costoId: h["costoId"] })) as { hecho: Record<string, unknown> };
    expect(det.hecho["costoUnitario"]).toBe("1500.250000"); // congelado
  });

  it("OTROS: identidad canónica fail-closed (falta identityId ⇒ 403)", async () => {
    const sinId = await exec(ctx(), `${MODULO}.hecho.materializar-otros`, {
      otId: "ot1", concepto: "peaje", cantidad: "1", unidad: "UN", costoUnitario: "500", moneda: "COP",
    });
    expect(sinId.ok).toBe(false);
    const conId = must(await exec(ctx("u1"), `${MODULO}.hecho.materializar-otros`, {
      otId: "ot-admin", concepto: "peaje", cantidad: "2", unidad: "UN", costoUnitario: "500", moneda: "COP",
    })) as Record<string, unknown>;
    expect(conId["identityId"]).toBe("u1");
    expect(conId["activoId"]).toBeNull(); // OT sin activo principal (caso documentado)
    expect(conId["costoTotal"]).toBe("1000.000000");
  });

  it("idempotencia por opId: reejecutar el mismo comando ⇒ un solo hecho", async () => {
    const input = { opId: "dup", otId: "ot1", concepto: "x", cantidad: "1", unidad: "UN", costoUnitario: "10", moneda: "COP" };
    const a = must(await exec(ctx("u1"), `${MODULO}.hecho.materializar-otros`, input)) as Record<string, unknown>;
    expect(a["idempotente"]).toBe(false);
    // Reintento con el MISMO opId ⇒ recibo sellado ⇒ resultado idempotente, sin duplicar.
    const b = must(await exec(ctx("u1"), `${MODULO}.hecho.materializar-otros`, input)) as Record<string, unknown>;
    expect(b["idempotente"]).toBe(true);
    expect(b["costoId"]).toBe(a["costoId"]);
    const lista = must(await query(ctx(), `${MODULO}.hechos`, { otId: "ot1" })) as { hechos: unknown[] };
    expect(lista.hechos.length).toBe(1);
  });

  it("anulación auditable: cambia estado, conserva importes", async () => {
    const h = must(await exec(ctx("u1"), `${MODULO}.hecho.materializar-otros`, {
      otId: "ot1", concepto: "x", cantidad: "1", unidad: "UN", costoUnitario: "10", moneda: "COP",
    })) as Record<string, unknown>;
    const anulado = must(await exec(ctx(), `${MODULO}.hecho.anular`, { costoId: h["costoId"], motivo: "error de captura" })) as Record<string, unknown>;
    expect(anulado["estado"]).toBe("ANULADO");
    expect(anulado["motivoAnulacion"]).toBe("error de captura");
    expect(anulado["costoTotal"]).toBe(h["costoTotal"]);
    // re-anular ⇒ conflicto
    const re = await exec(ctx(), `${MODULO}.hecho.anular`, { costoId: h["costoId"], motivo: "otra" });
    expect(re.ok).toBe(false);
  });

  it("por-moneda: series SEPARADAS, nunca se suman COP+USD", async () => {
    rt.fakes!.costoExacto.set(TENANT, "artU", [
      { articuloId: "artU", moneda: "USD", metodoValoracion: "PROMEDIO_PONDERADO", costoUnitario: "2.000000", cantidadAcumulada: "5.000000", actualizadoAt: "2024-01-01T00:00:00.000Z" },
    ]);
    must(await exec(ctx(), `${MODULO}.hecho.materializar-material`, { otId: "ot1", articuloId: "art1", cantidad: "1", unidad: "UN", moneda: "COP" }));
    must(await exec(ctx(), `${MODULO}.hecho.materializar-material`, { otId: "ot1", articuloId: "artU", cantidad: "1", unidad: "UN", moneda: "USD" }));
    const r = must(await query(ctx(), `${MODULO}.hechos.por-moneda`, { otId: "ot1" })) as { monedas: { moneda: string; hechos: unknown[] }[] };
    const monedas = r.monedas.map((m) => m.moneda).sort();
    expect(monedas).toEqual(["COP", "USD"]);
    expect(r.monedas.every((m) => m.hechos.length === 1)).toBe(true);
  });

  it("el fake de costo exacto RECHAZA number (lección R1)", () => {
    const f = new FakeCostoExactoPort();
    expect(() =>
      // @ts-expect-error prueba de robustez: number nunca debe aceptarse
      f.set(TENANT, "art1", [{ articuloId: "art1", moneda: "COP", metodoValoracion: "X", costoUnitario: 1500.25, cantidadAcumulada: "1.000000", actualizadoAt: "x" }]),
    ).toThrow(TypeError);
  });
});
