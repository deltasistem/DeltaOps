/**
 * DGP-020.3 · Pruebas de FRONTEND de la Fundación de Mano de Obra.
 *
 * Cubre (directiva §40, subconjunto de frontend):
 *  - Sección de OT con VALORADA / SIN_TARIFA / SIN_RECURSO / PENDIENTE.
 *  - SIN_TARIFA muestra «Sin tarifa configurada» y JAMÁS «$0» (§15).
 *  - Costo estimado etiquetado «Estimado» y diferenciado de costo final (§14/§29).
 *  - RBAC de presentación (§22): CONSULTA/TECNICO no ven la administración; el
 *    técnico ve «Mi mano de obra».
 *  - Formateo de moneda (§27) y tiempo (§9): tiempo del backend (no recalculado);
 *    caso monetario determinista 2h30 × $40.000/h = $100.000 (el backend lo
 *    calcula; el frontend lo FORMATEA sin floating point).
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";

import {
  formatearTiempo,
  formatearMoneda,
  formatearTarifa,
  costoPresentacion,
  SIN_TARIFA_TEXTO,
  nombrePresentacion,
} from "../lib/manodeobra/formato";
import { capacidadesManoDeObra } from "../lib/manodeobra/capacidades";
import { VistaSeccionManoDeObra } from "../lib/manodeobra/SeccionManoDeObra";
import { VistaMiManoDeObra } from "../lib/manodeobra/MiManoDeObra";
import { VistaManoDeObraActivo } from "../lib/manodeobra/ManoDeObraActivo";
import type { Resumen, Valoracion } from "../lib/manodeobra/tipos";

function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

/* --------------------------------- Datos -------------------------------- */

// 2h30 = 9_000_000 ms. Tarifa $40.000/h ⇒ backend calcula $100.000 (determinista).
const MS_2H30 = 2.5 * 60 * 60 * 1000;

const valorada: Valoracion = {
  sesionId: "s-1",
  ordenId: "OT-1",
  activoId: "AC-1",
  identityId: "id-ana",
  nombre: "Ana Soto",
  categoriaClave: "tecnico-mecanico",
  tarifaId: "t-1",
  tarifaValor: "40000.000000",
  moneda: "CLP",
  unidad: "HORA",
  efectivoMs: MS_2H30,
  costo: "100000.000000",
  estado: "VALORADA",
};

const sinTarifa: Valoracion = {
  sesionId: "s-2",
  ordenId: "OT-1",
  identityId: "id-luis",
  nombre: "Luis Pérez",
  efectivoMs: 3600_000,
  costo: null,
  estado: "SIN_TARIFA",
};

const sinRecurso: Valoracion = {
  sesionId: "s-3",
  ordenId: "OT-1",
  identityId: "id-x",
  efectivoMs: 1800_000,
  estado: "SIN_RECURSO",
};

// DGP-020.3 fix · sesión CERRADA del activo aún SIN snapshot de valoración: la
// hoja de vida debe mostrar sus HORAS (horas sin costo ≠ sin datos).
const pendiente: Valoracion = {
  sesionId: "s-4",
  ordenId: "OT-2",
  activoId: "AC-1",
  identityId: "id-ana",
  nombre: "Ana Soto",
  efectivoMs: MS_2H30,
  costo: null,
  estado: "PENDIENTE",
};

/* -------------------------------- Formato ------------------------------- */

