/**
 * DGP-005 · Componentes de layout del Design System DeltaOps.
 * Card, PageHeader, Section, Toolbar, AppShell.
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 */
import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Menu, X } from "lucide-react";
import { IconButton } from "./core";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- Card --------------------------------- */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Superficie interactiva (hover destacado). */
  interactiva?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactiva = false, className, ...rest },
  ref,
) {
  return <div ref={ref} className={cx("do-card", interactiva && "do-card--interactiva", className)} {...rest} />;
});

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("do-card__header", className)} {...rest} />;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("do-card__content", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("do-card__footer", className)} {...rest} />;
}

/* ------------------------------ PageHeader ------------------------------ */

export interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  titulo: ReactNode;
  descripcion?: ReactNode;
  /** Acciones alineadas a la derecha (botones, menús). */
  acciones?: ReactNode;
}

export function PageHeader({ titulo, descripcion, acciones, className, ...rest }: PageHeaderProps) {
  return (
    <header className={cx("do-page-header", className)} {...rest}>
      <div className="do-page-header__texto">
        <h1 className="do-page-header__titulo">{titulo}</h1>
        {descripcion && <p className="do-page-header__descripcion">{descripcion}</p>}
      </div>
      {acciones && <div className="do-page-header__acciones">{acciones}</div>}
    </header>
  );
}

/* -------------------------------- Section ------------------------------- */

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  titulo?: ReactNode;
  /** Acciones a la derecha del título de la sección. */
  acciones?: ReactNode;
}

export function Section({ titulo, acciones, className, children, ...rest }: SectionProps) {
  const id = useId();
  return (
    <section className={cx("do-section", className)} aria-labelledby={titulo ? id : undefined} {...rest}>
      {(titulo || acciones) && (
        <div className="do-section__encabezado">
          {titulo && (
            <h2 id={id} className="do-section__titulo">
              {titulo}
            </h2>
          )}
          {acciones && <div className="do-section__acciones">{acciones}</div>}
        </div>
      )}
      <div className="do-section__contenido">{children}</div>
    </section>
  );
}

/* -------------------------------- Toolbar ------------------------------- */

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Justificación del contenido en el eje principal. */
  justificar?: "inicio" | "centro" | "fin" | "entre";
  label?: string;
}

const JUSTIFICAR: Record<NonNullable<ToolbarProps["justificar"]>, string> = {
  inicio: "flex-start",
  centro: "center",
  fin: "flex-end",
  entre: "space-between",
};

export function Toolbar({ justificar = "inicio", label, className, style, ...rest }: ToolbarProps) {
  return (
    <div
      className={cx("do-toolbar", className)}
      role="toolbar"
      aria-label={label}
      style={{ justifyContent: JUSTIFICAR[justificar], ...style }}
      {...rest}
    />
  );
}

/* -------------------------------- AppShell ------------------------------ */

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  /** Slot de marca (logo). */
  logo?: ReactNode;
  /** Slot de navegación horizontal. */
  nav?: ReactNode;
  /** Slot de acciones (perfil, notificaciones). */
  acciones?: ReactNode;
  /** Etiqueta accesible de la barra superior. */
  labelBarra?: string;
  /** Etiqueta accesible de la navegación. */
  labelNav?: string;
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell(
  {
    logo,
    nav,
    acciones,
    labelBarra = "Barra principal",
    labelNav = "Navegación principal",
    className,
    children,
    ...rest
  },
  ref,
) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const navId = useId();

  useEffect(() => {
    if (!menuAbierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuAbierto]);

  return (
    <div ref={ref} className={cx("do-shell", className)} {...rest}>
      <header className="do-shell__barra" aria-label={labelBarra}>
        <div className="do-shell__barra-interior">
          {nav && (
            <IconButton
              label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
              variant="fantasma"
              size="md"
              className="do-shell__menu-btn"
              aria-expanded={menuAbierto}
              aria-controls={navId}
              onClick={() => setMenuAbierto((v) => !v)}
            >
              {menuAbierto ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
            </IconButton>
          )}
          {logo && <div className="do-shell__logo">{logo}</div>}
          {nav && (
            <nav
              id={navId}
              className={cx("do-shell__nav", menuAbierto && "do-shell__nav--abierto")}
              aria-label={labelNav}
            >
              {nav}
            </nav>
          )}
          {acciones && <div className="do-shell__acciones">{acciones}</div>}
        </div>
      </header>
      <main className="do-shell__main">
        <div className="do-shell__contenido">{children}</div>
      </main>
    </div>
  );
});
