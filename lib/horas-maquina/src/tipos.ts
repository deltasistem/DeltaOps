/**
 * Contrato de datos de DELTA — Control de Horas Máquina.
 *
 * `MachineRecord` es la única entidad transaccional del alcance: el formulario
 * la produce y Registros, Dashboard, Alertas y Auditoría la consumen. No existe
 * una segunda fuente de datos para reportes.
 */

/** Propiedad de la máquina frente a DELTA. */
export const PROPIEDADES = ['propio', 'tercerizado'] as const;
export type Propiedad = (typeof PROPIEDADES)[number];

/**
 * Estado de un maestro. `fuera-servicio` queda declarado para el crecimiento
 * hacia mantenimiento, pero en esta versión se comporta como no seleccionable.
 */
export const ESTADOS_MAESTRO = ['activo', 'inactivo', 'fuera-servicio'] as const;
export type EstadoMaestro = (typeof ESTADOS_MAESTRO)[number];

/** Los registros no se eliminan: se anulan. */
export const ESTADOS_REGISTRO = ['activo', 'anulado'] as const;
export type EstadoRegistro = (typeof ESTADOS_REGISTRO)[number];

export const ROLES = ['ADMINISTRADOR', 'SUPERVISOR', 'CAPTURA', 'GERENCIA'] as const;
export type Rol = (typeof ROLES)[number];

/** Colecciones administrables desde MÁS. */
export const MAESTROS = [
  'maquinas',
  'operadores',
  'supervisores',
  'clientes',
  'operaciones',
  'materiales',
  'proveedores',
  'turnos',
  'usuarios',
] as const;
export type Maestro = (typeof MAESTROS)[number];

interface Base {
  readonly id: string;
  readonly estado: EstadoMaestro;
  readonly observaciones: string;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export interface Maquina extends Base {
  readonly codigo: string;
  readonly nombre: string;
  readonly numeroInterno: string;
  readonly tipoMaquina: string;
  readonly marca: string;
  readonly modelo: string;
  readonly serial: string;
  readonly propiedad: Propiedad;
  /** Propietario cuando es propia; proveedor cuando es tercerizada. */
  readonly proveedorId: string | null;
  readonly propietario: string;
}

/** Operadores y supervisores comparten estructura y se administran por separado. */
export interface Persona extends Base {
  readonly nombre: string;
  readonly identificacion: string;
  readonly empresa: string;
  readonly telefono: string;
  readonly correo: string;
}

export interface Cliente extends Base {
  readonly nombre: string;
  readonly nit: string;
  readonly razonSocial: string;
}

export interface Operacion extends Base {
  readonly nombre: string;
  readonly codigo: string;
}

export interface Material extends Base {
  readonly nombre: string;
  readonly categoria: string;
}

export interface Proveedor extends Base {
  readonly nombre: string;
  readonly razonSocial: string;
  readonly nit: string;
  readonly contacto: string;
  readonly telefono: string;
  readonly correo: string;
}

export interface Turno extends Base {
  readonly nombre: string;
  readonly horaInicio: string;
  readonly horaFin: string;
}

export interface Usuario extends Base {
  readonly nombre: string;
  readonly correo: string;
  readonly rol: Rol;
  /** Permisos concedidos por autorización expresa, por encima del rol. */
  readonly permisosExtra: readonly string[];
}

/** Advertencia detectada al guardar y conservada con el registro. */
export type ClaveAdvertencia =
  | 'recibo-duplicado'
  | 'horometro-diferencia'
  | 'cero-horas'
  | 'maquina-inactiva';

export interface Advertencia {
  readonly clave: ClaveAdvertencia;
  readonly mensaje: string;
  readonly detalle: string;
}

/**
 * Registro de horas máquina. Los campos `*Nombre`/`*Codigo` son fotografías del
 * maestro al momento de guardar: editar el maestro no reescribe la historia.
 */
export interface MachineRecord {
  readonly id: string;
  /** Fecha de la operación en formato ISO corto (YYYY-MM-DD), zona America/Bogota. */
  readonly fecha: string;

  readonly clienteId: string;
  readonly clienteNombre: string;

  readonly operacionId: string;
  readonly operacionNombre: string;

  readonly materialId: string;
  readonly materialNombre: string;

  readonly maquinaId: string;
  readonly maquinaCodigo: string;
  readonly maquinaNombre: string;
  readonly maquinaNumeroInterno: string;

  readonly propiedad: Propiedad;
  readonly proveedorId: string | null;
  readonly proveedorNombre: string;

  readonly recibo: string;
  readonly horometroInicial: number;
  readonly horometroFinal: number;
  /** Horómetro final − horómetro inicial, redondeado a dos decimales. */
  readonly hours: number;

  readonly turnoId: string;
  readonly turnoNombre: string;

  readonly supervisorId: string;
  readonly supervisorNombre: string;

  readonly operadorId: string;
  readonly operadorNombre: string;

  readonly observaciones: string;

  readonly estado: EstadoRegistro;
  readonly advertencias: readonly Advertencia[];

  readonly creadoPor: string;
  readonly creadoPorNombre: string;
  readonly creadoEn: string;
  readonly actualizadoPor: string | null;
  readonly actualizadoPorNombre: string;
  readonly actualizadoEn: string | null;
  readonly anuladoPor: string | null;
  readonly anuladoPorNombre: string;
  readonly anuladoEn: string | null;
  readonly motivoAnulacion: string;
}

/** Datos que el formulario entrega; el resto lo deriva el dominio. */
export interface EntradaRegistro {
  readonly fecha: string;
  readonly clienteId: string;
  readonly operacionId: string;
  readonly materialId: string;
  readonly maquinaId: string;
  readonly recibo: string;
  readonly horometroInicial: number | null;
  readonly horometroFinal: number | null;
  readonly turnoId: string;
  readonly supervisorId: string;
  readonly operadorId: string;
  readonly observaciones: string;
}

export type AccionAuditoria =
  | 'crear'
  | 'editar'
  | 'anular'
  | 'activar'
  | 'desactivar';

export interface CambioAuditoria {
  readonly campo: string;
  readonly etiqueta: string;
  readonly anterior: string;
  readonly nuevo: string;
}

export interface EntradaAuditoria {
  readonly id: string;
  /** `registro` o el maestro afectado. */
  readonly entidad: 'registro' | Maestro;
  readonly entidadId: string;
  /** Identificador legible: recibo del registro, código de máquina, nombre. */
  readonly referencia: string;
  readonly accion: AccionAuditoria;
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly fechaHora: string;
  readonly cambios: readonly CambioAuditoria[];
  readonly motivo: string;
}

/** Estado completo persistido. */
export interface BaseDatos {
  readonly version: number;
  readonly registros: readonly MachineRecord[];
  readonly maquinas: readonly Maquina[];
  readonly operadores: readonly Persona[];
  readonly supervisores: readonly Persona[];
  readonly clientes: readonly Cliente[];
  readonly operaciones: readonly Operacion[];
  readonly materiales: readonly Material[];
  readonly proveedores: readonly Proveedor[];
  readonly turnos: readonly Turno[];
  readonly usuarios: readonly Usuario[];
  readonly auditoria: readonly EntradaAuditoria[];
  readonly sesionUsuarioId: string;
}

/**
 * Puerto de persistencia. La aplicación lee y escribe la base completa; una
 * implementación HTTP puede reemplazar a la local sin tocar las pantallas.
 */
export interface Almacen {
  cargar(): Promise<BaseDatos>;
  guardar(base: BaseDatos): Promise<void>;
  reiniciar(): Promise<BaseDatos>;
}
