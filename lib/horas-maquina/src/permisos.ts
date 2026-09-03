/**
 * Roles y permisos. La interfaz oculta lo que el rol no puede hacer, pero cada
 * acción vuelve a verificar el permiso antes de ejecutarse.
 */

import type { Maestro, MachineRecord, Rol, Usuario } from './tipos';

export const PERMISOS = [
  'registros.crear',
  'registros.ver',
  'registros.editar',
  'registros.anular',
  'dashboard.ver',
  'maestros.ver',
  'maestros.editar',
  'usuarios.administrar',
  'auditoria.ver',
  'configuracion.ver',
] as const;

export type Permiso = (typeof PERMISOS)[number];

const MATRIZ: Record<Rol, readonly Permiso[]> = {
  ADMINISTRADOR: [...PERMISOS],
  SUPERVISOR: [
    'registros.crear',
    'registros.ver',
    'dashboard.ver',
    'maestros.ver',
    'configuracion.ver',
  ],
  CAPTURA: ['registros.crear', 'registros.ver', 'configuracion.ver'],
  GERENCIA: [
    'registros.ver',
    'dashboard.ver',
    'maestros.ver',
    'configuracion.ver',
  ],
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  ADMINISTRADOR: 'Control total de la operación y de los maestros',
  SUPERVISOR: 'Registra y consulta la operación del turno',
  CAPTURA: 'Registra horas y consulta sus propios registros',
  GERENCIA: 'Solo lectura: dashboard, registros y detalle',
};

/** Días dentro de los cuales un supervisor autorizado puede corregir. */
export const DIAS_EDICION_SUPERVISOR = 7;

export function permisosDe(usuario: Usuario): readonly Permiso[] {
  const base = MATRIZ[usuario.rol] ?? [];
  const extra = usuario.permisosExtra.filter((p): p is Permiso =>
    (PERMISOS as readonly string[]).includes(p),
  );
  return [...new Set([...base, ...extra])];
}

export function puede(usuario: Usuario, permiso: Permiso): boolean {
  return permisosDe(usuario).includes(permiso);
}

function diasDesde(fecha: string, hoy: string): number {
  const a = Date.parse(`${fecha}T00:00:00Z`);
  const b = Date.parse(`${hoy}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Un registro anulado ya no se edita. El administrador corrige cualquier
 * registro; el supervisor con permiso expreso solo los recientes.
 */
export function puedeEditarRegistro(
  usuario: Usuario,
  registro: MachineRecord,
  hoy: string,
): boolean {
  if (registro.estado === 'anulado') return false;
  if (!puede(usuario, 'registros.editar')) return false;
  if (usuario.rol === 'ADMINISTRADOR') return true;
  return diasDesde(registro.fecha, hoy) <= DIAS_EDICION_SUPERVISOR;
}

export function puedeAnularRegistro(
  usuario: Usuario,
  registro: MachineRecord,
): boolean {
  return registro.estado === 'activo' && puede(usuario, 'registros.anular');
}

export interface OpcionMas {
  readonly maestro: Maestro | 'configuracion' | 'auditoria' | 'alertas';
  readonly permiso: Permiso;
}

/** Opciones del menú MÁS con el permiso que las habilita. */
export const OPCIONES_MAS: readonly OpcionMas[] = [
  { maestro: 'maquinas', permiso: 'maestros.ver' },
  { maestro: 'operadores', permiso: 'maestros.ver' },
  { maestro: 'supervisores', permiso: 'maestros.ver' },
  { maestro: 'clientes', permiso: 'maestros.ver' },
  { maestro: 'operaciones', permiso: 'maestros.ver' },
  { maestro: 'materiales', permiso: 'maestros.ver' },
  { maestro: 'proveedores', permiso: 'maestros.ver' },
  { maestro: 'turnos', permiso: 'maestros.ver' },
  { maestro: 'usuarios', permiso: 'usuarios.administrar' },
  { maestro: 'alertas', permiso: 'registros.ver' },
  { maestro: 'configuracion', permiso: 'configuracion.ver' },
  { maestro: 'auditoria', permiso: 'auditoria.ver' },
];
