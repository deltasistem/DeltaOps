/**
 * DGP-005 · Pruebas de componentes avanzados del Design System DeltaOps.
 * Stepper, Wizard, ChartWrapper, ThemeProvider/useTheme, I18nProvider/useI18n.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, renderHook } from "@testing-library/react";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-do-theme");
  document.documentElement.classList.remove("dark");
  window.localStorage.clear();
});

import {
  Stepper,
  Wizard,
  ChartWrapper,
  paletaCategorica,
  ThemeProvider,
  useTheme,
  I18nProvider,
  useI18n,
} from "../components/advanced";
import { Logo } from "../components/core";

const PASOS = [
  { id: "a", etiqueta: "Datos", descripcion: "Información básica" },
  { id: "b", etiqueta: "Revisión" },
  { id: "c", etiqueta: "Confirmación" },
];

/* ------------------------------- Stepper -------------------------------- */

describe("Stepper", () => {
  it("expone una lista etiquetada con todos los pasos", () => {
    render(<Stepper pasos={PASOS} actual={1} />);
    const lista = screen.getByRole("list", { name: "Progreso por pasos" });
    expect(lista).toBeInTheDocument();
    expect(screen.getByText("Datos")).toBeInTheDocument();
    expect(screen.getByText("Confirmación")).toBeInTheDocument();
    expect(screen.getByText("Información básica")).toBeInTheDocument();
  });

  it("marca el paso actual con aria-current='step'", () => {
    render(<Stepper pasos={PASOS} actual={1} />);
    const actual = screen.getByText("Revisión").closest("li");
    expect(actual).toHaveAttribute("aria-current", "step");
    expect(actual).toHaveClass("do-stepper__item--actual");
  });

  it("marca los pasos anteriores como completados y los siguientes como pendientes", () => {
    render(<Stepper pasos={PASOS} actual={1} />);
    expect(screen.getByText("Datos").closest("li")).toHaveClass("do-stepper__item--completado");
    expect(screen.getByText("Confirmación").closest("li")).toHaveClass("do-stepper__item--pendiente");
  });

  it("aplica la clase de orientación vertical", () => {
    render(<Stepper pasos={PASOS} actual={0} orientation="vertical" />);
    expect(screen.getByRole("list")).toHaveClass("do-stepper--vertical");
  });
});

/* -------------------------------- Wizard -------------------------------- */

const PASOS_WIZARD = [
  { id: "a", etiqueta: "Paso uno", contenido: <p>Contenido uno</p> },
  { id: "b", etiqueta: "Paso dos", contenido: <p>Contenido dos</p> },
];

