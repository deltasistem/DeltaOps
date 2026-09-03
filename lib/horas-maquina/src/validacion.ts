/**
 * Validación del formulario de horas máquina y derivación de advertencias.
 *
 * Distinción deliberada: un ERROR impide guardar; una ADVERTENCIA informa,
 * exige confirmación cuando el dato es sospechoso y queda guardada con el
 * registro para poder auditarla después.
 */

import {
  evaluarConsistencia,
  recibosDuplicados,
  ultimoHorometro,
} from './calculos';
import { formatearHorometro, formatearNumero, normalizar } from './formato';
import type {
  Advertencia,
  EntradaRegistro,
  MachineRecord,
  Maquina,
} from './tipos';

export interface ErrorCampo {
  readonly campo: keyof EntradaRegistro;
  readonly mensaje: string;
}

const OBLIGATORIOS: readonly {
  campo: keyof EntradaRegistro;
  etiqueta: string;
}[] = [
  { campo: 'fecha', etiqueta: 'la fecha' },
  { campo: 'clienteId', etiqueta: 'el cliente' },
  { campo: 'operacionId', etiqueta: 'la operación' },
  { campo: 'materialId', etiqueta: 'el material' },
  { campo: 'maquinaId', etiqueta: 'el cargador' },
  { campo: 'turnoId', etiqueta: 'el turno' },
  { campo: 'supervisorId', etiqueta: 'el supervisor' },
  { campo: 'operadorId', etiqueta: 'el operador de máquina' },
];

export function validarRegistro(entrada: EntradaRegistro): readonly ErrorCampo[] {
  const errores: ErrorCampo[] = [];

  for (const { campo, etiqueta } of OBLIGATORIOS) {
    if (String(entrada[campo] ?? '').trim() === '') {
      errores.push({ campo, mensaje: `Seleccione ${etiqueta}.` });
    }
  }

  if (entrada.recibo.trim() === '') {
    errores.push({ campo: 'recibo', mensaje: 'Indique el número de recibo.' });
  }

  if (entrada.horometroInicial === null) {
    errores.push({
      campo: 'horometroInicial',
      mensaje: 'Indique el horómetro inicial.',
    });
  }
  if (entrada.horometroFinal === null) {
    errores.push({
      campo: 'horometroFinal',
      mensaje: 'Indique el horómetro final.',
    });
  }
  if (
    entrada.horometroInicial !== null &&
    entrada.horometroFinal !== null &&
    entrada.horometroFinal < entrada.horometroInicial
  ) {
    errores.push({
      campo: 'horometroFinal',
      mensaje: 'El horómetro final no puede ser menor al horómetro inicial.',
    });
  }

  return errores;
}

export interface ContextoAdvertencias {
  readonly registros: readonly MachineRecord[];
  readonly maquina: Maquina | undefined;
  /** Al editar, el registro que se está modificando no compite consigo mismo. */
  readonly excluirRegistroId?: string;
}

/**
 * Advertencias del registro: recibo repetido, salto de horómetro, cero horas y
 * máquina inactiva. Ninguna bloquea el guardado; las de cero horas y salto de
 * horómetro requieren confirmación explícita del usuario.
 */
export function derivarAdvertencias(
  entrada: EntradaRegistro,
  contexto: ContextoAdvertencias,
): readonly Advertencia[] {
  const advertencias: Advertencia[] = [];
  const { registros, maquina, excluirRegistroId } = contexto;

  const duplicados = recibosDuplicados(
    registros,
    entrada.recibo,
    excluirRegistroId,
  );
  if (duplicados.length > 0) {
    advertencias.push({
      clave: 'recibo-duplicado',
      mensaje: 'Este número de recibo ya aparece en otro registro.',
      detalle: duplicados
        .map((r) => `${r.maquinaCodigo} · ${r.fecha}`)
        .join(' · '),
    });
  }

  if (entrada.maquinaId !== '') {
    const ultimo = ultimoHorometro(
      registros,
      entrada.maquinaId,
      excluirRegistroId,
    );
    const consistencia = evaluarConsistencia(ultimo, entrada.horometroInicial);
    if (consistencia.tipo === 'diferencia') {
      advertencias.push({
        clave: 'horometro-diferencia',
        mensaje: 'Diferencia de horómetro',
        detalle:
          `Último registrado ${formatearHorometro(consistencia.ultimo)} · ` +
          `diferencia ${formatearNumero(Math.abs(consistencia.diferencia), 1)} h`,
      });
    }
  }

  if (
    entrada.horometroInicial !== null &&
    entrada.horometroFinal !== null &&
    entrada.horometroFinal === entrada.horometroInicial
  ) {
    advertencias.push({
      clave: 'cero-horas',
      mensaje: 'Este registro genera 0 horas. Verifique los horómetros.',
      detalle: `Horómetro ${formatearHorometro(entrada.horometroInicial)}`,
    });
  }

  if (maquina && maquina.estado !== 'activo') {
    advertencias.push({
      clave: 'maquina-inactiva',
      mensaje: 'La máquina seleccionada no está activa.',
      detalle: `${maquina.codigo} · estado ${maquina.estado}`,
    });
  }

  return advertencias;
}

/** Advertencias que obligan a confirmar antes de guardar. */
export function requiereConfirmacion(
  advertencias: readonly Advertencia[],
): boolean {
  return advertencias.some(
    (a) => a.clave === 'cero-horas' || a.clave === 'horometro-diferencia',
  );
}

/**
 * Evita materiales, clientes u operaciones repetidos por diferencias de
 * mayúsculas o tildes: "Carbón", "CARBON" y "carbon" son el mismo nombre.
 */
export function existeNombre(
  elementos: readonly { readonly id: string; readonly nombre: string }[],
  nombre: string,
  excluirId?: string,
): boolean {
  const clave = normalizar(nombre);
  return elementos.some((e) => e.id !== excluirId && normalizar(e.nombre) === clave);
}
