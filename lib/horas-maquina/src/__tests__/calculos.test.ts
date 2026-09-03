import { describe, expect, it } from 'vitest';

import {
  calcularHoras,
  evaluarConsistencia,
  filtrarRegistros,
  ordenarRegistros,
  recibosDuplicados,
  registrosVisibles,
  resumirDashboard,
  resumirDia,
  ultimoHorometro,
} from '../calculos';
import type { MachineRecord } from '../tipos';

function registro(parcial: Partial<MachineRecord>): MachineRecord {
  return {
    id: 'r1',
    fecha: '2026-09-03',
    clienteId: 'cli',
    clienteNombre: 'RIVERPORT',
    operacionId: 'ope',
    operacionNombre: 'Recogida',
    materialId: 'mat',
    materialNombre: 'CARBON',
    maquinaId: 'maq-c1',
    maquinaCodigo: 'C1',
    maquinaNombre: 'Cargador C1',
    maquinaNumeroInterno: 'INT-001',
    propiedad: 'propio',
    proveedorId: null,
    proveedorNombre: 'DELTA',
    recibo: '1949',
    horometroInicial: 8871.7,
    horometroFinal: 8879.2,
    hours: 7.5,
    turnoId: 'tur-dia',
    turnoNombre: 'Día',
    supervisorId: 'sup',
    supervisorNombre: 'REINALDO',
    operadorId: 'opr',
    operadorNombre: 'WILMER DE LA ROSA SANCHEZ',
    observaciones: '',
    estado: 'activo',
    advertencias: [],
    creadoPor: 'usr-supervisor',
    creadoPorNombre: 'Reinaldo Mendoza',
    creadoEn: '2026-09-03T14:30:00.000Z',
    actualizadoPor: null,
    actualizadoPorNombre: '',
    actualizadoEn: null,
    anuladoPor: null,
    anuladoPorNombre: '',
    anuladoEn: null,
    motivoAnulacion: '',
    ...parcial,
  };
}

describe('calcularHoras', () => {
  it('resta los horómetros y elimina el ruido del punto flotante', () => {
    expect(calcularHoras(8871.7, 8879.2)).toBe(7.5);
    expect(calcularHoras(650.3, 658.9)).toBe(8.6);
    expect(calcularHoras(504, 504)).toBe(0);
  });

  it('devuelve negativo cuando el final es menor, para que la validación lo detecte', () => {
    expect(calcularHoras(100, 90)).toBe(-10);
  });

  it('no calcula si falta un horómetro', () => {
    expect(calcularHoras(null, 100)).toBeNull();
    expect(calcularHoras(100, null)).toBeNull();
  });
});

describe('ultimoHorometro', () => {
  const registros = [
    registro({ id: 'a', fecha: '2026-09-01', horometroFinal: 8860.2 }),
    registro({ id: 'b', fecha: '2026-09-03', horometroFinal: 8879.2 }),
    registro({ id: 'c', fecha: '2026-09-02', horometroFinal: 8870.1 }),
  ];

  it('toma la lectura más reciente de la máquina', () => {
    expect(ultimoHorometro(registros, 'maq-c1')?.valor).toBe(8879.2);
  });

  it('ignora los registros anulados', () => {
    const conAnulado = [
      ...registros,
      registro({ id: 'd', fecha: '2026-09-04', horometroFinal: 9999, estado: 'anulado' }),
    ];
    expect(ultimoHorometro(conAnulado, 'maq-c1')?.valor).toBe(8879.2);
  });

  it('excluye el registro que se está editando', () => {
    expect(ultimoHorometro(registros, 'maq-c1', 'b')?.valor).toBe(8870.1);
  });

  it('no inventa referencia para una máquina sin historia', () => {
    expect(ultimoHorometro(registros, 'maq-nueva')).toBeNull();
  });
});

describe('evaluarConsistencia', () => {
  const ultimo = { valor: 8879.2, fecha: '2026-09-03', recibo: '1949', registroId: 'b' };

  it('marca consistente cuando el inicial coincide con el último final', () => {
    expect(evaluarConsistencia(ultimo, 8879.2)).toEqual({
      tipo: 'consistente',
      ultimo: 8879.2,
    });
  });

  it('reporta la diferencia cuando hay salto de horómetro', () => {
    expect(evaluarConsistencia(ultimo, 8887.2)).toEqual({
      tipo: 'diferencia',
      ultimo: 8879.2,
      diferencia: 8,
    });
  });

  it('no compara sin referencia previa', () => {
    expect(evaluarConsistencia(null, 100).tipo).toBe('sin-referencia');
  });
});

describe('recibosDuplicados', () => {
  const registros = [registro({ id: 'a', recibo: '1949' })];

  it('detecta el mismo recibo ignorando espacios y mayúsculas', () => {
    expect(recibosDuplicados(registros, ' 1949 ')).toHaveLength(1);
  });

  it('no se acusa a sí mismo al editar', () => {
    expect(recibosDuplicados(registros, '1949', 'a')).toHaveLength(0);
  });
});

