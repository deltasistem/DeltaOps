/**
 * REGISTROS. En celular es una lista de tarjetas; en escritorio, y bajo
 * petición en celular, la misma información como hoja de cálculo.
 *
 * Todo sale de `MachineRecord`: no hay una segunda fuente para consultar.
 */

import { LayoutGrid, ListFilter, Search, Table2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearch } from 'wouter';

import {
  compararRecientes,
  filtrarRegistros,
  formatearEntero,
  formatearHoras,
  ordenarRegistros,
  registrosVisibles,
  type ColumnaOrden,
  type FiltroRegistros,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { Encabezado } from '../navegacion/Encabezado';
import { Badge, Boton, Chip, EstadoVacio, Tarjeta } from '../ui/atomos';
import { cn } from '../ui/cn';
import { contarFiltros, FILTRO_VACIO, HojaFiltros } from './registros/Filtros';
import { TablaRegistros } from './registros/Tabla';
import { TarjetaRegistro } from './registros/TarjetaRegistro';

type Vista = 'tarjetas' | 'tabla';

export function Registros() {
  const { base, usuario } = useDatos();
  const consulta = useSearch();

  const [filtro, setFiltro] = useState<FiltroRegistros>(() => {
    const parametros = new URLSearchParams(consulta);
    return {
      ...FILTRO_VACIO,
      desde: parametros.get('desde') ?? '',
      hasta: parametros.get('hasta') ?? '',
      maquinaId: parametros.get('maquina') ?? '',
      estado: (parametros.get('estado') as FiltroRegistros['estado']) ?? '',
    };
  });
  const [vista, setVista] = useState<Vista>('tarjetas');
  const [filtrando, setFiltrando] = useState(false);
  const [orden, setOrden] = useState<ColumnaOrden>('fecha');
  const [descendente, setDescendente] = useState(true);

  const visibles = useMemo(
    () => registrosVisibles(base.registros, usuario.rol, usuario.id),
    [base.registros, usuario.id, usuario.rol],
  );

  const resultados = useMemo(() => {
    const filtrados = filtrarRegistros(visibles, filtro);
    return vista === 'tabla'
      ? ordenarRegistros(filtrados, orden, descendente)
      : [...filtrados].sort(compararRecientes);
  }, [descendente, filtro, orden, visibles, vista]);

  const totalHoras = resultados
    .filter((r) => r.estado === 'activo')
    .reduce((suma, r) => suma + r.hours, 0);

  const activos = contarFiltros(filtro);

  const ordenarPor = (columna: ColumnaOrden) => {
    if (columna === orden) {
      setDescendente((previo) => !previo);
      return;
    }
    setOrden(columna);
    setDescendente(true);
  };

  return (
    <>
      <Encabezado
        titulo="Registros"
        detalle={`${formatearEntero(resultados.length)} de ${formatearEntero(
          visibles.length,
        )} registros · ${formatearHoras(totalHoras)} vigentes`}
        acciones={
          <>
            <Boton
              onClick={() => setFiltrando(true)}
              icono={<ListFilter size={17} />}
              className="px-3"
            >
              Filtros
              {activos > 0 && <Badge tono="marca">{activos}</Badge>}
            </Boton>
            <Boton
              onClick={() => setVista(vista === 'tabla' ? 'tarjetas' : 'tabla')}
              icono={vista === 'tabla' ? <LayoutGrid size={17} /> : <Table2 size={17} />}
              className="px-3 lg:hidden"
            >
              {vista === 'tabla' ? 'Tarjetas' : 'Ver tabla'}
            </Boton>
          </>
        }
        bajoTitulo={
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex h-11 items-center gap-2 rounded-control bg-relleno px-3">
              <Search size={16} className="shrink-0 text-texto-3" />
              <input
                value={filtro.texto ?? ''}
                onChange={(e) => setFiltro({ ...filtro, texto: e.target.value })}
                placeholder="Buscar cargador, operador, recibo, cliente…"
                className="w-full bg-transparent text-[16px] outline-none placeholder:text-texto-3"
              />
              {(filtro.texto ?? '') !== '' && (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setFiltro({ ...filtro, texto: '' })}
                  className="shrink-0 text-texto-3"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="dh-sin-barra -mx-4 flex gap-2 overflow-x-auto px-4">
              <Chip
                activo={activos === 0 && (filtro.texto ?? '') === ''}
                onClick={() => setFiltro(FILTRO_VACIO)}
              >
                Todos
              </Chip>
              <Chip
                activo={filtro.estado === 'activo'}
                onClick={() =>
                  setFiltro({
                    ...filtro,
                    estado: filtro.estado === 'activo' ? '' : 'activo',
                  })
                }
              >
                Vigentes
              </Chip>
              <Chip
                activo={filtro.estado === 'anulado'}
                onClick={() =>
                  setFiltro({
                    ...filtro,
                    estado: filtro.estado === 'anulado' ? '' : 'anulado',
                  })
                }
              >
                Anulados
              </Chip>
              <Chip
                activo={filtro.propiedad === 'propio'}
                onClick={() =>
                  setFiltro({
                    ...filtro,
                    propiedad: filtro.propiedad === 'propio' ? '' : 'propio',
                  })
                }
              >
                Propios
              </Chip>
              <Chip
                activo={filtro.propiedad === 'tercerizado'}
                onClick={() =>
                  setFiltro({
                    ...filtro,
                    propiedad:
                      filtro.propiedad === 'tercerizado' ? '' : 'tercerizado',
                  })
                }
              >
                Tercerizados
              </Chip>
            </div>
          </div>
        }
      />

      <div className="px-4 pb-8">
        {resultados.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              titulo="No hay registros para este período."
              descripcion="Ajuste los filtros o la búsqueda para ver otros registros."
              accion={
                activos > 0 || (filtro.texto ?? '') !== '' ? (
                  <Boton onClick={() => setFiltro(FILTRO_VACIO)}>Limpiar filtros</Boton>
                ) : undefined
              }
            />
          </Tarjeta>
        ) : (
          <>
            {/* En escritorio la hoja de cálculo es la vista natural. */}
            <div className={vista === 'tabla' ? 'block' : 'hidden lg:block'}>
              <TablaRegistros
                registros={resultados}
                orden={orden}
                descendente={descendente}
                onOrdenar={ordenarPor}
              />
            </div>
            <div
              className={cn(
                vista === 'tabla'
                  ? 'hidden'
                  : 'flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:hidden',
              )}
            >
              {resultados.map((registro) => (
                <TarjetaRegistro key={registro.id} registro={registro} />
              ))}
            </div>
          </>
        )}
      </div>

      <HojaFiltros
        abierta={filtrando}
        onCerrar={() => setFiltrando(false)}
        base={base}
        filtro={filtro}
        onCambiar={setFiltro}
        resultados={resultados.length}
      />
    </>
  );
}
