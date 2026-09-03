/**
 * Datos iniciales de DELTA LOGÍSTICA & EQUIPOS S.A.S.
 *
 * Reproducen la operación real: cliente RIVERPORT, cargadores propios y el
 * tercerizado de GPR, carbón, turnos día y noche. Los registros son
 * deterministas para que Dashboard, Registros y Alertas tengan siempre el mismo
 * punto de partida, incluida una anomalía de cada tipo que el módulo de alertas
 * debe detectar.
 */

import { redondear } from './calculos';
import type {
  BaseDatos,
  Cliente,
  MachineRecord,
  Maquina,
  Material,
  Operacion,
  Persona,
  Proveedor,
  Turno,
  Usuario,
} from './tipos';

const CREADO = '2026-08-01T05:00:00.000Z';

function base(id: string) {
  return {
    id,
    estado: 'activo' as const,
    observaciones: '',
    creadoEn: CREADO,
    actualizadoEn: CREADO,
  };
}

export const PROVEEDORES: readonly Proveedor[] = [
  {
    ...base('pro-gpr'),
    nombre: 'GPR',
    razonSocial: 'GPR MAQUINARIA S.A.S.',
    nit: '901.455.120-4',
    contacto: 'Álvaro Peñaloza',
    telefono: '+57 300 555 1180',
    correo: 'operaciones@gpr.com.co',
  },
  {
    ...base('pro-delta'),
    nombre: 'DELTA',
    razonSocial: 'DELTA LOGÍSTICA & EQUIPOS S.A.S.',
    nit: '900.310.884-1',
    contacto: 'Coordinación de equipos',
    telefono: '+57 605 370 4400',
    correo: 'equipos@deltalogistica.com.co',
  },
];

function maquinaPropia(
  id: string,
  codigo: string,
  nombre: string,
  numeroInterno: string,
  marca: string,
  modelo: string,
  serial: string,
): Maquina {
  return {
    ...base(id),
    codigo,
    nombre,
    numeroInterno,
    tipoMaquina: 'Cargador',
    marca,
    modelo,
    serial,
    propiedad: 'propio',
    proveedorId: 'pro-delta',
    propietario: 'DELTA',
  };
}

export const MAQUINAS: readonly Maquina[] = [
  maquinaPropia('maq-c1', 'C1', 'Cargador C1', 'INT-001', 'Caterpillar', '950 GC', 'CAT950GC-0141'),
  maquinaPropia('maq-c5', 'C5', 'Cargador C5', 'INT-005', 'Caterpillar', '950 H', 'CAT950H-0885'),
  maquinaPropia('maq-c7', 'C7', 'Cargador C7', 'INT-007', 'Komatsu', 'WA380', 'KOM380-2210'),
  maquinaPropia('maq-c11', 'C11', 'Cargador C11', 'INT-011', 'Caterpillar', '966 L', 'CAT966L-0463'),
  maquinaPropia('maq-950-01', '950-01', 'Cargador 950-01', 'INT-021', 'Caterpillar', '950 M', 'CAT950M-1107'),
  maquinaPropia('maq-950-03', '950-03', 'Cargador 950-03', 'INT-023', 'Caterpillar', '950 M', 'CAT950M-1129'),
  {
    ...base('maq-sem6'),
    codigo: 'SEM 6 GPR',
    nombre: 'Cargador SEM 6 GPR',
    numeroInterno: 'GPR-006',
    tipoMaquina: 'Cargador',
    marca: 'SEM',
    modelo: '655D',
    serial: 'SEM655D-0306',
    propiedad: 'tercerizado',
    proveedorId: 'pro-gpr',
    propietario: 'GPR',
  },
];

export const CLIENTES: readonly Cliente[] = [
  {
    ...base('cli-riverport'),
    nombre: 'RIVERPORT',
    nit: '900.628.114-2',
    razonSocial: 'RIVERPORT S.A.S.',
  },
];

const NOMBRES_OPERACIONES = [
  ['ope-recogida', 'Recogida', 'REC'],
  ['ope-cargue', 'Cargue', 'CAR'],
  ['ope-cargue-buque', 'Cargue de buque', 'CBQ'],
  ['ope-descargue', 'Descargue', 'DES'],
  ['ope-arrume', 'Arrume', 'ARR'],
  ['ope-desarrume', 'Desarrume', 'DSA'],
  ['ope-movimiento', 'Movimiento interno', 'MOV'],
  ['ope-alimentacion', 'Alimentación', 'ALI'],
  ['ope-limpieza', 'Limpieza', 'LIM'],
  ['ope-despacho', 'Despacho', 'DSP'],
  ['ope-otro', 'Otro', 'OTR'],
] as const;

