/**
 * DGP-020.2 · Pruebas de SESIONES DE TRABAJO y duración real de OTs.
 *
 * Cubre el contrato y las reglas de programa:
 *  - Matriz de roles (§31): CONSULTA no ve CTAs; TECNICO opera SÓLO su sesión
 *    (se oculta la CTA si NO es el asignado); operador/admin ven CTAs.
 *  - Transiciones de botón por estado (§28): sin sesión → [Iniciar trabajo];
 *    ABIERTA → [Pausar][Finalizar]; PAUSADA → [Reanudar][Finalizar]; CERRADA → sólo lectura.
 *  - Comandos (§ contrato): envían `opId` + `ocurridoAt` (device-time) y NUNCA
 *    `identityId` (lo deriva el backend del contexto autenticado).
 *  - Duraciones (§21/§22): se RENDERIZAN desde el read model (el cliente no las recompone).
 *  - Offline First (§19): el encolado conserva `ocurridoAt` del momento del click.
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";

import { VistaPanelSesion } from "../lib/ordenes/PanelSesion";
import { capacidadesOrdenes } from "../lib/ordenes/capacidades";
import { formatearDuracion, extrapolar } from "../lib/ordenes/duracion";
import { abrirSesion, pausarSesion, reanudarSesion, cerrarSesion } from "../lib/ordenes/mutaciones";
import { ColaSync } from "../lib/offline/cola";
import { MODULO } from "../lib/ordenes/constantes";
import type { SesionTrabajo, DuracionesSesion } from "../lib/ordenes/tipos";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

function wrap(ui: React.ReactNode) {
  return render(
    <ThemeProvider>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

const SESION_ABIERTA: SesionTrabajo = {
  id: "ses-1",
  ordenId: "ot-1",
  activoId: "act-1",
  identityId: "id-tecnico",
  estado: "ABIERTA",
  origen: "online",
  iniciadoAt: "2024-01-01T08:00:00.000Z",
  cerradoAt: null,
  registradoAt: "2024-01-01T08:00:00.000Z",
  actualizadoAt: "2024-01-01T08:00:00.000Z",
};

const DURACIONES: DuracionesSesion = {
  sesionId: "ses-1",
  ordenId: "ot-1",
  activoId: "act-1",
  identityId: "id-tecnico",
  estado: "ABIERTA",
  efectivoMs: 3_600_000, // 01:00:00
  pausadoMs: 600_000, // 00:10:00
  transcurridoMs: 4_200_000, // 01:10:00
  pausas: 1,
  abierta: true,
  iniciadoAt: "2024-01-01T08:00:00.000Z",
  cerradoAt: null,
};

afterEach(() => cleanup());

/* ============================ Matriz de roles ============================ */

