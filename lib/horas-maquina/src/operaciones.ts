/**
 * Transiciones sobre la base de datos. Son funciones puras: reciben el estado
 * actual y devuelven el siguiente, junto con la entrada de auditoría. Nada se
 * elimina físicamente: los registros se anulan y los maestros se desactivan.
 */

import { calcularHoras } from './calculos';
import { compararMaestro, compararRegistros, crearEntradaAuditoria } from './auditoria';
import { derivarAdvertencias } from './validacion';
import type {
  BaseDatos,
  EntradaAuditoria,
  EntradaRegistro,
  EstadoMaestro,
  MachineRecord,
  Maestro,
  Usuario,
} from './tipos';

export interface Contexto {
  readonly usuario: Usuario;
  /** Instante ISO de la operación. */
  readonly ahora: string;
  readonly nuevoId: () => string;
}

export type ElementoDe<M extends Maestro> = BaseDatos[M][number];

/** Campo de `MachineRecord` que referencia cada maestro. */
const REFERENCIA_EN_REGISTRO: Record<Maestro, keyof MachineRecord> = {
  maquinas: 'maquinaId',
  operadores: 'operadorId',
  supervisores: 'supervisorId',
  clientes: 'clienteId',
  operaciones: 'operacionId',
  materiales: 'materialId',
  proveedores: 'proveedorId',
  turnos: 'turnoId',
  usuarios: 'creadoPor',
};

/** Cuántos registros históricos dependen de un elemento del maestro. */
export function usosEnRegistros(
  base: BaseDatos,
  maestro: Maestro,
  id: string,
): number {
  const campo = REFERENCIA_EN_REGISTRO[maestro];
  return base.registros.filter((r) => r[campo] === id).length;
}

function buscar<T extends { readonly id: string }>(
  coleccion: readonly T[],
  id: string,
): T | undefined {
  return coleccion.find((e) => e.id === id);
}

/**
 * Construye el registro a partir de la entrada del formulario, fotografiando
 * los datos del maestro para que la historia no cambie si el maestro cambia.
 */
function componerRegistro(
  base: BaseDatos,
  entrada: EntradaRegistro,
  previo: MachineRecord | null,
  ctx: Contexto,
): MachineRecord {
  const maquina = buscar(base.maquinas, entrada.maquinaId);
  const proveedor = maquina?.proveedorId
    ? buscar(base.proveedores, maquina.proveedorId)
    : undefined;
  const cliente = buscar(base.clientes, entrada.clienteId);
  const operacion = buscar(base.operaciones, entrada.operacionId);
  const material = buscar(base.materiales, entrada.materialId);
  const turno = buscar(base.turnos, entrada.turnoId);
  const supervisor = buscar(base.supervisores, entrada.supervisorId);
  const operador = buscar(base.operadores, entrada.operadorId);

  const horas = calcularHoras(entrada.horometroInicial, entrada.horometroFinal);
  const advertencias = derivarAdvertencias(entrada, {
    registros: base.registros,
    maquina,
    excluirRegistroId: previo?.id,
  });

  return {
    id: previo?.id ?? ctx.nuevoId(),
    fecha: entrada.fecha,

    clienteId: entrada.clienteId,
    clienteNombre: cliente?.nombre ?? '',

    operacionId: entrada.operacionId,
    operacionNombre: operacion?.nombre ?? '',

    materialId: entrada.materialId,
    materialNombre: material?.nombre ?? '',

    maquinaId: entrada.maquinaId,
    maquinaCodigo: maquina?.codigo ?? '',
    maquinaNombre: maquina?.nombre ?? '',
    maquinaNumeroInterno: maquina?.numeroInterno ?? '',

    propiedad: maquina?.propiedad ?? 'propio',
    proveedorId: maquina?.proveedorId ?? null,
    proveedorNombre: proveedor?.nombre ?? (maquina?.propietario ?? ''),

    recibo: entrada.recibo.trim(),
    horometroInicial: entrada.horometroInicial ?? 0,
    horometroFinal: entrada.horometroFinal ?? 0,
    hours: horas ?? 0,

    turnoId: entrada.turnoId,
    turnoNombre: turno?.nombre ?? '',

    supervisorId: entrada.supervisorId,
    supervisorNombre: supervisor?.nombre ?? '',

    operadorId: entrada.operadorId,
    operadorNombre: operador?.nombre ?? '',

    observaciones: entrada.observaciones.trim(),

    estado: previo?.estado ?? 'activo',
    advertencias,

    creadoPor: previo?.creadoPor ?? ctx.usuario.id,
    creadoPorNombre: previo?.creadoPorNombre ?? ctx.usuario.nombre,
    creadoEn: previo?.creadoEn ?? ctx.ahora,
    actualizadoPor: previo ? ctx.usuario.id : null,
    actualizadoPorNombre: previo ? ctx.usuario.nombre : '',
    actualizadoEn: previo ? ctx.ahora : null,
    anuladoPor: previo?.anuladoPor ?? null,
    anuladoPorNombre: previo?.anuladoPorNombre ?? '',
    anuladoEn: previo?.anuladoEn ?? null,
    motivoAnulacion: previo?.motivoAnulacion ?? '',
  };
}

