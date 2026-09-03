import { describe, expect, it } from 'vitest';

import { crearSemilla } from '../semillas';
import {
  derivarAdvertencias,
  existeNombre,
  requiereConfirmacion,
  validarRegistro,
} from '../validacion';
import type { EntradaRegistro } from '../tipos';

const HOY = '2026-09-03';

const VALIDA: EntradaRegistro = {
  fecha: HOY,
  clienteId: 'cli-riverport',
  operacionId: 'ope-recogida',
  materialId: 'mat-carbon',
  maquinaId: 'maq-c5',
  recibo: '9001',
  horometroInicial: 100,
  horometroFinal: 107.5,
  turnoId: 'tur-dia',
  supervisorId: 'sup-reinaldo',
  operadorId: 'opr-diego',
  observaciones: '',
};

const VACIA: EntradaRegistro = {
  fecha: '',
  clienteId: '',
  operacionId: '',
  materialId: '',
  maquinaId: '',
  recibo: '',
  horometroInicial: null,
  horometroFinal: null,
  turnoId: '',
  supervisorId: '',
  operadorId: '',
  observaciones: '',
};

describe('validarRegistro', () => {
  it('acepta una entrada completa', () => {
    expect(validarRegistro(VALIDA)).toEqual([]);
  });

  it('exige todos los campos obligatorios del formulario', () => {
    const campos = validarRegistro(VACIA).map((e) => e.campo);
    expect(campos).toEqual(
      expect.arrayContaining([
        'fecha',
        'clienteId',
        'operacionId',
        'materialId',
        'maquinaId',
        'recibo',
        'horometroInicial',
        'horometroFinal',
        'turnoId',
        'supervisorId',
        'operadorId',
      ]),
    );
  });

  it('no exige observaciones', () => {
    expect(validarRegistro(VACIA).map((e) => e.campo)).not.toContain('observaciones');
  });

  it('impide guardar si el horómetro final es menor al inicial', () => {
    const errores = validarRegistro({ ...VALIDA, horometroFinal: 90 });
    expect(errores).toEqual([
      {
        campo: 'horometroFinal',
        mensaje: 'El horómetro final no puede ser menor al horómetro inicial.',
      },
    ]);
  });

  it('permite guardar cero horas: es advertencia, no error', () => {
    expect(validarRegistro({ ...VALIDA, horometroFinal: 100 })).toEqual([]);
  });
});

describe('derivarAdvertencias', () => {
  const base = crearSemilla(HOY);

  it('advierte el recibo repetido con el mensaje del formulario', () => {
    const existente = base.registros[0]!;
    const advertencias = derivarAdvertencias(
      { ...VALIDA, recibo: existente.recibo },
      { registros: base.registros, maquina: base.maquinas[1] },
    );
    expect(advertencias.find((a) => a.clave === 'recibo-duplicado')?.mensaje).toBe(
      'Este número de recibo ya aparece en otro registro.',
    );
  });

  it('advierte cero horas', () => {
    const advertencias = derivarAdvertencias(
      { ...VALIDA, horometroFinal: 100 },
      { registros: base.registros, maquina: base.maquinas[1] },
    );
    expect(advertencias.find((a) => a.clave === 'cero-horas')?.mensaje).toBe(
      'Este registro genera 0 horas. Verifique los horómetros.',
    );
  });

  it('advierte el salto frente al último horómetro de la máquina', () => {
    const advertencias = derivarAdvertencias(
      { ...VALIDA, maquinaId: 'maq-c1', horometroInicial: 8887.2, horometroFinal: 8895.2 },
      { registros: base.registros, maquina: base.maquinas[0] },
    );
    const salto = advertencias.find((a) => a.clave === 'horometro-diferencia');
    expect(salto?.mensaje).toBe('Diferencia de horómetro');
    expect(salto?.detalle).toContain('8.879,2 h');
    expect(salto?.detalle).toContain('8,0 h');
  });

  it('no advierte cuando el horómetro inicial continúa el anterior', () => {
    const advertencias = derivarAdvertencias(
      { ...VALIDA, maquinaId: 'maq-c1', horometroInicial: 8879.2, horometroFinal: 8887 },
      { registros: base.registros, maquina: base.maquinas[0] },
    );
    expect(advertencias.map((a) => a.clave)).not.toContain('horometro-diferencia');
  });

  it('advierte si la máquina está inactiva', () => {
    const inactiva = { ...base.maquinas[1]!, estado: 'inactivo' as const };
    const advertencias = derivarAdvertencias(VALIDA, {
      registros: base.registros,
      maquina: inactiva,
    });
    expect(advertencias.map((a) => a.clave)).toContain('maquina-inactiva');
  });
});

describe('requiereConfirmacion', () => {
  it('pide confirmar cero horas y saltos de horómetro', () => {
    expect(
      requiereConfirmacion([{ clave: 'cero-horas', mensaje: '', detalle: '' }]),
    ).toBe(true);
    expect(
      requiereConfirmacion([{ clave: 'horometro-diferencia', mensaje: '', detalle: '' }]),
    ).toBe(true);
  });

  it('no interrumpe por un recibo repetido', () => {
    expect(
      requiereConfirmacion([{ clave: 'recibo-duplicado', mensaje: '', detalle: '' }]),
    ).toBe(false);
  });
});

describe('existeNombre', () => {
  const materiales = [
    { id: '1', nombre: 'CARBON' },
    { id: '2', nombre: 'UREA' },
  ];

  it('detecta duplicados por mayúsculas o tildes', () => {
    expect(existeNombre(materiales, 'carbón')).toBe(true);
    expect(existeNombre(materiales, 'Carbon')).toBe(true);
    expect(existeNombre(materiales, 'CLINKER')).toBe(false);
  });

  it('no se acusa a sí mismo al editar', () => {
    expect(existeNombre(materiales, 'CARBON', '1')).toBe(false);
  });
});
