/**
 * NUEVO REGISTRO DE HORAS MÁQUINA (y su modo edición).
 *
 * Captura los mismos datos del Microsoft Forms actual, pero el sistema aporta
 * lo que ya sabe: propiedad y proveedor de la máquina, último horómetro y el
 * cálculo de horas. El objetivo es cerrar una operación normal en menos de
 * medio minuto, sin errores de horómetro.
 */

import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  CornerDownLeft,
  Home,
  Save,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import {
  calcularHoras,
  derivarAdvertencias,
  evaluarConsistencia,
  formatearFecha,
  formatearHoras,
  formatearHorometro,
  formatearNumero,
  interpretarDecimal,
  puedeEditarRegistro,
  requiereConfirmacion,
  ultimoHorometro,
  validarRegistro,
  type Advertencia,
  type EntradaRegistro,
  type ErrorCampo,
  type MachineRecord,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import {
  ETIQUETA_PROPIEDAD,
  opcionesClientes,
  opcionesMaquinas,
  opcionesMateriales,
  opcionesOperaciones,
  opcionesPersonas,
  opcionesTurnos,
} from '../datos/opciones';
import { Encabezado } from '../navegacion/Encabezado';
import {
  Badge,
  Boton,
  EstadoVacio,
  Interruptor,
  Seccion,
  Tarjeta,
} from '../ui/atomos';
import { useAvisos } from '../ui/avisos';
import { AreaTexto, Campo, Entrada, EntradaDecimal, ValorCalculado } from '../ui/campos';
import { Hoja } from '../ui/hoja';
import { Selector } from '../ui/selector';

function entradaDesde(registro: MachineRecord): EntradaRegistro {
  return {
    fecha: registro.fecha,
    clienteId: registro.clienteId,
    operacionId: registro.operacionId,
    materialId: registro.materialId,
    maquinaId: registro.maquinaId,
    recibo: registro.recibo,
    horometroInicial: registro.horometroInicial,
    horometroFinal: registro.horometroFinal,
    turnoId: registro.turnoId,
    supervisorId: registro.supervisorId,
    operadorId: registro.operadorId,
    observaciones: registro.observaciones,
  };
}

export function NuevoRegistro({ registroId }: { readonly registroId?: string }) {
  const { base, usuario, hoy, acciones } = useDatos();
  const [, navegar] = useLocation();
  const avisar = useAvisos();

  const original = registroId
    ? base.registros.find((r) => r.id === registroId)
    : undefined;
  const editando = Boolean(registroId);

  const [entrada, setEntrada] = useState<EntradaRegistro>(() =>
    original
      ? entradaDesde(original)
      : {
          fecha: hoy,
          clienteId: base.clientes.length === 1 ? (base.clientes[0]?.id ?? '') : '',
          operacionId: '',
          materialId: '',
          maquinaId: '',
          recibo: '',
          horometroInicial: null,
          horometroFinal: null,
          turnoId: '',
          supervisorId: '',
          operadorId: '',
          observaciones: '',
        },
  );
  const [textoInicial, setTextoInicial] = useState(
    original ? String(original.horometroInicial) : '',
  );
  const [textoFinal, setTextoFinal] = useState(
    original ? String(original.horometroFinal) : '',
  );
  const [errores, setErrores] = useState<readonly ErrorCampo[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [asumeAdvertencias, setAsumeAdvertencias] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<MachineRecord | null>(null);

  const maquina = base.maquinas.find((m) => m.id === entrada.maquinaId);
  const proveedor = maquina?.proveedorId
    ? base.proveedores.find((p) => p.id === maquina.proveedorId)
    : undefined;

  const ultimo = useMemo(
    () =>
      entrada.maquinaId === ''
        ? null
        : ultimoHorometro(base.registros, entrada.maquinaId, registroId),
    [base.registros, entrada.maquinaId, registroId],
  );
  const consistencia = evaluarConsistencia(ultimo, entrada.horometroInicial);
  const horas = calcularHoras(entrada.horometroInicial, entrada.horometroFinal);

  const advertencias = useMemo(
    () =>
      derivarAdvertencias(entrada, {
        registros: base.registros,
        maquina,
        excluirRegistroId: registroId,
      }),
    [base.registros, entrada, maquina, registroId],
  );

  /**
   * El horómetro invertido se avisa en cuanto se escribe, sin esperar a que el
   * usuario intente guardar: es un error que el sistema ya conoce.
   */
  const errorHorometroInvertido =
    entrada.horometroInicial !== null &&
    entrada.horometroFinal !== null &&
    entrada.horometroFinal < entrada.horometroInicial
      ? 'El horómetro final no puede ser menor al horómetro inicial.'
      : undefined;

  const errorDe = (campo: keyof EntradaRegistro) => {
    if (campo === 'horometroFinal' && errorHorometroInvertido) {
      return errorHorometroInvertido;
    }
    return errores.find((e) => e.campo === campo)?.mensaje;
  };

  const actualizar = (cambio: Partial<EntradaRegistro>) => {
    setEntrada((previa) => ({ ...previa, ...cambio }));
    setErrores((previos) =>
      previos.filter((e) => !Object.keys(cambio).includes(e.campo)),
    );
  };

  if (registroId && !original) {
    return (
      <>
        <Encabezado titulo="Editar registro" volver={() => navegar('/registros')} />
        <EstadoVacio
          titulo="Registro no encontrado"
          descripcion="El registro solicitado no existe o fue removido."
        />
      </>
    );
  }

  if (original && !puedeEditarRegistro(usuario, original, hoy)) {
    return (
      <>
        <Encabezado
          titulo="Editar registro"
          volver={() => navegar(`/registros/${original.id}`)}
        />
        <EstadoVacio
          titulo="Edición no permitida"
          descripcion={`El rol ${usuario.rol} no puede modificar este registro.`}
        />
      </>
    );
  }

  const intentarGuardar = () => {
    const encontrados = validarRegistro(entrada);
    setErrores(encontrados);
    if (encontrados.length > 0) {
      avisar('aviso', 'Revise los campos marcados.');
      return;
    }
    setAsumeAdvertencias(false);
    setConfirmando(true);
  };

  const confirmar = async () => {
    setGuardando(true);
    try {
      if (original) {
        const actualizado = await acciones.editarRegistro(original.id, entrada);
        setConfirmando(false);
        avisar('exito', 'Registro actualizado.');
        navegar(`/registros/${actualizado.id}`);
      } else {
        const creado = await acciones.crearRegistro(entrada);
        setConfirmando(false);
        setGuardado(creado);
      }
    } catch {
      avisar('aviso', 'No fue posible guardar el registro.');
    } finally {
      setGuardando(false);
    }
  };

  if (guardado) {
    return (
      <RegistroGuardado
        registro={guardado}
        onNuevo={() => {
          setGuardado(null);
          setEntrada({
            fecha: hoy,
            clienteId: guardado.clienteId,
            operacionId: guardado.operacionId,
            materialId: guardado.materialId,
            maquinaId: '',
            recibo: '',
            horometroInicial: null,
            horometroFinal: null,
            turnoId: guardado.turnoId,
            supervisorId: guardado.supervisorId,
            operadorId: '',
            observaciones: '',
          });
          setTextoInicial('');
          setTextoFinal('');
          setErrores([]);
        }}
      />
    );
  }

  const confirmacionPendiente =
    requiereConfirmacion(advertencias) && !asumeAdvertencias;

  return (
    <>
      <Encabezado
        titulo={editando ? 'Editar registro' : 'Nuevo registro de horas máquina'}
        detalle={
          editando
            ? `Recibo ${original?.recibo} · creado por ${original?.creadoPorNombre}`
            : 'Los campos marcados con * son obligatorios.'
        }
        volver={() =>
          navegar(editando ? `/registros/${registroId}` : '/')
        }
      />

      <div className="flex flex-col gap-5 px-4 pb-8">
        <Seccion titulo="Operación">
          <Tarjeta className="flex flex-col gap-4 p-4">
            <Campo etiqueta="Fecha" requerido error={errorDe('fecha')}>
              <Entrada
                type="date"
                value={entrada.fecha}
                max="2100-12-31"
                onChange={(e) => actualizar({ fecha: e.target.value })}
                invalido={Boolean(errorDe('fecha'))}
              />
            </Campo>

            <Campo etiqueta="Cliente" requerido error={errorDe('clienteId')}>
              <Selector
                titulo="Seleccionar cliente"
                opciones={opcionesClientes(base.clientes, entrada.clienteId)}
                valor={entrada.clienteId}
                onCambiar={(clienteId) => actualizar({ clienteId })}
                invalido={Boolean(errorDe('clienteId'))}
              />
            </Campo>

            <Campo etiqueta="Operación" requerido error={errorDe('operacionId')}>
              <Selector
                titulo="Seleccionar operación"
                opciones={opcionesOperaciones(base.operaciones, entrada.operacionId)}
                valor={entrada.operacionId}
                onCambiar={(operacionId) => actualizar({ operacionId })}
                invalido={Boolean(errorDe('operacionId'))}
              />
            </Campo>

            <Campo etiqueta="Material" requerido error={errorDe('materialId')}>
              <Selector
                titulo="Seleccionar material"
                opciones={opcionesMateriales(base.materiales, entrada.materialId)}
                valor={entrada.materialId}
                onCambiar={(materialId) => actualizar({ materialId })}
                invalido={Boolean(errorDe('materialId'))}
              />
            </Campo>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Equipo">
          <Tarjeta className="flex flex-col gap-4 p-4">
            <Campo etiqueta="Cargador" requerido error={errorDe('maquinaId')}>
              <Selector
                titulo="Seleccionar cargador"
                opciones={opcionesMaquinas(base.maquinas, entrada.maquinaId)}
                valor={entrada.maquinaId}
                onCambiar={(maquinaId) => actualizar({ maquinaId })}
                invalido={Boolean(errorDe('maquinaId'))}
              />
            </Campo>

            {maquina && (
              <div className="flex flex-wrap items-center gap-2 rounded-control bg-relleno-2 px-3.5 py-3">
                <Badge tono={maquina.propiedad === 'propio' ? 'exito' : 'info'}>
                  {ETIQUETA_PROPIEDAD[maquina.propiedad]}
                </Badge>
                {proveedor && (
                  <span className="text-[13px] text-texto-2">
                    {maquina.propiedad === 'tercerizado' ? 'Proveedor' : 'Propietario'}:{' '}
                    <strong>{proveedor.nombre}</strong>
                  </span>
                )}
                {maquina.numeroInterno && (
                  <span className="text-[13px] text-texto-3">
                    N.º interno {maquina.numeroInterno}
                  </span>
                )}
                {maquina.estado !== 'activo' && (
                  <Badge tono="aviso">Máquina {maquina.estado}</Badge>
                )}
              </div>
            )}

            <Campo
              etiqueta="Recibo"
              requerido
              error={errorDe('recibo')}
              ayuda={
                advertencias.some((a) => a.clave === 'recibo-duplicado')
                  ? undefined
                  : 'Número del recibo entregado en la operación.'
              }
            >
              <Entrada
                value={entrada.recibo}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ejemplo: 1949"
                onChange={(e) => actualizar({ recibo: e.target.value })}
                invalido={Boolean(errorDe('recibo'))}
              />
            </Campo>

            {advertencias
              .filter((a) => a.clave === 'recibo-duplicado')
              .map((a) => (
                <AvisoAdvertencia key={a.clave} advertencia={a} />
              ))}
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Horómetro">
          <Tarjeta className="flex flex-col gap-4 p-4">
            {entrada.maquinaId !== '' && (
              <ValorCalculado
                etiqueta="Último horómetro"
                valor={ultimo ? formatearHorometro(ultimo.valor) : 'Sin registro previo'}
                detalle={
                  ultimo
                    ? `${formatearFecha(ultimo.fecha)} · recibo ${ultimo.recibo}`
                    : 'Esta máquina no tiene lecturas anteriores.'
                }
              />
            )}

            <Campo
              etiqueta="Horómetro inicial"
              requerido
              error={errorDe('horometroInicial')}
              ayuda="Ejemplo: 650.3. Use punto decimal."
            >
              <EntradaDecimal
                value={textoInicial}
                placeholder="0.0"
                onChange={(e) => {
                  setTextoInicial(e.target.value);
                  actualizar({ horometroInicial: interpretarDecimal(e.target.value) });
                }}
                invalido={Boolean(errorDe('horometroInicial'))}
              />
            </Campo>

            {ultimo && entrada.horometroInicial !== ultimo.valor && (
              <Boton
                onClick={() => {
                  setTextoInicial(String(ultimo.valor));
                  actualizar({ horometroInicial: ultimo.valor });
                }}
                className="self-start px-3"
              >
                Usar último horómetro
              </Boton>
            )}

            {consistencia.tipo === 'consistente' && (
              <p className="flex items-center gap-2 text-[13px] font-semibold text-exito">
                <CheckCircle2 size={15} /> Horómetro consistente
              </p>
            )}
            {consistencia.tipo === 'diferencia' && (
              <p className="flex items-start gap-2 text-[13px] font-semibold text-aviso">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Diferencia de horómetro
                  <span className="block font-normal text-texto-3">
                    Último registrado {formatearHorometro(consistencia.ultimo)} · nuevo
                    inicial {formatearHorometro(entrada.horometroInicial ?? 0)} ·
                    diferencia {formatearNumero(Math.abs(consistencia.diferencia), 1)} h
                  </span>
                </span>
              </p>
            )}

            <Campo
              etiqueta="Horómetro final"
              requerido
              error={errorDe('horometroFinal')}
              ayuda="Ejemplo: 8879.2. Use punto decimal."
            >
              <EntradaDecimal
                value={textoFinal}
                placeholder="0.0"
                onChange={(e) => {
                  setTextoFinal(e.target.value);
                  actualizar({ horometroFinal: interpretarDecimal(e.target.value) });
                }}
                invalido={Boolean(errorDe('horometroFinal'))}
              />
            </Campo>

            <ValorCalculado
              etiqueta="Horas"
              valor={horas === null ? '—' : formatearHoras(horas)}
              detalle="Horómetro final menos horómetro inicial"
              tono={horas !== null && horas > 0 ? 'marca' : 'neutro'}
            />

            {advertencias
              .filter((a) => a.clave === 'cero-horas')
              .map((a) => (
                <AvisoAdvertencia key={a.clave} advertencia={a} />
              ))}
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Personal">
          <Tarjeta className="flex flex-col gap-4 p-4">
            <Campo etiqueta="Turno" requerido error={errorDe('turnoId')}>
              <Selector
                titulo="Seleccionar turno"
                opciones={opcionesTurnos(base.turnos, entrada.turnoId)}
                valor={entrada.turnoId}
                onCambiar={(turnoId) => actualizar({ turnoId })}
                invalido={Boolean(errorDe('turnoId'))}
              />
            </Campo>

            <Campo etiqueta="Supervisor" requerido error={errorDe('supervisorId')}>
              <Selector
                titulo="Seleccionar supervisor"
                opciones={opcionesPersonas(base.supervisores, entrada.supervisorId)}
                valor={entrada.supervisorId}
                onCambiar={(supervisorId) => actualizar({ supervisorId })}
                invalido={Boolean(errorDe('supervisorId'))}
              />
            </Campo>

            <Campo
              etiqueta="Operador de máquina"
              requerido
              error={errorDe('operadorId')}
            >
              <Selector
                titulo="Seleccionar operador"
                opciones={opcionesPersonas(base.operadores, entrada.operadorId)}
                valor={entrada.operadorId}
                onCambiar={(operadorId) => actualizar({ operadorId })}
                invalido={Boolean(errorDe('operadorId'))}
              />
            </Campo>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Observaciones">
          <Tarjeta className="p-4">
            <Campo etiqueta="Observaciones" ayuda="Opcional.">
              <AreaTexto
                value={entrada.observaciones}
                placeholder="Novedades de la operación, si las hubo."
                onChange={(e) => actualizar({ observaciones: e.target.value })}
              />
            </Campo>
          </Tarjeta>
        </Seccion>

        <Boton
          ancho
          tamano="lg"
          variante="principal"
          icono={<Save size={19} />}
          onClick={intentarGuardar}
        >
          {editando ? 'GUARDAR CAMBIOS' : 'GUARDAR REGISTRO'}
        </Boton>
      </div>

      <Hoja
        abierta={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo="Confirmar registro"
        descripcion="Revise los datos antes de guardar."
        pie={
          <div className="flex gap-2">
            <Boton ancho onClick={() => setConfirmando(false)}>
              Volver
            </Boton>
            <Boton
              ancho
              variante="principal"
              disabled={guardando || confirmacionPendiente}
              onClick={() => void confirmar()}
              icono={<Check size={18} />}
            >
              Confirmar
            </Boton>
          </div>
        }
      >
        <dl className="flex flex-col">
          <ResumenFila etiqueta="Fecha" valor={formatearFecha(entrada.fecha)} />
          <ResumenFila
            etiqueta="Cliente"
            valor={base.clientes.find((c) => c.id === entrada.clienteId)?.nombre ?? '—'}
          />
          <ResumenFila
            etiqueta="Operación"
            valor={
              base.operaciones.find((o) => o.id === entrada.operacionId)?.nombre ?? '—'
            }
          />
          <ResumenFila
            etiqueta="Material"
            valor={
              base.materiales.find((m) => m.id === entrada.materialId)?.nombre ?? '—'
            }
          />
          <ResumenFila etiqueta="Máquina" valor={maquina?.codigo ?? '—'} />
          <ResumenFila
            etiqueta="Propiedad"
            valor={maquina ? ETIQUETA_PROPIEDAD[maquina.propiedad] : '—'}
          />
          {maquina?.propiedad === 'tercerizado' && (
            <ResumenFila etiqueta="Proveedor" valor={proveedor?.nombre ?? '—'} />
          )}
          <ResumenFila etiqueta="Recibo" valor={entrada.recibo} />
          <ResumenFila
            etiqueta="Horómetro inicial"
            valor={formatearHorometro(entrada.horometroInicial ?? 0)}
          />
          <ResumenFila
            etiqueta="Horómetro final"
            valor={formatearHorometro(entrada.horometroFinal ?? 0)}
          />
          <ResumenFila
            etiqueta="Horas"
            valor={horas === null ? '—' : formatearHoras(horas)}
            destacada
          />
          <ResumenFila
            etiqueta="Turno"
            valor={base.turnos.find((t) => t.id === entrada.turnoId)?.nombre ?? '—'}
          />
          <ResumenFila
            etiqueta="Supervisor"
            valor={
              base.supervisores.find((s) => s.id === entrada.supervisorId)?.nombre ?? '—'
            }
          />
          <ResumenFila
            etiqueta="Operador"
            valor={
              base.operadores.find((o) => o.id === entrada.operadorId)?.nombre ?? '—'
            }
          />
          {entrada.observaciones.trim() !== '' && (
            <ResumenFila etiqueta="Observaciones" valor={entrada.observaciones} />
          )}
        </dl>

        {advertencias.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {advertencias.map((a) => (
              <AvisoAdvertencia key={a.clave} advertencia={a} />
            ))}
            {requiereConfirmacion(advertencias) && (
              <div className="flex items-center justify-between gap-3 rounded-control bg-relleno-2 px-3.5 py-3">
                <span className="text-[14px] font-medium">
                  Verifiqué los horómetros y confirmo el registro
                </span>
                <Interruptor
                  activo={asumeAdvertencias}
                  onCambiar={setAsumeAdvertencias}
                  etiqueta="Confirmar advertencias"
                />
              </div>
            )}
          </div>
        )}
      </Hoja>
    </>
  );
}

function ResumenFila({
  etiqueta,
  valor,
  destacada = false,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly destacada?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-borde py-2.5 last:border-0">
      <dt className="shrink-0 text-[13px] text-texto-3">{etiqueta}</dt>
      <dd
        className={`dh-numero text-right text-[15px] ${
          destacada ? 'font-titulo text-[18px] font-bold text-marca' : 'font-medium'
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

function AvisoAdvertencia({ advertencia }: { readonly advertencia: Advertencia }) {
  return (
    <div className="flex items-start gap-2.5 rounded-control bg-aviso-suave px-3.5 py-3">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-aviso" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-aviso">{advertencia.mensaje}</p>
        {advertencia.detalle && (
          <p className="text-[13px] text-texto-2">{advertencia.detalle}</p>
        )}
      </div>
    </div>
  );
}

/** Cierre del flujo: confirmación grande y las tres salidas posibles. */
function RegistroGuardado({
  registro,
  onNuevo,
}: {
  readonly registro: MachineRecord;
  readonly onNuevo: () => void;
}) {
  const [, navegar] = useLocation();

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-exito-suave text-exito">
        <Check size={44} strokeWidth={3} />
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="dh-seccion-titulo">Registro guardado</p>
        <p className="font-titulo text-[34px] leading-none font-bold">
          {registro.maquinaCodigo}
        </p>
        <p className="dh-numero font-titulo text-[26px] font-bold text-marca">
          {formatearHoras(registro.hours)}
        </p>
        <p className="text-[15px] text-texto-2">{registro.clienteNombre}</p>
        <p className="text-[14px] text-texto-3">Recibo {registro.recibo}</p>
        <p className="text-[13px] text-texto-3">
          {registro.operacionNombre} · {registro.materialNombre} ·{' '}
          {registro.turnoNombre}
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Boton
          ancho
          tamano="lg"
          variante="principal"
          icono={<CornerDownLeft size={18} />}
          onClick={onNuevo}
        >
          Nuevo registro
        </Boton>
        <Boton
          ancho
          icono={<ArrowRight size={18} />}
          onClick={() => navegar(`/registros/${registro.id}`)}
        >
          Ver registro
        </Boton>
        <Boton ancho variante="plano" icono={<Home size={18} />} onClick={() => navegar('/')}>
          Inicio
        </Boton>
      </div>
    </div>
  );
}
