/**
 * DGP-LITE-04 · Veredicto del checklist operacional (regla de Dirección).
 *
 * Cubre las tres transiciones exactas:
 *   - APTO: todos los obligatorios cumplen, sin observaciones.
 *   - APTO_CON_OBSERVACIONES: sin críticos incumplidos, pero hay incumplimientos
 *     NO críticos u observaciones.
 *   - NO_APTO: al menos un ítem CRÍTICO con NO CUMPLE.
 * Y el trato NEUTRO de NO APLICA ("na"), que nunca cuenta como incumplimiento.
 * La criticidad proviene EXCLUSIVAMENTE de `item.critico` (declarada). Ejemplos
 * NEUTROS ("verificación genérica").
 */
import { describe, expect, it } from "vitest";
import { calcularVeredicto, type DefinicionChecklist, type RespuestaItem } from "../index";

const def: DefinicionChecklist = {
  clave: "chk-neutro",
  titulo: "Verificación genérica",
  version: 1,
  items: [
    { clave: "c1", etiqueta: "Punto crítico 1", obligatorio: true, critico: true },
    { clave: "c2", etiqueta: "Punto crítico 2", obligatorio: true, critico: true },
    { clave: "n1", etiqueta: "Punto no crítico 1", obligatorio: true, critico: false },
    { clave: "n2", etiqueta: "Punto opcional", obligatorio: false },
  ],
};

const r = (clave: string, estado: boolean | "na", comentario?: string): RespuestaItem =>
  ({ clave, estado, ...(comentario ? { comentario } : {}) });

describe("DGP-LITE-04 · calcularVeredicto", () => {
  it("APTO cuando todo cumple y no hay observaciones", () => {
    const res = calcularVeredicto(def, [r("c1", true), r("c2", true), r("n1", true), r("n2", true)]);
    expect(res.veredicto).toBe("APTO");
    expect(res.incumplimientos).toHaveLength(0);
    expect(res.hayCriticoIncumplido).toBe(false);
  });

  it("NO_APTO cuando un ítem CRÍTICO no cumple", () => {
    const res = calcularVeredicto(def, [r("c1", false), r("c2", true), r("n1", true)]);
    expect(res.veredicto).toBe("NO_APTO");
    expect(res.hayCriticoIncumplido).toBe(true);
    expect(res.incumplimientos[0]?.clave).toBe("c1");
    expect(res.incumplimientos[0]?.critico).toBe(true);
  });

  it("APTO_CON_OBSERVACIONES cuando un ítem NO crítico no cumple", () => {
    const res = calcularVeredicto(def, [r("c1", true), r("c2", true), r("n1", false)]);
    expect(res.veredicto).toBe("APTO_CON_OBSERVACIONES");
    expect(res.hayCriticoIncumplido).toBe(false);
    expect(res.incumplimientos.map((i) => i.clave)).toEqual(["n1"]);
  });

  it("APTO_CON_OBSERVACIONES cuando cumple pero hay comentario (observación)", () => {
    const res = calcularVeredicto(def, [r("c1", true, "ruido leve"), r("c2", true), r("n1", true)]);
    expect(res.veredicto).toBe("APTO_CON_OBSERVACIONES");
    expect(res.observaciones.map((o) => o.clave)).toEqual(["c1"]);
    expect(res.incumplimientos).toHaveLength(0);
  });

  it('NO APLICA ("na") nunca cuenta como incumplimiento ni cambia el estado', () => {
    const res = calcularVeredicto(def, [r("c1", "na"), r("c2", true), r("n1", true)]);
    expect(res.veredicto).toBe("APTO");
    expect(res.incumplimientos).toHaveLength(0);
  });

  it("prioriza los incumplimientos CRÍTICOS al inicio de la lista", () => {
    const res = calcularVeredicto(def, [r("c1", false), r("c2", true), r("n1", false)]);
    expect(res.veredicto).toBe("NO_APTO");
    expect(res.incumplimientos[0]?.critico).toBe(true);
    expect(res.incumplimientos.at(-1)?.critico).toBe(false);
  });

  it("un ítem sin respuesta no es incumplimiento (obligatoriedad la valida itemsPendientes)", () => {
    const res = calcularVeredicto(def, [r("c1", true), r("c2", true)]);
    expect(res.veredicto).toBe("APTO");
  });
});
