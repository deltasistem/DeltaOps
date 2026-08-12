/**
 * DGP-020.3 · RBAC de presentación CONECTADO (§22/§37).
 *
 * Verifica el ocultamiento efectivo (no deshabilitado) de la administración de
 * mano de obra según rol, y que el técnico ve «Mi mano de obra». Se mockean los
 * providers/hooks para aislar el wiring (sin red).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import type { Rol } from "../lib/identidad/tipos";

const estado = vi.hoisted(() => ({ rol: "CONSULTA" as Rol }));

vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: estado.rol, identityId: "id-x", tenant: { moneda: "CLP" } } }),
}));

// Hooks de datos: devuelven vacío para poder montar sin red.
vi.mock("../lib/manodeobra/hooks", () => ({
  useCatalogoCategorias: () => ({ datos: { catalogo: "categorias-mdo", opciones: [], unidades: ["HORA"] }, cargando: false, error: null, recargar: () => {} }),
  useRecursos: () => ({ datos: [], cargando: false, error: null, recargar: () => {} }),
  useTarifas: () => ({ datos: [], cargando: false, error: null, recargar: () => {} }),
  useMiManoDeObra: () => ({ datos: [], cargando: false, error: null, recargar: () => {} }),
}));

vi.mock("../lib/ordenes/hooks", () => ({
  useIdentidadesElegibles: () => ({ datos: [], cargando: false, error: null, recargar: () => {} }),
}));

import { AdminManoDeObra } from "../lib/manodeobra/AdminManoDeObra";
import { MiManoDeObra } from "../lib/manodeobra/MiManoDeObra";

function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  estado.rol = "CONSULTA";
});

describe("AdminManoDeObra · RBAC de presentación", () => {
  it("TENANT_ADMIN ve las pestañas de administración", () => {
    estado.rol = "TENANT_ADMIN";
    wrap(<AdminManoDeObra />);
    expect(screen.getByText("Categorías")).toBeInTheDocument();
    expect(screen.getByText("Recursos")).toBeInTheDocument();
    expect(screen.getByText("Tarifas")).toBeInTheDocument();
  });

  it("CONSULTA NO ve administración (acceso restringido, sin CTAs)", () => {
    estado.rol = "CONSULTA";
    wrap(<AdminManoDeObra />);
    expect(screen.getByText(/Acceso restringido/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Crear tarifa|Guardar categoría|Definir recurso/i })).toBeNull();
  });

  it("TECNICO NO ve administración (sin CTAs de tarifas)", () => {
    estado.rol = "TECNICO";
    wrap(<AdminManoDeObra />);
    expect(screen.getByText(/Acceso restringido/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tarifa/i })).toBeNull();
  });
});

describe("MiManoDeObra · visibilidad por rol", () => {
  it("TECNICO ve «Mi mano de obra»", () => {
    estado.rol = "TECNICO";
    wrap(<MiManoDeObra />);
    expect(screen.getByText("Mi mano de obra")).toBeInTheDocument();
  });
  it("CONSULTA no ve «Mi mano de obra»", () => {
    estado.rol = "CONSULTA";
    wrap(<MiManoDeObra />);
    expect(screen.queryByText("Mi mano de obra")).toBeNull();
  });
});
