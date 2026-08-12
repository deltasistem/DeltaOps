/**
 * DGP-020.1 (E2E fix) · ModalAsignacion del supervisor: al seleccionar una
 * IDENTIDAD canónica el botón "Asignar" queda habilitado y el submit envía el
 * identityId (asignación FUERTE por persona), nunca texto libre.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react";
import { ThemeProvider, ToastProvider } from "@workspace/design-system";
import { OfflineProvider } from "../lib/offline/contexto";
import { AccionResponsable, ModalAsignacion } from "../pages/ordenes-supervisor";

const ORDEN = {
  id: "OT-77", tenantId: "deltaops", codigo: "OT-77", titulo: "Falla bomba", tipo: "correctiva",
  estado: "PLANIFICADA", prioridad: "alta", categoria: null, severidad: null,
  responsable: null, supervisor: null, activoPrincipalId: null, ubicacionId: null,
  datos: {}, version: 2, lastEventId: "e0", actualizadoAt: "2024-06-10T00:00:00Z",
};

let posts: Array<{ url: string; body: unknown }> = [];

function mockFetch(): void {
  vi.spyOn(global, "fetch").mockImplementation(async (u, init) => {
    const url = String(u);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST") {
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ id: ORDEN.id, version: 3, idempotente: false }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    if (/\/identidades-elegibles/.test(url)) {
      return new Response(JSON.stringify({ identidades: [
        { identityId: "idn-ana", nombre: "Ana Soto", rol: "TECNICO" },
        { identityId: "idn-luis", nombre: "Luis Paz", rol: "TECNICO" },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (/\/ordenes(\?|$)/.test(url)) {
      return new Response(JSON.stringify({ ordenes: [ORDEN], total: 1 }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("null", { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function Wrap() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <ModalAsignacion orden={ORDEN as never} onCerrar={() => {}} onGuardado={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("ModalAsignacion (asignación fuerte por identidad)", () => {
  beforeEach(() => { posts = []; mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("seleccionar una identidad habilita 'Asignar' y el submit envía identityId", async () => {
    render(<Wrap />);
    // El modal se abre y el selector de identidades se carga (nombre · rol).
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    const select = await screen.findByLabelText(/Responsable/i);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Ana Soto · TECNICO/ })).toBeInTheDocument(),
    );

    // Antes de seleccionar, el submit está deshabilitado (evita no-op).
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: /^Asignar$/ });
    expect(submit).toBeDisabled();

    // Seleccionar "Ana Soto" ⇒ el botón "Asignar" queda HABILITADO.
    fireEvent.change(select, { target: { value: "idn-ana" } });
    await waitFor(() => expect(submit).not.toBeDisabled());

    // Submit ⇒ POST asignar-recurso-humano con el identityId (no texto libre).
    fireEvent.click(submit);
    await waitFor(() => expect(posts.length).toBeGreaterThanOrEqual(1));
    const asignacion = posts.find((p) => /asignar-recurso-humano/.test(p.url));
    expect(asignacion).toBeDefined();
    const body = asignacion!.body as { tipo: string; asignadoId: string; rol: string };
    expect(body.tipo).toBe("persona");
    expect(body.asignadoId).toBe("idn-ana");
    expect(body.rol).toBe("responsable");
  });
});

// DGP-020.1 (§9) · Reasignación de una OT YA asignada desde la superficie del
// supervisor: acción visible, modal en modo reasignar que precarga la identidad
// actual y exige elegir OTRA, con POST del nuevo identityId (mismo comando).
const ORDEN_ASIGNADA = {
  ...ORDEN, id: "OT-88", codigo: "OT-88", estado: "EN_EJECUCION", responsable: "Ana Soto",
};

function WrapReasignar() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <OfflineProvider tenant="deltaops" modulo="ordenes">
          <AccionResponsable orden={ORDEN_ASIGNADA as never} onCambio={() => {}} />
        </OfflineProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

describe("Reasignación de responsable (OT ya asignada)", () => {
  beforeEach(() => { posts = []; mockFetch(); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("expone 'Reasignar responsable', precarga la actual y envía el nuevo identityId", async () => {
    render(<WrapReasignar />);

    // Acción de reasignación visible para una OT con responsable.
    const abrir = await screen.findByRole("button", { name: /Reasignar responsable/i });
    fireEvent.click(abrir);

    // Modal en modo reasignar: título y submit "Reasignar".
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Reasignar responsable · OT-88/)).toBeInTheDocument();
    const select = (await within(dialog).findByLabelText(/Responsable/i)) as HTMLSelectElement;
    await waitFor(() =>
      expect(within(dialog).getByRole("option", { name: /Luis Paz · TECNICO/ })).toBeInTheDocument(),
    );

    // Precarga la identidad ACTUAL (Ana Soto ⇒ idn-ana) y el submit está
    // deshabilitado mientras no se elija OTRA persona (evita reasignar al mismo).
    await waitFor(() => expect(select.value).toBe("idn-ana"));
    const submit = within(dialog).getByRole("button", { name: /^Reasignar$/ });
    expect(submit).toBeDisabled();

    // Elegir OTRA identidad ⇒ habilita ⇒ POST con el nuevo identityId.
    fireEvent.change(select, { target: { value: "idn-luis" } });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);

    await waitFor(() => expect(posts.length).toBeGreaterThanOrEqual(1));
    const reasig = posts.find((p) => /asignar-recurso-humano/.test(p.url));
    expect(reasig).toBeDefined();
    const body = reasig!.body as { tipo: string; asignadoId: string; rol: string; reemplazaVigentes: boolean };
    expect(body.tipo).toBe("persona");
    expect(body.asignadoId).toBe("idn-luis");
    expect(body.rol).toBe("responsable");
    expect(body.reemplazaVigentes).toBe(true);
  });
});
