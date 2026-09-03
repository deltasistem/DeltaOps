/**
 * Pantalla común de administración de maestros: buscar, filtrar por estado,
 * agregar, editar, activar y desactivar.
 *
 * Nada se elimina físicamente. Un elemento con registros históricos solo se
 * desactiva, para que la historia siga siendo legible.
 */

import { Plus, Search, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import {
  existeNombre,
  formatearEntero,
  normalizar,
  puede,
  usosEnRegistros,
  type EstadoMaestro,
  type Maestro,
} from '@workspace/horas-maquina';

import { useDatos } from '../../datos/contexto';
import { Encabezado } from '../../navegacion/Encabezado';
import {
  Badge,
  Boton,
  Chip,
  EstadoVacio,
  Interruptor,
  Tarjeta,
} from '../../ui/atomos';
import { useAvisos } from '../../ui/avisos';
import { AreaTexto, Campo, Entrada } from '../../ui/campos';
import { useConfirmacion } from '../../ui/dialogo';
import { Hoja } from '../../ui/hoja';
import { Selector } from '../../ui/selector';
import {
  DEFINICIONES,
  esMaestro,
  PERMISOS_CONCEDIBLES,
  type CampoMaestro,
} from './definiciones';

type Valores = Record<string, unknown>;
type FiltroEstado = 'activo' | 'inactivo' | '';

function textoDe(valores: Valores, clave: string): string {
  const valor = valores[clave];
  return valor === null || valor === undefined ? '' : String(valor);
}

export function PantallaMaestro({ maestro }: { readonly maestro: string }) {
  const { base, usuario, acciones } = useDatos();
  const [, navegar] = useLocation();
  const avisar = useAvisos();
  const { confirmar, elemento: dialogo } = useConfirmacion();

  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('');
  const [editando, setEditando] = useState<Valores | null>(null);
  const [errores, setErrores] = useState<Readonly<Record<string, string>>>({});

  if (!esMaestro(maestro)) {
    return (
      <>
        <Encabezado titulo="Administración" volver={() => navegar('/mas')} />
        <EstadoVacio
          titulo="Maestro no encontrado"
          descripcion={`«${maestro}» no corresponde a ninguna lista administrable.`}
        />
      </>
    );
  }

  const definicion = DEFINICIONES[maestro as Maestro];
  const coleccion = base[definicion.maestro] as readonly unknown[] as readonly Valores[];
  const puedeEditar =
    definicion.maestro === 'usuarios'
      ? puede(usuario, 'usuarios.administrar')
      : puede(usuario, 'maestros.editar');

  const visibles = useMemo(() => {
    const termino = normalizar(busqueda);
    return coleccion.filter((e) => {
      const estado = textoDe(e, 'estado');
      if (filtroEstado === 'activo' && estado !== 'activo') return false;
      if (filtroEstado === 'inactivo' && estado === 'activo') return false;
      if (termino === '') return true;
      return definicion.campos.some((campo) =>
        normalizar(textoDe(e, campo.clave)).includes(termino),
      );
    });
  }, [busqueda, coleccion, definicion.campos, filtroEstado]);

  const activos = coleccion.filter((e) => textoDe(e, 'estado') === 'activo').length;

  const abrirNuevo = () => {
    const iniciales: Valores = { estado: 'activo' };
    for (const campo of definicion.campos) {
      iniciales[campo.clave] = campo.tipo === 'permisos' ? [] : '';
    }
    if (definicion.maestro === 'maquinas') iniciales.propiedad = 'propio';
    if (definicion.maestro === 'usuarios') iniciales.rol = 'CAPTURA';
    setErrores({});
    setEditando(iniciales);
  };

  const guardar = async () => {
    if (!editando) return;
    const encontrados: Record<string, string> = {};

    for (const campo of definicion.campos) {
      if (campo.requerido && textoDe(editando, campo.clave).trim() === '') {
        encontrados[campo.clave] = `Indique ${campo.etiqueta.toLowerCase()}.`;
      }
    }

    const clave = definicion.claveUnica;
    if (clave && !encontrados[clave]) {
      const existentes = coleccion.map((e) => ({
        id: textoDe(e, 'id'),
        nombre: textoDe(e, clave),
      }));
      if (
        existeNombre(existentes, textoDe(editando, clave), textoDe(editando, 'id'))
      ) {
        encontrados[clave] = 'Ya existe un elemento con este valor.';
      }
    }

    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) {
      avisar('aviso', 'Revise los campos marcados.');
      return;
    }

    const etiquetas = Object.fromEntries(
      definicion.campos.map((campo) => [campo.clave, campo.etiqueta]),
    );
    const datos: Valores = { ...editando };
    if (textoDe(editando, 'id') === '') delete datos.id;
    if (definicion.maestro === 'maquinas' && datos.proveedorId === '') {
      datos.proveedorId = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await acciones.guardarMaestro(definicion.maestro as any, datos as any, etiquetas);
    setEditando(null);
    avisar('exito', `${definicion.singular} guardado.`);
  };

  const alternarEstado = async (elemento: Valores) => {
    const activo = textoDe(elemento, 'estado') === 'activo';
    const nombre = textoDe(elemento, definicion.campoTitulo);
    const usos = usosEnRegistros(base, definicion.maestro, textoDe(elemento, 'id'));

    const aceptado = await confirmar({
      titulo: activo ? `¿Desactivar ${nombre}?` : `¿Activar ${nombre}?`,
      mensaje: activo
        ? usos > 0
          ? `Tiene ${formatearEntero(usos)} registro(s) históricos. No se elimina: deja de aparecer en los selectores y su historia se conserva.`
          : 'Dejará de aparecer en los selectores del formulario.'
        : 'Volverá a estar disponible en los selectores del formulario.',
      textoConfirmar: activo ? 'Desactivar' : 'Activar',
      destructivo: activo,
    });
    if (!aceptado) return;

    await acciones.cambiarEstadoMaestro(
      definicion.maestro,
      textoDe(elemento, 'id'),
      (activo ? 'inactivo' : 'activo') as EstadoMaestro,
    );
    avisar('exito', activo ? `${nombre} desactivado.` : `${nombre} activado.`);
  };

  return (
    <>
      <Encabezado
        titulo={definicion.titulo}
        detalle={`${formatearEntero(activos)} activo(s) de ${formatearEntero(
          coleccion.length,
        )}`}
        volver={() => navegar('/mas')}
        acciones={
          puedeEditar ? (
            <Boton
              variante="principal"
              icono={<Plus size={17} />}
              onClick={abrirNuevo}
              className="px-3"
            >
              Agregar
            </Boton>
          ) : undefined
        }
        bajoTitulo={
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex h-11 items-center gap-2 rounded-control bg-relleno px-3">
              <Search size={16} className="shrink-0 text-texto-3" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar ${definicion.singular}...`}
                className="w-full bg-transparent text-[16px] outline-none placeholder:text-texto-3"
              />
            </div>
            <div className="flex gap-2">
              <Chip activo={filtroEstado === ''} onClick={() => setFiltroEstado('')}>
                Todos
              </Chip>
              <Chip
                activo={filtroEstado === 'activo'}
                onClick={() => setFiltroEstado('activo')}
              >
                Activos
              </Chip>
              <Chip
                activo={filtroEstado === 'inactivo'}
                onClick={() => setFiltroEstado('inactivo')}
              >
                Inactivos
              </Chip>
            </div>
          </div>
        }
      />

      <div className="flex flex-col gap-3 px-4 pb-8">
        {definicion.nota && (
          <p className="px-1 text-[13px] text-texto-3">{definicion.nota}</p>
        )}

        {visibles.length === 0 ? (
          <Tarjeta>
            <EstadoVacio
              titulo={
                coleccion.length === 0
                  ? `Aún no hay ${definicion.titulo.toLowerCase()} registrados.`
                  : 'Sin resultados'
              }
              descripcion={
                coleccion.length === 0
                  ? undefined
                  : 'Ajuste la búsqueda o el filtro de estado.'
              }
              accion={
                puedeEditar && coleccion.length === 0 ? (
                  <Boton variante="principal" icono={<Plus size={17} />} onClick={abrirNuevo}>
                    {definicion.textoAgregar}
                  </Boton>
                ) : undefined
              }
            />
          </Tarjeta>
        ) : (
          <Tarjeta className="overflow-hidden">
            {visibles.map((elemento) => {
              const activo = textoDe(elemento, 'estado') === 'activo';
              const usos = usosEnRegistros(
                base,
                definicion.maestro,
                textoDe(elemento, 'id'),
              );
              return (
                <div
                  key={textoDe(elemento, 'id')}
                  className="flex items-center gap-3 border-b border-borde px-4 py-3 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setErrores({});
                      setEditando({ ...elemento });
                    }}
                    className="dh-pulsable min-w-0 flex-1 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-semibold">
                        {textoDe(elemento, definicion.campoTitulo) || '(sin nombre)'}
                      </span>
                      {!activo && <Badge tono="aviso">Inactivo</Badge>}
                      {definicion.maestro === 'maquinas' && (
                        <Badge
                          tono={
                            textoDe(elemento, 'propiedad') === 'propio' ? 'exito' : 'info'
                          }
                        >
                          {textoDe(elemento, 'propiedad') === 'propio'
                            ? 'Propio'
                            : 'Tercerizado'}
                        </Badge>
                      )}
                      {definicion.maestro === 'usuarios' && (
                        <Badge tono="marca">{textoDe(elemento, 'rol')}</Badge>
                      )}
                    </span>
                    {definicion.campoDetalle && (
                      <span className="block truncate text-[13px] text-texto-3">
                        {textoDe(elemento, definicion.campoDetalle)}
                      </span>
                    )}
                    {usos > 0 && (
                      <span className="dh-numero block text-[12px] text-texto-3">
                        {formatearEntero(usos)} registro(s) históricos
                      </span>
                    )}
                  </button>

                  {puedeEditar && (
                    <Interruptor
                      activo={activo}
                      onCambiar={() => void alternarEstado(elemento)}
                      etiqueta={activo ? 'Desactivar' : 'Activar'}
                    />
                  )}
                </div>
              );
            })}
          </Tarjeta>
        )}

        {!puedeEditar && (
          <p className="flex items-start gap-2 px-1 text-[13px] text-texto-3">
            <ShieldAlert size={15} className="mt-0.5 shrink-0" />
            El rol {usuario.rol} puede consultar esta lista, pero no modificarla.
          </p>
        )}
      </div>

      <Hoja
        abierta={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo={
          textoDe(editando ?? {}, 'id') === ''
            ? definicion.textoAgregar.replace('+ ', '')
            : `Editar ${definicion.singular}`
        }
        descripcion={definicion.nota}
        pie={
          <div className="flex gap-2">
            <Boton ancho onClick={() => setEditando(null)}>
              Cancelar
            </Boton>
            <Boton ancho variante="principal" onClick={() => void guardar()}>
              Guardar
            </Boton>
          </div>
        }
      >
        {editando && (
          <div className="flex flex-col gap-4 pb-2">
            {definicion.campos.map((campo) => (
              <CampoEditable
                key={campo.clave}
                campo={campo}
                valores={editando}
                error={errores[campo.clave]}
                onCambiar={(valor) =>
                  setEditando((previo) => ({ ...(previo ?? {}), [campo.clave]: valor }))
                }
              />
            ))}
          </div>
        )}
      </Hoja>

      {dialogo}
    </>
  );
}

function CampoEditable({
  campo,
  valores,
  error,
  onCambiar,
}: {
  readonly campo: CampoMaestro;
  readonly valores: Valores;
  readonly error?: string;
  readonly onCambiar: (valor: unknown) => void;
}) {
  const { base } = useDatos();

  if (campo.visibleSi && !campo.visibleSi(valores)) return null;

  const valor = textoDe(valores, campo.clave);

  if (campo.tipo === 'permisos') {
    const concedidos = Array.isArray(valores[campo.clave])
      ? (valores[campo.clave] as string[])
      : [];
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-texto-2">{campo.etiqueta}</span>
        {campo.ayuda && <span className="text-[12px] text-texto-3">{campo.ayuda}</span>}
        {PERMISOS_CONCEDIBLES.map((permiso) => (
          <div
            key={permiso.clave}
            className="flex items-center justify-between gap-3 rounded-control bg-relleno-2 px-3.5 py-2.5"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-medium">{permiso.etiqueta}</span>
              <span className="block text-[12px] text-texto-3">{permiso.detalle}</span>
            </span>
            <Interruptor
              activo={concedidos.includes(permiso.clave)}
              etiqueta={permiso.etiqueta}
              onCambiar={(activo) =>
                onCambiar(
                  activo
                    ? [...concedidos, permiso.clave]
                    : concedidos.filter((p) => p !== permiso.clave),
                )
              }
            />
          </div>
        ))}
      </div>
    );
  }

  if (campo.tipo === 'seleccion') {
    return (
      <Campo
        etiqueta={campo.etiqueta}
        requerido={campo.requerido}
        error={error}
        ayuda={campo.ayuda}
      >
        <Selector
          titulo={`Seleccionar ${campo.etiqueta.toLowerCase()}`}
          opciones={campo.opciones?.(base, valor) ?? []}
          valor={valor}
          onCambiar={onCambiar}
          invalido={Boolean(error)}
          permitirVacio={!campo.requerido}
          textoVacio="Sin asignar"
        />
      </Campo>
    );
  }

  if (campo.tipo === 'parrafo') {
    return (
      <Campo etiqueta={campo.etiqueta} error={error} ayuda={campo.ayuda ?? 'Opcional.'}>
        <AreaTexto
          value={valor}
          placeholder={campo.placeholder}
          onChange={(e) => onCambiar(e.target.value)}
        />
      </Campo>
    );
  }

  const tipoHtml =
    campo.tipo === 'correo'
      ? 'email'
      : campo.tipo === 'telefono'
        ? 'tel'
        : campo.tipo === 'hora'
          ? 'time'
          : 'text';

  return (
    <Campo
      etiqueta={campo.etiqueta}
      requerido={campo.requerido}
      error={error}
      ayuda={campo.ayuda}
    >
      <Entrada
        type={tipoHtml}
        value={valor}
        placeholder={campo.placeholder}
        autoComplete="off"
        onChange={(e) => onCambiar(e.target.value)}
        invalido={Boolean(error)}
      />
    </Campo>
  );
}
