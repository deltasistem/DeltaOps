/**
 * Alertas operativas derivadas de `MachineRecord`. No es un módulo de gestión:
 * son avisos útiles para revisar registros dudosos antes de cerrar el mes.
 */

import { compararRecientes, redondear } from './calculos';
import { normalizar } from './formato';
import type { ClaveAdvertencia, MachineRecord } from './tipos';

export type ClaveAlerta = ClaveAdvertencia | 'horometro-invertido' | 'anulado';

export type Severidad = 'atencion' | 'informativa';

export interface Alerta {
  readonly id: string;
  readonly clave: ClaveAlerta;
  readonly titulo: string;
  readonly detalle: string;
  readonly severidad: Severidad;
  readonly registro: MachineRecord;
}

export const ETIQUETA_ALERTA: Record<ClaveAlerta, string> = {
  'recibo-duplicado': 'Recibo duplicado',
  'horometro-diferencia': 'Diferencia de horómetro',
  'cero-horas': 'Registro de 0 horas',
  'maquina-inactiva': 'Máquina inactiva',
  'horometro-invertido': 'Horómetro final menor al inicial',
  anulado: 'Registro anulado',
};

const SEVERIDAD: Record<ClaveAlerta, Severidad> = {
  'recibo-duplicado': 'atencion',
  'horometro-diferencia': 'atencion',
  'cero-horas': 'atencion',
  'maquina-inactiva': 'atencion',
  'horometro-invertido': 'atencion',
  anulado: 'informativa',
};

function referencia(registro: MachineRecord): string {
  return `${registro.maquinaCodigo} · Recibo ${registro.recibo} · ${registro.fecha}`;
}

/**
 * Recorre los registros y produce la lista de alertas. Las advertencias
 * guardadas al capturar se combinan con las que solo se ven en conjunto, como
 * los recibos repetidos entre registros distintos.
 */
export function derivarAlertas(
  registros: readonly MachineRecord[],
): readonly Alerta[] {
  const alertas: Alerta[] = [];
  const porRecibo = new Map<string, MachineRecord[]>();

  for (const registro of registros) {
    const clave = normalizar(registro.recibo);
    if (clave !== '' && registro.estado === 'activo') {
      const lista = porRecibo.get(clave) ?? [];
      lista.push(registro);
      porRecibo.set(clave, lista);
    }

    for (const advertencia of registro.advertencias) {
      if (advertencia.clave === 'recibo-duplicado') continue;
      alertas.push({
        id: `${registro.id}:${advertencia.clave}`,
        clave: advertencia.clave,
        titulo: ETIQUETA_ALERTA[advertencia.clave],
        detalle: `${referencia(registro)} — ${advertencia.detalle || advertencia.mensaje}`,
        severidad: SEVERIDAD[advertencia.clave],
        registro,
      });
    }

    if (registro.estado === 'activo' && registro.hours < 0) {
      alertas.push({
        id: `${registro.id}:horometro-invertido`,
        clave: 'horometro-invertido',
        titulo: ETIQUETA_ALERTA['horometro-invertido'],
        detalle: `${referencia(registro)} — resultado ${redondear(registro.hours, 2)} h`,
        severidad: 'atencion',
        registro,
      });
    }

    if (registro.estado === 'anulado') {
      alertas.push({
        id: `${registro.id}:anulado`,
        clave: 'anulado',
        titulo: ETIQUETA_ALERTA.anulado,
        detalle: `${referencia(registro)} — ${registro.motivoAnulacion || 'sin motivo registrado'}`,
        severidad: 'informativa',
        registro,
      });
    }
  }

  for (const [, grupo] of porRecibo) {
    if (grupo.length < 2) continue;
    for (const registro of grupo) {
      alertas.push({
        id: `${registro.id}:recibo-duplicado`,
        clave: 'recibo-duplicado',
        titulo: ETIQUETA_ALERTA['recibo-duplicado'],
        detalle: `${referencia(registro)} — compartido con ${grupo.length - 1} registro(s)`,
        severidad: 'atencion',
        registro,
      });
    }
  }

  return alertas.sort((a, b) => compararRecientes(a.registro, b.registro));
}

export function contarAtencion(alertas: readonly Alerta[]): number {
  return alertas.filter((a) => a.severidad === 'atencion').length;
}
