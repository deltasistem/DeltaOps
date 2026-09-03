/**
 * Estado de la aplicación. Un único proveedor sostiene la base de datos, el
 * usuario de la sesión y las acciones del dominio; toda pantalla lee de aquí,
 * así que Registros y Dashboard nunca se desincronizan del formulario.
 */

import {
  anularRegistro,
  cambiarEstadoMaestro,
  crearRegistro,
  editarRegistro,
  guardarMaestro,
  hoyEnBogota,
  permisosDe,
  puede,
  type BaseDatos,
  type ElementoDe,
  type EntradaRegistro,
  type EstadoMaestro,
  type MachineRecord,
  type Maestro,
  type Permiso,
  type Usuario,
} from '@workspace/horas-maquina';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { crearAlmacenLocal } from './almacen-local';

interface Acciones {
  crearRegistro(entrada: EntradaRegistro): Promise<MachineRecord>;
  editarRegistro(id: string, entrada: EntradaRegistro): Promise<MachineRecord>;
  anularRegistro(id: string, motivo: string): Promise<MachineRecord>;
  guardarMaestro<M extends Maestro>(
    maestro: M,
    datos: Partial<ElementoDe<M>> & { readonly id?: string },
    etiquetas: Readonly<Record<string, string>>,
  ): Promise<ElementoDe<M>>;
  cambiarEstadoMaestro<M extends Maestro>(
    maestro: M,
    id: string,
    estado: EstadoMaestro,
  ): Promise<void>;
  cambiarUsuario(id: string): Promise<void>;
  reiniciarDatos(): Promise<void>;
}

interface ValorContexto {
  readonly base: BaseDatos;
  readonly cargando: boolean;
  readonly usuario: Usuario;
  readonly permisos: readonly Permiso[];
  readonly hoy: string;
  readonly acciones: Acciones;
}

const Contexto = createContext<ValorContexto | null>(null);

export function useDatos(): ValorContexto {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useDatos requiere <ProveedorDatos>.');
  return valor;
}

/** Atajo para condicionar la interfaz al permiso del usuario en sesión. */
export function usePermiso(permiso: Permiso): boolean {
  const { usuario } = useDatos();
  return puede(usuario, permiso);
}

const almacen = crearAlmacenLocal();

export function ProveedorDatos({ children }: { readonly children: ReactNode }) {
  const [base, setBase] = useState<BaseDatos | null>(null);
  const [hoy, setHoy] = useState(() => hoyEnBogota());
  const contadorId = useRef(0);

  useEffect(() => {
    let vigente = true;
    void almacen.cargar().then((cargada) => {
      if (vigente) setBase(cargada);
    });
    return () => {
      vigente = false;
    };
  }, []);

  // La app puede quedar abierta toda la jornada: la fecha operativa se refresca.
  useEffect(() => {
    const intervalo = window.setInterval(() => setHoy(hoyEnBogota()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  const nuevoId = useCallback(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    contadorId.current += 1;
    return `id-${Date.now()}-${contadorId.current}`;
  }, []);

  const aplicar = useCallback(async (siguiente: BaseDatos) => {
    setBase(siguiente);
    await almacen.guardar(siguiente);
  }, []);

  const usuario = useMemo(() => {
    if (!base) return null;
    return (
      base.usuarios.find((u) => u.id === base.sesionUsuarioId) ??
      base.usuarios[0] ??
      null
    );
  }, [base]);

  const acciones = useMemo<Acciones>(() => {
    const contexto = () => {
      if (!base || !usuario) throw new Error('La base de datos aún no está lista.');
      return { usuario, ahora: new Date().toISOString(), nuevoId };
    };

    return {
      async crearRegistro(entrada) {
        const resultado = crearRegistro(base!, entrada, contexto());
        await aplicar(resultado.base);
        return resultado.registro;
      },
      async editarRegistro(id, entrada) {
        const resultado = editarRegistro(base!, id, entrada, contexto());
        await aplicar(resultado.base);
        return resultado.registro;
      },
      async anularRegistro(id, motivo) {
        const resultado = anularRegistro(base!, id, motivo, contexto());
        await aplicar(resultado.base);
        return resultado.registro;
      },
      async guardarMaestro(maestro, datos, etiquetas) {
        const resultado = guardarMaestro(base!, maestro, datos, etiquetas, contexto());
        await aplicar(resultado.base);
        return resultado.elemento;
      },
      async cambiarEstadoMaestro(maestro, id, estado) {
        const resultado = cambiarEstadoMaestro(base!, maestro, id, estado, contexto());
        await aplicar(resultado.base);
      },
      async cambiarUsuario(id) {
        await aplicar({ ...base!, sesionUsuarioId: id });
      },
      async reiniciarDatos() {
        setBase(await almacen.reiniciar());
      },
    };
  }, [aplicar, base, nuevoId, usuario]);

  const valor = useMemo<ValorContexto | null>(() => {
    if (!base || !usuario) return null;
    return {
      base,
      cargando: false,
      usuario,
      permisos: permisosDe(usuario),
      hoy,
      acciones,
    };
  }, [acciones, base, hoy, usuario]);

  if (!valor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo">
        <div className="flex flex-col items-center gap-3">
          <span className="font-titulo text-[22px] font-bold tracking-tight">DELTA</span>
          <span className="text-[13px] text-texto-3">Cargando la operación…</span>
        </div>
      </div>
    );
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
