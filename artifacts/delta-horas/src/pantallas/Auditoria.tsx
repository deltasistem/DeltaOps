/**
 * AUDITORÍA. Historial completo: quién, cuándo, qué acción, sobre qué entidad
 * y con qué valores anterior y nuevo.
 */

import { Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import {
  ETIQUETA_ACCION,
  ETIQUETA_ENTIDAD,
  formatearEntero,
  normalizar,
  type AccionAuditoria,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { Encabezado } from '../navegacion/Encabezado';
import { Chip, EstadoVacio, Tarjeta } from '../ui/atomos';
import { MovimientoAuditoria } from './DetalleRegistro';

const ACCIONES: readonly AccionAuditoria[] = [
  'crear',
  'editar',
  'anular',
  'activar',
  'desactivar',
];

export function Auditoria() {
  const { base } = useDatos();
  const [, navegar] = useLocation();
  const [accion, setAccion] = useState<AccionAuditoria | ''>('');
  const [texto, setTexto] = useState('');

  const visibles = useMemo(() => {
    const termino = normalizar(texto);
    return base.auditoria.filter((entrada) => {
      if (accion !== '' && entrada.accion !== accion) return false;
      if (termino === '') return true;
      return (
        normalizar(entrada.referencia).includes(termino) ||
        normalizar(entrada.usuarioNombre).includes(termino) ||
        normalizar(ETIQUETA_ENTIDAD[entrada.entidad]).includes(termino)
      );
    });
  }, [accion, base.auditoria, texto]);

  return (
    <>
      <Encabezado
        titulo="Auditoría"
        detalle={`${formatearEntero(base.auditoria.length)} movimiento(s) registrados`}
        volver={() => navegar('/mas')}
        bajoTitulo={
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex h-11 items-center gap-2 rounded-control bg-relleno px-3">
              <Search size={16} className="shrink-0 text-texto-3" />
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Buscar por referencia, usuario o entidad…"
                className="w-full bg-transparent text-[16px] outline-none placeholder:text-texto-3"
              />
            </div>
            <div className="dh-sin-barra -mx-4 flex gap-2 overflow-x-auto px-4">
              <Chip activo={accion === ''} onClick={() => setAccion('')}>
                Todas
              </Chip>
              {ACCIONES.map((clave) => (
                <Chip
                  key={clave}
                  activo={accion === clave}
                  onClick={() => setAccion(accion === clave ? '' : clave)}
                >
                  {ETIQUETA_ACCION[clave]}
                </Chip>
              ))}
            </div>
          </div>
        }
      />

      <div className="px-4 pb-8">
        {visibles.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              icono={<ShieldCheck size={22} />}
              titulo="Sin movimientos registrados"
              descripcion="Las creaciones, ediciones y anulaciones aparecerán aquí."
            />
          </Tarjeta>
        ) : (
          <ol className="flex flex-col gap-3">
            {visibles.map((entrada) => (
              <div key={entrada.id} className="flex flex-col gap-1">
                <p className="px-1 text-[12px] tracking-wide text-texto-3 uppercase">
                  {ETIQUETA_ENTIDAD[entrada.entidad]} · {entrada.referencia}
                </p>
                <MovimientoAuditoria entrada={entrada} />
              </div>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
