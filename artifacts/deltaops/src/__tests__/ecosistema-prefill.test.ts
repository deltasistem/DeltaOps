/**
 * DGP-010 · Pruebas del pre-relleno contextual del wizard de alta de OT.
 * El flujo QR/Vista 360° → nueva OT ancla el activo vía query-string.
 */
import { describe, it, expect } from "vitest";
import { prefillDesdeUrl } from "../pages/ordenes-nueva";

describe("prefillDesdeUrl", () => {
  it("mantiene el borrador si no hay contexto en la URL", () => {
    expect(prefillDesdeUrl({ titulo: "x" }, "")).toEqual({ titulo: "x" });
    expect(prefillDesdeUrl({ titulo: "x" }, "?otro=1")).toEqual({ titulo: "x" });
  });

  it("pre-rellena el activo principal desde ?activo=", () => {
    const r = prefillDesdeUrl({}, "?activo=A1&activoEtiqueta=Bomba");
    expect(r.activoId).toBe("A1");
    expect(r.activoEtiqueta).toBe("Bomba");
  });

  it("usa el componente como activo cuando no hay activo explícito", () => {
    const r = prefillDesdeUrl({}, "?componente=C9");
    expect(r.activoId).toBe("C9");
  });

  it("el contexto de la URL tiene prioridad sobre el borrador", () => {
    const r = prefillDesdeUrl({ activoId: "VIEJO", titulo: "t" }, "?activo=NUEVO");
    expect(r.activoId).toBe("NUEVO");
    expect(r.titulo).toBe("t");
  });

  it("pre-rellena la ubicación desde ?ubicacion=", () => {
    expect(prefillDesdeUrl({}, "?ubicacion=U3").ubicacionId).toBe("U3");
  });
});
