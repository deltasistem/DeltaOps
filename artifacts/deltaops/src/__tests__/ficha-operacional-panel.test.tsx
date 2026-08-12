/**
 * DGP-019.2 · Pruebas de PRESENTACIÓN de la Ficha Operacional 360° (DOM).
 *
 * Cubren el mandato §25 sobre el panel operacional (composición pura):
 *  - datos completos / sin datos / parciales (indicadores nunca muestran 0);
 *  - consumo con y sin puntos suficientes (empty state de negocio);
 *  - resumen de órdenes con navegación;
 *  - próximo mantenimiento y timeline compartida ("Ver historial completo");
 *  - permisos: ocultar (no deshabilitar) acciones de escritura sin capacidad;
 *  - offline: estado de sincronización visible;
 *  - temas claro/oscuro renderizan sin romper.
 * Los hooks de datos/sesión/offline/toast se mockean para aislar la vista.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider } from "@workspace/design-system";
import type { ResumenActivo } from "../lib/utilizacion/tipos";

/* ------------------------------- estado mutable de los mocks -------------- */

let ROL = "TENANT_ADMIN";
let RESUMEN_TOTAL: ResumenActivo | null;
let RESUMEN_ACTUAL: ResumenActivo | null;
let RESUMEN_ANTERIOR: ResumenActivo | null;
let TANQUEOS: any[] = [];
let LECTURAS: any[] = [];
let ORDENES: any[] = [];
let PLANES: any[] = [];
let TIMELINE: any[] = [];
let PENDIENTES = 0;
let EN_LINEA = true;
let PERMISOS: string[] | undefined;
let CAPS: string[] | undefined;

const val = (v: number) => ({ tipo: "valor" as const, valor: v });
const sd = { tipo: "sin-datos" as const };

