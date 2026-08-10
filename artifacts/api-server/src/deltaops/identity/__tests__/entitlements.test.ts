/**
 * DGP-017 · Entitlements — resolución de módulo por ruta y normalización.
 */
import { describe, expect, it } from "vitest";
import { normalizarModulos, MODULOS_TODOS, esModuloConocido } from "../entitlements";
import { moduloDeRuta } from "../middleware";

describe("Entitlements · módulos por tenant", () => {
  it("resuelve el módulo desde la URL", () => {
    expect(moduloDeRuta("/api/deltaops/activos/123")).toBe("activos");
    expect(moduloDeRuta("/api/deltaops/analytics/dashboard")).toBe("analytics");
    expect(moduloDeRuta("/api/deltaops/auth/login")).toBeNull();
    expect(moduloDeRuta("/api/deltaops/admin/tenants")).toBeNull();
  });

  it("normaliza listas de módulos ignorando desconocidos", () => {
    expect(normalizarModulos(["activos", "ordenes", "hackeo"]).sort()).toEqual(["activos", "ordenes"]);
    expect(normalizarModulos("no-array")).toEqual([]);
  });

  it("reconoce módulos conocidos", () => {
    expect(esModuloConocido("inventario")).toBe(true);
    expect(esModuloConocido("otro")).toBe(false);
    expect(MODULOS_TODOS).toContain("preventivo");
  });
});