describe("formato · tiempo y dinero", () => {
  it("formatea el tiempo efectivo del backend como HH:MM:SS (no recalcula)", () => {
    expect(formatearTiempo(MS_2H30)).toBe("02:30:00");
    expect(formatearTiempo(0)).toBe("00:00:00");
    expect(formatearTiempo(null)).toBe("00:00:00");
    expect(formatearTiempo(3661_000)).toBe("01:01:01");
  });

  it("formatea el monto (calculado por backend) con su moneda", () => {
    const f = formatearMoneda("100000.000000", "CLP");
    expect(f).toBeTruthy();
    expect(f).toMatch(/100[.,\s]?000/);
  });

  it("formatea la tarifa como valor moneda/hora", () => {
    expect(formatearTarifa("40000.000000", "CLP", "HORA")).toMatch(/\/h$/);
  });

  it("el DINERO se formatea desde CADENA decimal (PUNTO FIJO) sin pasar por float", () => {
    // Monto grande donde Number/parseFloat perdería precisión: aquí se presenta
    // el entero exacto (Intl recibe la cadena decimal, no un float).
    const grande = formatearMoneda("9007199254740993.000000", "CLP");
    expect(grande).toMatch(/9[.,\s]?007[.,\s]?199[.,\s]?254[.,\s]?740[.,\s]?993/);
    // Fraccional half-up del backend: se muestra hasta 2 decimales.
    const frac = formatearMoneda("46666.666700", "CLP");
    expect(frac).toMatch(/46[.,\s]?666/);
    // Cadena no decimal ⇒ null (no formatea basura).
    expect(formatearMoneda("abc", "CLP")).toBeNull();
    expect(formatearMoneda("35000.1234", "CLP")).toBeTruthy();
  });

  it("AUSENCIA DE TARIFA nunca es $0: devuelve el texto de negocio", () => {
    expect(costoPresentacion(null, "CLP", false)).toBe(SIN_TARIFA_TEXTO);
    // Aunque llegara un 0 espurio con hayTarifa=false, jamás muestra $0.
    expect(costoPresentacion("0.000000", "CLP", false)).toBe(SIN_TARIFA_TEXTO);
    expect(formatearMoneda(null, "CLP")).toBeNull();
    expect(formatearMoneda("100.000000", "")).toBeNull();
  });

  it("nombrePresentacion cae al id abreviado cuando no hay nombre", () => {
    expect(nombrePresentacion("Ana Soto", "id-ana")).toBe("Ana Soto");
    expect(nombrePresentacion(null, "identidad-larga-123456")).toContain("…");
    expect(nombrePresentacion("  ", "corto")).toBe("corto");
  });
});

/* --------------------------- RBAC presentación -------------------------- */

describe("capacidades · RBAC de presentación", () => {
  it("TENANT_ADMIN administra y consulta", () => {
    const c = capacidadesManoDeObra({ rol: "TENANT_ADMIN" });
    expect(c.administrar).toBe(true);
    expect(c.leer).toBe(true);
  });
  it("SUPERVISOR/PLANIFICADOR consultan pero NO administran por rol", () => {
    expect(capacidadesManoDeObra({ rol: "SUPERVISOR" }).administrar).toBe(false);
    expect(capacidadesManoDeObra({ rol: "PLANIFICADOR" }).administrar).toBe(false);
    expect(capacidadesManoDeObra({ rol: "SUPERVISOR" }).leer).toBe(true);
  });
  it("TECNICO ve lo propio pero NO administra", () => {
    const c = capacidadesManoDeObra({ rol: "TECNICO" });
    expect(c.administrar).toBe(false);
    expect(c.verPropia).toBe(true);
    expect(c.leer).toBe(true);
  });
  it("CONSULTA es sólo lectura (no administra)", () => {
    const c = capacidadesManoDeObra({ rol: "CONSULTA" });
    expect(c.administrar).toBe(false);
    expect(c.leer).toBe(true);
  });
  it("una señal explícita del namespace concede administración", () => {
    expect(capacidadesManoDeObra({ rol: "SUPERVISOR", capacidades: ["administrar-manodeobra"] }).administrar).toBe(true);
    expect(capacidadesManoDeObra({ rol: "SUPERVISOR", permisos: ["modulo.manodeobra.admin"] }).administrar).toBe(true);
  });
  it("sin sesión no lee nada", () => {
    expect(capacidadesManoDeObra(null).leer).toBe(false);
  });
});

/* ---------------------- Sección de OT (presentación) -------------------- */

