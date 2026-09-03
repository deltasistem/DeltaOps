/**
 * Confirmaciones. Ninguna acción que cambie datos —guardar, editar, anular,
 * desactivar— ocurre sin pasar por aquí.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState, type ReactNode } from 'react';

import { Boton } from './atomos';
import { cn } from './cn';

export interface PeticionConfirmacion {
  readonly titulo: string;
  readonly mensaje?: ReactNode;
  readonly textoConfirmar?: string;
  readonly textoCancelar?: string;
  readonly destructivo?: boolean;
}

export function Dialogo({
  peticion,
  onConfirmar,
  onCancelar,
}: {
  readonly peticion: PeticionConfirmacion | null;
  readonly onConfirmar: () => void;
  readonly onCancelar: () => void;
}) {
  return (
    <AnimatePresence>
      {peticion && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-6">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancelar}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={peticion.titulo}
            className="relative w-full max-w-[320px] overflow-hidden rounded-[20px] bg-superficie shadow-hoja"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 380 }}
          >
            <div className="px-5 pt-5 pb-4 text-center">
              <h2 className="font-titulo text-[17px] font-bold">{peticion.titulo}</h2>
              {peticion.mensaje && (
                <div className="mt-1.5 text-[14px] text-texto-2">{peticion.mensaje}</div>
              )}
            </div>
            <div className="flex gap-2 border-t border-borde p-3">
              <Boton ancho onClick={onCancelar}>
                {peticion.textoCancelar ?? 'Cancelar'}
              </Boton>
              <Boton
                ancho
                variante={peticion.destructivo ? 'peligro' : 'principal'}
                onClick={onConfirmar}
                className={cn(peticion.destructivo && 'font-bold')}
              >
                {peticion.textoConfirmar ?? 'Confirmar'}
              </Boton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * Confirmación imperativa: `confirmar(peticion)` devuelve una promesa que se
 * resuelve con la decisión del usuario.
 */
export function useConfirmacion() {
  const [estado, setEstado] = useState<{
    peticion: PeticionConfirmacion;
    resolver: (valor: boolean) => void;
  } | null>(null);

  const confirmar = useCallback(
    (peticion: PeticionConfirmacion) =>
      new Promise<boolean>((resolver) => setEstado({ peticion, resolver })),
    [],
  );

  const responder = useCallback(
    (valor: boolean) => {
      estado?.resolver(valor);
      setEstado(null);
    },
    [estado],
  );

  const elemento = (
    <Dialogo
      peticion={estado?.peticion ?? null}
      onConfirmar={() => responder(true)}
      onCancelar={() => responder(false)}
    />
  );

  return { confirmar, elemento };
}
