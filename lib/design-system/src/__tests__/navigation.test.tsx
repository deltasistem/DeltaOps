/**
 * DGP-005 · Pruebas de componentes de navegación / layout del Design System DeltaOps.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { Home, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarGrupo,
  SidebarItem,
  Topbar,
  Workspace,
  DashboardLayout,
  DashboardItem,
} from "../components/navigation";

describe("Sidebar", () => {
  it("expone un nav con la etiqueta por defecto en español", () => {
    render(
      <Sidebar>
        <SidebarGrupo titulo="Principal">
          <SidebarItem etiqueta="Inicio" href="/" />
        </SidebarGrupo>
      </Sidebar>,
    );
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
  });

  it("permite personalizar la etiqueta y renderiza encabezado y pie", () => {
    render(
      <Sidebar etiqueta="Menú lateral" encabezado={<span>DELTA</span>} pie={<span>Salir</span>}>
        <SidebarItem etiqueta="Inicio" href="/" />
      </Sidebar>,
    );
    expect(screen.getByRole("navigation", { name: "Menú lateral" })).toBeInTheDocument();
    expect(screen.getByText("DELTA")).toBeInTheDocument();
    expect(screen.getByText("Salir")).toBeInTheDocument();
  });

  it("aplica la clase colapsada cuando colapsada=true", () => {
    render(
      <Sidebar colapsada>
        <SidebarItem etiqueta="Inicio" href="/" />
      </Sidebar>,
    );
    expect(screen.getByRole("navigation")).toHaveClass("do-sidebar--colapsada");
  });

  it("convierte el propio panel de navegación en el diálogo modal en móvil", () => {
    const onCerrarMovil = vi.fn();
    render(
      <Sidebar abiertaMovil onCerrarMovil={onCerrarMovil} etiqueta="Menú móvil">
        <SidebarGrupo>
          <SidebarItem etiqueta="Inicio" href="/" />
        </SidebarGrupo>
      </Sidebar>,
    );
    // El diálogo es el <nav> real (contiene la navegación), no un backdrop vacío.
    const dialogo = screen.getByRole("dialog", { name: "Menú móvil" });
    expect(dialogo.tagName).toBe("NAV");
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toContainElement(screen.getByRole("link", { name: "Inicio" }));
  });

  it("cierra con Escape estando el panel modal abierto", () => {
    const onCerrarMovil = vi.fn();
    render(
      <Sidebar abiertaMovil onCerrarMovil={onCerrarMovil} etiqueta="Menú móvil">
        <SidebarItem etiqueta="Inicio" href="/" />
      </Sidebar>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCerrarMovil).toHaveBeenCalledTimes(1);
  });

  it("cierra el panel móvil al hacer clic en el backdrop decorativo", () => {
    const onCerrarMovil = vi.fn();
    const { container } = render(
      <Sidebar abiertaMovil onCerrarMovil={onCerrarMovil}>
        <SidebarItem etiqueta="Inicio" href="/" />
      </Sidebar>,
    );
    const backdrop = container.querySelector(".do-sidebar__overlay");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    // El backdrop NO es un diálogo ni landmark.
    expect(backdrop).not.toHaveAttribute("role");
    fireEvent.click(backdrop!);
    expect(onCerrarMovil).toHaveBeenCalledTimes(1);
  });

  it("no expone diálogo cuando no está abierto en móvil", () => {
    render(
      <Sidebar>
        <SidebarItem etiqueta="Inicio" href="/" />
      </Sidebar>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("navigation")).not.toHaveAttribute("aria-modal");
  });

  it("gestiona el foco modal: enfoca al abrir, atrapa Tab y restaura al cerrar", () => {
    // Elemento previo que debe recuperar el foco al cerrar el modal.
    const previo = document.createElement("button");
    previo.textContent = "disparador";
    document.body.appendChild(previo);
    previo.focus();
    expect(document.activeElement).toBe(previo);

    const { rerender } = render(
      <Sidebar abiertaMovil onCerrarMovil={() => {}} etiqueta="Menú móvil">
        <SidebarGrupo>
          <SidebarItem etiqueta="Inicio" href="/" />
          <SidebarItem etiqueta="Ajustes" href="/ajustes" />
        </SidebarGrupo>
      </Sidebar>,
    );

    // Al abrir, el foco entra al panel (primer enfocable).
    const primero = screen.getByRole("link", { name: "Inicio" });
    const ultimo = screen.getByRole("link", { name: "Ajustes" });
    expect(document.activeElement).toBe(primero);

    // Trampa de Tab: desde el último, Tab vuelve al primero.
    ultimo.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(primero);

    // Trampa Shift+Tab: desde el primero, retrocede al último.
    primero.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ultimo);

    // Al cerrar, se restaura el foco al elemento previo.
    rerender(
      <Sidebar etiqueta="Menú móvil">
        <SidebarGrupo>
          <SidebarItem etiqueta="Inicio" href="/" />
          <SidebarItem etiqueta="Ajustes" href="/ajustes" />
        </SidebarGrupo>
      </Sidebar>,
    );
    expect(document.activeElement).toBe(previo);
    previo.remove();
  });
});

describe("SidebarGrupo", () => {
  it("expone un grupo etiquetado por su título", () => {
    render(
      <Sidebar>
        <SidebarGrupo titulo="Operaciones">
          <SidebarItem etiqueta="Órdenes" href="/ordenes" />
        </SidebarGrupo>
      </Sidebar>,
    );
    expect(screen.getByRole("group", { name: "Operaciones" })).toBeInTheDocument();
  });
});

describe("SidebarItem", () => {
  it("marca el ítem activo con aria-current='page' y clase de acento", () => {
    render(
      <Sidebar>
        <SidebarGrupo>
          <SidebarItem etiqueta="Inicio" href="/" activo icono={Home} badge={5} />
        </SidebarGrupo>
      </Sidebar>,
    );
    const enlace = screen.getByRole("link", { name: /Inicio/ });
    expect(enlace).toHaveAttribute("aria-current", "page");
    expect(enlace).toHaveClass("do-sidebar__item--activo");
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renderiza como botón e invoca onClick cuando no hay href", () => {
    const onClick = vi.fn();
    render(
      <Sidebar>
        <SidebarGrupo>
          <SidebarItem etiqueta="Ajustes" icono={Settings} onClick={onClick} />
        </SidebarGrupo>
      </Sidebar>,
    );
    const boton = screen.getByRole("button", { name: /Ajustes/ });
    expect(boton).not.toHaveAttribute("aria-current");
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Topbar", () => {
  it("renderiza título, slots inicio y acciones", () => {
    render(
      <Topbar
        titulo="Panel"
        inicio={<button type="button">Menú</button>}
        acciones={<button type="button">Perfil</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menú" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perfil" })).toBeInTheDocument();
  });

  it("expone landmark banner (<header>) cuando es única con unico=true", () => {
    render(<Topbar titulo="Panel" unico />);
    const banner = screen.getByRole("banner");
    expect(banner.tagName).toBe("HEADER");
    expect(banner).toHaveClass("do-topbar");
  });

  it("no genera landmark banner por defecto (renderiza <div> con la misma clase)", () => {
    const { container } = render(<Topbar titulo="Panel" />);
    expect(screen.queryByRole("banner")).toBeNull();
    const raiz = container.querySelector(".do-topbar");
    expect(raiz?.tagName).toBe("DIV");
  });
});

describe("Workspace", () => {
  it("compone sidebar, topbar y main con id y enlace de salto", () => {
    render(
      <Workspace
        sidebar={
          <Sidebar>
            <SidebarItem etiqueta="Inicio" href="/" />
          </Sidebar>
        }
        topbar={<Topbar titulo="Panel" />}
      >
        <p>Contenido principal</p>
      </Workspace>,
    );
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "do-contenido");
    const salto = screen.getByRole("link", { name: "Saltar al contenido" });
    expect(salto).toHaveAttribute("href", "#do-contenido");
    expect(screen.getByText("Contenido principal")).toBeInTheDocument();
  });
});

describe("DashboardLayout", () => {
  it("aplica la clase de columnas fijas y renderiza items con span", () => {
    const { container } = render(
      <DashboardLayout columnas={3}>
        <DashboardItem span={2}>A</DashboardItem>
        <DashboardItem>B</DashboardItem>
      </DashboardLayout>,
    );
    const grid = container.querySelector(".do-dashboard");
    expect(grid).toHaveClass("do-dashboard--cols-3");
    expect(container.querySelector(".do-dashboard__item--span-2")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
