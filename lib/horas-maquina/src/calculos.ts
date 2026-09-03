/**
 * Cálculos puros sobre `MachineRecord`: horas, horómetros, filtros y las
 * agregaciones que alimentan el Dashboard. Sin efectos ni dependencias.
 */

import { formatearFechaCorta, normalizar } from './formato';
import type { EstadoRegistro, MachineRecord, Propiedad, Rol } from './tipos';

export function redondear(valor: number, decimales = 2): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/** HORAS = HORÓMETRO FINAL − HORÓMETRO INICIAL. */
export function calcularHoras(
  inicial: number | null,
  final: number | null,
): number | null {
  if (inicial === null || final === null) return null;
  if (!Number.isFinite(inicial) || !Number.isFinite(final)) return null;
  return redondear(final - inicial, 2);
}

/** Orden operativo: lo más reciente primero (fecha y luego instante de captura). */
export function compararRecientes(a: MachineRecord, b: MachineRecord): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
  return a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0;
}

export interface UltimoHorometro {
  readonly valor: number;
  readonly fecha: string;
  readonly recibo: string;
  readonly registroId: string;
}

/**
 * Último horómetro final válido de una máquina. Se ignoran los anulados y,
 * al editar, el propio registro en curso.
 */
export function ultimoHorometro(
  registros: readonly MachineRecord[],
  maquinaId: string,
  excluirRegistroId?: string,
): UltimoHorometro | null {
  const candidatos = registros
    .filter(
      (r) =>
        r.maquinaId === maquinaId &&
        r.estado === 'activo' &&
        r.id !== excluirRegistroId,
    )
    .sort(compararRecientes);
  const ultimo = candidatos[0];
  if (!ultimo) return null;
  return {
    valor: ultimo.horometroFinal,
    fecha: ultimo.fecha,
    recibo: ultimo.recibo,
    registroId: ultimo.id,
  };
}

export type ConsistenciaHorometro =
  | { readonly tipo: 'sin-referencia' }
  | { readonly tipo: 'consistente'; readonly ultimo: number }
  | {
      readonly tipo: 'diferencia';
      readonly ultimo: number;
      readonly diferencia: number;
    };

/** Compara el horómetro inicial contra el último final registrado. */
export function evaluarConsistencia(
  ultimo: UltimoHorometro | null,
  inicial: number | null,
): ConsistenciaHorometro {
  if (!ultimo || inicial === null) return { tipo: 'sin-referencia' };
  const diferencia = redondear(inicial - ultimo.valor, 2);
  if (diferencia === 0) return { tipo: 'consistente', ultimo: ultimo.valor };
  return { tipo: 'diferencia', ultimo: ultimo.valor, diferencia };
}

/** Registros que comparten número de recibo, ignorando espacios y mayúsculas. */
export function recibosDuplicados(
  registros: readonly MachineRecord[],
  recibo: string,
  excluirRegistroId?: string,
): readonly MachineRecord[] {
  const clave = normalizar(recibo);
  if (clave === '') return [];
  return registros.filter(
    (r) => r.id !== excluirRegistroId && normalizar(r.recibo) === clave,
  );
}

export interface FiltroRegistros {
  readonly texto?: string;
  readonly anio?: number | null;
  readonly mes?: number | null;
  readonly desde?: string;
  readonly hasta?: string;
  readonly maquinaId?: string;
  readonly operadorId?: string;
  readonly supervisorId?: string;
  readonly clienteId?: string;
  readonly operacionId?: string;
  readonly materialId?: string;
  readonly propiedad?: Propiedad | '';
  readonly proveedorId?: string;
  readonly turnoId?: string;
  readonly estado?: EstadoRegistro | '';
  /** Restringe a los registros capturados por un usuario (rol CAPTURA). */
  readonly creadoPor?: string;
}

