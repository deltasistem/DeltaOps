/** DGP-011.1 · Pruebas de OBJETOS DE VALOR: validación, inmutabilidad, invariantes. */
import { describe, expect, it } from "vitest";
import {
  crearCantidad,
  crearCodigoInventario,
  crearCostoPromedio,
  crearFechaVencimiento,
  crearLeadTime,
  crearLote,
  crearPoliticaReposicion,
  crearProveedorPreferido,
  crearSerie,
  crearSku,
  crearUbicacionFisica,
  crearUnidadMedida,
  estaVencida,
  recalcularPromedio,
  restarCantidad,
  sumarCantidad,
} from "..";

describe("VO · SKU", () => {
  it("normaliza a mayúsculas y valida caracteres", () => {
    const r = crearSku({ valor: "abc-123/x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.valor).toBe("ABC-123/X");
  });
  it("rechaza caracteres inválidos", () => {
    expect(crearSku({ valor: "a b" }).ok).toBe(false);
    expect(crearSku({ valor: "" }).ok).toBe(false);
  });
  it("congela el objeto (inmutable)", () => {
    const r = crearSku({ valor: "x1" });
    if (r.ok) expect(Object.isFrozen(r.value)).toBe(true);
  });
});

describe("VO · Cantidad", () => {
  it("rechaza negativos y redondea a la escala", () => {
    expect(crearCantidad({ valor: -1 }).ok).toBe(false);
    const r = crearCantidad({ valor: 1.239, escala: 2 });
    if (r.ok) expect(r.value.valor).toBe(1.24);
  });
  it("suma y resta saturando en cero", () => {
    const a = crearCantidad({ valor: 5, escala: 0 });
    const b = crearCantidad({ valor: 8, escala: 0 });
    if (a.ok && b.ok) {
      expect(sumarCantidad(a.value, b.value).valor).toBe(13);
      expect(restarCantidad(a.value, b.value).valor).toBe(0);
    }
  });
});

describe("VO · Código / Unidad / Costos / LeadTime / Proveedor", () => {
  it("valida código de inventario", () => {
    expect(crearCodigoInventario({ valor: "ITM-000001", prefijo: "ITM", secuencia: 1 }).ok).toBe(true);
    expect(crearCodigoInventario({ valor: "x", prefijo: "ITM", secuencia: 0 }).ok).toBe(false);
  });
  it("valida unidad de medida con factor base positivo", () => {
    expect(crearUnidadMedida({ clave: "caja", factorBase: 12 }).ok).toBe(true);
    expect(crearUnidadMedida({ clave: "caja", factorBase: 0 }).ok).toBe(false);
  });
  it("recalcula el costo promedio ponderado", () => {
    const base = crearCostoPromedio({ monto: 10, moneda: "USD" });
    const ultima = crearCostoPromedio({ monto: 20, moneda: "USD" });
    if (base.ok && ultima.ok) {
      const r = recalcularPromedio(base.value, 10, ultima.value, 10);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.monto).toBeCloseTo(15, 5);
    }
  });
  it("valida lead time y proveedor", () => {
    expect(crearLeadTime({ dias: 5 }).ok).toBe(true);
    expect(crearProveedorPreferido({ proveedorId: "p1", leadTimeDias: 3 }).ok).toBe(true);
  });
});

describe("VO · Política de reposición", () => {
  it("acepta min<=reorden<=max", () => {
    expect(crearPoliticaReposicion({ minimo: 1, puntoReorden: 3, maximo: 5 }).ok).toBe(true);
  });
  it("rechaza min>max y reorden>max", () => {
    expect(crearPoliticaReposicion({ minimo: 6, maximo: 5 }).ok).toBe(false);
    expect(crearPoliticaReposicion({ minimo: 0, puntoReorden: 7, maximo: 5 }).ok).toBe(false);
  });
});

describe("VO · Lote / Serie / Vencimiento", () => {
  it("valida lote con vencimiento ISO", () => {
    expect(crearLote({ codigo: "L1", vencimiento: "2030-01-01T00:00:00Z" }).ok).toBe(true);
    expect(crearLote({ codigo: "L1", vencimiento: "no-fecha" }).ok).toBe(false);
  });
  it("valida serie no vacía", () => {
    expect(crearSerie({ numero: "SN-1" }).ok).toBe(true);
    expect(crearSerie({ numero: " " }).ok).toBe(false);
  });
  it("detecta vencimiento", () => {
    const fv = crearFechaVencimiento({ fecha: "2020-01-01T00:00:00Z" });
    if (fv.ok) expect(estaVencida(fv.value, new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("VO · Ubicación física", () => {
  it("valida coherencia ruta↔segmentos", () => {
    const ok = crearUbicacionFisica({
      ubicacionId: "u1",
      segmentos: [{ nivel: "pasillo", valor: "A" }, { nivel: "estanteria", valor: "03" }],
      ruta: "A/03",
    });
    expect(ok.ok).toBe(true);
    const bad = crearUbicacionFisica({
      ubicacionId: "u1",
      segmentos: [{ nivel: "pasillo", valor: "A" }],
      ruta: "B",
    });
    expect(bad.ok).toBe(false);
  });
});