describe("PanelSesion · matriz de roles (§31)", () => {
  it("CONSULTA (ejecutar=false): NO muestra ninguna CTA de sesión", () => {
    const puedeOperar = capacidadesOrdenes({ rol: "CONSULTA" }).ejecutar;
    expect(puedeOperar).toBe(false);
    wrap(<VistaPanelSesion puedeOperar={puedeOperar} esPropia={null} sesion={null} duraciones={null} />);
    expect(screen.queryByRole("button", { name: "Iniciar trabajo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    // El estado sí es visible (sólo lectura).
    expect(screen.getByText("Sin sesión iniciada")).toBeInTheDocument();
  });

  it("TECNICO asignado (esPropia): SÍ ve la CTA de iniciar", () => {
    const puedeOperar = capacidadesOrdenes({ rol: "TECNICO" }).ejecutar;
    expect(puedeOperar).toBe(true);
    wrap(<VistaPanelSesion puedeOperar={puedeOperar} esPropia={true} sesion={null} duraciones={null} />);
    expect(screen.getByRole("button", { name: "Iniciar trabajo" })).toBeInTheDocument();
  });

  it("TECNICO NO asignado (esPropia=false): se OCULTA la CTA (opera sólo su sesión)", () => {
    const puedeOperar = capacidadesOrdenes({ rol: "TECNICO" }).ejecutar;
    wrap(<VistaPanelSesion puedeOperar={puedeOperar} esPropia={false} sesion={null} duraciones={null} />);
    expect(screen.queryByRole("button", { name: "Iniciar trabajo" })).not.toBeInTheDocument();
  });

  it("SUPERVISOR (ejecutar=true): ve las CTAs de sesión", () => {
    const puedeOperar = capacidadesOrdenes({ rol: "SUPERVISOR" }).ejecutar;
    expect(puedeOperar).toBe(true);
    wrap(<VistaPanelSesion puedeOperar={puedeOperar} esPropia={null} sesion={null} duraciones={null} />);
    expect(screen.getByRole("button", { name: "Iniciar trabajo" })).toBeInTheDocument();
  });
});

/* ====================== Transiciones de botón por estado ================= */

describe("PanelSesion · CTAs por estado (§28)", () => {
  const puede = capacidadesOrdenes({ rol: "TECNICO" }).ejecutar;

  it("sin sesión → [Iniciar trabajo]", () => {
    wrap(<VistaPanelSesion puedeOperar={puede} esPropia={true} sesion={null} duraciones={null} />);
    expect(screen.getByRole("button", { name: "Iniciar trabajo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalizar" })).not.toBeInTheDocument();
  });

  it("ABIERTA → [Pausar][Finalizar]", () => {
    wrap(<VistaPanelSesion puedeOperar={puede} esPropia={true} sesion={SESION_ABIERTA} duraciones={DURACIONES} />);
    expect(screen.getByRole("button", { name: "Pausar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar trabajo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reanudar" })).not.toBeInTheDocument();
  });

  it("PAUSADA → [Reanudar][Finalizar]", () => {
    const pausada: SesionTrabajo = { ...SESION_ABIERTA, estado: "PAUSADA" };
    wrap(<VistaPanelSesion puedeOperar={puede} esPropia={true} sesion={pausada} duraciones={{ ...DURACIONES, estado: "PAUSADA" }} />);
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
  });

  it("CERRADA → sólo lectura (sin CTAs de escritura)", () => {
    const cerrada: SesionTrabajo = { ...SESION_ABIERTA, estado: "CERRADA", cerradoAt: "2024-01-01T09:10:00.000Z" };
    wrap(<VistaPanelSesion puedeOperar={puede} esPropia={true} sesion={cerrada} duraciones={{ ...DURACIONES, estado: "CERRADA", abierta: false }} />);
    expect(screen.queryByRole("button", { name: "Pausar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reanudar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalizar" })).not.toBeInTheDocument();
    expect(screen.getByText(/no admite reapertura/i)).toBeInTheDocument();
  });
});

/* ===================== Duraciones renderizadas del read model =========== */

describe("Duraciones · presentación desde el read model (§21/§22)", () => {
  it("formatearDuracion produce HH:MM:SS", () => {
    expect(formatearDuracion(0)).toBe("00:00:00");
    expect(formatearDuracion(3_600_000)).toBe("01:00:00");
    expect(formatearDuracion(4_200_000)).toBe("01:10:00");
    expect(formatearDuracion(-5)).toBe("00:00:00");
  });

  it("renderiza efectivo/pausado/transcurrido tal cual llegan del read model", () => {
    const puede = capacidadesOrdenes({ rol: "TECNICO" }).ejecutar;
    wrap(<VistaPanelSesion puedeOperar={puede} esPropia={true} sesion={SESION_ABIERTA} duraciones={DURACIONES} />);
    // Los valores base del read model se muestran (extrapolación local puede sumar
    // segundos al efectivo/transcurrido, pero el PAUSADO nunca se extrapola).
    expect(screen.getByText("00:10:00")).toBeInTheDocument(); // pausado exacto
  });

  it("extrapolar sólo avanza cuando la sesión está ABIERTA; nunca toca pausado", () => {
    const base = { efectivoMs: 1000, pausadoMs: 500, transcurridoMs: 1500 };
    const abierta = extrapolar(base, "ABIERTA", 0, 5000);
    expect(abierta.efectivoMs).toBe(6000);
    expect(abierta.transcurridoMs).toBe(6500);
    expect(abierta.pausadoMs).toBe(500); // pausado intacto
    const pausada = extrapolar(base, "PAUSADA", 0, 5000);
    expect(pausada).toEqual(base); // sin cambios
  });
});

/* ================== Comandos: opId + ocurridoAt, sin identityId ========== */

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}

describe("Comandos de sesión · contrato (opId + ocurridoAt, jamás identityId)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("abrir (online): POST /ot-1/sesion/abrir con opId, ocurridoAt y SIN identityId", async () => {
    const cola = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ estado: "ABIERTA" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const r = await abrirSesion(cola, "ot-1", { ocurridoAtIso: "2024-05-05T10:00:00.000Z" });
    expect(r.encolada).toBe(false);
    expect(r.error).toBeUndefined();
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("/ordenes/ot-1/sesion/abrir");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.opId).toBeTruthy();
    expect(body.ocurridoAt).toBe("2024-05-05T10:00:00.000Z");
    expect(body.origen).toBe("online");
    expect(body).not.toHaveProperty("identityId");
    expect(body).not.toHaveProperty("activoId");
  });

  it("cada acción golpea su ruta y comando correctos", async () => {
    const cola = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    for (const [fn, accion] of [
      [pausarSesion, "pausar"],
      [reanudarSesion, "reanudar"],
      [cerrarSesion, "cerrar"],
    ] as const) {
      const spy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
      await fn(cola, "ot-9");
      expect(String(spy.mock.calls[0]![0])).toContain(`/ordenes/ot-9/sesion/${accion}`);
      spy.mockRestore();
    }
  });
});