describe("VistaSeccionManoDeObra", () => {
  it("VALORADA: muestra técnico, tiempo, tarifa y costo formateado", () => {
    const resumen: Resumen = {
      ordenId: "OT-1",
      efectivoMsTotal: MS_2H30,
      costoPorMoneda: [{ moneda: "CLP", costo: "100000.000000" }],
      valoraciones: [valorada],
      pendientes: [],
    };
    wrap(<VistaSeccionManoDeObra resumen={resumen} />);
    expect(screen.getByText("Ana Soto")).toBeInTheDocument();
    // «02:30:00» aparece en el total y en la fila.
    expect(screen.getAllByText("02:30:00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Valorada")).toBeInTheDocument();
    // Costo total valorado + costo de la fila, ambos con la moneda (no $0).
    expect(screen.getAllByText(/100[.,\s]?000/).length).toBeGreaterThan(0);
  });

  it("SIN_TARIFA: muestra «Sin tarifa configurada», nunca $0", () => {
    const resumen: Resumen = {
      ordenId: "OT-1",
      efectivoMsTotal: 3600_000,
      costoPorMoneda: [],
      valoraciones: [sinTarifa],
      pendientes: [],
    };
    wrap(<VistaSeccionManoDeObra resumen={resumen} />);
    expect(screen.getAllByText(SIN_TARIFA_TEXTO).length).toBeGreaterThan(0);
    expect(screen.getByText("Sin tarifa")).toBeInTheDocument(); // badge de estado
    // Ningún importe formateado con moneda (p. ej. «$0» / «CLP 0») como costo.
    expect(screen.queryByText(/^\s*(CLP\s*)?\$?\s?0([.,]0+)?\s*(CLP)?\s*$/)).toBeNull();
  });

  it("SIN_RECURSO + PENDIENTE: muestra aviso de pendientes de valoración", () => {
    const resumen: Resumen = {
      ordenId: "OT-1",
      efectivoMsTotal: 1800_000,
      valoraciones: [sinRecurso],
      pendientes: [{ sesionId: "s-9", ordenId: "OT-1", identityId: "id-z", efectivoMs: 600_000 }],
    };
    wrap(<VistaSeccionManoDeObra resumen={resumen} />);
    expect(screen.getByText("Pendiente de valoración")).toBeInTheDocument();
    expect(screen.getByText(/sin valorar/i)).toBeInTheDocument();
    expect(screen.getByText("Sin recurso")).toBeInTheDocument();
  });

  it("COSTO ESTIMADO: etiquetado «Estimado» y diferenciado del final", () => {
    const resumen: Resumen = { ordenId: "OT-1", valoraciones: [], pendientes: [] };
    wrap(
      <VistaSeccionManoDeObra
        resumen={resumen}
        estimado={{ sesionId: "s-live", estimado: true, sinTarifa: false, costo: "12345.000000", moneda: "CLP", efectivoMs: 900_000 }}
      />,
    );
    expect(screen.getByText("Estimado")).toBeInTheDocument();
    expect(screen.getByText(/Costo estimado/i)).toBeInTheDocument();
    expect(screen.getByText(/no es un costo final/i)).toBeInTheDocument();
  });

  it("COSTO ESTIMADO sin tarifa: «Sin tarifa configurada», nunca $0", () => {
    const resumen: Resumen = { ordenId: "OT-1", valoraciones: [], pendientes: [] };
    wrap(
      <VistaSeccionManoDeObra
        resumen={resumen}
        estimado={{ sesionId: "s-live", estimado: true, sinTarifa: true, costo: null, moneda: null, efectivoMs: 900_000 }}
      />,
    );
    expect(screen.getByText("Estimado")).toBeInTheDocument();
    expect(screen.getAllByText(SIN_TARIFA_TEXTO).length).toBeGreaterThan(0);
    // Sin importe formateado como $0 ante ausencia de tarifa.
    expect(screen.queryByText(/^\s*(CLP\s*)?\$?\s?0([.,]0+)?\s*(CLP)?\s*$/)).toBeNull();
  });

  it("estado vacío usa lenguaje de negocio", () => {
    wrap(<VistaSeccionManoDeObra resumen={{ ordenId: "OT-1", valoraciones: [], pendientes: [] }} />);
    expect(screen.getByText(/Aún no hay mano de obra registrada/i)).toBeInTheDocument();
  });
});

