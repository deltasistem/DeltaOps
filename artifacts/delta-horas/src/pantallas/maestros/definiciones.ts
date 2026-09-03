/**
 * Declaración de los maestros administrables. Los nueve comparten pantalla:
 * lo único que cambia son sus campos, así que se describen aquí en lugar de
 * repetir nueve veces la misma lista con formulario.
 */

import { ROLES, type BaseDatos, type Maestro } from '@workspace/horas-maquina';

import { opcionesProveedores } from '../../datos/opciones';
import type { Opcion } from '../../ui/selector';

export type TipoCampo =
  | 'texto'
  | 'parrafo'
  | 'seleccion'
  | 'hora'
  | 'correo'
  | 'telefono'
  | 'permisos';

export interface CampoMaestro {
  readonly clave: string;
  readonly etiqueta: string;
  readonly tipo: TipoCampo;
  readonly requerido?: boolean;
  readonly ayuda?: string;
  readonly placeholder?: string;
  readonly opciones?: (base: BaseDatos, valorActual: string) => readonly Opcion[];
  /** Solo se muestra cuando la condición se cumple (p. ej. proveedor). */
  readonly visibleSi?: (valores: Record<string, unknown>) => boolean;
}

export interface DefinicionMaestro {
  readonly maestro: Maestro;
  readonly titulo: string;
  readonly singular: string;
  readonly textoAgregar: string;
  /** Campo que identifica al elemento en la lista. */
  readonly campoTitulo: string;
  readonly campoDetalle?: string;
  readonly campos: readonly CampoMaestro[];
  /** Evita duplicados por diferencias de mayúsculas o tildes. */
  readonly claveUnica?: string;
  readonly nota?: string;
}

const OBSERVACIONES: CampoMaestro = {
  clave: 'observaciones',
  etiqueta: 'Observaciones',
  tipo: 'parrafo',
};

