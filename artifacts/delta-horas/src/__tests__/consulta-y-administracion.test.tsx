/**
 * Consulta y administración: registros, dashboard, anulación, permisos por rol
 * y maestros. Todo se ejercita sobre la aplicación completa.
 */

import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { elegirEnSelector, irA, llenarFormulario, montarApp } from './ayudas';

/** Lee el valor de un KPI del Dashboard a partir de su título. */
function kpi(titulo: string): string {
  const etiqueta = screen.getByText(titulo);
  return etiqueta.nextElementSibling?.textContent ?? '';
}

function aNumero(texto: string): number {
  return Number(texto.replace(/[^\d,]/g, '').replace(',', '.'));
}

async function verDashboardCompleto(usuario: UserEvent): Promise<void> {
  await irA(usuario, 'Dashboard');
  await screen.findByText('Total horas');
  await usuario.click(screen.getByRole('button', { name: 'Todo' }));
}

describe('registros', () => {
  it('presenta el mismo dato como tarjetas y como hoja de cálculo', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Registros');
    await screen.findByRole('heading', { name: 'Registros', level: 1 });

    const tabla = screen.getByRole('table');
    for (const columna of [
      'Fecha',
      'Cliente',
      'Operación',
      'Material',
      'Cargador',
      'Propiedad',
      'Proveedor',
      'Recibo',
      'Horas',
      'Turno',
      'Supervisor',
      'Operador de máquina',
      'Estado',
      'Fecha de creación',
      'Usuario que creó',
    ]) {
      expect(
        within(tabla).getByRole('button', { name: new RegExp(`^${columna}$`, 'i') }),
      ).toBeInTheDocument();
    }
    expect(within(tabla).getByRole('columnheader', { name: 'Observaciones' })).toBeInTheDocument();
  });

  it('busca por proveedor y deja solo los cargadores tercerizados', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Registros');

    const buscador = await screen.findByPlaceholderText(
      /Buscar cargador, operador, recibo/,
    );
    await usuario.type(buscador, 'GPR');

    await waitFor(() => {
      const tabla = screen.getByRole('table');
      const filas = within(tabla).getAllByRole('row').slice(1);
      expect(filas.length).toBeGreaterThan(0);
      for (const fila of filas) {
        expect(fila).toHaveTextContent('SEM 6 GPR');
      }
    });
  });

  it('filtra por estado con los chips rápidos', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Registros');
    await screen.findByRole('table');

    await usuario.click(screen.getByRole('button', { name: 'Anulados' }));

    await waitFor(() => {
      const filas = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      for (const fila of filas) {
        expect(fila).toHaveTextContent('Anulado');
      }
    });
  });

  it('ordena por la columna de horas al pulsar su encabezado', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Registros');
    const tabla = await screen.findByRole('table');

    await usuario.click(within(tabla).getByRole('button', { name: /^Horas$/i }));

    await waitFor(() => {
      const horas = within(screen.getByRole('table'))
        .getAllByRole('row')
        .slice(1)
        .map((fila) => aNumero(fila.children[10]?.textContent ?? '0'));
      const ordenadas = [...horas].sort((a, b) => b - a);
      expect(horas).toEqual(ordenadas);
    });
  });
});

describe('dashboard', () => {
  it('publica los tres indicadores de la operación', async () => {
    const usuario = await montarApp();
    await verDashboardCompleto(usuario);

    expect(kpi('Total horas')).toMatch(/^[\d.]+,\d{2} h$/);
    expect(kpi('Promedio horas por día')).toMatch(/,\d{2} h$/);
    expect(aNumero(kpi('Días operativos'))).toBeGreaterThan(0);
  });

  it('suma el registro nuevo y descuenta el anulado', async () => {
    const usuario = await montarApp();
    await verDashboardCompleto(usuario);
    const inicial = aNumero(kpi('Total horas'));

    await irA(usuario, 'Registrar');
    await llenarFormulario(usuario, {
      operacion: 'Recogida',
      material: 'CARBON',
      cargador: 'C1',
      recibo: '3001',
      inicial: '8879.2',
      final: '8886.7',
      turno: 'Día',
      supervisor: 'REINALDO',
      operador: 'DIEGO RAMIREZ',
    });
    await usuario.click(screen.getByRole('button', { name: 'GUARDAR REGISTRO' }));
    let confirmacion = await screen.findByRole('dialog', { name: 'Confirmar registro' });
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Registro guardado');

    await verDashboardCompleto(usuario);
    expect(aNumero(kpi('Total horas'))).toBeCloseTo(inicial + 7.5, 2);

    // Anular el registro debe devolver el total a su valor anterior.
    await irA(usuario, 'Registros');
    const buscador = await screen.findByPlaceholderText(
      /Buscar cargador, operador, recibo/,
    );
    await usuario.type(buscador, '3001');
    const fila = await waitFor(() => {
      const filas = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      expect(filas).toHaveLength(1);
      return filas[0]!;
    });
    await usuario.click(fila);

    await screen.findByText('Trazabilidad');
    await usuario.click(screen.getByRole('button', { name: 'Opciones del registro' }));
    const opciones = await screen.findByRole('dialog', { name: 'Opciones del registro' });
    await usuario.click(within(opciones).getByRole('button', { name: 'Anular' }));

    const hojaAnular = await screen.findByRole('dialog', { name: 'Anular registro' });
    await usuario.type(
      within(hojaAnular).getByLabelText(/Motivo de anulación/),
      'Recibo cargado dos veces',
    );
    await usuario.click(
      within(hojaAnular).getByRole('button', { name: 'Anular registro' }),
    );

    confirmacion = await screen.findByRole('alertdialog', {
      name: '¿Anular este registro?',
    });
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Anular' }));

    await screen.findByText('Registro anulado');
    expect(screen.getAllByText('Recibo cargado dos veces').length).toBeGreaterThan(0);

    await verDashboardCompleto(usuario);
    expect(aNumero(kpi('Total horas'))).toBeCloseTo(inicial, 2);
  });
});

