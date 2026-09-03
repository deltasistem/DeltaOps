/**
 * Mapa de navegación. La barra inferior de celular y el menú lateral de
 * escritorio se construyen desde aquí, filtrados por el permiso del rol.
 */

import type { Maestro, Permiso } from '@workspace/horas-maquina';

export interface Destino {
  readonly ruta: string;
  readonly etiqueta: string;
  readonly permiso: Permiso;
}

export const PRINCIPALES: readonly Destino[] = [
  { ruta: '/', etiqueta: 'Inicio', permiso: 'registros.ver' },
  { ruta: '/registrar', etiqueta: 'Registrar', permiso: 'registros.crear' },
  { ruta: '/registros', etiqueta: 'Registros', permiso: 'registros.ver' },
  { ruta: '/dashboard', etiqueta: 'Dashboard', permiso: 'dashboard.ver' },
];

export type SeccionMas =
  | Maestro
  | 'alertas'
  | 'auditoria'
  | 'configuracion';

export interface EntradaMas {
  readonly clave: SeccionMas;
  readonly ruta: string;
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly permiso: Permiso;
  readonly grupo: 'Operación' | 'Maestros' | 'Administración';
}

export const SECCIONES_MAS: readonly EntradaMas[] = [
  {
    clave: 'alertas',
    ruta: '/mas/alertas',
    etiqueta: 'Alertas',
    descripcion: 'Horómetros, recibos y registros por revisar',
    permiso: 'registros.ver',
    grupo: 'Operación',
  },
  {
    clave: 'maquinas',
    ruta: '/mas/maquinas',
    etiqueta: 'Máquinas / Cargadores',
    descripcion: 'Códigos, propiedad, proveedor y estado',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'operadores',
    ruta: '/mas/operadores',
    etiqueta: 'Operadores',
    descripcion: 'Operadores de máquina',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'supervisores',
    ruta: '/mas/supervisores',
    etiqueta: 'Supervisores',
    descripcion: 'Supervisores de la operación',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'clientes',
    ruta: '/mas/clientes',
    etiqueta: 'Clientes',
    descripcion: 'Clientes a los que se presta el servicio',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'operaciones',
    ruta: '/mas/operaciones',
    etiqueta: 'Operaciones',
    descripcion: 'Tipos de operación',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'materiales',
    ruta: '/mas/materiales',
    etiqueta: 'Materiales',
    descripcion: 'Materiales movilizados',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'proveedores',
    ruta: '/mas/proveedores',
    etiqueta: 'Proveedores',
    descripcion: 'Propietarios de máquinas tercerizadas',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'turnos',
    ruta: '/mas/turnos',
    etiqueta: 'Turnos',
    descripcion: 'Día, noche y sus horarios',
    permiso: 'maestros.ver',
    grupo: 'Maestros',
  },
  {
    clave: 'usuarios',
    ruta: '/mas/usuarios',
    etiqueta: 'Usuarios',
    descripcion: 'Roles y permisos de acceso',
    permiso: 'usuarios.administrar',
    grupo: 'Administración',
  },
  {
    clave: 'auditoria',
    ruta: '/mas/auditoria',
    etiqueta: 'Auditoría',
    descripcion: 'Historial de creaciones, ediciones y anulaciones',
    permiso: 'auditoria.ver',
    grupo: 'Administración',
  },
  {
    clave: 'configuracion',
    ruta: '/mas/configuracion',
    etiqueta: 'Configuración',
    descripcion: 'Apariencia, sesión y datos de demostración',
    permiso: 'configuracion.ver',
    grupo: 'Administración',
  },
];

export const GRUPOS_MAS = ['Operación', 'Maestros', 'Administración'] as const;

/** Los maestros son las secciones administrables con pantalla de lista. */
export const MAESTROS_CON_PANTALLA = SECCIONES_MAS.filter(
  (s) => s.grupo === 'Maestros' || s.clave === 'usuarios',
);
