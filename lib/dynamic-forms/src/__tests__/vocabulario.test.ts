/**
 * DGP-007 · Dynamic Forms Engine — Guardarraíl de neutralidad ("grep negativo").
 *
 * Recorre TODOS los identificadores públicos del paquete (barril `index.ts`) y
 * falla si cualquiera contiene vocabulario de negocio prohibido. Es la red de
 * seguridad estructural que impide reintroducir términos como `proveedor`,
 * `empleado`, `equipo`, `ot`, `activo`, ... en la API pública.
 */
import { describe, expect, it } from "vitest";
import * as api from "..";
import { detectarVocabularioProhibido, VOCABULARIO_PROHIBIDO } from "../vocabulario";

/** Divide un identificador camelCase/PascalCase/SNAKE en tokens legibles. */
function tokenizar(nombre: string): string {
  return nombre
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .toLowerCase();
}

/** Recolecta nombres de miembros estáticos y de prototipo de una clase/función. */
function miembrosDe(valor: unknown): string[] {
  const nombres = new Set<string>();
  if (typeof valor === "function") {
    for (const k of Object.getOwnPropertyNames(valor)) {
      if (k !== "prototype" && k !== "length" && k !== "name") nombres.add(k);
    }
    const proto = (valor as { prototype?: object }).prototype;
    if (proto) {
      for (const k of Object.getOwnPropertyNames(proto)) {
        if (k !== "constructor") nombres.add(k);
      }
    }
  }
  return [...nombres];
}

describe("Guardarraíl de neutralidad (grep negativo sobre la API pública)", () => {
  it("el detector cubre todos los términos del mandato DGP-007", () => {
    for (const termino of ["activo", "inventario", "orden", "compra", "combustible", "sst", "empleado", "proveedor", "equipo", "ot"]) {
      expect(VOCABULARIO_PROHIBIDO).toContain(termino);
      // El detector debe reconocer el término aislado.
      expect(detectarVocabularioProhibido(`campo ${termino} demo`)).toContain(termino);
    }
  });

  it("no hay falsos positivos razonables (subcadenas legítimas)", () => {
    // 'ot' dentro de otras palabras / 'activo' como subcadena NO deben matchear.
    for (const limpio of ["robot", "piloto", "nota", "rotonda", "reactivo", "recompra improbable"]) {
      // 'recompra improbable' contiene 'compra'? No: 'recompra' no tiene frontera antes de 'compra'.
      expect(detectarVocabularioProhibido(limpio)).toEqual([]);
    }
    // Acentos normalizados: 'revisión' es neutro.
    expect(detectarVocabularioProhibido("revisión genérica")).toEqual([]);
  });

  it("ningún identificador exportado contiene vocabulario prohibido", () => {
    const infracciones: string[] = [];
    for (const nombre of Object.keys(api)) {
      const candidatos = [nombre, ...miembrosDe((api as Record<string, unknown>)[nombre])];
      for (const c of candidatos) {
        const hallados = detectarVocabularioProhibido(tokenizar(c));
        if (hallados.length > 0) infracciones.push(`${nombre}.${c} → ${hallados.join(",")}`);
      }
    }
    expect(infracciones).toEqual([]);
  });
});
