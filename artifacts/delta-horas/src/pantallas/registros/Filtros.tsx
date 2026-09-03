/**
 * Filtros de registros, en hoja inferior. Se pueden combinar libremente y el
 * contador de resultados se actualiza al aplicar.
 */

import {
  nombreMes,
  type BaseDatos,
  type FiltroRegistros,
} from '@workspace/horas-maquina';

import {
  aniosConRegistros,
  opcionesClientes,
  opcionesMaquinas,
  opcionesMateriales,
  opcionesOperaciones,
  opcionesPersonas,
  opcionesProveedores,
  opcionesTurnos,
} from '../../datos/opciones';
import { Boton } from '../../ui/atomos';
import { Campo, Entrada } from '../../ui/campos';
import { Hoja } from '../../ui/hoja';
import { Selector } from '../../ui/selector';

export const FILTRO_VACIO: FiltroRegistros = {
  texto: '',
  anio: null,
  mes: null,
  desde: '',
  hasta: '',
  maquinaId: '',
  operadorId: '',
  supervisorId: '',
  clienteId: '',
  operacionId: '',
  materialId: '',
  propiedad: '',
  proveedorId: '',
  turnoId: '',
  estado: '',
};

/** Cuántos criterios están activos, para señalarlo en el botón de filtros. */
export function contarFiltros(filtro: FiltroRegistros): number {
  return Object.entries(filtro).filter(
    ([clave, valor]) =>
      clave !== 'texto' && valor !== '' && valor !== null && valor !== undefined,
  ).length;
}

const MESES = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  etiqueta: nombreMes(i + 1),
}));

export function HojaFiltros({
  abierta,
  onCerrar,
  base,
  filtro,
  onCambiar,
  resultados,
}: {
  readonly abierta: boolean;
  readonly onCerrar: () => void;
  readonly base: BaseDatos;
  readonly filtro: FiltroRegistros;
  readonly onCambiar: (filtro: FiltroRegistros) => void;
  readonly resultados: number;
}) {
  const cambiar = (parcial: Partial<FiltroRegistros>) =>
    onCambiar({ ...filtro, ...parcial });

  return (
    <Hoja
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="Filtros"
      descripcion={`${resultados} registro(s) con los criterios actuales.`}
      pie={
        <div className="flex gap-2">
          <Boton ancho onClick={() => onCambiar(FILTRO_VACIO)}>
            Limpiar
          </Boton>
          <Boton ancho variante="principal" onClick={onCerrar}>
            Ver resultados
          </Boton>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Año">
            <Selector
              titulo="Seleccionar año"
              placeholder="Todos"
              permitirVacio
              textoVacio="Todos"
              opciones={aniosConRegistros(base).map((a) => ({
                id: String(a),
                etiqueta: String(a),
              }))}
              valor={filtro.anio == null ? '' : String(filtro.anio)}
              onCambiar={(v) => cambiar({ anio: v === '' ? null : Number(v) })}
            />
          </Campo>
          <Campo etiqueta="Mes">
            <Selector
              titulo="Seleccionar mes"
              placeholder="Todos"
              permitirVacio
              textoVacio="Todos"
              opciones={MESES}
              valor={filtro.mes == null ? '' : String(filtro.mes)}
              onCambiar={(v) => cambiar({ mes: v === '' ? null : Number(v) })}
            />
          </Campo>
          <Campo etiqueta="Fecha desde">
            <Entrada
              type="date"
              value={filtro.desde ?? ''}
              onChange={(e) => cambiar({ desde: e.target.value })}
            />
          </Campo>
          <Campo etiqueta="Fecha hasta">
            <Entrada
              type="date"
              value={filtro.hasta ?? ''}
              onChange={(e) => cambiar({ hasta: e.target.value })}
            />
          </Campo>
        </div>

        <Campo etiqueta="Cargador">
          <Selector
            titulo="Filtrar por cargador"
            placeholder="Todos"
            permitirVacio
            textoVacio="Todos"
            opciones={opcionesMaquinas(base.maquinas, filtro.maquinaId ?? '')}
            valor={filtro.maquinaId ?? ''}
            onCambiar={(maquinaId) => cambiar({ maquinaId })}
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
            onCambiar={(operadorId) => cambiar({ operadorId })}
          />
        </Campo>

        <Campo etiqueta="Supervisor">
          <Selector
            titulo="Filtrar por supervisor"
            placeholder="Todos"
            permitirVacio
            textoVacio="Todos"
            opciones={opcionesPersonas(base.supervisores, filtro.supervisorId ?? '')}
            valor={filtro.supervisorId ?? ''}
            onCambiar={(supervisorId) => cambiar({ supervisorId })}
          />
        </Campo>

        <Campo etiqueta="Cliente">
          <Selector
            titulo="Filtrar por cliente"
            placeholder="Todos"
            permitirVacio
            textoVacio="Todos"
            opciones={opcionesClientes(base.clientes, filtro.clienteId ?? '')}
            valor={filtro.clienteId ?? ''}
            onCambiar={(clienteId) => cambiar({ clienteId })}
          />
        </Campo>

        <Campo etiqueta="Operación">
          <Selector
            titulo="Filtrar por operación"
            placeholder="Todas"
            permitirVacio
            opciones={opcionesOperaciones(base.operaciones, filtro.operacionId ?? '')}
            valor={filtro.operacionId ?? ''}
            onCambiar={(operacionId) => cambiar({ operacionId })}
          />
        </Campo>

        <Campo etiqueta="Material">
          <Selector
            titulo="Filtrar por material"
            placeholder="Todos"
            permitirVacio
            textoVacio="Todos"
            opciones={opcionesMateriales(base.materiales, filtro.materialId ?? '')}
            valor={filtro.materialId ?? ''}
            onCambiar={(materialId) => cambiar({ materialId })}
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Propiedad">
            <Selector
              titulo="Propio o tercerizado"
              placeholder="Todas"
              permitirVacio
              opciones={[
                { id: 'propio', etiqueta: 'Propio' },
                { id: 'tercerizado', etiqueta: 'Tercerizado' },
              ]}
              valor={filtro.propiedad ?? ''}
              onCambiar={(v) =>
                cambiar({ propiedad: v as FiltroRegistros['propiedad'] })
              }
            />
          </Campo>
          <Campo etiqueta="Turno">
            <Selector
              titulo="Filtrar por turno"
              placeholder="Todos"
              permitirVacio
              textoVacio="Todos"
              opciones={opcionesTurnos(base.turnos, filtro.turnoId ?? '')}
              valor={filtro.turnoId ?? ''}
              onCambiar={(turnoId) => cambiar({ turnoId })}
            />
          </Campo>
        </div>

        <Campo etiqueta="Proveedor">
          <Selector
            titulo="Filtrar por proveedor"
            placeholder="Todos"
            permitirVacio
            textoVacio="Todos"
            opciones={opcionesProveedores(base.proveedores, filtro.proveedorId ?? '')}
            valor={filtro.proveedorId ?? ''}
            onCambiar={(proveedorId) => cambiar({ proveedorId })}
          />
        </Campo>

        <Campo etiqueta="Estado">
          <Selector
            titulo="Filtrar por estado"
            placeholder="Todos"
            permitirVacio
            textoVacio="Todos"
            opciones={[
              { id: 'activo', etiqueta: 'Activo' },
              { id: 'anulado', etiqueta: 'Anulado' },
            ]}
            valor={filtro.estado ?? ''}
            onCambiar={(v) => cambiar({ estado: v as FiltroRegistros['estado'] })}
          />
        </Campo>
      </div>
    </Hoja>
  );
}
