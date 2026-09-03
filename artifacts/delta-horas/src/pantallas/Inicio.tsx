/**
 * Pantalla Inicio: el estado de la jornada de un vistazo y un solo botón
 * grande para lo que el supervisor viene a hacer, registrar horas.
 */

import {
  BarChart3,
  Bell,
  ChevronRight,
  Clock3,
  Plus,
  Table2,
} from 'lucide-react';
import { Link } from 'wouter';

import {
  compararRecientes,
  contarAtencion,
  derivarAlertas,
  formatearEntero,
  formatearFecha,
  formatearHora,
  formatearHoras,
  puede,
  registrosVisibles,
  resumirDia,
  saludo,
  type MachineRecord,
} from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { Badge, EstadoVacio, Seccion, Tarjeta } from '../ui/atomos';

export function Inicio() {
  const { base, usuario, hoy } = useDatos();

  const visibles = registrosVisibles(base.registros, usuario.rol, usuario.id);
  const resumen = resumirDia(visibles, hoy);
  const recientes = [...visibles].sort(compararRecientes).slice(0, 6);
  const pendientes = contarAtencion(derivarAlertas(visibles));

  const puedeRegistrar = puede(usuario, 'registros.crear');
  const puedeDashboard = puede(usuario, 'dashboard.ver');

  return (
    <div className="flex flex-col gap-5 pb-6">
      <header className="dh-seguro-arriba px-4 pt-6">
        <p className="text-[15px] text-texto-3">{saludo()}, {usuario.nombre.split(' ')[0]}</p>
        <h1 className="font-titulo text-[32px] leading-none font-bold tracking-tight">
          DELTA
        </h1>
        <p className="mt-1 text-[14px] text-texto-2">Control de Horas Máquina</p>
        <p className="mt-0.5 text-[13px] text-texto-3">
          Jornada del {formatearFecha(hoy)}
        </p>
      </header>

      {puedeRegistrar && (
        <div className="px-4">
          <Link
            href="/registrar"
            className="dh-pulsable flex h-14 w-full items-center justify-center gap-2 rounded-control bg-[var(--dh-rojo)] text-[17px] font-bold text-white shadow-[0_8px_24px_rgba(210,0,43,0.28)] hover:bg-[var(--dh-rojo-fuerte)]"
          >
            <Plus size={20} strokeWidth={2.6} />
            REGISTRAR HORAS
          </Link>
        </div>
      )}

      <Seccion titulo="Hoy" className="px-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TarjetaDato
            titulo="Horas hoy"
            valor={formatearHoras(resumen.horas)}
            destacada
          />
          <TarjetaDato
            titulo="Registros hoy"
            valor={formatearEntero(resumen.registros)}
          />
          <TarjetaDato
            titulo="Máquinas utilizadas"
            valor={formatearEntero(resumen.maquinas)}
            className="col-span-2 sm:col-span-1"
          />
          <TarjetaDato titulo="Propias" valor={formatearEntero(resumen.propias)} />
          <TarjetaDato
            titulo="Tercerizadas"
            valor={formatearEntero(resumen.tercerizadas)}
          />
        </div>
      </Seccion>

      <Seccion
        titulo="Actividad reciente"
        className="px-4"
        accion={
          <Link
            href="/registros"
            className="text-[14px] font-semibold text-marca"
          >
            Ver todo
          </Link>
        }
      >
        <Tarjeta className="overflow-hidden">
          {recientes.length === 0 ? (
            <EstadoVacio
              icono={<Clock3 size={22} />}
              titulo="Aún no hay registros"
              descripcion="Registre la primera operación de la jornada."
              accion={
                puedeRegistrar ? (
                  <Link
                    href="/registrar"
                    className="dh-pulsable inline-flex h-11 items-center gap-2 rounded-control bg-[var(--dh-rojo)] px-4 text-[15px] font-semibold text-white"
                  >
                    <Plus size={17} />
                    Registrar horas
                  </Link>
                ) : undefined
              }
            />
          ) : (
            recientes.map((registro) => (
              <FilaActividad key={registro.id} registro={registro} />
            ))
          )}
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Acciones rápidas" className="px-4">
        <Tarjeta className="overflow-hidden">
          {puedeRegistrar && (
            <AccionRapida
              href="/registrar"
              etiqueta="Registrar horas"
              icono={<Plus size={18} />}
            />
          )}
          <AccionRapida
            href={`/registros?desde=${hoy}&hasta=${hoy}`}
            etiqueta="Ver registros de hoy"
            icono={<Table2 size={18} />}
          />
          {puedeDashboard && (
            <AccionRapida
              href="/dashboard"
              etiqueta="Ver dashboard"
              icono={<BarChart3 size={18} />}
            />
          )}
          <AccionRapida
            href="/mas/alertas"
            etiqueta="Ver alertas"
            icono={<Bell size={18} />}
            insignia={pendientes > 0 ? <Badge tono="aviso">{pendientes}</Badge> : null}
          />
        </Tarjeta>
      </Seccion>
    </div>
  );
}

function AccionRapida({
  href,
  etiqueta,
  icono,
  insignia,
}: {
  readonly href: string;
  readonly etiqueta: string;
  readonly icono: React.ReactNode;
  readonly insignia?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="dh-pulsable flex items-center gap-3 border-b border-borde px-4 py-3.5 last:border-0 hover:bg-relleno-2"
    >
      <span className="shrink-0 text-texto-3">{icono}</span>
      <span className="flex-1 text-[15px] font-medium">{etiqueta}</span>
      {insignia}
      <ChevronRight size={18} className="shrink-0 text-texto-3" />
    </Link>
  );
}

function TarjetaDato({
  titulo,
  valor,
  destacada = false,
  className,
}: {
  readonly titulo: string;
  readonly valor: string;
  readonly destacada?: boolean;
  readonly className?: string;
}) {
  return (
    <Tarjeta className={className}>
      <div className="flex flex-col gap-0.5 p-4">
        <span className="dh-seccion-titulo text-[11px]">{titulo}</span>
        <span
          className={`dh-numero font-titulo text-[24px] leading-tight font-bold ${
            destacada ? 'text-marca' : ''
          }`}
        >
          {valor}
        </span>
      </div>
    </Tarjeta>
  );
}

function FilaActividad({ registro }: { readonly registro: MachineRecord }) {
  return (
    <Link href={`/registros/${registro.id}`}>
      <div className="dh-pulsable flex items-start gap-3 border-b border-borde px-4 py-3 last:border-0 hover:bg-relleno-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-titulo text-[16px] font-bold">
              {registro.maquinaCodigo}
            </span>
            {registro.estado === 'anulado' && <Badge tono="error">Anulado</Badge>}
            {registro.propiedad === 'tercerizado' && (
              <Badge tono="info">Tercerizado</Badge>
            )}
          </div>
          <p className="truncate text-[14px] text-texto-2">{registro.clienteNombre}</p>
          <p className="truncate text-[13px] text-texto-3">
            {registro.operacionNombre} · {registro.materialNombre}
          </p>
          <p className="truncate text-[13px] text-texto-3">{registro.operadorNombre}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={`dh-numero text-[16px] font-bold ${
              registro.estado === 'anulado' ? 'text-texto-3 line-through' : ''
            }`}
          >
            {formatearHoras(registro.hours)}
          </span>
          <span className="text-[12px] text-texto-3">
            {formatearHora(registro.creadoEn)}
          </span>
          <span className="text-[12px] text-texto-3">{registro.turnoNombre}</span>
        </div>
      </div>
    </Link>
  );
}
