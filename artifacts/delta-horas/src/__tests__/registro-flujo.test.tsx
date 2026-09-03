/**
 * Flujo operativo completo sobre la aplicación montada:
 * INICIO → REGISTRAR → MachineRecord → REGISTROS → DASHBOARD.
 *
 * Las aserciones son sobre lo que ve el usuario, no sobre el estado interno.
 */

import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  elegirEnSelector,
  escribir,
  irA,
  llenarFormulario,
  montarApp,
} from './ayudas';

const REGISTRO_BASE = {
  operacion: 'Cargue de buque',
  material: 'CARBON',
  cargador: 'C1',
  recibo: '2001',
  inicial: '8879.2',
  final: '8886.7',
  turno: 'Día',
  supervisor: 'REINALDO',
  operador: 'DIEGO RAMIREZ',
} as const;

describe('registrar horas máquina', () => {
  it('deriva propiedad, propietario y último horómetro al elegir el cargador', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);

    expect(screen.queryByText('Propio')).not.toBeInTheDocument();

    await elegirEnSelector(usuario, 'Seleccionar cargador', 'C1');

    expect(screen.getByText('Propio')).toBeInTheDocument();
    expect(screen.getByText(/Propietario/)).toHaveTextContent('DELTA');
    expect(screen.getByText('Último horómetro')).toBeInTheDocument();
    expect(screen.getByText('8.879,2 h')).toBeInTheDocument();
  });

  it('marca el horómetro consistente y avisa cuando hay diferencia', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);
    await elegirEnSelector(usuario, 'Seleccionar cargador', 'C1');

    await escribir(usuario, /Horómetro inicial/, '8879.2');
    expect(screen.getByText('Horómetro consistente')).toBeInTheDocument();

    await escribir(usuario, /Horómetro inicial/, '8885.2');
    expect(screen.getByText('Diferencia de horómetro')).toBeInTheDocument();
    expect(screen.getByText(/diferencia 6,0 h/)).toBeInTheDocument();

    await escribir(usuario, /Horómetro inicial/, '8879.2');
    expect(screen.getByText('Horómetro consistente')).toBeInTheDocument();
  });

  it('calcula las horas en vivo con formato colombiano', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);
    await elegirEnSelector(usuario, 'Seleccionar cargador', 'C1');
    await escribir(usuario, /Horómetro inicial/, '8871.7');
    await escribir(usuario, /Horómetro final/, '8879.2');

    const horas = screen.getByText('Horas').closest('div')!;
    expect(horas).toHaveTextContent('7,50 h');
  });

  it('guarda el registro tras confirmarlo y lo muestra en Registros', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);
    await llenarFormulario(usuario, REGISTRO_BASE);

    await usuario.click(screen.getByRole('button', { name: 'GUARDAR REGISTRO' }));

    const confirmacion = await screen.findByRole('dialog', {
      name: 'Confirmar registro',
    });
    expect(within(confirmacion).getByText('7,50 h')).toBeInTheDocument();
    expect(within(confirmacion).getByText('2001')).toBeInTheDocument();
    expect(within(confirmacion).getByText('Cargue de buque')).toBeInTheDocument();

    await usuario.click(within(confirmacion).getByRole('button', { name: 'Confirmar' }));

    await screen.findByText('Registro guardado');
    expect(screen.getByText('C1')).toBeInTheDocument();
    expect(screen.getByText('Recibo 2001')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: /Ver registro/ }));
    await screen.findByText('Trazabilidad');
    const trazabilidad = screen.getByText('Creado por').closest('div')!;
    expect(trazabilidad).toHaveTextContent('Marcela Ortiz');
    expect(screen.getByText('8.879,2')).toBeInTheDocument();
    expect(screen.getByText('8.886,7')).toBeInTheDocument();
  });

  it('no permite guardar si el horómetro final es menor al inicial', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);
    await llenarFormulario(usuario, { ...REGISTRO_BASE, inicial: '5000', final: '4000' });

    expect(
      screen.getByText('El horómetro final no puede ser menor al horómetro inicial.'),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'GUARDAR REGISTRO' }));

    expect(
      screen.queryByRole('dialog', { name: 'Confirmar registro' }),
    ).not.toBeInTheDocument();
  });

  it('exige confirmación explícita para un registro de cero horas', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);
    await llenarFormulario(usuario, {
      ...REGISTRO_BASE,
      cargador: 'C5',
      recibo: '2002',
      inicial: '5000',
      final: '5000',
    });

    expect(
      screen.getByText('Este registro genera 0 horas. Verifique los horómetros.'),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'GUARDAR REGISTRO' }));
    const confirmacion = await screen.findByRole('dialog', {
      name: 'Confirmar registro',
    });

    const confirmar = within(confirmacion).getByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeDisabled();

    await usuario.click(
      within(confirmacion).getByRole('switch', { name: 'Confirmar advertencias' }),
    );
    expect(confirmar).toBeEnabled();

    await usuario.click(confirmar);
    await screen.findByText('Registro guardado');
    expect(screen.getByText('0,00 h')).toBeInTheDocument();
  });

  it('advierte el recibo repetido sin impedir el registro', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);
    await llenarFormulario(usuario, {
      ...REGISTRO_BASE,
      cargador: 'C5',
      recibo: '1949',
      inicial: '5000',
      final: '5007.5',
    });

    expect(
      screen.getByText('Este número de recibo ya aparece en otro registro.'),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'GUARDAR REGISTRO' }));
    const confirmacion = await screen.findByRole('dialog', {
      name: 'Confirmar registro',
    });
    expect(
      within(confirmacion).getByText('Este número de recibo ya aparece en otro registro.'),
    ).toBeInTheDocument();

    await usuario.click(
      within(confirmacion).getByRole('switch', { name: 'Confirmar advertencias' }),
    );
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Confirmar' }));

    await screen.findByText('Registro guardado');
  });

  it('encadena el horómetro: el registro guardado es la referencia del siguiente', async () => {
    const usuario = await montarApp();
    await irA(usuario, /REGISTRAR HORAS/);
    await llenarFormulario(usuario, REGISTRO_BASE);
    await usuario.click(screen.getByRole('button', { name: 'GUARDAR REGISTRO' }));
    const confirmacion = await screen.findByRole('dialog', {
      name: 'Confirmar registro',
    });
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Registro guardado');

    await usuario.click(screen.getByRole('button', { name: /Nuevo registro/ }));
    await elegirEnSelector(usuario, 'Seleccionar cargador', 'C1');

    await waitFor(() => expect(screen.getByText('8.886,7 h')).toBeInTheDocument());
  });
});
