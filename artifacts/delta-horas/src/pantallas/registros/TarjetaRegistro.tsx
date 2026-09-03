/**
 * Tarjeta de registro para celular. Muestra en un bloque legible lo que en
 * escritorio ocupa dieciocho columnas.
 */

import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';

import {
  formatearFecha,
  formatearHoras,
  formatearHorometro,
  type MachineRecord,
} from '@workspace/horas-maquina';

import { ETIQUETA_PROPIEDAD } from '../../datos/opciones';
import { Badge } from '../../ui/atomos';

export function TarjetaRegistro({ registro }: { readonly registro: MachineRecord }) {
  const anulado = registro.estado === 'anulado';

  return (
    <Link
      href={`/registros/${registro.id}`}
      className="dh-tarjeta dh-pulsable block p-4 hover:bg-relleno-2"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-titulo text-[19px] leading-none font-bold">
          {registro.maquinaCodigo}
        </span>
        <span
          className={`dh-numero font-titulo text-[19px] leading-none font-bold ${
            anulado ? 'text-texto-3 line-through' : 'text-marca'
          }`}
        >
          {formatearHoras(registro.hours)}
        </span>
      </div>

      <p className="mt-2 text-[15px] font-semibold">{registro.clienteNombre}</p>
      <p className="text-[14px] text-texto-2">
        {registro.operacionNombre} · {registro.materialNombre}
      </p>
      <p className="mt-1 text-[13px] text-texto-3">Recibo {registro.recibo}</p>
      <p className="dh-numero text-[13px] text-texto-3">
        {formatearHorometro(registro.horometroInicial, false)}{' '}
        <ArrowRight size={11} className="inline align-middle" />{' '}
        {formatearHorometro(registro.horometroFinal, false)}
      </p>
      <p className="mt-1 text-[14px]">{registro.operadorNombre}</p>
      <p className="text-[13px] text-texto-3">
        {formatearFecha(registro.fecha)} · {registro.turnoNombre}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Badge tono={registro.propiedad === 'propio' ? 'exito' : 'info'}>
          {ETIQUETA_PROPIEDAD[registro.propiedad].toUpperCase()}
        </Badge>
        {registro.propiedad === 'tercerizado' && registro.proveedorNombre && (
          <Badge tono="neutro">{registro.proveedorNombre}</Badge>
        )}
        {anulado && <Badge tono="error">Anulado</Badge>}
        {registro.advertencias.length > 0 && !anulado && (
          <Badge tono="aviso">{registro.advertencias.length} advertencia(s)</Badge>
        )}
      </div>
    </Link>
  );
}
