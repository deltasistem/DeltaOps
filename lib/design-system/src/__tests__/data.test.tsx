/**
 * DGP-005 · Pruebas de componentes de datos y layout del Design System DeltaOps.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { TrendingUp } from "lucide-react";
import {
  Table,
  Pagination,
  Breadcrumb,
  KpiCard,
  EmptyState,
  ErrorState,
  Timeline,
  OfflineBadge,
} from "../components/data";
import { AppShell, PageHeader, Card, CardHeader, CardContent } from "../components/layout";

describe("Table", () => {
  it("renderiza caption accesible, encabezados y filas", () => {
    render(
      <Table caption="Órdenes recientes" compacta>
        <thead>
          <tr>
            <th>Folio</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>OT-001</td>
            <td>Abierta</td>
          </tr>
        </tbody>
      </Table>,
    );
    // La región es accesible por el caption.
    expect(screen.getByRole("region", { name: "Órdenes recientes" })).toBeInTheDocument();
    expect(screen.getByText("Órdenes recientes")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Folio" })).toBeInTheDocument();
    expect(screen.getByText("OT-001")).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("marca la página actual con aria-current='page'", () => {
    render(<Pagination pagina={2} totalPaginas={5} onChange={() => {}} />);
    const activa = screen.getByRole("button", { name: "Página 2" });
    expect(activa).toHaveAttribute("aria-current", "page");
    const otra = screen.getByRole("button", { name: "Página 3" });
    expect(otra).not.toHaveAttribute("aria-current");
  });

  it("invoca onChange al pulsar siguiente y deshabilita anterior en la primera página", () => {
    const onChange = vi.fn();
    render(<Pagination pagina={1} totalPaginas={5} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe("Breadcrumb", () => {
  it("expone un nav con etiqueta y marca el elemento actual", () => {
    render(
      <Breadcrumb
        items={[
          { label: "Inicio", href: "/" },
          { label: "Activos", href: "/activos" },
          { label: "Bomba 3" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Ruta de navegación" })).toBeInTheDocument();
    expect(screen.getByText("Bomba 3")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).toBeInTheDocument();
  });
});

describe("KpiCard", () => {
  it("muestra título, valor, delta con tendencia y admite icono", () => {
    render(
      <KpiCard
        titulo="Disponibilidad"
        valor="98,4%"
        delta={{ valor: "+2,1%", tendencia: "positiva", descripcion: "vs. mes anterior" }}
        icono={TrendingUp}
      />,
    );
    expect(screen.getByText("Disponibilidad")).toBeInTheDocument();
    expect(screen.getByText("98,4%")).toBeInTheDocument();
    const delta = screen.getByText("+2,1%");
    expect(delta.parentElement).toHaveClass("do-kpi__delta--positiva");
  });
});

describe("EmptyState", () => {
  it("dispara la acción opcional al pulsar el botón", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        titulo="Sin resultados"
        descripcion="No hay órdenes que coincidan."
        accion={{ label: "Crear orden", onClick }}
      />,
    );
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear orden" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorState", () => {
  it("usa role alert y ofrece reintento", () => {
    const onReintentar = vi.fn();
    render(<ErrorState onReintentar={onReintentar} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });
});

describe("Timeline", () => {
  it("renderiza eventos con hora dentro de una lista etiquetada", () => {
    render(
      <Timeline
        eventos={[
          { titulo: "Orden creada", hora: "08:00", tono: "info" },
          { titulo: "Orden cerrada", hora: "12:30", tono: "exito" },
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Cronología de eventos" })).toBeInTheDocument();
    expect(screen.getByText("Orden creada")).toBeInTheDocument();
    expect(screen.getByText("12:30")).toBeInTheDocument();
  });
});

describe("OfflineBadge", () => {
  it("muestra el texto español según el estado", () => {
    const { rerender } = render(<OfflineBadge estado="offline" />);
    expect(screen.getByRole("status")).toHaveTextContent("Sin conexión");
    rerender(<OfflineBadge estado="sincronizado" />);
    expect(screen.getByRole("status")).toHaveTextContent("Sincronizado");
  });
});

describe("AppShell", () => {
  it("renderiza los slots logo, nav, acciones y children", () => {
    render(
      <AppShell
        logo={<span>DELTA</span>}
        nav={<a href="/panel">Panel</a>}
        acciones={<button type="button">Perfil</button>}
      >
        <p>Contenido principal</p>
      </AppShell>,
    );
    expect(screen.getByText("DELTA")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.getByText("Contenido principal")).toBeInTheDocument();
  });

  it("alterna el menú colapsable y lo cierra con Escape", () => {
    render(
      <AppShell nav={<a href="/panel">Panel</a>}>
        <p>Contenido</p>
      </AppShell>,
    );
    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Abrir menú" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("PageHeader y Card", () => {
  it("renderiza título h1 y estructura de tarjeta", () => {
    render(
      <>
        <PageHeader titulo="Panel de control" descripcion="Resumen operativo" />
        <Card>
          <CardHeader>Encabezado</CardHeader>
          <CardContent>Cuerpo</CardContent>
        </Card>
      </>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Panel de control" })).toBeInTheDocument();
    expect(screen.getByText("Resumen operativo")).toBeInTheDocument();
    expect(screen.getByText("Encabezado")).toBeInTheDocument();
    expect(screen.getByText("Cuerpo")).toBeInTheDocument();
  });
});