const CAMPOS_BUSQUEDA = [
  'maquinaCodigo',
  'maquinaNombre',
  'operadorNombre',
  'supervisorNombre',
  'clienteNombre',
  'recibo',
  'materialNombre',
  'operacionNombre',
  'proveedorNombre',
] as const satisfies readonly (keyof MachineRecord)[];

function coincideTexto(registro: MachineRecord, texto: string): boolean {
  const termino = normalizar(texto);
  if (termino === '') return true;
  return CAMPOS_BUSQUEDA.some((campo) =>
    normalizar(String(registro[campo] ?? '')).includes(termino),
  );
}

export function filtrarRegistros(
  registros: readonly MachineRecord[],
  filtro: FiltroRegistros,
): readonly MachineRecord[] {
  return registros.filter((r) => {
    if (filtro.estado && r.estado !== filtro.estado) return false;
    if (filtro.anio != null && Number(r.fecha.slice(0, 4)) !== filtro.anio)
      return false;
    if (filtro.mes != null && Number(r.fecha.slice(5, 7)) !== filtro.mes)
      return false;
    if (filtro.desde && r.fecha < filtro.desde) return false;
    if (filtro.hasta && r.fecha > filtro.hasta) return false;
    if (filtro.maquinaId && r.maquinaId !== filtro.maquinaId) return false;
    if (filtro.operadorId && r.operadorId !== filtro.operadorId) return false;
    if (filtro.supervisorId && r.supervisorId !== filtro.supervisorId)
      return false;
    if (filtro.clienteId && r.clienteId !== filtro.clienteId) return false;
    if (filtro.operacionId && r.operacionId !== filtro.operacionId) return false;
    if (filtro.materialId && r.materialId !== filtro.materialId) return false;
    if (filtro.propiedad && r.propiedad !== filtro.propiedad) return false;
    if (filtro.proveedorId && r.proveedorId !== filtro.proveedorId) return false;
    if (filtro.turnoId && r.turnoId !== filtro.turnoId) return false;
    if (filtro.creadoPor && r.creadoPor !== filtro.creadoPor) return false;
    if (filtro.texto && !coincideTexto(r, filtro.texto)) return false;
    return true;
  });
}

export interface PuntoSerie {
  readonly clave: string;
  readonly etiqueta: string;
  readonly valor: number;
}

export interface ResumenDashboard {
  readonly totalHoras: number;
  readonly promedioHorasPorDia: number;
  readonly diasOperativos: number;
  readonly totalRegistros: number;
  readonly porFecha: readonly PuntoSerie[];
  readonly porCargador: readonly PuntoSerie[];
  readonly porOperador: readonly PuntoSerie[];
  readonly porOperacion: readonly PuntoSerie[];
  readonly porPropiedad: readonly PuntoSerie[];
  readonly porTurno: readonly PuntoSerie[];
}

function agrupar(
  registros: readonly MachineRecord[],
  clave: (r: MachineRecord) => string,
  etiqueta: (r: MachineRecord) => string,
): PuntoSerie[] {
  const acumulado = new Map<string, PuntoSerie>();
  for (const r of registros) {
    const k = clave(r);
    const previo = acumulado.get(k);
    acumulado.set(k, {
      clave: k,
      etiqueta: etiqueta(r),
      valor: redondear((previo?.valor ?? 0) + r.hours, 2),
    });
  }
  return [...acumulado.values()];
}

const porValorDescendente = (a: PuntoSerie, b: PuntoSerie) => b.valor - a.valor;
const porClaveAscendente = (a: PuntoSerie, b: PuntoSerie) =>
  a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0;

/**
 * Agregaciones del Dashboard. Los registros anulados nunca llegan aquí: se
 * excluyen antes de agregar, para que los totales sean los horas-máquina reales.
 */
