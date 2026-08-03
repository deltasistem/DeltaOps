/**
 * DGP-005 · Componentes de datos del Design System DeltaOps.
 * Table, Pagination, Breadcrumb, KpiCard, EmptyState, ErrorState, Timeline, OfflineBadge.
 * Todos consumen exclusivamente tokens (--do-*). Prohibido hardcodear valores.
 */
import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronSep,
  Inbox,
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
  RotateCw,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./core";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- Table -------------------------------- */

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Descripción accesible de la tabla (obligatoria para lectores de pantalla). */
  caption: string;
  /** Oculta visualmente el caption pero lo mantiene accesible. */
  captionOculto?: boolean;
  /** Variante compacta: menor altura de filas. */
  compacta?: boolean;
  /** Resaltar fila al pasar el ratón. */
  hover?: boolean;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  { caption, captionOculto = false, compacta = false, hover = true, className, children, ...rest },
  ref,
) {
  return (
    <div className="do-tabla__envoltura" role="region" aria-label={caption} tabIndex={0}>
      <table
        ref={ref}
        className={cx("do-tabla", compacta && "do-tabla--compacta", hover && "do-tabla--hover", className)}
        {...rest}
      >
        <caption className={cx("do-tabla__caption", captionOculto && "do-visualmente-oculto")}>{caption}</caption>
        {children}
      </table>
    </div>
  );
});

/* ------------------------------ Pagination ------------------------------ */

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  /** Página actual (1-indexada). */
  pagina: number;
  /** Total de páginas. */
  totalPaginas: number;
  /** Callback al cambiar de página. */
  onChange: (pagina: number) => void;
  /** Cantidad de páginas contiguas visibles a cada lado de la actual. */
  ventana?: number;
  label?: string;
}

function rangoPaginas(pagina: number, total: number, ventana: number): number[] {
  const inicio = Math.max(1, pagina - ventana);
  const fin = Math.min(total, pagina + ventana);
  const paginas: number[] = [];
  for (let i = inicio; i <= fin; i++) paginas.push(i);
  return paginas;
}

