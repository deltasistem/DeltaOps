/**
 * Campos del formulario. Se agrupan en tarjetas y se apoyan en el teclado
 * adecuado de cada tipo de dato, para que registrar sea cuestión de segundos.
 */

import { AlertCircle } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

import { cn } from './cn';

export function Campo({
  etiqueta,
  requerido = false,
  error,
  ayuda,
  className,
  children,
}: {
  readonly etiqueta: string;
  readonly requerido?: boolean;
  readonly error?: string;
  readonly ayuda?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="flex items-center gap-1 text-[13px] font-semibold text-texto-2">
        {etiqueta}
        {requerido && <span className="text-marca">*</span>}
      </span>
      {children}
      {error ? (
        <span className="flex items-start gap-1.5 text-[13px] font-medium text-error">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </span>
      ) : (
        ayuda && <span className="text-[12px] text-texto-3">{ayuda}</span>
      )}
    </label>
  );
}

const CONTROL =
  'h-12 w-full rounded-control border border-borde bg-superficie-2 px-3.5 text-[16px] ' +
  'placeholder:text-texto-3 focus:border-[var(--dh-rojo)] focus:bg-superficie ' +
  'transition-colors outline-none';

export function Entrada({
  invalido = false,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { readonly invalido?: boolean }) {
  return (
    <input
      {...props}
      className={cn(CONTROL, invalido && 'border-error', className)}
    />
  );
}

/**
 * Entrada de horómetro: teclado numérico decimal en celular y valores
 * alineados a la derecha para comparar de un vistazo.
 */
export function EntradaDecimal({
  invalido = false,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { readonly invalido?: boolean }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...props}
      className={cn(
        CONTROL,
        'dh-numero text-right text-[17px] font-semibold',
        invalido && 'border-error',
        className,
      )}
    />
  );
}

export function AreaTexto({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className={cn(
        'w-full resize-none rounded-control border border-borde bg-superficie-2 px-3.5 py-3',
        'text-[16px] placeholder:text-texto-3 focus:border-[var(--dh-rojo)] focus:bg-superficie',
        'transition-colors outline-none',
        className,
      )}
    />
  );
}

/** Valor derivado por el sistema: se muestra, no se escribe. */
export function ValorCalculado({
  etiqueta,
  valor,
  detalle,
  tono = 'neutro',
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly detalle?: ReactNode;
  readonly tono?: 'neutro' | 'marca' | 'aviso';
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-control px-3.5 py-3',
        tono === 'marca' && 'bg-[var(--dh-rojo)] text-white',
        tono === 'aviso' && 'bg-aviso-suave',
        tono === 'neutro' && 'bg-relleno-2',
      )}
    >
      <span className="flex flex-col">
        <span
          className={cn(
            'text-[12px] font-semibold tracking-wide uppercase',
            tono === 'marca' ? 'text-white/75' : 'text-texto-3',
          )}
        >
          {etiqueta}
        </span>
        {detalle && (
          <span
            className={cn(
              'text-[12px]',
              tono === 'marca' ? 'text-white/85' : 'text-texto-3',
            )}
          >
            {detalle}
          </span>
        )}
      </span>
      <span className="dh-numero font-titulo text-[22px] font-bold">{valor}</span>
    </div>
  );
}