describe('permisos por rol', () => {
  async function cambiarUsuario(usuario: UserEvent, nombre: string): Promise<void> {
    await irA(usuario, 'Configuración');
    await screen.findByRole('heading', { name: 'Configuración', level: 1 });
    await usuario.click(screen.getByRole('button', { name: new RegExp(nombre) }));
  }

  it('gerencia consulta pero no registra ni administra', async () => {
    const usuario = await montarApp();
    await cambiarUsuario(usuario, 'Andrés Villalba');

    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Registrar' })).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('link', { name: 'Registrar horas máquina' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('gerencia no puede editar ni anular un registro', async () => {
    const usuario = await montarApp();
    await cambiarUsuario(usuario, 'Andrés Villalba');

    await irA(usuario, 'Registros');
    const fila = within(await screen.findByRole('table')).getAllByRole('row')[1]!;
    await usuario.click(fila);

    await screen.findByText('Trazabilidad');
    await usuario.click(screen.getByRole('button', { name: 'Opciones del registro' }));
    const opciones = await screen.findByRole('dialog', { name: 'Opciones del registro' });

    expect(within(opciones).getByRole('button', { name: 'Editar' })).toBeDisabled();
    expect(within(opciones).getByRole('button', { name: 'Anular' })).toBeDisabled();
    expect(
      within(opciones).getByText(/El rol GERENCIA puede consultar este registro/),
    ).toBeInTheDocument();
  });

  it('captura solo consulta los registros que capturó', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Registros');
    const todos = within(await screen.findByRole('table')).getAllByRole('row').length;

    await cambiarUsuario(usuario, 'Yeison Cárdenas');
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();

    await irA(usuario, 'Registros');
    const propios = within(await screen.findByRole('table')).getAllByRole('row').length;

    expect(propios).toBeGreaterThan(1);
    expect(propios).toBeLessThan(todos);
  });
});

describe('maestros', () => {
  it('rechaza un material duplicado por mayúsculas o tildes', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Materiales');
    await screen.findByRole('heading', { name: 'Materiales', level: 1 });

    await usuario.click(screen.getByRole('button', { name: 'Agregar' }));
    const hoja = await screen.findByRole('dialog', { name: /AGREGAR MATERIAL/i });

    await usuario.type(within(hoja).getByLabelText(/^Nombre/), 'carbón');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    expect(
      within(hoja).getByText('Ya existe un elemento con este valor.'),
    ).toBeInTheDocument();

    await usuario.clear(within(hoja).getByLabelText(/^Nombre/));
    await usuario.type(within(hoja).getByLabelText(/^Nombre/), 'CLINKER');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /AGREGAR MATERIAL/i }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('CLINKER')).toBeInTheDocument();
  });

  it('desactiva una máquina con historia en lugar de eliminarla', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Máquinas / Cargadores');
    await screen.findByRole('heading', { name: 'Máquinas / Cargadores', level: 1 });

    const antes = screen.getAllByRole('switch').length;
    expect(screen.getByText('C1')).toBeInTheDocument();

    await usuario.click(screen.getAllByRole('switch')[0]!);

    const dialogo = await screen.findByRole('alertdialog', { name: '¿Desactivar C1?' });
    expect(within(dialogo).getByText(/registro\(s\) históricos/)).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    await screen.findByText('Inactivo');
    expect(screen.getAllByRole('switch')).toHaveLength(antes);
    expect(screen.getByText('C1')).toBeInTheDocument();
  });

  it('registra en la auditoría la creación de un maestro', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Operadores');
    await usuario.click(screen.getByRole('button', { name: 'Agregar' }));

    const hoja = await screen.findByRole('dialog', { name: /AGREGAR OPERADOR/i });
    await usuario.type(within(hoja).getByLabelText(/Nombre completo/), 'LUIS PEREZ');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /AGREGAR OPERADOR/i }),
      ).not.toBeInTheDocument(),
    );

    await irA(usuario, 'Auditoría');
    await screen.findByRole('heading', { name: 'Auditoría', level: 1 });
    const referencia = screen.getByText(/Operador · LUIS PEREZ/);
    expect(referencia.nextElementSibling).toHaveTextContent('Creación');
    expect(referencia.nextElementSibling).toHaveTextContent('Marcela Ortiz');
  });

  it('el operador nuevo queda disponible en el formulario', async () => {
    const usuario = await montarApp();
    await irA(usuario, 'Operadores');
    await usuario.click(screen.getByRole('button', { name: 'Agregar' }));
    const hoja = await screen.findByRole('dialog', { name: /AGREGAR OPERADOR/i });
    await usuario.type(within(hoja).getByLabelText(/Nombre completo/), 'LUIS PEREZ');
    await usuario.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /AGREGAR OPERADOR/i }),
      ).not.toBeInTheDocument(),
    );

    await irA(usuario, 'Registrar');
    await elegirEnSelector(usuario, 'Seleccionar operador', 'LUIS PEREZ');
    expect(screen.getByRole('button', { name: 'Seleccionar operador' })).toHaveTextContent(
      'LUIS PEREZ',
    );
  });
});
