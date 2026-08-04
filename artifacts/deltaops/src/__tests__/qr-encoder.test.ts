/**
 * DGP-008.3 · Pruebas del codificador QR autocontenido.
 * Valida invariantes estructurales (tamaño por versión, patrones localizadores,
 * temporizador, determinismo) y la serialización SVG.
 */
import { describe, it, expect } from "vitest";
import { codificarQr, qrASvg } from "../lib/qr/encoder";

function esBuscador(m: boolean[][], r: number, c: number): boolean {
  // Anillo 7x7: borde oscuro, hueco claro, núcleo 3x3 oscuro.
  for (let i = 0; i < 7; i++) {
    if (!m[r][c + i] || !m[r + 6][c + i]) return false;
    if (!m[r + i][c] || !m[r + i][c + 6]) return false;
  }
  for (let i = 2; i < 5; i++) for (let j = 2; j < 5; j++) if (!m[r + i][c + j]) return false;
  return true;
}

describe("codificarQr", () => {
  it("produce una matriz cuadrada de tamaño 4*version+17", () => {
    const q = codificarQr("activo:123");
    expect(q.size).toBe(4 * q.version + 17);
    expect(q.modules.length).toBe(q.size);
    expect(q.modules.every((f) => f.length === q.size)).toBe(true);
  });

  it("coloca los tres patrones localizadores", () => {
    const q = codificarQr("https://deltaops.dev/activos/abc");
    const s = q.size;
    expect(esBuscador(q.modules, 0, 0)).toBe(true);
    expect(esBuscador(q.modules, 0, s - 7)).toBe(true);
    expect(esBuscador(q.modules, s - 7, 0)).toBe(true);
  });

  it("coloca el patrón temporizador alternante en la fila 6", () => {
    const q = codificarQr("temporizador");
    const fila = q.modules[6];
    // Entre las zonas de localizador (col 8..size-9) debe alternar.
    for (let c = 8; c < q.size - 8; c++) {
      expect(fila[c]).toBe(c % 2 === 0);
    }
  });

  it("es determinista para el mismo texto", () => {
    const a = codificarQr("mismo-texto");
    const b = codificarQr("mismo-texto");
    expect(JSON.stringify(a.modules)).toBe(JSON.stringify(b.modules));
  });

  it("escala la versión con la longitud del contenido", () => {
    const corto = codificarQr("x");
    const largo = codificarQr("x".repeat(120));
    expect(largo.version).toBeGreaterThan(corto.version);
  });

  it("genera SVG con rects para los módulos oscuros", () => {
    const svg = qrASvg(codificarQr("svg"), { tamano: 100 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toMatch(/<rect/);
  });
});
