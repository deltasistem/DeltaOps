/**
 * DGP-005 · Pruebas de accesibilidad transversales del Design System DeltaOps.
 * Cubren foco atrapado/restaurado, cierre por teclado, estados accesibles,
 * requisitos ARIA y humo de tema oscuro.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

afterEach(() => cleanup());

import { Modal, Drawer, Tooltip } from "../components/overlays";
import { Button, IconButton } from "../components/core";
import { Pagination } from "../components/data";

describe("Modal · foco", () => {
  it("atrapa el foco: Tab desde el último elemento vuelve al primero", () => {
    render(
      <Modal
        abierto
        onClose={() => {}}
        titulo="Confirmar"
        pie={
          <>
            <Button>Cancelar</Button>
            <Button>Aceptar</Button>
          </>
        }
      >
        Cuerpo
      </Modal>,
    );
    const dialogo = screen.getByRole("dialog");
    const enfocables = within(dialogo).getAllByRole("button");
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];

    ultimo.focus();
    expect(document.activeElement).toBe(ultimo);
    // Tab hacia adelante desde el último debe ciclar al primero.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(primero);

    // Shift+Tab desde el primero debe ciclar al último.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it("restaura el foco al elemento disparador al cerrar", () => {
    function Host() {
      const [abierto, setAbierto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAbierto(true)}>
            Abrir
          </button>
          <Modal abierto={abierto} onClose={() => setAbierto(false)} titulo="Diálogo">
            Cuerpo
          </Modal>
        </>
      );
    }
    render(<Host />);
    const disparador = screen.getByRole("button", { name: "Abrir" });
    disparador.focus();
    fireEvent.click(disparador);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Cerrar con Escape debe restaurar el foco al disparador.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });
});

describe("Drawer · teclado y foco", () => {
  it("cierra con Escape y restaura el foco al disparador", () => {
    function Host() {
      const [abierto, setAbierto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAbierto(true)}>
            Abrir panel
          </button>
          <Drawer abierto={abierto} onClose={() => setAbierto(false)} titulo="Panel">
            Contenido
          </Drawer>
        </>
      );
    }
    render(<Host />);
    const disparador = screen.getByRole("button", { name: "Abrir panel" });
    disparador.focus();
    fireEvent.click(disparador);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(disparador);
  });
});

describe("Button · estado de carga", () => {
  it("expone aria-busy y queda deshabilitado durante loading", () => {
    render(<Button loading>Guardar</Button>);
    const boton = screen.getByRole("button", { name: "Guardar" });
    expect(boton).toHaveAttribute("aria-busy", "true");
    expect(boton).toBeDisabled();
  });
});

describe("IconButton · etiqueta accesible", () => {
  it("exige y expone una etiqueta accesible", () => {
    render(<IconButton label="Cerrar sesión">×</IconButton>);
    const boton = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(boton).toHaveAttribute("aria-label", "Cerrar sesión");
    expect(boton).toHaveAttribute("title", "Cerrar sesión");
  });
});

describe("Tema oscuro · humo", () => {
  it("renderiza los componentes dentro de un contenedor data-do-theme=dark", () => {
    render(
      <div data-do-theme="dark">
        <Button>Acción</Button>
        <Pagination pagina={1} totalPaginas={3} onChange={() => {}} />
      </div>,
    );
    expect(screen.getByRole("button", { name: "Acción" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Paginación" })).toBeInTheDocument();
  });
});

describe("Pagination · página actual", () => {
  it("marca aria-current='page' en la página activa", () => {
    render(<Pagination pagina={2} totalPaginas={5} onChange={() => {}} />);
    const activa = screen.getByRole("button", { name: "Página 2" });
    expect(activa).toHaveAttribute("aria-current", "page");
    const otra = screen.getByRole("button", { name: "Página 3" });
    expect(otra).not.toHaveAttribute("aria-current");
  });
});

describe("Tooltip · foco de teclado", () => {
  it("aparece al recibir foco de teclado tras el retardo", () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip contenido="Ayuda contextual" retardo={200}>
          <button type="button">Info</button>
        </Tooltip>,
      );
      const contenedor = screen.getByText("Info").closest(".do-tooltip") as HTMLElement;
      expect(screen.queryByRole("tooltip")).toBeNull();
      fireEvent.focus(contenedor);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("Ayuda contextual");
    } finally {
      vi.useRealTimers();
    }
  });
});