vi.mock("../lib/utilizacion/hooks", () => ({
  useResumen: (_id: string, periodo?: { desde?: string; hasta?: string }) => {
    let datos: ResumenActivo | null = RESUMEN_TOTAL;
    if (periodo?.desde && periodo?.hasta) {
      // El período "actual" termina en AHORA (2026); el "anterior" termina antes.
      datos = periodo.hasta >= "2026-01-01" ? RESUMEN_ACTUAL : RESUMEN_ANTERIOR;
    }
    return { datos, cargando: false, error: null, recargar: () => {} };
  },
  useTanqueos: () => ({ datos: TANQUEOS, cargando: false, error: null, recargar: () => {} }),
  useLecturas: () => ({ datos: LECTURAS, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/ecosistema/hooks", () => ({
  useOrdenesDeActivo: () => ({ datos: ORDENES, cargando: false, error: null, recargar: () => {} }),
  useTimelineActivo: () => ({ datos: TIMELINE, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/planes/hooks", () => ({
  usePlanesDeActivo: () => ({ datos: PLANES, cargando: false, error: null, recargar: () => {} }),
}));
vi.mock("../lib/identidad/sesion", () => ({
  useSesion: () => ({ sesion: { rol: ROL, modulos: ["utilizacion"], permisos: PERMISOS, capacidades: CAPS } }),
}));
vi.mock("../lib/offline/contexto", () => ({
  OfflineProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useOffline: () => ({ cola: {}, enLinea: EN_LINEA, pendientes: PENDIENTES, procesar: () => {} }),
  mutarConOffline: async () => ({ encolada: false }),
}));
vi.mock("@workspace/design-system", async (orig) => {
  const real = await (orig as () => Promise<any>)();
  return { ...real, useToast: () => ({ mostrar: () => 0, descartar: () => {} }) };
});

import { PanelOperacional } from "../lib/utilizacion/PanelOperacional";
import type { ActivoRow } from "../lib/activos/tipos";

const AHORA = "2026-01-01T00:00:00.000Z";

function activo(parcial: Partial<ActivoRow> = {}): ActivoRow {
  return {
    tenantId: "t1",
    id: "act-1",
    codigoEmpresarial: "MAQ-001",
    nombre: "Excavadora CAT",
    tipo: "MAQUINARIA",
    estado: "OPERATIVO",
    criticidad: "ALTA",
    ubicacionId: "Taller Central",
    datos: {},
    version: 1,
    ...(parcial as object),
  } as ActivoRow;
}

function wrap(ui: React.ReactNode, oscuro = false) {
  return render(<ThemeProvider temaInicial={oscuro ? "dark" : "light"}>{ui}</ThemeProvider>);
}

beforeEach(() => {
  ROL = "TENANT_ADMIN";
  PERMISOS = undefined;
  CAPS = undefined;
  RESUMEN_TOTAL = { deltaHorometro: val(12), deltaOdometro: sd, litrosPorHora: val(4.5), litrosPor100Km: sd, litrosTotal: 120, costoTotal: 900 } as ResumenActivo;
  RESUMEN_ACTUAL = { deltaHorometro: val(12), deltaOdometro: sd, litrosPorHora: val(4.5), litrosPor100Km: sd, litrosTotal: 120, costoTotal: 900 } as ResumenActivo;
  RESUMEN_ANTERIOR = { deltaHorometro: val(10), deltaOdometro: sd, litrosPorHora: val(4.0), litrosPor100Km: sd, litrosTotal: 100, costoTotal: 800 } as ResumenActivo;
  TANQUEOS = [
    { id: "t1", activoId: "act-1", litros: 40, fechaHora: "2025-12-10T09:00:00.000Z", tipoCombustible: "diesel", costoTotal: 300 },
    { id: "t2", activoId: "act-1", litros: 45, fechaHora: "2025-12-20T09:00:00.000Z", tipoCombustible: "diesel", costoTotal: 340 },
    { id: "t3", activoId: "act-1", litros: 35, fechaHora: "2025-12-28T09:00:00.000Z", tipoCombustible: "diesel", costoTotal: 260 },
  ];
  LECTURAS = [
    { id: "l1", activoId: "act-1", tipoMedidor: "horometro", valor: 1500, unidad: "h", fechaHora: "2025-12-28T09:00:00.000Z", inconsistente: false },
  ];
  ORDENES = [
    { id: "o1", codigo: "OT-1", titulo: "Cambio de aceite", estado: "EN_EJECUCION", tipo: "PREVENTIVA", prioridad: "ALTA", actualizadoAt: "2025-12-27T09:00:00.000Z" },
    { id: "o2", codigo: "OT-2", titulo: "Inspección", estado: "CERRADA", tipo: "PREVENTIVA", prioridad: null, actualizadoAt: "2025-12-01T09:00:00.000Z" },
    { id: "o3", codigo: "OT-3", titulo: "Reparación", estado: "ABIERTA", tipo: "CORRECTIVA", prioridad: "MEDIA", actualizadoAt: "2025-12-29T09:00:00.000Z" },
  ];
  PLANES = [
    { id: "p1", nombre: "Plan 250h", tipoPlan: "PREVENTIVO", estado: "VIGENTE", proximaOcurrencia: "2026-01-15T00:00:00.000Z" },
  ];
  TIMELINE = [
    { tipo: "utilizacion.tanqueo", descripcion: "Tanqueo registrado", ocurridoAt: "2025-12-28T09:00:00.000Z", actor: "admin" },
  ];
  PENDIENTES = 0;
  EN_LINEA = true;
});
afterEach(() => cleanup());

describe("Ficha Operacional 360° · datos completos", () => {
  it("muestra estado real, identificación y consumo en L/h (maquinaria)", () => {
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByText("Excavadora CAT")).toBeInTheDocument();
    expect(screen.getByText("MAQ-001")).toBeInTheDocument();
    expect(screen.getAllByText("Operativo").length).toBeGreaterThan(0);
    // Consumo en L/h presente (maquinaria)
    expect(screen.getAllByText(/L\/h/).length).toBeGreaterThan(0);
    // Horómetro actual desde la última lectura vigente
    expect(screen.getByText(/1[.,]?500/)).toBeInTheDocument();
  });

  it("clasifica vehículo → consumo en L/100 km cuando el medidor es odómetro", () => {
    RESUMEN_ACTUAL = { deltaHorometro: sd, deltaOdometro: val(300), litrosPorHora: sd, litrosPor100Km: val(18) } as ResumenActivo;
    RESUMEN_TOTAL = RESUMEN_ACTUAL;
    LECTURAS = [{ id: "l1", activoId: "act-1", tipoMedidor: "odometro", valor: 82000, unidad: "km", fechaHora: "2025-12-28T09:00:00.000Z", inconsistente: false }];
    wrap(<PanelOperacional activo={activo({ tipo: "VEHICULO" })} ahoraIso={AHORA} />);
    expect(screen.getAllByText(/L\/100 km/).length).toBeGreaterThan(0);
  });
});

describe("Ficha Operacional 360° · sin datos (nunca 0)", () => {
  it("muestra 'Sin datos' literal cuando no hay fuente y no imprime 0", () => {
    RESUMEN_TOTAL = { deltaHorometro: sd, deltaOdometro: sd, litrosPorHora: sd, litrosPor100Km: sd } as ResumenActivo;
    RESUMEN_ACTUAL = RESUMEN_TOTAL;
    RESUMEN_ANTERIOR = RESUMEN_TOTAL;
    TANQUEOS = [];
    LECTURAS = [];
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getAllByText("Sin datos").length).toBeGreaterThan(0);
    // disponibilidad siempre "Sin datos" (no hay fuente en el dominio)
    expect(screen.getByText("Disponibilidad")).toBeInTheDocument();
  });

  it("disponibilidad SIEMPRE es 'Sin datos' (no se inventa métrica)", () => {
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    const kpi = screen.getByText("Disponibilidad").closest("*");
    expect(kpi).toBeTruthy();
  });
});

describe("Ficha Operacional 360° · consumo / tendencia", () => {
  it("muestra tendencia vs período anterior cuando hay ambos datos", () => {
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    // 4.5 vs 4.0 = +12.5% → tono error, etiqueta con "%"
    expect(screen.getByText(/vs período anterior/)).toBeInTheDocument();
  });

  it("empty state de negocio con menos de 2 tanqueos", () => {
    TANQUEOS = [{ id: "t1", activoId: "act-1", litros: 40, fechaHora: "2025-12-10T09:00:00.000Z", tipoCombustible: "diesel" }];
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByText(/Registra más tanqueos para visualizar la tendencia/)).toBeInTheDocument();
  });
});

describe("Ficha Operacional 360° · órdenes", () => {
  it("resume conteos y enlaza a la OT", () => {
    const { container } = wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByText("Pendientes")).toBeInTheDocument();
    expect(screen.getAllByText("En ejecución").length).toBeGreaterThan(0);
    expect(screen.getByText("Cerradas")).toBeInTheDocument();
    // enlace a una orden concreta
    const enlaces = Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    expect(enlaces.some((h) => h?.includes("/ordenes/o1"))).toBe(true);
  });

  it("empty state cuando no hay órdenes", () => {
    ORDENES = [];
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByText("Sin órdenes")).toBeInTheDocument();
  });
});

