/**
 * Historial de cambios. Cada creación, edición o anulación deja quién, cuándo,
 * qué acción y el valor anterior frente al nuevo.
 */

import { formatearHoras, formatearHorometro } from './formato';
import type {
  AccionAuditoria,
  CambioAuditoria,
  EntradaAuditoria,
  MachineRecord,
  Maestro,
} from './tipos';

/** Campos del registro que se auditan, con su etiqueta y su presentación. */
const CAMPOS_AUDITADOS: readonly {
  campo: keyof MachineRecord;
  etiqueta: string;
  formato?: (valor: unknown) => string;
}[] = [
  { campo: 'fecha', etiqueta: 'Fecha' },
  { campo: 'clienteNombre', etiqueta: 'Cliente' },
  { campo: 'operacionNombre', etiqueta: 'Operación' },
  { campo: 'materialNombre', etiqueta: 'Material' },
  { campo: 'maquinaCodigo', etiqueta: 'Cargador' },
  { campo: 'propiedad', etiqueta: 'Propiedad' },
  { campo: 'proveedorNombre', etiqueta: 'Proveedor' },
  { campo: 'recibo', etiqueta: 'Recibo' },
  {
    campo: 'horometroInicial',
    etiqueta: 'Horómetro inicial',
    formato: (v) => formatearHorometro(Number(v)),
  },
  {
    campo: 'horometroFinal',
    etiqueta: 'Horómetro final',
    formato: (v) => formatearHorometro(Number(v)),
  },
  { campo: 'hours', etiqueta: 'Horas', formato: (v) => formatearHoras(Number(v)) },
  { campo: 'turnoNombre', etiqueta: 'Turno' },
  { campo: 'supervisorNombre', etiqueta: 'Supervisor' },
  { campo: 'operadorNombre', etiqueta: 'Operador de máquina' },
  { campo: 'observaciones', etiqueta: 'Observaciones' },
  { campo: 'estado', etiqueta: 'Estado' },
];

function comoTexto(
  valor: unknown,
  formato?: (valor: unknown) => string,
): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return formato ? formato(valor) : String(valor);
}

/** Diferencias entre dos versiones de un registro, listas para mostrar. */
export function compararRegistros(
  anterior: MachineRecord,
  nuevo: MachineRecord,
): readonly CambioAuditoria[] {
  const cambios: CambioAuditoria[] = [];
  for (const { campo, etiqueta, formato } of CAMPOS_AUDITADOS) {
    if (anterior[campo] === nuevo[campo]) continue;
    cambios.push({
      campo,
      etiqueta,
      anterior: comoTexto(anterior[campo], formato),
      nuevo: comoTexto(nuevo[campo], formato),
    });
  }
  return cambios;
}

/** Diferencias entre dos versiones de un maestro. */
export function compararMaestro(
  anterior: Record<string, unknown>,
  nuevo: Record<string, unknown>,
  etiquetas: Readonly<Record<string, string>>,
): readonly CambioAuditoria[] {
  const cambios: CambioAuditoria[] = [];
  for (const [campo, etiqueta] of Object.entries(etiquetas)) {
    if (anterior[campo] === nuevo[campo]) continue;
    cambios.push({
      campo,
      etiqueta,
      anterior: comoTexto(anterior[campo]),
      nuevo: comoTexto(nuevo[campo]),
    });
  }
  return cambios;
}

export interface DatosAuditoria {
  readonly id: string;
  readonly entidad: 'registro' | Maestro;
  readonly entidadId: string;
  readonly referencia: string;
  readonly accion: AccionAuditoria;
  readonly usuarioId: string;
  readonly usuarioNombre: string;
  readonly fechaHora: string;
  readonly cambios?: readonly CambioAuditoria[];
  readonly motivo?: string;
}

export function crearEntradaAuditoria(datos: DatosAuditoria): EntradaAuditoria {
  return {
    id: datos.id,
    entidad: datos.entidad,
    entidadId: datos.entidadId,
    referencia: datos.referencia,
    accion: datos.accion,
    usuarioId: datos.usuarioId,
    usuarioNombre: datos.usuarioNombre,
    fechaHora: datos.fechaHora,
    cambios: datos.cambios ?? [],
    motivo: datos.motivo ?? '',
  };
}

export const ETIQUETA_ACCION: Record<AccionAuditoria, string> = {
  crear: 'Creación',
  editar: 'Edición',
  anular: 'Anulación',
  activar: 'Activación',
  desactivar: 'Desactivación',
};

export const ETIQUETA_ENTIDAD: Record<'registro' | Maestro, string> = {
  registro: 'Registro',
  maquinas: 'Máquina',
  operadores: 'Operador',
  supervisores: 'Supervisor',
  clientes: 'Cliente',
  operaciones: 'Operación',
  materiales: 'Material',
  proveedores: 'Proveedor',
  turnos: 'Turno',
  usuarios: 'Usuario',
};