export const OPERACIONES: readonly Operacion[] = NOMBRES_OPERACIONES.map(
  ([id, nombre, codigo]) => ({ ...base(id), nombre, codigo }),
);

const NOMBRES_MATERIALES = [
  ['mat-carbon', 'CARBON', 'Granel sólido'],
  ['mat-fertilizante', 'FERTILIZANTE', 'Granel sólido'],
  ['mat-urea', 'UREA', 'Fertilizante'],
  ['mat-kcl', 'KCL', 'Fertilizante'],
  ['mat-npk', 'NPK', 'Fertilizante'],
  ['mat-map', 'MAP', 'Fertilizante'],
  ['mat-dap', 'DAP', 'Fertilizante'],
  ['mat-dolomita', 'DOLOMITA', 'Mineral'],
  ['mat-silicato', 'SILICATO', 'Mineral'],
  ['mat-caliza', 'CALIZA', 'Mineral'],
] as const;

export const MATERIALES: readonly Material[] = NOMBRES_MATERIALES.map(
  ([id, nombre, categoria]) => ({ ...base(id), nombre, categoria }),
);

export const TURNOS: readonly Turno[] = [
  { ...base('tur-dia'), nombre: 'Día', horaInicio: '06:00', horaFin: '18:00' },
  { ...base('tur-noche'), nombre: 'Noche', horaInicio: '18:00', horaFin: '06:00' },
];

function persona(
  id: string,
  nombre: string,
  identificacion: string,
  empresa: string,
  telefono: string,
): Persona {
  return {
    ...base(id),
    nombre,
    identificacion,
    empresa,
    telefono,
    correo: '',
  };
}

export const SUPERVISORES: readonly Persona[] = [
  persona('sup-reinaldo', 'REINALDO', '72.114.508', 'DELTA', '+57 301 445 7712'),
  persona('sup-carlos', 'CARLOS BARRIOS', '8.745.221', 'DELTA', '+57 301 445 7713'),
];

export const OPERADORES: readonly Persona[] = [
  persona('opr-jhonys', 'JHONYS GARCIA', '1.082.445.771', 'DELTA', '+57 300 214 8891'),
  persona('opr-wilmer', 'WILMER DE LA ROSA SANCHEZ', '1.045.771.208', 'DELTA', '+57 300 214 8892'),
  persona('opr-jaiser', 'JAISER PEDROZO ACUÑA', '1.047.882.114', 'DELTA', '+57 300 214 8893'),
  persona('opr-randy', 'RANDY RODRIGUEZ', '1.129.554.302', 'DELTA', '+57 300 214 8894'),
  persona('opr-diego', 'DIEGO RAMIREZ', '72.884.115', 'DELTA', '+57 300 214 8895'),
  persona('opr-jose', 'JOSE MARTINEZ PEREZ', '8.552.117', 'DELTA', '+57 300 214 8896'),
  persona('opr-ignacio', 'IGNACIO TOVAR', '92.114.775', 'GPR', '+57 300 214 8897'),
  persona('opr-ramon', 'RAMON GARCIA', '1.082.117.554', 'GPR', '+57 300 214 8898'),
];

export const USUARIOS: readonly Usuario[] = [
  {
    ...base('usr-admin'),
    nombre: 'Marcela Ortiz',
    correo: 'marcela.ortiz@deltalogistica.com.co',
    rol: 'ADMINISTRADOR',
    permisosExtra: [],
  },
  {
    ...base('usr-supervisor'),
    nombre: 'Reinaldo Mendoza',
    correo: 'reinaldo.mendoza@deltalogistica.com.co',
    rol: 'SUPERVISOR',
    permisosExtra: ['registros.editar'],
  },
  {
    ...base('usr-captura'),
    nombre: 'Yeison Cárdenas',
    correo: 'yeison.cardenas@deltalogistica.com.co',
    rol: 'CAPTURA',
    permisosExtra: [],
  },
  {
    ...base('usr-gerencia'),
    nombre: 'Andrés Villalba',
    correo: 'andres.villalba@deltalogistica.com.co',
    rol: 'GERENCIA',
    permisosExtra: [],
  },
];

