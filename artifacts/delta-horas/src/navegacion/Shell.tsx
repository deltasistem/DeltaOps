/**
 * Armazón de la aplicación: barra inferior en celular —con REGISTRAR
 * destacado, porque es la acción principal— y menú lateral en escritorio.
 */

import {
  BarChart3,
  Bell,
  Ellipsis,
  Home,
  Moon,
  Plus,
  Sun,
  Table2,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Link, useLocation } from 'wouter';

import { derivarAlertas, contarAtencion, puede } from '@workspace/horas-maquina';

import { useDatos } from '../datos/contexto';
import { useTema } from '../datos/tema';
import { Badge } from '../ui/atomos';
import { cn } from '../ui/cn';
import { GRUPOS_MAS, PRINCIPALES, SECCIONES_MAS } from './rutas';

const ICONOS: Record<string, ComponentType<{ size?: number }>> = {
  '/': Home,
  '/registrar': Plus,
  '/registros': Table2,
  '/dashboard': BarChart3,
};

function activa(ubicacion: string, ruta: string): boolean {
  if (ruta === '/') return ubicacion === '/';
  return ubicacion === ruta || ubicacion.startsWith(`${ruta}/`);
}

export function Shell({ children }: { readonly children: ReactNode }) {
  const { base, usuario } = useDatos();
  const { oscuro, cambiar, tema } = useTema();
  const [ubicacion] = useLocation();

  const destinos = PRINCIPALES.filter((d) => puede(usuario, d.permiso));
  const secciones = SECCIONES_MAS.filter((s) => puede(usuario, s.permiso));
  const pendientes = contarAtencion(derivarAlertas(base.registros));

  const alternarTema = () => cambiar(oscuro ? 'claro' : 'oscuro');

  return (
    <div className="min-h-screen bg-fondo text-texto">
      {/* Menú lateral: solo en escritorio, donde hay espacio para aprovecharlo. */}
      <aside className="fixed top-0 bottom-0 left-0 z-40 hidden w-[264px] flex-col border-r border-borde bg-superficie lg:flex">
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--dh-rojo)] font-titulo text-[18px] font-bold text-white">
            Δ
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-titulo text-[18px] font-bold tracking-tight">DELTA</span>
            <span className="text-[11px] tracking-wide text-texto-3 uppercase">
              Control de Horas Máquina
            </span>
          </span>
        </div>

        <nav className="dh-scroll flex-1 overflow-y-auto px-3 pb-4">
          <ul className="flex flex-col gap-0.5">
            {destinos.map((destino) => {
              const Icono = ICONOS[destino.ruta] ?? Home;
              return (
                <li key={destino.ruta}>
                  <Link
                    href={destino.ruta}
                    className={cn(
                      'flex items-center gap-3 rounded-control px-3 py-2.5 text-[15px] font-medium transition-colors',
                      activa(ubicacion, destino.ruta)
                        ? 'bg-[var(--dh-rojo)] text-white'
                        : 'text-texto-2 hover:bg-relleno-2 hover:text-texto',
                    )}
                  >
                    <Icono size={18} />
                    {destino.etiqueta}
                  </Link>
                </li>
              );
            })}
          </ul>

          {GRUPOS_MAS.map((grupo) => {
            const delGrupo = secciones.filter((s) => s.grupo === grupo);
            if (delGrupo.length === 0) return null;
            return (
              <div key={grupo} className="mt-5">
                <p className="dh-seccion-titulo px-3 pb-1.5">{grupo}</p>
                <ul className="flex flex-col gap-0.5">
                  {delGrupo.map((seccion) => (
                    <li key={seccion.clave}>
                      <Link
                        href={seccion.ruta}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-control px-3 py-2 text-[14px] transition-colors',
                          activa(ubicacion, seccion.ruta)
                            ? 'bg-relleno font-semibold text-texto'
                            : 'text-texto-2 hover:bg-relleno-2 hover:text-texto',
                        )}
                      >
                        <span className="truncate">{seccion.etiqueta}</span>
                        {seccion.clave === 'alertas' && pendientes > 0 && (
                          <Badge tono="aviso">{pendientes}</Badge>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-borde p-3">
          <div className="flex items-center gap-3 rounded-control px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-relleno text-[13px] font-bold">
              {usuario.nombre
                .split(' ')
                .slice(0, 2)
                .map((parte) => parte[0])
                .join('')}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[14px] font-semibold">
                {usuario.nombre}
              </span>
              <span className="block truncate text-[11px] tracking-wide text-texto-3">
                {usuario.rol}
              </span>
            </span>
            <button
              type="button"
              onClick={alternarTema}
              aria-label={`Tema ${tema}`}
              title="Cambiar tema"
              className="dh-pulsable flex h-9 w-9 items-center justify-center rounded-full bg-relleno-2 text-texto-2"
            >
              {oscuro ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <main className="mx-auto w-full max-w-[1180px] pb-[calc(var(--dh-nav-alto)+34px)] lg:pb-10">
          {children}
        </main>
      </div>

      {/* Barra inferior: alcance del pulgar, con la acción principal al centro. */}
      <nav className="dh-translucido dh-seguro-abajo fixed right-0 bottom-0 left-0 z-40 border-t border-borde lg:hidden">
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {destinos.map((destino) => {
            const Icono = ICONOS[destino.ruta] ?? Home;
            const seleccionada = activa(ubicacion, destino.ruta);
            const principal = destino.ruta === '/registrar';

            if (principal) {
              return (
                <li key={destino.ruta} className="flex w-1/5 justify-center">
                  <Link
                    href={destino.ruta}
                    aria-label="Registrar horas máquina"
                    className="dh-pulsable -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--dh-rojo)] text-white shadow-[0_8px_24px_rgba(210,0,43,0.4)]"
                  >
                    <Plus size={26} strokeWidth={2.5} />
                  </Link>
                </li>
              );
            }

            return (
              <li key={destino.ruta} className="w-1/5">
                <Link
                  href={destino.ruta}
                  className={cn(
                    'flex h-[var(--dh-nav-alto)] flex-col items-center justify-center gap-0.5',
                    seleccionada ? 'text-marca' : 'text-texto-3',
                  )}
                >
                  <Icono size={22} />
                  <span className="text-[10px] font-semibold tracking-wide">
                    {destino.etiqueta.toUpperCase()}
                  </span>
                </Link>
              </li>
            );
          })}

          <li className="w-1/5">
            <Link
              href="/mas"
              className={cn(
                'relative flex h-[var(--dh-nav-alto)] flex-col items-center justify-center gap-0.5',
                activa(ubicacion, '/mas') ? 'text-marca' : 'text-texto-3',
              )}
            >
              {pendientes > 0 ? <Bell size={22} /> : <Ellipsis size={22} />}
              {pendientes > 0 && (
                <span className="absolute top-1.5 right-[22%] h-2 w-2 rounded-full bg-[var(--dh-rojo)]" />
              )}
              <span className="text-[10px] font-semibold tracking-wide">MÁS</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
