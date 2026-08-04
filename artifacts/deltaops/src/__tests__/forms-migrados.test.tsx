/**
 * DGP-008.3 · Pruebas de los formularios migrados a Dynamic Forms Engine:
 * filtros (listado/timeline), adjunto (con campo archivo), comentario, relación,
 * tipo de etiqueta y entrada manual de escaneo. Se verifica que se renderizan a
 * través del renderer genérico (controles del DS) y que la validación funciona.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import {
  plantillaFiltrosListado,
  plantillaFiltrosTimeline,
  plantillaAdjunto,
  plantillaComentario,
  plantillaRelacion,
  plantillaTipoEtiqueta,
  plantillaEscaneoManual,
} from "../lib/forms/plantillas";
import { validar } from "../lib/forms/motor";
import type { ValoresFormulario } from "../lib/forms/tipos";
import type { DefinicionFormulario } from "@workspace/dynamic-forms/definicion";

function Harness({ def, inicial = {} }: { def: DefinicionFormulario; inicial?: ValoresFormulario }) {
  const [valores, setValores] = useState<ValoresFormulario>(inicial);
  return (
    <ThemeProvider>
      <FormularioDinamico definicion={def} valores={valores} onCambio={setValores} />
    </ThemeProvider>
  );
}

describe("filtros del listado (Dynamic Form)", () => {
  const def = plantillaFiltrosListado(
    [{ valor: "OPERATIVO", etiqueta: "Operativo" }],
    { tipos: [{ valor: "maquinaria", etiqueta: "Maquinaria" }] },
  );

  it("renderiza selects de catálogo y el campo responsable con etiqueta accesible", () => {
    render(<Harness def={def} />);
    expect((screen.getByLabelText(/Estado/i) as HTMLSelectElement).tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Maquinaria" })).toBeInTheDocument();
    const resp = screen.getByLabelText(/Responsable/i) as HTMLInputElement;
    expect(resp.tagName).toBe("INPUT");
  });

  it("no impone obligatoriedad (filtros opcionales)", () => {
    expect(validar(def, {}, {})).toHaveLength(0);
  });
});

describe("filtros de timeline (Dynamic Form)", () => {
  it("incluye actor, estado, entidad y rango de fechas", () => {
    const def = plantillaFiltrosTimeline([{ valor: "OPERATIVO", etiqueta: "Operativo" }]);
    render(<Harness def={def} />);
    expect(screen.getByLabelText(/Actor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Entidad relacionada/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/Desde/i) as HTMLInputElement).type).toBe("date");
  });
});

describe("registro de documentación (campo archivo)", () => {
  const def = plantillaAdjunto();

  it("renderiza un input file real para el campo adjunto", () => {
    render(<Harness def={def} inicial={{ categoria: "manual" }} />);
    const file = screen.getByLabelText(/Archivo/i) as HTMLInputElement;
    expect(file.tagName).toBe("INPUT");
    expect(file.type).toBe("file");
  });

  it("obliga a categoría y archivo; un File local satisface el archivo sin fallar Zod", () => {
    const vacio = validar(def, {}, {});
    expect(vacio.some((h) => h.campo === "archivo" && h.severidad === "error")).toBe(true);
    const f = new File([new Uint8Array([1, 2, 3])], "manual.pdf", { type: "application/pdf" });
    const con = validar(def, {}, { categoria: "manual", archivo: f });
    expect(con).toHaveLength(0);
  });
});

describe("comentario / relación / tipo etiqueta / escaneo manual", () => {
  it("comentario exige texto", () => {
    const def = plantillaComentario();
    expect(validar(def, {}, {}).some((h) => h.campo === "texto")).toBe(true);
    expect(validar(def, {}, { texto: "hola" })).toHaveLength(0);
  });

  it("relación exige tipo y destino", () => {
    const def = plantillaRelacion([{ valor: "padre-de", etiqueta: "Padre de" }]);
    const h = validar(def, {}, { tipo: "padre-de" });
    expect(h.some((x) => x.campo === "destinoId")).toBe(true);
  });

  it("tipo de etiqueta ofrece QR/barcode/NFC vía select del DS", () => {
    const def = plantillaTipoEtiqueta();
    render(<Harness def={def} inicial={{ tipo: "qr" }} />);
    expect((screen.getByLabelText(/Tipo de etiqueta/i) as HTMLSelectElement).tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: /Código de barras/i })).toBeInTheDocument();
  });

  it("escaneo manual exige un código", () => {
    const def = plantillaEscaneoManual();
    const input = def.nodos;
    expect(input.length).toBe(1);
    expect(validar(def, {}, {}).some((h) => h.campo === "codigo")).toBe(true);
    expect(validar(def, {}, { codigo: "abc" })).toHaveLength(0);
  });

  it("el input manual se propaga por onCambio", () => {
    const def = plantillaEscaneoManual();
    render(<Harness def={def} />);
    const input = screen.getByLabelText(/Código o URL/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ABC-123" } });
    expect(input.value).toBe("ABC-123");
  });
});