/** Generador determinista: la semilla siempre produce la misma operación. */
function secuencia(inicial: number): () => number {
  let estado = inicial;
  return () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return estado / 2147483648;
  };
}

function sumarDias(fecha: string, dias: number): string {
  const base = Date.parse(`${fecha}T12:00:00Z`) + dias * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

interface Plantilla {
  readonly maquina: Maquina;
  readonly operadorId: string;
  readonly operacionId: string;
}

const ROTACION: readonly Plantilla[] = [
  { maquina: MAQUINAS[0]!, operadorId: 'opr-wilmer', operacionId: 'ope-recogida' },
  { maquina: MAQUINAS[1]!, operadorId: 'opr-jhonys', operacionId: 'ope-cargue' },
  { maquina: MAQUINAS[2]!, operadorId: 'opr-jaiser', operacionId: 'ope-arrume' },
  { maquina: MAQUINAS[3]!, operadorId: 'opr-randy', operacionId: 'ope-cargue-buque' },
  { maquina: MAQUINAS[4]!, operadorId: 'opr-diego', operacionId: 'ope-descargue' },
  { maquina: MAQUINAS[5]!, operadorId: 'opr-jose', operacionId: 'ope-movimiento' },
  { maquina: MAQUINAS[6]!, operadorId: 'opr-ignacio', operacionId: 'ope-cargue-buque' },
];

const HOROMETRO_INICIAL: Record<string, number> = {
  'maq-c1': 8_795.4,
  'maq-c5': 4_688.2,
  'maq-c7': 611.5,
  'maq-c11': 8_805.1,
  'maq-950-01': 447.3,
  'maq-950-03': 486.6,
  'maq-sem6': 1_902.8,
};

/** Horómetro con el que arranca la jornada de hoy del cargador C1 (§67). */
const HOROMETRO_C1_HOY = 8_871.7;

/**
 * Construye el histórico de ejemplo: 18 jornadas anteriores a `hoy` más la
 * jornada de hoy, que arranca con el registro de referencia del cargador C1.
 */
export function generarRegistros(hoy: string): readonly MachineRecord[] {
  const azar = secuencia(20260903);
  const horometro = { ...HOROMETRO_INICIAL };
  const registros: MachineRecord[] = [];
  let recibo = 1_850;
  const DIAS = 18;

  for (let d = DIAS; d >= 1; d -= 1) {
    const fecha = sumarDias(hoy, -d);
    const cuantas = 4 + Math.floor(azar() * 3);
    const arranque = Math.floor(azar() * ROTACION.length);

    for (let i = 0; i < cuantas; i += 1) {
      const plantilla = ROTACION[(arranque + i) % ROTACION.length]!;
      const maquina = plantilla.maquina;
      const inicial = redondear(horometro[maquina.id]!, 1);
      const horas = redondear(5 + azar() * 7, 1);
      const final = redondear(inicial + horas, 1);
      horometro[maquina.id] = final;
      recibo += 1;

      const nocturno = i % 2 === 1;
      const material = azar() < 0.72 ? MATERIALES[0]! : MATERIALES[2]!;
      const supervisor = nocturno ? SUPERVISORES[1]! : SUPERVISORES[0]!;
      const hora = nocturno ? 'T23:40:00.000Z' : 'T14:30:00.000Z';

      registros.push({
        id: `reg-${fecha}-${maquina.id}`,
        fecha,
        clienteId: 'cli-riverport',
        clienteNombre: 'RIVERPORT',
        operacionId: plantilla.operacionId,
        operacionNombre:
          OPERACIONES.find((o) => o.id === plantilla.operacionId)?.nombre ?? '',
        materialId: material.id,
        materialNombre: material.nombre,
        maquinaId: maquina.id,
        maquinaCodigo: maquina.codigo,
        maquinaNombre: maquina.nombre,
        maquinaNumeroInterno: maquina.numeroInterno,
        propiedad: maquina.propiedad,
        proveedorId: maquina.proveedorId,
        proveedorNombre: maquina.propiedad === 'tercerizado' ? 'GPR' : 'DELTA',
        recibo: String(recibo),
        horometroInicial: inicial,
        horometroFinal: final,
        hours: redondear(final - inicial, 2),
        turnoId: nocturno ? 'tur-noche' : 'tur-dia',
        turnoNombre: nocturno ? 'Noche' : 'Día',
        supervisorId: supervisor.id,
        supervisorNombre: supervisor.nombre,
        operadorId: plantilla.operadorId,
        operadorNombre:
          OPERADORES.find((o) => o.id === plantilla.operadorId)?.nombre ?? '',
        observaciones: '',
        estado: 'activo',
        advertencias: [],
        creadoPor: nocturno ? 'usr-captura' : 'usr-supervisor',
        creadoPorNombre: nocturno ? 'Yeison Cárdenas' : 'Reinaldo Mendoza',
        creadoEn: `${fecha}${hora}`,
        actualizadoPor: null,
        actualizadoPorNombre: '',
        actualizadoEn: null,
        anuladoPor: null,
        anuladoPorNombre: '',
        anuladoEn: null,
        motivoAnulacion: '',
      });
    }
  }

  return [
    ...jornadaDeHoy(alinearC1(aplicarAnomalias(registros, hoy)), hoy),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}

/**
 * Desplaza la cadena de horómetros del C1 para que su última lectura previa
 * sea exactamente la del registro de referencia, y la continuidad se vea.
 */
function alinearC1(
  registros: readonly MachineRecord[],
): readonly MachineRecord[] {
  const delC1 = registros.filter((r) => r.maquinaId === 'maq-c1');
  const ultimo = delC1[delC1.length - 1];
  if (!ultimo) return registros;
  const ajuste = redondear(HOROMETRO_C1_HOY - ultimo.horometroFinal, 1);
  if (ajuste === 0) return registros;
  return registros.map((r) =>
    r.maquinaId === 'maq-c1'
      ? {
          ...r,
          horometroInicial: redondear(r.horometroInicial + ajuste, 1),
          horometroFinal: redondear(r.horometroFinal + ajuste, 1),
        }
      : r,
  );
}

/** Jornada de hoy, encabezada por el registro de referencia del C1 (§67). */
function jornadaDeHoy(
  registros: readonly MachineRecord[],
  hoy: string,
): readonly MachineRecord[] {
  const plantilla = (
    maquinaId: string,
    operadorId: string,
    operacionId: string,
    materialId: string,
    recibo: string,
    inicial: number,
    final: number,
    turnoId: 'tur-dia' | 'tur-noche',
    hora: string,
  ): MachineRecord => {
    const maquina = MAQUINAS.find((m) => m.id === maquinaId)!;
    const material = MATERIALES.find((m) => m.id === materialId)!;
    const supervisor = turnoId === 'tur-dia' ? SUPERVISORES[0]! : SUPERVISORES[1]!;
    return {
      id: `reg-${hoy}-${maquinaId}`,
      fecha: hoy,
      clienteId: 'cli-riverport',
      clienteNombre: 'RIVERPORT',
      operacionId,
      operacionNombre: OPERACIONES.find((o) => o.id === operacionId)?.nombre ?? '',
      materialId,
      materialNombre: material.nombre,
      maquinaId,
      maquinaCodigo: maquina.codigo,
      maquinaNombre: maquina.nombre,
      maquinaNumeroInterno: maquina.numeroInterno,
      propiedad: maquina.propiedad,
      proveedorId: maquina.proveedorId,
      proveedorNombre: maquina.propiedad === 'tercerizado' ? 'GPR' : 'DELTA',
      recibo,
      horometroInicial: inicial,
      horometroFinal: final,
      hours: redondear(final - inicial, 2),
      turnoId,
      turnoNombre: turnoId === 'tur-dia' ? 'Día' : 'Noche',
      supervisorId: supervisor.id,
      supervisorNombre: supervisor.nombre,
      operadorId,
      operadorNombre: OPERADORES.find((o) => o.id === operadorId)?.nombre ?? '',
      observaciones: '',
      estado: 'activo',
      advertencias: [],
      creadoPor: 'usr-supervisor',
      creadoPorNombre: 'Reinaldo Mendoza',
      creadoEn: `${hoy}T${hora}:00.000Z`,
      actualizadoPor: null,
      actualizadoPorNombre: '',
      actualizadoEn: null,
      anuladoPor: null,
      anuladoPorNombre: '',
      anuladoEn: null,
      motivoAnulacion: '',
    };
  };

  const ultimo950 =
    registros.filter((r) => r.maquinaId === 'maq-950-03').at(-1)?.horometroFinal ??
    500;
  const ultimoSem =
    registros.filter((r) => r.maquinaId === 'maq-sem6').at(-1)?.horometroFinal ??
    1_950;

  return [
    ...registros,
    plantilla(
      'maq-c1',
      'opr-wilmer',
      'ope-recogida',
      'mat-carbon',
      '1949',
      HOROMETRO_C1_HOY,
      redondear(HOROMETRO_C1_HOY + 7.5, 1),
      'tur-dia',
      '14:30',
    ),
    plantilla(
      'maq-950-03',
      'opr-diego',
      'ope-cargue-buque',
      'mat-carbon',
      '1950',
      ultimo950,
      redondear(ultimo950 + 9.8, 1),
      'tur-dia',
      '14:35',
    ),
    plantilla(
      'maq-sem6',
      'opr-ignacio',
      'ope-cargue-buque',
      'mat-urea',
      '1951',
      ultimoSem,
      redondear(ultimoSem + 11.1, 1),
      'tur-noche',
      '23:50',
    ),
  ];
}

/**
 * Introduce una anomalía de cada tipo sobre el histórico generado, para que
 * Alertas muestre casos reales en la primera apertura.
 */
function aplicarAnomalias(
  registros: readonly MachineRecord[],
  hoy: string,
): readonly MachineRecord[] {
  const copia = [...registros];
  const indice = (predicado: (r: MachineRecord) => boolean) =>
    copia.findIndex(predicado);

  const ceroHoras = indice((r) => r.fecha === sumarDias(hoy, -9));
  if (ceroHoras >= 0) {
    const r = copia[ceroHoras]!;
    copia[ceroHoras] = {
      ...r,
      horometroFinal: r.horometroInicial,
      hours: 0,
      observaciones: 'Equipo alistado sin operación efectiva.',
      advertencias: [
        {
          clave: 'cero-horas',
          mensaje: 'Este registro genera 0 horas. Verifique los horómetros.',
          detalle: `Horómetro ${r.horometroInicial}`,
        },
      ],
    };
  }

  // El salto solo se nota si la máquina ya tiene una lectura anterior.
  const salto = copia.findIndex(
    (r, i) =>
      r.estado === 'activo' &&
      r.fecha === sumarDias(hoy, -4) &&
      copia.slice(0, i).some((previo) => previo.maquinaId === r.maquinaId),
  );
  if (salto >= 0) {
    const r = copia[salto]!;
    copia[salto] = {
      ...r,
      horometroInicial: redondear(r.horometroInicial + 8, 1),
      horometroFinal: redondear(r.horometroFinal + 8, 1),
      advertencias: [
        {
          clave: 'horometro-diferencia',
          mensaje: 'Diferencia de horómetro',
          detalle: `Último registrado ${r.horometroInicial} · diferencia 8,0 h`,
        },
      ],
    };
  }

  const anulado = indice((r) => r.fecha === sumarDias(hoy, -6));
  if (anulado >= 0) {
    const r = copia[anulado]!;
    copia[anulado] = {
      ...r,
      estado: 'anulado',
      anuladoPor: 'usr-admin',
      anuladoPorNombre: 'Marcela Ortiz',
      anuladoEn: `${sumarDias(hoy, -5)}T13:10:00.000Z`,
      motivoAnulacion: 'Recibo cargado dos veces por cambio de turno.',
    };
  }

  const duplicado = indice((r) => r.fecha === sumarDias(hoy, -2));
  const original = indice((r) => r.fecha === sumarDias(hoy, -3));
  if (duplicado >= 0 && original >= 0) {
    copia[duplicado] = { ...copia[duplicado]!, recibo: copia[original]!.recibo };
  }

  return copia;
}

/** Base de datos inicial completa. */
export function crearSemilla(hoy: string): BaseDatos {
  return {
    version: 1,
    registros: generarRegistros(hoy),
    maquinas: MAQUINAS,
    operadores: OPERADORES,
    supervisores: SUPERVISORES,
    clientes: CLIENTES,
    operaciones: OPERACIONES,
    materiales: MATERIALES,
    proveedores: PROVEEDORES,
    turnos: TURNOS,
    usuarios: USUARIOS,
    auditoria: [],
    sesionUsuarioId: 'usr-admin',
  };
}
