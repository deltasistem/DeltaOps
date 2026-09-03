/**
 * Utilidades comunes de las pruebas de integración: montan la aplicación
 * completa y operan sobre ella como lo haría un supervisor en campo.
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { expect } from 'vitest';

import { hoyEnBogota } from '@workspace/horas-maquina';

import App from '../App';

export const HOY = hoyEnBogota();

export async function montarApp(): Promise<UserEvent> {
  const usuario = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { name: 'DELTA' });
  return usuario;
}

/** Elige una opción en el selector cuya etiqueta accesible es `titulo`. */
export async function elegirEnSelector(
  usuario: UserEvent,
  titulo: string,
  opcion: string | RegExp,
): Promise<void> {
  await usuario.click(screen.getByRole('button', { name: titulo }));
  const hoja = await screen.findByRole('dialog', { name: titulo });
  const fila = within(hoja).getByText(opcion);
  await usuario.click(fila.closest('button')!);
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: titulo })).not.toBeInTheDocument(),
  );
}

export async function escribir(
  usuario: UserEvent,
  etiqueta: RegExp,
  valor: string,
): Promise<void> {
  const campo = screen.getByLabelText(etiqueta);
  await usuario.clear(campo);
  await usuario.type(campo, valor);
}

export interface DatosFormulario {
  readonly operacion: string;
  readonly material: string;
  readonly cargador: string;
  readonly recibo: string;
  readonly inicial: string;
  readonly final: string;
  readonly turno: string;
  readonly supervisor: string;
  readonly operador: string;
}

/** Rellena el formulario de horas máquina sin llegar a guardarlo. */
export async function llenarFormulario(
  usuario: UserEvent,
  datos: DatosFormulario,
): Promise<void> {
  await elegirEnSelector(usuario, 'Seleccionar operación', datos.operacion);
  await elegirEnSelector(usuario, 'Seleccionar material', datos.material);
  await elegirEnSelector(usuario, 'Seleccionar cargador', datos.cargador);
  await escribir(usuario, /^Recibo/, datos.recibo);
  await escribir(usuario, /Horómetro inicial/, datos.inicial);
  await escribir(usuario, /Horómetro final/, datos.final);
  await elegirEnSelector(usuario, 'Seleccionar turno', datos.turno);
  await elegirEnSelector(usuario, 'Seleccionar supervisor', datos.supervisor);
  await elegirEnSelector(usuario, 'Seleccionar operador', datos.operador);
}

export async function irA(usuario: UserEvent, enlace: string | RegExp): Promise<void> {
  await usuario.click(screen.getByRole('link', { name: enlace }));
}
