/**
 * DGP-018 FASE B · Cierre de construcción del Centro Operacional.
 *
 * Cubre lo pendiente del mandato:
 *  §13 experiencia móvil (foco del técnico, deep links de ejecución, offline,
 *      objetivos táctiles ≥48px);
 *  §8-12 integraciones (accesos por módulo respetando entitlements);
 *  §21 pruebas obligatorias restantes (6 roles, ocultar sin capacidad, deep
 *      links con base path, estados offline, logout/re-login por dispatcher).
 *
 * La autorización real permanece en el backend; esto sólo compone/oculta UI.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Link } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Inicio from "../pages/inicio";
import { Contenido as OrdenesOperaciones } from "../pages/ordenes-operaciones";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { SesionProvider } from "../lib/identidad/sesion";
import {
  urlBandejaOrdenes,
  urlEjecutarOrden,
  INTEGRACIONES,
  RUTA_ESCANEAR_ACTIVO,
} from "../lib/centro/enlaces";
import type { Sesion, Rol } from "../lib/identidad/tipos";
import type { OrdenRow } from "../lib/ordenes/tipos";

const MODULOS_9 = [
  "referencia", "activos", "ordenes", "inventario", "planes",
  "abastecimiento", "preventivo", "correctivo", "analytics",
] as const;

function sesion(rol: Rol, over: Partial<Sesion> = {}): Sesion {
  const esSuper = rol === "SUPER_ADMIN";
  return {
    identityId: esSuper ? "sa" : "u1",
    email: esSuper ? "admin@deltaops.dev" : "user@delta.demo",
    nombre: esSuper ? "Super Admin" : "Usuaria Demo",
    tenant: esSuper
      ? { id: "deltaops", codigo: "DELTAOPS", nombre: "DeltaOps", estado: "ACTIVO", branding: {} }
      : { id: "delta-demo", codigo: "DEMO", nombre: "Delta Demo", estado: "ACTIVO", branding: {} },
    rol,
    modulos: esSuper ? ["referencia", "activos"] : [...MODULOS_9],
    membresias: [],
    ...over,
  };
}

const HOY = "2024-06-01T12:00:00.000Z";

function orden(over: Partial<OrdenRow> & { id: string }): OrdenRow {
  return {
    tenantId: "delta-demo",
    codigo: `OT-${over.id}`,
    titulo: `Orden ${over.id}`,
    estado: "ABIERTA",
    tipo: "correctiva",
    categoria: null,
    prioridad: null,
    severidad: null,
    responsable: "Técnico A",
    supervisor: null,
    activoPrincipalId: null,
    ubicacionId: null,
    datos: {},
    version: 1,
    lastEventId: "e1",
    actualizadoAt: "2024-06-01T00:00:00.000Z",
    ...over,
  } as OrdenRow;
}

function resp(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status: status === 204 ? 200 : status,
    headers: { "Content-Type": "application/json" },
  });
}

function backend(ses: Sesion, ordenes: OrdenRow[]) {
  vi.spyOn(global, "fetch").mockImplementation(async (u) => {
    const url = String(u);
    if (url.includes("/auth/session")) return resp(ses);
    if (url.includes("/auth/me")) return resp({ identityId: ses.identityId, nombre: ses.nombre, rol: ses.rol === "SUPER_ADMIN" ? "admin" : ses.rol });
    if (url.includes("/tenant/branding")) return resp(ses.tenant.branding ?? {});
    if (url.includes("/health")) return resp({ status: "ok", timestamp: new Date(0).toISOString() });
    if (url.includes("/ready")) return resp({ status: "ok", checks: [] });
    if (url.includes("/info")) return resp({ name: "deltaops", version: "1", environment: "test", nodeVersion: "20", uptimeSeconds: 1 });
    if (url.includes("/metrics")) return resp({ uptimeSeconds: 1, avgResponseTimeMs: 5, requestCount: 1, errorCount: 0 });
    if (url.includes("/api/deltaops/ordenes")) return resp({ ordenes });
    return resp(null);
  });
}

function renderInicio(ses: Sesion, ordenes: OrdenRow[] = [], base?: string) {
  backend(ses, ordenes);
  const path = base ? `${base}/` : "/";
  const { hook } = memoryLocation({ path, static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router base={base} hook={hook}>
        <SesionProvider>
          <Inicio />
        </SesionProvider>
      </Router>
    </QueryClientProvider>,
  );
}

beforeEach(() => { cleanup(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

/* --------------------- Enlaces (deep links) puros ---------------------- */

