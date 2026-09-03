/**
 * Construcción de las listas de los selectores a partir de los maestros.
 *
 * Regla: se ofrecen los elementos activos y, además, el que ya está
 * seleccionado aunque se haya desactivado después. Así un registro histórico
 * se puede seguir editando sin que su máquina desaparezca de la lista.
 */

import type {
  BaseDatos,
  Cliente,
  EstadoMaestro,
  Material,
  Maquina,
  Operacion,
  Persona,
  Proveedor,
  Turno,
} from '@workspace/horas-maquina';

import type { Opcion } from '../ui/selector';

interface ConEstado {
  readonly id: string;
  readonly estado: EstadoMaestro;
}

function seleccionables<T extends ConEstado>(
  elementos: readonly T[],
  seleccionado: string,
): readonly T[] {
  return elementos.filter((e) => e.estado === 'activo' || e.id === seleccionado);
}

export const ETIQUETA_PROPIEDAD = {
  propio: 'Propio',
  tercerizado: 'Tercerizado',
} as const;

export function opcionesMaquinas(
  maquinas: readonly Maquina[],
  seleccionada = '',
): readonly Opcion[] {
  return seleccionables(maquinas, seleccionada).map((m) => ({
    id: m.id,
    etiqueta: m.codigo,
    detalle: [m.nombre, ETIQUETA_PROPIEDAD[m.propiedad]].filter(Boolean).join(' · '),
    inactiva: m.estado !== 'activo',
  }));
}

export function opcionesPersonas(
  personas: readonly Persona[],
  seleccionada = '',
): readonly Opcion[] {
  return seleccionables(personas, seleccionada).map((p) => ({
    id: p.id,
    etiqueta: p.nombre,
    detalle: [p.empresa, p.identificacion].filter(Boolean).join(' · '),
    inactiva: p.estado !== 'activo',
  }));
}

export function opcionesClientes(
  clientes: readonly Cliente[],
  seleccionado = '',
): readonly Opcion[] {
  return seleccionables(clientes, seleccionado).map((c) => ({
    id: c.id,
    etiqueta: c.nombre,
    detalle: c.razonSocial,
    inactiva: c.estado !== 'activo',
  }));
}

export function opcionesOperaciones(
  operaciones: readonly Operacion[],
  seleccionada = '',
): readonly Opcion[] {
  return seleccionables(operaciones, seleccionada).map((o) => ({
    id: o.id,
    etiqueta: o.nombre,
    detalle: o.codigo,
    inactiva: o.estado !== 'activo',
  }));
}

export function opcionesMateriales(
  materiales: readonly Material[],
  seleccionado = '',
): readonly Opcion[] {
  return seleccionables(materiales, seleccionado).map((m) => ({
    id: m.id,
    etiqueta: m.nombre,
    detalle: m.categoria,
    inactiva: m.estado !== 'activo',
  }));
}

export function opcionesTurnos(
  turnos: readonly Turno[],
  seleccionado = '',
): readonly Opcion[] {
  return seleccionables(turnos, seleccionado).map((t) => ({
    id: t.id,
    etiqueta: t.nombre,
    detalle:
      t.horaInicio && t.horaFin ? `${t.horaInicio} — ${t.horaFin}` : undefined,
    inactiva: t.estado !== 'activo',
  }));
}

export function opcionesProveedores(
  proveedores: readonly Proveedor[],
  seleccionado = '',
): readonly Opcion[] {
  return seleccionables(proveedores, seleccionado).map((p) => ({
    id: p.id,
    etiqueta: p.nombre,
    detalle: p.razonSocial,
    inactiva: p.estado !== 'activo',
  }));
}

/** Años con operación registrada, del más reciente al más antiguo. */
export function aniosConRegistros(base: BaseDatos): readonly number[] {
  const anios = new Set(base.registros.map((r) => Number(r.fecha.slice(0, 4))));
  return [...anios].sort((a, b) => b - a);
}
