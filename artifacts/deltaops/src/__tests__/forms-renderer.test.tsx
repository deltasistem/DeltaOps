/**
 * DGP-008.3 · Pruebas del renderer genérico FormularioDinamico (React) + a11y.
 */
import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaAlta, REGLAS_ALTA } from "../lib/forms/plantillas";
import type { ValoresFormulario } from "../lib/forms/tipos";

const def = plantillaAlta({
  tipos: [{ valor: "maquinaria", etiqueta: "Maquinaria" }],
});

function Harness({ soloClaves }: { soloClaves?: string[] }) {
  const [valores, setValores] = useState<ValoresFormulario>({});
  return (
    <ThemeProvider>
      <FormularioDinamico
        definicion={def}
        reglas={REGLAS_ALTA}
        valores={valores}
        onCambio={setValores}
        soloClaves={soloClaves}
        hallazgos={[]}
      />
    </ThemeProvider>
  );
}

describe("FormularioDinamico", () => {
  it("renderiza sólo los campos del paso indicado (soloClaves)", () => {
    render(<Harness soloClaves={["codigoEmpresarial", "nombre"]} />);
    expect(screen.getByLabelText(/Código empresarial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre/i)).toBeInTheDocument();
    // Un campo de otro paso no debe estar presente.
    expect(screen.queryByLabelText(/Nº de serie/i)).not.toBeInTheDocument();
  });

  it("cada control tiene una etiqueta accesible asociada (a11y)", () => {
    render(<Harness soloClaves={["codigoEmpresarial", "nombre", "descripcion"]} />);
    for (const et of [/Código empresarial/i, /Nombre/i, /Descripción/i]) {
      const el = screen.getByLabelText(et);
      expect(el).toBeInTheDocument();
      expect(el.id).toBeTruthy();
    }
  });

  it("propaga los cambios del usuario a través de onCambio", () => {
    render(<Harness soloClaves={["nombre"]} />);
    const input = screen.getByLabelText(/Nombre/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bomba" } });
    expect(input.value).toBe("Bomba");
  });

  it("renderiza el select de tipo con las opciones de catálogo", () => {
    render(<Harness soloClaves={["tipo"]} />);
    const select = screen.getByLabelText(/Tipo/i) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Maquinaria" })).toBeInTheDocument();
  });
});