/* -------------------------- Experiencia técnico ------------------------- */

describe("VistaMiManoDeObra (técnico)", () => {
  it("lista mis valoraciones con tiempo y estado, y el total efectivo", () => {
    wrap(<VistaMiManoDeObra valoraciones={[valorada, sinTarifa]} />);
    expect(screen.getByText("Mi mano de obra")).toBeInTheDocument();
    expect(screen.getByText("02:30:00")).toBeInTheDocument();
    expect(screen.getByText(/Total efectivo:/i)).toBeInTheDocument();
    // Sin CTAs de tarifas/valoración en la vista del técnico.
    expect(screen.queryByRole("button", { name: /tarifa/i })).toBeNull();
  });
  it("vacío con lenguaje de negocio", () => {
    wrap(<VistaMiManoDeObra valoraciones={[]} />);
    expect(screen.getByText(/Todavía no tienes sesiones de trabajo valoradas/i)).toBeInTheDocument();
  });
});

/* --------------------------- Mano de obra activo ------------------------ */

describe("VistaManoDeObraActivo", () => {
  it("lista valoraciones por activo con OT/técnico/tiempo/costo/estado", () => {
    const { container } = wrap(<VistaManoDeObraActivo valoraciones={[valorada]} />);
    expect(within(container).getByText("Ana Soto")).toBeInTheDocument();
    expect(within(container).getByText("OT-1")).toBeInTheDocument();
    expect(within(container).getByText("02:30:00")).toBeInTheDocument();
  });
  it("estado vacío", () => {
    wrap(<VistaManoDeObraActivo valoraciones={[]} />);
    expect(screen.getByText("Sin mano de obra")).toBeInTheDocument();
  });
  it("sesión cerrada SIN valoración (PENDIENTE): muestra HORAS y «Pendiente de valorar», nunca «Sin mano de obra» ni «$0»", () => {
    const { container } = wrap(<VistaManoDeObraActivo valoraciones={[pendiente]} />);
    // Horas reales visibles (autoridad = sesión), aunque no haya costo.
    expect(within(container).getByText("02:30:00")).toBeInTheDocument();
    expect(within(container).getByText("OT-2")).toBeInTheDocument();
    // Costo honesto: «Pendiente de valorar», NUNCA un importe con moneda ni $0.
    expect(within(container).getAllByText("Pendiente de valorar").length).toBeGreaterThan(0);
    // No se pinta un costo monetario (símbolo $ o código de moneda) para un
    // pendiente: sería un «$0» falso (§15).
    expect(within(container).queryByText(/\$\s?\d|CLP\s?\d/)).toBeNull();
    // NO es el estado vacío honesto (hay datos: horas de una sesión cerrada).
    expect(screen.queryByText("Sin mano de obra")).toBeNull();
  });
  it("sesión ABIERTA (EN_CURSO): muestra HORAS y «En curso», nunca «Sin mano de obra» ni «$0» (causa raíz en vivo)", () => {
    // Causa raíz verificada en vivo: CAM-001/OT-000022 dejó su sesión ABIERTA.
    // La ficha DEBE reflejar el trabajo en curso con sus horas acumuladas.
    const enCurso: Valoracion = { ...pendiente, sesionId: "s-viva", estado: "EN_CURSO" };
    const { container } = wrap(<VistaManoDeObraActivo valoraciones={[enCurso]} />);
    expect(within(container).getByText("02:30:00")).toBeInTheDocument();
    expect(within(container).getAllByText("En curso").length).toBeGreaterThan(0);
    expect(within(container).queryByText(/\$\s?\d|CLP\s?\d/)).toBeNull();
    expect(screen.queryByText("Sin mano de obra")).toBeNull();
  });
});
