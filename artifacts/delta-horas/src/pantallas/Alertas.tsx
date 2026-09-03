/**
 * ALERTAS. No es un módulo de gestión: son los avisos que conviene revisar
 * antes de cerrar el período —saltos de horómetro, recibos repetidos,
 * registros de cero horas, máquinas inactivas y anulaciones—.
 */

import { AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';

import {
  derivarAlertas,
  ETIQUETA_ALERTA,
  formatearEntero,
  registrosVisibles,
  type ClaveAlerta,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { Encabezado } from '../navegacion/Encabezado';
import { Badge, Chip, EstadoVacio, Tarjeta } from '../ui/atomos';

const CLAVES: readonly ClaveAlerta[] = [
  'horometro-diferencia',
  'recibo-duplicado',
  'cero-horas',
  'horometro-invertido',
  'maquina-inactiva',
  'anulado',
];

export function Alertas() {
  const { base, usuario } = useDatos();
  const [, navegar] = useLocation();
  const [seleccion, setSeleccion] = useState<ClaveAlerta | ''>('');

  const alertas = useMemo(
    () => derivarAlertas(registrosVisibles(base.registros, usuario.rol, usuario.id)),
    [base.registros, usuario.id, usuario.rol],
  );

  const visibles = seleccion === '' ? alertas : alertas.filter((a) => a.clave === seleccion);
  const conteo = (clave: ClaveAlerta) => alertas.filter((a) => a.clave === clave).length;

  return (
    <>
      <Encabezado
        titulo="Alertas"
        detalle={`${formatearEntero(alertas.length)} aviso(s) sobre los registros`}
        volver={() => navegar('/mas')}
        bajoTitulo={
          <div className="dh-sin-barra -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            <Chip activo={seleccion === ''} onClick={() => setSeleccion('')}>
              Todas ({alertas.length})
            </Chip>
            {CLAVES.filter((clave) => conteo(clave) > 0).map((clave) => (
              <Chip
                key={clave}
                activo={seleccion === clave}
                onClick={() => setSeleccion(seleccion === clave ? '' : clave)}
              >
                {ETIQUETA_ALERTA[clave]} ({conteo(clave)})
              </Chip>
            ))}
          </div>
        }
      />

      <div className="flex flex-col gap-3 px-4 pb-8">
        {visibles.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono={<ShieldCheck size={22} />}
              titulo="Sin alertas pendientes"
              descripcion="Los horómetros y los recibos de este período son consistentes."
            />
          </Tarjeta>
        ) : (
          visibles.map((alerta) => (
            <Link
              key={alerta.id}
              href={`/registros/${alerta.registro.id}`}
              className="dh-tarjeta dh-pulsable flex items-start gap-3 p-4 hover:bg-relleno-2"
            >
              <span
                className={
                  alerta.severidad === 'atencion' ? 'mt-0.5 text-aviso' : 'mt-0.5 text-info'
                }
              >
                {alerta.severidad === 'atencion' ? (
                  <AlertTriangle size={18} />
                ) : (
                  <Info size={18} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold">{alerta.titulo}</span>
                  <Badge tono={alerta.severidad === 'atencion' ? 'aviso' : 'info'}>
                    {alerta.severidad === 'atencion' ? 'Revisar' : 'Informativa'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[13px] text-texto-2">{alerta.detalle}</p>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