export function resumirDashboard(
  registros: readonly MachineRecord[],
): ResumenDashboard {
  const vigentes = registros.filter((r) => r.estado === 'activo');
  const totalHoras = redondear(
    vigentes.reduce((suma, r) => suma + r.hours, 0),
    2,
  );
  const dias = new Set(vigentes.map((r) => r.fecha));
  const diasOperativos = dias.size;

  return {
    totalHoras,
    diasOperativos,
    totalRegistros: vigentes.length,
    promedioHorasPorDia:
      diasOperativos === 0 ? 0 : redondear(totalHoras / diasOperativos, 2),
    porFecha: agrupar(
      vigentes,
      (r) => r.fecha,
      (r) => formatearFechaCorta(r.fecha),
    ).sort(porClaveAscendente),
    porCargador: agrupar(
      vigentes,
      (r) => r.maquinaId,
      (r) => r.maquinaCodigo,
    ).sort(porValorDescendente),
    porOperador: agrupar(
      vigentes,
      (r) => r.operadorId,
      (r) => r.operadorNombre,
    ).sort(porValorDescendente),
    porOperacion: agrupar(
      vigentes,
      (r) => r.operacionId,
      (r) => r.operacionNombre,
    ).sort(porValorDescendente),
    porPropiedad: agrupar(
      vigentes,
      (r) => r.propiedad,
      (r) => (r.propiedad === 'propio' ? 'Propio' : 'Tercerizado'),
    ).sort(porValorDescendente),
    porTurno: agrupar(
      vigentes,
      (r) => r.turnoId,
      (r) => r.turnoNombre,
    ).sort(porValorDescendente),
  };
}

export interface ResumenHoy {
  readonly horas: number;
  readonly registros: number;
  readonly maquinas: number;
  readonly propias: number;
  readonly tercerizadas: number;
}

/** Tarjetas de la pantalla Inicio para una fecha concreta. */
export function resumirDia(
  registros: readonly MachineRecord[],
  fecha: string,
): ResumenHoy {
  const dia = registros.filter((r) => r.estado === 'activo' && r.fecha === fecha);
  const maquinas = new Set(dia.map((r) => r.maquinaId));
  const propias = new Set(
    dia.filter((r) => r.propiedad === 'propio').map((r) => r.maquinaId),
  );
  const tercerizadas = new Set(
    dia.filter((r) => r.propiedad === 'tercerizado').map((r) => r.maquinaId),
  );
  return {
    horas: redondear(
      dia.reduce((suma, r) => suma + r.hours, 0),
      2,
    ),
    registros: dia.length,
    maquinas: maquinas.size,
    propias: propias.size,
    tercerizadas: tercerizadas.size,
  };
}

export type ColumnaOrden =
  | 'fecha'
  | 'clienteNombre'
  | 'operacionNombre'
  | 'materialNombre'
  | 'maquinaCodigo'
  | 'propiedad'
  | 'proveedorNombre'
  | 'recibo'
  | 'horometroInicial'
  | 'horometroFinal'
  | 'hours'
  | 'turnoNombre'
  | 'supervisorNombre'
  | 'operadorNombre'
  | 'estado'
  | 'creadoEn'
  | 'creadoPorNombre';

export function ordenarRegistros(
  registros: readonly MachineRecord[],
  columna: ColumnaOrden,
  descendente: boolean,
): readonly MachineRecord[] {
  const signo = descendente ? -1 : 1;
  return [...registros].sort((a, b) => {
    const va = a[columna];
    const vb = b[columna];
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * signo;
    }
    const sa = normalizar(String(va ?? ''));
    const sb = normalizar(String(vb ?? ''));
    if (sa === sb) return compararRecientes(a, b);
    return (sa < sb ? -1 : 1) * signo;
  });
}

/**
 * Registros que el usuario puede ver. CAPTURA solo consulta lo que capturó;
 * el resto de roles ve la operación completa.
 */
export function registrosVisibles(
  registros: readonly MachineRecord[],
  rol: Rol,
  usuarioId: string,
): readonly MachineRecord[] {
  if (rol !== 'CAPTURA') return registros;
  return registros.filter((r) => r.creadoPor === usuarioId);
}
