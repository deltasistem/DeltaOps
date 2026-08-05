/**
 * DGP-010 · Pruebas de la navegación contextual profunda (funciones puras).
 * Verifican que los enlaces del ecosistema (Activo ↔ Orden ↔ QR) se construyen
 * sobre rutas existentes y codifican correctamente el estado inicial.
 */
import { describe, it, expect } from "vitest";
import {
  urlActivo,
  urlActivoTab,
  urlOrden,
  urlOrdenTab,
  urlNuevaOrden,
  urlOrdenesDeActivo,
  leerParam,
} from "../lib/ecosistema/deep-links";

describe("deep-links del ecosistema", () => {
  it("construye rutas de ficha reutilizando las rutas existentes", () => {
    expect(urlActivo("A1")).toBe("/activos/A1");
    expect(urlOrden("O1")).toBe("/ordenes/O1");
    expect(urlOrdenesDeActivo("A1")).toBe("/ordenes?activoPrincipalId=A1");
  });

  it("abre pestañas concretas vía ?tab=", () => {
    expect(urlActivoTab("A1", "ordenes")).toBe("/activos/A1?tab=ordenes");
    expect(urlOrdenTab("O1", "activo")).toBe("/ordenes/O1?tab=activo");
  });

  it("ancla el alta de OT al activo (flujo QR/360°→nueva OT)", () => {
    expect(urlNuevaOrden()).toBe("/ordenes/nueva");
    const u = urlNuevaOrden({ activo: "A 1", activoEtiqueta: "Bomba #2", ubicacion: "U9" });
    expect(u.startsWith("/ordenes/nueva?")).toBe(true);
    expect(leerParam(new URL(`http://x${u}`).search, "activo")).toBe("A 1");
    expect(leerParam(new URL(`http://x${u}`).search, "activoEtiqueta")).toBe("Bomba #2");
    expect(leerParam(new URL(`http://x${u}`).search, "ubicacion")).toBe("U9");
  });

  it("codifica caracteres especiales de forma segura", () => {
    expect(urlActivo("a/b?c")).toBe("/activos/a%2Fb%3Fc");
  });

  it("leerParam devuelve undefined cuando falta o está vacío", () => {
    expect(leerParam("?tab=", "tab")).toBeUndefined();
    expect(leerParam("?x=1", "tab")).toBeUndefined();
    expect(leerParam("tab=ordenes", "tab")).toBe("ordenes");
  });
});
