/**
 * Encabezado de pantalla al estilo iOS: barra translúcida con título compacto
 * al desplazar y título grande en reposo.
 */

import { ChevronLeft } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '../ui/cn';

export function Encabezado({
  titulo,
  detalle,
  volver,
  acciones,
  bajoTitulo,
}: {
  readonly titulo: string;
  readonly detalle?: ReactNode;
  readonly volver?: () => void;
  readonly acciones?: ReactNode;
  readonly bajoTitulo?: ReactNode;
}) {
  const [desplazado, setDesplazado] = useState(false);

  useEffect(() => {
    const alDesplazar = () => setDesplazado(window.scrollY > 24);
    alDesplazar();
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => window.removeEventListener('scroll', alDesplazar);
  }, []);

  return (
    <>
      <div
        className={cn(
          'dh-seguro-arriba sticky top-0 z-30 transition-shadow duration-200',
          desplazado ? 'dh-translucido shadow-suave' : 'bg-fondo',
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          {volver && (
            <button
              type="button"
              onClick={volver}
              aria-label="Volver"
              className="dh-pulsable -ml-2 flex items-center gap-0.5 pr-1 text-marca"
            >
              <ChevronLeft size={24} />
              <span className="text-[16px] font-medium">Atrás</span>
            </button>
          )}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-center font-titulo text-[16px] font-bold transition-opacity duration-200',
              desplazado ? 'opacity-100' : 'opacity-0',
            )}
          >
            {titulo}
          </span>
          <div className="flex shrink-0 items-center gap-2">{acciones}</div>
        </div>
      </div>

      <div className="px-4 pt-1 pb-3">
        <h1 className="font-titulo text-[30px] leading-tight font-bold tracking-tight">
          {titulo}
        </h1>
        {detalle && <p className="mt-0.5 text-[14px] text-texto-3">{detalle}</p>}
        {bajoTitulo}
      </div>
    </>
  );
}
