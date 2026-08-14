/**
 * DELTAOPS LITE-03 · Regresión de la CARRERA POST-LOGIN del AppShell.
 *
 * Contexto (fallo real, intermitente, observado en logs del servidor): tras un
 * `POST /auth/login` 200 (y especialmente en el ciclo logout→login), el AppShell
 * monta y dispara de inmediato el catálogo de PRESENTACIÓN `centros-costo`
 * (selector de centro). Si la cookie de sesión aún no se aplicó a esa petición
 * inmediata, el backend responde 401 y el cliente de Activos hacía
 * `window.location.assign(.../login)`, arrastrando el navegador de vuelta a
 * /login y abortando la carga de la Home. Intermitente = depende de la carrera.
 *
 * Contrato de la corrección:
 *  1) Un 401 en el catálogo de centros NO debe navegar el navegador a /login
 *     (la AUTORIDAD de sesión es `useSesion`, no una consulta de presentación).
 *  2) El shell sigue renderizando su contenido con normalidad; el selector de
 *     centro simplemente no se muestra (degradación honesta a "sin opciones").
 *  3) La navegación por proceso se renderiza SIN excepciones para los 6 roles,
 *     y también con datos vacíos / catálogo en vuelo.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppShellIdentidad } from "../lib/identidad/AppShell";
import { SesionProvider } from "../lib/identidad/sesion";
import { gruposNavegacion } from "../lib/identidad/rbac";
import InicioEmpresa from "../pages/inicio-empresa";
import type { Rol, Sesion } from "../lib/identidad/tipos";

const TODOS_LOS_ROLES: Rol[] = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "SUPERVISOR",
  "PLANIFICADOR",
  "TECNICO",
  "CONSULTA",
];

function sesionBase(over: Partial<Sesion> = {}): Sesion {
  return {
    identityId: "u1",
    email: "ada@acme.com",
    nombre: "Ada Lovelace",
    tenant: { id: "t1", codigo: "ACME", nombre: "ACME", estado: "ACTIVO", branding: {} },
    rol: "TENANT_ADMIN",
    modulos: ["activos", "ordenes"],
    membresias: [],
    ...over,
  };
}

function resp(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status: status === 204 ? 200 : status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Renderiza el AppShell con una sesión ya válida (`/auth/session` 200) y permite
 * personalizar la respuesta de cualquier otra URL (p. ej. forzar 401 en el
 * catálogo de centros para reproducir la carrera).
 */
function renderShell(sesion: Sesion, onFetch?: (u: string, init?: RequestInit) => Response | null) {
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    if (onFetch) {
      const r = onFetch(url, init);
      if (r) return r;
    }
    if (url.includes("/auth/session")) return resp(sesion);
    if (url.includes("/tenant/branding")) return resp(sesion.tenant.branding ?? {});
    return resp(null);
  });
  const { hook, history } = memoryLocation({ path: "/", static: false, record: true });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <SesionProvider>
          <AppShellIdentidad>
            <div>Contenido</div>
          </AppShellIdentidad>
        </SesionProvider>
      </Router>
    </QueryClientProvider>,
  );
  return { history, qc };
}

let assignSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cleanup();
  localStorage.clear();
  // Espiar la navegación dura del navegador: en jsdom `location.assign` no está
  // implementada; la reemplazamos por un espía para detectar el redirect indebido.
  assignSpy = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: assignSpy },
    configurable: true,
    writable: true,
  });
});
afterEach(() => vi.restoreAllMocks());

describe("AppShell · carrera post-login (regresión)", () => {
  it("un 401 TRANSITORIO del catálogo de centros NO redirige a /login ni tumba el shell", async () => {
    let pidioCentros = false;
    const { history } = renderShell(sesionBase(), (url) => {
      if (url.includes("/activos/catalogos/centros-costo")) {
        pidioCentros = true;
        return resp({ error: "No autenticado" }, 401);
      }
      return null;
    });

    // El shell renderiza su contenido con normalidad pese al 401 del catálogo.
    await screen.findByText(/Ada Lovelace/i);
    expect(screen.getByText("Contenido")).toBeInTheDocument();

    // Se disparó la petición del catálogo (montaje del shell) …
    await waitFor(() => expect(pidioCentros).toBe(true));
    // … y sin embargo NO hubo navegación dura del navegador a /login.
    expect(assignSpy).not.toHaveBeenCalled();
    // La ubicación de la app sigue en la Home (no rebotó a /login).
    expect(history.at(-1)).toBe("/");
  });

  it("con 401 en el catálogo el SELECTOR de centro no se muestra (degradación honesta)", async () => {
    renderShell(sesionBase(), (url) =>
      url.includes("/activos/catalogos/centros-costo") ? resp({ error: "no auth" }, 401) : null,
    );
    await screen.findByText(/Ada Lovelace/i);
    // Sin opciones ⇒ el selector de centro (aria-label específico) no existe.
    expect(screen.queryByLabelText(/Centro de costos activo/i)).toBeNull();
  });

  it("con catálogo de centros VACÍO (200 []) el selector tampoco se muestra", async () => {
    renderShell(sesionBase(), (url) =>
      url.includes("/activos/catalogos/centros-costo") ? resp([]) : null,
    );
    await screen.findByText(/Ada Lovelace/i);
    expect(screen.queryByLabelText(/Centro de costos activo/i)).toBeNull();
  });

  it("con catálogo de centros CON DATOS el selector sí aparece", async () => {
    renderShell(sesionBase(), (url) =>
      url.includes("/activos/catalogos/centros-costo")
        ? resp([{ value: "cc-01", label: "Planta Norte" }])
        : null,
    );
    await screen.findByText(/Ada Lovelace/i);
    await screen.findByLabelText(/Centro de costos activo/i);
  });
});

