/**
 * DGP-021.1 · Costos — Pruebas de DOMINIO PURO.
 * Cubre: precisión decimal string-safe (multiplicación en punto fijo, half-up),
 * rechazo de number/negativos/científica/>6 decimales, construcción del hecho
 * (snapshot congelado + costoTotal derivado) y anulación auditable (append-only).
 */
import { describe, expect, it } from "vitest";
import { aMicros, microsACadena, multiplicar, normalizarImporte } from "../domain/dinero";
import { anular, materializar, type EntradaMaterializar } from "../domain/hecho";

const base = (over: Partial<EntradaMaterializar> = {}): EntradaMaterializar => ({
  costoId: "c1",
  tenantId: "t1",
  tipo: "OTROS",
  origen: { originType: "manual", originId: "concepto-x" },
  otId: "ot1",
  activoId: "a1",
  identityId: "u1",
  opId: "op1",
  cantidad: "3.000000",
  unidad: "UN",
  costoUnitario: "1234.567890",
  moneda: "COP",
  fuente: { concepto: "concepto-x" },
  ocurridoAt: "2024-03-01T00:00:00.000Z",
  registradoAt: "2024-03-02T00:00:00.000Z",
  registradoPor: "admin",
  ...over,
});

describe("DGP-021.1 · dinero string-safe", () => {
  it("aMicros/microsACadena son estables e inversos", () => {
    const m = aMicros("40000");
    expect(m.ok).toBe(true);
    if (m.ok) expect(microsACadena(m.value)).toBe("40000.000000");
  });

  it("RECHAZA number en la frontera (lección R1)", () => {
    // @ts-expect-error prueba de robustez: number nunca debe aceptarse
    const r = aMicros(40000);
    expect(r.ok).toBe(false);
  });

  it("RECHAZA negativos, notación científica y >6 decimales", () => {
    expect(aMicros("-1").ok).toBe(false);
    expect(aMicros("1e3").ok).toBe(false);
    expect(aMicros("1.1234567").ok).toBe(false);
  });

  it("normalizarImporte padea a 6 decimales sin float", () => {
    const r = normalizarImporte("12.5");
    expect(r.ok && r.value).toBe("12.500000");
  });

  it("multiplicar cantidad × unitario es EXACTO (punto fijo)", () => {
    const r = multiplicar("3.000000", "1234.567890");
    expect(r.ok && r.value).toBe("3703.703670");
  });

  it("multiplicar aplica HALF-UP a los 6 decimales de escala", () => {
    // 0.333333 × 1.000001 = 0.333333333333 → half-up a 6 dec = 0.333333
    const r = multiplicar("0.333333", "1.000001");
    expect(r.ok && r.value).toBe("0.333333");
    // 0.500000 × 0.000001 = 0.0000005 → half-up = 0.000001 (redondea arriba)
    const r2 = multiplicar("0.500000", "0.000001");
    expect(r2.ok && r2.value).toBe("0.000001");
  });

  it("DGP-021.2 · cantidad decimal × costo unitario de escala 6 es EXACTO", () => {
    // Caso de la directiva: NO asumir cantidades enteras; escala real (18,6).
    // 10.000000 × 35000.123456 = 350001.234560 (exacto, sin float).
    const r = multiplicar("10.000000", "35000.123456");
    expect(r.ok && r.value).toBe("350001.234560");
  });
});

describe("DGP-021.1 · hecho económico", () => {
  it("materializar congela snapshot y deriva costoTotal", () => {
    const r = materializar(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.estado).toBe("ACTIVO");
    expect(r.value.snapshot.costoTotal).toBe("3703.703670");
    expect(r.value.snapshot.moneda).toBe("COP");
    expect(r.value.anuladoAt).toBeNull();
  });

  it("materializar RECHAZA moneda vacía y origen vacío", () => {
    expect(materializar(base({ moneda: "   " })).ok).toBe(false);
    expect(materializar(base({ origen: { originType: "", originId: "x" } })).ok).toBe(false);
  });

  it("DGP-021.2 · congela trazabilidad de ORIGEN (movimientoId/articuloId)", () => {
    const r = materializar(base({
      tipo: "MATERIAL",
      origen: { originType: "inventario.movimiento", originId: "mov-77" },
      movimientoId: "mov-77",
      articuloId: "art-1",
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.movimientoId).toBe("mov-77");
    expect(r.value.articuloId).toBe("art-1");
    // Sin trazabilidad (OTROS manual): ambos null por defecto.
    const otros = materializar(base());
    expect(otros.ok && otros.value.movimientoId).toBeNull();
    expect(otros.ok && otros.value.articuloId).toBeNull();
  });

  it("DGP-021.2 (R1) · naturaleza por defecto es CARGO; ABONO se distingue en el ledger", () => {
    // Sin naturaleza explícita ⇒ CARGO (consumo/salida = costo).
    const cargo = materializar(base({ tipo: "MATERIAL" }));
    expect(cargo.ok && cargo.value.naturaleza).toBe("CARGO");
    // Devolución ⇒ ABONO: mismo importe NO NEGATIVO, pero naturaleza distinta.
    // El ledger NO representa el crédito con monto negativo: el signo es semántico.
    const abono = materializar(base({ tipo: "MATERIAL", naturaleza: "ABONO" }));
    expect(abono.ok && abono.value.naturaleza).toBe("ABONO");
    if (cargo.ok && abono.ok) {
      // Importes idénticos y no negativos; la ÚNICA diferencia económica es la naturaleza.
      expect(abono.value.snapshot.costoTotal).toBe(cargo.value.snapshot.costoTotal);
      expect(abono.value.snapshot.costoTotal.startsWith("-")).toBe(false);
      expect(abono.value.naturaleza).not.toBe(cargo.value.naturaleza);
    }
  });

  it("DGP-021.2 (R1) · materializar RECHAZA una naturaleza fuera de CARGO|ABONO", () => {
    // @ts-expect-error prueba de robustez: naturaleza inválida debe fallar cerrado
    const r = materializar(base({ naturaleza: "NETO" }));
    expect(r.ok).toBe(false);
  });

  it("anular es auditable y NO toca el snapshot", () => {
    const h = materializar(base());
    if (!h.ok) throw new Error("setup");
    const a = anular(h.value, "auditor", "2024-04-01T00:00:00.000Z", "duplicado");
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.estado).toBe("ANULADO");
    expect(a.value.motivoAnulacion).toBe("duplicado");
    // Snapshot idéntico (inmutable).
    expect(a.value.snapshot).toEqual(h.value.snapshot);
  });

  it("anular exige motivo y no permite re-anular", () => {
    const h = materializar(base());
    if (!h.ok) throw new Error("setup");
    expect(anular(h.value, "auditor", "2024-04-01T00:00:00.000Z", "  ").ok).toBe(false);
    const a = anular(h.value, "auditor", "2024-04-01T00:00:00.000Z", "motivo");
    if (!a.ok) throw new Error("setup");
    expect(anular(a.value, "auditor", "2024-04-02T00:00:00.000Z", "otra vez").ok).toBe(false);
  });
});
