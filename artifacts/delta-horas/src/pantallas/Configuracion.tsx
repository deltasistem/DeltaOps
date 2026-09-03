/**
 * CONFIGURACIÓN: apariencia, sesión y datos de demostración.
 *
 * El cambio de usuario existe para probar la matriz de permisos sin montar un
 * servidor de identidad; cuando la aplicación se conecte a uno, esta tarjeta
 * es lo único que se reemplaza.
 */

import { Check, Database, Moon, RefreshCcw, Users } from 'lucide-react';
import { useLocation } from 'wouter';

import {
  DESCRIPCION_ROL,
  formatearEntero,
  permisosDe,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { ETIQUETA_TEMA, TEMAS, useTema } from '../datos/tema';
import { Encabezado } from '../navegacion/Encabezado';
import { Badge, Boton, Chip, Seccion, Tarjeta } from '../ui/atomos';
import { useAvisos } from '../ui/avisos';
import { useConfirmacion } from '../ui/dialogo';

export function Configuracion() {
  const { base, usuario, acciones } = useDatos();
  const { tema, cambiar } = useTema();
  const [, navegar] = useLocation();
  const avisar = useAvisos();
  const { confirmar, elemento } = useConfirmacion();

  const reiniciar = async () => {
    const aceptado = await confirmar({
      titulo: '¿Restaurar los datos de demostración?',
      mensaje:
        'Se descartarán los registros y los maestros capturados en este dispositivo, y se volverá a la operación de referencia.',
      textoConfirmar: 'Restaurar',
      destructivo: true,
    });
    if (!aceptado) return;
    await acciones.reiniciarDatos();
    avisar('exito', 'Datos de demostración restaurados.');
  };

  return (
    <>
      <Encabezado
        titulo="Configuración"
        detalle="DELTA LOGÍSTICA & EQUIPOS S.A.S."
        volver={() => navegar('/mas')}
      />

      <div className="flex flex-col gap-5 px-4 pb-8">
        <Seccion titulo="Apariencia">
          <Tarjeta className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2.5">
              <Moon size={17} className="text-texto-3" />
              <span className="flex-1 text-[15px] font-medium">Tema</span>
            </div>
            <div className="flex gap-2">
              {TEMAS.map((clave) => (
                <Chip
                  key={clave}
                  activo={tema === clave}
                  onClick={() => cambiar(clave)}
                  className="flex-1"
                >
                  {ETIQUETA_TEMA[clave]}
                </Chip>
              ))}
            </div>
            <p className="text-[13px] text-texto-3">
              «Automático» sigue la apariencia del sistema del teléfono.
            </p>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Sesión">
          <Tarjeta className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-borde px-4 py-3">
              <Users size={17} className="text-texto-3" />
              <span className="flex-1 text-[15px] font-medium">Usuario activo</span>
              <Badge tono="marca">{usuario.rol}</Badge>
            </div>
            {base.usuarios.map((candidato) => (
              <button
                key={candidato.id}
                type="button"
                disabled={candidato.estado !== 'activo'}
                onClick={() => {
                  void acciones.cambiarUsuario(candidato.id);
                  avisar('info', `Sesión de ${candidato.nombre} (${candidato.rol}).`);
                }}
                className="dh-pulsable flex w-full items-center gap-3 border-b border-borde px-4 py-3 text-left last:border-0 hover:bg-relleno-2 disabled:opacity-40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">
                    {candidato.nombre}
                  </span>
                  <span className="block truncate text-[13px] text-texto-3">
                    {candidato.rol} · {DESCRIPCION_ROL[candidato.rol]}
                  </span>
                </span>
                {candidato.id === usuario.id && (
                  <Check size={18} className="shrink-0 text-marca" />
                )}
              </button>
            ))}
          </Tarjeta>
          <p className="px-1 text-[13px] text-texto-3">
            Permisos del rol actual: {permisosDe(usuario).length} de 10.
          </p>
        </Seccion>

        <Seccion titulo="Datos">
          <Tarjeta className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-2.5">
              <Database size={17} className="text-texto-3" />
              <span className="flex-1 text-[15px] font-medium">
                Operación en este dispositivo
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              <Conteo etiqueta="Registros" valor={base.registros.length} />
              <Conteo etiqueta="Máquinas" valor={base.maquinas.length} />
              <Conteo etiqueta="Operadores" valor={base.operadores.length} />
              <Conteo etiqueta="Supervisores" valor={base.supervisores.length} />
              <Conteo etiqueta="Clientes" valor={base.clientes.length} />
              <Conteo etiqueta="Operaciones" valor={base.operaciones.length} />
              <Conteo etiqueta="Materiales" valor={base.materiales.length} />
              <Conteo etiqueta="Movimientos de auditoría" valor={base.auditoria.length} />
            </dl>
            <Boton
              variante="peligro"
              icono={<RefreshCcw size={17} />}
              onClick={() => void reiniciar()}
            >
              Restaurar datos de demostración
            </Boton>
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Acerca de">
          <Tarjeta className="flex flex-col gap-1 p-4 text-[13px] text-texto-2">
            <p className="text-[15px] font-semibold text-texto">
              DELTA — Control de Horas Máquina
            </p>
            <p>Alcance de esta versión: control de horas máquina.</p>
            <p>Zona horaria de la operación: America/Bogota.</p>
            <p>Formato numérico: colombiano (1.284,50 h).</p>
          </Tarjeta>
        </Seccion>
      </div>

      {elemento}
    </>
  );
}

function Conteo({
  etiqueta,
  valor,
}: {
  readonly etiqueta: string;
  readonly valor: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-control bg-relleno-2 px-3 py-2">
      <dt className="text-texto-3">{etiqueta}</dt>
      <dd className="dh-numero font-semibold">{formatearEntero(valor)}</dd>
    </div>
  );
}
