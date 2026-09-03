import { describe, expect, it } from 'vitest';

import {
  formatearFecha,
  formatearFechaHora,
  formatearHoras,
  formatearHorometro,
  formatearNumero,
  hoyEnBogota,
  interpretarDecimal,
  normalizar,
  saludo,
} from '../formato';

describe('formato colombiano', () => {
  it('usa punto de miles y coma decimal', () => {
    expect(formatearNumero(1284.5)).toBe('1.284,50');
    expect(formatearHoras(7.5)).toBe('7,50 h');
    expect(formatearHoras(42.1)).toBe('42,10 h');
    expect(formatearHoras(1284.5)).toBe('1.284,50 h');
  });

  it('muestra los horómetros con un decimal', () => {
    expect(formatearHorometro(8879.2)).toBe('8.879,2 h');
    expect(formatearHorometro(504)).toBe('504,0 h');
    expect(formatearHorometro(8879.2, false)).toBe('8.879,2');
  });

  it('presenta las fechas en DD/MM/YYYY', () => {
    expect(formatearFecha('2026-09-03')).toBe('03/09/2026');
  });

  it('presenta los instantes en la zona de Bogotá', () => {
    expect(formatearFechaHora('2026-09-03T14:30:00.000Z')).toBe('03/09/2026 09:30');
  });
});

describe('hoyEnBogota', () => {
  it('usa la fecha de Bogotá y no la del reloj del equipo', () => {
    expect(hoyEnBogota(new Date('2026-09-04T02:00:00.000Z'))).toBe('2026-09-03');
    expect(hoyEnBogota(new Date('2026-09-03T05:00:00.000Z'))).toBe('2026-09-03');
  });
});

describe('saludo', () => {
  it('cambia según la hora de Bogotá', () => {
    expect(saludo(new Date('2026-09-03T13:00:00.000Z'))).toBe('Buenos días');
    expect(saludo(new Date('2026-09-03T20:00:00.000Z'))).toBe('Buenas tardes');
    expect(saludo(new Date('2026-09-04T01:00:00.000Z'))).toBe('Buenas noches');
  });
});

describe('interpretarDecimal', () => {
  it('acepta el punto decimal que se usa en campo', () => {
    expect(interpretarDecimal('8871.7')).toBe(8871.7);
    expect(interpretarDecimal('504')).toBe(504);
  });

  it('acepta también la coma decimal', () => {
    expect(interpretarDecimal('650,3')).toBe(650.3);
  });

  it('interpreta el formato con miles y coma decimal', () => {
    expect(interpretarDecimal('8.879,2')).toBe(8879.2);
  });

  it('rechaza lo que no es un número', () => {
    expect(interpretarDecimal('')).toBeNull();
    expect(interpretarDecimal('abc')).toBeNull();
    expect(interpretarDecimal('-5')).toBeNull();
  });
});

describe('normalizar', () => {
  it('iguala mayúsculas y tildes para evitar duplicados de maestros', () => {
    expect(normalizar('Carbón')).toBe(normalizar('CARBON'));
    expect(normalizar(' Jaiser Pedrozo Acuña ')).toBe('jaiser pedrozo acuna');
  });
});
