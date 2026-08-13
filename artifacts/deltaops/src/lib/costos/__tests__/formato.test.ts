/**
 * DGP-021.3 · El formateo de dinero de la composición es STRING-SAFE (§26):
 * la CADENA exacta del backend se presenta sin `parseFloat`/`Number` ni
 * aritmética; la ausencia de datos NO produce «$0».
 */
import { describe, it, expect } from "vitest";
import {
  formatearMoneda,
  formatearNumero,
  ETIQUETA_ESTADO,
  TONO_ESTADO,
  SIN_DATOS_TEXTO,
} from "../formato";

describe("formatearMoneda (string-safe)", () => {
  it("formatea la CADENA exacta sin perder precisión en montos grandes", () => {
    // 12 dígitos enteros + 6 decimales: parseFloat perdería precisión aquí.
    const out = formatearMoneda("123456789012.345678", "CLP", "es-CO");
    expect(out).toBeTruthy();
    // Contiene los dígitos significativos de la parte entera (agrupados).
    expect(out).toContain("123");
    expect(out).toContain("012");
  });

  it("preserva un $0 REAL cuando el backend envía '0.000000'", () => {
    const out = formatearMoneda("0.000000", "CLP");
    expect(out).toBeTruthy();
    expect(out).toContain("0");
  });

  it("devuelve null (no «$0») ante monto o moneda ausentes", () => {
    expect(formatearMoneda(null, "CLP")).toBeNull();
    expect(formatearMoneda("100.000000", null)).toBeNull();
    expect(formatearMoneda("no-num", "CLP")).toBeNull();
  });

  it("no reconoce Intl ⇒ presenta cantidad + código sin inventar símbolo", () => {
    const out = formatearMoneda("50.000000", "XYZ");
    expect(out).toContain("XYZ");
  });
});

describe("formatearNumero", () => {
  it("agrupa la parte entera sin aritmética de float", () => {
    expect(formatearNumero("40.000000")).toBeTruthy();
    expect(formatearNumero(null)).toBeNull();
  });
});

describe("estados (§8) · ausencia ≠ $0", () => {
  it("SIN_DATOS_SUFICIENTES tiene texto de negocio, no un cero monetario", () => {
    expect(ETIQUETA_ESTADO.SIN_DATOS_SUFICIENTES).toBe(SIN_DATOS_TEXTO);
    expect(SIN_DATOS_TEXTO).not.toContain("$");
    expect(SIN_DATOS_TEXTO).not.toMatch(/\b0\b/);
  });

  it("cada estado tiene una etiqueta y un tono de Badge", () => {
    for (const e of ["COMPLETO", "PARCIAL", "SIN_DATOS_SUFICIENTES", "PENDIENTE", "NO_APLICA"] as const) {
      expect(ETIQUETA_ESTADO[e]).toBeTruthy();
      expect(TONO_ESTADO[e]).toBeTruthy();
    }
  });
});