describe('resumirDashboard', () => {
  const registros = [
    registro({ id: 'a', fecha: '2026-09-01', hours: 10, maquinaId: 'maq-c1', maquinaCodigo: 'C1' }),
    registro({ id: 'b', fecha: '2026-09-01', hours: 5, maquinaId: 'maq-c5', maquinaCodigo: 'C5' }),
    registro({ id: 'c', fecha: '2026-09-02', hours: 7.5, maquinaId: 'maq-c1', maquinaCodigo: 'C1' }),
    registro({ id: 'd', fecha: '2026-09-02', hours: 100, estado: 'anulado' }),
  ];

  it('excluye los registros anulados de los totales', () => {
    const resumen = resumirDashboard(registros);
    expect(resumen.totalHoras).toBe(22.5);
    expect(resumen.totalRegistros).toBe(3);
  });

  it('promedia sobre los días con operación', () => {
    const resumen = resumirDashboard(registros);
    expect(resumen.diasOperativos).toBe(2);
    expect(resumen.promedioHorasPorDia).toBe(11.25);
  });

  it('agrupa por cargador de mayor a menor', () => {
    const resumen = resumirDashboard(registros);
    expect(resumen.porCargador.map((p) => [p.etiqueta, p.valor])).toEqual([
      ['C1', 17.5],
      ['C5', 5],
    ]);
  });

  it('ordena la serie de fechas cronológicamente', () => {
    const resumen = resumirDashboard(registros);
    expect(resumen.porFecha.map((p) => p.clave)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('entrega ceros sin datos, en lugar de dividir por cero', () => {
    const resumen = resumirDashboard([]);
    expect(resumen.totalHoras).toBe(0);
    expect(resumen.promedioHorasPorDia).toBe(0);
    expect(resumen.diasOperativos).toBe(0);
  });
});

describe('resumirDia', () => {
  it('cuenta máquinas distintas separando propias y tercerizadas', () => {
    const resumen = resumirDia(
      [
        registro({ id: 'a', hours: 7.5 }),
        registro({ id: 'b', hours: 4, maquinaId: 'maq-c1' }),
        registro({
          id: 'c',
          hours: 8,
          maquinaId: 'maq-sem6',
          propiedad: 'tercerizado',
        }),
        registro({ id: 'd', fecha: '2026-09-02', hours: 50 }),
      ],
      '2026-09-03',
    );
    expect(resumen).toEqual({
      horas: 19.5,
      registros: 3,
      maquinas: 2,
      propias: 1,
      tercerizadas: 1,
    });
  });
});

describe('filtrarRegistros', () => {
  const registros = [
    registro({ id: 'a', fecha: '2026-08-20', operadorNombre: 'DIEGO RAMIREZ' }),
    registro({ id: 'b', fecha: '2026-09-03', propiedad: 'tercerizado', proveedorNombre: 'GPR' }),
    registro({ id: 'c', fecha: '2026-09-03', estado: 'anulado' }),
  ];

  it('combina mes y año', () => {
    expect(filtrarRegistros(registros, { anio: 2026, mes: 8 }).map((r) => r.id)).toEqual(['a']);
  });

  it('acota por rango de fechas', () => {
    expect(
      filtrarRegistros(registros, { desde: '2026-09-01', hasta: '2026-09-30' }).map((r) => r.id),
    ).toEqual(['b', 'c']);
  });

  it('busca sin distinguir tildes ni mayúsculas', () => {
    expect(filtrarRegistros(registros, { texto: 'diego ramirez' }).map((r) => r.id)).toEqual(['a']);
    expect(filtrarRegistros(registros, { texto: 'gpr' }).map((r) => r.id)).toEqual(['b']);
  });

  it('filtra por estado y propiedad', () => {
    expect(filtrarRegistros(registros, { estado: 'anulado' }).map((r) => r.id)).toEqual(['c']);
    expect(filtrarRegistros(registros, { propiedad: 'tercerizado' }).map((r) => r.id)).toEqual(['b']);
  });
});

describe('ordenarRegistros', () => {
  const registros = [
    registro({ id: 'a', hours: 5, maquinaCodigo: 'C5' }),
    registro({ id: 'b', hours: 12, maquinaCodigo: 'C1' }),
  ];

  it('ordena numéricamente por horas', () => {
    expect(ordenarRegistros(registros, 'hours', true).map((r) => r.id)).toEqual(['b', 'a']);
    expect(ordenarRegistros(registros, 'hours', false).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('ordena alfabéticamente por texto', () => {
    expect(ordenarRegistros(registros, 'maquinaCodigo', false).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('registrosVisibles', () => {
  const registros = [
    registro({ id: 'a', creadoPor: 'usr-captura' }),
    registro({ id: 'b', creadoPor: 'usr-supervisor' }),
  ];

  it('limita el rol CAPTURA a sus propios registros', () => {
    expect(registrosVisibles(registros, 'CAPTURA', 'usr-captura').map((r) => r.id)).toEqual(['a']);
  });

  it('deja ver toda la operación a los demás roles', () => {
    expect(registrosVisibles(registros, 'GERENCIA', 'usr-gerencia')).toHaveLength(2);
  });
});