export function Pagination({
  pagina,
  totalPaginas,
  onChange,
  ventana = 2,
  label = "Paginación",
  className,
  ...rest
}: PaginationProps) {
  const paginas = rangoPaginas(pagina, totalPaginas, ventana);
  const anterior = () => onChange(Math.max(1, pagina - 1));
  const siguiente = () => onChange(Math.min(totalPaginas, pagina + 1));

  return (
    <nav className={cx("do-paginacion", className)} aria-label={label} {...rest}>
      <Button
        variant="secundario"
        size="sm"
        onClick={anterior}
        disabled={pagina <= 1}
        aria-label="Página anterior"
        className="do-paginacion__flecha"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        <span className="do-visualmente-oculto">Anterior</span>
      </Button>

      <ul className="do-paginacion__lista">
        {paginas[0] > 1 && (
          <li aria-hidden="true" className="do-paginacion__elipsis">
            …
          </li>
        )}
        {paginas.map((p) => (
          <li key={p}>
            <button
              type="button"
              className={cx("do-paginacion__pagina", p === pagina && "do-paginacion__pagina--activa")}
              aria-current={p === pagina ? "page" : undefined}
              aria-label={`Página ${p}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          </li>
        ))}
        {paginas[paginas.length - 1] < totalPaginas && (
          <li aria-hidden="true" className="do-paginacion__elipsis">
            …
          </li>
        )}
      </ul>

      <Button
        variant="secundario"
        size="sm"
        onClick={siguiente}
        disabled={pagina >= totalPaginas}
        aria-label="Página siguiente"
        className="do-paginacion__flecha"
      >
        <span className="do-visualmente-oculto">Siguiente</span>
        <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </nav>
  );
}

/* ------------------------------ Breadcrumb ------------------------------ */

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  label?: string;
}

export function Breadcrumb({ items, label = "Ruta de navegación", className, ...rest }: BreadcrumbProps) {
  return (
    <nav className={cx("do-migas", className)} aria-label={label} {...rest}>
      <ol className="do-migas__lista">
        {items.map((item, i) => {
          const ultimo = i === items.length - 1;
          return (
            <li key={i} className="do-migas__item">
              {ultimo || (!item.href && !item.onClick) ? (
                <span className="do-migas__actual" aria-current={ultimo ? "page" : undefined}>
                  {item.label}
                </span>
              ) : item.href ? (
                <a className="do-migas__enlace" href={item.href}>
                  {item.label}
                </a>
              ) : (
                <button type="button" className="do-migas__enlace" onClick={item.onClick}>
                  {item.label}
                </button>
              )}
              {!ultimo && (
                <ChevronSep size={16} className="do-migas__separador" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------- KpiCard -------------------------------- */

export type KpiDeltaTendencia = "positiva" | "negativa" | "neutra";

export interface KpiDelta {
  valor: string;
  /** Tendencia semántica: positiva=éxito, negativa=error, neutra=suave. */
  tendencia?: KpiDeltaTendencia;
  /** Descripción accesible del delta (p. ej. "respecto al mes anterior"). */
  descripcion?: string;
}

export interface KpiCardProps extends HTMLAttributes<HTMLDivElement> {
  titulo: string;
  valor: ReactNode;
  delta?: KpiDelta;
  icono?: LucideIcon;
}

export function KpiCard({ titulo, valor, delta, icono: Icono, className, ...rest }: KpiCardProps) {
  return (
    <div className={cx("do-kpi", className)} {...rest}>
      <div className="do-kpi__cabecera">
        <span className="do-kpi__titulo">{titulo}</span>
        {Icono && (
          <span className="do-kpi__icono" aria-hidden="true">
            <Icono size={20} />
          </span>
        )}
      </div>
      <div className="do-kpi__valor">{valor}</div>
      {delta && (
        <div
          className={cx("do-kpi__delta", `do-kpi__delta--${delta.tendencia ?? "neutra"}`)}
        >
          <span>{delta.valor}</span>
          {delta.descripcion && <span className="do-kpi__delta-desc"> {delta.descripcion}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ EmptyState ------------------------------ */

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  titulo: string;
  descripcion?: string;
  icono?: LucideIcon;
  accion?: EmptyStateAction;
}

export function EmptyState({
  titulo,
  descripcion,
  icono: Icono = Inbox,
  accion,
  className,
  children,
  ...rest
}: EmptyStateProps) {
  return (
    <div className={cx("do-estado-vacio", className)} role="status" {...rest}>
      <span className="do-estado-vacio__icono" aria-hidden="true">
        <Icono size={24} />
      </span>
      <p className="do-estado-vacio__titulo">{titulo}</p>
      {descripcion && <p className="do-estado-vacio__descripcion">{descripcion}</p>}
      {children}
      {accion && (
        <Button variant="primario" size="md" onClick={accion.onClick} className="do-estado-vacio__accion">
          {accion.label}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ ErrorState ------------------------------ */

export interface ErrorStateProps extends Omit<EmptyStateProps, "accion" | "icono" | "titulo"> {
  titulo?: string;
  /** Callback de reintento; muestra el botón "Reintentar". */
  onReintentar?: () => void;
  reintentarLabel?: string;
  icono?: LucideIcon;
}

export function ErrorState({
  titulo = "Se produjo un error",
  descripcion = "No fue posible completar la operación. Inténtalo de nuevo.",
  icono: Icono = AlertTriangle,
  onReintentar,
  reintentarLabel = "Reintentar",
  className,
  children,
  ...rest
}: ErrorStateProps) {
  return (
    <div
      className={cx("do-estado-vacio", "do-estado-error", className)}
      role="alert"
      {...rest}
    >
      <span className="do-estado-vacio__icono do-estado-error__icono" aria-hidden="true">
        <Icono size={24} />
      </span>
      <p className="do-estado-vacio__titulo">{titulo}</p>
      {descripcion && <p className="do-estado-vacio__descripcion">{descripcion}</p>}
      {children}
      {onReintentar && (
        <Button variant="secundario" size="md" onClick={onReintentar} className="do-estado-vacio__accion">
          <RefreshCw size={16} aria-hidden="true" />
          {reintentarLabel}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------- Timeline ------------------------------- */

export type TimelineTono = "neutro" | "primario" | "exito" | "advertencia" | "error" | "info";

export interface TimelineEvento {
  titulo: ReactNode;
  hora?: string;
  descripcion?: ReactNode;
  tono?: TimelineTono;
}

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  eventos: TimelineEvento[];
  label?: string;
}

export function Timeline({ eventos, label = "Cronología de eventos", className, ...rest }: TimelineProps) {
  return (
    <ol className={cx("do-timeline", className)} aria-label={label} {...rest}>
      {eventos.map((ev, i) => (
        <li key={i} className="do-timeline__item">
          <span
            className={cx("do-timeline__punto", `do-timeline__punto--${ev.tono ?? "neutro"}`)}
            aria-hidden="true"
          />
          <div className="do-timeline__contenido">
            <div className="do-timeline__encabezado">
              <span className="do-timeline__titulo">{ev.titulo}</span>
              {ev.hora && <time className="do-timeline__hora">{ev.hora}</time>}
            </div>
            {ev.descripcion && <div className="do-timeline__descripcion">{ev.descripcion}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------ OfflineBadge ---------------------------- */

export type EstadoConexion = "offline" | "sincronizando" | "sincronizado";

const OFFLINE_CONFIG: Record<
  EstadoConexion,
  { texto: string; icono: LucideIcon; clase: string; girar?: boolean }
> = {
  offline: { texto: "Sin conexión", icono: WifiOff, clase: "do-offline--error" },
  sincronizando: { texto: "Sincronizando", icono: RotateCw, clase: "do-offline--advertencia", girar: true },
  sincronizado: { texto: "Sincronizado", icono: Wifi, clase: "do-offline--exito" },
};

export interface OfflineBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  estado: EstadoConexion;
  /** Texto personalizado; por defecto usa el texto español según el estado. */
  texto?: string;
}

export function OfflineBadge({ estado, texto, className, ...rest }: OfflineBadgeProps) {
  const cfg = OFFLINE_CONFIG[estado];
  const Icono = cfg.icono;
  const etiqueta = texto ?? cfg.texto;
  return (
    <span
      className={cx("do-offline", cfg.clase, className)}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <span className={cx("do-offline__icono", cfg.girar && "do-offline__icono--girar")} aria-hidden="true">
        <Icono size={16} />
      </span>
      {etiqueta}
    </span>
  );
}