export interface ResultadoRegistro {
  readonly base: BaseDatos;
  readonly registro: MachineRecord;
  readonly auditoria: EntradaAuditoria;
}

function conAuditoria(base: BaseDatos, entrada: EntradaAuditoria): BaseDatos {
  return { ...base, auditoria: [entrada, ...base.auditoria] };
}

export function crearRegistro(
  base: BaseDatos,
  entrada: EntradaRegistro,
  ctx: Contexto,
): ResultadoRegistro {
  const registro = componerRegistro(base, entrada, null, ctx);
  const auditoria = crearEntradaAuditoria({
    id: ctx.nuevoId(),
    entidad: 'registro',
    entidadId: registro.id,
    referencia: `Recibo ${registro.recibo} · ${registro.maquinaCodigo}`,
    accion: 'crear',
    usuarioId: ctx.usuario.id,
    usuarioNombre: ctx.usuario.nombre,
    fechaHora: ctx.ahora,
    cambios: compararRegistros(
      { ...registro, hours: 0, horometroInicial: 0, horometroFinal: 0 },
      registro,
    ).filter((c) => c.nuevo !== '—'),
  });
  return {
    base: conAuditoria(
      { ...base, registros: [registro, ...base.registros] },
      auditoria,
    ),
    registro,
    auditoria,
  };
}

export function editarRegistro(
  base: BaseDatos,
  id: string,
  entrada: EntradaRegistro,
  ctx: Contexto,
): ResultadoRegistro {
  const previo = buscar(base.registros, id);
  if (!previo) throw new Error(`Registro inexistente: ${id}`);
  const registro = componerRegistro(base, entrada, previo, ctx);
  const auditoria = crearEntradaAuditoria({
    id: ctx.nuevoId(),
    entidad: 'registro',
    entidadId: registro.id,
    referencia: `Recibo ${registro.recibo} · ${registro.maquinaCodigo}`,
    accion: 'editar',
    usuarioId: ctx.usuario.id,
    usuarioNombre: ctx.usuario.nombre,
    fechaHora: ctx.ahora,
    cambios: compararRegistros(previo, registro),
  });
  return {
    base: conAuditoria(
      {
        ...base,
        registros: base.registros.map((r) => (r.id === id ? registro : r)),
      },
      auditoria,
    ),
    registro,
    auditoria,
  };
}

/**
 * Anular no elimina: marca el registro, guarda quién, cuándo y por qué, y lo
 * saca de los totales del Dashboard conservándolo visible para administración.
 */
export function anularRegistro(
  base: BaseDatos,
  id: string,
  motivo: string,
  ctx: Contexto,
): ResultadoRegistro {
  const previo = buscar(base.registros, id);
  if (!previo) throw new Error(`Registro inexistente: ${id}`);
  const registro: MachineRecord = {
    ...previo,
    estado: 'anulado',
    anuladoPor: ctx.usuario.id,
    anuladoPorNombre: ctx.usuario.nombre,
    anuladoEn: ctx.ahora,
    motivoAnulacion: motivo.trim(),
  };
  const auditoria = crearEntradaAuditoria({
    id: ctx.nuevoId(),
    entidad: 'registro',
    entidadId: registro.id,
    referencia: `Recibo ${registro.recibo} · ${registro.maquinaCodigo}`,
    accion: 'anular',
    usuarioId: ctx.usuario.id,
    usuarioNombre: ctx.usuario.nombre,
    fechaHora: ctx.ahora,
    cambios: compararRegistros(previo, registro),
    motivo: motivo.trim(),
  });
  return {
    base: conAuditoria(
      {
        ...base,
        registros: base.registros.map((r) => (r.id === id ? registro : r)),
      },
      auditoria,
    ),
    registro,
    auditoria,
  };
}

