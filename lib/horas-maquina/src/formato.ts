/**
 * Presentación en formato colombiano: punto de miles y coma decimal.
 * El almacenamiento siempre es numérico; esto es únicamente visual.
 */

const LOCALE = 'es-CO';

export const ZONA_HORARIA = 'America/Bogota';

export function formatearNumero(valor: number, decimales = 2): string {
  if (!Number.isFinite(valor)) return '—';
  return valor.toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Ejemplo: 7.5 → "7,50 h"; 1284.5 → "1.284,50 h". */
export function formatearHoras(valor: number): string {
  if (!Number.isFinite(valor)) return '—';
  return `${formatearNumero(valor, 2)} h`;
}

/** Ejemplo: 8879.2 → "8.879,2 h". Los horómetros se muestran con un decimal. */
export function formatearHorometro(valor: number, conUnidad = true): string {
  if (!Number.isFinite(valor)) return '—';
  const texto = valor.toLocaleString(LOCALE, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
  return conUnidad ? `${texto} h` : texto;
}

export function formatearEntero(valor: number): string {
  if (!Number.isFinite(valor)) return '—';
  return valor.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/** "2026-09-03" → "03/09/2026". */
export function formatearFecha(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!partes) return iso;
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? '';
}

/** "2026-09-03" → "3 sep". Etiqueta corta para ejes de gráficos. */
export function formatearFechaCorta(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!partes) return iso;
  const mes = nombreMes(Number(partes[2])).slice(0, 3);
  return `${Number(partes[3])} ${mes}`;
}

/** Fecha y hora local de un instante ISO: "03/09/2026 09:30". */
export function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  const partes = new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA_HORARIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(fecha);
  const buscar = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${buscar('day')}/${buscar('month')}/${buscar('year')} ${buscar('hour')}:${buscar('minute')}`;
}

/** Solo la hora de un instante ISO, en Bogotá: "09:30". */
export function formatearHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

/** Fecha de hoy en Bogotá como ISO corto, independiente del reloj del equipo. */
export function hoyEnBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** Hora de Bogotá (0-23) para elegir el saludo de la pantalla Inicio. */
export function horaEnBogota(ahora: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA_HORARIA,
      hour: '2-digit',
      hour12: false,
    }).format(ahora),
  );
}

export function saludo(ahora: Date = new Date()): string {
  const hora = horaEnBogota(ahora);
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * Interpreta un horómetro escrito por el usuario. Se acepta punto o coma
 * decimal y separadores de miles, porque en campo se escribe de las dos formas.
 */
export function interpretarDecimal(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === '') return null;
  const normalizado =
    limpio.includes(',') && limpio.includes('.')
      ? limpio.replace(/\./g, '').replace(',', '.')
      : limpio.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalizado)) return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

/** Normaliza texto para comparar sin tildes ni mayúsculas. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
