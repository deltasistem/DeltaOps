/**
 * Avisos breves. Aparecen arriba en celular y abajo a la derecha en escritorio,
 * y desaparecen solos: confirman que la acción ocurrió sin interrumpir.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { cn } from './cn';

type TipoAviso = 'exito' | 'aviso' | 'info';

interface Aviso {
  readonly id: number;
  readonly tipo: TipoAviso;
  readonly texto: string;
}

const Contexto = createContext<(tipo: TipoAviso, texto: string) => void>(() => {});

export function useAvisos() {
  return useContext(Contexto);
}

const ICONOS: Record<TipoAviso, ReactNode> = {
  exito: <CheckCircle2 size={18} />,
  aviso: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const TONOS: Record<TipoAviso, string> = {
  exito: 'text-exito',
  aviso: 'text-aviso',
  info: 'text-info',
};

export function ProveedorAvisos({ children }: { readonly children: ReactNode }) {
  const [avisos, setAvisos] = useState<readonly Aviso[]>([]);

  const mostrar = useCallback((tipo: TipoAviso, texto: string) => {
    const id = Date.now() + Math.random();
    setAvisos((previos) => [...previos, { id, tipo, texto }]);
    window.setTimeout(
      () => setAvisos((previos) => previos.filter((a) => a.id !== id)),
      3600,
    );
  }, []);

  const valor = useMemo(() => mostrar, [mostrar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed z-70 flex flex-col gap-2 px-4',
          'top-[max(env(safe-area-inset-top),12px)] right-0 left-0 items-center',
          'sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:items-end',
        )}
      >
        <AnimatePresence>
          {avisos.map((aviso) => (
            <motion.div
              key={aviso.id}
              layout
              initial={{ opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="dh-translucido flex max-w-sm items-center gap-2.5 rounded-full py-2.5 pr-4 pl-3 shadow-media"
            >
              <span className={TONOS[aviso.tipo]}>{ICONOS[aviso.tipo]}</span>
              <span className="text-[14px] font-medium">{aviso.texto}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Contexto.Provider>
  );
}
