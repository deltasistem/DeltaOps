/**
 * DGP-005 · Componentes de superposición y retroalimentación del Design System DeltaOps.
 * Familia overlays/feedback: Tooltip, Dropdown, Modal, Drawer, Alert, Toast,
 * Progress, Skeleton, Accordion, Tabs.
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Variantes semánticas compartidas por la familia feedback. */
export type FeedbackVariant = "exito" | "advertencia" | "error" | "info";

const ICONO_VARIANTE: Record<FeedbackVariant, LucideIcon> = {
  exito: CheckCircle2,
  advertencia: AlertTriangle,
  error: XCircle,
  info: Info,
};

/* -------------------------- foco atrapado (hook) ------------------------ */

const SELECTOR_ENFOCABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useFocoAtrapado(activo: boolean, contenedorRef: React.RefObject<HTMLElement | null>) {
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

/* --------------------------------- Tooltip ------------------------------ */

export type TooltipPosicion = "arriba" | "abajo" | "izquierda" | "derecha";

export interface TooltipProps {
  /** Texto accesible del tooltip. */
  contenido: ReactNode;
  posicion?: TooltipPosicion;
  /** Retardo de apertura en ms. Por defecto usa --do-dur-normal (200). */
  retardo?: number;
  children: ReactNode;
}

export function Tooltip({ contenido, posicion = "arriba", retardo = 200, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const idTooltip = useId();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const abrir = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setVisible(true), retardo);
  }, [retardo]);

  const cerrar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setVisible(false);
  }, []);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  return (
    <span
      className="do-tooltip"
      onMouseEnter={abrir}
      onMouseLeave={cerrar}
      onFocus={abrir}
      onBlur={cerrar}
      onKeyDown={(e) => {
        if (e.key === "Escape") cerrar();
      }}
    >
      <span aria-describedby={visible ? idTooltip : undefined}>{children}</span>
      {visible && (
        <span role="tooltip" id={idTooltip} className={cx("do-tooltip__burbuja", `do-tooltip__burbuja--${posicion}`)}>
          {contenido}
        </span>
      )}
    </span>
  );
}

/* -------------------------------- Dropdown ------------------------------ */

export interface DropdownItem {
  /** Texto visible de la acción. */
  etiqueta: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  icono?: LucideIcon;
}

export interface DropdownProps {
  /** Elemento disparador (se renderiza dentro de un botón accesible). */
  disparador: ReactNode;
  items: DropdownItem[];
  /** Etiqueta accesible del menú. */
  etiquetaMenu?: string;
  className?: string;
}

