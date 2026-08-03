/**
 * DGP-005 · Pruebas de la familia overlays/feedback del Design System DeltaOps.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import {
  Modal,
  Drawer,
  Alert,
  Tabs,
  Accordion,
  Progress,
  ToastProvider,
  useToast,
  Dropdown,
} from "../components/overlays";

describe("Modal", () => {
  it("no renderiza contenido cuando está cerrado", () => {
    render(
      <Modal abierto={false} onClose={() => {}} titulo="Confirmar">
        Cuerpo
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renderiza como diálogo modal con título accesible y cierra con Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal abierto onClose={onClose} titulo="Confirmar acción">
        Cuerpo del modal
      </Modal>,
    );
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveAccessibleName("Confirmar acción");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cierra al pulsar el botón de cierre", () => {
    const onClose = vi.fn();
    render(
      <Modal abierto onClose={onClose} titulo="Título">
        Cuerpo
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Drawer", () => {
  it("cierra con Escape", () => {
    const onClose = vi.fn();
    render(
      <Drawer abierto onClose={onClose} titulo="Panel lateral">
        Contenido
      </Drawer>,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Alert", () => {
  it("expone role=alert y admite cierre opcional", () => {
    const onClose = vi.fn();
    render(
      <Alert variant="error" titulo="Error" onClose={onClose}>
        Ha ocurrido un problema
      </Alert>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Tabs", () => {
  const items = [
    { id: "a", etiqueta: "Uno", contenido: "Panel uno" },
    { id: "b", etiqueta: "Dos", contenido: "Panel dos" },
    { id: "c", etiqueta: "Tres", contenido: "Panel tres" },
  ];

  it("expone la estructura ARIA de pestañas", () => {
    render(<Tabs items={items} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("aria-selected", "true");
  });

  it("navega entre pestañas con las flechas del teclado", () => {
    render(<Tabs items={items} />);
    const lista = screen.getByRole("tablist");
    fireEvent.keyDown(lista, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Dos" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(lista, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Uno" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Accordion", () => {
  const items = [
    { id: "1", encabezado: "Sección 1", contenido: "Contenido 1" },
    { id: "2", encabezado: "Sección 2", contenido: "Contenido 2" },
  ];

  it("expande y colapsa un panel mediante aria-expanded", () => {
    render(<Accordion items={items} />);
    const disparador = screen.getByRole("button", { name: "Sección 1" });
    expect(disparador).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(disparador);
    expect(disparador).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(disparador);
    expect(disparador).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Progress", () => {
  it("expone role=progressbar con aria-valuenow", () => {
    render(<Progress value={40} etiqueta="Progreso de carga" />);
    const barra = screen.getByRole("progressbar", { name: "Progreso de carga" });
    expect(barra).toHaveAttribute("aria-valuenow", "40");
    expect(barra).toHaveAttribute("aria-valuemax", "100");
  });

  it("omite aria-valuenow en modo indeterminado", () => {
    render(<Progress etiqueta="Cargando" />);
    const barra = screen.getByRole("progressbar", { name: "Cargando" });
    expect(barra).not.toHaveAttribute("aria-valuenow");
  });
});

describe("Dropdown", () => {
  it("alterna aria-expanded y muestra el menú al abrir", () => {
    render(
      <Dropdown
        disparador="Acciones"
        items={[
          { etiqueta: "Editar" },
          { etiqueta: "Eliminar" },
        ]}
      />,
    );
    const disparador = screen.getByRole("button", { name: "Acciones" });
    expect(disparador).toHaveAttribute("aria-haspopup", "menu");
    expect(disparador).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(disparador);
    expect(disparador).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });
});

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function Disparador() {
    const { mostrar } = useToast();
    return (
      <button type="button" onClick={() => mostrar({ variant: "exito", titulo: "Guardado", duracion: 3000 })}>
        Notificar
      </button>
    );
  }

  it("muestra una notificación con role=status y la auto-cierra", () => {
    render(
      <ToastProvider>
        <Disparador />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Notificar" }));
    expect(screen.getByRole("status")).toHaveTextContent("Guardado");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
