/**
 * Selector de maestros. Nunca acepta texto libre: al pulsarlo abre una hoja
 * inferior con la lista y, cuando hay muchas opciones, un buscador.
 */

import { Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { normalizar } from '@workspace/horas-maquina';

import { Badge } from './atomos';
import { cn } from './cn';
import { Hoja } from './hoja';

export interface Opcion {
  readonly id: string;
  readonly etiqueta: string;
  readonly detalle?: string;
  readonly badge?: string;
  readonly inactiva?: boolean;
}

/** A partir de este número de opciones la hoja muestra buscador. */
const MINIMO_PARA_BUSCAR = 7;

export function Selector({
  titulo,
  placeholder = 'Seleccionar',
  opciones,
  valor,
  onCambiar,
  invalido = false,
  deshabilitado = false,
  permitirVacio = false,
  textoVacio = 'Todas',
}: {
  readonly titulo: string;
  readonly placeholder?: string;
  readonly opciones: readonly Opcion[];
  readonly valor: string;
  readonly onCambiar: (id: string) => void;
  readonly invalido?: boolean;
  readonly deshabilitado?: boolean;
  readonly permitirVacio?: boolean;
  readonly textoVacio?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const seleccionada = opciones.find((o) => o.id === valor);
  const conBuscador = opciones.length >= MINIMO_PARA_BUSCAR;

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda);
    if (termino === '') return opciones;
    return opciones.filter(
      (o) =>
        normalizar(o.etiqueta).includes(termino) ||
        normalizar(o.detalle ?? '').includes(termino),
    );
  }, [busqueda, opciones]);

  const elegir = (id: string) => {
    onCambiar(id);
    setAbierta(false);
    setBusqueda('');
  };

  return (
    <>
      <button
        type="button"
        aria-label={titulo}
        aria-haspopup="listbox"
        aria-expanded={abierta}
        disabled={deshabilitado}
        onClick={() => setAbierta(true)}
        className={cn(
          'dh-pulsable flex h-12 w-full items-center justify-between gap-2 rounded-control',
          'border border-borde bg-superficie-2 px-3.5 text-left transition-colors',
          'disabled:opacity-50',
          invalido && 'border-error',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-[16px]">
          {seleccionada ? (
            <span className="flex items-center gap-2">
              <span className="truncate font-medium">{seleccionada.etiqueta}</span>
              {seleccionada.inactiva && <Badge tono="aviso">Inactivo</Badge>}
            </span>
          ) : (
            <span className="text-texto-3">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={18} className="shrink-0 text-texto-3" />
      </button>

      <Hoja
        abierta={abierta}
        onCerrar={() => {
          setAbierta(false);
          setBusqueda('');
        }}
        titulo={titulo}
        descripcion={
          opciones.length === 0 ? 'No hay opciones disponibles.' : undefined
        }
      >
        {conBuscador && (
          <div className="sticky top-0 z-1 -mx-1 bg-superficie pt-1 pb-3">
            <div className="flex h-11 items-center gap-2 rounded-control bg-relleno px-3">
              <Search size={16} className="shrink-0 text-texto-3" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar ${titulo.toLowerCase()}...`}
                className="w-full bg-transparent text-[16px] outline-none placeholder:text-texto-3"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col pb-2">
          {permitirVacio && (
            <FilaOpcion
              etiqueta={textoVacio}
              seleccionada={valor === ''}
              onClick={() => elegir('')}
            />
          )}
          {visibles.map((opcion) => (
            <FilaOpcion
              key={opcion.id}
              etiqueta={opcion.etiqueta}
              detalle={opcion.detalle}
              badge={opcion.badge}
              inactiva={opcion.inactiva}
              seleccionada={opcion.id === valor}
              onClick={() => elegir(opcion.id)}
            />
          ))}
          {visibles.length === 0 && (
            <p className="py-8 text-center text-[14px] text-texto-3">
              Sin resultados para «{busqueda}».
            </p>
          )}
        </div>
      </Hoja>
    </>
  );
}

function FilaOpcion({
  etiqueta,
  detalle,
  badge,
  inactiva = false,
  seleccionada,
  onClick,
}: {
  readonly etiqueta: string;
  readonly detalle?: string;
  readonly badge?: string;
  readonly inactiva?: boolean;
  readonly seleccionada: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dh-pulsable flex items-center gap-3 border-b border-borde py-3 text-left last:border-0"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[16px] font-medium">{etiqueta}</span>
          {inactiva && <Badge tono="aviso">Inactivo</Badge>}
          {badge && <Badge tono="neutro">{badge}</Badge>}
        </span>
        {detalle && (
          <span className="mt-0.5 block truncate text-[13px] text-texto-3">
            {detalle}
          </span>
        )}
      </span>
      {seleccionada && <Check size={19} className="shrink-0 text-marca" />}
    </button>
  );
}