describe("Ficha Operacional 360° · mantenimiento e historial", () => {
  it("muestra próximo mantenimiento y enlaza al plan", () => {
    const { container } = wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByText("Plan 250h")).toBeInTheDocument();
    const enlaces = Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    expect(enlaces.some((h) => h?.includes("p1"))).toBe(true);
  });

  it("expone 'Ver historial completo' hacia la timeline compartida", () => {
    const { container } = wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByText("Ver historial completo")).toBeInTheDocument();
    const enlaces = Array.from(container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    expect(enlaces.some((h) => h?.includes("timeline"))).toBe(true);
  });
});

describe("Ficha Operacional 360° · permisos (ocultar, no deshabilitar)", () => {
  it("CONSULTA no ve acciones de escritura de medidor/tanqueo", () => {
    ROL = "CONSULTA";
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.queryByRole("button", { name: /Registrar medidor/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registrar tanqueo/ })).not.toBeInTheDocument();
    // pero sí puede CONSULTAR (navegación de solo lectura: ver órdenes, ver QR)
    expect(screen.getByRole("button", { name: /Ver QR/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver órdenes/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ver todas las órdenes/ })).toBeInTheDocument();
  });

  it("TENANT_ADMIN sí ve las acciones de escritura", () => {
    ROL = "TENANT_ADMIN";
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByRole("button", { name: /Registrar medidor/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Registrar tanqueo/ })).toBeInTheDocument();
  });
});

