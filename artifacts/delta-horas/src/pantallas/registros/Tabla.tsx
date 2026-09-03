/**
 * Vista tipo hoja de cálculo: una fila por registro, una columna por campo,
 * encabezado fijo, orden por columna y desplazamiento en ambos ejes.
 *
 * Es la vista que reemplaza el Excel al que hoy termina llegando el Forms.
 */

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useLocation } from 'wouter';

import {
  formatearFecha,
  formatearFechaHora,
  formatearHoras,
  formatearHorometro,
  type ColumnaOrden,
  type MachineRecord,
} from '@workspace/horas-maquina';

import { ETIQUETA_PROPIEDAD } from '../../datos/opciones';
import { Badge } from '../../ui/atomos';
import { cn } from '../../ui/cn';

interface Columna {
  readonly clave: ColumnaOrden;
  readonly titulo: string;
  readonly numerica?: boolean;
  readonly render: (registro: MachineRecord) => React.ReactNode;
}

const COLUMNAS: readonly Columna[] = [
  { clave: 'fecha', titulo: 'Fecha', render: (r) => formatearFecha(r.fecha) },
  { clave: 'clienteNombre', titulo: 'Cliente', render: (r) => r.clienteNombre },
  { clave: 'operacionNombre', titulo: 'Operación', render: (r) => r.operacionNombre },
  { clave: 'materialNombre', titulo: 'Material', render: (r) => r.materialNombre },
  {
    clave: 'maquinaCodigo',
    titulo: 'Cargador',
    render: (r) => <span className="font-semibold">{r.maquinaCodigo}</span>,
  },
  {
    clave: 'propiedad',
    titulo: 'Propiedad',
    render: (r) => (
      <Badge tono={r.propiedad === 'propio' ? 'exito' : 'info'}>
        {ETIQUETA_PROPIEDAD[r.propiedad]}
      </Badge>
    ),
  },
  {
    clave: 'proveedorNombre',
    titulo: 'Proveedor',
    render: (r) => r.proveedorNombre || '—',
  },
  { clave: 'recibo', titulo: 'Recibo', numerica: true, render: (r) => r.recibo },
  {
    clave: 'horometroInicial',
    titulo: 'Horóm. inicial',
    numerica: true,
    render: (r) => formatearHorometro(r.horometroInicial, false),
  },
  {
    clave: 'horometroFinal',
    titulo: 'Horóm. final',
    numerica: true,
    render: (r) => formatearHorometro(r.horometroFinal, false),
  },
  {
    clave: 'hours',
    titulo: 'Horas',
    numerica: true,
    render: (r) => (
      <span
        className={cn(
          'font-semibold',
          r.estado === 'anulado' ? 'text-texto-3 line-through' : 'text-marca',
        )}
      >
        {formatearHoras(r.hours)}
      </span>
    ),
  },
  { clave: 'turnoNombre', titulo: 'Turno', render: (r) => r.turnoNombre },
  { clave: 'supervisorNombre', titulo: 'Supervisor', render: (r) => r.supervisorNombre },
  {
    clave: 'operadorNombre',
    titulo: 'Operador de máquina',
    render: (r) => r.operadorNombre,
  },
  {
    clave: 'estado',
    titulo: 'Estado',
    render: (r) =>
      r.estado === 'anulado' ? (
        <Badge tono="error">Anulado</Badge>
      ) : (
        <Badge tono="exito">Activo</Badge>
      ),
  },
  {
    clave: 'creadoEn',
    titulo: 'Fecha de creación',
    render: (r) => formatearFechaHora(r.creadoEn),
  },
  {
    clave: 'creadoPorNombre',
    titulo: 'Usuario que creó',
    render: (r) => r.creadoPorNombre,
  },
];

export function TablaRegistros({
  registros,
  orden,
  descendente,
  onOrdenar,
}: {
  readonly registros: readonly MachineRecord[];
  readonly orden: ColumnaOrden;
  readonly descendente: boolean;
  readonly onOrdenar: (columna: ColumnaOrden) => void;
}) {
  const [, navegar] = useLocation();

  return (
    <div className="dh-tarjeta overflow-hidden">
      <div className="dh-scroll max-h-[72vh] overflow-auto">
        <table className="dh-hoja w-full text-[13px]">
          <thead>
            <tr>
              {COLUMNAS.map((columna) => (
                <th key={columna.clave} scope="col">
                  <button
                    type="button"
                    onClick={() => onOrdenar(columna.clave)}
                    className="flex items-center gap-1 uppercase hover:text-texto"
                  >
                    {columna.titulo}
                    {orden === columna.clave &&
                      (descendente ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </button>
                </th>
              ))}
              <th scope="col">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((registro) => (
              <tr
                key={registro.id}
                onClick={() => navegar(`/registros/${registro.id}`)}
                className="cursor-pointer"
              >
                {COLUMNAS.map((columna) => (
                  <td
                    key={columna.clave}
                    className={cn(columna.numerica && 'dh-numero text-right')}
                  >
                    {columna.render(registro)}
                  </td>
                ))}
                <td className="max-w-[260px] truncate text-texto-3">
                  {registro.observaciones || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
