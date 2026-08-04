/**
 * DGP-008.3 · Pruebas del motor de formularios dinámicos y las plantillas.
 */
import { describe, it, expect } from "vitest";
import { validar, hayBloqueos, evaluarEstados } from "../lib/forms/motor";
import { plantillaAlta, REGLAS_ALTA, PASOS_WIZARD } from "../lib/forms/plantillas";

describe("motor de formularios · plantilla de alta", () => {
  const def = plantillaAlta({
    tipos: [{ valor: "maquinaria", etiqueta: "Maquinaria" }],
    categorias: [{ valor: "produccion", etiqueta: "Producción" }],
    familias: [{ valor: "bombas", etiqueta: "Bombas" }],
  });

  it("marca los campos obligatorios vacíos como error", () => {
    const h = validar(def, REGLAS_ALTA, {});
    const claves = h.filter((x) => x.severidad === "error").map((x) => x.campo);
    expect(claves).toContain("codigoEmpresarial");
    expect(claves).toContain("nombre");
    expect(claves).toContain("tipo");
    expect(claves).toContain("categoria");
    expect(claves).toContain("familia");
    expect(hayBloqueos(h)).toBe(true);
  });

  it("no bloquea cuando los obligatorios están completos", () => {
    const datos = {
      codigoEmpresarial: "EQ-001",
      nombre: "Bomba 1",
      tipo: "maquinaria",
      categoria: "produccion",
      familia: "bombas",
    };
    const h = validar(def, REGLAS_ALTA, datos);
    expect(hayBloqueos(h)).toBe(false);
  });

  it("aplica la regla condicional: ubicacionEtiqueta obligatoria si hay ubicacionId", () => {
    const estados = evaluarEstados(def, REGLAS_ALTA, { ubicacionId: "U1" });
    expect(estados.ubicacionEtiqueta?.obligatorio).toBe(true);
    const estadosSin = evaluarEstados(def, REGLAS_ALTA, {});
    expect(estadosSin.ubicacionEtiqueta?.obligatorio).toBe(false);
  });

  it("valida restricciones de rango (año)", () => {
    const base = { codigoEmpresarial: "EQ", nombre: "N", tipo: "maquinaria", categoria: "produccion", familia: "bombas" };
    const h = validar(def, REGLAS_ALTA, { ...base, anio: 1800 });
    expect(h.some((x) => x.campo === "anio" && x.severidad === "error")).toBe(true);
  });

  it("el wizard define 7 pasos de datos con campos coherentes con la definición", () => {
    expect(PASOS_WIZARD.length).toBe(7);
    const clavesDef = new Set(evaluarEstados(def, REGLAS_ALTA, {}) && Object.keys(evaluarEstados(def, REGLAS_ALTA, {})));
    for (const paso of PASOS_WIZARD) {
      for (const c of paso.campos) expect(clavesDef.has(c)).toBe(true);
    }
  });
});
