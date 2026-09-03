/**
 * Hoja inferior (bottom sheet). En celular entra desde abajo y se cierra
 * arrastrándola; en pantallas grandes se comporta como una tarjeta centrada.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { cn } from './cn';

export function Hoja({
  abierta,
  onCerrar,
  titulo,
  descripcion,
  pie,
  className,
  children,
}: {
  readonly abierta: boolean;
  readonly onCerrar: () => void;
  readonly titulo: string;
  readonly descripcion?: string;
  readonly pie?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  useEffect(() => {
    if (!abierta) return undefined;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar();
    };
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', alPulsar);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener('keydown', alPulsar);
    };
  }, [abierta, onCerrar]);

  return (
    <AnimatePresence>
      {abierta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCerrar}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className={cn(
              'relative flex max-h-[90vh] w-full flex-col overflow-hidden bg-superficie',
              'rounded-t-[22px] sm:max-w-lg sm:rounded-[22px]',
              'shadow-hoja',
              className,
            )}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 620) onCerrar();
            }}
          >
            <div className="flex shrink-0 items-start gap-3 px-5 pt-3 pb-3">
              <div className="flex-1">
                <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-borde-fuerte sm:hidden" />
                <h2 className="font-titulo text-[19px] font-bold">{titulo}</h2>
                {descripcion && (
                  <p className="mt-0.5 text-[13px] text-texto-3">{descripcion}</p>
                )}
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={onCerrar}
                className="dh-pulsable mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-relleno text-texto-2"
              >
                <X size={17} />
              </button>
            </div>

            <div className="dh-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-2">
              {children}
            </div>

            {pie && (
              <div className="dh-seguro-abajo shrink-0 border-t border-borde bg-superficie px-5 py-3">
                {pie}
              </div>
            )}
            {!pie && <div className="dh-seguro-abajo shrink-0 pb-2" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
