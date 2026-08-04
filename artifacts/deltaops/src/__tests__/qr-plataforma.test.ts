/**
 * DGP-008.3 · Pruebas de integración con platform.qr:
 *  - la ficha codifica el CÓDIGO DE PLATAFORMA (no una URL);
 *  - el escáner resuelve con el servidor y sólo degrada a interpretación local.
 */
import { describe, it, expect } from "vitest";
import { valorEtiqueta, extraerId, resolverCodigoActivo } from "../lib/qr/etiqueta";
import type { EtiquetaQr } from "../lib/activos/tipos";

describe("valorEtiqueta", () => {
  it("codifica el código de plataforma, no una URL", () => {
    const et: EtiquetaQr = { id: "tag1", codigo: "DOP-QR-000123", tipo: "qr" };
    expect(valorEtiqueta(et)).toBe("DOP-QR-000123");
    expect(valorEtiqueta(et)).not.toMatch(/^https?:\/\//);
  });
  it("devuelve cadena vacía si no hay etiqueta vigente", () => {
    expect(valorEtiqueta(null)).toBe("");
    expect(valorEtiqueta(undefined)).toBe("");
  });
});

describe("extraerId (degradación secundaria)", () => {
  it("extrae un UUID directo", () => {
    expect(extraerId("11111111-2222-3333-4444-555555555555")).toBe("11111111-2222-3333-4444-555555555555");
  });
  it("extrae el id de una URL de ficha", () => {
    expect(extraerId("https://x/deltaops/activos/abc123?y=1")).toBe("abc123");
  });
  it("devuelve null si no hay id reconocible", () => {
    expect(extraerId("DOP-QR-000123")).toBeNull();
  });
});

describe("resolverCodigoActivo", () => {
  it("usa el resultado del servidor cuando está disponible", async () => {
    const res = await resolverCodigoActivo("DOP-QR-1", async () => ({ activoId: "A-1" }));
    expect(res).toEqual({ origen: "servidor", activoId: "A-1" });
  });

  it("acepta la forma { id } del servidor", async () => {
    const res = await resolverCodigoActivo("DOP-QR-1", async () => ({ id: "A-2" }));
    expect(res).toEqual({ origen: "servidor", activoId: "A-2" });
  });

  it("degrada a interpretación local cuando el servidor devuelve null", async () => {
    const url = "https://x/deltaops/activos/A-3";
    const res = await resolverCodigoActivo(url, async () => null);
    expect(res).toEqual({ origen: "local", activoId: "A-3" });
  });

  it("marca no-resuelto cuando ni el servidor ni la interpretación local dan id", async () => {
    const res = await resolverCodigoActivo("DOP-QR-000999", async () => null);
    expect(res).toEqual({ origen: "no-resuelto", codigo: "DOP-QR-000999" });
  });

  it("prioriza el servidor aunque el contenido también sea un UUID", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const res = await resolverCodigoActivo(uuid, async () => ({ activoId: "SERVIDOR" }));
    expect(res).toEqual({ origen: "servidor", activoId: "SERVIDOR" });
  });
});