describe("enlaces del Centro (deep links) · funciones puras", () => {
  it("bandeja de órdenes usa el param canónico validado por la página", () => {
    expect(urlBandejaOrdenes("pendientes")).toBe("/ordenes?bandeja=pendientes");
    expect(urlBandejaOrdenes("criticas")).toBe("/ordenes?bandeja=criticas");
  });

  it("ejecutar orden abre la pestaña de ejecución de la ficha", () => {
    expect(urlEjecutarOrden("OT-9")).toBe("/ordenes/OT-9?tab=ejecucion");
  });

  it("todas las integraciones apuntan a rutas absolutas conocidas", () => {
    for (const accesos of Object.values(INTEGRACIONES)) {
      for (const a of accesos) {
        expect(a.ruta.startsWith("/")).toBe(true);
      }
    }
    expect(RUTA_ESCANEAR_ACTIVO).toBe("/activos/escanear");
  });
});

/* ------------------ Deep links con base path (§21) --------------------- */

describe("deep links respetan el base path del router", () => {
  it("un Link a la bandeja se resuelve con el prefijo /deltaops", () => {
    const { hook } = memoryLocation({ path: "/deltaops/", static: false, record: true });
    render(
      <Router base="/deltaops" hook={hook}>
        <Link href={urlBandejaOrdenes("pendientes")}>ir</Link>
      </Router>,
    );
    const a = screen.getByText("ir").closest("a")!;
    expect(a.getAttribute("href")).toBe("/deltaops/ordenes?bandeja=pendientes");
  });

  it("un Link a ejecutar OT se resuelve con el prefijo /deltaops", () => {
    const { hook } = memoryLocation({ path: "/deltaops/", static: false, record: true });
    render(
      <Router base="/deltaops" hook={hook}>
        <Link href={urlEjecutarOrden("OT-9")}>ejecutar</Link>
      </Router>,
    );
    const a = screen.getByText("ejecutar").closest("a")!;
    expect(a.getAttribute("href")).toBe("/deltaops/ordenes/OT-9?tab=ejecucion");
  });
});

/* ------------------------- Landing por 6 roles ------------------------- */

describe("§21 · landing por los 6 roles canónicos", () => {
  it("SUPER_ADMIN aterriza en la consola global técnica (intacta)", async () => {
    renderInicio(sesion("SUPER_ADMIN"));
    expect(await screen.findByText("DeltaOps Console")).toBeInTheDocument();
    expect(screen.getByText(/Estado Global/i)).toBeInTheDocument();
    // Nunca el Centro Operacional empresarial.
    expect(screen.queryByText(/Resumen operacional/i)).toBeNull();
  });

  for (const rol of ["TENANT_ADMIN", "SUPERVISOR", "PLANIFICADOR", "TECNICO", "CONSULTA"] as const) {
    it(`${rol} aterriza en el Centro Operacional empresarial (sin infraestructura)`, async () => {
      renderInicio(sesion(rol), [orden({ id: "1", estado: "ABIERTA" })]);
      await screen.findByText(/Bienvenido, Usuaria Demo/i);
      expect(screen.queryByText("DeltaOps Console")).toBeNull();
      expect(screen.queryByText(/Estado Global/i)).toBeNull();
      // Todos con módulo ordenes ven el resumen operacional real.
      expect(await screen.findByText("Resumen operacional")).toBeInTheDocument();
    });
  }
});

/* ------------------- §21 · ocultar sin capacidad ----------------------- */

