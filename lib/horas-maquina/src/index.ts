/**
 * DELTA — Control de Horas Máquina · núcleo de dominio.
 *
 * Tipos, cálculos, validación, permisos, auditoría y transiciones de estado.
 * Sin React, sin red y sin almacenamiento: la aplicación aporta la persistencia
 * a través del puerto `Almacen`.
 */

export * from './tipos';
export * from './formato';
export * from './calculos';
export * from './validacion';
export * from './permisos';
export * from './auditoria';
export * from './operaciones';
export * from './alertas';
export * from './semillas';
