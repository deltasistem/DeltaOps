/**
 * DGP-016 · Deep links de Analytics: rutas internas deterministas + enlaces
 * SALIENTES a módulos operativos (ruta→filtro) y resolución declarativa de
 * enlaces de widget.
 */
import { describe, it, expect } from "vitest";
import {
  urlHome,
  urlDashboard,
  urlIndicadores,
  urlIndicador,
  urlDashboardNuevo,
  urlDashboardEditar,
  urlSincronizacion,
  urlOrdenesFiltrado,
  urlActivoCorrectivo,
  urlActivo,
  urlAbastecimientoSolicitudes,
  urlItemInventario,
  resolverEnlaceWidget,
  leerParam,
} from "../lib/analytics/deep-links";

describe("deep links internos", () => {
  it("rutas base", () => {
    expect(urlHome()).toBe("/analytics");
    expect(urlDashboardNuevo()).toBe("/analytics/dashboards/nuevo");
    expect(urlSincronizacion()).toBe("/analytics/sincronizacion");
    expect(urlIndicadores()).toBe("/analytics/indicadores");
    expect(urlIndicadores("confiabilidad")).toBe("/analytics/indicadores?categoria=confiabilidad");
  });

  it("dashboard con filtros globales serializados en la URL", () => {
    expect(urlDashboard("d1")).toBe("/analytics/dashboards/d1");
    expect(urlDashboard("d1", { activo: "A1", estado: "abierta" })).toBe(
      "/analytics/dashboards/d1?activo=A1&estado=abierta",
    );
    expect(urlDashboardEditar("d 1")).toBe("/analytics/dashboards/d%201/editar");
  });

  it("indicador con filtros y codificación de clave", () => {
    expect(urlIndicador("mttr")).toBe("/analytics/indicadores/mttr");
    expect(urlIndicador("mttr", { activo: "A1" })).toBe("/analytics/indicadores/mttr?activo=A1");
  });
});

describe("deep links salientes (ruta→filtro consumido)", () => {
  it("órdenes filtradas", () => {
    expect(urlOrdenesFiltrado({ estado: "abierta" })).toBe("/ordenes?estado=abierta");
    expect(urlOrdenesFiltrado()).toBe("/ordenes");
  });
  it("activo / activo-correctivo / abastecimiento / inventario", () => {
    expect(urlActivo("A1")).toBe("/activos/A1");
    expect(urlActivoCorrectivo("A1")).toBe("/activos/A1?tab=correctivo");
    expect(urlAbastecimientoSolicitudes()).toBe("/abastecimiento/solicitudes");
    expect(urlItemInventario("i1")).toBe("/inventario/i1");
  });
});

describe("resolverEnlaceWidget (presentacion.enlace declarativo)", () => {
  it("sin enlace devuelve null", () => {
    expect(resolverEnlaceWidget({})).toBeNull();
    expect(resolverEnlaceWidget({ enlace: {} })).toBeNull();
  });
  it("destino ordenes usa estado/tipo", () => {
    expect(resolverEnlaceWidget({ enlace: { destino: "ordenes", estado: "abierta" } })).toBe("/ordenes?estado=abierta");
  });
  it("destino activo-correctivo requiere clave del grupo", () => {
    expect(resolverEnlaceWidget({ enlace: { destino: "activo-correctivo" } }, "A1")).toBe("/activos/A1?tab=correctivo");
    expect(resolverEnlaceWidget({ enlace: { destino: "activo-correctivo" } })).toBeNull();
  });
  it("destino abastecimiento e inventario", () => {
    expect(resolverEnlaceWidget({ enlace: { destino: "abastecimiento" } })).toBe("/abastecimiento/solicitudes");
    expect(resolverEnlaceWidget({ enlace: { destino: "inventario" } }, "i1")).toBe("/inventario/i1");
  });
});

describe("leerParam", () => {
  it("lee parámetro simple o undefined", () => {
    expect(leerParam("?categoria=x", "categoria")).toBe("x");
    expect(leerParam("categoria=x", "categoria")).toBe("x");
    expect(leerParam("", "categoria")).toBeUndefined();
  });
});