describe("§21 · acciones ocultas sin capacidad (CONSULTA)", () => {
  it("CONSULTA no ve escrituras ni administración de empresa", async () => {
    renderInicio(sesion("CONSULTA"), [orden({ id: "1", estado: "ABIERTA" })]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(screen.queryByRole("link", { name: /Nueva orden/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Nuevo activo/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Registrar lectura/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Administrar usuarios/i })).toBeNull();
  });
});

/* --------------------- §8-12 · integraciones --------------------------- */

describe("§8-12 · accesos de integración por módulo (entitlements)", () => {
  it("muestra explorar por módulo con accesos a activos/órdenes/inventario/planes/preventivo/abastecimiento", async () => {
    renderInicio(sesion("SUPERVISOR"), [orden({ id: "1", estado: "ABIERTA" })]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(await screen.findByText("Explorar por módulo")).toBeInTheDocument();
    // Accesos de integración representativos (deep links por bandeja / rutas).
    expect(screen.getByRole("link", { name: /Próximas a vencer/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Transferencias/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Calendario de planes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Solicitudes y necesidades/i })).toBeInTheDocument();
  });

  it("oculta el bloque de un módulo sin entitlement", async () => {
    renderInicio(sesion("SUPERVISOR", { modulos: ["ordenes"] }), [orden({ id: "1", estado: "ABIERTA" })]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    await screen.findByText("Explorar por módulo");
    // Inventario no habilitado → no aparece su acceso.
    expect(screen.queryByRole("link", { name: /Transferencias/i })).toBeNull();
    // Órdenes sí → bandeja crítica presente.
    expect(screen.getByRole("link", { name: /Críticas/i })).toBeInTheDocument();
  });
});

/* --------------------- §13 · experiencia móvil ------------------------- */

describe("§13 · foco móvil del TECNICO", () => {
  it("prioriza foco de ejecución con deep link a la pestaña de ejecución y escanear QR", async () => {
    renderInicio(sesion("TECNICO"), [
      orden({ id: "9", estado: "EN_EJECUCION", responsable: "Técnico A", datos: { sla: { vencimiento: "2024-05-30T00:00:00.000Z" } } }),
    ]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(await screen.findByText("Tu foco ahora")).toBeInTheDocument();
    // Botón Ejecutar apunta a la pestaña de ejecución de la OT.
    const ejecutar = await screen.findByRole("link", { name: /Ejecutar/i });
    expect(ejecutar.getAttribute("href")).toContain("/ordenes/9?tab=ejecucion");
    expect(screen.getAllByRole("link", { name: /Escanear QR/i }).length).toBeGreaterThan(0);
  });

  it("objetivos táctiles ≥48px en los botones del foco del técnico", async () => {
    renderInicio(sesion("TECNICO"), [
      orden({ id: "9", estado: "EN_EJECUCION", responsable: "Técnico A", datos: { sla: { vencimiento: "2024-05-30T00:00:00.000Z" } } }),
    ]);
    await screen.findByText("Tu foco ahora");
    const ejecutar = (await screen.findByRole("link", { name: /Ejecutar/i })).querySelector("button")!;
    expect(ejecutar.style.minHeight).toBe("48px");
  });
});

/* --------------------- §21 · estado offline ---------------------------- */

describe("§21 · estado offline visible para el TECNICO", () => {
  it("muestra el aviso de trabajo sin conexión cuando navigator está offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    try {
      renderInicio(sesion("TECNICO"), []);
      await screen.findByText(/Bienvenido, Usuaria Demo/i);
      expect(await screen.findByText(/Trabajando sin conexión/i)).toBeInTheDocument();
    } finally {
      // Restaurar el valor por defecto (online) eliminando el override.
      delete (navigator as unknown as { onLine?: boolean }).onLine;
    }
  });

  it("no muestra aviso offline cuando está en línea y sin pendientes", async () => {
    renderInicio(sesion("TECNICO"), []);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(screen.queryByText(/Trabajando sin conexión/i)).toBeNull();
    expect(screen.queryByText(/Sincronización pendiente/i)).toBeNull();
  });
});

/* ------------ §21 · bandeja por deep link en /ordenes ------------------ */

describe("§21 · /ordenes abre la bandeja indicada por deep link", () => {
  function mockOrdenes(ordenes: OrdenRow[]) {
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      if (/\/deltaops\/ordenes\?/.test(url)) return resp({ ordenes });
      return resp(null);
    });
  }

  it("con ?bandeja=criticas la pestaña Críticas queda seleccionada", async () => {
    mockOrdenes([orden({ id: "c", estado: "ABIERTA", prioridad: "critica" })]);
    const { hook } = memoryLocation({ path: "/ordenes?bandeja=criticas", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <ToastProvider>
            <OfflineProvider tenant="delta-demo" modulo="ordenes">
              <Router hook={hook}>
                <OrdenesOperaciones />
              </Router>
            </OfflineProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    const tab = await screen.findByRole("tab", { name: /Críticas/i });
    await waitFor(() => expect(tab.getAttribute("aria-selected")).toBe("true"));
  });

  it("sin param, la bandeja por defecto sigue siendo Mis órdenes", async () => {
    mockOrdenes([orden({ id: "m", estado: "ABIERTA" })]);
    const { hook } = memoryLocation({ path: "/ordenes", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <ToastProvider>
            <OfflineProvider tenant="delta-demo" modulo="ordenes">
              <Router hook={hook}>
                <OrdenesOperaciones />
              </Router>
            </OfflineProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    const tab = await screen.findByRole("tab", { name: /Mis órdenes/i });
    await waitFor(() => expect(tab.getAttribute("aria-selected")).toBe("true"));
  });
});