export interface ResultadoMaestro<M extends Maestro> {
  readonly base: BaseDatos;
  readonly elemento: ElementoDe<M>;
}

/**
 * Crea o actualiza un elemento de maestro. `datos` trae los campos propios del
 * maestro; el dominio completa identidad, estado y fechas.
 */
export function guardarMaestro<M extends Maestro>(
  base: BaseDatos,
  maestro: M,
  datos: Partial<ElementoDe<M>> & { readonly id?: string },
  etiquetas: Readonly<Record<string, string>>,
  ctx: Contexto,
): ResultadoMaestro<M> {
  const coleccion = base[maestro] as readonly ElementoDe<M>[];
  const previo = datos.id ? buscar(coleccion, datos.id) : undefined;

  const elemento = {
    ...(previo ?? {}),
    ...datos,
    id: previo?.id ?? datos.id ?? ctx.nuevoId(),
    estado: (datos.estado ?? previo?.estado ?? 'activo') as EstadoMaestro,
    observaciones: datos.observaciones ?? previo?.observaciones ?? '',
    creadoEn: previo?.creadoEn ?? ctx.ahora,
    actualizadoEn: ctx.ahora,
  } as ElementoDe<M>;

  const referencia = String(
    (elemento as { codigo?: string; nombre?: string }).codigo ??
      (elemento as { nombre?: string }).nombre ??
      elemento.id,
  );

  const auditoria = crearEntradaAuditoria({
    id: ctx.nuevoId(),
    entidad: maestro,
    entidadId: elemento.id,
    referencia,
    accion: previo ? 'editar' : 'crear',
    usuarioId: ctx.usuario.id,
    usuarioNombre: ctx.usuario.nombre,
    fechaHora: ctx.ahora,
    cambios: previo
      ? compararMaestro(
          previo as unknown as Record<string, unknown>,
          elemento as unknown as Record<string, unknown>,
          etiquetas,
        )
      : Object.entries(etiquetas)
          .map(([campo, etiqueta]) => ({
            campo,
            etiqueta,
            anterior: '—',
            nuevo: String(
              (elemento as unknown as Record<string, unknown>)[campo] ?? '',
            ),
          }))
          .filter((c) => c.nuevo !== ''),
  });

  const siguiente = previo
    ? coleccion.map((e) => (e.id === elemento.id ? elemento : e))
    : [...coleccion, elemento];

  return {
    base: conAuditoria({ ...base, [maestro]: siguiente } as BaseDatos, auditoria),
    elemento,
  };
}

/** Activa o desactiva un elemento sin perder su historia. */
export function cambiarEstadoMaestro<M extends Maestro>(
  base: BaseDatos,
  maestro: M,
  id: string,
  estado: EstadoMaestro,
  ctx: Contexto,
): ResultadoMaestro<M> {
  const coleccion = base[maestro] as readonly ElementoDe<M>[];
  const previo = buscar(coleccion, id);
  if (!previo) throw new Error(`Elemento inexistente en ${maestro}: ${id}`);
  const elemento = { ...previo, estado, actualizadoEn: ctx.ahora };
  const referencia = String(
    (elemento as { codigo?: string; nombre?: string }).codigo ??
      (elemento as { nombre?: string }).nombre ??
      id,
  );
  const auditoria = crearEntradaAuditoria({
    id: ctx.nuevoId(),
    entidad: maestro,
    entidadId: id,
    referencia,
    accion: estado === 'activo' ? 'activar' : 'desactivar',
    usuarioId: ctx.usuario.id,
    usuarioNombre: ctx.usuario.nombre,
    fechaHora: ctx.ahora,
    cambios: [
      {
        campo: 'estado',
        etiqueta: 'Estado',
        anterior: previo.estado,
        nuevo: estado,
      },
    ],
  });
  return {
    base: conAuditoria(
      {
        ...base,
        [maestro]: coleccion.map((e) => (e.id === id ? elemento : e)),
      } as BaseDatos,
      auditoria,
    ),
    elemento,
  };
}