/* ===================== Offline First: conserva ocurridoAt ================ */

describe("Offline First · encola conservando ocurridoAt (§19)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("ante fallo de red, encola el comando oficial con ordenId, ocurridoAt y origen offline", async () => {
    const cola = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const r = await abrirSesion(cola, "ot-7", { ocurridoAtIso: "2024-05-05T11:22:33.000Z" });
    expect(r.encolada).toBe(true);
    expect(cola.pendientes()).toBe(1);
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe(`${MODULO}.sesion.abrir`);
    expect(op.input.ordenId).toBe("ot-7");
    expect(op.input.ocurridoAt).toBe("2024-05-05T11:22:33.000Z"); // hora del click, no del sync
    expect(op.input.origen).toBe("offline");
    expect(op.input).not.toHaveProperty("identityId");
    expect(op.opId).toBeTruthy();
  });

  it("pausar/reanudar/cerrar también degradan a la cola con su comando oficial", async () => {
    const cola = new ColaSync("deltaops", async () => reciboOk([]), localStorage, "ordenes");
    for (const [fn, accion] of [
      [pausarSesion, "pausar"],
      [reanudarSesion, "reanudar"],
      [cerrarSesion, "cerrar"],
    ] as const) {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const r = await fn(cola, "ot-8", { ocurridoAtIso: "2024-06-06T00:00:00.000Z" });
      expect(r.encolada).toBe(true);
      vi.restoreAllMocks();
    }
    const ops = cola.getSnapshot();
    expect(ops.map((o) => o.comando)).toEqual([
      `${MODULO}.sesion.pausar`,
      `${MODULO}.sesion.reanudar`,
      `${MODULO}.sesion.cerrar`,
    ]);
    for (const o of ops) {
      expect(o.input.ocurridoAt).toBe("2024-06-06T00:00:00.000Z");
      expect(o.input.origen).toBe("offline");
    }
  });
});
