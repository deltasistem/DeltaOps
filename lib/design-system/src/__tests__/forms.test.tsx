/**
 * DGP-005 · Pruebas de los componentes de formulario del Design System DeltaOps.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

// Vitest no limpia el DOM automáticamente sin globals; lo hacemos explícito.
afterEach(() => {
  cleanup();
});
import {
  Checkbox,
  Field,
  Input,
  PasswordInput,
  Radio,
  RadioGroup,
  SearchInput,
  Select,
  Switch,
  Textarea,
} from "../components/forms";

describe("Field", () => {
  it("renderiza label, descripción y asocia el control por id/aria-describedby", () => {
    render(
      <Field label="Correo electrónico" description="Usaremos este correo para avisos.">
        <Input placeholder="nombre@empresa.com" />
      </Field>,
    );
    const control = screen.getByRole("textbox");
    expect(screen.getByText("Correo electrónico")).toBeInTheDocument();
    expect(control).toHaveAttribute("id");
    const describedBy = control.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      "Usaremos este correo para avisos.",
    );
  });

  it("marca el control como inválido y muestra el error con role=alert", () => {
    render(
      <Field label="Nombre" error="Este campo es obligatorio." required>
        <Input />
      </Field>,
    );
    const control = screen.getByRole("textbox");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAttribute("aria-required", "true");
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Este campo es obligatorio.");
    expect(control.getAttribute("aria-describedby")).toContain(alerta.id);
  });
});

describe("Input", () => {
  it("asocia label mediante Field y permite escribir texto", () => {
    render(
      <Field label="Ciudad">
        <Input />
      </Field>,
    );
    const control = screen.getByLabelText("Ciudad") as HTMLInputElement;
    fireEvent.change(control, { target: { value: "Madrid" } });
    expect(control).toHaveValue("Madrid");
  });
});

describe("PasswordInput", () => {
  it("alterna la visibilidad de la contraseña con el botón accesible", () => {
    render(
      <Field label="Contraseña">
        <PasswordInput />
      </Field>,
    );
    const control = screen.getByLabelText("Contraseña");
    expect(control).toHaveAttribute("type", "password");
    const boton = screen.getByRole("button", { name: "Mostrar contraseña" });
    fireEvent.click(boton);
    expect(control).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toBeInTheDocument();
  });
});

describe("SearchInput", () => {
  it("muestra el botón limpiar al escribir y lo vacía al pulsarlo", () => {
    render(
      <Field label="Buscar">
        <SearchInput />
      </Field>,
    );
    const control = screen.getByLabelText("Buscar") as HTMLInputElement;
    fireEvent.change(control, { target: { value: "bomba" } });
    expect(control).toHaveValue("bomba");
    const limpiar = screen.getByRole("button", { name: "Limpiar búsqueda" });
    fireEvent.click(limpiar);
    expect(control).toHaveValue("");
  });
});

describe("Textarea", () => {
  it("hereda el estado inválido del Field", () => {
    render(
      <Field label="Comentarios" error="Demasiado largo.">
        <Textarea />
      </Field>,
    );
    expect(screen.getByLabelText("Comentarios")).toHaveAttribute("aria-invalid", "true");
  });
});

describe("Checkbox", () => {
  it("expone el estado indeterminado mediante aria-checked=mixed", () => {
    render(<Checkbox label="Seleccionar todo" indeterminate />);
    const control = screen.getByRole("checkbox", { name: "Seleccionar todo" });
    expect(control).toHaveAttribute("aria-checked", "mixed");
    expect((control as HTMLInputElement).indeterminate).toBe(true);
  });

  it("se marca al hacer clic", () => {
    render(<Checkbox label="Acepto los términos" />);
    const control = screen.getByRole("checkbox", { name: "Acepto los términos" });
    expect(control).not.toBeChecked();
    fireEvent.click(control);
    expect(control).toBeChecked();
  });
});

describe("RadioGroup", () => {
  it("renderiza role=radiogroup y navega con las flechas del teclado", () => {
    const onChange = vi.fn();

    function Ejemplo() {
      const [valor, setValor] = useState("baja");
      return (
        <RadioGroup
          label="Prioridad"
          value={valor}
          onChange={(v) => {
            setValor(v);
            onChange(v);
          }}
        >
          <Radio value="baja" label="Baja" />
          <Radio value="media" label="Media" />
          <Radio value="alta" label="Alta" />
        </RadioGroup>
      );
    }

    render(<Ejemplo />);
    const grupo = screen.getByRole("radiogroup", { name: "Prioridad" });
    expect(grupo).toBeInTheDocument();

    const baja = screen.getByRole("radio", { name: "Baja" });
    expect(baja).toBeChecked();
    baja.focus();
    fireEvent.keyDown(grupo, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("media");
    expect(screen.getByRole("radio", { name: "Media" })).toBeChecked();
  });
});

describe("Switch", () => {
  it("tiene role=switch y alterna su estado al hacer clic", () => {
    function Ejemplo() {
      const [on, setOn] = useState(false);
      return <Switch label="Notificaciones" checked={on} onChange={(e) => setOn(e.target.checked)} />;
    }

    render(<Ejemplo />);
    const control = screen.getByRole("switch", { name: "Notificaciones" });
    expect(control).not.toBeChecked();
    fireEvent.click(control);
    expect(control).toBeChecked();
  });
});

describe("Select", () => {
  it("asocia label y permite seleccionar una opción", () => {
    render(
      <Field label="Estado">
        <Select placeholder="Seleccione…">
          <option value="abierto">Abierto</option>
          <option value="cerrado">Cerrado</option>
        </Select>
      </Field>,
    );
    const control = screen.getByLabelText("Estado") as HTMLSelectElement;
    fireEvent.change(control, { target: { value: "cerrado" } });
    expect(control).toHaveValue("cerrado");
  });
});
