/**
 * DGP-010 · Punto 9: experiencia móvil de campo. Verifica objetivos táctiles
 * grandes en la barra de acciones y la captura de geolocalización (hook).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";
import { BarraAccionesCampo, AccionRapida, useGeolocalizacion } from "../lib/ecosistema/campo";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("BarraAccionesCampo", () => {
  it("es un toolbar accesible con acciones grandes a una mano", () => {
    render(
      <ThemeProvider>
        <BarraAccionesCampo>
          <AccionRapida onClick={() => {}}>Inicio</AccionRapida>
        </BarraAccionesCampo>
      </ThemeProvider>,
    );
    const barra = screen.getByRole("toolbar", { name: /acciones/i });
    expect(barra).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inicio" })).toBeInTheDocument();
  });

  it("dispara el callback al pulsar la acción rápida", () => {
    const onClick = vi.fn();
    render(<ThemeProvider><AccionRapida onClick={onClick}>Pausa</AccionRapida></ThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Pausa" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("useGeolocalizacion", () => {
  it("captura la posición desde navigator.geolocation (fecha inyectada)", () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: -33.45, longitude: -70.66, accuracy: 12 }, timestamp: 0 } as GeolocationPosition),
    );
    Object.defineProperty(global.navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    const { result } = renderHook(() => useGeolocalizacion(() => "2024-06-10T00:00:00.000Z"));
    act(() => result.current.capturar());
    expect(result.current.posicion?.latitud).toBe(-33.45);
    expect(result.current.posicion?.capturadaAt).toBe("2024-06-10T00:00:00.000Z");
    expect(result.current.error).toBeNull();
  });

  it("reporta error cuando la geolocalización no está disponible", () => {
    Object.defineProperty(global.navigator, "geolocation", { value: undefined, configurable: true });
    const { result } = renderHook(() => useGeolocalizacion(() => "x"));
    act(() => result.current.capturar());
    expect(result.current.error).toMatch(/no disponible/i);
  });
});
