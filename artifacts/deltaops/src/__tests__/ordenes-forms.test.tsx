/**
 * DGP-009.3 · Pruebas de las plantillas de Órdenes (Dynamic Forms) y su render.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import {
  plantillaCreacion,
  plantillaEvidencia,
  plantillaBitacora,
  plantillaRecurso,
  plantillaPlanificacion,
  plantillaAsignacion,
  PASOS_CREACION,
  CATEGORIAS_EVIDENCIA,
  CLASES_RECURSO_OPCIONES,
} from "../lib/forms/plantillas-ordenes";
import { ACCIONES_BITACORA, ETIQUETA_BITACORA } from "../lib/ordenes/constantes";
import type { ValoresFormulario } from "../lib/forms/tipos";

const acc = ACCIONES_BITACORA.map((a) => ({ valor: a, etiqueta: ETIQUETA_BITACORA[a] }));

describe("plantillas de órdenes (definiciones válidas)", () => {
  it("todas validan contra el schema del engine", () => {
    expect(() => plantillaCreacion({})).not.toThrow();
    expect(() => plantillaEvidencia()).not.toThrow();
    expect(() => plantillaBitacora(acc)).not.toThrow();
    expect(() => plantillaRecurso()).not.toThrow();
    expect(() => plantillaPlanificacion()).not.toThrow();
    expect(() => plantillaAsignacion([], [])).not.toThrow();
  });

  it("el wizard cubre los 5 pasos declarados en PASOS_CREACION", () => {
    const def = plantillaCreacion({});
    const wiz = def.nodos[0] as unknown as { pasos?: { clave: string }[] };
    const claves = (wiz.pasos ?? []).map((p) => p.clave);
    expect(claves).toEqual(PASOS_CREACION.map((p) => p.clave));
  });
});

describe("§15 · consumo ligero en OT (repuesto/insumo)", () => {
  function campos(def: ReturnType<typeof plantillaRecurso>): string[] {
    const g = def.nodos[0] as unknown as { hijos?: { clave: string }[] };
    return (g.hijos ?? []).map((c) => c.clave);
  }
  it("incluye repuesto e insumo como tipos de consumo ligero", () => {
    const valores = CLASES_RECURSO_OPCIONES.map((o) => o.valor);
    expect(valores).toContain("repuesto");
    expect(valores).toContain("insumo");
    // Conserva las clases físicas existentes (aditivo, no rompe).
    expect(valores).toContain("herramienta");
    expect(valores).toContain("material");
  });
  it("captura costo/proveedor/observación opcionales (§15)", () => {
    const cs = campos(plantillaRecurso());
    expect(cs).toEqual(expect.arrayContaining(["clase", "referenciaId", "cantidad", "unidad", "costo", "proveedorId", "observacion"]));
  });
});

describe("validación por paso del wizard de creación", () => {
  const def = plantillaCreacion({});
  it("identificación bloquea sin título ni tipo", () => {
    const h = validar(def, {}, {}).filter((x) => ["titulo", "tipo"].includes(x.campo));
    expect(hayBloqueos(h)).toBe(true);
  });
  it("identificación pasa con título y tipo", () => {
    const h = validar(def, {}, { titulo: "Cambiar filtro", tipo: "correctiva" }).filter((x) => ["titulo", "tipo"].includes(x.campo));
    expect(hayBloqueos(h)).toBe(false);
  });
});

describe("plantilla de evidencia (referencia-only)", () => {
  it("exige categoría y archivo", () => {
    const def = plantillaEvidencia();
    const h = validar(def, {}, {});
    expect(hayBloqueos(h)).toBe(true);
    const claves = h.map((x) => x.campo);
    expect(claves).toContain("categoria");
    expect(claves).toContain("archivo");
  });
  it("declara categorías documentales incluyendo fotografía y video", () => {
    const valores = CATEGORIAS_EVIDENCIA.map((c) => c.valor);
    expect(valores).toContain("fotografia");
    expect(valores).toContain("video");
  });
});

function Harness({ soloClaves }: { soloClaves?: string[] }) {
  const [valores, setValores] = useState<ValoresFormulario>({});
  return (
    <ThemeProvider>
      <FormularioDinamico
        definicion={plantillaCreacion({})}
        valores={valores}
        onCambio={setValores}
        soloClaves={soloClaves}
        hallazgos={[]}
      />
    </ThemeProvider>
  );
}

describe("render del wizard (a11y: labels asociadas)", () => {
  it("renderiza sólo los campos del paso indicado", () => {
    render(<Harness soloClaves={["titulo", "tipo"]} />);
    expect(screen.getByLabelText(/Título/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Tipo/i)).toBeInTheDocument();
    // Un campo de otro paso no debe estar presente.
    expect(screen.queryByLabelText(/Supervisor/i)).not.toBeInTheDocument();
  });

  it("renderiza el paso de responsables con controles accesibles", () => {
    render(<Harness soloClaves={["responsable", "supervisor"]} />);
    expect(screen.getByLabelText(/Responsable/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Supervisor/i)).toBeInTheDocument();
  });
});

describe("plantilla de bitácora", () => {
  it("ofrece las 8 acciones canónicas como opciones", () => {
    const def = plantillaBitacora(acc);
    const grupo = def.nodos[0] as unknown as { hijos: { clave: string; opciones?: { valor: string }[] }[] };
    const campoAccion = grupo.hijos.find((h) => h.clave === "accion");
    expect(campoAccion?.opciones).toHaveLength(8);
  });
});