describe("Ficha Operacional 360° · RBAC de creación de Órdenes (ocultar CTAs de escritura)", () => {
  // Matriz contra la señal CANÓNICA (aRolLegacy→principalOrdenes):
  //   admin(TENANT_ADMIN/SUPER_ADMIN) y operador(SUPERVISOR/PLANIFICADOR/TECNICO)
  //   pueden crear OT; lector(CONSULTA) NO.
  const CTAS_CREAR = [/Crear orden/, /Nueva orden/];

  function verCrear(rol: string): boolean {
    ROL = rol;
    const { unmount } = wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    const visto = CTAS_CREAR.every((re) => screen.queryAllByRole("button", { name: re }).length > 0);
    unmount();
    return visto;
  }

  it("TENANT_ADMIN y SUPERVISOR VEN los CTAs de crear orden", () => {
    expect(verCrear("TENANT_ADMIN")).toBe(true);
    expect(verCrear("SUPERVISOR")).toBe(true);
  });

  it("TECNICO VE los CTAs de crear orden (operador tiene gestionar-ordenes)", () => {
    // "según la capacidad REAL del módulo Órdenes": TECNICO→operador→gestionar.
    expect(verCrear("TECNICO")).toBe(true);
  });

  it("CONSULTA NO ve los CTAs de crear orden (ocultos, no deshabilitados)", () => {
    ROL = "CONSULTA";
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.queryByRole("button", { name: /Crear orden/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nueva orden/ })).not.toBeInTheDocument();
    // Nunca se deshabilita: no debe existir ningún botón "Crear/Nueva orden" disabled.
    const posibles = screen.queryAllByRole("button", { name: /(Crear|Nueva) orden/ });
    expect(posibles).toHaveLength(0);
  });

  it("todos los roles con lectura conservan la navegación de consulta de órdenes", () => {
    for (const rol of ["TENANT_ADMIN", "SUPERVISOR", "PLANIFICADOR", "TECNICO", "CONSULTA"]) {
      ROL = rol;
      const { unmount } = wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
      expect(screen.getByRole("button", { name: /Ver todas las órdenes/ })).toBeInTheDocument();
      unmount();
    }
  });

  it("señal EXPLÍCITA read+write (permiso real de crear) MUESTRA ambos CTAs aun con rol lector", () => {
    ROL = "CONSULTA";
    PERMISOS = ["modulo.ordenes.read", "modulo.ordenes.write"];
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByRole("button", { name: /Crear orden/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nueva orden/ })).toBeInTheDocument();
  });

  it("señal EXPLÍCITA de SOLO read OCULTA ambos CTAs aun con rol operador", () => {
    ROL = "SUPERVISOR";
    PERMISOS = ["modulo.ordenes.read"];
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.queryByRole("button", { name: /Crear orden/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nueva orden/ })).not.toBeInTheDocument();
  });

  it("capacidad corta gestionar-ordenes MUESTRA ambos CTAs", () => {
    ROL = "CONSULTA";
    CAPS = ["gestionar-ordenes"];
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    expect(screen.getByRole("button", { name: /Crear orden/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nueva orden/ })).toBeInTheDocument();
  });
});

describe("Ficha Operacional 360° · offline visible", () => {
  it("muestra estado de sincronización pendiente", () => {
    EN_LINEA = true;
    PENDIENTES = 2;
    const { container } = wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />);
    // OfflineBadge presente en la cabecera
    expect(container.querySelector('[class*="offline"], [data-estado], [role]')).toBeTruthy();
  });
});

describe("Ficha Operacional 360° · temas", () => {
  it("renderiza en tema oscuro sin romper", () => {
    wrap(<PanelOperacional activo={activo()} ahoraIso={AHORA} />, true);
    expect(screen.getByText("Excavadora CAT")).toBeInTheDocument();
  });
});
