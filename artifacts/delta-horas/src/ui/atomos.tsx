/**
 * Piezas visuales básicas: botones grandes, tarjetas, chips, badges,
 * interruptores y estados vacíos. Todas consumen los tokens `--dh-*`.
 */

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react';

import { cn } from './cn';

type Variante = 'principal' | 'secundario' | 'plano' | 'peligro';
type Tamano = 'md' | 'lg';

const VARIANTES: Record<Variante, string> = {
  principal:
    'bg-[var(--dh-rojo)] text-white shadow-[0_6px_20px_rgba(210,0,43,0.24)] hover:bg-[var(--dh-rojo-fuerte)]',
  secundario:
    'bg-relleno text-texto hover:bg-[var(--dh-borde-fuerte)] dark:hover:bg-[var(--dh-relleno)]',
  plano: 'bg-transparent text-marca hover:bg-relleno-2',
  peligro: 'bg-error-suave text-error hover:bg-[var(--dh-error)] hover:text-white',
};

const TAMANOS: Record<Tamano, string> = {
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-13 px-5 text-[17px]',
};

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variante?: Variante;
  readonly tamano?: Tamano;
  readonly ancho?: boolean;
  readonly icono?: ReactNode;
}

export function Boton({
  variante = 'secundario',
  tamano = 'md',
  ancho = false,
  icono,
  className,
  children,
  ...props
}: BotonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'dh-pulsable inline-flex items-center justify-center gap-2 rounded-control font-semibold',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTES[variante],
        TAMANOS[tamano],
        ancho && 'w-full',
        className,
      )}
    >
      {icono}
      {children}
    </button>
  );
}

/** Botón circular de icono, para barras y encabezados. */
export function BotonIcono({
  etiqueta,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly etiqueta: string }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      {...props}
      className={cn(
        'dh-pulsable inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        'bg-relleno text-texto hover:bg-relleno-2 disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Tarjeta({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...props} className={cn('dh-tarjeta', className)}>
      {children}
    </div>
  );
}

/** Bloque de la pantalla con su título en mayúsculas, como en Ajustes de iOS. */
export function Seccion({
  titulo,
  accion,
  className,
  children,
}: {
  readonly titulo?: string;
  readonly accion?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      {(titulo || accion) && (
        <div className="flex items-end justify-between gap-3 px-1">
          {titulo ? <h2 className="dh-seccion-titulo">{titulo}</h2> : <span />}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

export type TonoBadge = 'neutro' | 'exito' | 'aviso' | 'error' | 'info' | 'marca';

const TONOS: Record<TonoBadge, string> = {
  neutro: 'bg-relleno text-texto-2',
  exito: 'bg-exito-suave text-exito',
  aviso: 'bg-aviso-suave text-aviso',
  error: 'bg-error-suave text-error',
  info: 'bg-info-suave text-info',
  marca: 'bg-[var(--dh-rojo)] text-white',
};

export function Badge({
  tono = 'neutro',
  className,
  children,
}: {
  readonly tono?: TonoBadge;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Chip seleccionable para filtros rápidos. */
export function Chip({
  activo = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { readonly activo?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      {...props}
      className={cn(
        'dh-pulsable shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-semibold whitespace-nowrap',
        activo
          ? 'bg-[var(--dh-rojo)] text-white'
          : 'bg-superficie text-texto-2 shadow-suave hover:text-texto',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Interruptor({
  activo,
  onCambiar,
  etiqueta,
  disabled = false,
}: {
  readonly activo: boolean;
  readonly onCambiar: (valor: boolean) => void;
  readonly etiqueta: string;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambiar(!activo)}
      className={cn(
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200',
        'disabled:opacity-40',
        activo ? 'bg-exito' : 'bg-relleno',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-md transition-all duration-200',
          activo ? 'left-[22px]' : 'left-[2px]',
        )}
      />
    </button>
  );
}

/** Fila de lista agrupada: etiqueta a la izquierda, valor o control a la derecha. */
export function Fila({
  etiqueta,
  valor,
  detalle,
  icono,
  alFinal,
  onClick,
  className,
}: {
  readonly etiqueta: ReactNode;
  readonly valor?: ReactNode;
  readonly detalle?: ReactNode;
  readonly icono?: ReactNode;
  readonly alFinal?: ReactNode;
  readonly onClick?: () => void;
  readonly className?: string;
}) {
  const contenido = (
    <>
      {icono && <span className="shrink-0 text-texto-3">{icono}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{etiqueta}</span>
        {detalle && (
          <span className="block truncate text-[13px] text-texto-3">{detalle}</span>
        )}
      </span>
      {valor !== undefined && (
        <span className="dh-numero shrink-0 text-[15px] text-texto-2">{valor}</span>
      )}
      {alFinal}
    </>
  );

  if (!onClick) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 border-b border-borde px-4 py-3 last:border-0',
          className,
        )}
      >
        {contenido}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'dh-pulsable flex w-full items-center gap-3 border-b border-borde px-4 py-3 text-left last:border-0',
        'hover:bg-relleno-2',
        className,
      )}
    >
      {contenido}
    </button>
  );
}

export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  readonly icono?: ReactNode;
  readonly titulo: string;
  readonly descripcion?: string;
  readonly accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icono && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-relleno text-texto-3">
          {icono}
        </div>
      )}
      <p className="text-[17px] font-semibold">{titulo}</p>
      {descripcion && (
        <p className="max-w-xs text-[14px] text-texto-3">{descripcion}</p>
      )}
      {accion && <div className="pt-1">{accion}</div>}
    </div>
  );
}

/** Dato numérico destacado. */
export function Kpi({
  titulo,
  valor,
  detalle,
  tono = 'neutro',
}: {
  readonly titulo: string;
  readonly valor: string;
  readonly detalle?: string;
  readonly tono?: 'neutro' | 'marca';
}) {
  return (
    <Tarjeta className="flex flex-col gap-1 p-4">
      <span className="dh-seccion-titulo text-[11px]">{titulo}</span>
      <span
        className={cn(
          'dh-numero font-titulo text-[26px] leading-tight font-bold',
          tono === 'marca' && 'text-marca',
        )}
      >
        {valor}
      </span>
      {detalle && <span className="text-[13px] text-texto-3">{detalle}</span>}
    </Tarjeta>
  );
}