describe("Home completa · contexto FRESCO con TODAS las consultas iniciales en 401", () => {
  /**
   * Reproduce el caso de "navegador totalmente nuevo, cache vacía": la Home
   * monta el AppShell + su contenido y dispara de golpe TODAS sus consultas
   * iniciales (catálogo de centros del shell y `/ordenes` de la Home). Si la
   * cookie recién emitida aún no se aplicó, todas devuelven 401. Contrato: NINGÚN
   * cliente hace redirección dura a /login; la Home se queda montada en '/'.
   */
  function renderHome(sesion: Sesion) {
    // Todo lo que NO sea /auth/session ni /tenant/* devuelve 401 (carrera fresca).
    vi.spyOn(global, "fetch").mockImplementation(async (u) => {
      const url = String(u);
      if (url.includes("/auth/session")) return resp(sesion);
      if (url.includes("/tenant/branding")) return resp(sesion.tenant.branding ?? {});
      if (url.includes("/tenant/")) return resp({});
      // /activos/catalogos/centros-costo, /ordenes?…, y cualquier otro dato inicial.
      return resp({ error: "No autenticado" }, 401);
    });
    const { hook, history } = memoryLocation({ path: "/", static: false, record: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <Router hook={hook}>
          <SesionProvider>
            <InicioEmpresa />
          </SesionProvider>
        </Router>
      </QueryClientProvider>,
    );
    return { history };
  }

  it("con 401 transitorio en TODAS las consultas iniciales, la Home NO redirige y permanece en '/'", async () => {
    const { history } = renderHome(sesionBase({ rol: "TENANT_ADMIN", modulos: ["activos", "ordenes"] }));
    // La Home renderiza: aparece el saludo (contenido montado) …
    await screen.findByText(/Bienvenido/i);
    // … y el resumen degrada a su estado de error, SIN tumbar el árbol.
    await waitFor(() => expect(assignSpy).not.toHaveBeenCalled());
    expect(history.at(-1)).toBe("/");
    // Doble comprobación tras dejar asentar los efectos de las consultas.
    await new Promise((r) => setTimeout(r, 20));
    expect(assignSpy).not.toHaveBeenCalled();
    expect(history.at(-1)).toBe("/");
  });

  it("un técnico en contexto fresco con 401 en /ordenes tampoco redirige", async () => {
    const { history } = renderHome(sesionBase({ rol: "TECNICO", modulos: ["activos", "ordenes"] }));
    await screen.findByText(/Bienvenido/i);
    await new Promise((r) => setTimeout(r, 20));
    expect(assignSpy).not.toHaveBeenCalled();
    expect(history.at(-1)).toBe("/");
  });
});

describe("AppShell · render de Navegación por los 6 roles (sin excepciones)", () => {
  for (const rol of TODOS_LOS_ROLES) {
    it(`renderiza el shell y la navegación para el rol ${rol}`, async () => {
      // Módulos completos para ejercitar todos los grupos del nav.
      renderShell(
        sesionBase({
          rol,
          modulos: [
            "activos",
            "ordenes",
            "correctivo",
            "preventivo",
            "planes",
            "inventario",
            "abastecimiento",
            "analytics",
            "referencia",
          ],
        }),
      );
      await screen.findByText(/Ada Lovelace/i);
      // El árbol no reventó: hay región de navegación y contenido montado.
      expect(screen.getByRole("navigation")).toBeInTheDocument();
      expect(screen.getByText("Contenido")).toBeInTheDocument();
    });
  }

  it("renderiza el shell aunque la sesión tenga CERO módulos (nav mínima, sin throw)", async () => {
    renderShell(sesionBase({ rol: "CONSULTA", modulos: [] }));
    await screen.findByText(/Ada Lovelace/i);
    const nav = screen.getByRole("navigation");
    // Siempre existe al menos "Inicio"; no hay grupos de módulos.
    expect(nav).toHaveTextContent("Inicio");
  });
});

describe("gruposNavegacion · pureza para todos los roles y estados de módulos", () => {
  it("no lanza para ningún rol, con módulos completos, vacíos y utilización on/off", () => {
    const modsCompletos = [
      "activos",
      "ordenes",
      "correctivo",
      "preventivo",
      "planes",
      "inventario",
      "abastecimiento",
      "analytics",
      "referencia",
    ] as Sesion["modulos"];
    for (const rol of TODOS_LOS_ROLES) {
      for (const modulos of [modsCompletos, [] as Sesion["modulos"]]) {
        for (const utilizacionVisible of [true, false]) {
          expect(() =>
            gruposNavegacion({ rol, modulos }, { utilizacionVisible }),
          ).not.toThrow();
        }
      }
    }
  });
});
