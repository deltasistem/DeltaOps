/**
 * Detalle del registro con su menú de acciones: editar, anular y ver el
 * historial. Anular no elimina, pide motivo y saca las horas del Dashboard
 * conservando el registro visible para administración.
 */

import {
  AlertTriangle,
  ArrowRight,
  Ban,
  History,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';

import {
  ETIQUETA_ACCION,
  formatearFecha,
  formatearFechaHora,
  formatearHoras,
  formatearHorometro,
  puedeAnularRegistro,
  puedeEditarRegistro,
  type EntradaAuditoria,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { ETIQUETA_PROPIEDAD } from '../datos/opciones';
import { Encabezado } from '../navegacion/Encabezado';
import {
  Badge,
  Boton,
  BotonIcono,
  EstadoVacio,
  Seccion,
  Tarjeta,
} from '../ui/atomos';
import { useAvisos } from '../ui/avisos';
import { AreaTexto, Campo } from '../ui/campos';
import { useConfirmacion } from '../ui/dialogo';
import { Hoja } from '../ui/hoja';

export function DetalleRegistro({ id }: { readonly id: string }) {
  const { base, usuario, hoy, acciones } = useDatos();
  const [, navegar] = useLocation();
  const avisar = useAvisos();
  const { confirmar, elemento } = useConfirmacion();

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [historial, setHistorial] = useState(false);
  const [motivo, setMotivo] = useState('');

  const registro = base.registros.find((r) => r.id === id);

  if (!registro) {
    return (
      <>
        <Encabezado titulo="Registro" volver={() => navegar('/registros')} />
        <EstadoVacio
          titulo="Registro no encontrado"
          descripcion="El registro solicitado no existe."
        />
      </>
    );
  }

  const entradas = base.auditoria.filter(
    (a) => a.entidad === 'registro' && a.entidadId === registro.id,
  );
  const puedeEditar = puedeEditarRegistro(usuario, registro, hoy);
  const puedeAnular = puedeAnularRegistro(usuario, registro);

  const anular = async () => {
    if (motivo.trim().length < 5) {
      avisar('aviso', 'Escriba el motivo de la anulación.');
      return;
    }
    const aceptado = await confirmar({
      titulo: '¿Anular este registro?',
      mensaje: `Las ${formatearHoras(
        registro.hours,
      )} dejarán de sumarse en el Dashboard. El registro se conserva.`,
      textoConfirmar: 'Anular',
      destructivo: true,
    });
    if (!aceptado) return;
    await acciones.anularRegistro(registro.id, motivo);
    setAnulando(false);
    setMotivo('');
    avisar('exito', 'Registro anulado.');
  };

  return (
    <>
      <Encabezado
        titulo={`${registro.maquinaCodigo} · ${formatearHoras(registro.hours)}`}
        detalle={`${formatearFecha(registro.fecha)} · recibo ${registro.recibo}`}
        volver={() => navegar('/registros')}
        acciones={
          <BotonIcono etiqueta="Opciones del registro" onClick={() => setMenuAbierto(true)}>
            <MoreHorizontal size={19} />
          </BotonIcono>
        }
      />

      <div className="flex flex-col gap-5 px-4 pb-8">
        {registro.estado === 'anulado' && (
          <Tarjeta className="border border-[var(--dh-error)] bg-error-suave p-4">
            <div className="flex items-start gap-2.5">
              <Ban size={18} className="mt-0.5 shrink-0 text-error" />
              <div>
                <p className="text-[15px] font-bold text-error">Registro anulado</p>
                <p className="text-[13px] text-texto-2">
                  {registro.motivoAnulacion || 'Sin motivo registrado.'}
                </p>
                <p className="mt-1 text-[12px] text-texto-3">
                  Anulado por {registro.anuladoPorNombre} ·{' '}
                  {registro.anuladoEn ? formatearFechaHora(registro.anuladoEn) : '—'}
                </p>
              </div>
            </div>
          </Tarjeta>
        )}

        {registro.advertencias.length > 0 && (
          <Seccion titulo="Advertencias del registro">
            <div className="flex flex-col gap-2">
              {registro.advertencias.map((advertencia) => (
                <Tarjeta
                  key={advertencia.clave}
                  className="flex items-start gap-2.5 bg-aviso-suave p-3.5"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-aviso" />
                  <div>
                    <p className="text-[14px] font-semibold text-aviso">
                      {advertencia.mensaje}
                    </p>
                    {advertencia.detalle && (
                      <p className="text-[13px] text-texto-2">{advertencia.detalle}</p>
                    )}
                  </div>
                </Tarjeta>
              ))}
            </div>
          </Seccion>
        )}

        <Seccion titulo="Horómetro">
          <Tarjeta className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <span className="dh-numero font-titulo text-[20px] font-bold">
                {formatearHorometro(registro.horometroInicial, false)}
              </span>
              <ArrowRight size={16} className="text-texto-3" />
              <span className="dh-numero font-titulo text-[20px] font-bold">
                {formatearHorometro(registro.horometroFinal, false)}
              </span>
            </div>
            <span
              className={`dh-numero font-titulo text-[24px] font-bold ${
                registro.estado === 'anulado' ? 'text-texto-3 line-through' : 'text-marca'
              }`}
            >
              {formatearHoras(registro.hours)}
            </span>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Operación">
          <Tarjeta className="overflow-hidden">
            <Dato etiqueta="Fecha" valor={formatearFecha(registro.fecha)} />
            <Dato etiqueta="Cliente" valor={registro.clienteNombre} />
            <Dato etiqueta="Operación" valor={registro.operacionNombre} />
            <Dato etiqueta="Material" valor={registro.materialNombre} />
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Equipo">
          <Tarjeta className="overflow-hidden">
            <Dato
              etiqueta="Cargador"
              valor={`${registro.maquinaCodigo}${
                registro.maquinaNombre ? ` — ${registro.maquinaNombre}` : ''
              }`}
            />
            <Dato
              etiqueta="Propiedad"
              valor={
                <Badge tono={registro.propiedad === 'propio' ? 'exito' : 'info'}>
                  {ETIQUETA_PROPIEDAD[registro.propiedad]}
                </Badge>
              }
            />
            {registro.proveedorNombre && (
              <Dato etiqueta="Proveedor" valor={registro.proveedorNombre} />
            )}
            {registro.maquinaNumeroInterno && (
              <Dato etiqueta="N.º interno" valor={registro.maquinaNumeroInterno} />
            )}
            <Dato etiqueta="Recibo" valor={registro.recibo} />
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Personal">
          <Tarjeta className="overflow-hidden">
            <Dato etiqueta="Turno" valor={registro.turnoNombre} />
            <Dato etiqueta="Supervisor" valor={registro.supervisorNombre} />
            <Dato etiqueta="Operador de máquina" valor={registro.operadorNombre} />
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Observaciones">
          <Tarjeta className="p-4">
            <p className="text-[15px] whitespace-pre-line">
              {registro.observaciones || (
                <span className="text-texto-3">Sin observaciones.</span>
              )}
            </p>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Trazabilidad">
          <Tarjeta className="overflow-hidden">
            <Dato
              etiqueta="Estado"
              valor={
                registro.estado === 'anulado' ? (
                  <Badge tono="error">Anulado</Badge>
                ) : (
                  <Badge tono="exito">Activo</Badge>
                )
              }
            />
            <Dato etiqueta="Creado por" valor={registro.creadoPorNombre} />
            <Dato
              etiqueta="Fecha de creación"
              valor={formatearFechaHora(registro.creadoEn)}
            />
            <Dato
              etiqueta="Última modificación"
              valor={
                registro.actualizadoEn
                  ? `${formatearFechaHora(registro.actualizadoEn)} · ${
                      registro.actualizadoPorNombre
                    }`
                  : 'Sin modificaciones'
              }
            />
          </Tarjeta>
        </Seccion>
      </div>

      <Hoja
        abierta={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        titulo="Opciones del registro"
        descripcion={`Recibo ${registro.recibo} · ${registro.maquinaCodigo}`}
      >
        <div className="flex flex-col gap-2 pb-2">
          <Boton
            ancho
            tamano="lg"
            icono={<Pencil size={18} />}
            disabled={!puedeEditar}
            onClick={() => {
              setMenuAbierto(false);
              navegar(`/registros/${registro.id}/editar`);
            }}
          >
            Editar
          </Boton>
          <Boton
            ancho
            tamano="lg"
            variante="peligro"
            icono={<Ban size={18} />}
            disabled={!puedeAnular}
            onClick={() => {
              setMenuAbierto(false);
              setAnulando(true);
            }}
          >
            Anular
          </Boton>
          <Boton
            ancho
            tamano="lg"
            icono={<History size={18} />}
            onClick={() => {
              setMenuAbierto(false);
              setHistorial(true);
            }}
          >
            Ver historial
          </Boton>
          {!puedeEditar && !puedeAnular && (
            <p className="px-1 pt-1 text-[13px] text-texto-3">
              El rol {usuario.rol} puede consultar este registro, pero no modificarlo.
            </p>
          )}
        </div>
      </Hoja>

      <Hoja
        abierta={anulando}
        onCerrar={() => setAnulando(false)}
        titulo="Anular registro"
        descripcion="El registro se conserva y deja de sumar en el Dashboard."
        pie={
          <div className="flex gap-2">
            <Boton ancho onClick={() => setAnulando(false)}>
              Cancelar
            </Boton>
            <Boton ancho variante="peligro" onClick={() => void anular()}>
              Anular registro
            </Boton>
          </div>
        }
      >
        <Campo
          etiqueta="Motivo de anulación"
          requerido
          ayuda="Quedará guardado junto con su nombre y la fecha."
        >
          <AreaTexto
            autoFocus
            value={motivo}
            placeholder="Ejemplo: recibo cargado dos veces por cambio de turno."
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Campo>
      </Hoja>

      <Hoja
        abierta={historial}
        onCerrar={() => setHistorial(false)}
        titulo="Historial del registro"
        descripcion={`${entradas.length} movimiento(s) registrados.`}
      >
        {entradas.length === 0 ? (
          <EstadoVacio titulo="Sin movimientos registrados" />
        ) : (
          <ol className="flex flex-col gap-3 pb-2">
            {entradas.map((entrada) => (
              <MovimientoAuditoria key={entrada.id} entrada={entrada} />
            ))}
          </ol>
        )}
      </Hoja>

      {elemento}
    </>
  );
}

function Dato({
  etiqueta,
  valor,
}: {
  readonly etiqueta: string;
  readonly valor: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-borde px-4 py-3 last:border-0">
      <span className="shrink-0 text-[13px] text-texto-3">{etiqueta}</span>
      <span className="text-right text-[15px] font-medium">{valor}</span>
    </div>
  );
}

export function MovimientoAuditoria({
  entrada,
}: {
  readonly entrada: EntradaAuditoria;
}) {
  return (
    <li className="dh-tarjeta p-3.5">
      <div className="flex items-center justify-between gap-3">
        <Badge
          tono={
            entrada.accion === 'anular'
              ? 'error'
              : entrada.accion === 'crear'
                ? 'exito'
                : 'info'
          }
        >
          {ETIQUETA_ACCION[entrada.accion]}
        </Badge>
        <span className="text-[12px] text-texto-3">
          {formatearFechaHora(entrada.fechaHora)}
        </span>
      </div>
      <p className="mt-1.5 text-[14px] font-medium">{entrada.usuarioNombre}</p>
      {entrada.motivo && (
        <p className="text-[13px] text-texto-2">Motivo: {entrada.motivo}</p>
      )}
      {entrada.cambios.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {entrada.cambios.map((cambio) => (
            <li key={cambio.campo} className="text-[13px]">
              <span className="text-texto-3">{cambio.etiqueta}: </span>
              <span className="text-texto-3 line-through">{cambio.anterior}</span>
              <ArrowRight size={11} className="mx-1 inline align-middle text-texto-3" />
              <span className="font-semibold">{cambio.nuevo}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
