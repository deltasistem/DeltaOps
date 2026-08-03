/**
 * DGP-005 · Componentes de navegación / layout del Design System DeltaOps.
 * Sidebar (+ SidebarGrupo, SidebarItem), Topbar, Workspace, DashboardLayout (+ DashboardItem).
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 */
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { type LucideIcon } from "lucide-react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------- foco atrapado (hook) ------------------------ */
/* Imita el patrón de gestión de foco modal de components/overlays.tsx. */

const SELECTOR_ENFOCABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useFocoAtrapado(activo: boolean, contenedorRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!activo) return;
    const previo = document.activeElement as HTMLElement | null;
    const contenedor = contenedorRef.current;
    if (contenedor) {
      const primero = contenedor.querySelector<HTMLElement>(SELECTOR_ENFOCABLE);
      (primero ?? contenedor).focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !contenedor) return;
      const enfocables = Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLE));
      if (enfocables.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const activoAhora = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activoAhora === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activoAhora === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previo?.focus?.();
    };
  }, [activo, contenedorRef]);
}

/* ================================ Sidebar =============================== */

export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Slot superior fijo (marca, logo). */
  encabezado?: ReactNode;
  /** Slot inferior fijo (perfil, cierre de sesión). */
  pie?: ReactNode;
  children?: ReactNode;
  /** Estado colapsado (solo iconos, ancho reducido). */
  colapsada?: boolean;
  /** Callback del control de colapso. */
  onColapsar?: () => void;
  /** aria-label del <nav>. Por defecto "Navegación principal". */
  etiqueta?: string;
  /** Muestra la barra como panel modal en móvil (<768px). */
  abiertaMovil?: boolean;
  /** Callback para cerrar el panel modal móvil. */
  onCerrarMovil?: () => void;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  {
    encabezado,
    pie,
    children,
    colapsada = false,
    onColapsar,
    etiqueta = "Navegación principal",
    abiertaMovil = false,
    onCerrarMovil,
    className,
    ...rest
  },
  ref,
) {
  // El panel es diálogo modal solo cuando se abre en móvil con manejador de cierre.
  const modal = abiertaMovil && !!onCerrarMovil;
  const panelRef = useRef<HTMLElement>(null);

  // Foco atrapado + restauración del foco previo (patrón Modal de overlays.tsx).
  useFocoAtrapado(modal, panelRef);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCerrarMovil?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, onCerrarMovil]);

  const asignarRef = (nodo: HTMLElement | null) => {
    panelRef.current = nodo;
    if (typeof ref === "function") ref(nodo);
    else if (ref) (ref as { current: HTMLElement | null }).current = nodo;
  };

  return (
    <>
      {modal && (
        // Backdrop decorativo: el clic cierra, pero no es un landmark ni diálogo.
        <div className="do-sidebar__overlay" aria-hidden="true" onClick={onCerrarMovil} />
      )}
      <nav
        ref={asignarRef}
        className={cx(
          "do-sidebar",
          colapsada && "do-sidebar--colapsada",
          abiertaMovil && "do-sidebar--abierta-movil",
          className,
        )}
        // El propio panel de navegación es el diálogo modal cuando está abierto en móvil.
        role={modal ? "dialog" : undefined}
        aria-modal={modal ? true : undefined}
        aria-label={etiqueta}
        tabIndex={modal ? -1 : undefined}
        {...rest}
      >
        {encabezado && <div className="do-sidebar__encabezado">{encabezado}</div>}
        <div className="do-sidebar__cuerpo">{children}</div>
        {pie && <div className="do-sidebar__pie">{pie}</div>}
      </nav>
    </>
  );
});

/* ------------------------------ SidebarGrupo ---------------------------- */

export interface SidebarGrupoProps extends HTMLAttributes<HTMLDivElement> {
  titulo?: ReactNode;
  children?: ReactNode;
}

export function SidebarGrupo({ titulo, children, className, ...rest }: SidebarGrupoProps) {
  const id = useId();
  return (
    <div
      className={cx("do-sidebar__grupo", className)}
      role="group"
      aria-labelledby={titulo ? id : undefined}
      {...rest}
    >
      {titulo && (
        <p id={id} className="do-sidebar__grupo-titulo">
          {titulo}
        </p>
      )}
      <ul className="do-sidebar__lista">{children}</ul>
    </div>
  );
}

/* ------------------------------- SidebarItem ---------------------------- */