const CAMPOS_PERSONA: readonly CampoMaestro[] = [
  { clave: 'nombre', etiqueta: 'Nombre completo', tipo: 'texto', requerido: true },
  { clave: 'identificacion', etiqueta: 'Identificación', tipo: 'texto' },
  { clave: 'empresa', etiqueta: 'Empresa', tipo: 'texto' },
  { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
  { clave: 'correo', etiqueta: 'Correo', tipo: 'correo' },
  OBSERVACIONES,
];

export const DEFINICIONES: Readonly<Record<Maestro, DefinicionMaestro>> = {
  maquinas: {
    maestro: 'maquinas',
    titulo: 'Máquinas / Cargadores',
    singular: 'máquina',
    textoAgregar: '+ AGREGAR MÁQUINA',
    campoTitulo: 'codigo',
    campoDetalle: 'nombre',
    claveUnica: 'codigo',
    nota: 'La propiedad y el proveedor se copian al registro para no volver a preguntarlos.',
    campos: [
      {
        clave: 'codigo',
        etiqueta: 'Código',
        tipo: 'texto',
        requerido: true,
        placeholder: 'Ejemplo: C1, 950-03, SEM 6 GPR',
      },
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'numeroInterno', etiqueta: 'Número interno', tipo: 'texto' },
      {
        clave: 'tipoMaquina',
        etiqueta: 'Tipo de máquina',
        tipo: 'texto',
        placeholder: 'Ejemplo: Cargador',
      },
      { clave: 'marca', etiqueta: 'Marca', tipo: 'texto' },
      { clave: 'modelo', etiqueta: 'Modelo', tipo: 'texto' },
      { clave: 'serial', etiqueta: 'Serial', tipo: 'texto' },
      {
        clave: 'propiedad',
        etiqueta: 'Propiedad',
        tipo: 'seleccion',
        requerido: true,
        opciones: () => [
          { id: 'propio', etiqueta: 'Propio' },
          { id: 'tercerizado', etiqueta: 'Tercerizado' },
        ],
      },
      {
        clave: 'proveedorId',
        etiqueta: 'Proveedor / propietario',
        tipo: 'seleccion',
        ayuda: 'DELTA para las máquinas propias; el proveedor para las tercerizadas.',
        opciones: (base, actual) => opcionesProveedores(base.proveedores, actual),
      },
      OBSERVACIONES,
    ],
  },

  operadores: {
    maestro: 'operadores',
    titulo: 'Operadores',
    singular: 'operador',
    textoAgregar: '+ AGREGAR OPERADOR',
    campoTitulo: 'nombre',
    campoDetalle: 'empresa',
    claveUnica: 'nombre',
    campos: CAMPOS_PERSONA,
  },

  supervisores: {
    maestro: 'supervisores',
    titulo: 'Supervisores',
    singular: 'supervisor',
    textoAgregar: '+ AGREGAR SUPERVISOR',
    campoTitulo: 'nombre',
    campoDetalle: 'empresa',
    claveUnica: 'nombre',
    campos: CAMPOS_PERSONA,
  },

  clientes: {
    maestro: 'clientes',
    titulo: 'Clientes',
    singular: 'cliente',
    textoAgregar: '+ AGREGAR CLIENTE',
    campoTitulo: 'nombre',
    campoDetalle: 'razonSocial',
    claveUnica: 'nombre',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'nit', etiqueta: 'NIT', tipo: 'texto' },
      { clave: 'razonSocial', etiqueta: 'Razón social', tipo: 'texto' },
      OBSERVACIONES,
    ],
  },

  operaciones: {
    maestro: 'operaciones',
    titulo: 'Operaciones',
    singular: 'operación',
    textoAgregar: '+ AGREGAR OPERACIÓN',
    campoTitulo: 'nombre',
    campoDetalle: 'codigo',
    claveUnica: 'nombre',
    campos: [
      {
        clave: 'nombre',
        etiqueta: 'Nombre',
        tipo: 'texto',
        requerido: true,
        placeholder: 'Ejemplo: Cargue de buque',
      },
      { clave: 'codigo', etiqueta: 'Código', tipo: 'texto', ayuda: 'Opcional.' },
      OBSERVACIONES,
    ],
  },

  materiales: {
    maestro: 'materiales',
    titulo: 'Materiales',
    singular: 'material',
    textoAgregar: '+ AGREGAR MATERIAL',
    campoTitulo: 'nombre',
    campoDetalle: 'categoria',
    claveUnica: 'nombre',
    nota: 'No se admiten nombres repetidos por diferencias de mayúsculas o tildes.',
    campos: [
      {
        clave: 'nombre',
        etiqueta: 'Nombre',
        tipo: 'texto',
        requerido: true,
        placeholder: 'Ejemplo: CARBON',
      },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'texto', ayuda: 'Opcional.' },
      OBSERVACIONES,
    ],
  },

  proveedores: {
    maestro: 'proveedores',
    titulo: 'Proveedores',
    singular: 'proveedor',
    textoAgregar: '+ AGREGAR PROVEEDOR',
    campoTitulo: 'nombre',
    campoDetalle: 'razonSocial',
    claveUnica: 'nombre',
    nota: 'Los proveedores se relacionan con las máquinas tercerizadas.',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'razonSocial', etiqueta: 'Razón social', tipo: 'texto' },
      { clave: 'nit', etiqueta: 'NIT', tipo: 'texto' },
      { clave: 'contacto', etiqueta: 'Contacto', tipo: 'texto' },
      { clave: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono' },
      { clave: 'correo', etiqueta: 'Correo', tipo: 'correo' },
      OBSERVACIONES,
    ],
  },

  turnos: {
    maestro: 'turnos',
    titulo: 'Turnos',
    singular: 'turno',
    textoAgregar: '+ AGREGAR TURNO',
    campoTitulo: 'nombre',
    claveUnica: 'nombre',
    campos: [
      {
        clave: 'nombre',
        etiqueta: 'Nombre',
        tipo: 'texto',
        requerido: true,
        placeholder: 'Ejemplo: Día',
      },
      { clave: 'horaInicio', etiqueta: 'Hora inicio', tipo: 'hora', ayuda: 'Opcional.' },
      { clave: 'horaFin', etiqueta: 'Hora fin', tipo: 'hora', ayuda: 'Opcional.' },
      OBSERVACIONES,
    ],
  },

  usuarios: {
    maestro: 'usuarios',
    titulo: 'Usuarios',
    singular: 'usuario',
    textoAgregar: '+ AGREGAR USUARIO',
    campoTitulo: 'nombre',
    campoDetalle: 'correo',
    claveUnica: 'correo',
    nota: 'El rol determina qué puede ver y hacer cada persona en la aplicación.',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true },
      { clave: 'correo', etiqueta: 'Correo', tipo: 'correo', requerido: true },
      {
        clave: 'rol',
        etiqueta: 'Rol',
        tipo: 'seleccion',
        requerido: true,
        opciones: () => ROLES.map((rol) => ({ id: rol, etiqueta: rol })),
      },
      {
        clave: 'permisosExtra',
        etiqueta: 'Autorizaciones adicionales',
        tipo: 'permisos',
        ayuda: 'Permisos concedidos por encima del rol.',
      },
      OBSERVACIONES,
    ],
  },
};

/** Permisos que se pueden conceder de forma expresa a un usuario. */
export const PERMISOS_CONCEDIBLES: readonly {
  readonly clave: string;
  readonly etiqueta: string;
  readonly detalle: string;
}[] = [
  {
    clave: 'registros.editar',
    etiqueta: 'Editar registros',
    detalle: 'Los supervisores solo pueden corregir los registros recientes.',
  },
  {
    clave: 'registros.anular',
    etiqueta: 'Anular registros',
    detalle: 'Marcar registros como anulados indicando el motivo.',
  },
  {
    clave: 'maestros.editar',
    etiqueta: 'Administrar maestros',
    detalle: 'Crear y editar máquinas, operadores, clientes y demás listas.',
  },
  {
    clave: 'dashboard.ver',
    etiqueta: 'Ver dashboard',
    detalle: 'Consultar los indicadores de horas máquina.',
  },
];

export function esMaestro(valor: string): valor is Maestro {
  return valor in DEFINICIONES;
}