describe("Wizard", () => {
  it("renderiza el panel del paso activo con role group etiquetado", () => {
    render(<Wizard pasos={PASOS_WIZARD} actual={0} onCambio={() => {}} />);
    const grupo = screen.getByRole("group", { name: "Paso uno" });
    expect(grupo).toBeInTheDocument();
    expect(screen.getByText("Contenido uno")).toBeInTheDocument();
  });

  it("avanza con Siguiente e invoca onCambio", () => {
    const onCambio = vi.fn();
    render(<Wizard pasos={PASOS_WIZARD} actual={0} onCambio={onCambio} />);
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onCambio).toHaveBeenCalledWith(1);
  });

  it("muestra Finalizar en el último paso e invoca onFinalizar", () => {
    const onFinalizar = vi.fn();
    render(<Wizard pasos={PASOS_WIZARD} actual={1} onCambio={() => {}} onFinalizar={onFinalizar} />);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    expect(onFinalizar).toHaveBeenCalledTimes(1);
  });

  it("bloquea Siguiente cuando validar() devuelve false", () => {
    const onCambio = vi.fn();
    const pasos = [
      { id: "a", etiqueta: "Paso uno", contenido: <p>uno</p>, validar: () => false },
      { id: "b", etiqueta: "Paso dos", contenido: <p>dos</p> },
    ];
    render(<Wizard pasos={pasos} actual={0} onCambio={onCambio} />);
    const siguiente = screen.getByRole("button", { name: "Siguiente" });
    expect(siguiente).toBeDisabled();
    fireEvent.click(siguiente);
    expect(onCambio).not.toHaveBeenCalled();
  });

  it("respeta las etiquetas personalizadas de los botones", () => {
    render(
      <Wizard
        pasos={PASOS_WIZARD}
        actual={1}
        onCambio={() => {}}
        etiquetaAnterior="Atrás"
        etiquetaFinalizar="Enviar"
      />,
    );
    expect(screen.getByRole("button", { name: "Atrás" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
  });
});

/* ----------------------------- ChartWrapper ----------------------------- */

describe("ChartWrapper", () => {
  it("expone role figure etiquetado por el título y renderiza children", () => {
    render(
      <ChartWrapper titulo="Producción mensual" descripcion="Últimos 6 meses">
        <div data-testid="grafico" />
      </ChartWrapper>,
    );
    expect(screen.getByRole("figure", { name: "Producción mensual" })).toBeInTheDocument();
    expect(screen.getByTestId("grafico")).toBeInTheDocument();
  });

  it("entrega la paleta categórica al render prop", () => {
    render(
      <ChartWrapper
        titulo="Distribución"
        render={({ colores }) => <span data-testid="n">{colores.length}</span>}
      />,
    );
    expect(screen.getByTestId("n")).toHaveTextContent(String(paletaCategorica.length));
    expect(paletaCategorica[0]).toBe("#D2002B");
  });

  it("muestra estado de error con reintento", () => {
    const onReintentar = vi.fn();
    render(<ChartWrapper titulo="Fallo" error onReintentar={onReintentar} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it("muestra estado vacío cuando vacio es true", () => {
    render(<ChartWrapper titulo="Vacío" vacio vacioTexto="Nada por aquí." />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
    expect(screen.getByText("Nada por aquí.")).toBeInTheDocument();
  });

  it("aplica la altura por defecto (280px) al área del gráfico", () => {
    const { container } = render(
      <ChartWrapper titulo="Alto">
        <div />
      </ChartWrapper>,
    );
    const area = container.querySelector(".do-chart__area") as HTMLElement;
    expect(area.style.height).toBe("280px");
  });
});

/* -------------------------- ThemeProvider / useTheme -------------------- */

describe("ThemeProvider / useTheme", () => {
  it("aplica data-do-theme y sincroniza la clase dark al cambiar el tema", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider temaInicial="light">{children}</ThemeProvider>,
    });
    expect(document.documentElement.getAttribute("data-do-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    act(() => result.current.setTema("dark"));
    expect(result.current.tema).toBe("dark");
    expect(document.documentElement.getAttribute("data-do-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persiste el tema en localStorage con la clave 'do-tema'", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => <ThemeProvider temaInicial="light">{children}</ThemeProvider>,
    });
    act(() => result.current.setTema("dark"));
    expect(window.localStorage.getItem("do-tema")).toBe("dark");
  });

  it("useTheme lanza error fuera del proveedor", () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
  });
});

/* ------------------------------ Logo (auto) ----------------------------- */

describe("Logo · selección de variante por tema (DGP-021.3 §30.2)", () => {
  const srcDe = () => (screen.getByRole("img") as HTMLImageElement).getAttribute("src") ?? "";

  it("imagotipo-auto usa el asset CLARO cuando el tema efectivo es claro", () => {
    render(
      <ThemeProvider temaInicial="light">
        <Logo variant="imagotipo-auto" />
      </ThemeProvider>,
    );
    expect(srcDe()).toContain("logo-color-negro");
  });

  it("imagotipo-auto cambia al asset OSCURO (Full color-Blanco) al pasar a oscuro", async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => (
        <ThemeProvider temaInicial="light">
          <Logo variant="imagotipo-auto" />
          {children}
        </ThemeProvider>
      ),
    });
    expect(srcDe()).toContain("logo-color-negro");
    // El ThemeProvider togglea `.dark` en <html>; el Logo lo observa por
    // MutationObserver (entrega asíncrona), así que dejamos correr los microtasks.
    await act(async () => {
      result.current.setTema("dark");
      await Promise.resolve();
    });
    expect(srcDe()).toContain("logo-full-color-blanco");
  });

  it("la variante oscura explícita SIEMPRE usa el asset Full color-Blanco", () => {
    render(<Logo variant="imagotipo-oscuro" />);
    expect(srcDe()).toContain("logo-full-color-blanco");
  });
});

/* --------------------------- I18nProvider / useI18n --------------------- */

describe("I18nProvider / useI18n", () => {
  it("traduce claves existentes y usa el idioma por defecto 'es'", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => (
        <I18nProvider mensajes={{ es: { saludo: "Hola" } }}>{children}</I18nProvider>
      ),
    });
    expect(result.current.idioma).toBe("es");
    expect(result.current.t("saludo")).toBe("Hola");
  });

  it("devuelve el valor por defecto o la clave cuando no existe traducción", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });
    expect(result.current.t("inexistente", "Respaldo")).toBe("Respaldo");
    expect(result.current.t("sin.respaldo")).toBe("sin.respaldo");
  });

  it("cambia de idioma con setIdioma", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => (
        <I18nProvider mensajes={{ es: { hola: "Hola" }, en: { hola: "Hello" } }}>
          {children}
        </I18nProvider>
      ),
    });
    expect(result.current.t("hola")).toBe("Hola");
    act(() => result.current.setIdioma("en"));
    expect(result.current.idioma).toBe("en");
    expect(result.current.t("hola")).toBe("Hello");
  });
});