export function Dropdown({ disparador, items, etiquetaMenu = "Menú de acciones", className }: DropdownProps) {
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const idMenu = useId();

  const habilitados = items.map((it) => !it.disabled);

  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [abierto]);

  useEffect(() => {
    if (abierto) {
      const primero = habilitados.findIndex(Boolean);
      const idx = primero === -1 ? 0 : primero;
      setIndiceActivo(idx);
      requestAnimationFrame(() => itemsRef.current[idx]?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function moverFoco(direccion: 1 | -1) {
    const total = items.length;
    let idx = indiceActivo;
    for (let i = 0; i < total; i++) {
      idx = (idx + direccion + total) % total;
      if (habilitados[idx]) break;
    }
    setIndiceActivo(idx);
    itemsRef.current[idx]?.focus();
  }

  function onKeyDownMenu(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moverFoco(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moverFoco(-1);
        break;
      case "Escape":
        e.preventDefault();
        setAbierto(false);
        break;
      case "Home":
        e.preventDefault();
        setIndiceActivo(habilitados.findIndex(Boolean));
        break;
      case "End":
        e.preventDefault();
        for (let i = items.length - 1; i >= 0; i--) {
          if (habilitados[i]) {
            setIndiceActivo(i);
            itemsRef.current[i]?.focus();
            break;
          }
        }
        break;
    }
  }

  return (
    <div ref={contenedorRef} className={cx("do-dropdown", className)}>
      <button
        type="button"
        className="do-dropdown__disparador"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !abierto) {
            e.preventDefault();
            setAbierto(true);
          }
        }}
      >
        {disparador}
      </button>
      {abierto && (
        <div
          role="menu"
          id={idMenu}
          aria-label={etiquetaMenu}
          className="do-dropdown__menu"
          onKeyDown={onKeyDownMenu}
        >
          {items.map((item, i) => {
            const Icono = item.icono;
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                ref={(el) => {
                  itemsRef.current[i] = el;
                }}
                tabIndex={i === indiceActivo ? 0 : -1}
                className="do-dropdown__item"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  cerrar();
                }}
              >
                {Icono && <Icono size={16} aria-hidden="true" className="do-dropdown__icono" />}
                {item.etiqueta}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Modal -------------------------------- */

export interface ModalProps {
  abierto: boolean;
  onClose: () => void;
  /** Título obligatorio: sirve como etiqueta accesible del diálogo. */
  titulo: string;
  children?: ReactNode;
  /** Acciones del pie (por ejemplo botones). */
  pie?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Etiqueta del botón de cierre. */
  etiquetaCerrar?: string;
}

export function Modal({
  abierto,
  onClose,
  titulo,
  children,
  pie,
  size = "md",
  etiquetaCerrar = "Cerrar",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  useFocoAtrapado(abierto, panelRef);

  useEffect(() => {
    if (!abierto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [abierto, onClose]);

  if (!abierto) return null;

  return createPortal(
    <div className="do-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={cx("do-modal", `do-modal--${size}`)}
      >
        <header className="do-modal__cabecera">
          <h2 id={idTitulo} className="do-modal__titulo">
            {titulo}
          </h2>
          <button type="button" className="do-overlay__cerrar" aria-label={etiquetaCerrar} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="do-modal__cuerpo">{children}</div>
        {pie && <footer className="do-modal__pie">{pie}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------- Drawer ------------------------------- */

export interface DrawerProps extends Omit<ModalProps, "size"> {
  /** Lado del panel. Por defecto derecha. */
  lado?: "derecha" | "izquierda";
  size?: "sm" | "md" | "lg";
}

export function Drawer({
  abierto,
  onClose,
  titulo,
  children,
  pie,
  lado = "derecha",
  size = "md",
  etiquetaCerrar = "Cerrar",
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  useFocoAtrapado(abierto, panelRef);

  useEffect(() => {
    if (!abierto) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [abierto, onClose]);

  if (!abierto) return null;

  return createPortal(
    <div className="do-overlay do-overlay--drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={cx("do-drawer", `do-drawer--${lado}`, `do-drawer--${size}`)}
      >
        <header className="do-drawer__cabecera">
          <h2 id={idTitulo} className="do-drawer__titulo">
            {titulo}
          </h2>
          <button type="button" className="do-overlay__cerrar" aria-label={etiquetaCerrar} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="do-drawer__cuerpo">{children}</div>
        {pie && <footer className="do-drawer__pie">{pie}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------- Alert -------------------------------- */

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: FeedbackVariant;
  titulo?: ReactNode;
  /** Si se define, muestra botón de cierre y lo invoca al pulsarlo. */
  onClose?: () => void;
  etiquetaCerrar?: string;
}

export function Alert({
  variant = "info",
  titulo,
  onClose,
  etiquetaCerrar = "Descartar",
  className,
  children,
  ...rest
}: AlertProps) {
  const Icono = ICONO_VARIANTE[variant];
  return (
    <div role="alert" className={cx("do-alert", `do-alert--${variant}`, className)} {...rest}>
      <Icono size={20} aria-hidden="true" className="do-alert__icono" />
      <div className="do-alert__contenido">
        {titulo && <p className="do-alert__titulo">{titulo}</p>}
        {children && <div className="do-alert__cuerpo">{children}</div>}
      </div>
      {onClose && (
        <button type="button" className="do-alert__cerrar" aria-label={etiquetaCerrar} onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Toast / hook ---------------------------- */

export interface ToastOpciones {
  variant?: FeedbackVariant;
  titulo?: ReactNode;
  mensaje?: ReactNode;
  /** Duración en ms antes del auto-cierre. 0 lo desactiva. Por defecto 5000. */
  duracion?: number;
}

interface ToastInterno extends ToastOpciones {
  id: number;
}

interface ToastContextValor {
  mostrar: (opciones: ToastOpciones) => number;
  descartar: (id: number) => void;
}

const ToastContext = createContext<ToastContextValor | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Etiqueta accesible de la región de notificaciones. */
  etiquetaRegion?: string;
}

export function ToastProvider({ children, etiquetaRegion = "Notificaciones" }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastInterno[]>([]);
  const contador = useRef(0);

  const descartar = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const mostrar = useCallback(
    (opciones: ToastOpciones) => {
      const id = ++contador.current;
      const duracion = opciones.duracion ?? 5000;
      setToasts((prev) => [...prev, { ...opciones, id }]);
      if (duracion > 0) {
        setTimeout(() => descartar(id), duracion);
      }
      return id;
    },
    [descartar],
  );

  const valor = useMemo(() => ({ mostrar, descartar }), [mostrar, descartar]);

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div className="do-toast__region" role="region" aria-label={etiquetaRegion}>
        {toasts.map((t) => {
          const Icono = ICONO_VARIANTE[t.variant ?? "info"];
          return (
            <div key={t.id} role="status" aria-live="polite" className={cx("do-toast", `do-toast--${t.variant ?? "info"}`)}>
              <Icono size={20} aria-hidden="true" className="do-toast__icono" />
              <div className="do-toast__contenido">
                {t.titulo && <p className="do-toast__titulo">{t.titulo}</p>}
                {t.mensaje && <div className="do-toast__mensaje">{t.mensaje}</div>}
              </div>
              <button
                type="button"
                className="do-toast__cerrar"
                aria-label="Cerrar notificación"
                onClick={() => descartar(t.id)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValor {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast debe usarse dentro de <ToastProvider>.");
  }
  return ctx;
}

/* -------------------------------- Progress ------------------------------ */

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  /** Valor actual (0–max). Omitir para modo indeterminado. */
  value?: number;
  max?: number;
  /** Etiqueta accesible obligatoria. */
  etiqueta: string;
  variant?: "primario" | FeedbackVariant;
}

export function Progress({ value, max = 100, etiqueta, variant = "primario", className, ...rest }: ProgressProps) {
  const indeterminada = value === undefined;
  const porcentaje = indeterminada ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={indeterminada ? undefined : 0}
      aria-valuemax={indeterminada ? undefined : max}
      aria-valuenow={indeterminada ? undefined : value}
      className={cx("do-progress", indeterminada && "do-progress--indeterminada", `do-progress--${variant}`, className)}
      {...rest}
    >
      <div className="do-progress__barra" style={indeterminada ? undefined : { width: `${porcentaje}%` }} />
    </div>
  );
}

/* -------------------------------- Skeleton ------------------------------ */

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  forma?: "linea" | "bloque" | "circulo";
  /** Ancho CSS (por ejemplo "100%" o "12rem"). */
  ancho?: string;
  /** Alto CSS. */
  alto?: string;
}

export function Skeleton({ forma = "linea", ancho, alto, className, style, ...rest }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx("do-skeleton", `do-skeleton--${forma}`, className)}
      style={{ width: ancho, height: alto, ...style }}
      {...rest}
    />
  );
}

/* -------------------------------- Accordion ----------------------------- */

export interface AccordionItem {
  id: string;
  encabezado: ReactNode;
  contenido: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Permite varios paneles abiertos simultáneamente. */
  multiple?: boolean;
  /** Ids abiertos por defecto. */
  porDefecto?: string[];
  className?: string;
}

export function Accordion({ items, multiple = false, porDefecto = [], className }: AccordionProps) {
  const [abiertos, setAbiertos] = useState<string[]>(porDefecto);

  function alternar(id: string) {
    setAbiertos((prev) => {
      const yaAbierto = prev.includes(id);
      if (multiple) {
        return yaAbierto ? prev.filter((x) => x !== id) : [...prev, id];
      }
      return yaAbierto ? [] : [id];
    });
  }

  return (
    <div className={cx("do-accordion", className)}>
      {items.map((item) => {
        const abierto = abiertos.includes(item.id);
        const idEncabezado = `do-acc-h-${item.id}`;
        const idPanel = `do-acc-p-${item.id}`;
        return (
          <div key={item.id} className="do-accordion__item">
            <h3 className="do-accordion__encabezado">
              <button
                type="button"
                id={idEncabezado}
                className="do-accordion__disparador"
                aria-expanded={abierto}
                aria-controls={idPanel}
                disabled={item.disabled}
                onClick={() => alternar(item.id)}
              >
                <span>{item.encabezado}</span>
                <span className="do-accordion__flecha" aria-hidden="true" data-abierto={abierto || undefined} />
              </button>
            </h3>
            <div
              id={idPanel}
              role="region"
              aria-labelledby={idEncabezado}
              className="do-accordion__panel"
              hidden={!abierto}
            >
              <div className="do-accordion__contenido">{item.contenido}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------- Tabs -------------------------------- */

export interface TabItem {
  id: string;
  etiqueta: ReactNode;
  contenido: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Id de la pestaña activa por defecto. */
  porDefecto?: string;
  /** Etiqueta accesible de la lista de pestañas. */
  etiquetaLista?: string;
  className?: string;
  /**
   * ¿Montar en el DOM el contenido de las pestañas INACTIVAS?
   *
   * Por defecto `true` (comportamiento histórico: todos los paneles se montan de
   * entrada y los inactivos se ocultan con `hidden`).
   *
   * Poner `false` para MONTAJE PEREZOSO PERSISTENTE: una pestaña se monta la
   * PRIMERA vez que se visita y, una vez montada, PERMANECE montada (oculta con
   * `hidden`) al cambiar de pestaña. Así se obtiene el beneficio de TTI (al abrir
   * sólo se monta la pestaña activa, no las N restantes) SIN destruir el estado
   * de las pestañas ya visitadas: borradores de formularios (Correctivo inline,
   * Comentarios en redacción, Documentación/Relaciones) sobreviven a la
   * navegación entre pestañas. Extensión ADITIVA: no altera el contrato existente.
   */
  montarInactivas?: boolean;
}

export function Tabs({ items, porDefecto, etiquetaLista = "Pestañas", className, montarInactivas = true }: TabsProps) {
  const habilitadas = items.filter((t) => !t.disabled);
  const inicial = porDefecto ?? habilitadas[0]?.id ?? items[0]?.id;
  const [activa, setActiva] = useState<string>(inicial);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  // MONTAJE PEREZOSO PERSISTENTE (montarInactivas=false): conjunto de pestañas
  // ya visitadas. Se monta el contenido cuando la pestaña se visita por primera
  // vez y permanece montado después (oculto con `hidden`), preservando su estado.
  const [visitadas, setVisitadas] = useState<Set<string>>(() => new Set(inicial ? [inicial] : []));
  const marcarVisitada = useCallback((id: string) => {
    setVisitadas((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const seleccionar = useCallback(
    (id: string) => {
      setActiva(id);
      marcarVisitada(id);
    },
    [marcarVisitada],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    const indices = items.map((t, i) => (!t.disabled ? i : -1)).filter((i) => i >= 0);
    const actual = items.findIndex((t) => t.id === activa);
    const pos = indices.indexOf(actual);
    let siguiente = pos;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        siguiente = (pos + 1) % indices.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        siguiente = (pos - 1 + indices.length) % indices.length;
        break;
      case "Home":
        e.preventDefault();
        siguiente = 0;
        break;
      case "End":
        e.preventDefault();
        siguiente = indices.length - 1;
        break;
      default:
        return;
    }
    const idx = indices[siguiente];
    seleccionar(items[idx].id);
    tabsRef.current[idx]?.focus();
  }

  return (
    <div className={cx("do-tabs", className)}>
      <div role="tablist" aria-label={etiquetaLista} className="do-tabs__lista" onKeyDown={onKeyDown}>
        {items.map((tab, i) => {
          const seleccionada = tab.id === activa;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`do-tab-${tab.id}`}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              aria-selected={seleccionada}
              aria-controls={`do-tabpanel-${tab.id}`}
              tabIndex={seleccionada ? 0 : -1}
              disabled={tab.disabled}
              className={cx("do-tabs__tab", seleccionada && "do-tabs__tab--activa")}
              onClick={() => seleccionar(tab.id)}
            >
              {tab.etiqueta}
            </button>
          );
        })}
      </div>
      {items.map((tab) => {
        const seleccionada = tab.id === activa;
        // Montaje perezoso PERSISTENTE: con `montarInactivas=false` se monta el
        // contenido cuando la pestaña es (o ha sido) visitada; una vez montado
        // permanece en el DOM (oculto con `hidden`), preservando su estado.
        const montar = montarInactivas || seleccionada || visitadas.has(tab.id);
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={`do-tabpanel-${tab.id}`}
            aria-labelledby={`do-tab-${tab.id}`}
            className="do-tabs__panel"
            tabIndex={0}
            hidden={!seleccionada}
          >
            {montar ? tab.contenido : null}
          </div>
        );
      })}
    </div>
  );
}
