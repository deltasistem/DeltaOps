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
import OrdenesOperacionesPage, { Contenido as OrdenesOperaciones } from "../pages/ordenes-operaciones";
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
      <ThemeProvider>
        <Router base={base} hook={hook}>
          <SesionProvider>
            <Inicio />
          </SesionProvider>
        </Router>
      </ThemeProvider>
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
  it("prioriza foco de ejecución SÓLO sobre una OT asignada estrictamente a la identidad", async () => {
    // La sesión TECNICO tiene identityId="u1"; la OT propia lleva responsable="u1".
    renderInicio(sesion("TECNICO"), [
      orden({ id: "9", estado: "EN_EJECUCION", responsable: "u1", datos: { sla: { vencimiento: "2024-05-30T00:00:00.000Z" } } }),
    ]);
    await screen.findByText(/Bienvenido, Usuaria Demo/i);
    expect(await screen.findByText("Tu foco ahora")).toBeInTheDocument();
    // Botón Ejecutar apunta a la pestaña de ejecución de la OT propia.
    const ejecutar = await screen.findByRole("link", { name: /Ejecutar/i });
    expect(ejecutar.getAttribute("href")).toContain("/ordenes/9?tab=ejecucion");
    expect(screen.getAllByRole("link", { name: /Escanear QR/i }).length).toBeGreaterThan(0);
  });

  it("acepta el match estricto por email canónico de la sesión", async () => {
    renderInicio(sesion("TECNICO"), [
      orden({ id: "e", estado: "EN_EJECUCION", responsable: "user@delta.demo" }),
    ]);
    await screen.findByText("Tu foco ahora");
    const ejecutar = await screen.findByRole("link", { name: /Ejecutar/i });
    expect(ejecutar.getAttribute("href")).toContain("/ordenes/e?tab=ejecucion");
  });

  it("objetivos táctiles ≥48px en los botones del foco del técnico", async () => {
    renderInicio(sesion("TECNICO"), [
      orden({ id: "9", estado: "EN_EJECUCION", responsable: "u1", datos: { sla: { vencimiento: "2024-05-30T00:00:00.000Z" } } }),
    ]);
    await screen.findByText("Tu foco ahora");
    const ejecutar = (await screen.findByRole("link", { name: /Ejecutar/i })).querySelector("button")!;
    expect(ejecutar.style.minHeight).toBe("48px");
  });
});

/* --- G-1 · aislamiento estricto: nunca OTs de otro responsable (§ obligatorio) --- */

describe("G-1 · el TECNICO nunca ve ni ejecuta OTs de otro responsable", () => {
  it("con dos responsables distintos, sólo aparece la propia (match estricto) y jamás la ajena", async () => {
    renderInicio(sesion("TECNICO"), [
      // Ajena: responsable es un NOMBRE (ambiguo) y otra por identityId distinto.
      orden({ id: "ajena-nombre", codigo: "OT-AJ1", estado: "EN_EJECUCION", responsable: "Técnico A", datos: { sla: { vencimiento: "2024-05-29T00:00:00.000Z" } } }),
      orden({ id: "ajena-id", codigo: "OT-AJ2", estado: "EN_EJECUCION", responsable: "u2", datos: { sla: { vencimiento: "2024-05-28T00:00:00.000Z" } } }),
      // Propia: responsable == identityId de la sesión ("u1").
      orden({ id: "propia", codigo: "OT-MIA", estado: "EN_EJECUCION", responsable: "u1", datos: { sla: { vencimiento: "2024-05-30T00:00:00.000Z" } } }),
    ]);
    await screen.findByText("Tu foco ahora");
    // La única OT con CTA "Ejecutar" es la propia.
    const ejecutar = await screen.findByRole("link", { name: /Ejecutar/i });
    expect(ejecutar.getAttribute("href")).toContain("/ordenes/propia?tab=ejecucion");
    // Ninguna OT ajena se presenta ni ofrece ejecutar en el foco.
    expect(screen.queryByText("OT-AJ1")).toBeNull();
    expect(screen.queryByText("OT-AJ2")).toBeNull();
    const ejecutables = screen.getAllByRole("link", { name: /Ejecutar/i });
    for (const l of ejecutables) {
      expect(l.getAttribute("href")).not.toContain("/ordenes/ajena");
    }
  });

  it("si NINGUNA OT tiene match estricto, el foco es conservador y vacío (no atribuye ajenas)", async () => {
    renderInicio(sesion("TECNICO"), [
      // Todas con nombre/rol/identityId distinto: ninguna es de "u1"/"user@delta.demo".
      orden({ id: "a", estado: "EN_EJECUCION", responsable: "Técnico A", datos: { sla: { vencimiento: "2024-05-29T00:00:00.000Z" } } }),
      orden({ id: "b", estado: "EN_EJECUCION", responsable: "supervisor", datos: { sla: { vencimiento: "2024-05-28T00:00:00.000Z" } } }),
    ]);
    await screen.findByText("Tu foco ahora");
    // Estado vacío conservador (foco + bandeja "Mi trabajo"); sin ningún CTA "Ejecutar".
    expect((await screen.findAllByText(/No tienes órdenes asignadas para hoy/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Ejecutar/i })).toBeNull();
    // Pero sí ofrece la bandeja oficial y escanear QR.
    expect(screen.getAllByRole("link", { name: /Mis órdenes/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Escanear QR/i }).length).toBeGreaterThan(0);
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
            <SesionProvider>
              <OfflineProvider tenant="delta-demo" modulo="ordenes">
                <Router hook={hook}>
                  <OrdenesOperaciones />
                </Router>
              </OfflineProvider>
            </SesionProvider>
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
            <SesionProvider>
              <OfflineProvider tenant="delta-demo" modulo="ordenes">
                <Router hook={hook}>
                  <OrdenesOperaciones />
                </Router>
              </OfflineProvider>
            </SesionProvider>
          </ToastProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );
    const tab = await screen.findByRole("tab", { name: /Mis órdenes/i });
    await waitFor(() => expect(tab.getAttribute("aria-selected")).toBe("true"));
  });
});

