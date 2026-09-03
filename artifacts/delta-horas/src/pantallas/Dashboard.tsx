/**
 * DASHBOARD. Analiza `MachineRecord` excluyendo los anulados y reproduce los
 * indicadores del tablero actual: total de horas, promedio por día, días
 * operativos y las series por fecha, cargador, operador, operación,
 * propio/tercerizado y turno.
 */

import { ListFilter, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  filtrarRegistros,
  formatearEntero,
  formatearHoras,
  nombreMes,
  registrosVisibles,
  resumirDashboard,
  type FiltroRegistros,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import {
  aniosConRegistros,
  opcionesMaquinas,
  opcionesPersonas,
} from '../datos/opciones';
import { Encabezado } from '../navegacion/Encabezado';
import { Badge, Boton, Chip, EstadoVacio, Kpi, Tarjeta } from '../ui/atomos';
import { Campo } from '../ui/campos';
import {
  BarrasHorizontales,
  Dona,
  LineaTiempo,
  PanelGrafico,
} from '../ui/graficos';
import { Selector } from '../ui/selector';
import { contarFiltros, FILTRO_VACIO, HojaFiltros } from './registros/Filtros';

export function Dashboard() {
  const { base, usuario, hoy } = useDatos();

  const [filtro, setFiltro] = useState<FiltroRegistros>(() => ({
    ...FILTRO_VACIO,
    anio: Number(hoy.slice(0, 4)),
    mes: Number(hoy.slice(5, 7)),
    estado: 'activo',
  }));
  const [filtrando, setFiltrando] = useState(false);

  const visibles = useMemo(
    () => registrosVisibles(base.registros, usuario.rol, usuario.id),
    [base.registros, usuario.id, usuario.rol],
  );

  // El Dashboard nunca cuenta anulados, con independencia del filtro elegido.
  const seleccionados = useMemo(
    () =>
      filtrarRegistros(visibles, filtro).filter((r) => r.estado === 'activo'),
    [filtro, visibles],
  );
  const resumen = useMemo(() => resumirDashboard(seleccionados), [seleccionados]);

  const activos = contarFiltros(filtro);
  const periodo =
    filtro.mes != null && filtro.anio != null
      ? `${nombreMes(filtro.mes)} de ${filtro.anio}`
      : filtro.anio != null
        ? `Año ${filtro.anio}`
        : 'Toda la operación';

  const anios = aniosConRegistros(base);

  return (
    <>
      <Encabezado
        titulo="Dashboard"
        detalle={`${periodo} · ${formatearEntero(resumen.totalRegistros)} registro(s) vigentes`}
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
              onClick={() =>
                setFiltro({
                  ...FILTRO_VACIO,
                  anio: Number(hoy.slice(0, 4)),
                  mes: Number(hoy.slice(5, 7)),
                  estado: 'activo',
                })
              }
              icono={<RotateCcw size={16} />}
              className="px-3"
            >
              Mes actual
            </Boton>
          </>
        }
        bajoTitulo={
          <div className="dh-sin-barra -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            <Chip
              activo={filtro.mes == null && filtro.anio == null}
              onClick={() => setFiltro({ ...filtro, anio: null, mes: null })}
            >
              Todo
            </Chip>
            {anios.map((anio) => (
              <Chip
                key={anio}
                activo={filtro.anio === anio && filtro.mes == null}
                onClick={() => setFiltro({ ...filtro, anio, mes: null })}
              >
                {anio}
              </Chip>
            ))}
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
              <Chip
                key={mes}
                activo={filtro.mes === mes}
                onClick={() =>
                  setFiltro({
                    ...filtro,
                    mes,
                    anio: filtro.anio ?? Number(hoy.slice(0, 4)),
                  })
                }
              >
                {nombreMes(mes)}
              </Chip>
            ))}
          </div>
        }
      />

      <div className="flex flex-col gap-4 px-4 pb-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            titulo="Total horas"
            valor={formatearHoras(resumen.totalHoras)}
            tono="marca"
          />
          <Kpi
            titulo="Promedio horas por día"
            valor={formatearHoras(resumen.promedioHorasPorDia)}
          />
          <Kpi
            titulo="Días operativos"
            valor={formatearEntero(resumen.diasOperativos)}
          />
          <Kpi
            titulo="Registros"
            valor={formatearEntero(resumen.totalRegistros)}
            detalle="Anulados excluidos"
          />
        </div>

        {/* Filtros principales del tablero, siempre visibles. */}
        <Tarjeta className="grid gap-3 p-4 sm:grid-cols-3">
          <Campo etiqueta="Mes">
            <Selector
              titulo="Seleccionar mes"
              placeholder="Todos"
              permitirVacio
              textoVacio="Todos"
              opciones={Array.from({ length: 12 }, (_, i) => ({
                id: String(i + 1),
                etiqueta: nombreMes(i + 1),
              }))}
              valor={filtro.mes == null ? '' : String(filtro.mes)}
              onCambiar={(v) => setFiltro({ ...filtro, mes: v === '' ? null : Number(v) })}
            />
          </Campo>
          <Campo etiqueta="Cargador">
            <Selector
              titulo="Filtrar por cargador"
              placeholder="Todos"
              permitirVacio
              textoVacio="Todos"
              opciones={opcionesMaquinas(base.maquinas, filtro.maquinaId ?? '')}
              valor={filtro.maquinaId ?? ''}
              onCambiar={(maquinaId) => setFiltro({ ...filtro, maquinaId })}
            />
          </Campo>
          <Campo etiqueta="Operador">
            <Selector
              titulo="Filtrar por operador"
              placeholder="Todos"
              permitirVacio
              textoVacio="Todos"
              opciones={opcionesPersonas(base.operadores, filtro.operadorId ?? '')}
              valor={filtro.operadorId ?? ''}
              onCambiar={(operadorId) => setFiltro({ ...filtro, operadorId })}
            />
          </Campo>
        </Tarjeta>

        {resumen.totalRegistros === 0 ? (
          <Tarjeta>
            <EstadoVacio
              titulo="No hay registros para este período."
              descripcion="Cambie el mes o quite los filtros para ver otra información."
              accion={
                <Boton onClick={() => setFiltro({ ...FILTRO_VACIO, estado: 'activo' })}>
                  Ver toda la operación
                </Boton>
              }
            />
          </Tarjeta>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelGrafico
              titulo="Horas máquina por fecha"
              detalle="Suma de horas por jornada"
              className="lg:col-span-2"
            >
              <LineaTiempo datos={resumen.porFecha} />
            </PanelGrafico>

            <PanelGrafico titulo="Horas máquina por cargador">
              <BarrasHorizontales
                datos={resumen.porCargador}
                color="var(--dh-serie-1)"
              />
            </PanelGrafico>

            <PanelGrafico titulo="Horas máquina por operador de máquina">
              <BarrasHorizontales
                datos={resumen.porOperador}
                color="var(--dh-serie-2)"
              />
            </PanelGrafico>

            <PanelGrafico titulo="Horas máquina por operación">
              <BarrasHorizontales
                datos={resumen.porOperacion}
                color="var(--dh-serie-3)"
              />
            </PanelGrafico>

            <PanelGrafico titulo="Horas máquina por turno">
              <Dona datos={resumen.porTurno} />
            </PanelGrafico>

            <PanelGrafico
              titulo="Horas máquina por cargador propio o tercerizado"
              className="lg:col-span-2"
            >
              <Dona
                datos={resumen.porPropiedad}
                centro={formatearHoras(resumen.totalHoras)}
              />
            </PanelGrafico>
          </div>
        )}
      </div>

      <HojaFiltros
        abierta={filtrando}
        onCerrar={() => setFiltrando(false)}
        base={base}
        filtro={filtro}
        onCambiar={setFiltro}
        resultados={resumen.totalRegistros}
      />
    </>
  );
}
