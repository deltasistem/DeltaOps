/**
 * MÁS: administración y ajustes. Solo aparecen las secciones que el rol del
 * usuario en sesión tiene permitidas.
 */

import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';

import {
  contarAtencion,
  derivarAlertas,
  DESCRIPCION_ROL,
  puede,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { Encabezado } from '../navegacion/Encabezado';
import { GRUPOS_MAS, SECCIONES_MAS } from '../navegacion/rutas';
import { Badge, EstadoVacio, Seccion, Tarjeta } from '../ui/atomos';

export function Mas() {
  const { base, usuario } = useDatos();
  const secciones = SECCIONES_MAS.filter((s) => puede(usuario, s.permiso));
  const pendientes = contarAtencion(derivarAlertas(base.registros));

  return (
    <>
      <Encabezado titulo="Más" detalle="Administración de la operación" />

      <div className="flex flex-col gap-5 px-4 pb-8">
        <Tarjeta className="flex items-center gap-3 p-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--dh-rojo)] text-[16px] font-bold text-white">
            {usuario.nombre
              .split(' ')
              .slice(0, 2)
              .map((parte) => parte[0])
              .join('')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold">{usuario.nombre}</p>
            <p className="truncate text-[13px] text-texto-3">{usuario.correo}</p>
          </div>
          <Badge tono="marca">{usuario.rol}</Badge>
        </Tarjeta>
        <p className="-mt-3 px-1 text-[13px] text-texto-3">
          {DESCRIPCION_ROL[usuario.rol]}
        </p>

        {secciones.length === 0 && (
          <Tarjeta>
            <EstadoVacio
              titulo="Sin secciones disponibles"
              descripcion={`El rol ${usuario.rol} no administra maestros ni configuración.`}
            />
          </Tarjeta>
        )}

        {GRUPOS_MAS.map((grupo) => {
          const delGrupo = secciones.filter((s) => s.grupo === grupo);
          if (delGrupo.length === 0) return null;
          return (
            <Seccion key={grupo} titulo={grupo}>
              <Tarjeta className="overflow-hidden">
                {delGrupo.map((seccion) => (
                  <Link
                    key={seccion.clave}
                    href={seccion.ruta}
                    className="dh-pulsable flex items-center gap-3 border-b border-borde px-4 py-3.5 last:border-0 hover:bg-relleno-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium">
                        {seccion.etiqueta}
                      </span>
                      <span className="block truncate text-[13px] text-texto-3">
                        {seccion.descripcion}
                      </span>
                    </span>
                    {seccion.clave === 'alertas' && pendientes > 0 && (
                      <Badge tono="aviso">{pendientes}</Badge>
                    )}
                    {seccion.clave !== 'alertas' && (
                      <span className="dh-numero shrink-0 text-[13px] text-texto-3">
                        {conteoDe(base, seccion.clave)}
                      </span>
                    )}
                    <ChevronRight size={18} className="shrink-0 text-texto-3" />
                  </Link>
                ))}
              </Tarjeta>
            </Seccion>
          );
        })}
      </div>
    </>
  );
}

/** Número de elementos activos, para que la lista informe sin abrirla. */
function conteoDe(
  base: ReturnType<typeof useDatos>['base'],
  clave: string,
): string {
  const coleccion = (base as unknown as Record<string, unknown>)[clave];
  if (!Array.isArray(coleccion)) return '';
  const activos = coleccion.filter(
    (e) => (e as { estado?: string }).estado === 'activo',
  ).length;
  return `${activos}`;
}