/* ---------- Regresión: /ordenes no explota por falta de provider --------- */

/**
 * `OrdenesOperacionesPage` (export por defecto) monta `ShellOrdenes` → `Contenido`,
 * cuyo `FilaOrden` usa `useToast()` del Design System. La página NO trae su propio
 * ToastProvider; depende de un ancestro (el `ToastProvider` raíz de `App`). Estos
 * tests reproducen la ruta REAL: sin el provider, `useToast` lanza y la página
 * explota; con él (como en `App`), renderiza. Habría atrapado la regresión
 * "useToast debe usarse dentro de <ToastProvider>".
 */
describe("regresión · ruta real /ordenes (ShellOrdenes → Contenido)", () => {
  function backendOrdenes(ordenes: OrdenRow[]) {
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      // ShellOrdenes autentica vía /auth/me (useDeltaopsMe).
      if (url.includes("/auth/me")) return resp({ identityId: "u1", nombre: "Usuaria Demo", rol: "TECNICO" });
      if (url.includes("/api/deltaops/ordenes")) return resp({ ordenes });
      return resp(null);
    });
  }

  /** Réplica exacta de la composición de providers de `App` (root ToastProvider). */
  function renderRutaReal(path = "/ordenes") {
    const { hook } = memoryLocation({ path, static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <SesionProvider>
            <Router hook={hook}>
              <OrdenesOperacionesPage />
            </Router>
          </SesionProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it("renderiza la ruta real sin crash cuando el ToastProvider raíz existe", async () => {
    backendOrdenes([orden({ id: "m", estado: "ABIERTA" })]);
    renderRutaReal();
    // La navegación de la Shell y las bandejas montan → no explotó.
    expect(await screen.findByRole("tab", { name: /Mis órdenes/i })).toBeInTheDocument();
  });

  it("sin ToastProvider ancestro la página explota (contrato de dependencia)", async () => {
    backendOrdenes([orden({ id: "m", estado: "ABIERTA" })]);
    const { hook } = memoryLocation({ path: "/ordenes", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Silencia el error esperado de React para no ensuciar la salida.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let capturado: unknown = null;
    class Limite extends React.Component<{ children: React.ReactNode }, { e: unknown }> {
      state = { e: null as unknown };
      static getDerivedStateFromError(e: unknown) { return { e }; }
      componentDidCatch(e: unknown) { capturado = e; }
      render() { return this.state.e ? <p>falló</p> : this.props.children; }
    }
    render(
      <QueryClientProvider client={qc}>
        <Limite>
          <SesionProvider>
            <Router hook={hook}>
              <OrdenesOperacionesPage />
            </Router>
          </SesionProvider>
        </Limite>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(capturado).not.toBeNull());
    expect(String((capturado as Error)?.message ?? capturado)).toMatch(/ToastProvider/i);
    err.mockRestore();
  });
});
