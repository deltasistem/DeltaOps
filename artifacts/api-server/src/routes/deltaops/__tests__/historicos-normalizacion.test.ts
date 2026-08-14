/**
 * DELTAOPS LITE-09 · Regresiones de normalización de la importación histórica.
 * Funciones PURAS (sin DB): conversión galón→litro (SEVERO-1) y normalización
 * Unicode de encabezados incl. NBSP (MENOR-1).
 */
import { describe, expect, it } from "vitest";
import {
  GALON_A_LITRO,
  galonesALitros,
  normalizarEncabezado,
} from "../historicos/normalizacion";

describe("SEVERO-1 · galones → litros (canónico)", () => {
  it("convierte con el factor US exacto y redondeo estable a 3 decimales", () => {
    expect(GALON_A_LITRO).toBeCloseTo(3.785411784, 9);
    // 27.1 gal ≈ 102.585 L (no 27.1 «litros» como registraba el bug).
    expect(galonesALitros(27.1)).toBeCloseTo(102.585, 3);
    expect(galonesALitros(1)).toBeCloseTo(3.785, 3);
    expect(galonesALitros(0)).toBe(0);
  });
  it("el valor canónico es ~3.785× el valor original en galones", () => {
    const galones = 44.6;
    const litros = galonesALitros(galones);
    // Tolerancia acorde al redondeo canónico a 3 decimales del valor en litros.
    expect(litros / galones).toBeCloseTo(3.785411784, 4);
  });
});

describe("MENOR-1 · normalización Unicode de encabezados", () => {
  it("colapsa NBSP (U+00A0) a espacio normal y casa la clave literal", () => {
    // "Supervisor" + NBSP + "1" ⇒ "Supervisor 1" (clave literal del mapeo).
    expect(normalizarEncabezado("Supervisor\u00a01")).toBe("Supervisor 1");
  });
  it("aplica NFKC, colapsa espacios múltiples y hace trim", () => {
    expect(normalizarEncabezado("  Operador   de\tMáquina  ")).toBe("Operador de Máquina");
  });
});
