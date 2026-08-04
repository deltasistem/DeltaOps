/**
 * DGP-008.3 · Pruebas del alta (borradores por tenant + mapeo a CrearInput).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { construirInput, leerBorrador, guardarBorrador, borrarBorrador } from "../lib/activos/alta";
import { claveBorrador } from "../lib/activos/constantes";

describe("borradores del wizard", () => {
  beforeEach(() => localStorage.clear());

  it("usa una clave por tenant", () => {
    expect(claveBorrador("deltaops")).toBe("deltaops:activos:borrador:deltaops");
    expect(claveBorrador("otro")).not.toBe(claveBorrador("deltaops"));
  });

  it("hace round-trip de guardar/leer y aísla por tenant", () => {
    guardarBorrador("deltaops", { nombre: "Bomba", anio: 2020 });
    expect(leerBorrador("deltaops")).toEqual({ nombre: "Bomba", anio: 2020 });
    expect(leerBorrador("otro")).toEqual({});
  });

  it("borra el borrador", () => {
    guardarBorrador("deltaops", { nombre: "X" });
    borrarBorrador("deltaops");
    expect(leerBorrador("deltaops")).toEqual({});
  });

  it("devuelve {} ante JSON corrupto", () => {
    localStorage.setItem(claveBorrador("deltaops"), "{no-json");
    expect(leerBorrador("deltaops")).toEqual({});
  });
});

describe("construirInput", () => {
  it("mapea campos planos y descarta vacíos", () => {
    const input = construirInput({
      codigoEmpresarial: "EQ-1",
      nombre: "Bomba",
      tipo: "maquinaria",
      categoria: "prod",
      familia: "bombas",
      anio: "2020",
      descripcion: "",
    });
    expect(input.codigoEmpresarial).toBe("EQ-1");
    expect(input.anio).toBe(2020);
    expect(input).not.toHaveProperty("descripcion");
    expect(input).not.toHaveProperty("modelo");
  });

  it("compone el objeto ubicación cuando hay ubicacionId", () => {
    const input = construirInput({ ubicacionId: "U1", ubicacionEtiqueta: "Planta 1" });
    expect(input.ubicacion).toEqual({ ubicacionId: "U1", etiqueta: "Planta 1" });
  });

  it("usa el id como etiqueta de ubicación por defecto", () => {
    const input = construirInput({ ubicacionId: "U1" });
    expect(input.ubicacion).toEqual({ ubicacionId: "U1", etiqueta: "U1" });
  });

  it("compone garantía a partir de meses", () => {
    const input = construirInput({ garantiaMeses: "24" });
    expect(input.garantia).toEqual({ meses: 24 });
  });
});
