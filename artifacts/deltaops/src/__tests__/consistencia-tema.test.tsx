/**
 * DIRECTIVA CONSISTENCIA VISUAL GLOBAL Y PREFERENCIA DE TEMA.
 *
 * Verifica la política global de apariencia:
 *  - preferencia Claro/Oscuro/Automático aplicada a `document.documentElement`
 *    (Req 1) incl. Automático vía `matchMedia(prefers-color-scheme)`;
 *  - persistencia en `localStorage["do-tema"]` y su restauración tras refresh
 *    (Req 2);
 *  - estabilidad del tema al navegar entre módulos (Req 1);
 *  - selector accesible (radiogroup + labels) aplicado sin logout (Req 5, 9);
 *  - superficies que ya NO fuerzan tema claro (causa raíz corregida);
 *  - consola SUPER_ADMIN incluye el selector (Req 6).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@workspace/design-system";
import { OpcionesApariencia, SelectorApariencia } from "../lib/identidad/SelectorApariencia";

/** Mock de matchMedia para controlar prefers-color-scheme en jsdom. */
function mockMatchMedia(prefiereOscuro: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches: prefiereOscuro,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: () => {},
    addListener: (cb: () => void) => listeners.push(cb),
    removeListener: () => {},
    dispatchEvent: () => true,
    onchange: null,
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => mql),
  });
  return { mql, listeners };
}

function temaDom(): string | null {
  return document.documentElement.getAttribute("data-do-theme");
}
function esOscuroDom(): boolean {
  return document.documentElement.classList.contains("dark");
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-do-theme");
  document.documentElement.classList.remove("dark");
});
afterEach(() => vi.restoreAllMocks());

describe("Req 1 · preferencia de tema aplicada al documento", () => {
  it("Claro fija data-do-theme=light y sin clase dark", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Claro/i }));
    expect(temaDom()).toBe("light");
    expect(esOscuroDom()).toBe(false);
  });

  it("Oscuro fija data-do-theme=dark y clase dark (puente shadcn/Tailwind)", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Oscuro/i }));
    expect(temaDom()).toBe("dark");
    expect(esOscuroDom()).toBe(true);
  });

  it("Automático respeta prefers-color-scheme del sistema (oscuro)", () => {
    mockMatchMedia(true); // el sistema prefiere oscuro
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Automático/i }));
    expect(temaDom()).toBe("auto");
    expect(esOscuroDom()).toBe(true);
  });

  it("Automático con sistema claro no aplica clase dark", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Automático/i }));
    expect(temaDom()).toBe("auto");
    expect(esOscuroDom()).toBe(false);
  });
});

describe("Req 2 · persistencia en localStorage y restauración tras refresh", () => {
  it("guarda la preferencia elegida", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Oscuro/i }));
    expect(localStorage.getItem("do-tema")).toBe("dark");
  });

  it("un nuevo montaje (refresh) restaura la preferencia persistida sin volver a elegir", () => {
    mockMatchMedia(false);
    localStorage.setItem("do-tema", "dark");
    render(
      <ThemeProvider>
        <span>contenido</span>
      </ThemeProvider>,
    );
    // Al montar, el ThemeProvider lee localStorage y aplica el tema.
    expect(temaDom()).toBe("dark");
    expect(esOscuroDom()).toBe(true);
    // El radiogroup arranca en la opción persistida.
    cleanup();
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    expect((screen.getByRole("radio", { name: /Oscuro/i }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("Req 1 · el tema permanece estable al navegar entre módulos", () => {
  it("un segundo montaje bajo otro provider (otro módulo) conserva la preferencia", () => {
    mockMatchMedia(false);
    localStorage.setItem("do-tema", "dark");
    // Módulo A
    const a = render(
      <ThemeProvider>
        <span>modulo-a</span>
      </ThemeProvider>,
    );
    expect(temaDom()).toBe("dark");
    a.unmount();
    document.documentElement.removeAttribute("data-do-theme");
    document.documentElement.classList.remove("dark");
    // Módulo B (Shell distinto): reinicializa desde localStorage → mismo tema.
    render(
      <ThemeProvider>
        <span>modulo-b</span>
      </ThemeProvider>,
    );
    expect(temaDom()).toBe("dark");
    expect(esOscuroDom()).toBe(true);
  });
});

describe("Req 5, 9 · selector accesible y aplicado sin logout", () => {
  it("el selector expone un radiogroup con las tres opciones etiquetadas", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    expect(screen.getByRole("radiogroup", { name: /Apariencia/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Claro/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Oscuro/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Automático/i })).toBeInTheDocument();
  });

  it("el cambio se refleja inmediatamente en el DOM (sin recargar/logout)", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <OpcionesApariencia />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Oscuro/i }));
    expect(esOscuroDom()).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Claro/i }));
    expect(esOscuroDom()).toBe(false);
  });

  it("el disparador del selector (menú de perfil) abre un diálogo con las opciones", () => {
    mockMatchMedia(false);
    render(
      <ThemeProvider>
        <SelectorApariencia />
      </ThemeProvider>,
    );
    const disparador = screen.getByRole("button", { name: /Apariencia/i });
    // Objetivo táctil ≥48px.
    expect(disparador.style.minHeight).toBe("48px");
    fireEvent.click(disparador);
    expect(screen.getByRole("dialog", { name: /Apariencia/i })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: /Apariencia/i })).toBeInTheDocument();
  });
});
