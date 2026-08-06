/** DGP-013 · Pruebas de COTIZACIÓN y COMPARACIÓN (pura/determinista). */
import { describe, expect, it } from "vitest";
import {
  compararCotizaciones,
  crearCotizacion,
  totalCotizacion,
  PESOS_COMPARACION_DEFAULT,
  type CandidataComparacion,
} from "../domain/cotizacion";
import { crearLineaCotizacion, type LineaCotizacion } from "../domain/value-objects";

function linea(numero: number, precio: number, cantidad: number, plazo = 0): LineaCotizacion {
  const r = crearLineaCotizacion({
    numero, articuloId: `art-${numero}`, cantidad: { valor: cantidad, unidad: "unidad" },
    precioUnitario: { moneda: "usd", monto: precio }, plazoEntregaDias: plazo,
  });
  if (!r.ok) throw new Error("linea inválida");
  return r.value;
}

describe("crearCotizacion", () => {
  it("calcula el total y el plazo global (máximo de líneas)", () => {
    const r = crearCotizacion({
      id: "c1", tenantId: "t", solicitudId: "s1", proveedorId: "p1", moneda: "usd",
      lineas: [linea(1, 10, 2, 5), linea(2, 5, 4, 12)], actorId: "u", ahora: "2024-01-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cotizacion.total).toBe(40); // 10*2 + 5*4
    expect(r.value.cotizacion.plazoEntregaDias).toBe(12);
  });

  it("rechaza líneas con moneda distinta a la cotización", () => {
    const l = crearLineaCotizacion({ numero: 1, cantidad: { valor: 1, unidad: "unidad" }, precioUnitario: { moneda: "eur", monto: 3 } });
    if (!l.ok) throw new Error("l");
    const r = crearCotizacion({ id: "c", tenantId: "t", solicitudId: "s", proveedorId: "p", moneda: "usd", lineas: [l.value], actorId: "u", ahora: "2024-01-01T00:00:00.000Z" });
    expect(r.ok).toBe(false);
  });

  it("rechaza cotización sin líneas", () => {
    const r = crearCotizacion({ id: "c", tenantId: "t", solicitudId: "s", proveedorId: "p", moneda: "usd", lineas: [], actorId: "u", ahora: "2024-01-01T00:00:00.000Z" });
    expect(r.ok).toBe(false);
  });

  it("totalCotizacion es determinista", () => {
    expect(totalCotizacion([linea(1, 3.33, 3), linea(2, 1.11, 9)])).toBe(19.98);
  });
});

const cand = (id: string, total: number, plazo: number, cal: number): CandidataComparacion => ({
  cotizacionId: id, proveedorId: `pv-${id}`, moneda: "usd", total, plazoEntregaDias: plazo, calificacionProveedor: cal,
});

describe("compararCotizaciones", () => {
  it("prioriza el menor precio con pesos por defecto (mismo plazo/calificación)", () => {
    const r = compararCotizaciones([cand("a", 100, 5, 4), cand("b", 80, 5, 4), cand("c", 120, 5, 4)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]!.cotizacionId).toBe("b"); // más barata
    expect(r.value[2]!.cotizacionId).toBe("c"); // más cara
  });

  it("es determinista y reproducible (empate se rompe por cotizacionId)", () => {
    const entrada = [cand("z", 100, 5, 4), cand("a", 100, 5, 4)];
    const r1 = compararCotizaciones(entrada);
    const r2 = compararCotizaciones([...entrada].reverse());
    if (!r1.ok || !r2.ok) throw new Error("comparación");
    expect(r1.value[0]!.cotizacionId).toBe("a");
    expect(r2.value[0]!.cotizacionId).toBe("a");
  });

  it("los pesos configurables cambian el ganador (prioriza calificación)", () => {
    const candidatas = [cand("barata", 80, 20, 1), cand("confiable", 100, 5, 5)];
    const soloCalificacion = compararCotizaciones(candidatas, { precio: 0, plazoEntrega: 0, calificacion: 1 });
    if (!soloCalificacion.ok) throw new Error("cal");
    expect(soloCalificacion.value[0]!.cotizacionId).toBe("confiable");
  });

  it("rechaza comparación entre monedas distintas", () => {
    const r = compararCotizaciones([cand("a", 100, 5, 4), { ...cand("b", 80, 5, 4), moneda: "eur" }]);
    expect(r.ok).toBe(false);
  });

  it("rechaza lista vacía y pesos no positivos", () => {
    expect(compararCotizaciones([]).ok).toBe(false);
    expect(compararCotizaciones([cand("a", 1, 1, 1)], { precio: 0, plazoEntrega: 0, calificacion: 0 }).ok).toBe(false);
  });

  it("normaliza puntajes en [0,1] y usa los pesos por defecto suministrados", () => {
    const r = compararCotizaciones([cand("a", 100, 10, 5), cand("b", 100, 10, 5)], PESOS_COMPARACION_DEFAULT);
    if (!r.ok) throw new Error("r");
    for (const x of r.value) {
      expect(x.puntaje).toBeGreaterThanOrEqual(0);
      expect(x.puntaje).toBeLessThanOrEqual(1);
    }
  });
});
