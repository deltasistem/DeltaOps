/**
 * DGP-019.2 · Regresión: overlay Zod en /activos (listado).
 *
 * Causa raíz: el backend `activos.catalogo.opciones` (`CatalogoService.opciones`)
 * devuelve `{ value, label, posicion, padre }`, pero la UI consume
 * `OpcionCatalogo {valor, etiqueta}`. El listado mapeaba `o.valor`/`o.etiqueta`
 * (undefined con la forma real) y construía `plantillaFiltrosListado`, cuyo
 * validador Zod de Dynamic Forms exige `z.string().min(1)` en cada opción →
 * lanzaba y Vite mostraba el overlay de runtime.
 *
 * Fix de FRONTERA (sin relajar validación): `useCatalogo` normaliza la respuesta
 * real a `OpcionCatalogo`. Estos tests fijan el contrato real y prueban que:
 *  - la normalización mapea `{value,label}`→`{valor,etiqueta}` sin `undefined`;
 *  - `plantillaFiltrosListado` NO lanza con las opciones normalizadas;
 *  - reproducen que las opciones SIN normalizar (forma real cruda) SÍ lanzaban.
 */
import { describe, it, expect } from "vitest";
import { normalizarOpcionesCatalogo } from "../lib/activos/hooks";
import { plantillaFiltrosListado } from "../lib/forms/plantillas";
import { ESTADOS_ACTIVO, etiquetaEstado } from "../lib/activos/tipos";

// Forma REAL capturada de GET /api/deltaops/activos/catalogos/tipos.
const BACKEND_TIPOS = [
  { value: "fijo", label: "Fijo", posicion: 0, padre: null },
  { value: "movil", label: "Móvil", posicion: 0, padre: null },
];

const estados = ESTADOS_ACTIVO.map((e) => ({ valor: e, etiqueta: etiquetaEstado(e) }));

describe("normalizarOpcionesCatalogo · contrato real backend {value,label}", () => {
  it("mapea {value,label,posicion,padre} → {valor,etiqueta} sin undefined", () => {
    const out = normalizarOpcionesCatalogo(BACKEND_TIPOS);
    expect(out).toEqual([
      { valor: "fijo", etiqueta: "Fijo", habilitado: undefined },
      { valor: "movil", etiqueta: "Móvil", habilitado: undefined },
    ]);
    for (const o of out) {
      expect(typeof o.valor).toBe("string");
      expect(o.valor.length).toBeGreaterThan(0);
      expect(o.etiqueta.length).toBeGreaterThan(0);
    }
  });

  it("descarta entradas sin clave y tolera valores no-arreglo", () => {
    expect(normalizarOpcionesCatalogo(null)).toEqual([]);
    expect(normalizarOpcionesCatalogo({} as unknown)).toEqual([]);
    expect(normalizarOpcionesCatalogo([{ value: "", label: "Vacío" }, null, 3])).toEqual([]);
  });

  it("acepta también la forma UI ya normalizada (idempotente)", () => {
    const ui = [{ valor: "a", etiqueta: "A" }];
    expect(normalizarOpcionesCatalogo(ui)).toEqual([{ valor: "a", etiqueta: "A", habilitado: undefined }]);
  });
});

describe("plantillaFiltrosListado · robustez frente a opciones de catálogo", () => {
  it("NO lanza al construirse con opciones NORMALIZADAS del backend real", () => {
    const norm = normalizarOpcionesCatalogo(BACKEND_TIPOS);
    expect(() =>
      plantillaFiltrosListado(estados, {
        tipos: norm.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta })),
      }),
    ).not.toThrow();
  });

  it("REPRODUCE el bug: opciones crudas del backend (valor/etiqueta undefined) lanzan Zod", () => {
    const crudo = BACKEND_TIPOS.map((o) => ({
      valor: (o as { valor?: string }).valor as string, // undefined con la forma real
      etiqueta: (o as { etiqueta?: string }).etiqueta as string,
    }));
    expect(() => plantillaFiltrosListado(estados, { tipos: crudo })).toThrow();
  });
});