export interface SidebarItemProps {
  icono?: LucideIcon;
  etiqueta: ReactNode;
  /** Marca el ítem como activo (acento rojo + aria-current="page"). */
  activo?: boolean;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  /** Contador o distintivo alineado a la derecha. */
  badge?: ReactNode;
  className?: string;
}

export function SidebarItem({
  icono: Icono,
  etiqueta,
  activo = false,
  href,
  onClick,
  badge,
  className,
}: SidebarItemProps) {
  const contenido = (
    <>
      {Icono && (
        <span className="do-sidebar__item-icono" aria-hidden="true">
          <Icono size={20} />
        </span>
      )}
      <span className="do-sidebar__item-texto">{etiqueta}</span>
      {badge != null && <span className="do-sidebar__item-badge">{badge}</span>}
    </>
  );
  const clase = cx("do-sidebar__item", activo && "do-sidebar__item--activo", className);
  return (
    <li className="do-sidebar__lista-item">
      {href ? (
        <a href={href} className={clase} aria-current={activo ? "page" : undefined} onClick={onClick}>
          {contenido}
        </a>
      ) : (
        <button type="button" className={clase} aria-current={activo ? "page" : undefined} onClick={onClick}>
          {contenido}
        </button>
      )}
    </li>
  );
}

/* ================================ Topbar ================================ */

export interface TopbarProps extends HTMLAttributes<HTMLElement> {
  titulo?: ReactNode;
  /** Slot izquierdo (migas de pan, botón de menú). */
  inicio?: ReactNode;
  /** Slot derecho (acciones, perfil). */
  acciones?: ReactNode;
  children?: ReactNode;
  /** Marca la barra como región banner (role="banner") si es única en la página. */
  unico?: boolean;
}

export const Topbar = forwardRef<HTMLElement, TopbarProps>(function Topbar(
  { titulo, inicio, acciones, children, unico = false, className, ...rest },
  ref,
) {
  const contenido = (
    <>
      {inicio && <div className="do-topbar__inicio">{inicio}</div>}
      {titulo && <h1 className="do-topbar__titulo">{titulo}</h1>}
      {children && <div className="do-topbar__contenido">{children}</div>}
      {acciones && <div className="do-topbar__acciones">{acciones}</div>}
    </>
  );
  const clase = cx("do-topbar", className);
  // Con unico=true se usa <header> (landmark banner implícito); si no, un <div> sin rol.
  if (unico) {
    return (
      <header ref={ref as RefObject<HTMLElement>} className={clase} {...rest}>
        {contenido}
      </header>
    );
  }
  return (
    <div ref={ref as RefObject<HTMLDivElement>} className={clase} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {contenido}
    </div>
  );
});

/* =============================== Workspace ============================== */

export interface WorkspaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Barra lateral (normalmente un <Sidebar>). */
  sidebar?: ReactNode;
  /** Barra superior (normalmente un <Topbar>). */
  topbar?: ReactNode;
  children?: ReactNode;
}

export const Workspace = forwardRef<HTMLDivElement, WorkspaceProps>(function Workspace(
  { sidebar, topbar, children, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cx("do-workspace", className)} {...rest}>
      <a href="#do-contenido" className="do-skip-link">
        Saltar al contenido
      </a>
      {sidebar && <div className="do-workspace__sidebar">{sidebar}</div>}
      <div className="do-workspace__panel">
        {topbar && <div className="do-workspace__topbar">{topbar}</div>}
        <main id="do-contenido" className="do-workspace__main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
});

/* ============================ DashboardLayout =========================== */

export interface DashboardLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Número fijo de columnas (1–4). Por defecto auto-fit minmax(260px). */
  columnas?: 1 | 2 | 3 | 4;
  children?: ReactNode;
}

export function DashboardLayout({ columnas, children, className, ...rest }: DashboardLayoutProps) {
  return (
    <div
      className={cx("do-dashboard", columnas && `do-dashboard--cols-${columnas}`, className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface DashboardItemProps extends HTMLAttributes<HTMLDivElement> {
  /** Columnas que ocupa el elemento (1–4). */
  span?: 1 | 2 | 3 | 4;
  children?: ReactNode;
}

export function DashboardItem({ span, children, className, ...rest }: DashboardItemProps) {
  return (
    <div className={cx("do-dashboard__item", span && `do-dashboard__item--span-${span}`, className)} {...rest}>
      {children}
    </div>
  );
}
